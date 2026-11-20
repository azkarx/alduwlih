import React, { useMemo, useState } from 'react';
import { ALLOWED_OPERATORS } from '../data/seedData';
import type { AccessoryItem, OperatorName, WarehouseState } from '../types/warehouse';
import { computeItemMetrics, getCustomerAllocationQty } from '../utils/warehouseLogic';
import { formatNum, OperatorSelector } from './UiShared';
import { MovementPhotoField } from './MovementPhotoField';

const UNIT_SUGGESTIONS = ['زرار', 'قطعة', 'بكرة', 'متر', 'طقم', 'كرتونة', 'كيلو'];

interface StockInViewProps {
  state: WarehouseState;
  isAdmin: boolean;
  defaultPersonName: OperatorName;
  onSubmitStockIn: (params: {
    itemId: string;
    quantity: number;
    personName: string;
    customerId?: string;
    supplierName?: string;
    notes?: string;
    photoFile?: File;
  }) => Promise<boolean>;
  onCreateAndStockIn: (
    input: Omit<AccessoryItem, 'id' | 'createdAt' | 'updatedAt'>,
    personName: string,
    customerId?: string,
    photoFile?: File
  ) => Promise<boolean>;
}

export const StockInView: React.FC<StockInViewProps> = ({
  state,
  isAdmin,
  defaultPersonName,
  onSubmitStockIn,
  onCreateAndStockIn,
}) => {
  const [entryMode, setEntryMode] = useState<'new' | 'existing'>(
    state.items.length === 0 ? 'new' : 'existing'
  );

  // Mode: New Item + Stock
  const [newName, setNewName] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newUnit, setNewUnit] = useState('قطعة');
  const [newMinThreshold, setNewMinThreshold] = useState<number>(state.settings.defaultMinThreshold);
  const [newPhysicalStock, setNewPhysicalStock] = useState<number>(2000);

  // Mode: Existing Item + Stock
  const [itemId, setItemId] = useState(state.items[0]?.id || '');
  const [quantity, setQuantity] = useState<number>(100);

  // Shared fields
  const [personName, setPersonName] = useState<OperatorName>(
    ALLOWED_OPERATORS.includes(defaultPersonName) ? defaultPersonName : ALLOWED_OPERATORS[0]
  );
  const [assignType, setAssignType] = useState<'general' | 'customer'>('general');
  const [customerId, setCustomerId] = useState(state.customers[0]?.id || '');
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const effectiveMode = state.items.length === 0 ? 'new' : entryMode;
  const selectedItem = state.items.find((i) => i.id === itemId) || state.items[0];
  const metrics = useMemo(
    () => (selectedItem ? computeItemMetrics(selectedItem, state.allocations) : null),
    [selectedItem, state.allocations]
  );

  const effectiveAssignType = state.customers.length === 0 ? 'general' : assignType;
  const activeCustomerId = customerId || state.customers[0]?.id || '';
  const activeCustomer = state.customers.find((c) => c.id === activeCustomerId);
  const currentCustQty =
    effectiveMode === 'existing' && selectedItem && effectiveAssignType === 'customer' && activeCustomerId
      ? getCustomerAllocationQty(state.allocations, activeCustomerId, selectedItem.id)
      : 0;

  const qtyNum = Math.max(0, Math.floor(Number(quantity) || 0));
  const newStockNum = Math.max(0, Math.floor(Number(newPhysicalStock) || 0));

  const duplicateNewItemError = useMemo(() => {
    if (effectiveMode !== 'new') return '';
    const cleanSku = newSku.trim().toUpperCase();
    const cleanName = newName.trim().toLowerCase();
    if (cleanSku && state.items.some((i) => i.sku.toUpperCase() === cleanSku)) {
      return `كود الصنف (${cleanSku}) مستخدم لصنف آخر بالفعل.`;
    }
    if (cleanName && state.items.some((i) => i.name.trim().toLowerCase() === cleanName)) {
      return `اسم الصنف "${newName.trim()}" مسجل بالفعل.`;
    }
    return '';
  }, [effectiveMode, newSku, newName, state.items]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (duplicateNewItemError) return;
    const targetCustId = effectiveAssignType === 'customer' ? activeCustomerId || undefined : undefined;
    setSubmitting(true);

    try {
      if (effectiveMode === 'new') {
        const ok = await onCreateAndStockIn(
          {
            name: newName,
            sku: newSku,
            unit: newUnit.trim() || 'قطعة',
            minThreshold: newMinThreshold,
            physicalStock: newStockNum,
            category: 'عام',
            barcode: '',
            color: '',
            sizeSpec: '',
            rack: '-',
            notes: notes.trim() || undefined,
          },
          personName,
          targetCustId,
          photoFile || undefined
        );
        if (ok) {
          setNewName('');
          setNewSku('');
          setNotes('');
          setPhotoFile(null);
        }
        return;
      }

      if (!selectedItem) return;
      const ok = await onSubmitStockIn({
        itemId: selectedItem.id,
        quantity: qtyNum,
        personName,
        customerId: targetCustId,
        notes,
        photoFile: photoFile || undefined,
      });
      if (ok) {
        setNotes('');
        setPhotoFile(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center">
        <span className="material-symbols-outlined text-[40px] text-[#F59E0B]">lock</span>
        <h3 className="mt-2 text-lg font-bold text-white">صلاحية قراءة فقط</h3>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <form onSubmit={handleSubmit} className="glass-card space-y-4 rounded-2xl p-6 xl:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-bold text-white">إضافة مخزون</h2>
            <p className="mt-0.5 text-[12px] text-[#8FA6C3]">
              إضافة صنف جديد أو توريد رصيد مع التخصيص التلقائي
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-white/10 bg-[#071426]/65 p-1">
            <button
              type="button"
              onClick={() => setEntryMode('new')}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-150 active:scale-95 ${
                effectiveMode === 'new'
                  ? 'bg-[#1677FF] text-white shadow-md'
                  : 'text-[#8FA6C3] hover:bg-white/5 hover:text-white'
              }`}
            >
              صنف جديد
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('existing')}
              disabled={state.items.length === 0}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-150 active:scale-95 disabled:opacity-40 ${
                effectiveMode === 'existing'
                  ? 'bg-[#1677FF] text-white shadow-md'
                  : 'text-[#8FA6C3] hover:bg-white/5 hover:text-white'
              }`}
            >
              صنف مسجل
            </button>
          </div>
        </div>

        {effectiveMode === 'new' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="in-new-name" className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
                اسم الإكسسوار *
              </label>
              <input
                id="in-new-name"
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثال: زرار صدف"
                className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none focus:border-[#46dafd]"
              />
            </div>

            <div>
              <label htmlFor="in-new-sku" className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
                كود الصنف *
              </label>
              <input
                id="in-new-sku"
                type="text"
                dir="ltr"
                required
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                placeholder="BTN-PRL-01"
                className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 font-mono text-sm text-white outline-none focus:border-[#46dafd]"
              />
            </div>

            <div>
              <label htmlFor="in-new-unit" className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
                الوحدة (مخصصة) *
              </label>
              <input
                id="in-new-unit"
                type="text"
                list="stockin-unit-list"
                required
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder="اكتب الوحدة: زرار / قطعة / متر"
                className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none focus:border-[#46dafd]"
              />
              <datalist id="stockin-unit-list">
                {UNIT_SUGGESTIONS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="in-new-stock" className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
                الرصيد الفعلي *
              </label>
              <input
                id="in-new-stock"
                type="number"
                min={0}
                required
                value={newPhysicalStock}
                onChange={(e) => setNewPhysicalStock(Math.max(0, Number(e.target.value)))}
                className="tabular-nums h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none focus:border-[#46dafd]"
              />
            </div>

            <div>
              <label htmlFor="in-new-threshold" className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
                الحد الأدنى *
              </label>
              <input
                id="in-new-threshold"
                type="number"
                min={0}
                required
                value={newMinThreshold}
                onChange={(e) => setNewMinThreshold(Math.max(0, Number(e.target.value)))}
                className="tabular-nums h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none focus:border-[#46dafd]"
              />
            </div>

            {duplicateNewItemError && (
              <div
                role="alert"
                className="sm:col-span-2 flex items-center gap-2 rounded-xl border border-[#EF4444]/50 bg-[#2A161E]/85 px-3 py-2 text-[12.5px] text-[#ffdad6]"
              >
                <span className="material-symbols-outlined text-[17px]">error</span>
                <span>{duplicateNewItemError}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="in-item" className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
                الصنف *
              </label>
              <select
                id="in-item"
                value={selectedItem?.id || ''}
                onChange={(e) => setItemId(e.target.value)}
                className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none focus:border-[#46dafd]"
              >
                {state.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.sku}) — {formatNum(i.physicalStock)} {i.unit}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="in-qty" className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
                الكمية المضافة *
              </label>
              <input
                id="in-qty"
                type="number"
                min={1}
                required
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                className="tabular-nums h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none focus:border-[#46dafd]"
              />
            </div>
          </div>
        )}

        {/* Shared Customer / Free Stock Toggle & Operator */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
              العميل / نوع الرصيد *
            </span>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setAssignType('general')}
                aria-pressed={effectiveAssignType === 'general'}
                className={`flex items-center justify-between rounded-xl border p-3 text-right transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.98] ${
                  effectiveAssignType === 'general'
                    ? 'border-[#10B981] bg-[#10B981]/20 text-white shadow-[0_4px_16px_rgba(16,185,129,0.2)]'
                    : 'border-white/10 bg-[#071426]/55 text-[#8FA6C3] hover:border-white/30 hover:bg-[#102947]/65 hover:text-white'
                }`}
              >
                <span className="text-[13px] font-bold">الرصيد الحر للمخزن</span>
                {effectiveAssignType === 'general' && (
                  <span className="material-symbols-outlined text-[18px] text-[#10B981]">check_circle</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setAssignType('customer')}
                disabled={state.customers.length === 0}
                aria-pressed={effectiveAssignType === 'customer'}
                className={`flex items-center justify-between rounded-xl border p-3 text-right transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-45 ${
                  effectiveAssignType === 'customer'
                    ? 'border-[#20C5E8] bg-[#20C5E8]/20 text-white shadow-[0_4px_16px_rgba(32,197,232,0.2)]'
                    : 'border-white/10 bg-[#071426]/55 text-[#8FA6C3] hover:border-white/30 hover:bg-[#102947]/65 hover:text-white'
                }`}
              >
                <span className="text-[13px] font-bold">تخصيص لعميل محدد</span>
                {effectiveAssignType === 'customer' && (
                  <span className="material-symbols-outlined text-[18px] text-[#20C5E8]">check_circle</span>
                )}
              </button>
            </div>
            {state.customers.length === 0 && (
              <p className="mt-1.5 text-[11.5px] text-[#8FA6C3]">
                أضف عميلاً من شاشة «العملاء» لتخصيص الوارد له مباشرة.
              </p>
            )}
          </div>

          {effectiveAssignType === 'customer' && state.customers.length > 0 && (
            <div className="sm:col-span-2">
              <label htmlFor="in-customer" className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
                العميل *
              </label>
              <select
                id="in-customer"
                value={activeCustomerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none focus:border-[#46dafd]"
              >
                {state.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="sm:col-span-2">
            <OperatorSelector
              value={personName}
              onChange={setPersonName}
              label="المسؤول عن الإضافة"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="in-notes" className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
              ملاحظات
            </label>
            <input
              id="in-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اختياري"
              className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none focus:border-[#46dafd]"
            />
          </div>
          <MovementPhotoField file={photoFile} onChange={setPhotoFile} />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="shine-cta inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] text-sm font-bold text-[#002113] shadow-lg hover:bg-[#34d399] disabled:cursor-wait disabled:opacity-70"
        >
          <span className="material-symbols-outlined text-[20px]">add_box</span>
          {submitting ? 'جارٍ حفظ العملية...' : effectiveMode === 'new' ? 'إضافة الصنف والرصيد' : 'تأكيد الإضافة'}
        </button>
      </form>

      {/* Live Preview */}
      <div className="glass-card rounded-2xl p-6 xl:col-span-5">
        <h3 className="text-[15px] font-bold text-white">معاينة الرصيد</h3>

        {effectiveMode === 'new' ? (
          <div className="mt-4 space-y-3">
            <div className="glass-sub-interactive rounded-xl p-4">
              <div className="text-[12px] text-[#8FA6C3]">الصنف الجديد</div>
              <div className="mt-0.5 text-[15px] font-bold text-white">
                {newName.trim() || '—'}
              </div>
              <div className="mt-1 font-mono text-[12px] text-[#20C5E8]" dir="ltr">
                {(newSku || 'SKU').toUpperCase()}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="glass-sub-interactive rounded-xl p-3.5">
                <div className="text-[11.5px] text-[#8FA6C3]">الرصيد الفعلي</div>
                <div className="font-display tabular-nums mt-1 text-xl font-extrabold text-[#10B981]">
                  {formatNum(newStockNum)} {newUnit.trim() || 'قطعة'}
                </div>
              </div>
              <div className="glass-sub-interactive rounded-xl p-3.5">
                <div className="text-[11.5px] text-[#8FA6C3]">الحد الأدنى</div>
                <div className="font-display tabular-nums mt-1 text-xl font-extrabold text-white">
                  {formatNum(newMinThreshold)}
                </div>
              </div>
            </div>

            <div className="glass-sub-interactive rounded-xl border-[#20C5E8]/35 p-4">
              <div className="text-[12px] text-[#8FA6C3]">التوجيه التلقائي</div>
              <div className="mt-1 text-sm font-bold text-[#20C5E8]">
                {effectiveAssignType === 'customer' && activeCustomer
                  ? `رصيد العميل: ${activeCustomer.name} (${formatNum(newStockNum)} ${newUnit.trim() || 'قطعة'})`
                  : `الرصيد الحر للمخزن (${formatNum(newStockNum)} ${newUnit.trim() || 'قطعة'})`}
              </div>
            </div>
          </div>
        ) : (
          selectedItem &&
          metrics && (
            <div className="mt-4 space-y-3">
              <div className="glass-sub-interactive rounded-xl p-4">
                <div className="text-[12px] text-[#8FA6C3]">الصنف</div>
                <div className="mt-0.5 text-[15px] font-bold text-white">{selectedItem.name}</div>
                <div className="mt-1 font-mono text-[12px] text-[#20C5E8]" dir="ltr">
                  {selectedItem.sku}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="glass-sub-interactive rounded-xl p-3.5">
                  <div className="text-[11.5px] text-[#8FA6C3]">قبل</div>
                  <div className="font-display tabular-nums mt-1 text-xl font-extrabold text-white">
                    {formatNum(selectedItem.physicalStock)} {selectedItem.unit}
                  </div>
                </div>
                <div className="rounded-xl border border-[#10B981]/40 bg-[#10B981]/15 p-3.5 transition-all duration-150 hover:-translate-y-0.5 hover:border-[#10B981]/75">
                  <div className="text-[11.5px] text-[#6ffbbe]">بعد الإضافة</div>
                  <div className="font-display tabular-nums mt-1 text-xl font-extrabold text-[#10B981]">
                    {formatNum(selectedItem.physicalStock + qtyNum)} {selectedItem.unit}
                  </div>
                </div>
              </div>

              {effectiveAssignType === 'customer' && activeCustomer && (
                <div className="glass-sub-interactive rounded-xl border-[#20C5E8]/35 p-4">
                  <div className="text-[12px] text-[#20C5E8]">رصيد العميل: {activeCustomer.name}</div>
                  <div className="tabular-nums mt-1.5 flex items-center justify-between text-sm">
                    <span className="text-[#8FA6C3]">قبل: {formatNum(currentCustQty)}</span>
                    <span className="font-bold text-white">
                      بعد: {formatNum(currentCustQty + qtyNum)} {selectedItem.unit}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
};
