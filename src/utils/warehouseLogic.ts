import type {
  AccessoryItem,
  Customer,
  CustomerAllocation,
  DateFilterRange,
  ItemComputedMetrics,
  MovementRecord,
  OperationResult,
  StockAlert,
  StockOutSource,
  WarehouseState,
} from '../types/warehouse';

export interface MovementChartDay {
  key: string;
  label: string;
  inQty: number;
  outQty: number;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildMovementChartData(
  movements: MovementRecord[],
  now: Date = new Date()
): MovementChartDay[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const buckets: MovementChartDay[] = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    buckets.push({
      key: localDateKey(date),
      label: date.toLocaleDateString('ar-EG', { weekday: 'short' }),
      inQty: 0,
      outQty: 0,
    });
  }

  const bucketsByDate = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const movement of movements) {
    const timestamp = new Date(movement.createdAt);
    if (Number.isNaN(timestamp.getTime())) continue;

    const bucket = bucketsByDate.get(localDateKey(timestamp));
    if (!bucket) continue;
    if (movement.type === 'stock_in' || movement.type === 'item_create') {
      bucket.inQty += Math.abs(movement.quantityDelta);
    } else if (movement.type === 'stock_out' || movement.type === 'item_delete') {
      bucket.outQty += Math.abs(movement.quantityDelta);
    } else if (movement.type === 'adjustment') {
      if (movement.quantityDelta > 0) bucket.inQty += movement.quantityDelta;
      if (movement.quantityDelta < 0) bucket.outQty += Math.abs(movement.quantityDelta);
    }
  }

  return buckets;
}

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export function getItemAllocatedTotal(allocations: CustomerAllocation[], itemId: string): number {
  return allocations
    .filter((a) => a.itemId === itemId)
    .reduce((sum, a) => sum + Math.max(0, a.quantity), 0);
}

export function getCustomerAllocationQty(
  allocations: CustomerAllocation[],
  customerId: string,
  itemId: string
): number {
  const found = allocations.find((a) => a.customerId === customerId && a.itemId === itemId);
  return found ? Math.max(0, found.quantity) : 0;
}

export function computeItemMetrics(
  item: AccessoryItem,
  allocations: CustomerAllocation[]
): ItemComputedMetrics {
  const allocatedStock = getItemAllocatedTotal(allocations, item.id);
  const freeStock = item.physicalStock - allocatedStock;
  let status: ItemComputedMetrics['status'] = 'ok';
  if (item.physicalStock <= 0) {
    status = 'zero';
  } else if (allocatedStock > item.physicalStock) {
    status = 'over_allocated';
  } else if (item.physicalStock <= item.minThreshold) {
    status = 'low';
  }
  return {
    item,
    allocatedStock,
    freeStock,
    status,
  };
}

export function computeAllItemMetrics(state: WarehouseState): ItemComputedMetrics[] {
  return state.items.map((item) => computeItemMetrics(item, state.allocations));
}

export function computeAlerts(state: WarehouseState): StockAlert[] {
  const alerts: StockAlert[] = [];
  for (const item of state.items) {
    const metrics = computeItemMetrics(item, state.allocations);
    if (metrics.status === 'zero') {
      alerts.push({
        id: `alert-${item.id}`,
        itemId: item.id,
        itemName: item.name,
        itemSku: item.sku,
        rack: item.rack,
        unit: item.unit,
        physicalStock: item.physicalStock,
        allocatedStock: metrics.allocatedStock,
        minThreshold: item.minThreshold,
        severity: 'zero',
        message: `نفاد تام للرصيد (0 ${item.unit}) — الحد الأدنى المحدد ${item.minThreshold}`,
      });
    } else if (metrics.status === 'over_allocated') {
      alerts.push({
        id: `alert-${item.id}`,
        itemId: item.id,
        itemName: item.name,
        itemSku: item.sku,
        rack: item.rack,
        unit: item.unit,
        physicalStock: item.physicalStock,
        allocatedStock: metrics.allocatedStock,
        minThreshold: item.minThreshold,
        severity: 'over_allocated',
        message: `المخصص للعملاء (${metrics.allocatedStock}) يتجاوز الرصيد الفعلي (${item.physicalStock})`,
      });
    } else if (metrics.status === 'low') {
      alerts.push({
        id: `alert-${item.id}`,
        itemId: item.id,
        itemName: item.name,
        itemSku: item.sku,
        rack: item.rack,
        unit: item.unit,
        physicalStock: item.physicalStock,
        allocatedStock: metrics.allocatedStock,
        minThreshold: item.minThreshold,
        severity: 'low',
        message: `انخفاض الرصيد إلى ${item.physicalStock} ${item.unit} (حد التنبيه: ${item.minThreshold})`,
      });
    }
  }
  const severityOrder: Record<StockAlert['severity'], number> = {
    zero: 0,
    over_allocated: 1,
    low: 2,
  };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

export interface UnitTotal {
  unit: string;
  total: number;
}

export function groupUnitTotals(
  entries: Array<{ unit: string; quantity: number }>
): UnitTotal[] {
  const map = new Map<string, number>();
  for (const entry of entries) {
    const qty = Math.max(0, Number(entry.quantity) || 0);
    if (qty <= 0) continue;
    const unit = (entry.unit || '').trim() || 'قطعة';
    map.set(unit, (map.get(unit) || 0) + qty);
  }
  return Array.from(map.entries()).map(([unit, total]) => ({ unit, total }));
}

export interface CustomerBalanceSummary {
  customer: Customer;
  totalQuantity: number;
  itemsCount: number;
  unitTotals: UnitTotal[];
  allocations: Array<{
    allocation: CustomerAllocation;
    item: AccessoryItem;
  }>;
}

export function computeCustomerBalances(state: WarehouseState): CustomerBalanceSummary[] {
  const itemMap = new Map(state.items.map((i) => [i.id, i]));
  return state.customers.map((customer) => {
    const custAllocs = state.allocations
      .filter((a) => a.customerId === customer.id && a.quantity > 0)
      .map((allocation) => {
        const item = itemMap.get(allocation.itemId);
        return item ? { allocation, item } : null;
      })
      .filter((entry): entry is { allocation: CustomerAllocation; item: AccessoryItem } => entry !== null);

    const totalQuantity = custAllocs.reduce((sum, e) => sum + e.allocation.quantity, 0);
    const unitTotals = groupUnitTotals(
      custAllocs.map((e) => ({ unit: e.item.unit, quantity: e.allocation.quantity }))
    );
    return {
      customer,
      totalQuantity,
      itemsCount: custAllocs.length,
      unitTotals,
      allocations: custAllocs,
    };
  });
}

export function computeAllCustomersUnitTotals(summaries: CustomerBalanceSummary[]): UnitTotal[] {
  return groupUnitTotals(
    summaries.flatMap((s) => s.unitTotals.map((u) => ({ unit: u.unit, quantity: u.total })))
  );
}

function upsertAllocation(
  allocations: CustomerAllocation[],
  customerId: string,
  itemId: string,
  delta: number,
  nowIso: string
): CustomerAllocation[] {
  const idx = allocations.findIndex((a) => a.customerId === customerId && a.itemId === itemId);
  if (idx === -1) {
    if (delta <= 0) return allocations;
    return [
      ...allocations,
      {
        id: makeId('alloc'),
        customerId,
        itemId,
        quantity: delta,
        updatedAt: nowIso,
      },
    ];
  }
  const nextQty = allocations[idx].quantity + delta;
  if (nextQty <= 0) {
    return allocations.filter((_, i) => i !== idx);
  }
  return allocations.map((a, i) => (i === idx ? { ...a, quantity: nextQty, updatedAt: nowIso } : a));
}

export interface StockInParams {
  itemId: string;
  quantity: number;
  personName: string;
  customerId?: string;
  supplierName?: string;
  notes?: string;
  timestamp?: string;
}

export function applyStockIn(state: WarehouseState, params: StockInParams): OperationResult {
  const qty = Math.floor(Number(params.quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: 'يجب إدخال كمية إضافة صحيحة أكبر من صفر.', state };
  }
  const personName = params.personName.trim();
  if (!personName) {
    return { ok: false, error: 'يرجى إدخال اسم الشخص المسؤول عن الإضافة.', state };
  }
  const item = state.items.find((i) => i.id === params.itemId);
  if (!item) {
    return { ok: false, error: 'الصنف المحدد غير موجود في المخزن.', state };
  }

  const nowIso = params.timestamp || new Date().toISOString();
  const beforeStock = item.physicalStock;
  const afterStock = beforeStock + qty;

  let nextAllocations = state.allocations;
  let counterpartyType: MovementRecord['counterpartyType'] = 'supplier';
  let counterpartyId: string | undefined;
  let counterpartyName = params.supplierName?.trim() || 'توريد عام للمخزن';

  if (params.customerId) {
    const customer = state.customers.find((c) => c.id === params.customerId);
    if (!customer) {
      return { ok: false, error: 'العميل المحدد غير موجود.', state };
    }
    counterpartyType = 'customer';
    counterpartyId = customer.id;
    counterpartyName = customer.name;
    nextAllocations = upsertAllocation(state.allocations, customer.id, item.id, qty, nowIso);
  }

  const nextItems = state.items.map((i) =>
    i.id === item.id ? { ...i, physicalStock: afterStock, updatedAt: nowIso } : i
  );

  const movement: MovementRecord = {
    id: makeId('mov'),
    type: 'stock_in',
    itemId: item.id,
    itemName: item.name,
    itemSku: item.sku,
    unit: item.unit,
    quantityDelta: qty,
    beforeStock,
    afterStock,
    personName,
    counterpartyType,
    counterpartyId,
    counterpartyName,
    notes: params.notes?.trim() || undefined,
    createdAt: nowIso,
  };

  return {
    ok: true,
    movement,
    state: {
      ...state,
      items: nextItems,
      allocations: nextAllocations,
      movements: [movement, ...state.movements],
    },
  };
}

export interface StockOutParams {
  itemId: string;
  quantity: number;
  personName: string;
  source: StockOutSource;
  customerId?: string;
  notes?: string;
  timestamp?: string;
}

export function applyStockOut(state: WarehouseState, params: StockOutParams): OperationResult {
  const qty = Math.floor(Number(params.quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: 'يجب إدخال كمية صرف صحيحة أكبر من صفر.', state };
  }
  const personName = params.personName.trim();
  if (!personName) {
    return { ok: false, error: 'يرجى إدخال اسم الشخص الذي قام بالصرف.', state };
  }
  const item = state.items.find((i) => i.id === params.itemId);
  if (!item) {
    return { ok: false, error: 'الصنف المحدد غير موجود في المخزن.', state };
  }
  if (item.physicalStock <= 0) {
    return { ok: false, error: `لا يمكن الصرف لأن الرصيد الفعلي للصنف "${item.name}" يساوي صفر.`, state };
  }
  if (qty > item.physicalStock) {
    return {
      ok: false,
      error: `الكمية المطلوب صرفها (${qty}) تتجاوز الرصيد الفعلي المتاح (${item.physicalStock} ${item.unit}).`,
      state,
    };
  }

  const nowIso = params.timestamp || new Date().toISOString();
  const allocatedTotal = getItemAllocatedTotal(state.allocations, item.id);
  const freeStock = item.physicalStock - allocatedTotal;

  let nextAllocations = state.allocations;
  let counterpartyType: MovementRecord['counterpartyType'] = 'internal';
  let counterpartyId: string | undefined;
  let counterpartyName = 'صرف عام من الرصيد الحر';

  if (params.source === 'customer_allocation') {
    if (!params.customerId) {
      return { ok: false, error: 'يرجى اختيار العميل المراد الخصم من رصيده.', state };
    }
    const customer = state.customers.find((c) => c.id === params.customerId);
    if (!customer) {
      return { ok: false, error: 'العميل المحدد غير موجود.', state };
    }
    const customerQty = getCustomerAllocationQty(state.allocations, customer.id, item.id);
    if (customerQty <= 0) {
      return {
        ok: false,
        error: `لا يوجد رصيد مخصص للعميل "${customer.name}" من هذا الصنف.`,
        state,
      };
    }
    if (qty > customerQty) {
      return {
        ok: false,
        error: `الكمية المطلوبة (${qty}) أكبر من رصيد العميل "${customer.name}" المتاح (${customerQty} ${item.unit}).`,
        state,
      };
    }
    nextAllocations = upsertAllocation(state.allocations, customer.id, item.id, -qty, nowIso);
    counterpartyType = 'customer';
    counterpartyId = customer.id;
    counterpartyName = customer.name;
  } else {
    if (qty > freeStock) {
      return {
        ok: false,
        error: `الرصيد الحر غير المخصص المتاح للصرف هو ${Math.max(0, freeStock)} ${item.unit} فقط (الباقي محجوز للعملاء).`,
        state,
      };
    }
    if (params.customerId) {
      const customer = state.customers.find((c) => c.id === params.customerId);
      if (customer) {
        counterpartyType = 'customer';
        counterpartyId = customer.id;
        counterpartyName = `${customer.name} (من الرصيد الحر)`;
      }
    }
  }

  const beforeStock = item.physicalStock;
  const afterStock = beforeStock - qty;

  const nextItems = state.items.map((i) =>
    i.id === item.id ? { ...i, physicalStock: afterStock, updatedAt: nowIso } : i
  );

  const movement: MovementRecord = {
    id: makeId('mov'),
    type: 'stock_out',
    itemId: item.id,
    itemName: item.name,
    itemSku: item.sku,
    unit: item.unit,
    quantityDelta: -qty,
    beforeStock,
    afterStock,
    personName,
    counterpartyType,
    counterpartyId,
    counterpartyName,
    source: params.source,
    notes: params.notes?.trim() || undefined,
    createdAt: nowIso,
  };

  return {
    ok: true,
    movement,
    state: {
      ...state,
      items: nextItems,
      allocations: nextAllocations,
      movements: [movement, ...state.movements],
    },
  };
}

export interface AllocateToCustomerParams {
  customerId: string;
  itemId: string;
  quantity: number;
  personName: string;
  notes?: string;
}

export function allocateStockToCustomer(
  state: WarehouseState,
  params: AllocateToCustomerParams
): OperationResult {
  const qty = Math.floor(Number(params.quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: 'يجب إدخال كمية تخصيص أكبر من صفر.', state };
  }
  const personName = params.personName.trim() || 'المدير';
  const item = state.items.find((i) => i.id === params.itemId);
  const customer = state.customers.find((c) => c.id === params.customerId);
  if (!item || !customer) {
    return { ok: false, error: 'يرجى التأكد من اختيار الصنف والعميل.', state };
  }
  const metrics = computeItemMetrics(item, state.allocations);
  if (qty > metrics.freeStock) {
    return {
      ok: false,
      error: `الرصيد الحر المتاح للتخصيص من "${item.name}" هو ${Math.max(0, metrics.freeStock)} ${item.unit} فقط.`,
      state,
    };
  }
  const nowIso = new Date().toISOString();
  const nextAllocations = upsertAllocation(state.allocations, customer.id, item.id, qty, nowIso);
  const movement: MovementRecord = {
    id: makeId('mov'),
    type: 'allocation',
    itemId: item.id,
    itemName: item.name,
    itemSku: item.sku,
    unit: item.unit,
    quantityDelta: qty,
    beforeStock: item.physicalStock,
    afterStock: item.physicalStock,
    personName,
    counterpartyType: 'customer',
    counterpartyId: customer.id,
    counterpartyName: customer.name,
    notes: params.notes?.trim() || `تخصيص ${qty} ${item.unit} لرصيد العميل ${customer.name}`,
    createdAt: nowIso,
  };
  return {
    ok: true,
    movement,
    state: {
      ...state,
      allocations: nextAllocations,
      movements: [movement, ...state.movements],
    },
  };
}

export interface AdjustBalanceParams {
  itemId: string;
  newPhysicalStock: number;
  personName: string;
  notes?: string;
}

export function adjustItemBalance(state: WarehouseState, params: AdjustBalanceParams): OperationResult {
  const nextStock = Math.floor(Number(params.newPhysicalStock));
  if (!Number.isFinite(nextStock) || nextStock < 0) {
    return { ok: false, error: 'الرصيد الجديد لا يمكن أن يكون سالباً.', state };
  }
  const personName = params.personName.trim();
  if (!personName) {
    return { ok: false, error: 'يرجى كتابة اسم المسؤول عن تعديل الرصيد.', state };
  }
  const item = state.items.find((i) => i.id === params.itemId);
  if (!item) {
    return { ok: false, error: 'الصنف غير موجود.', state };
  }

  const delta = nextStock - item.physicalStock;
  if (delta === 0) {
    return { ok: false, error: 'الرصيد الجديد مطابق للرصيد الحالي.', state };
  }

  const nowIso = new Date().toISOString();
  const nextItems = state.items.map((i) =>
    i.id === item.id ? { ...i, physicalStock: nextStock, updatedAt: nowIso } : i
  );
  const movement: MovementRecord = {
    id: makeId('mov'),
    type: 'adjustment',
    itemId: item.id,
    itemName: item.name,
    itemSku: item.sku,
    unit: item.unit,
    quantityDelta: delta,
    beforeStock: item.physicalStock,
    afterStock: nextStock,
    personName,
    counterpartyType: 'internal',
    counterpartyName: 'تعديل رصيد مباشر',
    notes: params.notes?.trim() || 'تعديل الرصيد الفعلي من قائمة الأصناف',
    createdAt: nowIso,
  };

  return {
    ok: true,
    movement,
    state: {
      ...state,
      items: nextItems,
      movements: [movement, ...state.movements],
    },
  };
}

export function createItemInState(
  state: WarehouseState,
  input: Omit<AccessoryItem, 'id' | 'createdAt' | 'updatedAt'>,
  personName: string,
  customerId?: string
): OperationResult {
  const name = input.name.trim();
  const sku = input.sku.trim().toUpperCase();
  const unit = (input.unit || '').trim() || 'قطعة';
  if (!name || !sku) {
    return { ok: false, error: 'يرجى إدخال اسم الإكسسوار وكود الصنف.', state };
  }
  if (state.items.some((i) => i.sku.toUpperCase() === sku)) {
    return { ok: false, error: `كود الصنف (${sku}) مستخدم لصنف آخر بالفعل.`, state };
  }
  if (state.items.some((i) => i.name.trim().toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: `اسم الصنف "${name}" مسجل بالفعل.`, state };
  }
  const physicalStock = Math.max(0, Math.floor(Number(input.physicalStock) || 0));
  const minThreshold = Math.max(0, Math.floor(Number(input.minThreshold) || 0));
  const nowIso = new Date().toISOString();

  let targetCustomer: Customer | undefined;
  if (customerId) {
    targetCustomer = state.customers.find((c) => c.id === customerId);
    if (!targetCustomer) {
      return { ok: false, error: 'العميل المحدد غير موجود.', state };
    }
  }

  const newItem: AccessoryItem = {
    ...input,
    id: makeId('itm'),
    sku,
    name,
    unit,
    barcode: (input.barcode || '').trim(),
    category: (input.category || 'عام').trim() || 'عام',
    color: (input.color || '').trim(),
    sizeSpec: (input.sizeSpec || '').trim(),
    rack: (input.rack || '-').trim() || '-',
    physicalStock,
    minThreshold,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  let nextAllocations = state.allocations;
  if (targetCustomer && physicalStock > 0) {
    nextAllocations = upsertAllocation(state.allocations, targetCustomer.id, newItem.id, physicalStock, nowIso);
  }

  const movement: MovementRecord = {
    id: makeId('mov'),
    type: 'item_create',
    itemId: newItem.id,
    itemName: newItem.name,
    itemSku: newItem.sku,
    unit: newItem.unit,
    quantityDelta: physicalStock,
    beforeStock: 0,
    afterStock: physicalStock,
    personName: personName.trim() || 'المدير',
    counterpartyType: targetCustomer ? 'customer' : 'internal',
    counterpartyId: targetCustomer?.id,
    counterpartyName: targetCustomer ? targetCustomer.name : 'الرصيد الحر للمخزن',
    notes: targetCustomer
      ? `إضافة وتخصيص ${physicalStock} ${newItem.unit} للعميل ${targetCustomer.name}`
      : `إضافة صنف برصيد حر ${physicalStock} ${newItem.unit}`,
    createdAt: nowIso,
  };

  return {
    ok: true,
    movement,
    state: {
      ...state,
      items: [newItem, ...state.items],
      allocations: nextAllocations,
      movements: [movement, ...state.movements],
    },
  };
}

export function updateItemInState(
  state: WarehouseState,
  itemId: string,
  updates: Partial<Omit<AccessoryItem, 'id' | 'createdAt'>>,
  personName: string
): OperationResult {
  const existing = state.items.find((i) => i.id === itemId);
  if (!existing) {
    return { ok: false, error: 'الصنف غير موجود.', state };
  }
  const nextSku = (updates.sku ?? existing.sku).trim().toUpperCase();
  const nextName = (updates.name ?? existing.name).trim();
  if (state.items.some((i) => i.id !== itemId && i.sku.toUpperCase() === nextSku)) {
    return { ok: false, error: `كود الصنف (${nextSku}) مستخدم لصنف آخر.`, state };
  }
  if (state.items.some((i) => i.id !== itemId && i.name.trim().toLowerCase() === nextName.toLowerCase())) {
    return { ok: false, error: `اسم الصنف "${nextName}" مسجل بالفعل.`, state };
  }
  const nowIso = new Date().toISOString();
  const nextStock =
    updates.physicalStock !== undefined
      ? Math.max(0, Math.floor(Number(updates.physicalStock)))
      : existing.physicalStock;
  const delta = nextStock - existing.physicalStock;

  const updatedItem: AccessoryItem = {
    ...existing,
    ...updates,
    sku: nextSku,
    name: (updates.name ?? existing.name).trim(),
    physicalStock: nextStock,
    minThreshold:
      updates.minThreshold !== undefined
        ? Math.max(0, Math.floor(Number(updates.minThreshold)))
        : existing.minThreshold,
    updatedAt: nowIso,
  };

  let nextMovements = state.movements;
  let movement: MovementRecord | undefined;
  if (delta !== 0) {
    movement = {
      id: makeId('mov'),
      type: 'adjustment',
      itemId: updatedItem.id,
      itemName: updatedItem.name,
      itemSku: updatedItem.sku,
      unit: updatedItem.unit,
      quantityDelta: delta,
      beforeStock: existing.physicalStock,
      afterStock: nextStock,
      personName: personName.trim() || 'المدير',
      counterpartyType: 'internal',
      counterpartyName: 'تحديث بيانات ورصيد الصنف',
      notes: 'تعديل رصيد أثناء تحرير بطاقة الصنف',
      createdAt: nowIso,
    };
    nextMovements = [movement, ...state.movements];
  }

  return {
    ok: true,
    movement,
    state: {
      ...state,
      items: state.items.map((i) => (i.id === itemId ? updatedItem : i)),
      movements: nextMovements,
    },
  };
}

export function deleteItemFromState(
  state: WarehouseState,
  itemId: string,
  personName: string
): OperationResult {
  const existing = state.items.find((i) => i.id === itemId);
  if (!existing) {
    return { ok: false, error: 'الصنف غير موجود.', state };
  }
  const nowIso = new Date().toISOString();
  const movement: MovementRecord = {
    id: makeId('mov'),
    type: 'item_delete',
    itemId: existing.id,
    itemName: existing.name,
    itemSku: existing.sku,
    unit: existing.unit,
    quantityDelta: -existing.physicalStock,
    beforeStock: existing.physicalStock,
    afterStock: 0,
    personName: personName.trim() || 'المدير',
    counterpartyType: 'internal',
    counterpartyName: 'حذف صنف من المخزن',
    notes: `حذف الصنف ${existing.name} (${existing.sku})`,
    createdAt: nowIso,
  };

  return {
    ok: true,
    movement,
    state: {
      ...state,
      items: state.items.filter((i) => i.id !== itemId),
      allocations: state.allocations.filter((a) => a.itemId !== itemId),
      movements: [movement, ...state.movements],
    },
  };
}

export function deleteCustomerFromState(state: WarehouseState, customerId: string): OperationResult {
  const existing = state.customers.find((c) => c.id === customerId);
  if (!existing) {
    return { ok: false, error: 'العميل غير موجود.', state };
  }
  return {
    ok: true,
    state: {
      ...state,
      customers: state.customers.filter((c) => c.id !== customerId),
      allocations: state.allocations.filter((a) => a.customerId !== customerId),
    },
  };
}

export function filterMovementsByDateRange(
  movements: MovementRecord[],
  range: DateFilterRange,
  now: Date = new Date()
): MovementRecord[] {
  if (range.preset === 'all') {
    return movements;
  }

  let startMs = 0;
  let endMs = Number.MAX_SAFE_INTEGER;

  if (range.preset === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    startMs = start.getTime();
    endMs = end.getTime();
  } else if (range.preset === 'weekly') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    startMs = start.getTime();
    endMs = end.getTime();
  } else if (range.preset === 'monthly') {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    startMs = start.getTime();
    endMs = end.getTime();
  } else if (range.preset === 'custom') {
    if (range.startDate) {
      const s = new Date(`${range.startDate}T00:00:00`);
      if (!Number.isNaN(s.getTime())) startMs = s.getTime();
    }
    if (range.endDate) {
      const e = new Date(`${range.endDate}T23:59:59.999`);
      if (!Number.isNaN(e.getTime())) endMs = e.getTime();
    }
  }

  return movements.filter((m) => {
    const t = new Date(m.createdAt).getTime();
    return t >= startMs && t <= endMs;
  });
}

export function sanitizeWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  if (!digits) return '201104155183';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) return `2${digits}`;
  return digits;
}

function shortMoveType(type: MovementRecord['type']): string {
  switch (type) {
    case 'stock_in':
      return 'إضافة';
    case 'stock_out':
      return 'صرف';
    case 'allocation':
      return 'تخصيص';
    case 'adjustment':
      return 'تعديل';
    case 'item_create':
      return 'صنف جديد';
    case 'item_delete':
      return 'حذف';
  }
}

function movementEmoji(type: MovementRecord['type']): string {
  switch (type) {
    case 'stock_in':
      return '📥';
    case 'stock_out':
      return '📤';
    case 'allocation':
      return '🏷️';
    case 'adjustment':
      return '✏️';
    case 'item_create':
      return '🆕';
    case 'item_delete':
      return '🗑️';
  }
}

export function itemStatusEmoji(status: ItemComputedMetrics['status']): string {
  switch (status) {
    case 'ok':
      return '🟢';
    case 'low':
      return '⚠️';
    case 'zero':
      return '🔴';
    case 'over_allocated':
      return '❗';
  }
}

function itemStatusTag(status: ItemComputedMetrics['status']): string {
  switch (status) {
    case 'ok':
      return 'متاح';
    case 'low':
      return 'قارب الحد الأدنى';
    case 'zero':
      return 'نفاد تام';
    case 'over_allocated':
      return 'عجز تخصيص';
  }
}

export function buildWhatsAppReportText(
  state: WarehouseState,
  range: DateFilterRange,
  filteredMovements: MovementRecord[]
): string {
  const allMetrics = computeAllItemMetrics(state);
  const totalPhysical = allMetrics.reduce((s, m) => s + m.item.physicalStock, 0);
  const totalAllocated = allMetrics.reduce((s, m) => s + m.allocatedStock, 0);
  const totalFree = totalPhysical - totalAllocated;
  const alerts = computeAlerts(state);

  const periodIn = filteredMovements
    .filter((m) => m.type === 'stock_in')
    .reduce((s, m) => s + Math.abs(m.quantityDelta), 0);
  const periodOut = filteredMovements
    .filter((m) => m.type === 'stock_out')
    .reduce((s, m) => s + Math.abs(m.quantityDelta), 0);

  const periodLabels: Record<DateFilterRange['preset'], string> = {
    today: 'تقرير اليوم',
    weekly: 'التقرير الأسبوعي',
    monthly: 'التقرير الشهري',
    all: 'التقرير الشامل',
    custom: `فترة (${range.startDate || 'البداية'} ← ${range.endDate || 'الآن'})`,
  };

  // 1) All Items Stock Health Breakdown (🟢 OK / ⚠️ Low / 🔴 Zero / ❗ Over-allocated)
  const sortedMetrics = [...allMetrics].sort((a, b) => {
    const rank: Record<ItemComputedMetrics['status'], number> = {
      zero: 0,
      over_allocated: 1,
      low: 2,
      ok: 3,
    };
    return rank[a.status] - rank[b.status];
  });

  const maxItemsInMsg = 25;
  const itemStatusLines = sortedMetrics.slice(0, maxItemsInMsg).map((m) => {
    const emoji = itemStatusEmoji(m.status);
    const label = itemStatusTag(m.status);
    return (
      `${emoji} *${m.item.name}* [${m.item.sku}] (${label})\n` +
      `   📦 *${m.item.physicalStock.toLocaleString('en-US')}* ${m.item.unit}` +
      ` (🟢 حر: *${m.freeStock.toLocaleString('en-US')}*` +
      ` · 👥 عملاء: *${m.allocatedStock.toLocaleString('en-US')}*` +
      ` · الحد: ${m.item.minThreshold.toLocaleString('en-US')})`
    );
  });
  if (sortedMetrics.length > maxItemsInMsg) {
    itemStatusLines.push(
      `⋯ بالإضافة إلى ${sortedMetrics.length - maxItemsInMsg} أصناف أخرى في ملف التقرير.`
    );
  }

  // 2) Customer Balances Breakdown grouped neatly with unit summaries
  const customerLines: string[] = [];
  for (const cs of computeCustomerBalances(state)) {
    if (cs.totalQuantity <= 0 && cs.allocations.length === 0) continue;
    const unitBadge =
      cs.unitTotals.length > 0
        ? cs.unitTotals.map((u) => `${u.total.toLocaleString('en-US')} ${u.unit}`).join(' + ')
        : cs.totalQuantity.toLocaleString('en-US');
    const details = cs.allocations
      .map(
        (a) =>
          `   ▫️ ${a.item.name}: *${a.allocation.quantity.toLocaleString('en-US')}* ${a.item.unit}`
      )
      .join('\n');
    customerLines.push(`🔹 *${cs.customer.name}* (${unitBadge})\n${details}`);
  }

  // 3) Movement Log Entries
  const maxMovementsInMsg = 15;
  const movementLines = filteredMovements.slice(0, maxMovementsInMsg).map((m) => {
    const dt = new Date(m.createdAt);
    const timeStr = `${dt.toLocaleDateString('ar-EG')} ${dt.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
    const qtyStr =
      m.quantityDelta > 0
        ? `+${m.quantityDelta.toLocaleString('en-US')}`
        : m.quantityDelta.toLocaleString('en-US');
    const target = m.counterpartyName ? ` ← ${m.counterpartyName}` : '';
    return `${movementEmoji(m.type)} [${timeStr}] *${shortMoveType(m.type)}:* ${m.itemName} (*${qtyStr}* ${m.unit}) | 👤 ${m.personName}${target}`;
  });
  if (filteredMovements.length > maxMovementsInMsg) {
    movementLines.push(
      `⋯ والمزيد (${filteredMovements.length - maxMovementsInMsg} حركة إضافية في ملف Excel/Word)`
    );
  }

  // 4) Critical & Warning Alerts
  const alertLines = alerts.slice(0, 10).map((a) => {
    const emoji = a.severity === 'zero' ? '🔴' : a.severity === 'over_allocated' ? '❗' : '⚠️';
    const stateText =
      a.severity === 'zero'
        ? 'نفاد تام'
        : a.severity === 'over_allocated'
        ? 'عجز تخصيص'
        : 'اقترب من الحد الأدنى';
    return `${emoji} *${a.itemName}* [${a.itemSku}] (${stateText}): المتاح *${a.physicalStock.toLocaleString('en-US')}* ${a.unit} / الحد الأدنى ${a.minThreshold.toLocaleString('en-US')}`;
  });
  if (alerts.length > 10) {
    alertLines.push(`⋯ يوجد ${alerts.length - 10} تنبيهات أخرى بالنظام.`);
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('ar-EG');
  const clockStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const divider = '━━━━━━━━━━━━━━━━━━';

  const lines = [
    `🏭 *${state.settings.warehouseName}*`,
    `📋 *${periodLabels[range.preset]}*`,
    `📅 ${dateStr} · 🕒 ${clockStr}`,
    divider,
    `📦 إجمالي الفعلي: *${totalPhysical.toLocaleString('en-US')}*`,
    `🟢 الرصيد الحر بالمخزن: *${totalFree.toLocaleString('en-US')}*`,
    `👥 الرصيد الموجود لكل عميل: *${totalAllocated.toLocaleString('en-US')}*`,
    `📥 وارد الفترة: *+${periodIn.toLocaleString('en-US')}* | 📤 منصرف الفترة: *-${periodOut.toLocaleString('en-US')}*`,
    divider,
    ...(itemStatusLines.length > 0 ? itemStatusLines : ['▫️ لا توجد أصناف مسجلة حالياً.']),
    divider,
    `👥 *تفاصيل أرصدة العملاء:*`,
    ...(customerLines.length > 0 ? customerLines : ['▫️ لا توجد أرصدة مخصصة لعملاء.']),
    divider,
    `🔄 *سجل الحركات (${filteredMovements.length}):*`,
    ...(movementLines.length > 0 ? movementLines : ['▫️ لا توجد حركات مسجلة في هذه الفترة.']),
    divider,
    ...(alertLines.length > 0
      ? [`🚨 *تنبيهات النقص والحد الأدنى (${alerts.length}):*`, ...alertLines]
      : [`✅ *الحالة العامة:* جميع الأصناف في المستوى الآمن (🟢 لا توجد تنبيهات).`]),
  ];

  return lines.join('\n');
}

export function buildWhatsAppUrl(phone: string, text: string): string {
  const cleanPhone = sanitizeWhatsAppPhone(phone);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

export function clearWarehouseDataKeepConfig(state: WarehouseState): WarehouseState {
  return {
    ...state,
    items: [],
    customers: [],
    allocations: [],
    movements: [],
  };
}

export function parseWarehouseBackupJson(
  rawJson: string,
  currentState: WarehouseState
): OperationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      ok: false,
      error: 'ملف النسخة الاحتياطية غير صالح (صيغة JSON غير صحيحة).',
      state: currentState,
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'بنية ملف النسخة الاحتياطية غير صالحة.',
      state: currentState,
    };
  }

  const candidate = parsed as Partial<WarehouseState>;
  if (
    !Array.isArray(candidate.items) ||
    !Array.isArray(candidate.customers) ||
    !Array.isArray(candidate.allocations) ||
    !Array.isArray(candidate.movements)
  ) {
    return {
      ok: false,
      error: 'الملف لا يحتوي على جداول المخزن المطلوبة (الأصناف، العملاء، التخصيصات، الحركات).',
      state: currentState,
    };
  }

  const incomingSettings =
    candidate.settings && typeof candidate.settings === 'object'
      ? candidate.settings
      : undefined;

  const mergedSettings = incomingSettings
    ? {
        ...currentState.settings,
        ...incomingSettings,
        supabaseUrl: incomingSettings.supabaseUrl || currentState.settings.supabaseUrl,
        supabaseAnonKey: incomingSettings.supabaseAnonKey || currentState.settings.supabaseAnonKey,
      }
    : currentState.settings;

  return {
    ok: true,
    state: {
      items: candidate.items,
      customers: candidate.customers,
      allocations: candidate.allocations,
      movements: candidate.movements,
      users: currentState.users,
      settings: mergedSettings,
    },
  };
}

export function getWelcomeGreeting(
  fullName: string,
  mode: 'login' | 'logout' = 'login'
): { firstName: string; title: string } {
  const clean = fullName.trim();
  const firstName = clean ? clean.split(/\s+/)[0] || clean : 'بك';
  return {
    firstName,
    title: mode === 'logout' ? `إلى اللقاء ${firstName}` : `مرحباً ${firstName}`,
  };
}

export type IntroPersona = 'dalia' | 'mohamed';

export function resolveIntroPersona(
  user?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
  } | null
): IntroPersona {
  if (!user) return 'mohamed';
  const email = (user.email || '').trim().toLowerCase();
  const name = (user.name || '').trim();
  if (
    user.id === 'usr-sup-dalia' ||
    user.role === 'manager' ||
    email.includes('dalia') ||
    name.includes('داليا')
  ) {
    return 'dalia';
  }
  return 'mohamed';
}
