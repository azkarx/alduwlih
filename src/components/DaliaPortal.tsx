import { motion } from 'motion/react';
import React, { useMemo, useState } from 'react';
import warehouseLogoImg from '../assets/images/alduwlih_emblem_logo_1795096287883.jpg';
import type { SupabaseSyncStatus } from '../services/storageService';
import type { StockAlert, WarehouseState, WarehouseUser } from '../types/warehouse';
import { computeAllItemMetrics, computeCustomerBalances } from '../utils/warehouseLogic';
import { formatDateTime, formatNum, movementMeta } from './UiShared';

interface DaliaPortalProps {
  state: WarehouseState;
  alerts: StockAlert[];
  user: WarehouseUser;
  syncStatus: SupabaseSyncStatus;
  onLogout: () => void;
}

type DaliaTab = 'items' | 'customers' | 'movements' | 'alerts';

export const DaliaPortal: React.FC<DaliaPortalProps> = ({
  state,
  alerts,
  user: _user,
  syncStatus: _syncStatus,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<DaliaTab>('items');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    state.customers[0]?.id || ''
  );

  const allMetrics = useMemo(() => computeAllItemMetrics(state), [state]);
  const customerSummaries = useMemo(() => computeCustomerBalances(state), [state]);

  const totalPhysical = allMetrics.reduce((s, m) => s + m.item.physicalStock, 0);
  const totalAllocated = allMetrics.reduce((s, m) => s + m.allocatedStock, 0);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allMetrics.filter((m) => {
      if (categoryFilter !== 'all' && m.item.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        m.item.name.toLowerCase().includes(q) ||
        m.item.sku.toLowerCase().includes(q) ||
        m.item.color.toLowerCase().includes(q) ||
        m.item.rack.toLowerCase().includes(q)
      );
    });
  }, [allMetrics, search, categoryFilter]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customerSummaries;
    return customerSummaries.filter(
      (c) =>
        c.customer.name.toLowerCase().includes(q) ||
        c.customer.code.toLowerCase().includes(q) ||
        c.customer.productionLine.toLowerCase().includes(q)
    );
  }, [customerSummaries, search]);

  const activeCustomer =
    customerSummaries.find((c) => c.customer.id === selectedCustomerId) ||
    filteredCustomers[0] ||
    null;

  const filteredMovements = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.movements;
    return state.movements.filter(
      (m) =>
        m.itemName.toLowerCase().includes(q) ||
        m.itemSku.toLowerCase().includes(q) ||
        m.personName.toLowerCase().includes(q) ||
        (m.counterpartyName || '').toLowerCase().includes(q)
    );
  }, [state.movements, search]);

  const tabs: Array<{ id: DaliaTab; label: string; icon: string; count?: number }> = [
    { id: 'items', label: 'الأصناف بالمخزن', icon: 'inventory_2', count: state.items.length },
    { id: 'customers', label: 'العملاء وأرصدتهم', icon: 'groups', count: state.customers.length },
    { id: 'movements', label: 'سجل الحركات', icon: 'history', count: state.movements.length },
    { id: 'alerts', label: 'التنبيهات', icon: 'notifications_active', count: alerts.length },
  ];

  return (
    <div className="dalia-aurora-bg min-h-screen text-[#f5eefc]">
      {/* Top Luxury Glass Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#140920]/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 md:px-6">
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ scale: 1.08, rotate: -4 }}
              whileTap={{ scale: 0.94 }}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-[#f472b6]/45 bg-[#140920] shadow-lg transition-shadow hover:shadow-[0_0_24px_rgba(236,72,153,0.45)]"
            >
              <img
                src={warehouseLogoImg}
                alt={state.settings.warehouseName}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </motion.div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-[17px] font-extrabold text-white md:text-[19px]">
                  {state.settings.warehouseName}
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-[12.5px] font-semibold text-[#fbcfe8] transition-all duration-150 hover:-translate-y-0.5 hover:border-[#f472b6]/60 hover:bg-[#ec4899]/25 hover:text-white hover:shadow-[0_8px_20px_rgba(236,72,153,0.28)] active:scale-95"
            >
              <span className="material-symbols-outlined text-[17px]">logout</span>
              <span>خروج</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
        {/* Animated Interactive Summary Strip */}
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {[
            {
              tab: 'items' as DaliaTab,
              title: 'الأصناف بالمخزن',
              value: formatNum(state.items.length),
              sub: `${formatNum(totalPhysical)} وحدة إجمالية`,
              icon: 'inventory_2',
              accent: 'from-[#f472b6]/25 to-[#ec4899]/10 text-[#f9a8d4]',
            },
            {
              tab: 'customers' as DaliaTab,
              title: 'أرصدة العملاء',
              value: formatNum(totalAllocated),
              sub: `${state.customers.length} عميل مسجل`,
              icon: 'groups',
              accent: 'from-[#c084fc]/25 to-[#a855f7]/10 text-[#e9d5ff]',
            },
            {
              tab: 'movements' as DaliaTab,
              title: 'الحركات المسجلة',
              value: formatNum(state.movements.length),
              sub: 'سجل زمني كامل',
              icon: 'history',
              accent: 'from-[#fcd34d]/20 to-[#f59e0b]/10 text-[#fde68a]',
            },
            {
              tab: 'alerts' as DaliaTab,
              title: 'التنبيهات النشطة',
              value: formatNum(alerts.length),
              sub: alerts.length > 0 ? 'تحتاج مراجعة' : 'الرصيد آمن',
              icon: 'notifications_active',
              accent:
                alerts.length > 0
                  ? 'from-[#fb7185]/30 to-[#e11d48]/10 text-[#fda4af]'
                  : 'from-[#34d399]/25 to-[#10b981]/10 text-[#6ee7b7]',
            },
          ].map((card, idx) => (
            <motion.button
              key={card.title}
              type="button"
              onClick={() => {
                setActiveTab(card.tab);
                setSearch('');
              }}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: idx * 0.06 }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.97 }}
              className={`dalia-card-interactive group cursor-pointer rounded-2xl p-4 text-right ${
                activeTab === card.tab
                  ? 'border-[#f472b6]/55 shadow-[0_12px_32px_rgba(236,72,153,0.22)] ring-1 ring-[#f472b6]/30'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-[#e9d5ff]/80 transition-colors group-hover:text-white">
                  {card.title}
                </span>
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-3 ${card.accent}`}
                >
                  <span className="material-symbols-outlined text-[19px]">{card.icon}</span>
                </div>
              </div>
              <div className="font-display tabular-nums mt-2 text-2xl font-extrabold text-white">{card.value}</div>
              <div className="mt-1 text-[11.5px] text-[#d8b4fe]/75">{card.sub}</div>
            </motion.button>
          ))}
        </div>

        {/* Glass Navigation Tabs + Search */}
        <div className="glass-dalia flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  type="button"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSearch('');
                  }}
                  className={`relative inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-colors duration-150 ${
                    active ? 'text-white' : 'text-[#e9d5ff]/75 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="dalia-active-pill"
                      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                      className="absolute inset-0 rounded-xl border border-[#f472b6]/45 bg-gradient-to-l from-[#ec4899]/35 to-[#a855f7]/35 shadow-inner"
                    />
                  )}
                  <span className="material-symbols-outlined relative z-10 text-[18px]">{tab.icon}</span>
                  <span className="relative z-10">{tab.label}</span>
                  {typeof tab.count === 'number' && (
                    <span className="tabular-nums relative z-10 rounded-full bg-white/10 px-2 py-0.5 text-[11px]">
                      {tab.count}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>

          {activeTab !== 'alerts' && (
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <div className="relative min-w-[210px] flex-1 sm:max-w-xs">
                <span className="material-symbols-outlined pointer-events-none absolute right-3 top-2.5 text-[18px] text-[#d8b4fe]">
                  search
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث سريع..."
                  className="h-10 w-full rounded-xl border border-white/15 bg-[#140920]/60 pr-9 pl-3 text-sm text-white placeholder-[#d8b4fe]/50 outline-none transition-all duration-150 hover:border-[#f472b6]/40 focus:border-[#f472b6] focus:shadow-[0_0_0_3px_rgba(244,114,182,0.16)]"
                />
              </div>
              {activeTab === 'items' && (
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label="تصفية الفئة"
                  className="h-10 cursor-pointer rounded-xl border border-white/15 bg-[#140920]/70 px-3 text-sm text-white outline-none transition-all duration-150 hover:border-[#f472b6]/40 focus:border-[#f472b6] focus:shadow-[0_0_0_3px_rgba(244,114,182,0.16)]"
                >
                  <option value="all">كل الفئات</option>
                  {state.settings.categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Animated Content Panels */}
        {activeTab === 'items' && (
          <motion.div
            key="items"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
          >
              {filteredItems.length === 0 ? (
                <div className="glass-dalia rounded-2xl p-12 text-center">
                  <span className="material-symbols-outlined text-[42px] text-[#f9a8d4]">inventory_2</span>
                  <h3 className="mt-2 text-base font-bold text-white">المخزن فارغ حالياً</h3>
                  <p className="mt-1 text-sm text-[#d8b4fe]/75">
                    لم يتم إضافة أي إكسسوارات بعد.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredItems.map((m, idx) => (
                    <motion.div
                      key={m.item.id}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.24, delay: Math.min(idx * 0.03, 0.25) }}
                      whileHover={{ y: -4 }}
                      whileTap={{ scale: 0.985 }}
                      className="dalia-card-interactive group flex flex-col justify-between rounded-2xl p-4"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span dir="ltr" className="font-mono text-[11.5px] text-[#f9a8d4]">
                            {m.item.sku} · {m.item.rack}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-transform duration-150 group-hover:scale-105 ${
                              m.status === 'zero'
                                ? 'bg-[#fb7185]/20 text-[#fda4af]'
                                : m.status === 'low' || m.status === 'over_allocated'
                                ? 'bg-[#fcd34d]/20 text-[#fde68a]'
                                : 'bg-[#34d399]/20 text-[#6ee7b7]'
                            }`}
                          >
                            {m.status === 'zero'
                              ? 'نفاد'
                              : m.status === 'low'
                              ? 'منخفض'
                              : m.status === 'over_allocated'
                              ? 'عجز'
                              : 'متاح'}
                          </span>
                        </div>
                        <h3 className="font-display mt-2 text-[15px] font-bold text-white transition-colors group-hover:text-[#f9a8d4]">
                          {m.item.name}
                        </h3>
                        <p className="mt-0.5 text-[12px] text-[#d8b4fe]/80">
                          {m.item.category}
                          {m.item.color ? ` · ${m.item.color}` : ''}
                          {m.item.sizeSpec ? ` · ${m.item.sizeSpec}` : ''}
                        </p>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center">
                        <div className="rounded-xl border border-transparent bg-white/5 p-2 transition-all duration-150 hover:border-[#f472b6]/30 hover:bg-white/10">
                          <div className="text-[10.5px] text-[#d8b4fe]/75">الفعلي</div>
                          <div className="font-display tabular-nums mt-0.5 text-sm font-bold text-white">
                            {formatNum(m.item.physicalStock)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-transparent bg-white/5 p-2 transition-all duration-150 hover:border-[#f472b6]/30 hover:bg-white/10">
                          <div className="text-[10.5px] text-[#d8b4fe]/75">للعملاء</div>
                          <div className="font-display tabular-nums mt-0.5 text-sm font-bold text-[#f9a8d4]">
                            {formatNum(m.allocatedStock)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-transparent bg-white/5 p-2 transition-all duration-150 hover:border-[#34d399]/35 hover:bg-white/10">
                          <div className="text-[10.5px] text-[#d8b4fe]/75">الحر</div>
                          <div className="font-display tabular-nums mt-0.5 text-sm font-bold text-[#6ee7b7]">
                            {formatNum(m.freeStock)}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'customers' && (
            <motion.div
              key="customers"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              {filteredCustomers.length === 0 ? (
                <div className="glass-dalia rounded-2xl p-12 text-center">
                  <span className="material-symbols-outlined text-[42px] text-[#c084fc]">groups</span>
                  <h3 className="mt-2 text-base font-bold text-white">لا يوجد عملاء مسجلون</h3>
                  <p className="mt-1 text-sm text-[#d8b4fe]/75">
                    ستظهر أرصدة العملاء وإكسسواراتهم هنا فور إضافتها.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                  <div className="space-y-2.5 lg:col-span-5">
                    {filteredCustomers.map((cs) => {
                      const active = activeCustomer?.customer.id === cs.customer.id;
                      return (
                        <button
                          key={cs.customer.id}
                          type="button"
                          onClick={() => setSelectedCustomerId(cs.customer.id)}
                          className={`group flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border p-4 text-right backdrop-blur-xl transition-all duration-200 active:scale-[0.985] active:border-[#f472b6]/85 active:bg-[#ec4899]/25 active:shadow-[0_6px_20px_rgba(236,72,153,0.28)] ${
                            active
                              ? 'border-[#f472b6]/75 bg-gradient-to-l from-[#ec4899]/25 to-[#a855f7]/20 shadow-[0_12px_32px_rgba(236,72,153,0.26),inset_0_1px_0_rgba(255,255,255,0.18)] ring-1 ring-[#f472b6]/35 hover:border-[#f472b6]/90 hover:from-[#ec4899]/32 hover:to-[#a855f7]/28'
                              : 'border-white/15 bg-white/[0.06] shadow-[0_14px_40px_rgba(8,3,18,0.45),inset_0_1px_0_rgba(255,255,255,0.12)] hover:-translate-y-0.5 hover:border-[#f472b6]/55 hover:bg-white/[0.12] hover:shadow-[0_16px_36px_rgba(236,72,153,0.18),inset_0_1px_0_rgba(255,255,255,0.2)]'
                          }`}
                        >
                          <div>
                            <div dir="ltr" className="inline-block font-mono text-[11px] text-[#f9a8d4]">
                              {cs.customer.code}
                            </div>
                            <div className="text-[15px] font-bold text-white">{cs.customer.name}</div>
                            <div className="mt-1 text-[11.5px] text-[#d8b4fe]/75">{cs.itemsCount} صنف</div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {cs.unitTotals.length === 0 ? (
                              <span className="tabular-nums text-base font-bold text-[#fde68a]">0</span>
                            ) : (
                              cs.unitTotals.map((u) => (
                                <span
                                  key={u.unit}
                                  className="tabular-nums rounded-lg border border-[#fde68a]/30 bg-[#fde68a]/10 px-2 py-0.5 text-xs font-bold text-[#fde68a]"
                                >
                                  {formatNum(u.total)} {u.unit}
                                </span>
                              ))
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="glass-dalia rounded-2xl p-5 lg:col-span-7">
                    {activeCustomer && (
                      <div className="space-y-4">
                        <div className="border-b border-white/10 pb-3">
                          <div dir="ltr" className="font-mono text-xs text-[#f9a8d4]">
                            {activeCustomer.customer.code}
                          </div>
                          <h3 className="font-display text-lg font-extrabold text-white">
                            {activeCustomer.customer.name}
                          </h3>
                          {activeCustomer.unitTotals.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-2">
                              {activeCustomer.unitTotals.map((u) => (
                                <span
                                  key={u.unit}
                                  className="tabular-nums rounded-lg border border-[#f472b6]/35 bg-[#ec4899]/15 px-2.5 py-1 text-xs font-bold text-[#f9a8d4] transition-all duration-150 hover:-translate-y-0.5 hover:border-[#f472b6]/60 hover:bg-[#ec4899]/25"
                                >
                                  {formatNum(u.total)} {u.unit}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {activeCustomer.allocations.length === 0 ? (
                          <div className="rounded-xl bg-white/5 p-6 text-center text-sm text-[#d8b4fe]/75">
                            لا توجد إكسسوارات مخصصة لهذا العميل حالياً.
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {activeCustomer.allocations.map(({ allocation, item }) => (
                              <div
                                key={allocation.id}
                                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3.5 transition-all duration-150 hover:border-[#f472b6]/45 hover:bg-white/10 active:scale-[0.99]"
                              >
                                <div>
                                  <div className="font-semibold text-white">{item.name}</div>
                                  <div className="mt-0.5 text-xs text-[#d8b4fe]/75">
                                    <span dir="ltr" className="font-mono">{item.sku}</span> · الرف {item.rack}
                                  </div>
                                </div>
                                <div className="font-display tabular-nums text-base font-bold text-[#f9a8d4]">
                                  {formatNum(allocation.quantity)} {item.unit}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'movements' && (
            <motion.div
              key="movements"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="glass-dalia overflow-hidden rounded-2xl"
            >
              {filteredMovements.length === 0 ? (
                <div className="p-12 text-center">
                  <span className="material-symbols-outlined text-[42px] text-[#fde68a]">history</span>
                  <h3 className="mt-2 text-base font-bold text-white">لا توجد حركات مسجلة</h3>
                  <p className="mt-1 text-sm text-[#d8b4fe]/75">
                    سيظهر سجل الإضافة والصرف هنا بالوقت واسم المسؤول.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-[13px]">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5 text-[12px] text-[#e9d5ff]">
                        <th className="px-4 py-3 font-semibold">التاريخ والوقت</th>
                        <th className="px-4 py-3 font-semibold">العملية</th>
                        <th className="px-4 py-3 font-semibold">الصنف</th>
                        <th className="px-4 py-3 font-semibold">الكمية</th>
                        <th className="px-4 py-3 font-semibold">المسؤول</th>
                        <th className="px-4 py-3 font-semibold">الجهة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {filteredMovements.map((m) => {
                        const meta = movementMeta(m.type);
                        return (
                          <tr
                            key={m.id}
                            className="transition-colors duration-150 hover:bg-[#ec4899]/[0.1] active:bg-[#ec4899]/[0.18]"
                          >
                            <td className="px-4 py-3 text-xs text-[#d8b4fe]/80">
                              {formatDateTime(m.createdAt)}
                            </td>
                            <td className={`px-4 py-3 font-semibold ${meta.colorClass}`}>{meta.label}</td>
                            <td className="px-4 py-3 font-medium text-white">{m.itemName}</td>
                            <td
                              className={`tabular-nums px-4 py-3 font-bold ${
                                m.quantityDelta > 0 ? 'text-[#6ee7b7]' : 'text-[#fda4af]'
                              }`}
                            >
                              <span dir="ltr" className="inline-block">
                                {m.quantityDelta > 0 ? `+${formatNum(m.quantityDelta)}` : formatNum(m.quantityDelta)}
                              </span>{' '}
                              {m.unit}
                            </td>
                            <td className="px-4 py-3 text-white">{m.personName}</td>
                            <td className="px-4 py-3 text-[#f9a8d4]">{m.counterpartyName || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'alerts' && (
            <motion.div
              key="alerts"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              {alerts.length === 0 ? (
                <div className="glass-dalia rounded-2xl p-12 text-center">
                  <span className="material-symbols-outlined text-[42px] text-[#6ee7b7]">verified</span>
                  <h3 className="mt-2 text-base font-bold text-white">لا توجد تنبيهات</h3>
                  <p className="mt-1 text-sm text-[#d8b4fe]/75">كل الأصناف في المستوى الآمن.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {alerts.map((a, idx) => (
                    <motion.div
                      key={a.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, delay: Math.min(idx * 0.04, 0.2) }}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.985 }}
                      className="dalia-card-interactive flex items-center justify-between gap-4 rounded-2xl p-4"
                    >
                      <div>
                        <div dir="ltr" className="font-mono text-xs text-[#f9a8d4]">
                          {a.itemSku} · {a.rack}
                        </div>
                        <h3 className="font-display mt-1 text-[15px] font-bold text-white">{a.itemName}</h3>
                        <p className="mt-1 text-xs text-[#fde68a]">{a.message}</p>
                      </div>
                      <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-center">
                        <div className="text-[10.5px] text-[#d8b4fe]/80">المتاح</div>
                        <div className="font-display tabular-nums text-lg font-extrabold text-[#fda4af]">
                          {formatNum(a.physicalStock)}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
      </main>
    </div>
  );
};
