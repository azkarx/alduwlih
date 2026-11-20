import { motion } from 'motion/react';
import React, { useMemo, useState } from 'react';
import type { ReportPreset, WarehouseState } from '../types/warehouse';
import { exportReportToExcel, exportReportToWord } from '../utils/exportUtils';
import {
  buildWhatsAppReportText,
  buildWhatsAppUrl,
  computeAllItemMetrics,
  computeCustomerBalances,
  filterMovementsByDateRange,
} from '../utils/warehouseLogic';
import { formatDateTime, formatNum, movementMeta } from './UiShared';

interface ReportsViewProps {
  state: WarehouseState;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ state, onNotify }) => {
  const [preset, setPreset] = useState<ReportPreset>('weekly');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const range = useMemo(
    () => ({ preset, startDate, endDate }),
    [preset, startDate, endDate]
  );

  const filteredMovements = useMemo(
    () => filterMovementsByDateRange(state.movements, range),
    [state.movements, range]
  );

  const metrics = useMemo(() => computeAllItemMetrics(state), [state]);
  const customerBalances = useMemo(() => computeCustomerBalances(state), [state]);

  const totalPhysical = metrics.reduce((s, m) => s + m.item.physicalStock, 0);
  const totalAllocated = metrics.reduce((s, m) => s + m.allocatedStock, 0);
  const totalIn = filteredMovements
    .filter((m) => m.type === 'stock_in')
    .reduce((s, m) => s + Math.abs(m.quantityDelta), 0);
  const totalOut = filteredMovements
    .filter((m) => m.type === 'stock_out')
    .reduce((s, m) => s + Math.abs(m.quantityDelta), 0);

  const whatsappText = useMemo(
    () => buildWhatsAppReportText(state, range, filteredMovements),
    [state, range, filteredMovements]
  );
  const whatsappUrl = useMemo(
    () => buildWhatsAppUrl(state.settings.whatsappNumber, whatsappText),
    [state.settings.whatsappNumber, whatsappText]
  );

  const handleExcel = () => {
    exportReportToExcel(state, filteredMovements, range);
    onNotify('success', 'تم تصدير Excel بنجاح.');
  };

  const handleWord = () => {
    exportReportToWord(state, filteredMovements, range);
    onNotify('success', 'تم تصدير Word بنجاح.');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(whatsappText);
      onNotify('success', 'تم نسخ التقرير.');
    } catch {
      onNotify('error', 'تعذر النسخ التلقائي.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="no-print glass-card space-y-4 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'today', label: 'اليوم' },
              { id: 'weekly', label: 'أسبوعي' },
              { id: 'monthly', label: 'شهري' },
              { id: 'all', label: 'الكل' },
              { id: 'custom', label: 'فترة مخصصة' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id as ReportPreset)}
                className={`relative rounded-xl px-3.5 py-2 text-[12.5px] font-semibold transition-all duration-150 active:scale-95 ${
                  preset === p.id
                    ? 'text-white'
                    : 'border border-white/10 bg-[#071426]/65 text-[#c1c6d7] hover:border-[#46dafd]/40 hover:bg-[#102947]/70 hover:text-white'
                }`}
              >
                {preset === p.id && (
                  <motion.span
                    layoutId="reports-active-preset"
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-l from-[#1677FF] to-[#0ea5e9] shadow-md"
                  />
                )}
                <span className="relative z-10">{p.label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExcel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#10B981]/45 bg-[#10B981]/15 px-3.5 py-2 text-[12.5px] font-semibold text-[#10B981] hover:-translate-y-0.5 hover:border-[#10B981] hover:bg-[#10B981]/25 hover:shadow-[0_6px_16px_rgba(16,185,129,0.22)] active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">table_view</span>
              Excel
            </button>
            <button
              type="button"
              onClick={handleWord}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#1677FF]/45 bg-[#1677FF]/15 px-3.5 py-2 text-[12.5px] font-semibold text-[#afc6ff] hover:-translate-y-0.5 hover:border-[#1677FF] hover:bg-[#1677FF]/28 hover:text-white hover:shadow-[0_6px_16px_rgba(22,119,255,0.25)] active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">description</span>
              Word
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:-translate-y-0.5 hover:border-white/35 hover:bg-white/15 active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">print</span>
              طباعة
            </button>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shine-cta inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-4 py-2 text-[12.5px] font-bold text-[#052e16] shadow-md hover:bg-[#34e374]"
            >
              <span className="material-symbols-outlined text-[18px]">send</span>
              واتساب (<span dir="ltr">{state.settings.whatsappNumber}</span>)
            </a>
          </div>
        </div>

        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-4 border-t border-white/10 pt-3 text-sm">
            <label className="flex items-center gap-2 text-[#c1c6d7]">
              <span>من:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-white outline-none focus:border-[#46dafd]"
              />
            </label>
            <label className="flex items-center gap-2 text-[#c1c6d7]">
              <span>إلى:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-white outline-none focus:border-[#46dafd]"
              />
            </label>
          </div>
        )}
      </div>

      {/* Report KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="print-surface glass-card-interactive rounded-2xl p-4">
          <div className="text-[12px] text-[#8FA6C3]">الرصيد الفعلي</div>
          <div className="font-display tabular-nums mt-1 text-2xl font-extrabold text-white">{formatNum(totalPhysical)}</div>
        </div>
        <div className="print-surface glass-card-interactive rounded-2xl p-4">
          <div className="text-[12px] text-[#8FA6C3]">رصيد العملاء</div>
          <div className="font-display tabular-nums mt-1 text-2xl font-extrabold text-[#20C5E8]">{formatNum(totalAllocated)}</div>
        </div>
        <div className="print-surface glass-card-interactive rounded-2xl p-4">
          <div className="text-[12px] text-[#8FA6C3]">وارد الفترة</div>
          <div dir="ltr" className="font-display tabular-nums mt-1 text-right text-2xl font-extrabold text-[#10B981]">+{formatNum(totalIn)}</div>
        </div>
        <div className="print-surface glass-card-interactive rounded-2xl p-4">
          <div className="text-[12px] text-[#8FA6C3]">منصرف الفترة</div>
          <div dir="ltr" className="font-display tabular-nums mt-1 text-right text-2xl font-extrabold text-[#EF4444]">-{formatNum(totalOut)}</div>
        </div>
      </div>

      {/* WhatsApp Preview + Customer Balances */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="no-print glass-card rounded-2xl p-5 xl:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#25D366]/35 bg-[#25D366]/15 text-[#25D366]">
                <span className="material-symbols-outlined text-[18px]">chat</span>
              </span>
              <div>
                <h3 className="text-[15px] font-bold text-white">معاينة تقرير الواتساب</h3>
                <p dir="ltr" className="text-right font-mono text-[11px] text-[#8FA6C3]">
                  {state.settings.whatsappNumber}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyReport}
              className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-[#20C5E8] hover:-translate-y-0.5 hover:border-[#20C5E8] hover:bg-[#20C5E8]/15 active:scale-95"
            >
              <span className="material-symbols-outlined text-[15px]">content_copy</span>
              نسخ التقرير
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#c1c6d7]">
            <span className="rounded-full border border-[#10B981]/30 bg-[#10B981]/10 px-2.5 py-0.5">
              🟢 متاح
            </span>
            <span className="rounded-full border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-2.5 py-0.5">
              ⚠️ اقترب من الحد الأدنى
            </span>
            <span className="rounded-full border border-[#EF4444]/30 bg-[#EF4444]/10 px-2.5 py-0.5">
              🔴 نفاد تام
            </span>
          </div>
          <pre
            dir="rtl"
            className="mt-3 max-h-[340px] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-[#25D366]/25 bg-gradient-to-b from-[#07261a]/75 to-[#061c24]/85 p-4 font-sans text-[12.5px] leading-relaxed text-[#e6f7ee] shadow-inner"
          >
            {whatsappText}
          </pre>
        </div>

        <div className="print-surface glass-card rounded-2xl p-5 xl:col-span-7">
          <h3 className="mb-3 text-[15px] font-bold text-white">أرصدة العملاء</h3>
          {customerBalances.length === 0 ? (
            <div className="glass-sub rounded-xl p-8 text-center text-sm text-[#8FA6C3]">
              لا يوجد عملاء بعد.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-[13px]">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-[12px] text-[#8FA6C3]">
                    <th className="px-3 py-2.5 font-semibold">العميل</th>
                    <th className="px-3 py-2.5 font-semibold">الأصناف</th>
                    <th className="px-3 py-2.5 font-semibold">الإجمالي</th>
                    <th className="px-3 py-2.5 font-semibold">التفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {customerBalances.map((cs) => (
                    <tr key={cs.customer.id} className="transition-colors duration-150 hover:bg-[#1677FF]/[0.1]">
                      <td className="px-3 py-2.5 font-semibold text-white">{cs.customer.name}</td>
                      <td className="tabular-nums px-3 py-2.5 text-[#c1c6d7]">{cs.itemsCount}</td>
                      <td className="tabular-nums px-3 py-2.5 font-bold text-[#20C5E8]">
                        {formatNum(cs.totalQuantity)}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-[#8FA6C3]">
                        {cs.allocations.length === 0
                          ? '—'
                          : cs.allocations
                              .map((a) => `${a.item.name} (${formatNum(a.allocation.quantity)})`)
                              .join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Period Movements Preview */}
      <div className="print-surface glass-card overflow-hidden rounded-2xl">
        <div className="border-b border-white/10 bg-white/5 px-4 py-3 text-[14px] font-bold text-white">
          الحركات ({filteredMovements.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[13px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-[12px] text-[#8FA6C3]">
                <th className="px-4 py-2.5 font-semibold">التاريخ</th>
                <th className="px-4 py-2.5 font-semibold">النوع</th>
                <th className="px-4 py-2.5 font-semibold">الصنف</th>
                <th className="px-4 py-2.5 font-semibold">الكمية</th>
                <th className="px-4 py-2.5 font-semibold">المسؤول</th>
                <th className="px-4 py-2.5 font-semibold">الجهة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#8FA6C3]">
                    لا توجد حركات في هذه الفترة.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => {
                  const meta = movementMeta(m.type);
                  return (
                    <tr key={m.id} className="transition-colors duration-150 hover:bg-[#1677FF]/[0.1]">
                      <td className="px-4 py-2.5 text-[12px] text-[#8FA6C3]">{formatDateTime(m.createdAt)}</td>
                      <td className={`px-4 py-2.5 font-medium ${meta.colorClass}`}>{meta.label}</td>
                      <td className="px-4 py-2.5 text-white">{m.itemName}</td>
                      <td
                        className={`tabular-nums px-4 py-2.5 font-bold ${
                          m.quantityDelta > 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                        }`}
                      >
                        <span dir="ltr" className="inline-block">
                          {m.quantityDelta > 0 ? `+${formatNum(m.quantityDelta)}` : formatNum(m.quantityDelta)}
                        </span>{' '}
                        {m.unit}
                      </td>
                      <td className="px-4 py-2.5 text-white">{m.personName}</td>
                      <td className="px-4 py-2.5 text-[#20C5E8]">{m.counterpartyName || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
