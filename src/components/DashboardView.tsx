import { motion } from 'motion/react';
import React from 'react';
import type { NavPage, StockAlert, WarehouseState } from '../types/warehouse';
import { computeAllItemMetrics, computeCustomerBalances } from '../utils/warehouseLogic';
import { formatDateTime, formatNum, movementMeta } from './UiShared';

interface DashboardViewProps {
  state: WarehouseState;
  alerts: StockAlert[];
  onNavigate: (page: NavPage) => void;
  isAdmin: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  alerts,
  onNavigate,
  isAdmin,
}) => {
  const allMetrics = computeAllItemMetrics(state);
  const totalPhysical = allMetrics.reduce((s, m) => s + m.item.physicalStock, 0);
  const totalAllocated = allMetrics.reduce((s, m) => s + m.allocatedStock, 0);
  const totalFree = totalPhysical - totalAllocated;
  const zeroCount = allMetrics.filter((m) => m.status === 'zero').length;

  const customerBalances = computeCustomerBalances(state)
    .filter((c) => c.totalQuantity > 0)
    .sort((a, b) => b.totalQuantity - a.totalQuantity);

  const dayBuckets: Array<{ label: string; inQty: number; outQty: number }> = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('ar-EG', { weekday: 'short' });
    let inQty = 0;
    let outQty = 0;
    for (const m of state.movements) {
      if (m.createdAt.slice(0, 10) === key) {
        if (m.type === 'stock_in') inQty += Math.abs(m.quantityDelta);
        if (m.type === 'stock_out') outQty += Math.abs(m.quantityDelta);
      }
    }
    dayBuckets.push({ label, inQty, outQty });
  }
  const maxChartVal = Math.max(100, ...dayBuckets.flatMap((b) => [b.inQty, b.outQty]));

  const catTotals = new Map<string, number>();
  for (const m of allMetrics) {
    catTotals.set(m.item.category, (catTotals.get(m.item.category) || 0) + m.item.physicalStock);
  }
  const catEntries = Array.from(catTotals.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5">
      {/* Quick Action Bar */}
      <div className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div>
          <h2 className="text-[16px] font-bold text-white">{state.settings.warehouseName}</h2>
          <p className="mt-0.5 text-[12px] text-[#8FA6C3]">
            {state.items.length} صنف · {state.customers.length} عميل · {state.movements.length} حركة
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => onNavigate('items')}
                className="group inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-[13px] font-semibold text-white hover:-translate-y-0.5 hover:border-[#46dafd]/50 hover:bg-white/10 active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px] transition-transform duration-150 group-hover:scale-110">
                  inventory_2
                </span>
                الأصناف
              </button>
              <button
                type="button"
                onClick={() => onNavigate('stock_in')}
                className="shine-cta inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#1677FF] to-[#0ea5e9] px-3.5 py-2 text-[13px] font-semibold text-white shadow-md"
              >
                <span className="material-symbols-outlined text-[18px]">add_box</span>
                إضافة
              </button>
              <button
                type="button"
                onClick={() => onNavigate('stock_out')}
                className="group inline-flex items-center gap-1.5 rounded-xl border border-[#20C5E8]/40 bg-[#20C5E8]/10 px-3.5 py-2 text-[13px] font-semibold text-[#20C5E8] hover:-translate-y-0.5 hover:border-[#20C5E8] hover:bg-[#20C5E8]/22 hover:shadow-[0_6px_18px_rgba(32,197,232,0.2)] active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px] transition-transform duration-150 group-hover:scale-110">
                  outbox
                </span>
                صرف
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="group inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-[13px] font-medium text-[#d7e3fc] hover:-translate-y-0.5 hover:border-[#46dafd]/45 hover:bg-white/10 hover:text-white active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px] transition-transform duration-150 group-hover:scale-110">
              assessment
            </span>
            التقارير
          </button>
        </div>
      </div>

      {/* 4 Interactive KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <motion.button
          type="button"
          onClick={() => onNavigate('items')}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.03 }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.975 }}
          className="glass-card-interactive group rounded-2xl p-5 text-right hover:border-[#1677FF]/60"
        >
          <div className="flex items-center justify-between text-[13px] text-[#8FA6C3]">
            <span>الرصيد الفعلي</span>
            <span className="material-symbols-outlined text-[#1677FF] transition-transform duration-150 group-hover:scale-115">
              inventory_2
            </span>
          </div>
          <div className="font-display tabular-nums mt-2 text-2xl font-extrabold text-white">
            {formatNum(totalPhysical)}
          </div>
          <div className="mt-1.5 text-[12px] text-[#8FA6C3]">
            {state.items.length} صنف ({zeroCount} صفري)
          </div>
        </motion.button>

        <motion.button
          type="button"
          onClick={() => onNavigate('customers')}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.07 }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.975 }}
          className="glass-card-interactive group rounded-2xl p-5 text-right hover:border-[#20C5E8]/60"
        >
          <div className="flex items-center justify-between text-[13px] text-[#8FA6C3]">
            <span>رصيد العملاء</span>
            <span className="material-symbols-outlined text-[#20C5E8] transition-transform duration-150 group-hover:scale-115">
              groups
            </span>
          </div>
          <div className="font-display tabular-nums mt-2 text-2xl font-extrabold text-[#20C5E8]">
            {formatNum(totalAllocated)}
          </div>
          <div className="mt-1.5 text-[12px] text-[#8FA6C3]">{customerBalances.length} عميل نشط</div>
        </motion.button>

        <motion.button
          type="button"
          onClick={() => onNavigate('items')}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.11 }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.975 }}
          className="glass-card-interactive group rounded-2xl p-5 text-right hover:border-[#10B981]/60"
        >
          <div className="flex items-center justify-between text-[13px] text-[#8FA6C3]">
            <span>الرصيد الحر</span>
            <span className="material-symbols-outlined text-[#10B981] transition-transform duration-150 group-hover:scale-115">
              check_circle
            </span>
          </div>
          <div className="font-display tabular-nums mt-2 text-2xl font-extrabold text-[#10B981]">
            {formatNum(totalFree)}
          </div>
          <div className="mt-1.5 text-[12px] text-[#8FA6C3]">متاح للتخصيص</div>
        </motion.button>

        <motion.button
          type="button"
          onClick={() => onNavigate('alerts')}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.15 }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.975 }}
          className="glass-card-interactive group rounded-2xl p-5 text-right hover:border-[#EF4444]/65"
        >
          <div className="flex items-center justify-between text-[13px] text-[#8FA6C3]">
            <span>التنبيهات</span>
            <span className="material-symbols-outlined text-[#EF4444] transition-transform duration-150 group-hover:scale-115">
              notifications_active
            </span>
          </div>
          <div className="font-display tabular-nums mt-2 text-2xl font-extrabold text-[#EF4444]">
            {formatNum(alerts.length)}
          </div>
          <div className="mt-1.5 text-[12px] text-[#8FA6C3]">
            {alerts.length > 0 ? 'أصناف تحت الحد' : 'الرصيد آمن'}
          </div>
        </motion.button>
      </div>

      {/* Chart + Alerts Row */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="glass-card rounded-2xl p-5 xl:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-[15px] font-bold text-white">الوارد والمنصرف (7 أيام)</h3>
            </div>
            <div className="flex items-center gap-4 text-[12px]">
              <span className="flex items-center gap-1.5 text-[#10B981]">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#10B981]" />
                وارد
              </span>
              <span className="flex items-center gap-1.5 text-[#EF4444]">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#EF4444]" />
                منصرف
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-2 pt-2">
            {dayBuckets.map((b, idx) => {
              const inH = Math.round((b.inQty / maxChartVal) * 130);
              const outH = Math.round((b.outQty / maxChartVal) * 130);
              return (
                <div key={idx} className="group flex flex-col items-center gap-2">
                  <div className="glass-sub-interactive flex h-[146px] w-full items-end justify-center gap-1.5 rounded-xl px-1.5 pb-2 pt-3">
                    <motion.div
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.45, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
                      style={{
                        height: `${Math.max(b.inQty > 0 ? 8 : 2, inH)}px`,
                        transformOrigin: 'bottom',
                      }}
                      title={`وارد: ${formatNum(b.inQty)}`}
                      className="w-3 rounded-t bg-[#10B981] transition-all duration-150 group-hover:brightness-115 group-hover:shadow-[0_0_12px_rgba(16,185,129,0.45)]"
                    />
                    <motion.div
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.45, delay: idx * 0.04 + 0.03, ease: [0.22, 1, 0.36, 1] }}
                      style={{
                        height: `${Math.max(b.outQty > 0 ? 8 : 2, outH)}px`,
                        transformOrigin: 'bottom',
                      }}
                      title={`منصرف: ${formatNum(b.outQty)}`}
                      className="w-3 rounded-t bg-[#EF4444] transition-all duration-150 group-hover:brightness-115 group-hover:shadow-[0_0_12px_rgba(239,68,68,0.45)]"
                    />
                  </div>
                  <div className="text-[11px] text-[#8FA6C3] transition-colors group-hover:text-white">
                    {b.label}
                  </div>
                  <div dir="ltr" className="tabular-nums text-[10px] text-[#c1c6d7]">
                    +{formatNum(b.inQty)} / -{formatNum(b.outQty)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 xl:col-span-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-white">الأصناف الحرجة</h3>
            <button
              type="button"
              onClick={() => onNavigate('alerts')}
              className="rounded-lg px-2 py-0.5 text-[12px] font-medium text-[#20C5E8] hover:bg-[#20C5E8]/15 hover:underline active:scale-95"
            >
              الكل
            </button>
          </div>
          <div className="mt-4 space-y-2.5">
            {alerts.length === 0 ? (
              <div className="glass-sub rounded-xl p-6 text-center text-[13px] text-[#8FA6C3]">
                لا توجد تنبيهات حالياً.
              </div>
            ) : (
              alerts.slice(0, 5).map((a) => (
                <div
                  key={a.id}
                  className="glass-sub-interactive flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-white">{a.itemName}</div>
                    <div className="mt-0.5 text-[11.5px] text-[#8FA6C3]">
                      <span dir="ltr" className="font-mono">{a.itemSku}</span> · الحد {formatNum(a.minThreshold)}
                    </div>
                  </div>
                  <div className="shrink-0 text-left">
                    <div
                      className={`tabular-nums text-[13px] font-bold ${
                        a.severity === 'zero' ? 'text-[#EF4444]' : 'text-[#F59E0B]'
                      }`}
                    >
                      {formatNum(a.physicalStock)} {a.unit}
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => onNavigate('stock_in')}
                        className="mt-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[#46dafd] hover:bg-[#1677FF]/20 hover:text-white active:scale-90"
                      >
                        توريد
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Movements + Category Distribution */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="glass-card rounded-2xl p-5 xl:col-span-8">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-white">أحدث الحركات</h3>
            <button
              type="button"
              onClick={() => onNavigate('movements')}
              className="rounded-lg px-2 py-0.5 text-[12px] font-medium text-[#20C5E8] hover:bg-[#20C5E8]/15 hover:underline active:scale-95"
            >
              السجل الكامل
            </button>
          </div>
          {state.movements.length === 0 ? (
            <div className="glass-sub rounded-xl p-8 text-center text-[13px] text-[#8FA6C3]">
              لا توجد حركات مسجلة بعد.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-[13px]">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-[12px] text-[#8FA6C3]">
                    <th className="px-3 py-2.5 font-semibold">التاريخ</th>
                    <th className="px-3 py-2.5 font-semibold">الحركة</th>
                    <th className="px-3 py-2.5 font-semibold">الصنف</th>
                    <th className="px-3 py-2.5 font-semibold">الكمية</th>
                    <th className="px-3 py-2.5 font-semibold">المسؤول</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {state.movements.slice(0, 5).map((m) => {
                    const meta = movementMeta(m.type);
                    return (
                      <tr
                        key={m.id}
                        className="transition-colors duration-150 hover:bg-[#1677FF]/[0.1] active:bg-[#1677FF]/[0.18]"
                      >
                        <td className="px-3 py-2.5 text-[12px] text-[#8FA6C3]">{formatDateTime(m.createdAt)}</td>
                        <td className={`px-3 py-2.5 font-medium ${meta.colorClass}`}>{meta.label}</td>
                        <td className="px-3 py-2.5 text-white">
                          {m.itemName}
                          <span className="mr-1.5 font-mono text-[11px] text-[#8FA6C3]" dir="ltr">
                            {m.itemSku}
                          </span>
                        </td>
                        <td
                          className={`tabular-nums px-3 py-2.5 font-bold ${
                            m.quantityDelta > 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                          }`}
                        >
                          <span dir="ltr" className="inline-block">
                            {m.quantityDelta > 0 ? `+${formatNum(m.quantityDelta)}` : formatNum(m.quantityDelta)}
                          </span>{' '}
                          {m.unit}
                        </td>
                        <td className="px-3 py-2.5 text-[#d7e3fc]">{m.personName}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="glass-card rounded-2xl p-5 xl:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-white">الفئات</h3>
            <button
              type="button"
              onClick={() => onNavigate('items')}
              className="rounded-lg px-2 py-0.5 text-[12px] font-medium text-[#20C5E8] hover:bg-[#20C5E8]/15 hover:underline active:scale-95"
            >
              الأصناف
            </button>
          </div>
          {catEntries.length === 0 ? (
            <div className="glass-sub rounded-xl p-8 text-center text-[13px] text-[#8FA6C3]">
              لم تُضف أصناف بعد.
            </div>
          ) : (
            <div className="space-y-3">
              {catEntries.slice(0, 6).map(([cat, qty], idx) => {
                const pct = totalPhysical > 0 ? Math.round((qty / totalPhysical) * 100) : 0;
                return (
                  <div
                    key={cat}
                    className="rounded-xl p-2 -mx-2 transition-colors duration-150 hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="text-[#d7e3fc]">{cat}</span>
                      <span className="tabular-nums font-semibold text-white">
                        {formatNum(qty)} ({pct}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.45, delay: idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full rounded-full bg-gradient-to-l from-[#1677FF] to-[#20C5E8]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
