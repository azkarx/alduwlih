export type NavPage =
  | 'dashboard'
  | 'items'
  | 'customers'
  | 'stock_in'
  | 'stock_out'
  | 'movements'
  | 'alerts'
  | 'reports'
  | 'users'
  | 'settings';

export type UserRole = 'admin' | 'manager';

export type OperatorName = 'محمد رضا' | 'ملك عيد';

export type MovementType =
  | 'stock_in'
  | 'stock_out'
  | 'allocation'
  | 'adjustment'
  | 'item_create'
  | 'item_delete';

export type StockOutSource = 'customer_allocation' | 'free_stock';

export type ReportPreset = 'today' | 'weekly' | 'monthly' | 'all' | 'custom';

export interface AccessoryItem {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  unit: string;
  color: string;
  sizeSpec: string;
  rack: string;
  physicalStock: number;
  minThreshold: number;
  photoPath?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  contactPerson: string;
  productionLine: string;
  notes?: string;
  createdAt: string;
}

export interface CustomerAllocation {
  id: string;
  customerId: string;
  itemId: string;
  quantity: number;
  updatedAt: string;
}

export interface MovementRecord {
  id: string;
  type: MovementType;
  itemId: string;
  itemName: string;
  itemSku: string;
  unit: string;
  quantityDelta: number;
  beforeStock: number;
  afterStock: number;
  personName: string;
  counterpartyType?: 'customer' | 'supplier' | 'internal';
  counterpartyId?: string;
  counterpartyName?: string;
  source?: StockOutSource;
  notes?: string;
  photoPath?: string;
  createdAt: string;
}

export interface WarehouseUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface WarehouseSettings {
  warehouseName: string;
  warehouseSubtitle: string;
  stationId: string;
  capacity: number;
  defaultMinThreshold: number;
  whatsappNumber: string;
  aisles: string[];
  categories: string[];
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface ItemComputedMetrics {
  item: AccessoryItem;
  allocatedStock: number;
  freeStock: number;
  status: 'zero' | 'low' | 'over_allocated' | 'ok';
}

export interface StockAlert {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string;
  rack: string;
  unit: string;
  physicalStock: number;
  allocatedStock: number;
  minThreshold: number;
  severity: 'zero' | 'over_allocated' | 'low';
  message: string;
}

export interface WarehouseState {
  items: AccessoryItem[];
  customers: Customer[];
  allocations: CustomerAllocation[];
  movements: MovementRecord[];
  users: WarehouseUser[];
  settings: WarehouseSettings;
}

export interface OperationResult {
  ok: boolean;
  error?: string;
  state: WarehouseState;
  movement?: MovementRecord;
}

export interface DateFilterRange {
  preset: ReportPreset;
  startDate?: string;
  endDate?: string;
}
