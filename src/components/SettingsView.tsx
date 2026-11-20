import { motion } from 'motion/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  pullStateFromSupabase,
  syncStateToSupabase,
  testSupabaseConnection,
  verifyAdminPassword,
  type SupabaseSyncStatus,
} from '../services/storageService';
import type { StockAlert, WarehouseSettings, WarehouseState, WarehouseUser } from '../types/warehouse';
import { exportBackupJson } from '../utils/exportUtils';
import { parseWarehouseBackupJson } from '../utils/warehouseLogic';
import { ConfirmModal, formatNum } from './UiShared';

interface SettingsViewProps {
  state: WarehouseState;
  currentUser: WarehouseUser;
  alerts: StockAlert[];
  syncStatus: SupabaseSyncStatus;
  isAdmin: boolean;
  onUpdateSettings: (next: WarehouseSettings) => void;
  onReplaceStateFromCloud: (next: WarehouseState) => void;
  onRestoreBackup: (next: WarehouseState) => void;
  onResetAllData: () => void;
  onSyncStatusChange?: (status: SupabaseSyncStatus) => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  state,
  currentUser,
  alerts,
  syncStatus,
  isAdmin,
  onUpdateSettings,
  onReplaceStateFromCloud,
  onRestoreBackup,
  onResetAllData,
  onSyncStatusChange,
  onNotify,
}) => {
  // Settings protection gate: require the current administrator's password on entry.
  const [unlocked, setUnlocked] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authError, setAuthError] = useState('');

  const [tab, setTab] = useState<'general' | 'categories' | 'supabase'>('general');
  const [draft, setDraft] = useState<WarehouseSettings>(state.settings);
  const [newCategory, setNewCategory] = useState('');
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingRestoreState, setPendingRestoreState] = useState<WarehouseState | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => {
    setDraft(state.settings);
  }, [state.settings]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPendingRestoreState(null);
        setResetConfirmOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const totalPhysicalStock = useMemo(
    () => state.items.reduce((sum, item) => sum + item.physicalStock, 0),
    [state.items]
  );

  const stockUnitSummaryLabel = useMemo(() => {
    if (state.items.length === 0) return 'قطعة';
    const distinctUnits = new Set(state.items.map((i) => i.unit.trim()).filter(Boolean));
    return distinctUnits.size === 1 ? Array.from(distinctUnits)[0] : 'قطعة';
  }, [state.items]);

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || currentUser.role !== 'admin') {
      setAuthError('صلاحية الوصول محصورة بمدير النظام.');
      return;
    }
    try {
      const verified = await verifyAdminPassword(state.settings, currentUser, authPassword);
      if (!verified) {
        setAuthError('كلمة المرور غير صحيحة. يرجى المحاولة مرة أخرى.');
        return;
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'تعذر التحقق من الحساب.');
      return;
    }
    setAuthError('');
    setAuthPassword('');
    setUnlocked(true);
    onNotify('success', 'تم تأكيد الهوية وفتح صفحة الإعدادات.');
  };

  const handleSaveGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(draft);
  };

  const handleAddCategory = () => {
    const clean = newCategory.trim();
    if (!clean) return;
    if (draft.categories.includes(clean)) {
      onNotify('info', 'الفئة موجودة بالفعل.');
      return;
    }
    const next = { ...draft, categories: [...draft.categories, clean] };
    setDraft(next);
    onUpdateSettings(next);
    setNewCategory('');
  };

  const handleRemoveCategory = (cat: string) => {
    const next = { ...draft, categories: draft.categories.filter((c) => c !== cat) };
    setDraft(next);
    onUpdateSettings(next);
  };

  const handleTestSupabase = async () => {
    setTesting(true);
    const res = await testSupabaseConnection(draft.supabaseUrl, draft.supabaseAnonKey);
    setTesting(false);
    if (res.ok) {
      onSyncStatusChange?.({
        mode: 'supabase',
        connected: true,
        message: 'متصل بـ Supabase',
      });
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  };

  const handlePushSupabase = async () => {
    onUpdateSettings(draft);
    setSyncing(true);
    const nextState: WarehouseState = { ...state, settings: draft };
    const status = await syncStateToSupabase(nextState, { force: true, allowDeletes: true });
    setSyncing(false);
    onSyncStatusChange?.(status);
    onNotify(status.connected ? 'success' : 'error', status.message);
  };

  const handlePullSupabase = async () => {
    setSyncing(true);
    const res = await pullStateFromSupabase({ ...state, settings: draft });
    setSyncing(false);
    if (res.ok && res.state) {
      onReplaceStateFromCloud(res.state);
      onSyncStatusChange?.({
        mode: 'supabase',
        connected: true,
        message: 'متصل بـ Supabase',
      });
      onNotify('success', res.message);
    } else {
      onNotify('error', res.message);
    }
  };

  const handleBackupFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseWarehouseBackupJson(text, state);
      if (!parsed.ok) {
        onNotify('error', parsed.error || 'تعذر قراءة ملف النسخة الاحتياطية.');
        return;
      }
      setPendingRestoreState(parsed.state);
    } catch {
      onNotify('error', 'حدث خطأ أثناء قراءة الملف.');
    }
  };

  if (!unlocked) {
    return (
      <div className="mx-auto flex min-h-[58vh] max-w-md items-center justify-center">
        <motion.form
          initial={{ opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          onSubmit={handleUnlockSubmit}
          className="glass-card w-full space-y-5 rounded-2xl p-6 shadow-2xl"
        >
          <div className="flex items-center gap-3 border-b border-white/10 pb-4">
            <motion.div
              whileHover={{ scale: 1.06, rotate: -3 }}
              whileTap={{ scale: 0.94 }}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#20C5E8]/35 bg-[#1677FF]/20 text-[#20C5E8] shadow-[0_0_20px_rgba(32,197,232,0.18)]"
            >
              <span className="material-symbols-outlined text-[26px]">admin_panel_settings</span>
            </motion.div>
            <div>
              <h2 className="text-[17px] font-bold text-white">صفحة الإعدادات محمية</h2>
              <p className="mt-0.5 text-[12px] text-[#8FA6C3]">
                أدخل كلمة مرور مدير النظام لتأكيد الهوية وفتح الإعدادات
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="settings-auth-password"
              className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]"
            >
              كلمة المرور *
            </label>
            <div className="relative">
              <input
                id="settings-auth-password"
                type={showAuthPassword ? 'text' : 'password'}
                dir="ltr"
                autoFocus
                required
                value={authPassword}
                onChange={(e) => {
                  setAuthPassword(e.target.value);
                  if (authError) setAuthError('');
                }}
                placeholder="••••••••"
                className="h-11 w-full rounded-xl border border-white/15 bg-[#071426]/70 pl-10 pr-3 font-mono text-sm text-white placeholder-[#4B6485] outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd] focus:shadow-[0_0_0_3px_rgba(70,218,253,0.14)]"
              />
              <button
                type="button"
                onClick={() => setShowAuthPassword((v) => !v)}
                aria-label={showAuthPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                className="absolute inset-y-0 left-2.5 flex items-center rounded-lg px-1 text-[#8FA6C3] hover:text-white active:scale-90"
              >
                <span className="material-symbols-outlined text-[19px]">
                  {showAuthPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {authError && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 rounded-xl border border-[#EF4444]/50 bg-[#2A161E]/85 px-3 py-2 text-[12.5px] text-[#ffdad6]"
            >
              <span className="material-symbols-outlined text-[17px]">error</span>
              <span>{authError}</span>
            </motion.div>
          )}

          <button
            type="submit"
            className="shine-cta flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-[#1677FF] to-[#0ea5e9] text-sm font-bold text-white shadow-lg"
          >
            <span className="material-symbols-outlined text-[19px]">lock_open</span>
            <span>تأكيد الهوية وفتح الإعدادات</span>
          </button>
        </motion.form>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Tabs & Lock Control */}
      <div className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'general', label: 'عام والواتساب' },
            { id: 'categories', label: 'الفئات' },
            { id: 'supabase', label: 'ربط Supabase' },
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
                  layoutId="settings-active-tab"
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  className="absolute inset-0 rounded-xl bg-gradient-to-l from-[#1677FF] to-[#0ea5e9] shadow-md"
                />
              )}
              <span className="relative z-10">{t.label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            setUnlocked(false);
            setAuthPassword('');
            setAuthError('');
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-[12.5px] font-semibold text-[#c1c6d7] hover:-translate-y-0.5 hover:border-[#20C5E8]/55 hover:bg-white/10 hover:text-white active:scale-95"
        >
          <span className="material-symbols-outlined text-[17px]">lock</span>
          قفل الصفحة
        </button>
      </div>

      {tab === 'general' && (
        <form onSubmit={handleSaveGeneral} className="glass-card grid grid-cols-1 gap-4 rounded-2xl p-6 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">اسم المخزن</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={draft.warehouseName}
              onChange={(e) => setDraft({ ...draft, warehouseName: e.target.value })}
              className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none focus:border-[#46dafd]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">الوصف</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={draft.warehouseSubtitle}
              onChange={(e) => setDraft({ ...draft, warehouseSubtitle: e.target.value })}
              className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none focus:border-[#46dafd]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">رقم الواتساب</label>
            <input
              type="text"
              dir="ltr"
              disabled={!isAdmin}
              value={draft.whatsappNumber}
              onChange={(e) => setDraft({ ...draft, whatsappNumber: e.target.value })}
              className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 font-mono text-sm text-white outline-none focus:border-[#46dafd]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">السعة</label>
            <input
              type="number"
              min={100}
              disabled={!isAdmin}
              value={draft.capacity}
              onChange={(e) => setDraft({ ...draft, capacity: Math.max(100, Number(e.target.value)) })}
              className="tabular-nums h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none focus:border-[#46dafd]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">الحد الأدنى الافتراضي</label>
            <input
              type="number"
              min={0}
              disabled={!isAdmin}
              value={draft.defaultMinThreshold}
              onChange={(e) =>
                setDraft({ ...draft, defaultMinThreshold: Math.max(0, Number(e.target.value)) })
              }
              className="tabular-nums h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none focus:border-[#46dafd]"
            />
          </div>
          {isAdmin && (
            <div className="flex items-end sm:col-span-2">
              <button
                type="submit"
                className="shine-cta rounded-xl bg-[#1677FF] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2F86FF]"
              >
                حفظ
              </button>
            </div>
          )}
        </form>
      )}

      {tab === 'categories' && (
        <div className="glass-card space-y-4 rounded-2xl p-6">
          <h3 className="text-[15px] font-bold text-white">فئات الإكسسوارات</h3>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="فئة جديدة..."
                className="h-10 min-w-[220px] flex-1 rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="shine-cta h-10 rounded-xl bg-[#1677FF] px-4 text-sm font-semibold text-white hover:bg-[#2F86FF]"
              >
                إضافة
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {draft.categories.map((c) => (
              <div key={c} className="glass-sub-interactive flex items-center justify-between rounded-xl px-3.5 py-2.5">
                <span className="text-sm font-medium text-white">{c}</span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleRemoveCategory(c)}
                    aria-label={`حذف فئة ${c}`}
                    className="rounded-lg p-1 text-[#EF4444] hover:bg-[#EF4444]/15 active:scale-90"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'supabase' && (
        <div className="glass-card space-y-4 rounded-2xl p-6">
          <div>
            <h3 className="text-[16px] font-bold text-white">Supabase السحابي</h3>
            <p className="mt-1 text-[12px] text-[#8FA6C3]">
              مربوط مع مشروع Supabase السحابي (شغّل{' '}
              <span dir="ltr" className="font-mono text-[#20C5E8]">
                supabase_schema.sql
              </span>{' '}
              لإنشاء الجداول).
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">Supabase URL</label>
              <input
                type="url"
                dir="ltr"
                disabled={!isAdmin}
                value={draft.supabaseUrl}
                onChange={(e) => setDraft({ ...draft, supabaseUrl: e.target.value })}
                className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 font-mono text-sm text-white outline-none focus:border-[#46dafd]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">Publishable Key</label>
              <input
                type="password"
                dir="ltr"
                disabled={!isAdmin}
                value={draft.supabaseAnonKey}
                onChange={(e) => setDraft({ ...draft, supabaseAnonKey: e.target.value })}
                className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 px-3 font-mono text-sm text-white outline-none focus:border-[#46dafd]"
              />
            </div>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                disabled={testing}
                onClick={handleTestSupabase}
                className="rounded-xl border border-[#20C5E8]/45 bg-[#20C5E8]/10 px-4 py-2 text-sm font-semibold text-[#20C5E8] hover:bg-[#20C5E8]/20"
              >
                {testing ? 'جاري الفحص...' : 'اختبار الاتصال'}
              </button>
              <button
                type="button"
                disabled={syncing}
                onClick={handlePushSupabase}
                className="rounded-xl bg-[#1677FF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2F86FF]"
              >
                {syncing ? 'جاري الرفع...' : 'رفع إلى Supabase'}
              </button>
              <button
                type="button"
                disabled={syncing}
                onClick={handlePullSupabase}
                className="rounded-xl border border-[#10B981]/45 bg-[#10B981]/15 px-4 py-2 text-sm font-semibold text-[#10B981]"
              >
                سحب من Supabase
              </button>
            </div>
          )}
        </div>
      )}

      {/* Two Feature Cards: Backup/Restore + Danger Zone & System Status Summary */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Card 1 (Right in RTL): Backup, Restore & Danger Zone */}
        <div className="glass-card flex flex-col justify-between rounded-2xl p-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[21px] text-[#20C5E8]">cloud_sync</span>
              <h3 className="text-[16px] font-bold text-white">النسخ الاحتياطي واستعادة البيانات</h3>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[#8FA6C3]">
              حمّل نسخة كاملة (أصناف + عملاء + حركات + مستخدمين) كملف JSON، واستعدها في أي وقت أو على أي جهاز.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  exportBackupJson(state);
                  onNotify('success', 'تم تنزيل النسخة الاحتياطية بنجاح.');
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[#071426]/65 px-4 py-2.5 text-[13px] font-semibold text-white hover:-translate-y-0.5 hover:border-[#20C5E8]/60 hover:bg-[#20C5E8]/15 hover:shadow-[0_6px_18px_rgba(32,197,232,0.18)] active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px] text-[#20C5E8]">download</span>
                <span>تحميل نسخة احتياطية</span>
              </button>

              {isAdmin && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleBackupFileSelected}
                    className="hidden"
                    aria-label="اختيار ملف نسخة احتياطية JSON"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[#071426]/65 px-4 py-2.5 text-[13px] font-semibold text-white hover:-translate-y-0.5 hover:border-[#1677FF]/60 hover:bg-[#1677FF]/18 hover:shadow-[0_6px_18px_rgba(22,119,255,0.2)] active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#afc6ff]">upload</span>
                    <span>استعادة نسخة</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="my-5 border-t border-white/10" />

          <div>
            <div className="flex items-center gap-2 text-white">
              <span className="material-symbols-outlined text-[20px] text-[#EF4444]">delete_forever</span>
              <h4 className="text-[15px] font-bold">منطقة الخطر</h4>
            </div>
            <p className="mt-1.5 text-[12.5px] text-[#8FA6C3]">
              حذف كل الأصناف والعملاء وسجل الحركات نهائياً — لا يمس المستخدمين ولا الإعدادات.
            </p>
            {isAdmin && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setResetConfirmOpen(true)}
                  className="shine-cta inline-flex items-center gap-2 rounded-xl bg-[#F87171] px-5 py-2.5 text-[13px] font-bold text-white shadow-lg hover:bg-[#EF4444] hover:shadow-[#EF4444]/30"
                >
                  <span className="material-symbols-outlined text-[19px]">delete_sweep</span>
                  <span>حذف كل البيانات والمسح للبدء من جديد</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Card 2 (Left in RTL): System Status Summary */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[21px] text-[#1677FF]">analytics</span>
            <h3 className="text-[16px] font-bold text-white">ملخص حالة النظام</h3>
          </div>

          <div className="mt-5 space-y-2 text-[13.5px]">
            <div className="flex items-center justify-between rounded-xl border-b border-white/5 px-2.5 py-2.5 transition-all duration-150 hover:bg-white/[0.04]">
              <span className="text-[#8FA6C3]">عدد الأصناف</span>
              <span className="tabular-nums font-bold text-white">{formatNum(state.items.length)}</span>
            </div>

            <div className="flex items-center justify-between rounded-xl border-b border-white/5 px-2.5 py-2.5 transition-all duration-150 hover:bg-white/[0.04]">
              <span className="text-[#8FA6C3]">عدد العملاء</span>
              <span className="tabular-nums font-bold text-white">{formatNum(state.customers.length)}</span>
            </div>

            <div className="flex items-center justify-between rounded-xl border-b border-white/5 px-2.5 py-2.5 transition-all duration-150 hover:bg-white/[0.04]">
              <span className="text-[#8FA6C3]">إجمالي الحركات المسجلة</span>
              <span className="tabular-nums font-bold text-white">{formatNum(state.movements.length)}</span>
            </div>

            <div className="flex items-center justify-between rounded-xl border-b border-white/5 px-2.5 py-2.5 transition-all duration-150 hover:bg-white/[0.04]">
              <span className="text-[#8FA6C3]">إجمالي الرصيد الحالي</span>
              <span className="tabular-nums font-bold text-[#20C5E8]">
                {formatNum(totalPhysicalStock)} {stockUnitSummaryLabel}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border-b border-white/5 px-2.5 py-2.5 transition-all duration-150 hover:bg-white/[0.04]">
              <span className="text-[#8FA6C3]">تنبيهات نشطة</span>
              <span className="tabular-nums font-bold text-[#F59E0B]">{formatNum(alerts.length)}</span>
            </div>

            <div className="flex items-center justify-between rounded-xl px-2.5 py-2.5 transition-all duration-150 hover:bg-white/[0.04]">
              <span className="text-[#8FA6C3]">وضع التخزين</span>
              <span className="font-bold text-white">
                {syncStatus.connected ? 'سحابي (Supabase)' : 'محلي'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Restore Backup Modal */}
      <ConfirmModal
        open={Boolean(pendingRestoreState)}
        title="استعادة نسخة احتياطية"
        message={
          pendingRestoreState
            ? `سيتم استبدال بيانات المخزن الحالية بمحتوى الملف (${formatNum(
                pendingRestoreState.items.length
              )} صنف، ${formatNum(pendingRestoreState.customers.length)} عميل، ${formatNum(
                pendingRestoreState.movements.length
              )} حركة). هل تريد المتابعة؟`
            : ''
        }
        confirmLabel="استعادة الآن"
        onCancel={() => setPendingRestoreState(null)}
        onConfirm={() => {
          if (pendingRestoreState) {
            onRestoreBackup(pendingRestoreState);
            setPendingRestoreState(null);
          }
        }}
      />

      {/* Confirm Danger Zone Full Data Reset Modal */}
      <ConfirmModal
        open={resetConfirmOpen}
        title="تأكيد حذف كل البيانات"
        message="هل أنت متأكد من حذف كل الأصناف والعملاء والتخصيصات وسجل الحركات نهائياً للبدء من جديد؟ لن يتم المساس بحسابات المستخدمين أو الإعدادات."
        confirmLabel="نعم، احذف كل البيانات"
        danger
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={() => {
          onResetAllData();
          setResetConfirmOpen(false);
        }}
      />
    </div>
  );
};
