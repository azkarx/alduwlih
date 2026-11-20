import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertsView } from './components/AlertsView';
import { ChatWidget } from './components/ChatWidget';
import { CustomersView } from './components/CustomersView';
import { DaliaPortal } from './components/DaliaPortal';
import { DashboardView } from './components/DashboardView';
import { ItemsView } from './components/ItemsView';
import { Layout } from './components/Layout';
import { LoginView } from './components/LoginView';
import { MovementsView } from './components/MovementsView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { StockInView } from './components/StockInView';
import { StockOutView } from './components/StockOutView';
import { ClickRippleLayer, ToastStack, type ToastMessage } from './components/UiShared';
import { UsersView } from './components/UsersView';
import { WelcomeIntro } from './components/WelcomeIntro';
import { ALLOWED_OPERATORS } from './data/seedData';
import {
  loadLocalWarehouseState,
  getSupabaseClient,
  pullStateFromSupabase,
  rememberLoginAccount,
  restoreWarehouseSession,
  saveLocalWarehouseState,
  signInToWarehouse,
  signOutFromWarehouse,
  syncStateToSupabase,
  uploadItemPhoto,
  uploadMovementPhoto,
  type SupabaseSyncStatus,
} from './services/storageService';
import type {
  AccessoryItem,
  Customer,
  MovementRecord,
  NavPage,
  OperatorName,
  StockOutSource,
  WarehouseSettings,
  WarehouseState,
  WarehouseUser,
} from './types/warehouse';
import { preloadUserAvatars } from './utils/userAvatars';
import {
  adjustItemBalance,
  allocateStockToCustomer,
  applyStockIn,
  applyStockOut,
  clearWarehouseDataKeepConfig,
  computeAlerts,
  createItemInState,
  deleteCustomerFromState,
  deleteItemFromState,
  makeId,
  updateItemInState,
} from './utils/warehouseLogic';

export default function App() {
  const [state, setState] = useState<WarehouseState>(() => loadLocalWarehouseState());
  const [activePage, setActivePage] = useState<NavPage>('dashboard');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [introState, setIntroState] = useState<{
    user: WarehouseUser;
    mode: 'login' | 'logout';
  } | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [syncStatus, setSyncStatus] = useState<SupabaseSyncStatus>({
    mode: 'local',
    connected: false,
    message: 'حفظ محلي + سحابي',
  });

  const [stockOutPreselect, setStockOutPreselect] = useState<{
    customerId?: string;
    itemId?: string;
  }>({});

  const notify = useCallback((type: ToastMessage['type'], text: string) => {
    const id = makeId('toast');
    setToasts((prev) => [...prev.slice(-3), { id, type, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const handleChatIncoming = useCallback(
    (peerName: string) => notify('info', `رسالة جديدة من ${peerName}.`),
    [notify]
  );

  const commitState = useCallback(
    (
      next: WarehouseState,
      syncOptions?: { allowDeletes?: boolean; clearMovements?: boolean }
    ) => {
      setState(next);
      saveLocalWarehouseState(next);
      void syncStateToSupabase(next, syncOptions).then((status) => {
        setSyncStatus(status);
      });
    },
    []
  );

  // Restore Supabase authentication before loading any warehouse data.
  useEffect(() => {
    preloadUserAvatars();
    let active = true;
    const initial = loadLocalWarehouseState();
    const client = getSupabaseClient(initial.settings);
    const subscription = client?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setCurrentUserId(null);
        setState((previous) => ({ ...previous, users: [] }));
        setIntroState(null);
      }
    }).data.subscription;
    void restoreWarehouseSession(initial)
      .then((session) => {
        if (!active) return;
        setState(session.state);
        setCurrentUserId(session.user?.id || null);
        setSyncStatus(session.status);
        setAuthError('');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAuthError(error instanceof Error ? error.message : 'تعذر التحقق من الحساب.');
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  const currentUser = useMemo(
    () => (currentUserId ? state.users.find((u) => u.id === currentUserId && u.active) || null : null),
    [state.users, currentUserId]
  );

  useEffect(() => {
    if (currentUser?.role !== 'manager') return;
    let active = true;
    let refreshInProgress = false;

    const refreshWarehouseState = async () => {
      if (refreshInProgress) return;
      refreshInProgress = true;
      try {
        const result = await pullStateFromSupabase(loadLocalWarehouseState(), {
          allowLocalMigration: false,
        });
        if (!active) return;
        if (!result.ok || !result.state) {
          setSyncStatus({ mode: 'local', connected: false, message: result.message });
          return;
        }
        setState(result.state);
        saveLocalWarehouseState(result.state);
        setSyncStatus({ mode: 'supabase', connected: true, message: 'متصل بـ Supabase' });
      } catch (error) {
        if (active) {
          setSyncStatus({
            mode: 'local',
            connected: false,
            message: error instanceof Error ? error.message : 'تعذر تحديث بيانات المخزن.',
          });
        }
      } finally {
        refreshInProgress = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshWarehouseState();
    }, 15_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [currentUser?.role]);

  const isAdmin = currentUser?.role === 'admin';
  const defaultOperator: OperatorName = ALLOWED_OPERATORS.includes(currentUser?.name as OperatorName)
    ? (currentUser?.name as OperatorName)
    : ALLOWED_OPERATORS[0];

  const alerts = useMemo(() => computeAlerts(state), [state]);
  const totalPhysicalStock = useMemo(
    () => state.items.reduce((sum, i) => sum + i.physicalStock, 0),
    [state.items]
  );

  const handleIntroComplete = useCallback(() => {
    setIntroState(null);
  }, []);

  const handleLoginSuccess = (user: WarehouseUser, nextState: WarehouseState) => {
    setState(nextState);
    setCurrentUserId(user.id);
    setActivePage('dashboard');
    setSyncStatus({ mode: 'supabase', connected: true, message: 'متصل بـ Supabase' });
    setAuthError('');
    setIntroState({ user, mode: 'login' });
  };

  const handleLogin = async (email: string, password: string) => {
    const result = await signInToWarehouse(state, email, password);
    try {
      rememberLoginAccount(result.user);
    } catch {
      notify('info', 'تم تسجيل الدخول، لكن تعذر حفظ الحساب للدخول السريع على هذا الجهاز.');
    }
    handleLoginSuccess(result.user, result.state);
  };

  const handleLogout = async () => {
    const loggedOutUser = currentUser;
    try {
      await signOutFromWarehouse(state.settings);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'تعذر تسجيل الخروج.');
      return;
    }
    setCurrentUserId(null);
    setState((previous) => ({ ...previous, users: [] }));
    setIntroState(loggedOutUser ? { user: loggedOutUser, mode: 'logout' } : null);
  };

  const attachMovementPhoto = async (
    nextState: WarehouseState,
    movement: MovementRecord | undefined,
    photoFile?: File
  ): Promise<WarehouseState> => {
    if (!photoFile) return nextState;
    if (!movement) throw new Error('تعذر ربط الصورة بحركة المخزون.');

    const photoPath = await uploadMovementPhoto(photoFile, movement.id, state.settings);
    return {
      ...nextState,
      movements: nextState.movements.map((entry) =>
        entry.id === movement.id ? { ...entry, photoPath } : entry
      ),
    };
  };

  // Strict Admin-only mutations
  const handleCreateItem = async (
    input: Omit<AccessoryItem, 'id' | 'createdAt' | 'updatedAt'>,
    personName: string,
    customerId?: string,
    photoFile?: File
  ): Promise<boolean> => {
    if (!isAdmin) {
      notify('error', 'صلاحية الإدارة فقط.');
      return false;
    }
    const res = createItemInState(state, input, personName, customerId);
    if (!res.ok) {
      notify('error', res.error || 'تعذر إضافة الصنف.');
      return false;
    }
    try {
      const nextState = await attachMovementPhoto(res.state, res.movement, photoFile);
      commitState(nextState);
      notify('success', `تمت إضافة "${input.name}".`);
      return true;
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'تعذر حفظ صورة الحركة.');
      return false;
    }
  };

  const handleUpdateItem = async (
    itemId: string,
    updates: Partial<Omit<AccessoryItem, 'id' | 'createdAt'>>,
    personName: string,
    photoFile?: File
  ): Promise<boolean> => {
    if (!isAdmin) return false;
    const res = updateItemInState(state, itemId, updates, personName);
    if (!res.ok) {
      notify('error', res.error || 'تعذر تحديث الصنف.');
      return false;
    }
    try {
      let nextState = res.state;
      if (photoFile) {
        const photoPath = await uploadItemPhoto(photoFile, itemId, state.settings);
        nextState = {
          ...res.state,
          items: res.state.items.map((item) =>
            item.id === itemId ? { ...item, photoPath } : item
          ),
        };
      }
      commitState(nextState);
      notify('success', 'تم حفظ التعديلات.');
      return true;
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'تعذر حفظ صورة الصنف.');
      return false;
    }
  };

  const handleAdjustBalance = (
    itemId: string,
    newStock: number,
    personName: string,
    notes: string
  ) => {
    if (!isAdmin) return false;
    const res = adjustItemBalance(state, {
      itemId,
      newPhysicalStock: newStock,
      personName,
      notes,
    });
    if (!res.ok) {
      notify('error', res.error || 'تعذر تعديل الرصيد.');
      return false;
    }
    commitState(res.state);
    notify('success', 'تم تحديث الرصيد.');
    return true;
  };

  const handleDeleteItem = (itemId: string, personName: string) => {
    if (!isAdmin) return false;
    const res = deleteItemFromState(state, itemId, personName);
    if (!res.ok) {
      notify('error', res.error || 'تعذر حذف الصنف.');
      return false;
    }
    commitState(res.state, { allowDeletes: true });
    notify('success', 'تم حذف الصنف.');
    return true;
  };

  const handleSaveCustomer = (
    customerInput: Omit<Customer, 'id' | 'createdAt'>,
    existingId?: string
  ) => {
    if (!isAdmin) return false;
    const cleanName = customerInput.name.trim();
    const cleanCode = customerInput.code.trim().toUpperCase();
    if (!cleanName || !cleanCode) {
      notify('error', 'يرجى إدخال كود واسم العميل.');
      return false;
    }
    if (state.customers.some((c) => c.code.toUpperCase() === cleanCode && c.id !== existingId)) {
      notify('error', `الكود (${cleanCode}) مستخدم لعميل آخر.`);
      return false;
    }
    if (
      state.customers.some(
        (c) => c.name.trim().toLowerCase() === cleanName.toLowerCase() && c.id !== existingId
      )
    ) {
      notify('error', `العميل "${cleanName}" مسجل بالفعل.`);
      return false;
    }

    if (existingId) {
      const nextCustomers = state.customers.map((c) =>
        c.id === existingId ? { ...c, ...customerInput, code: cleanCode, name: cleanName } : c
      );
      commitState({ ...state, customers: nextCustomers });
      notify('success', 'تم تحديث العميل.');
    } else {
      const created: Customer = {
        ...customerInput,
        id: makeId('cust'),
        code: cleanCode,
        name: cleanName,
        createdAt: new Date().toISOString(),
      };
      commitState({ ...state, customers: [created, ...state.customers] });
      notify('success', `تمت إضافة العميل "${cleanName}".`);
    }
    return true;
  };

  const handleDeleteCustomer = (customerId: string) => {
    if (!isAdmin) return false;
    const res = deleteCustomerFromState(state, customerId);
    if (!res.ok) {
      notify('error', res.error || 'تعذر الحذف.');
      return false;
    }
    commitState(res.state, { allowDeletes: true });
    notify('success', 'تم حذف العميل.');
    return true;
  };

  const handleAllocateToCustomer = (
    customerId: string,
    itemId: string,
    quantity: number,
    personName: string,
    notes: string
  ) => {
    if (!isAdmin) return false;
    const res = allocateStockToCustomer(state, {
      customerId,
      itemId,
      quantity,
      personName,
      notes,
    });
    if (!res.ok) {
      notify('error', res.error || 'تعذر التخصيص.');
      return false;
    }
    commitState(res.state);
    notify('success', 'تم التخصيص بنجاح.');
    return true;
  };

  const handleStockIn = async (params: {
    itemId: string;
    quantity: number;
    personName: string;
    customerId?: string;
    supplierName?: string;
    notes?: string;
    photoFile?: File;
  }): Promise<boolean> => {
    if (!isAdmin) return false;
    const { photoFile, ...stockInParams } = params;
    const res = applyStockIn(state, stockInParams);
    if (!res.ok) {
      notify('error', res.error || 'تعذر الإضافة.');
      return false;
    }
    try {
      const nextState = await attachMovementPhoto(res.state, res.movement, photoFile);
      commitState(nextState);
      notify('success', 'تمت الإضافة وتحديث الرصيد.');
      return true;
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'تعذر حفظ صورة الحركة.');
      return false;
    }
  };

  const handleStockOut = async (params: {
    itemId: string;
    quantity: number;
    personName: string;
    source: StockOutSource;
    customerId?: string;
    notes?: string;
    photoFile?: File;
  }): Promise<boolean> => {
    if (!isAdmin) return false;
    const { photoFile, ...stockOutParams } = params;
    const res = applyStockOut(state, stockOutParams);
    if (!res.ok) {
      notify('error', res.error || 'تعذر الصرف.');
      return false;
    }
    try {
      const nextState = await attachMovementPhoto(res.state, res.movement, photoFile);
      commitState(nextState, { allowDeletes: true });
      notify('success', 'تم الصرف وخصم الرصيد.');
      return true;
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'تعذر حفظ صورة الحركة.');
      return false;
    }
  };

  const handleUpdateThreshold = (itemId: string, newThreshold: number) => {
    if (!isAdmin) return;
    const nextItems = state.items.map((item) =>
      item.id === itemId
        ? { ...item, minThreshold: newThreshold, updatedAt: new Date().toISOString() }
        : item
    );
    commitState({ ...state, items: nextItems });
    notify('success', `تم تحديث حد التنبيه إلى ${newThreshold}.`);
  };

  const handleUpdateSettings = (nextSettings: WarehouseSettings) => {
    if (!isAdmin) return;
    commitState({ ...state, settings: nextSettings });
    notify('success', 'تم حفظ الإعدادات.');
  };

  return (
    <>
      {!authReady ? (
        <div className="admin-aurora-bg flex min-h-screen items-center justify-center text-sm text-[#c1c6d7]">
          جارٍ التحقق من الحساب...
        </div>
      ) : !currentUser ? (
        <motion.div
          key="auth-login"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <LoginView
            settings={state.settings}
            initialError={authError}
            onLogin={handleLogin}
          />
        </motion.div>
      ) : currentUser.role === 'manager' ? (
        <motion.div
          key="dalia-portal"
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <DaliaPortal
            state={state}
            alerts={alerts}
            user={currentUser}
            syncStatus={syncStatus}
            onLogout={handleLogout}
          />
        </motion.div>
      ) : (
        <motion.div
          key="admin-workspace"
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
            <Layout
              activePage={activePage}
              onNavigate={setActivePage}
              user={currentUser}
              onLogout={handleLogout}
              settings={state.settings}
              alerts={alerts}
              totalPhysicalStock={totalPhysicalStock}
              syncStatus={syncStatus}
            >
              {activePage === 'dashboard' && (
                <DashboardView
                  state={state}
                  alerts={alerts}
                  onNavigate={setActivePage}
                  isAdmin={isAdmin}
                />
              )}

              {activePage === 'items' && (
                <ItemsView
                  state={state}
                  isAdmin={isAdmin}
                  defaultPersonName={defaultOperator}
                  onCreateItem={handleCreateItem}
                  onUpdateItem={handleUpdateItem}
                  onAdjustBalance={handleAdjustBalance}
                  onDeleteItem={handleDeleteItem}
                />
              )}

              {activePage === 'customers' && (
                <CustomersView
                  state={state}
                  isAdmin={isAdmin}
                  defaultPersonName={defaultOperator}
                  onSaveCustomer={handleSaveCustomer}
                  onDeleteCustomer={handleDeleteCustomer}
                  onAllocateToCustomer={handleAllocateToCustomer}
                  onQuickStockOutCustomer={(customerId, itemId) => {
                    setStockOutPreselect({ customerId, itemId });
                    setActivePage('stock_out');
                  }}
                  onNavigate={setActivePage}
                />
              )}

              {activePage === 'stock_in' && (
                <StockInView
                  state={state}
                  isAdmin={isAdmin}
                  defaultPersonName={defaultOperator}
                  onSubmitStockIn={handleStockIn}
                  onCreateAndStockIn={handleCreateItem}
                />
              )}

              {activePage === 'stock_out' && (
                <StockOutView
                  state={state}
                  isAdmin={isAdmin}
                  defaultPersonName={defaultOperator}
                  preselectedCustomerId={stockOutPreselect.customerId}
                  preselectedItemId={stockOutPreselect.itemId}
                  onSubmitStockOut={handleStockOut}
                />
              )}

              {activePage === 'movements' && <MovementsView state={state} />}

              {activePage === 'alerts' && (
                <AlertsView
                  state={state}
                  alerts={alerts}
                  isAdmin={isAdmin}
                  onUpdateThreshold={handleUpdateThreshold}
                  onNavigate={setActivePage}
                />
              )}

              {activePage === 'reports' && <ReportsView state={state} onNotify={notify} />}

              {activePage === 'users' && (
                <UsersView
                  state={state}
                  currentUserId={currentUser.id}
                  isAdmin={isAdmin}
                />
              )}

              {activePage === 'settings' && (
                <SettingsView
                  state={state}
                  currentUser={currentUser}
                  alerts={alerts}
                  syncStatus={syncStatus}
                  isAdmin={isAdmin}
                  onUpdateSettings={handleUpdateSettings}
                  onReplaceStateFromCloud={(next) => {
                    setState(next);
                    saveLocalWarehouseState(next);
                  }}
                  onRestoreBackup={(next) => {
                    if (!isAdmin) return;
                    commitState(next, { allowDeletes: true });
                    notify('success', 'تمت استعادة النسخة الاحتياطية بنجاح.');
                  }}
                  onResetAllData={() => {
                    if (!isAdmin) return;
                    commitState(clearWarehouseDataKeepConfig(state), {
                      allowDeletes: true,
                      clearMovements: true,
                    });
                    notify('success', 'تم مسح بيانات المخزن بالكامل مع الاحتفاظ بالمستخدمين والإعدادات.');
                  }}
                  onSyncStatusChange={setSyncStatus}
                  onNotify={notify}
                />
              )}
            </Layout>
          </motion.div>
        )}

        {currentUser && (
          <ChatWidget
            user={currentUser}
            settings={state.settings}
            onIncoming={handleChatIncoming}
          />
        )}
      <WelcomeIntro
        user={introState?.user ?? null}
        mode={introState?.mode ?? 'login'}
        warehouseName={state.settings.warehouseName}
        onComplete={handleIntroComplete}
      />
      <ClickRippleLayer isDalia={currentUser?.role === 'manager'} />
      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </>
  );
}
