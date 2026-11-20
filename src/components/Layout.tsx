import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';
import warehouseLogoImg from '../assets/images/alduwlih_emblem_logo_1795096287883.jpg';
import type { SupabaseSyncStatus } from '../services/storageService';
import type { NavPage, StockAlert, WarehouseSettings, WarehouseUser } from '../types/warehouse';
import { USER_AVATARS } from '../utils/userAvatars';
import { formatNum } from './UiShared';

interface LayoutProps {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  user: WarehouseUser;
  onLogout: () => void;
  settings: WarehouseSettings;
  alerts: StockAlert[];
  totalPhysicalStock: number;
  syncStatus: SupabaseSyncStatus;
  children: React.ReactNode;
}

interface NavItemDef {
  id: NavPage;
  label: string;
  icon: string;
  section?: string;
}

const NAV_ITEMS: NavItemDef[] = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: 'dashboard', section: 'المتابعة' },
  { id: 'items', label: 'الأصناف', icon: 'inventory_2' },
  { id: 'customers', label: 'العملاء', icon: 'groups' },
  { id: 'stock_in', label: 'إضافة مخزون', icon: 'add_box', section: 'الحركات' },
  { id: 'stock_out', label: 'صرف مخزون', icon: 'outbox' },
  { id: 'movements', label: 'سجل الحركات', icon: 'history' },
  { id: 'alerts', label: 'التنبيهات', icon: 'notifications_active', section: 'التقارير' },
  { id: 'reports', label: 'التقارير والواتساب', icon: 'assessment' },
  { id: 'users', label: 'المستخدمون', icon: 'manage_accounts', section: 'الإدارة' },
  { id: 'settings', label: 'الإعدادات', icon: 'settings' },
];

const PAGE_TITLES: Record<NavPage, { crumb: string; title: string }> = {
  dashboard: { crumb: 'الرئيسية', title: 'لوحة التحكم' },
  items: { crumb: 'المخزون', title: 'أصناف الإكسسوارات' },
  customers: { crumb: 'العملاء', title: 'أرصدة العملاء' },
  stock_in: { crumb: 'الوارد', title: 'إضافة مخزون' },
  stock_out: { crumb: 'المنصرف', title: 'صرف مخزون' },
  movements: { crumb: 'السجل', title: 'سجل الحركات' },
  alerts: { crumb: 'التنبيهات', title: 'تنبيهات انخفاض الرصيد' },
  reports: { crumb: 'التقارير', title: 'التقارير والواتساب' },
  users: { crumb: 'المستخدمون', title: 'إدارة الحسابات' },
  settings: { crumb: 'النظام', title: 'إعدادات المخزن والربط السحابي' },
};

export const Layout: React.FC<LayoutProps> = ({
  activePage,
  onNavigate,
  user,
  onLogout,
  settings,
  alerts,
  totalPhysicalStock,
  syncStatus,
  children,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString('en-GB', { hour12: false })
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date().toLocaleTimeString('en-GB', { hour12: false }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!bellOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBellOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [bellOpen]);

  const occupancyPct =
    settings.capacity > 0
      ? Math.min(100, Math.round((totalPhysicalStock / settings.capacity) * 100))
      : 0;

  const pageMeta = PAGE_TITLES[activePage];

  return (
    <div className="admin-aurora-bg min-h-screen text-[#d7e3fc] lg:flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Fixed RTL Right Glass Sidebar */}
      <aside
        className={`glass-panel fixed inset-y-0 right-0 z-40 flex w-[258px] shrink-0 flex-col border-l transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <motion.div
              whileHover={{ scale: 1.07, rotate: -3 }}
              whileTap={{ scale: 0.94 }}
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#46dafd]/45 bg-[#071426] shadow-[0_0_18px_rgba(32,197,232,0.22)]"
            >
              <img
                src={warehouseLogoImg}
                alt={settings.warehouseName}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </motion.div>
            <div className="min-w-0">
              <div className="font-display truncate text-[15px] font-bold text-white">{settings.warehouseName}</div>
              <div className="truncate text-[11px] text-[#8FA6C3]">{settings.warehouseSubtitle}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="إغلاق القائمة"
            className="rounded-lg p-1.5 text-[#8FA6C3] hover:bg-white/10 hover:text-white active:scale-90 lg:hidden"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="glass-sub-interactive mx-3 mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[11.5px]">
          <span
            className={`material-symbols-outlined text-[16px] ${
              syncStatus.connected ? 'text-[#10B981]' : 'text-[#20C5E8]'
            }`}
          >
            {syncStatus.connected ? 'cloud_done' : 'database'}
          </span>
          <span className="truncate text-[#c1c6d7]">
            {syncStatus.connected ? 'متصل بـ Supabase' : 'حفظ محلي + سحابي'}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="التنقل الرئيسي">
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id;
            const showAlertBadge = item.id === 'alerts' && alerts.length > 0;
            return (
              <React.Fragment key={item.id}>
                {item.section && (
                  <div className="mt-3 mb-1.5 px-2 text-[10.5px] font-semibold text-[#6f86a6] first:mt-0">
                    {item.section}
                  </div>
                )}
                <motion.button
                  type="button"
                  whileHover={isActive ? undefined : { x: -3 }}
                  whileTap={{ scale: 0.965 }}
                  onClick={() => {
                    onNavigate(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`group relative mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150 ${
                    isActive
                      ? 'text-white'
                      : 'text-[#c1c6d7] hover:bg-white/10 hover:text-white active:bg-white/15'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="admin-active-nav"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      className="absolute inset-0 rounded-xl bg-gradient-to-l from-[#1677FF] to-[#0ea5e9] shadow-[0_8px_22px_rgba(22,119,255,0.35)]"
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[19px] transition-transform duration-150 group-hover:scale-110">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </span>
                  {showAlertBadge && (
                    <span
                      className={`tabular-nums relative z-10 rounded-full px-2 py-0.5 text-[11px] font-bold transition-transform duration-150 group-hover:scale-105 ${
                        isActive ? 'bg-white text-[#1677FF]' : 'bg-[#EF4444] text-white'
                      }`}
                    >
                      {alerts.length}
                    </span>
                  )}
                </motion.button>
              </React.Fragment>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="glass-sub-interactive rounded-xl p-3">
            <div className="flex items-center justify-between text-[11.5px] text-[#8FA6C3]">
              <span>السعة</span>
              <span className="tabular-nums font-semibold text-white">{occupancyPct}%</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${occupancyPct}%` }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                className={`h-full rounded-full ${
                  occupancyPct >= 90 ? 'bg-[#EF4444]' : occupancyPct >= 75 ? 'bg-[#F59E0B]' : 'bg-[#20C5E8]'
                }`}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#8FA6C3]">
              <span className="tabular-nums text-white">{formatNum(totalPhysicalStock)}</span>
              <span className="tabular-nums">{formatNum(settings.capacity)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[13px] font-medium text-[#d7e3fc] hover:-translate-y-0.5 hover:border-[#EF4444]/55 hover:bg-[#EF4444]/15 hover:text-[#ffdad6] hover:shadow-[0_6px_18px_rgba(239,68,68,0.2)] active:scale-[0.97]"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-panel sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="فتح القائمة"
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white hover:border-[#46dafd]/40 hover:bg-white/10 active:scale-95 lg:hidden"
            >
              <span className="material-symbols-outlined text-[20px]">menu</span>
            </button>
            <div className="min-w-0">
              <div className="text-[11px] text-[#8FA6C3]">
                {settings.warehouseName} / {pageMeta.crumb}
              </div>
              <h1 className="truncate text-[16px] font-extrabold text-white md:text-[18px]">
                {pageMeta.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <span
              dir="ltr"
              className="glass-sub-interactive hidden rounded-xl px-2.5 py-1.5 font-mono text-[12px] text-[#8FA6C3] tabular-nums md:inline-flex"
            >
              {clock}
            </span>

            {/* Alerts Bell Dropdown */}
            <div ref={bellRef} className="relative">
              <button
                type="button"
                onClick={() => setBellOpen((prev) => !prev)}
                aria-label="تنبيهات نقص المخزون"
                className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#d7e3fc] hover:-translate-y-0.5 hover:border-[#46dafd]/50 hover:bg-white/12 hover:text-white active:scale-90"
              >
                <span className="material-symbols-outlined text-[20px]">notifications</span>
                {alerts.length > 0 && (
                  <span className="tabular-nums absolute -top-1.5 -left-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-bold text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                    {alerts.length}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {bellOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.96 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                    className="glass-card absolute left-0 top-11 z-40 w-72 rounded-2xl p-3 shadow-2xl"
                  >
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <span className="text-[13px] font-bold text-white">التنبيهات ({alerts.length})</span>
                      <button
                        type="button"
                        onClick={() => {
                          setBellOpen(false);
                          onNavigate('alerts');
                        }}
                        className="rounded-lg px-2 py-0.5 text-[12px] font-medium text-[#20C5E8] hover:bg-[#20C5E8]/15 hover:underline active:scale-95"
                      >
                        عرض الكل
                      </button>
                    </div>
                    <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
                      {alerts.length === 0 ? (
                        <div className="py-4 text-center text-[12.5px] text-[#8FA6C3]">
                          لا توجد تنبيهات حالياً.
                        </div>
                      ) : (
                        alerts.slice(0, 5).map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              setBellOpen(false);
                              onNavigate('alerts');
                            }}
                            className="glass-sub-interactive w-full rounded-xl p-2.5 text-right"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[12.5px] font-semibold text-white">
                                {a.itemName}
                              </span>
                              <span
                                className={`tabular-nums text-[11px] font-bold ${
                                  a.severity === 'zero' ? 'text-[#EF4444]' : 'text-[#F59E0B]'
                                }`}
                              >
                                {formatNum(a.physicalStock)} {a.unit}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-[#8FA6C3]">
                              الحد: {formatNum(a.minThreshold)} · {a.rack}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Admin User Badge */}
            <div className="glass-sub-interactive flex items-center gap-2 rounded-xl px-2.5 py-1.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#46dafd]/60 bg-[#1677FF]/25 text-[12px] font-bold text-[#afc6ff] shadow-[0_0_12px_rgba(32,197,232,0.22)]">
                {!avatarFailed ? (
                  <img
                    src={USER_AVATARS.mohamed}
                    alt="محمد رضا"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="h-full w-full object-cover object-[50%_20%]"
                  />
                ) : (
                  'م'
                )}
              </div>
              <div className="hidden text-right sm:block">
                <div className="max-w-[130px] truncate text-[12px] font-semibold text-white">
                  محمد رضا
                </div>
                <div className="text-[10.5px] text-[#8FA6C3]">مدير النظام</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden p-4 md:p-6">
          <motion.div
            key={activePage}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
};
