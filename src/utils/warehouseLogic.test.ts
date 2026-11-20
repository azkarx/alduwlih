import assert from 'node:assert/strict';
import test from 'node:test';
import { ALLOWED_OPERATORS, createInitialWarehouseState } from '../data/seedData';
import type { WarehouseState } from '../types/warehouse';
import {
  adjustItemBalance,
  allocateStockToCustomer,
  applyStockIn,
  applyStockOut,
  buildMovementChartData,
  buildWhatsAppReportText,
  buildWhatsAppUrl,
  clearWarehouseDataKeepConfig,
  computeAllCustomersUnitTotals,
  computeAlerts,
  computeCustomerBalances,
  computeItemMetrics,
  createItemInState,
  deleteItemFromState,
  filterMovementsByDateRange,
  getCustomerAllocationQty,
  getWelcomeGreeting,
  groupUnitTotals,
  parseWarehouseBackupJson,
  resolveIntroPersona,
  sanitizeWhatsAppPhone,
} from './warehouseLogic';

test('builds seven local-day chart buckets and counts only stock-in/out movements', () => {
  const now = new Date(2026, 10, 20, 12);
  const today = new Date(2026, 10, 20, 0, 30);
  const yesterday = new Date(2026, 10, 19, 23, 30);
  const outsideRange = new Date(2026, 10, 13, 12);
  const makeMovement = (
    id: string,
    type: WarehouseState['movements'][number]['type'],
    quantityDelta: number,
    createdAt: string
  ): WarehouseState['movements'][number] => ({
    id,
    type,
    itemId: 'item-1',
    itemName: 'اختبار',
    itemSku: 'TEST-1',
    unit: 'قطعة',
    quantityDelta,
    beforeStock: 0,
    afterStock: quantityDelta,
    personName: 'محمد رضا',
    createdAt,
  });
  const movements: WarehouseState['movements'] = [
    makeMovement('in-today', 'stock_in', 25, today.toISOString()),
    makeMovement('out-yesterday', 'stock_out', -8, yesterday.toISOString()),
    makeMovement('adjustment-today', 'adjustment', 50, today.toISOString()),
    makeMovement('in-outside', 'stock_in', 99, outsideRange.toISOString()),
  ];

  const days = buildMovementChartData(movements, now);
  assert.equal(days.length, 7);
  assert.equal(days[6].key, `${now.getFullYear()}-11-20`);
  assert.equal(days[6].inQty, 25);
  assert.equal(days[6].outQty, 0);
  assert.equal(days[5].outQty, 8);
  assert.equal(days[0].inQty, 0);
});

function createPopulatedTestState(): WarehouseState {
  let state = createInitialWarehouseState();
  state = {
    ...state,
    customers: [
      {
        id: 'cust-1',
        code: 'CL-101',
        name: 'مصنع النيل للملابس',
        phone: '+20 100 000 0001',
        contactPerson: 'م. طارق',
        productionLine: 'خط القميص',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'cust-2',
        code: 'CL-102',
        name: 'شركة الدلتا جينز',
        phone: '+20 100 000 0002',
        contactPerson: 'أ. كريم',
        productionLine: 'خط الجينز',
        createdAt: new Date().toISOString(),
      },
    ],
  };

  state = createItemInState(
    state,
    {
      sku: 'BTN-BLK-18',
      barcode: '6221000101018',
      name: 'زرار قميص أسود',
      category: 'أزرار',
      unit: 'قطعة',
      color: 'أسود',
      sizeSpec: '18L',
      rack: 'A-01-01',
      physicalStock: 4200,
      minThreshold: 800,
    },
    'محمد رضا'
  ).state;

  state = createItemInState(
    state,
    {
      sku: 'ZIP-YKK-20',
      barcode: '6221000202020',
      name: 'سوستة جينز نحاس',
      category: 'سوست وسحابات',
      unit: 'قطعة',
      color: 'نحاسي',
      sizeSpec: '20cm',
      rack: 'B-02-04',
      physicalStock: 950,
      minThreshold: 400,
    },
    'ملك عيد'
  ).state;

  state = createItemInState(
    state,
    {
      sku: 'LBL-SZE-MX',
      barcode: '6221000505001',
      name: 'تيكت مقاسات',
      category: 'تيكت ومقاسات',
      unit: 'قطعة',
      color: 'أبيض',
      sizeSpec: 'S-XL',
      rack: 'D-01-03',
      physicalStock: 0,
      minThreshold: 500,
    },
    'محمد رضا'
  ).state;

  const btnItem = state.items.find((i) => i.sku === 'BTN-BLK-18')!;
  const zipItem = state.items.find((i) => i.sku === 'ZIP-YKK-20')!;

  state = allocateStockToCustomer(state, {
    customerId: 'cust-1',
    itemId: btnItem.id,
    quantity: 1800,
    personName: 'محمد رضا',
  }).state;

  state = allocateStockToCustomer(state, {
    customerId: 'cust-2',
    itemId: zipItem.id,
    quantity: 550,
    personName: 'ملك عيد',
  }).state;

  return state;
}

test('initial warehouse state starts empty without client-side accounts', () => {
  const clean = createInitialWarehouseState();
  assert.equal(clean.items.length, 0);
  assert.equal(clean.customers.length, 0);
  assert.equal(clean.allocations.length, 0);
  assert.equal(clean.movements.length, 0);
  assert.deepEqual([...ALLOWED_OPERATORS], ['محمد رضا', 'ملك عيد']);

  assert.equal(clean.users.length, 0);
});

test('applyStockIn adds physical stock and optionally customer allocation with operator name', () => {
  const initial = createPopulatedTestState();
  const btn = initial.items.find((i) => i.sku === 'BTN-BLK-18')!;
  const beforePhysical = btn.physicalStock;
  const beforeCustQty = getCustomerAllocationQty(initial.allocations, 'cust-1', btn.id);

  const res = applyStockIn(initial, {
    itemId: btn.id,
    quantity: 500,
    personName: 'ملك عيد',
    customerId: 'cust-1',
    notes: 'توريد إضافي للعميل',
  });

  assert.equal(res.ok, true);
  const updatedItem = res.state.items.find((i) => i.id === btn.id)!;
  assert.equal(updatedItem.physicalStock, beforePhysical + 500);
  assert.equal(getCustomerAllocationQty(res.state.allocations, 'cust-1', btn.id), beforeCustQty + 500);
  assert.equal(res.movement?.personName, 'ملك عيد');
  assert.equal(res.movement?.quantityDelta, 500);
});

test('applyStockOut deducts automatically from customer allocation and physical stock', () => {
  const initial = createPopulatedTestState();
  const zip = initial.items.find((i) => i.sku === 'ZIP-YKK-20')!;
  const beforePhysical = zip.physicalStock;
  const beforeCust = getCustomerAllocationQty(initial.allocations, 'cust-2', zip.id);

  const res = applyStockOut(initial, {
    itemId: zip.id,
    quantity: 150,
    personName: 'محمد رضا',
    source: 'customer_allocation',
    customerId: 'cust-2',
  });

  assert.equal(res.ok, true);
  assert.equal(res.state.items.find((i) => i.id === zip.id)!.physicalStock, beforePhysical - 150);
  assert.equal(getCustomerAllocationQty(res.state.allocations, 'cust-2', zip.id), beforeCust - 150);
  assert.equal(res.movement?.quantityDelta, -150);
  assert.equal(res.movement?.personName, 'محمد رضا');
});

test('applyStockOut rejects zero-stock item and over-deduction', () => {
  const initial = createPopulatedTestState();
  const zeroItem = initial.items.find((i) => i.sku === 'LBL-SZE-MX')!;
  const zipItem = initial.items.find((i) => i.sku === 'ZIP-YKK-20')!;
  const btnItem = initial.items.find((i) => i.sku === 'BTN-BLK-18')!;

  const zeroRes = applyStockOut(initial, {
    itemId: zeroItem.id,
    quantity: 10,
    personName: 'محمد رضا',
    source: 'free_stock',
  });
  assert.equal(zeroRes.ok, false);

  const overCustRes = applyStockOut(initial, {
    itemId: zipItem.id,
    quantity: 900,
    personName: 'ملك عيد',
    source: 'customer_allocation',
    customerId: 'cust-2',
  });
  assert.equal(overCustRes.ok, false);

  const overFreeRes = applyStockOut(initial, {
    itemId: btnItem.id,
    quantity: 3000, // physical 4200, allocated 1800 -> free 2400
    personName: 'محمد رضا',
    source: 'free_stock',
  });
  assert.equal(overFreeRes.ok, false);
});

test('adjustItemBalance triggers alerts accurately and deleteItemFromState cleans up allocations', () => {
  let state = createPopulatedTestState();
  const created = createItemInState(
    state,
    {
      sku: 'THR-WHT-01',
      barcode: '6220000111222',
      name: 'خيط أبيض',
      category: 'خيوط خياطة',
      unit: 'بكرة',
      color: 'أبيض',
      sizeSpec: '40/2',
      rack: 'C-01-01',
      physicalStock: 500,
      minThreshold: 300,
    },
    'محمد رضا'
  );
  state = created.state;
  const threadItem = state.items.find((i) => i.sku === 'THR-WHT-01')!;
  const lowRes = adjustItemBalance(state, {
    itemId: threadItem.id,
    newPhysicalStock: 250,
    personName: 'ملك عيد',
  });
  assert.equal(lowRes.ok, true);
  state = lowRes.state;

  const lowAlert = computeAlerts(state).find((a) => a.itemId === threadItem.id);
  assert.ok(lowAlert && lowAlert.severity === 'low');

  const btnItem = state.items.find((i) => i.sku === 'BTN-BLK-18')!;
  const metrics = computeItemMetrics(btnItem, state.allocations);
  assert.equal(metrics.allocatedStock, 1800);
  assert.equal(metrics.freeStock, 2400);

  const custSummaries = computeCustomerBalances(state);
  const cust1 = custSummaries.find((c) => c.customer.id === 'cust-1')!;
  assert.ok(cust1.allocations.some((a) => a.item.id === btnItem.id));

  const delRes = deleteItemFromState(state, btnItem.id, 'محمد رضا');
  assert.equal(delRes.ok, true);
  assert.equal(delRes.state.items.some((i) => i.id === btnItem.id), false);
  assert.equal(delRes.state.allocations.some((a) => a.itemId === btnItem.id), false);
});

test('filterMovementsByDateRange and WhatsApp report builder format Emojis (🟢, ⚠️, 🔴, ❗) and handle +20 11 04155183', () => {
  let state = createPopulatedTestState();
  // 1) Push ZIP-YKK-20 (550 allocated) below allocation -> ❗ over_allocated
  const zip = state.items.find((i) => i.sku === 'ZIP-YKK-20')!;
  state = adjustItemBalance(state, {
    itemId: zip.id,
    newPhysicalStock: 350,
    personName: 'محمد رضا',
  }).state;

  // 2) Add an unallocated item below minThreshold -> ⚠️ low
  state = createItemInState(
    state,
    {
      sku: 'THR-LOW-01',
      barcode: '',
      name: 'خيط أوفر',
      category: 'خيوط خياطة',
      unit: 'بكرة',
      color: 'أسود',
      sizeSpec: '',
      rack: 'C-02-01',
      physicalStock: 120,
      minThreshold: 200,
    },
    'ملك عيد'
  ).state;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  const customFiltered = filterMovementsByDateRange(state.movements, {
    preset: 'custom',
    startDate: todayStr,
    endDate: todayStr,
  });
  assert.ok(customFiltered.length >= 1);

  assert.equal(sanitizeWhatsAppPhone('+20 11 04155183'), '201104155183');
  const text = buildWhatsAppReportText(state, { preset: 'weekly' }, state.movements);
  assert.match(text, /🏭 \*إدارة مخزن الدولية\*/);
  assert.match(text, /🟢 الرصيد الحر بالمخزن:/);
  assert.match(text, /🟢 \*زرار قميص أسود\*/);
  assert.match(text, /⚠️ \*خيط أوفر\*/);
  assert.match(text, /❗ \*سوستة جينز نحاس\*/);
  assert.match(text, /🔴 \*تيكت مقاسات\*/);
  assert.match(text, /تفاصيل أرصدة العملاء/);
  assert.match(text, /سجل الحركات/);
  assert.match(text, /تنبيهات النقص والحد الأدنى/);
  assert.doesNotMatch(text, /ملخص الأرصدة وحركة الفترة/);
  assert.doesNotMatch(text, /حالة الأصناف بالمخزن/);
  const url = buildWhatsAppUrl(state.settings.whatsappNumber, text);
  assert.ok(url.startsWith('https://wa.me/201104155183?text='));
});

test('createItemInState with custom unit and customerId assigns balance straight to customer', () => {
  const initial = createPopulatedTestState();
  const created = createItemInState(
    initial,
    {
      sku: 'BTN-PRL-01',
      barcode: '',
      name: 'زرار صدف فاخر',
      category: 'عام',
      unit: 'زرار',
      color: '',
      sizeSpec: '',
      rack: '-',
      physicalStock: 2000,
      minThreshold: 200,
    },
    'ملك عيد',
    'cust-1'
  );

  assert.equal(created.ok, true);
  const newItem = created.state.items.find((i) => i.sku === 'BTN-PRL-01')!;
  assert.equal(newItem.unit, 'زرار');
  assert.equal(newItem.physicalStock, 2000);
  assert.equal(getCustomerAllocationQty(created.state.allocations, 'cust-1', newItem.id), 2000);

  const metrics = computeItemMetrics(newItem, created.state.allocations);
  assert.equal(metrics.freeStock, 0);
  assert.equal(metrics.allocatedStock, 2000);
});

test('customer balances group totals by unit and duplicate SKU or item name is rejected', () => {
  let state = createPopulatedTestState();

  // Add another item with unit زرار and one with كيس
  state = createItemInState(
    state,
    {
      sku: 'BTN-SLV-01',
      barcode: '',
      name: 'زرار فضي',
      category: 'عام',
      unit: 'زرار',
      color: '',
      sizeSpec: '',
      rack: '-',
      physicalStock: 1200,
      minThreshold: 100,
    },
    'محمد رضا',
    'cust-1'
  ).state;

  state = createItemInState(
    state,
    {
      sku: 'BTN-GLD-01',
      barcode: '',
      name: 'زرار ذهبي',
      category: 'عام',
      unit: 'زرار',
      color: '',
      sizeSpec: '',
      rack: '-',
      physicalStock: 800,
      minThreshold: 100,
    },
    'ملك عيد',
    'cust-1'
  ).state;

  state = createItemInState(
    state,
    {
      sku: 'BAG-OP-01',
      barcode: '',
      name: 'كيس تغليف',
      category: 'عام',
      unit: 'كيس',
      color: '',
      sizeSpec: '',
      rack: '-',
      physicalStock: 50,
      minThreshold: 10,
    },
    'ملك عيد',
    'cust-1'
  ).state;

  // Duplicate SKU rejected
  const dupSku = createItemInState(
    state,
    {
      sku: 'btn-slv-01',
      barcode: '',
      name: 'صنف مختلف',
      category: 'عام',
      unit: 'زرار',
      color: '',
      sizeSpec: '',
      rack: '-',
      physicalStock: 100,
      minThreshold: 10,
    },
    'محمد رضا'
  );
  assert.equal(dupSku.ok, false);

  // Duplicate item name rejected
  const dupName = createItemInState(
    state,
    {
      sku: 'NEW-UNQ-99',
      barcode: '',
      name: 'زرار فضي',
      category: 'عام',
      unit: 'زرار',
      color: '',
      sizeSpec: '',
      rack: '-',
      physicalStock: 100,
      minThreshold: 10,
    },
    'محمد رضا'
  );
  assert.equal(dupName.ok, false);

  const balances = computeCustomerBalances(state);
  const cust1 = balances.find((b) => b.customer.id === 'cust-1')!;
  // cust-1 has: 1800 قطعة (BTN-BLK-18), 1200 + 800 = 2000 زرار, 50 كيس
  assert.deepEqual(cust1.unitTotals, [
    { unit: 'قطعة', total: 1800 },
    { unit: 'زرار', total: 2000 },
    { unit: 'كيس', total: 50 },
  ]);

  const allTotals = computeAllCustomersUnitTotals(balances);
  assert.deepEqual(allTotals, [
    { unit: 'قطعة', total: 2350 },
    { unit: 'زرار', total: 2000 },
    { unit: 'كيس', total: 50 },
  ]);

  assert.deepEqual(
    groupUnitTotals([
      { unit: 'زرار', quantity: 100 },
      { unit: ' زرار ', quantity: 250 },
      { unit: 'قطعة', quantity: 40 },
    ]),
    [
      { unit: 'زرار', total: 350 },
      { unit: 'قطعة', total: 40 },
    ]
  );
});

test('clearWarehouseDataKeepConfig wipes warehouse data while keeping users & settings, and parseWarehouseBackupJson restores safely', () => {
  const populated = createPopulatedTestState();
  const safeExportJson = JSON.stringify({
    ...populated,
    users: [],
    settings: { ...populated.settings, supabaseAnonKey: '' },
  });

  const cleared = clearWarehouseDataKeepConfig(populated);
  assert.equal(cleared.items.length, 0);
  assert.equal(cleared.customers.length, 0);
  assert.equal(cleared.allocations.length, 0);
  assert.equal(cleared.movements.length, 0);
  assert.equal(cleared.users.length, populated.users.length);
  assert.equal(cleared.settings.warehouseName, populated.settings.warehouseName);

  const restored = parseWarehouseBackupJson(safeExportJson, cleared);
  assert.equal(restored.ok, true);
  assert.equal(restored.state.items.length, populated.items.length);
  assert.equal(restored.state.customers.length, populated.customers.length);
  assert.equal(restored.state.settings.supabaseAnonKey, populated.settings.supabaseAnonKey);

  assert.deepEqual(restored.state.users, cleared.users);

  const badJson = parseWarehouseBackupJson('{broken-json', cleared);
  assert.equal(badJson.ok, false);
});

test('getWelcomeGreeting formats Mohamed and Dalia login and logout intro greetings cleanly', () => {
  assert.deepEqual(getWelcomeGreeting('محمد رضا'), {
    firstName: 'محمد',
    title: 'مرحباً محمد',
  });
  assert.deepEqual(getWelcomeGreeting('داليا محمد'), {
    firstName: 'داليا',
    title: 'مرحباً داليا',
  });
  assert.deepEqual(getWelcomeGreeting('محمد رضا', 'logout'), {
    firstName: 'محمد',
    title: 'إلى اللقاء محمد',
  });
  assert.deepEqual(getWelcomeGreeting('داليا محمد', 'logout'), {
    firstName: 'داليا',
    title: 'إلى اللقاء داليا',
  });
  assert.deepEqual(getWelcomeGreeting(''), {
    firstName: 'بك',
    title: 'مرحباً بك',
  });
});

test('resolveIntroPersona reliably identifies Dalia across role, id, email, and Arabic name', () => {
  assert.equal(
    resolveIntroPersona({
      id: 'usr-sup-dalia',
      name: 'داليا محمد',
      email: 'Dalia_Mohamed@alduwlih.com',
      role: 'manager',
    }),
    'dalia'
  );
  assert.equal(
    resolveIntroPersona({ id: 'custom-1', name: 'داليا', email: 'test@x.com', role: 'admin' }),
    'dalia'
  );
  assert.equal(
    resolveIntroPersona({ id: 'custom-2', name: 'مشرف', email: 'dalia.sup@x.com', role: 'admin' }),
    'dalia'
  );
  assert.equal(
    resolveIntroPersona({ id: 'custom-3', name: 'مراقب', email: 'sup@x.com', role: 'manager' }),
    'dalia'
  );
  assert.equal(
    resolveIntroPersona({
      id: 'usr-admin-mohamed',
      name: 'محمد رضا',
      email: 'Mohamed_reda@.book',
      role: 'admin',
    }),
    'mohamed'
  );
  assert.equal(resolveIntroPersona(null), 'mohamed');
});
