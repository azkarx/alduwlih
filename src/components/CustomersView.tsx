import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useMemo, useState } from 'react';
import { ALLOWED_OPERATORS } from '../data/seedData';
import type { Customer, NavPage, OperatorName, WarehouseState } from '../types/warehouse';
import {
  computeAllCustomersUnitTotals,
  computeAllItemMetrics,
  computeCustomerBalances,
} from '../utils/warehouseLogic';
import { ConfirmModal, formatNum, OperatorSelector } from './UiShared';

interface CustomersViewProps {
  state: WarehouseState;
  isAdmin: boolean;
  defaultPersonName: OperatorName;
  onSaveCustomer: (
    customer: Omit<Customer, 'id' | 'createdAt'>,
    existingId?: string
  ) => boolean;
  onDeleteCustomer: (customerId: string) => boolean;
  onAllocateToCustomer: (
    customerId: string,
    itemId: string,
    quantity: number,
    personName: string,
    notes: string
  ) => boolean;
  onQuickStockOutCustomer: (customerId: string, itemId: string) => void;
  onNavigate: (page: NavPage) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  state,
  isAdmin,
  defaultPersonName,
  onSaveCustomer,
  onDeleteCustomer,
  onAllocateToCustomer,
  onQuickStockOutCustomer,
}) => {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(state.customers[0]?.id || '');

  const [custModalOpen, setCustModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  const [allocModalOpen, setAllocModalOpen] = useState(false);
  const [allocItemId, setAllocItemId] = useState('');
  const [allocQty, setAllocQty] = useState(50);
  const [allocPerson, setAllocPerson] = useState<OperatorName>(
    ALLOWED_OPERATORS.includes(defaultPersonName) ? defaultPersonName : ALLOWED_OPERATORS[0]
  );
  const [allocNotes, setAllocNotes] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCustModalOpen(false);
        setAllocModalOpen(false);
        setDeleteTarget(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const summaries = useMemo(() => computeCustomerBalances(state), [state]);
  const itemMetrics = useMemo(() => computeAllItemMetrics(state), [state]);
  const allUnitTotals = useMemo(() => computeAllCustomersUnitTotals(summaries), [summaries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return summaries;
    return summaries.filter(
      (s) =>
        s.customer.name.toLowerCase().includes(q) ||
        s.customer.code.toLowerCase().includes(q)
    );
  }, [summaries, search]);

  const activeSummary =
    summaries.find((s) => s.customer.id === selectedId) || filtered[0] || null;

  const duplicateCodeError = useMemo(() => {
    const clean = code.trim().toUpperCase();
    if (!clean) return '';
    return state.customers.some(
      (c) => c.code.trim().toUpperCase() === clean && c.id !== editingCustomer?.id
    )
      ? `الكود (${clean}) مستخدم لعميل آخر.`
      : '';
  }, [code, state.customers, editingCustomer]);

  const duplicateNameError = useMemo(() => {
    const clean = name.trim().toLowerCase();
    if (!clean) return '';
    return state.customers.some(
      (c) => c.name.trim().toLowerCase() === clean && c.id !== editingCustomer?.id
    )
      ? `الاسم "${name.trim()}" مسجل لعميل آخر.`
      : '';
  }, [name, state.customers, editingCustomer]);

  const openAddCustomer = () => {
    setEditingCustomer(null);
    let seq = 101 + state.customers.length;
    while (state.customers.some((c) => c.code.toUpperCase() === `CL-${seq}`)) {
      seq += 1;
    }
    setCode(`CL-${seq}`);
    setName('');
    setCustModalOpen(true);
  };

  const openEditCustomer = (c: Customer) => {
    setEditingCustomer(c);
    setCode(c.code);
    setName(c.name);
    setCustModalOpen(true);
  };

  const handleCustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (duplicateCodeError || duplicateNameError) return;
    const ok = onSaveCustomer(
      {
        code,
        name,
        phone: editingCustomer?.phone || '',
        contactPerson: editingCustomer?.contactPerson || '',
        productionLine: editingCustomer?.productionLine || '',
        notes: editingCustomer?.notes || '',
      },
      editingCustomer?.id
    );
    if (ok) setCustModalOpen(false);
  };

  const openAllocModal = () => {
    const firstWithFree = itemMetrics.find((m) => m.freeStock > 0) || itemMetrics[0];
    setAllocItemId(firstWithFree?.item.id || '');
    setAllocQty(50);
    setAllocPerson(
      ALLOWED_OPERATORS.includes(defaultPersonName) ? defaultPersonName : ALLOWED_OPERATORS[0]
    );
    setAllocNotes('');
    setAllocModalOpen(true);
  };

  const handleAllocSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSummary || !allocItemId) return;
    const ok = onAllocateToCustomer(
      activeSummary.customer.id,
      allocItemId,
      allocQty,
      allocPerson,
      allocNotes
    );
    if (ok) setAllocModalOpen(false);
  };

  return (
    <div className="space-y-5">
      {/* Header Toolbar */}
      <div className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-2.5 text-[18px] text-[#8FA6C3]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث باسم العميل أو الكود..."
              className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 pr-9 pl-3 text-sm text-white placeholder-[#4B6485] outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd] focus:shadow-[0_0_0_3px_rgba(70,218,253,0.14)]"
            />
          </div>

          <div className="glass-sub-interactive flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] text-[#c1c6d7]">
            <span>إجمالي الأرصدة:</span>
            {allUnitTotals.length === 0 ? (
              <strong className="tabular-nums text-[#20C5E8]">0</strong>
            ) : (
              allUnitTotals.map((u) => (
                <span
                  key={u.unit}
                  className="tabular-nums rounded-lg border border-[#20C5E8]/30 bg-[#20C5E8]/10 px-2 py-0.5 font-bold text-[#20C5E8]"
                >
                  {formatNum(u.total)} {u.unit}
                </span>
              ))
            )}
          </div>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openAddCustomer}
            className="shine-cta inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#1677FF] to-[#0ea5e9] px-4 text-sm font-semibold text-white shadow-md"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            عميل جديد
          </button>
        )}
      </div>

      {/* Split View */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="glass-card overflow-hidden rounded-2xl xl:col-span-7">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[13px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-[12px] text-[#8FA6C3]">
                  <th className="px-4 py-3 font-semibold">الكود</th>
                  <th className="px-4 py-3 font-semibold">اسم العميل</th>
                  <th className="px-4 py-3 font-semibold">الأصناف</th>
                  <th className="px-4 py-3 font-semibold">إجمالي الرصيد حسب الوحدة</th>
                  {isAdmin && <th className="px-4 py-3 text-left font-semibold">إجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="px-4 py-12 text-center text-[#8FA6C3]">
                      {state.customers.length === 0
                        ? 'لا يوجد عملاء بعد — أضف أول عميل.'
                        : 'لا يوجد عملاء مطابقون.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((s) => {
                    const selected = activeSummary?.customer.id === s.customer.id;
                    return (
                      <tr
                        key={s.customer.id}
                        onClick={() => setSelectedId(s.customer.id)}
                        className={`cursor-pointer transition-all duration-150 active:bg-[#1677FF]/25 ${
                          selected
                            ? 'bg-[#1677FF]/18 shadow-[inset_-3px_0_0_#20C5E8]'
                            : 'hover:bg-white/[0.06]'
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-[12px] text-[#afc6ff]" dir="ltr">
                          {s.customer.code}
                        </td>
                        <td className="px-4 py-3 font-semibold text-white">{s.customer.name}</td>
                        <td className="tabular-nums px-4 py-3 text-[#d7e3fc]">{s.itemsCount}</td>
                        <td className="px-4 py-3">
                          {s.unitTotals.length === 0 ? (
                            <span className="tabular-nums text-[#8FA6C3]">0</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {s.unitTotals.map((u) => (
                                <span
                                  key={u.unit}
                                  className="tabular-nums rounded-lg border border-[#20C5E8]/30 bg-[#20C5E8]/10 px-2 py-0.5 text-[12px] font-bold text-[#20C5E8]"
                                >
                                  {formatNum(u.total)} {u.unit}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditCustomer(s.customer)}
                                aria-label={`تعديل ${s.customer.name}`}
                                className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-[#afc6ff] hover:-translate-y-0.5 hover:border-[#1677FF] hover:bg-[#1677FF]/20 hover:text-white active:scale-90"
                              >
                                <span className="material-symbols-outlined text-[16px]">edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(s.customer)}
                                aria-label={`حذف ${s.customer.name}`}
                                className="rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/15 p-1.5 text-[#EF4444] hover:-translate-y-0.5 hover:border-[#EF4444] hover:bg-[#EF4444]/30 active:scale-90"
                              >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Customer Breakdown */}
        <div className="glass-card rounded-2xl p-5 xl:col-span-5">
          {!activeSummary ? (
            <div className="py-12 text-center text-sm text-[#8FA6C3]">
              اختر عميلاً لعرض إكسسواراته.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 pb-4">
                <div>
                  <div className="font-mono text-[11.5px] text-[#20C5E8]" dir="ltr">
                    {activeSummary.customer.code}
                  </div>
                  <h3 className="text-[17px] font-bold text-white">{activeSummary.customer.name}</h3>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={openAllocModal}
                    disabled={state.items.length === 0}
                    className="shine-cta inline-flex items-center gap-1 rounded-xl bg-[#1677FF] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#2F86FF] disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_circle</span>
                    تخصيص صنف
                  </button>
                )}
              </div>

              <div className="glass-sub rounded-xl p-3.5">
                <div className="flex items-center justify-between text-[12px] text-[#8FA6C3]">
                  <span>إجمالي الرصيد حسب الوحدة</span>
                  <span className="tabular-nums">{activeSummary.itemsCount} صنف</span>
                </div>
                {activeSummary.unitTotals.length === 0 ? (
                  <div className="tabular-nums mt-2 text-lg font-bold text-[#8FA6C3]">0</div>
                ) : (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {activeSummary.unitTotals.map((u) => (
                      <div
                        key={u.unit}
                        className="rounded-xl border border-[#20C5E8]/35 bg-[#20C5E8]/12 px-3 py-2 transition-all duration-150 hover:-translate-y-0.5 hover:border-[#20C5E8]/70 hover:bg-[#20C5E8]/20"
                      >
                        <div className="font-display tabular-nums text-lg font-extrabold text-[#20C5E8]">
                          {formatNum(u.total)}
                        </div>
                        <div className="text-[11.5px] font-medium text-[#d7e3fc]">{u.unit}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="mb-2.5 text-[13px] font-bold text-white">الإكسسوارات المخصصة</h4>
                {activeSummary.allocations.length === 0 ? (
                  <div className="glass-sub rounded-xl p-6 text-center text-[12.5px] text-[#8FA6C3]">
                    لا توجد إكسسوارات مخصصة.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {activeSummary.allocations.map(({ allocation, item }) => (
                      <div
                        key={allocation.id}
                        className="glass-sub-interactive flex items-center justify-between gap-3 rounded-xl p-3"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-white">{item.name}</div>
                          <div className="mt-0.5 font-mono text-[11.5px] text-[#8FA6C3]" dir="ltr">
                            {item.sku}
                          </div>
                        </div>
                        <div className="shrink-0 text-left">
                          <div className="tabular-nums text-[14px] font-bold text-[#20C5E8]">
                            {formatNum(allocation.quantity)} {item.unit}
                          </div>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => onQuickStockOutCustomer(activeSummary.customer.id, item.id)}
                              className="mt-1 rounded-md px-2 py-0.5 text-[11.5px] font-semibold text-[#10B981] hover:bg-[#10B981]/15 active:scale-90"
                            >
                              صرف
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Customer Modal — Only Code + Name, closes when clicking outside */}
      <AnimatePresence>
        {custModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setCustModalOpen(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <motion.form
              initial={{ opacity: 0, scale: 0.94, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={handleCustSubmit}
              className="glass-card w-full max-w-md rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-lg font-bold text-white">
                  {editingCustomer ? 'تعديل العميل' : 'عميل جديد'}
                </h3>
                <button
                  type="button"
                  onClick={() => setCustModalOpen(false)}
                  aria-label="إغلاق"
                  className="rounded-lg p-1 text-[#8FA6C3] hover:bg-white/10 hover:text-white active:scale-90"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="cust-code" className="mb-1 block text-[12px] font-semibold text-[#c1c6d7]">
                    كود العميل *
                  </label>
                  <input
                    id="cust-code"
                    type="text"
                    dir="ltr"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="CL-101"
                    className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 font-mono text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
                  />
                </div>

                <div>
                  <label htmlFor="cust-name" className="mb-1 block text-[12px] font-semibold text-[#c1c6d7]">
                    اسم العميل *
                  </label>
                  <input
                    id="cust-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: مصنع الأمل"
                    className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
                  />
                </div>

                {(duplicateCodeError || duplicateNameError) && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 rounded-xl border border-[#EF4444]/50 bg-[#2A161E]/85 px-3 py-2 text-[12.5px] text-[#ffdad6]"
                  >
                    <span className="material-symbols-outlined text-[17px]">error</span>
                    <span>{duplicateCodeError || duplicateNameError}</span>
                  </div>
                )}
              </div>

              <div className="mt-6 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCustModalOpen(false)}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-[#d7e3fc] hover:border-white/30 hover:bg-white/10 active:scale-95"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={Boolean(duplicateCodeError || duplicateNameError)}
                  className="shine-cta rounded-xl bg-[#1677FF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#2F86FF] disabled:opacity-45"
                >
                  حفظ
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Allocate Stock to Customer Modal */}
      <AnimatePresence>
        {allocModalOpen && activeSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setAllocModalOpen(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <motion.form
              initial={{ opacity: 0, scale: 0.94, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={handleAllocSubmit}
              className="glass-card w-full max-w-md rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white">تخصيص إكسسوار للعميل</h3>
                  <p className="mt-0.5 text-xs text-[#20C5E8]">{activeSummary.customer.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAllocModalOpen(false)}
                  aria-label="إغلاق"
                  className="rounded-lg p-1 text-[#8FA6C3] hover:bg-white/10 hover:text-white active:scale-90"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-[#c1c6d7]">الصنف</label>
                  <select
                    value={allocItemId}
                    onChange={(e) => setAllocItemId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
                  >
                    {itemMetrics.map((m) => (
                      <option key={m.item.id} value={m.item.id}>
                        {m.item.name} — حر: {formatNum(Math.max(0, m.freeStock))} {m.item.unit}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-[#c1c6d7]">الكمية</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={allocQty}
                    onChange={(e) => setAllocQty(Math.max(1, Number(e.target.value)))}
                    className="tabular-nums h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
                  />
                </div>
                <OperatorSelector value={allocPerson} onChange={setAllocPerson} label="المسؤول عن التخصيص" />
              </div>
              <div className="mt-6 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setAllocModalOpen(false)}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-[#d7e3fc] hover:border-white/30 hover:bg-white/10 active:scale-95"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="shine-cta rounded-xl bg-[#1677FF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2F86FF]"
                >
                  تأكيد
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="حذف العميل"
        message={deleteTarget ? `هل تريد حذف "${deleteTarget.name}"؟` : ''}
        confirmLabel="حذف"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteCustomer(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
};
