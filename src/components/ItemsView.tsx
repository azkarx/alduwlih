import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useMemo, useState } from 'react';
import { ALLOWED_OPERATORS } from '../data/seedData';
import type { AccessoryItem, OperatorName, WarehouseState } from '../types/warehouse';
import { computeAllItemMetrics } from '../utils/warehouseLogic';
import { ConfirmModal, formatNum, OperatorSelector, StockStatusTag } from './UiShared';
import { MovementPhotoField } from './MovementPhotoField';
import { StoredPhotoButton } from './StoredPhotoButton';

const UNIT_SUGGESTIONS = ['قطعة', 'زرار', 'بكرة', 'متر', 'طقم', 'كرتونة', 'كيلو'];

interface ItemsViewProps {
  state: WarehouseState;
  isAdmin: boolean;
  defaultPersonName: OperatorName;
  onCreateItem: (
    input: Omit<AccessoryItem, 'id' | 'createdAt' | 'updatedAt'>,
    personName: string,
    customerId?: string,
    photoFile?: File
  ) => Promise<boolean>;
  onUpdateItem: (
    itemId: string,
    updates: Partial<Omit<AccessoryItem, 'id' | 'createdAt'>>,
    personName: string,
    photoFile?: File
  ) => Promise<boolean>;
  onAdjustBalance: (itemId: string, newStock: number, personName: string, notes: string) => boolean;
  onDeleteItem: (itemId: string, personName: string) => boolean;
}

export const ItemsView: React.FC<ItemsViewProps> = ({
  state,
  isAdmin,
  defaultPersonName,
  onCreateItem,
  onUpdateItem,
  onAdjustBalance,
  onDeleteItem,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'zero' | 'low' | 'ok'>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AccessoryItem | null>(null);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('قطعة');
  const [physicalStock, setPhysicalStock] = useState<number>(0);
  const [minThreshold, setMinThreshold] = useState<number>(state.settings.defaultMinThreshold);
  const [assignMode, setAssignMode] = useState<'free' | 'customer'>('free');
  const [customerId, setCustomerId] = useState(state.customers[0]?.id || '');
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formOperator, setFormOperator] = useState<OperatorName>(
    ALLOWED_OPERATORS.includes(defaultPersonName) ? defaultPersonName : ALLOWED_OPERATORS[0]
  );

  const [adjustTarget, setAdjustTarget] = useState<AccessoryItem | null>(null);
  const [adjustNewQty, setAdjustNewQty] = useState<number>(0);
  const [adjustPerson, setAdjustPerson] = useState<OperatorName>(
    ALLOWED_OPERATORS.includes(defaultPersonName) ? defaultPersonName : ALLOWED_OPERATORS[0]
  );
  const [adjustNotes, setAdjustNotes] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<AccessoryItem | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!formSubmitting) setFormOpen(false);
        setAdjustTarget(null);
        setDeleteTarget(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [formSubmitting]);

  const duplicateItemError = useMemo(() => {
    const cleanSku = sku.trim().toUpperCase();
    const cleanName = name.trim().toLowerCase();
    if (cleanSku && state.items.some((i) => i.sku.toUpperCase() === cleanSku && i.id !== editingItem?.id)) {
      return `كود الصنف (${cleanSku}) مستخدم لصنف آخر بالفعل.`;
    }
    if (cleanName && state.items.some((i) => i.name.trim().toLowerCase() === cleanName && i.id !== editingItem?.id)) {
      return `اسم الصنف "${name.trim()}" مسجل بالفعل.`;
    }
    return '';
  }, [sku, name, state.items, editingItem]);

  const metricsList = useMemo(() => computeAllItemMetrics(state), [state]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return metricsList.filter((m) => {
      if (statusFilter === 'zero' && m.status !== 'zero') return false;
      if (statusFilter === 'low' && m.status !== 'low' && m.status !== 'over_allocated') return false;
      if (statusFilter === 'ok' && m.status !== 'ok') return false;
      if (!q) return true;
      return (
        m.item.name.toLowerCase().includes(q) ||
        m.item.sku.toLowerCase().includes(q) ||
        m.item.unit.toLowerCase().includes(q)
      );
    });
  }, [metricsList, search, statusFilter]);

  const openAddModal = () => {
    setEditingItem(null);
    setSku('');
    setName('');
    setUnit('قطعة');
    setPhysicalStock(0);
    setMinThreshold(state.settings.defaultMinThreshold);
    setAssignMode('free');
    setCustomerId(state.customers[0]?.id || '');
    setNotes('');
    setPhotoFile(null);
    setFormOperator(
      ALLOWED_OPERATORS.includes(defaultPersonName) ? defaultPersonName : ALLOWED_OPERATORS[0]
    );
    setFormOpen(true);
  };

  const openEditModal = (item: AccessoryItem) => {
    setEditingItem(item);
    setSku(item.sku);
    setName(item.name);
    setUnit(item.unit);
    setPhysicalStock(item.physicalStock);
    setMinThreshold(item.minThreshold);
    setAssignMode('free');
    setNotes(item.notes || '');
    setPhotoFile(null);
    setFormOperator(
      ALLOWED_OPERATORS.includes(defaultPersonName) ? defaultPersonName : ALLOWED_OPERATORS[0]
    );
    setFormOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUnit = unit.trim() || 'قطعة';
    setFormSubmitting(true);
    try {
      if (editingItem) {
        const ok = await onUpdateItem(
          editingItem.id,
          {
            sku,
            name,
            unit: cleanUnit,
            physicalStock,
            minThreshold,
            notes,
          },
          formOperator,
          photoFile || undefined
        );
        if (ok) {
          setFormOpen(false);
          setPhotoFile(null);
        }
      } else {
        const selectedCustId =
          assignMode === 'customer' ? customerId || state.customers[0]?.id : undefined;
        const ok = await onCreateItem(
          {
            sku,
            barcode: '',
            name,
            category: 'عام',
            unit: cleanUnit,
            color: '',
            sizeSpec: '',
            rack: '-',
            physicalStock,
            minThreshold,
            notes,
          },
          formOperator,
          selectedCustId,
          photoFile || undefined
        );
        if (ok) {
          setFormOpen(false);
          setPhotoFile(null);
        }
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    const ok = onAdjustBalance(adjustTarget.id, adjustNewQty, adjustPerson, adjustNotes);
    if (ok) setAdjustTarget(null);
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative min-w-[210px] flex-1">
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-2.5 text-[18px] text-[#8FA6C3]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الكود..."
              className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 pr-9 pl-3 text-sm text-white placeholder-[#4B6485] outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd] focus:shadow-[0_0_0_3px_rgba(70,218,253,0.14)]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            aria-label="تصفية حسب الحالة"
            className="h-10 rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
          >
            <option value="all">كل الحالات</option>
            <option value="zero">صفري</option>
            <option value="low">منخفض</option>
            <option value="ok">آمن</option>
          </select>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openAddModal}
            className="shine-cta inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#1677FF] to-[#0ea5e9] px-4 text-sm font-semibold text-white shadow-md"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            صنف جديد
          </button>
        )}
      </div>

      {/* Items Table */}
      <div className="glass-card overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[13px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-[12px] text-[#8FA6C3]">
                <th className="px-4 py-3 font-semibold">الكود</th>
                <th className="px-4 py-3 font-semibold">اسم الإكسسوار</th>
                <th className="px-4 py-3 font-semibold">الرصيد الفعلي</th>
                <th className="px-4 py-3 font-semibold">للعملاء</th>
                <th className="px-4 py-3 font-semibold">الحر</th>
                <th className="px-4 py-3 font-semibold">الحد الأدنى</th>
                <th className="px-4 py-3 font-semibold">الحالة</th>
                {isAdmin && <th className="px-4 py-3 text-left font-semibold">إجراءات</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-4 py-12 text-center text-[#8FA6C3]">
                    {state.items.length === 0
                      ? 'المخزن فارغ حالياً — أضف أول صنف للبدء.'
                      : 'لا توجد أصناف مطابقة للبحث.'}
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr
                    key={m.item.id}
                    className={`transition-colors duration-150 hover:bg-[#1677FF]/[0.1] active:bg-[#1677FF]/[0.16] ${
                      m.status === 'zero' ? 'bg-[#EF4444]/[0.06] hover:bg-[#EF4444]/[0.12]' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span dir="ltr" className="inline-block font-mono text-[12.5px] font-semibold text-[#20C5E8]">
                        {m.item.sku}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">
                      <div className="flex items-center gap-2">
                        <span>{m.item.name}</span>
                        {m.item.photoPath && (
                          <StoredPhotoButton
                            path={m.item.photoPath}
                            settings={state.settings}
                            label="عرض الصورة"
                          />
                        )}
                      </div>
                    </td>
                    <td className="tabular-nums px-4 py-3 font-bold text-white">
                      <span className={m.item.physicalStock === 0 ? 'text-[#EF4444]' : ''}>
                        {formatNum(m.item.physicalStock)}
                      </span>{' '}
                      <span className="text-[11.5px] font-normal text-[#8FA6C3]">{m.item.unit}</span>
                    </td>
                    <td className="tabular-nums px-4 py-3 font-semibold text-[#20C5E8]">
                      {formatNum(m.allocatedStock)}
                    </td>
                    <td
                      className={`tabular-nums px-4 py-3 font-semibold ${
                        m.freeStock < 0 ? 'text-[#EF4444]' : 'text-[#10B981]'
                      }`}
                    >
                      {formatNum(m.freeStock)}
                    </td>
                    <td className="tabular-nums px-4 py-3 text-[#c1c6d7]">
                      {formatNum(m.item.minThreshold)}
                    </td>
                    <td className="px-4 py-3">
                      <StockStatusTag status={m.status} />
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustTarget(m.item);
                              setAdjustNewQty(m.item.physicalStock);
                              setAdjustPerson(defaultPersonName);
                              setAdjustNotes('');
                            }}
                            title="تعديل الرصيد"
                            aria-label={`تعديل رصيد ${m.item.name}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11.5px] font-medium text-[#20C5E8] hover:-translate-y-0.5 hover:border-[#20C5E8] hover:bg-[#20C5E8]/15 hover:shadow-[0_4px_12px_rgba(32,197,232,0.2)] active:scale-90"
                          >
                            <span className="material-symbols-outlined text-[15px]">tune</span>
                            رصيد
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(m.item)}
                            title="تعديل الصنف"
                            aria-label={`تعديل بيانات ${m.item.name}`}
                            className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-[#afc6ff] hover:-translate-y-0.5 hover:border-[#1677FF] hover:bg-[#1677FF]/20 hover:text-white active:scale-90"
                          >
                            <span className="material-symbols-outlined text-[17px]">edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(m.item)}
                            title="حذف الصنف"
                            aria-label={`حذف ${m.item.name}`}
                            className="rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/15 p-1.5 text-[#EF4444] hover:-translate-y-0.5 hover:border-[#EF4444] hover:bg-[#EF4444]/30 hover:shadow-[0_4px_12px_rgba(239,68,68,0.25)] active:scale-90"
                          >
                            <span className="material-symbols-outlined text-[17px]">delete</span>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Item Modal */}
      <AnimatePresence>
        {formOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !formSubmitting) setFormOpen(false);
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
              onSubmit={handleFormSubmit}
              className="glass-card max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-lg font-bold text-white">
                  {editingItem ? 'تعديل الصنف' : 'إضافة صنف جديد'}
                </h3>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  disabled={formSubmitting}
                  aria-label="إغلاق"
                  className="rounded-lg p-1 text-[#8FA6C3] hover:bg-white/10 hover:text-white active:scale-90"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="item-name" className="mb-1 block text-[12px] font-semibold text-[#c1c6d7]">
                    اسم الإكسسوار *
                  </label>
                  <input
                    id="item-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: زرار قميص صدف"
                    className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
                  />
                </div>

                <div>
                  <label htmlFor="item-sku" className="mb-1 block text-[12px] font-semibold text-[#c1c6d7]">
                    كود الصنف *
                  </label>
                  <input
                    id="item-sku"
                    type="text"
                    dir="ltr"
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="BTN-PRL-01"
                    className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 font-mono text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
                  />
                </div>

                <div>
                  <label htmlFor="item-unit" className="mb-1 block text-[12px] font-semibold text-[#c1c6d7]">
                    الوحدة (مخصصة) *
                  </label>
                  <input
                    id="item-unit"
                    type="text"
                    list="dawliya-unit-list"
                    required
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="مثال: زرار / قطعة / بكرة"
                    className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
                  />
                  <datalist id="dawliya-unit-list">
                    {UNIT_SUGGESTIONS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label htmlFor="item-stock" className="mb-1 block text-[12px] font-semibold text-[#c1c6d7]">
                    الرصيد الفعلي *
                  </label>
                  <input
                    id="item-stock"
                    type="number"
                    min={0}
                    required
                    value={physicalStock}
                    onChange={(e) => setPhysicalStock(Math.max(0, Number(e.target.value)))}
                    className="tabular-nums h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
                  />
                </div>

                <div>
                  <label htmlFor="item-threshold" className="mb-1 block text-[12px] font-semibold text-[#c1c6d7]">
                    الحد الأدنى *
                  </label>
                  <input
                    id="item-threshold"
                    type="number"
                    min={0}
                    required
                    value={minThreshold}
                    onChange={(e) => setMinThreshold(Math.max(0, Number(e.target.value)))}
                    className="tabular-nums h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
                  />
                </div>

                {!editingItem && (
                  <div className="sm:col-span-2">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
                      التخصيص (العميل)
                    </span>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setAssignMode('free')}
                        className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-all duration-150 active:scale-[0.97] ${
                          assignMode === 'free'
                            ? 'border-[#10B981] bg-[#10B981]/20 text-white shadow-[0_4px_14px_rgba(16,185,129,0.2)]'
                            : 'border-white/10 bg-[#071426]/55 text-[#8FA6C3] hover:border-white/30 hover:text-white'
                        }`}
                      >
                        الرصيد الحر للمخزن
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssignMode('customer')}
                        disabled={state.customers.length === 0}
                        className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-45 ${
                          assignMode === 'customer'
                            ? 'border-[#20C5E8] bg-[#20C5E8]/20 text-white shadow-[0_4px_14px_rgba(32,197,232,0.2)]'
                            : 'border-white/10 bg-[#071426]/55 text-[#8FA6C3] hover:border-white/30 hover:text-white'
                        }`}
                      >
                        تخصيص لعميل
                      </button>
                    </div>

                    {assignMode === 'customer' && state.customers.length > 0 && (
                      <div className="mt-2.5">
                        <label htmlFor="item-customer" className="mb-1 block text-[12px] font-semibold text-[#c1c6d7]">
                          اختر العميل *
                        </label>
                        <select
                          id="item-customer"
                          value={customerId || state.customers[0]?.id || ''}
                          onChange={(e) => setCustomerId(e.target.value)}
                          className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
                        >
                          {state.customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.code})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                <div className="sm:col-span-2">
                  <OperatorSelector value={formOperator} onChange={setFormOperator} label="المسؤول" />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="item-notes" className="mb-1 block text-[12px] font-semibold text-[#c1c6d7]">
                    ملاحظات
                  </label>
                  <input
                    id="item-notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="اختياري"
                    className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
                  />
                </div>
                <MovementPhotoField
                  file={photoFile}
                  onChange={setPhotoFile}
                  label={editingItem ? 'صورة الصنف' : 'صورة العملية'}
                />
                {editingItem?.photoPath && (
                  <div className="sm:col-span-2 flex items-center gap-2 text-xs text-[#8FA6C3]">
                    <span>الصورة الحالية:</span>
                    <StoredPhotoButton
                      path={editingItem.photoPath}
                      settings={state.settings}
                      label="عرض الصورة"
                    />
                  </div>
                )}
                {duplicateItemError && (
                  <div
                    role="alert"
                    className="sm:col-span-2 flex items-center gap-2 rounded-xl border border-[#EF4444]/50 bg-[#2A161E]/85 px-3 py-2 text-[12.5px] text-[#ffdad6]"
                  >
                    <span className="material-symbols-outlined text-[17px]">error</span>
                    <span>{duplicateItemError}</span>
                  </div>
                )}
              </div>

              <div className="mt-6 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  disabled={formSubmitting}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-[#d7e3fc] hover:border-white/30 hover:bg-white/10 active:scale-95"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={Boolean(duplicateItemError) || formSubmitting}
                  className="shine-cta rounded-xl bg-[#1677FF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#2F86FF] disabled:opacity-45"
                >
                  {formSubmitting ? 'جارٍ حفظ العملية...' : editingItem ? 'حفظ' : 'إضافة'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Balance Adjust Modal */}
      <AnimatePresence>
        {adjustTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setAdjustTarget(null);
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
              onSubmit={handleAdjustSubmit}
              className="glass-card w-full max-w-md rounded-2xl p-6 shadow-2xl"
            >
              <h3 className="text-base font-bold text-white">تعديل الرصيد</h3>
              <p className="mt-1 text-sm text-[#8FA6C3]">
                {adjustTarget.name} (<span dir="ltr" className="font-mono">{adjustTarget.sku}</span>)
              </p>
              <div className="mt-4 space-y-3">
                <div className="glass-sub rounded-xl p-3 text-sm">
                  الرصيد الحالي: <strong className="tabular-nums text-white">{formatNum(adjustTarget.physicalStock)}</strong>{' '}
                  {adjustTarget.unit}
                </div>
                <div>
                  <label htmlFor="adjust-qty" className="mb-1 block text-[12px] font-semibold text-[#c1c6d7]">
                    الرصيد الجديد *
                  </label>
                  <input
                    id="adjust-qty"
                    type="number"
                    min={0}
                    required
                    value={adjustNewQty}
                    onChange={(e) => setAdjustNewQty(Math.max(0, Number(e.target.value)))}
                    className="tabular-nums h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
                  />
                </div>
                <OperatorSelector value={adjustPerson} onChange={setAdjustPerson} label="المسؤول عن التعديل" />
                <div>
                  <label htmlFor="adjust-notes" className="mb-1 block text-[12px] font-semibold text-[#c1c6d7]">
                    السبب
                  </label>
                  <input
                    id="adjust-notes"
                    type="text"
                    value={adjustNotes}
                    onChange={(e) => setAdjustNotes(e.target.value)}
                    placeholder="مثال: جرد دوري"
                    className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
                  />
                </div>
              </div>
              <div className="mt-6 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setAdjustTarget(null)}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-[#d7e3fc] hover:border-white/30 hover:bg-white/10 active:scale-95"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="shine-cta rounded-xl bg-[#1677FF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2F86FF]"
                >
                  تحديث
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="حذف الصنف"
        message={
          deleteTarget
            ? `هل تريد حذف "${deleteTarget.name}" (${deleteTarget.sku}) نهائياً؟`
            : ''
        }
        confirmLabel="حذف"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteItem(deleteTarget.id, defaultPersonName);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
};
