import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createInitialWarehouseState } from '../data/seedData';
import type { UserRole, WarehouseState, WarehouseUser, WarehouseSettings } from '../types/warehouse';
import { getMovementPhotoError, getMovementPhotoExtension } from '../utils/movementPhoto';

const LOCAL_STORAGE_KEY = 'dawliya_warehouse_state_v2';
const LEGACY_SESSION_STORAGE_KEY = 'dawliya_warehouse_session_v2';
const LEGACY_REMEMBERED_ACCOUNTS_KEY = 'dawliya_remembered_accounts_v2';
const QUICK_LOGIN_ACCOUNTS_KEY = 'dawliya_quick_login_accounts_v1';

export interface RememberedLoginAccount {
  email: string;
  name: string;
  role: UserRole;
}

function isRememberedLoginAccount(value: unknown): value is RememberedLoginAccount {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'email' in value &&
    typeof value.email === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'role' in value &&
    (value.role === 'admin' || value.role === 'manager')
  );
}

export function loadRememberedLoginAccounts(): RememberedLoginAccount[] {
  const raw = window.localStorage.getItem(QUICK_LOGIN_ACCOUNTS_KEY);
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(QUICK_LOGIN_ACCOUNTS_KEY);
    return [];
  }
  return Array.isArray(parsed) ? parsed.filter(isRememberedLoginAccount).slice(0, 6) : [];
}

export function rememberLoginAccount(user: Pick<WarehouseUser, 'email' | 'name' | 'role'>): void {
  const email = user.email.trim().toLowerCase();
  if (!email) throw new Error('لا يوجد بريد إلكتروني صالح لحفظه.');

  const account: RememberedLoginAccount = {
    email,
    name: user.name,
    role: user.role,
  };
  const accounts = loadRememberedLoginAccounts().filter(
    (savedAccount) => savedAccount.email.toLowerCase() !== email
  );
  window.localStorage.setItem(QUICK_LOGIN_ACCOUNTS_KEY, JSON.stringify([account, ...accounts].slice(0, 6)));
}

export interface SupabaseSyncStatus {
  mode: 'supabase' | 'local';
  connected: boolean;
  message: string;
}
export interface WarehouseSession {
  user: WarehouseUser | null;
  state: WarehouseState;
  status: SupabaseSyncStatus;
}

interface UserProfileRow {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager';
  active: boolean;
  created_at: string;
}

export function getEnvSupabaseConfig(): { url: string; anonKey: string } {
  const url =
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
  const anonKey =
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    '';
  return { url: url.trim(), anonKey: anonKey.trim() };
}

export function loadLocalWarehouseState(): WarehouseState {
  try {
    window.localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_REMEMBERED_ACCOUNTS_KEY);
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      const seed = createInitialWarehouseState();
      const envCfg = getEnvSupabaseConfig();
      if (envCfg.url && envCfg.anonKey) {
        seed.settings.supabaseUrl = envCfg.url;
        seed.settings.supabaseAnonKey = envCfg.anonKey;
      }
      saveLocalWarehouseState(seed);
      return seed;
    }
    const parsed = JSON.parse(raw) as Partial<WarehouseState>;
    const fallback = createInitialWarehouseState();
    const envCfg = getEnvSupabaseConfig();
    const mergedSettings = {
      ...fallback.settings,
      ...(parsed.settings || {}),
    };
    if (!mergedSettings.supabaseUrl && envCfg.url) mergedSettings.supabaseUrl = envCfg.url;
    if (!mergedSettings.supabaseAnonKey && envCfg.anonKey) mergedSettings.supabaseAnonKey = envCfg.anonKey;

    const state: WarehouseState = {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      allocations: Array.isArray(parsed.allocations) ? parsed.allocations : [],
      movements: Array.isArray(parsed.movements) ? parsed.movements : [],
      users: [],
      settings: mergedSettings,
    };
    saveLocalWarehouseState(state);
    return state;
  } catch {
    return createInitialWarehouseState();
  }
}

export function saveLocalWarehouseState(state: WarehouseState): void {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ ...state, users: [] }));
    window.localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_REMEMBERED_ACCOUNTS_KEY);
  } catch {
    // Ignore quota errors cleanly.
  }
}

const supabaseClientCache = new Map<string, SupabaseClient>();

function makeSupabaseClient(url: string, anonKey: string): SupabaseClient | null {
  const cleanUrl = url.trim();
  const cleanKey = anonKey.trim();
  if (!cleanUrl || !cleanKey || !cleanUrl.startsWith('http')) {
    return null;
  }
  const cacheKey = `${cleanUrl}::${cleanKey}`;
  const cached = supabaseClientCache.get(cacheKey);
  if (cached) return cached;
  const client = createClient(cleanUrl, cleanKey);
  supabaseClientCache.set(cacheKey, client);
  return client;
}

export function getSupabaseClient(settings?: WarehouseSettings): SupabaseClient | null {
  const envCfg = getEnvSupabaseConfig();
  return makeSupabaseClient(
    settings?.supabaseUrl || envCfg.url,
    settings?.supabaseAnonKey || envCfg.anonKey
  );
}

const MOVEMENT_PHOTOS_BUCKET = 'warehouse-movement-photos';

export async function uploadMovementPhoto(
  file: File,
  movementId: string,
  settings: WarehouseSettings
): Promise<string> {
  const validationError = getMovementPhotoError(file);
  if (validationError) throw new Error(validationError);

  const extension = getMovementPhotoExtension(file.type);
  const client = getSupabaseClient(settings);
  if (!extension || !client) {
    throw new Error('إعدادات تخزين صور الحركات غير مكتملة.');
  }

  const { data, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!data.session?.user) throw new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');

  const path = `${data.session.user.id}/${movementId}.${extension}`;
  const { error } = await client.storage.from(MOVEMENT_PHOTOS_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`تعذر رفع صورة الحركة: ${error.message}`);
  return path;
}

export async function createMovementPhotoSignedUrl(
  path: string,
  settings: WarehouseSettings
): Promise<string> {
  const client = getSupabaseClient(settings);
  if (!client) throw new Error('إعدادات Supabase غير مكتملة.');

  const { data, error } = await client.storage
    .from(MOVEMENT_PHOTOS_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) throw new Error(`تعذر فتح صورة الحركة: ${error.message}`);
  return data.signedUrl;
}

const SUPABASE_SCHEMA_READY_KEY = 'dawliya_supabase_schema_ready_v1';

function isSchemaVerifiedLocally(): boolean {
  try {
    return window.localStorage.getItem(SUPABASE_SCHEMA_READY_KEY) === '1';
  } catch {
    return false;
  }
}

function setSchemaVerifiedLocally(ready: boolean): void {
  try {
    if (ready) {
      window.localStorage.setItem(SUPABASE_SCHEMA_READY_KEY, '1');
    } else {
      window.localStorage.removeItem(SUPABASE_SCHEMA_READY_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

async function isSupabaseServerReachable(
  url: string,
  key: string
): Promise<{ reachable: boolean; reason?: string }> {
  try {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/auth/v1/settings`, {
      method: 'GET',
      headers: {
        apikey: key.trim(),
      },
    });
    if (!res.ok) {
      return { reachable: false, reason: `HTTP ${res.status}` };
    }
    return { reachable: true };
  } catch (err) {
    return {
      reachable: false,
      reason: err instanceof Error ? err.message : 'Network error',
    };
  }
}

function mapUserProfile(row: UserProfileRow): WarehouseUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    createdAt: row.created_at,
  };
}

async function loadAuthenticatedWarehouse(
  client: SupabaseClient,
  userId: string,
  localState: WarehouseState
): Promise<{ user: WarehouseUser; state: WarehouseState }> {
  const { data: profile, error } = await client
    .from('user_profiles')
    .select('id, name, email, role, active, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!profile || !profile.active) {
    await client.auth.signOut();
    throw new Error('الحساب غير مفعّل في قاعدة البيانات.');
  }

  const pulled = await pullStateFromSupabase(localState);
  if (!pulled.ok || !pulled.state) {
    throw new Error(pulled.message);
  }

  const user = pulled.state.users.find((entry) => entry.id === userId);
  if (!user || !user.active) {
    await client.auth.signOut();
    throw new Error('لا يوجد ملف صلاحيات نشط لهذا الحساب.');
  }

  return { user, state: pulled.state };
}

export async function restoreWarehouseSession(
  localState: WarehouseState
): Promise<WarehouseSession> {
  const client = getSupabaseClient(localState.settings);
  if (!client) {
    throw new Error('إعدادات Supabase غير مكتملة.');
  }

  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    return {
      user: null,
      state: localState,
      status: { mode: 'local', connected: false, message: 'يرجى تسجيل الدخول.' },
    };
  }

  const loaded = await loadAuthenticatedWarehouse(client, data.session.user.id, localState);
  return {
    ...loaded,
    status: { mode: 'supabase', connected: true, message: 'متصل بـ Supabase' },
  };
}

export async function signInToWarehouse(
  localState: WarehouseState,
  email: string,
  password: string
): Promise<{ user: WarehouseUser; state: WarehouseState }> {
  const client = getSupabaseClient(localState.settings);
  if (!client) {
    throw new Error('إعدادات Supabase غير مكتملة.');
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error || !data.user) {
    throw new Error('بيانات الدخول غير صحيحة أو الحساب غير مفعّل.');
  }

  return loadAuthenticatedWarehouse(client, data.user.id, localState);
}

export async function signOutFromWarehouse(settings: WarehouseSettings): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) throw new Error('إعدادات Supabase غير مكتملة.');
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function verifyAdminPassword(
  settings: WarehouseSettings,
  user: WarehouseUser,
  password: string
): Promise<boolean> {
  const envCfg = getEnvSupabaseConfig();
  const url = settings.supabaseUrl || envCfg.url;
  const key = settings.supabaseAnonKey || envCfg.anonKey;
  if (!url || !key) throw new Error('إعدادات Supabase غير مكتملة.');
  const verificationClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await verificationClient.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (error) return false;
  const matchesCurrentUser = data.user?.id === user.id;
  await verificationClient.auth.signOut();
  return matchesCurrentUser;
}

export async function testSupabaseConnection(
  url: string,
  anonKey: string
): Promise<{ ok: boolean; message: string }> {
  const client = makeSupabaseClient(url, anonKey);
  if (!client) {
    return {
      ok: false,
      message: 'يرجى إدخال رابط Supabase والمفتاح بشكل صحيح.',
    };
  }
  const probe = await isSupabaseServerReachable(url, anonKey);
  if (!probe.reachable) {
    setSchemaVerifiedLocally(false);
    return {
      ok: false,
      message: `تعذر الوصول لمشروع Supabase (${probe.reason || 'تحقق من الاتصال'}).`,
    };
  }
  const { error } = await client.from('items').select('id').limit(1);
  if (error) {
    setSchemaVerifiedLocally(false);
    if (error.message.includes('schema cache') || error.code === 'PGRST205') {
      return {
        ok: false,
        message: 'تم الاتصال بمشروع Supabase بنجاح — شغّل ملف supabase_schema.sql في SQL Editor لإنشاء الجداول.',
      };
    }
    return {
      ok: false,
      message: error.message,
    };
  }
  setSchemaVerifiedLocally(true);
  return {
    ok: true,
    message: 'تم الاتصال بـ Supabase بنجاح وجداول المخزن جاهزة.',
  };
}

export async function syncStateToSupabase(
  state: WarehouseState,
  options?: { force?: boolean; allowDeletes?: boolean }
): Promise<SupabaseSyncStatus> {
  const envCfg = getEnvSupabaseConfig();
  const url = state.settings.supabaseUrl || envCfg.url;
  const key = state.settings.supabaseAnonKey || envCfg.anonKey;
  const client = makeSupabaseClient(url, key);

  if (!client) {
    return {
      mode: 'local',
      connected: false,
      message: 'حفظ محلي',
    };
  }

  // Avoid firing background REST queries that return 404 before supabase_schema.sql is executed.
  if (!options?.force && !isSchemaVerifiedLocally()) {
    const reach = await isSupabaseServerReachable(url, key);
    return {
      mode: 'local',
      connected: false,
      message: reach.reachable ? 'حفظ محلي + سحابي (جاهز للربط)' : 'حفظ محلي',
    };
  }

  try {
    const settingsPayload = {
      id: 'default',
      data: {
        ...state.settings,
        supabaseUrl: '',
        supabaseAnonKey: '',
      },
      updated_at: new Date().toISOString(),
    };

    if (state.items.length > 0) {
      const { error: itemsErr } = await client.from('items').upsert(
        state.items.map((item) => ({
          id: item.id,
          sku: item.sku,
          barcode: item.barcode,
          name: item.name,
          category: item.category,
          unit: item.unit,
          color: item.color,
          size_spec: item.sizeSpec,
          rack: item.rack,
          physical_stock: item.physicalStock,
          min_threshold: item.minThreshold,
          notes: item.notes || '',
          created_at: item.createdAt,
          updated_at: item.updatedAt,
        })),
        { onConflict: 'id' }
      );
      if (itemsErr) throw itemsErr;
    }

    if (options?.allowDeletes) {
      const { data: remoteItems, error: remoteItemsErr } = await client.from('items').select('id');
      if (remoteItemsErr) throw remoteItemsErr;
      if (remoteItems) {
        const localItemIds = new Set(state.items.map((i) => i.id));
        const toDelete = remoteItems.map((r) => r.id as string).filter((id) => !localItemIds.has(id));
        if (toDelete.length > 0) {
          await client.from('items').delete().in('id', toDelete);
        }
      }
    }

    if (state.customers.length > 0) {
      const { error: custErr } = await client.from('customers').upsert(
        state.customers.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          phone: c.phone,
          contact_person: c.contactPerson,
          production_line: c.productionLine,
          notes: c.notes || '',
          created_at: c.createdAt,
        })),
        { onConflict: 'id' }
      );
      if (custErr) throw custErr;
    }

    if (options?.allowDeletes) {
      const { data: remoteCusts } = await client.from('customers').select('id');
      if (remoteCusts) {
        const localCustIds = new Set(state.customers.map((c) => c.id));
        const toDelete = remoteCusts.map((r) => r.id as string).filter((id) => !localCustIds.has(id));
        if (toDelete.length > 0) {
          await client.from('customers').delete().in('id', toDelete);
        }
      }
    }

    if (state.allocations.length > 0) {
      const { error: allocErr } = await client.from('customer_allocations').upsert(
        state.allocations.map((a) => ({
          id: a.id,
          customer_id: a.customerId,
          item_id: a.itemId,
          quantity: a.quantity,
          updated_at: a.updatedAt,
        })),
        { onConflict: 'id' }
      );
      if (allocErr) throw allocErr;
    }

    if (options?.allowDeletes) {
      const { data: remoteAllocs } = await client.from('customer_allocations').select('id');
      if (remoteAllocs) {
        const localAllocIds = new Set(state.allocations.map((a) => a.id));
        const toDelete = remoteAllocs.map((r) => r.id as string).filter((id) => !localAllocIds.has(id));
        if (toDelete.length > 0) {
          await client.from('customer_allocations').delete().in('id', toDelete);
        }
      }
    }

    if (state.movements.length > 0) {
      const { error: movErr } = await client.from('movements').upsert(
        state.movements.slice(0, 500).map((m) => ({
          id: m.id,
          type: m.type,
          item_id: m.itemId,
          item_name: m.itemName,
          item_sku: m.itemSku,
          unit: m.unit,
          quantity_delta: m.quantityDelta,
          before_stock: m.beforeStock,
          after_stock: m.afterStock,
          person_name: m.personName,
          counterparty_type: m.counterpartyType || null,
          counterparty_id: m.counterpartyId || null,
          counterparty_name: m.counterpartyName || null,
          source: m.source || null,
          notes: m.notes || '',
          photo_path: m.photoPath || null,
          created_at: m.createdAt,
        })),
        { onConflict: 'id' }
      );
      if (movErr) throw movErr;
    }

    const { error: settingsErr } = await client
      .from('warehouse_settings')
      .upsert(settingsPayload, { onConflict: 'id' });
    if (settingsErr) throw settingsErr;
    setSchemaVerifiedLocally(true);

    return {
      mode: 'supabase',
      connected: true,
      message: 'متصل بـ Supabase',
    };
  } catch (err) {
    setSchemaVerifiedLocally(false);
    return {
      mode: 'local',
      connected: false,
      message: err instanceof Error ? `حفظ محلي (${err.message})` : 'حفظ محلي',
    };
  }
}

export async function pullStateFromSupabase(
  currentState: WarehouseState
): Promise<{ ok: boolean; state?: WarehouseState; message: string }> {
  const envCfg = getEnvSupabaseConfig();
  const url = currentState.settings.supabaseUrl || envCfg.url;
  const key = currentState.settings.supabaseAnonKey || envCfg.anonKey;
  const client = makeSupabaseClient(url, key);
  if (!client) {
    return { ok: false, message: 'إعدادات Supabase غير مكتملة.' };
  }
  const reach = await isSupabaseServerReachable(url, key);
  if (!reach.reachable) {
    return {
      ok: false,
      message: 'تعذر الوصول إلى خادم Supabase.',
    };
  }
  try {
    const [itemsRes, custRes, allocRes, movRes, setRes, profilesRes] = await Promise.all([
      client.from('items').select('*').order('created_at', { ascending: false }),
      client.from('customers').select('*').order('created_at', { ascending: false }),
      client.from('customer_allocations').select('*'),
      client.from('movements').select('*').order('created_at', { ascending: false }).limit(500),
      client.from('warehouse_settings').select('*').eq('id', 'default').maybeSingle(),
      client
        .from('user_profiles')
        .select('id, name, email, role, active, created_at')
        .order('created_at', { ascending: true }),
    ]);

    if (itemsRes.error) throw itemsRes.error;
    if (custRes.error) throw custRes.error;
    if (allocRes.error) throw allocRes.error;
    if (movRes.error) throw movRes.error;
    if (profilesRes.error) throw profilesRes.error;

    setSchemaVerifiedLocally(true);

    if (
      (itemsRes.data?.length || 0) === 0 &&
      (custRes.data?.length || 0) === 0 &&
      (movRes.data?.length || 0) === 0 &&
      currentState.items.length > 0
    ) {
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError) throw authError;
      const currentProfile = (profilesRes.data || []).find(
        (profile) => profile.id === authData.user.id && profile.active
      );
      if (currentProfile?.role !== 'admin') {
        return {
          ok: false,
          message: 'قاعدة البيانات فارغة. سجّل دخول مدير النظام أولاً لنقل البيانات المحلية.',
        };
      }

      const syncStatus = await syncStateToSupabase(currentState, { force: true });
      if (!syncStatus.connected) {
        return { ok: false, message: `تعذر نقل البيانات إلى Supabase: ${syncStatus.message}` };
      }
      const migratedState = {
        ...currentState,
        users: (profilesRes.data || []).map((r) =>
          mapUserProfile({
            id: String(r.id),
            name: String(r.name),
            email: String(r.email),
            role: r.role,
            active: Boolean(r.active),
            created_at: String(r.created_at || new Date().toISOString()),
          })
        ),
      };
      saveLocalWarehouseState(migratedState);
      return {
        ok: true,
        state: migratedState,
        message: 'تم رفع بيانات المخزن الحالية إلى Supabase.',
      };
    }

    const nextState: WarehouseState = {
      ...currentState,
      items: (itemsRes.data || []).map((r) => ({
        id: String(r.id),
        sku: String(r.sku),
        barcode: String(r.barcode || ''),
        name: String(r.name),
        category: String(r.category || 'أخرى'),
        unit: String(r.unit || 'قطعة'),
        color: String(r.color || ''),
        sizeSpec: String(r.size_spec || ''),
        rack: String(r.rack || ''),
        physicalStock: Number(r.physical_stock || 0),
        minThreshold: Number(r.min_threshold || 0),
        notes: String(r.notes || ''),
        createdAt: String(r.created_at || new Date().toISOString()),
        updatedAt: String(r.updated_at || new Date().toISOString()),
      })),
      customers: (custRes.data || []).map((r) => ({
        id: String(r.id),
        code: String(r.code),
        name: String(r.name),
        phone: String(r.phone || ''),
        contactPerson: String(r.contact_person || ''),
        productionLine: String(r.production_line || ''),
        notes: String(r.notes || ''),
        createdAt: String(r.created_at || new Date().toISOString()),
      })),
      allocations: (allocRes.data || []).map((r) => ({
        id: String(r.id),
        customerId: String(r.customer_id),
        itemId: String(r.item_id),
        quantity: Number(r.quantity || 0),
        updatedAt: String(r.updated_at || new Date().toISOString()),
      })),
      movements: (movRes.data || []).map((r) => ({
        id: String(r.id),
        type: r.type,
        itemId: String(r.item_id),
        itemName: String(r.item_name),
        itemSku: String(r.item_sku),
        unit: String(r.unit || 'قطعة'),
        quantityDelta: Number(r.quantity_delta || 0),
        beforeStock: Number(r.before_stock || 0),
        afterStock: Number(r.after_stock || 0),
        personName: String(r.person_name || 'النظام'),
        counterpartyType: r.counterparty_type || undefined,
        counterpartyId: r.counterparty_id || undefined,
        counterpartyName: r.counterparty_name || undefined,
        source: r.source || undefined,
        notes: String(r.notes || ''),
        photoPath: r.photo_path ? String(r.photo_path) : undefined,
        createdAt: String(r.created_at || new Date().toISOString()),
      })),
      users: (profilesRes.data || []).map((r) =>
        mapUserProfile({
          id: String(r.id),
          name: String(r.name),
          email: String(r.email),
          role: r.role,
          active: Boolean(r.active),
          created_at: String(r.created_at || new Date().toISOString()),
        })
      ),
      settings: setRes.data?.data
        ? {
            ...currentState.settings,
            ...(setRes.data.data as Record<string, unknown>),
            supabaseUrl: currentState.settings.supabaseUrl,
            supabaseAnonKey: currentState.settings.supabaseAnonKey,
          }
        : currentState.settings,
    };

    saveLocalWarehouseState(nextState);
    return {
      ok: true,
      state: nextState,
      message: 'تمت مزامنة البيانات من Supabase.',
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'فشل سحب البيانات من Supabase.',
    };
  }
}
