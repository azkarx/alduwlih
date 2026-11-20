import React, { useEffect, useMemo, useState } from 'react';
import { ALLOWED_OPERATORS } from '../data/seedData';
import type { OperatorName, StockOutSource, WarehouseState } from '../types/warehouse';
import { computeItemMetrics, getCustomerAllocationQty } from '../utils/warehouseLogic';
import { formatNum, OperatorSelector } from './UiShared';

interface StockOutViewProps {
  state: WarehouseState;
  isAdmin: boolean;
  defaultPersonName: OperatorName;
  preselectedCustomerId?: string;
  preselectedItemId?: string;
  onSubmitStockOut: (params: {
    itemId: string;
    quantity: number;
    personName: string;
    source: StockOutSource;
    customerId?: string;
    notes?: string;
  }) => boolean;
}

export const StockOutView: React.FC<StockOutViewProps> = ({
  state,
  isAdmin,
  defaultPersonName,
  preselectedCustomerId,
  preselectedItemId,
  onSubmitStockOut,
}) => {
  const [itemId, setItemId] = useState(preselectedItemId || state.items[0]?.id || '');
  const [source, setSource] = useState<StockOutSource>(
    preselectedCustomerId || state.customers.length > 0 ? 'customer_allocation' : 'free_stock'
  );
  const [customerId, setCustomerId] = useState(preselectedCustomerId || state.customers[0]?.id || '');
  const [quantity, setQuantity] = useState<number>(50);
  const [personName, setPersonName] = useState<OperatorName>(
    ALLOWED_OPERATORS.includes(defaultPersonName) ? defaultPersonName : ALLOWED_OPERATORS[0]
  );
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (preselectedItemId) setItemId(preselectedItemId);
    if (preselectedCustomerId) {
      setCustomerId(preselectedCustomerId);
      setSource('customer_allocation');
    }
  }, [preselectedCustomerId, preselectedItemId]);

  const selectedItem = state.items.find((i) => i.id === itemId) || state.items[0];
  const metrics = useMemo(
    () => (selectedItem ? computeItemMetrics(selectedItem, state.allocations) : null),
    [selectedItem, state.allocations]
  );

  const effectiveSource: StockOutSource =
    state.customers.length === 0 ? 'free_stock' : source;
  const activeCustomerId = customerId || state.customers[0]?.id || '';
  const custBalance =
    selectedItem && activeCustomerId
      ? getCustomerAllocationQty(state.allocations, activeCustomerId, selectedItem.id)
      : 0;

  const qtyNum = Math.max(0, Math.floor(Number(quantity) || 0));

  const validationError = useMemo(() => {
    if (!selectedItem || !metrics) return 'اختر صنفاً أولاً.';
    if (selectedItem.physicalStock <= 0) return 'الرصيد الفعلي صفر.';
    if (qtyNum <= 0) return 'أدخل كمية أكبر من صفر.';
    if (qtyNum > selectedItem.physicalStock) {
      return `الكمية (${qtyNum}) تتجاوز الفعلي (${selectedItem.physicalStock}).`;
    }
    if (effectiveSource === 'customer_allocation') {
      if (!activeCustomerId) return 'اختر العميل.';
      if (custBalance <= 0) return 'لا يوجد رصيد مخصص لهذا العميل.';
      if (qtyNum > custBalance) {
        return `الكمية (${qtyNum}) أكبر من رصيد العميل (${custBalance}).`;
      }
    } else if (qtyNum > metrics.freeStock) {
      return `المتاح الحر (${Math.max(0, metrics.freeStock)}) فقط.`;
    }
    return '';
  }, [selectedItem, metrics, qtyNum, effectiveSource, activeCustomerId, custBalance]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    const ok = onSubmitStockOut({
      itemId: selectedItem.id,
      quantity: qtyNum,
      personName,
      source: effectiveSource,
      customerId: effectiveSource === 'customer_allocation' ? activeCustomerId || undefined : undefined,
      notes,
    });
    if (ok) {
      setNotes('');
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

  if (state.items.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-10 text-center">
        <span className="material-symbols-outlined text-[42px] text-[#20C5E8]">outbox</span>
        <h3 className="mt-2 text-base font-bold text-white">لا توجد أصناف مسجلة بعد</h3>
        <p className="mt-1 text-sm text-[#8FA6C3]">أضف أصنافاً أولاً لتتمكن من الصرف.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <form onSubmit={handleSubmit} className="glass-card space-y-4 rounded-2xl p-6 xl:col-span-7">
        <div>
          <h2 className="text-[17px] font-bold text-white">صرف إكسسوارات</h2>
          <p className="mt-0.5 text-[12px] text-[#8FA6C3]">خصم تلقائي من الرصيد</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="out-item" className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
              الصنف *
            </label>
            <select
              id="out-item"
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
            <span className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">مصدر الصرف *</span>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSource('customer_allocation')}
                disabled={state.customers.length === 0}
                aria-pressed={effectiveSource === 'customer_allocation'}
                className={`flex items-center justify-between rounded-xl border p-3 text-right transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-45 ${
                  effectiveSource === 'customer_allocation'
                    ? 'border-[#20C5E8] bg-[#20C5E8]/20 text-white shadow-[0_4px_16px_rgba(32,197,232,0.2)]'
                    : 'border-white/10 bg-[#071426]/55 text-[#8FA6C3] hover:border-white/30 hover:bg-[#102947]/65 hover:text-white'
                }`}
              >
                <span className="text-[13px] font-bold">من رصيد عميل</span>
                {effectiveSource === 'customer_allocation' && (
                  <span className="material-symbols-outlined text-[18px] text-[#20C5E8]">check_circle</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSource('free_stock')}
                aria-pressed={effectiveSource === 'free_stock'}
                className={`flex items-center justify-between rounded-xl border p-3 text-right transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.98] ${
                  effectiveSource === 'free_stock'
                    ? 'border-[#1677FF] bg-[#1677FF]/25 text-white shadow-[0_4px_16px_rgba(22,119,255,0.2)]'
                    : 'border-white/10 bg-[#071426]/55 text-[#8FA6C3] hover:border-white/30 hover:bg-[#102947]/65 hover:text-white'
                }`}
              >
                <span className="text-[13px] font-bold">من الرصيد الحر</span>
                {effectiveSource === 'free_stock' && (
                  <span className="material-symbols-outlined text-[18px] text-[#46dafd]">check_circle</span>
                )}
              </button>
            </div>
          </div>

          {effectiveSource === 'customer_allocation' && state.customers.length > 0 && (
            <div className="sm:col-span-2">
              <label htmlFor="out-customer" className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
                العميل *
              </label>
              <select
                id="out-customer"
                value={activeCustomerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none focus:border-[#46dafd]"
              >
                {state.customers.map((c) => {
                  const cQty = selectedItem
                    ? getCustomerAllocationQty(state.allocations, c.id, selectedItem.id)
                    : 0;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}) — {formatNum(cQty)}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="out-qty" className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
              الكمية المنصرفة *
            </label>
            <input
              id="out-qty"
              type="number"
              min={1}
              required
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              className="tabular-nums h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none focus:border-[#46dafd]"
            />
          </div>

          <OperatorSelector
            value={personName}
            onChange={setPersonName}
            label="المسؤول عن الصرف"
          />

          <div className="sm:col-span-2">
            <label htmlFor="out-notes" className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
              ملاحظات التشغيل
            </label>
            <input
              id="out-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اختياري"
              className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none focus:border-[#46dafd]"
            />
          </div>
        </div>

        {validationError && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-[#EF4444]/50 bg-[#2A161E]/85 px-3.5 py-2.5 text-[13px] text-[#ffdad6]"
          >
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{validationError}</span>
          </div>
        )}

        <button
          type="submit"
          className="shine-cta inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-[#1677FF] to-[#0ea5e9] text-sm font-bold text-white shadow-lg"
        >
          <span className="material-symbols-outlined text-[20px]">outbox</span>
          تأكيد الصرف
        </button>
      </form>

      {/* Live Preview */}
      <div className="glass-card rounded-2xl p-6 xl:col-span-5">
        <h3 className="text-[15px] font-bold text-white">معاينة الخصم</h3>
        {selectedItem && metrics && (
          <div className="mt-4 space-y-3">
            <div className="glass-sub-interactive rounded-xl p-4">
              <div className="text-[12px] text-[#8FA6C3]">الصنف</div>
              <div className="mt-0.5 text-[15px] font-bold text-white">{selectedItem.name}</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[12px]">
                <div className="rounded-lg bg-white/5 p-2 transition hover:bg-white/10">
                  <div className="text-[#8FA6C3]">فعلي</div>
                  <div className="tabular-nums font-bold text-white">{formatNum(selectedItem.physicalStock)}</div>
                </div>
                <div className="rounded-lg bg-white/5 p-2 transition hover:bg-white/10">
                  <div className="text-[#8FA6C3]">للعملاء</div>
                  <div className="tabular-nums font-bold text-[#20C5E8]">{formatNum(metrics.allocatedStock)}</div>
                </div>
                <div className="rounded-lg bg-white/5 p-2 transition hover:bg-white/10">
                  <div className="text-[#8FA6C3]">حر</div>
                  <div className="tabular-nums font-bold text-[#10B981]">{formatNum(metrics.freeStock)}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="glass-sub-interactive rounded-xl p-3.5">
                <div className="text-[11.5px] text-[#8FA6C3]">الفعلي بعد الصرف</div>
                <div
                  className={`font-display tabular-nums mt-1 text-xl font-extrabold ${
                    selectedItem.physicalStock - qtyNum < 0
                      ? 'text-[#EF4444]'
                      : selectedItem.physicalStock - qtyNum <= selectedItem.minThreshold
                      ? 'text-[#F59E0B]'
                      : 'text-white'
                  }`}
                >
                  {formatNum(Math.max(0, selectedItem.physicalStock - qtyNum))} {selectedItem.unit}
                </div>
              </div>

              <div className="glass-sub-interactive rounded-xl p-3.5">
                <div className="text-[11.5px] text-[#8FA6C3]">
                  {effectiveSource === 'customer_allocation' ? 'العميل بعد الصرف' : 'الحر بعد الصرف'}
                </div>
                <div className="font-display tabular-nums mt-1 text-xl font-extrabold text-[#20C5E8]">
                  {effectiveSource === 'customer_allocation'
                    ? formatNum(Math.max(0, custBalance - qtyNum))
                    : formatNum(Math.max(0, metrics.freeStock - qtyNum))}{' '}
                  {selectedItem.unit}
                </div>
              </div>
            </div>

            {selectedItem.physicalStock - qtyNum <= selectedItem.minThreshold && (
              <div className="rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/15 p-3 text-[12.5px] text-[#fde68a]">
                تنبيه: سيصل الرصيد إلى حد التنبيه ({formatNum(selectedItem.minThreshold)}) أو أقل.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
