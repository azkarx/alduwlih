import { motion } from 'motion/react';
import React, { useState } from 'react';
import type { NavPage, StockAlert, WarehouseState } from '../types/warehouse';
import { formatNum } from './UiShared';

interface AlertsViewProps {
  state: WarehouseState;
  alerts: StockAlert[];
  isAdmin: boolean;
  onUpdateThreshold: (itemId: string, newThreshold: number) => void;
  onNavigate: (page: NavPage) => void;
}

export const AlertsView: React.FC<AlertsViewProps> = ({
  state,
  alerts,
  isAdmin,
  onUpdateThreshold,
  onNavigate,
}) => {
  const [tab, setTab] = useState<'all' | 'zero' | 'low' | 'over_allocated' | 'thresholds'>('all');
  const [editingThresholds, setEditingThresholds] = useState<Record<string, number>>({});

  const visibleAlerts = alerts.filter((a) => {
    if (tab === 'all' || tab === 'thresholds') return true;
    return a.severity === tab;
  });

  const handleSaveThreshold = (itemId: string, fallback: number) => {
    const val = editingThresholds[itemId] ?? fallback;
    onUpdateThreshold(itemId, Math.max(0, Math.floor(Number(val) || 0)));
  };

  return (
    <div className="space-y-5">
      <div className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'all', label: `الكل (${alerts.length})` },
            { id: 'zero', label: `نفاد (${alerts.filter((a) => a.severity === 'zero').length})` },
            { id: 'low', label: `منخفض (${alerts.filter((a) => a.severity === 'low').length})` },
            {
              id: 'over_allocated',
              label: `عجز (${alerts.filter((a) => a.severity === 'over_allocated').length})`,
            },
            { id: 'thresholds', label: 'حدود التنبيه' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`relative rounded-xl px-3.5 py-2 text-[12.5px] font-semibold transition-all duration-150 active:scale-95 ${
                tab === t.id
                  ? 'text-white'
                  : 'border border-white/10 bg-[#071426]/65 text-[#c1c6d7] hover:border-[#46dafd]/40 hover:bg-[#102947]/70 hover:text-white'
              }`}
            >
              {tab === t.id && (
                <motion.span
                  layoutId="alerts-active-tab"
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  className="absolute inset-0 rounded-xl bg-gradient-to-l from-[#1677FF] to-[#0ea5e9] shadow-md"
                />
              )}
              <span className="relative z-10">{t.label}</span>
            </button>
          ))}
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => onNavigate('stock_in')}
            className="shine-cta inline-flex items-center gap-1.5 rounded-xl bg-[#10B981] px-3.5 py-2 text-[13px] font-bold text-[#002113] shadow-md hover:bg-[#34d399]"
          >
            <span className="material-symbols-outlined text-[18px]">add_box</span>
            توريد سريع
          </button>
        )}
      </div>

      {tab === 'thresholds' ? (
        <div className="glass-card overflow-hidden rounded-2xl">
          <div className="border-b border-white/10 bg-white/5 px-4 py-3 text-[13px] font-semibold text-white">
            حد التنبيه لكل صنف
          </div>
          {state.items.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#8FA6C3]">لا توجد أصناف مسجلة بعد.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-[13px]">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-[12px] text-[#8FA6C3]">
                    <th className="px-4 py-3 font-semibold">الصنف</th>
                    <th className="px-4 py-3 font-semibold">SKU</th>
                    <th className="px-4 py-3 font-semibold">الرصيد</th>
                    <th className="px-4 py-3 font-semibold">الحد الأدنى</th>
                    {isAdmin && <th className="px-4 py-3 font-semibold">تعديل الحد</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {state.items.map((item) => {
                    const draft = editingThresholds[item.id] ?? item.minThreshold;
                    const isTriggered = item.physicalStock <= item.minThreshold;
                    return (
                      <tr key={item.id} className="transition-colors duration-150 hover:bg-[#1677FF]/[0.1] active:bg-[#1677FF]/[0.16]">
                        <td className="px-4 py-3 font-semibold text-white">{item.name}</td>
                        <td dir="ltr" className="px-4 py-3 font-mono text-[12px] text-[#8FA6C3]">
                          {item.sku}
                        </td>
                        <td
                          className={`tabular-nums px-4 py-3 font-bold ${
                            isTriggered ? 'text-[#EF4444]' : 'text-[#10B981]'
                          }`}
                        >
                          {formatNum(item.physicalStock)} {item.unit}
                        </td>
                        <td className="tabular-nums px-4 py-3 text-white">{formatNum(item.minThreshold)}</td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                aria-label={`حد التنبيه لصنف ${item.name}`}
                                value={draft}
                                onChange={(e) =>
                                  setEditingThresholds((prev) => ({
                                    ...prev,
                                    [item.id]: Math.max(0, Number(e.target.value)),
                                  }))
                                }
                                className="tabular-nums h-9 w-24 rounded-xl border border-white/15 bg-[#071426]/65 px-2.5 text-sm text-white outline-none focus:border-[#46dafd]"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveThreshold(item.id, item.minThreshold)}
                                className="shine-cta rounded-xl bg-[#1677FF] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#2F86FF]"
                              >
                                حفظ
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : visibleAlerts.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <span className="material-symbols-outlined text-[42px] text-[#10B981]">verified</span>
          <h3 className="mt-2 text-base font-bold text-white">لا توجد تنبيهات</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visibleAlerts.map((a, idx) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: Math.min(idx * 0.04, 0.2) }}
              className="glass-card-interactive flex flex-col justify-between gap-4 rounded-2xl p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-[11.5px] text-[#8FA6C3]" dir="ltr">
                    {a.itemSku} · {a.rack}
                  </div>
                  <h3 className="mt-0.5 text-[15px] font-bold text-white">{a.itemName}</h3>
                  <p
                    className={`mt-1.5 text-[13px] ${
                      a.severity === 'zero' ? 'text-[#EF4444]' : 'text-[#F59E0B]'
                    }`}
                  >
                    {a.message}
                  </p>
                </div>
                <div className="glass-sub shrink-0 rounded-xl px-3 py-2 text-center">
                  <div className="text-[11px] text-[#8FA6C3]">المتاح</div>
                  <div
                    className={`font-display tabular-nums text-lg font-extrabold ${
                      a.severity === 'zero' ? 'text-[#EF4444]' : 'text-[#F59E0B]'
                    }`}
                  >
                    {formatNum(a.physicalStock)}
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                  <div className="flex items-center gap-2 text-[12px] text-[#c1c6d7]">
                    <span>الحد:</span>
                    <input
                      type="number"
                      min={0}
                      value={editingThresholds[a.itemId] ?? a.minThreshold}
                      onChange={(e) =>
                        setEditingThresholds((prev) => ({
                          ...prev,
                          [a.itemId]: Math.max(0, Number(e.target.value)),
                        }))
                      }
                      className="tabular-nums h-8 w-20 rounded-xl border border-white/15 bg-[#071426]/65 px-2 text-xs text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveThreshold(a.itemId, a.minThreshold)}
                      className="rounded-xl border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-[#20C5E8] hover:border-[#20C5E8] hover:bg-[#20C5E8]/15 active:scale-95"
                    >
                      تطبيق
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('stock_in')}
                    className="shine-cta inline-flex items-center gap-1 rounded-xl bg-[#1677FF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2F86FF]"
                  >
                    <span className="material-symbols-outlined text-[15px]">add_box</span>
                    توريد
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};
