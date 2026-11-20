import * as XLSX from 'xlsx';
import type { DateFilterRange, MovementRecord, WarehouseState } from '../types/warehouse';
import { computeAllItemMetrics, computeCustomerBalances } from './warehouseLogic';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function movementTypeLabel(type: MovementRecord['type']): string {
  switch (type) {
    case 'stock_in':
      return 'إضافة مخزون';
    case 'stock_out':
      return 'صرف مخزون';
    case 'allocation':
      return 'تخصيص لعميل';
    case 'adjustment':
      return 'تعديل رصيد';
    case 'item_create':
      return 'صنف جديد';
    case 'item_delete':
      return 'حذف صنف';
  }
}

function periodLabel(range: DateFilterRange): string {
  switch (range.preset) {
    case 'today':
      return 'اليوم';
    case 'weekly':
      return 'أسبوعي (آخر 7 أيام)';
    case 'monthly':
      return 'شهري (آخر 30 يوماً)';
    case 'all':
      return 'كل الفترات';
    case 'custom':
      return `من ${range.startDate || 'البداية'} إلى ${range.endDate || 'الآن'}`;
  }
}

function makeStyledSheet(
  title: string,
  subtitle: string,
  headers: string[],
  rows: Array<Array<string | number>>,
  colWidths: number[]
): XLSX.WorkSheet {
  const aoa: Array<Array<string | number>> = [
    [title],
    [subtitle],
    [],
    headers,
    ...(rows.length > 0 ? rows : [['لا توجد بيانات مسجلة']]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!views'] = [{ rightToLeft: true }];
  ws['!cols'] = colWidths.map((wch) => ({ wch }));
  const lastCol = Math.max(0, headers.length - 1);
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
  ];
  return ws;
}

export function exportReportToExcel(
  state: WarehouseState,
  filteredMovements: MovementRecord[],
  range: DateFilterRange
): void {
  const wb = XLSX.utils.book_new();
  const metrics = computeAllItemMetrics(state);
  const customerBalances = computeCustomerBalances(state);

  const totalPhysical = metrics.reduce((s, m) => s + m.item.physicalStock, 0);
  const totalAllocated = metrics.reduce((s, m) => s + m.allocatedStock, 0);
  const totalFree = totalPhysical - totalAllocated;
  const totalIn = filteredMovements
    .filter((m) => m.type === 'stock_in')
    .reduce((s, m) => s + Math.abs(m.quantityDelta), 0);
  const totalOut = filteredMovements
    .filter((m) => m.type === 'stock_out')
    .reduce((s, m) => s + Math.abs(m.quantityDelta), 0);

  const reportPeriod = periodLabel(range);
  const issuedAt = new Date().toLocaleString('ar-EG');

  // Sheet 1: Executive Summary & Free Stock
  const summaryRows: Array<Array<string | number>> = [
    ['إجمالي الرصيد الفعلي بالمخزن', totalPhysical, 'وحدة'],
    ['إجمالي المخصص للعملاء', totalAllocated, 'وحدة'],
    ['الرصيد الحر المتاح بالمخزن', totalFree, 'وحدة'],
    ['إجمالي الوارد خلال الفترة', totalIn, 'وحدة'],
    ['إجمالي المنصرف خلال الفترة', totalOut, 'وحدة'],
    ['عدد الحركات المسجلة', filteredMovements.length, 'حركة'],
    [],
    ['تفصيل الرصيد الحر لكل صنف', '', ''],
    ...metrics.map((m) => [`${m.item.name} (${m.item.sku})`, m.freeStock, m.item.unit]),
  ];
  const wsSummary = makeStyledSheet(
    `${state.settings.warehouseName} — الملخص التنفيذي والرصيد الحر`,
    `الفترة: ${reportPeriod} | تاريخ الإصدار: ${issuedAt}`,
    ['البيان / الصنف', 'القيمة / الرصيد الحر', 'الوحدة'],
    summaryRows,
    [40, 22, 16]
  );
  XLSX.utils.book_append_sheet(wb, wsSummary, 'الملخص والرصيد الحر');

  // Sheet 2: Full Stock Inventory
  const itemRows = metrics.map((m) => [
    m.item.sku,
    m.item.name,
    m.item.unit,
    m.item.physicalStock,
    m.allocatedStock,
    m.freeStock,
    m.item.minThreshold,
    m.status === 'zero'
      ? 'نفاد'
      : m.status === 'over_allocated'
      ? 'عجز تخصيص'
      : m.status === 'low'
      ? 'منخفض'
      : 'متاح',
  ]);
  const wsItems = makeStyledSheet(
    `${state.settings.warehouseName} — جرد الأصناف`,
    `إجمالي الأصناف: ${metrics.length} | تاريخ الإصدار: ${issuedAt}`,
    ['كود الصنف', 'اسم الإكسسوار', 'الوحدة', 'الرصيد الفعلي', 'للعملاء', 'الرصيد الحر', 'الحد الأدنى', 'الحالة'],
    itemRows,
    [16, 30, 14, 15, 14, 14, 14, 14]
  );
  XLSX.utils.book_append_sheet(wb, wsItems, 'أرصدة الأصناف');

  // Sheet 3: Customer Balances
  const custRows: Array<Array<string | number>> = [];
  for (const cs of customerBalances) {
    if (cs.allocations.length === 0) {
      custRows.push([cs.customer.code, cs.customer.name, '-', 'لا توجد أرصدة مخصصة', 0, '-']);
    } else {
      for (const a of cs.allocations) {
        custRows.push([
          cs.customer.code,
          cs.customer.name,
          a.item.sku,
          a.item.name,
          a.allocation.quantity,
          a.item.unit,
        ]);
      }
    }
  }
  const wsCustomers = makeStyledSheet(
    `${state.settings.warehouseName} — أرصدة العملاء بالمخزن`,
    `عدد العملاء: ${customerBalances.length} | تاريخ الإصدار: ${issuedAt}`,
    ['كود العميل', 'اسم العميل', 'كود الصنف', 'الإكسسوار', 'الرصيد بالمخزن', 'الوحدة'],
    custRows,
    [14, 28, 16, 30, 16, 14]
  );
  XLSX.utils.book_append_sheet(wb, wsCustomers, 'أرصدة العملاء');

  // Sheet 4: Movement Log
  const movRows = filteredMovements.map((m) => [
    new Date(m.createdAt).toLocaleString('ar-EG'),
    movementTypeLabel(m.type),
    m.itemSku,
    m.itemName,
    m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta,
    m.unit,
    m.beforeStock,
    m.afterStock,
    m.personName,
    m.counterpartyName || '-',
    m.notes || '-',
  ]);
  const wsMovements = makeStyledSheet(
    `${state.settings.warehouseName} — سجل الحركات`,
    `الفترة: ${reportPeriod} | عدد الحركات: ${filteredMovements.length}`,
    [
      'التاريخ والوقت',
      'العملية',
      'الكود',
      'الصنف',
      'الكمية',
      'الوحدة',
      'قبل',
      'بعد',
      'المسؤول',
      'العميل / الوجهة',
      'ملاحظات',
    ],
    movRows,
    [22, 14, 14, 26, 12, 12, 12, 12, 18, 22, 26]
  );
  XLSX.utils.book_append_sheet(wb, wsMovements, 'سجل الحركات');

  const dateTag = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `تقرير-مخزن-الدولية-${dateTag}.xlsx`);
}

export function exportReportToWord(
  state: WarehouseState,
  filteredMovements: MovementRecord[],
  range: DateFilterRange
): void {
  const metrics = computeAllItemMetrics(state);
  const custSummaries = computeCustomerBalances(state).filter((c) => c.totalQuantity > 0);
  const totalPhysical = metrics.reduce((s, m) => s + m.item.physicalStock, 0);
  const totalAllocated = metrics.reduce((s, m) => s + m.allocatedStock, 0);
  const totalFree = totalPhysical - totalAllocated;
  const totalIn = filteredMovements
    .filter((m) => m.type === 'stock_in')
    .reduce((s, m) => s + Math.abs(m.quantityDelta), 0);
  const totalOut = filteredMovements
    .filter((m) => m.type === 'stock_out')
    .reduce((s, m) => s + Math.abs(m.quantityDelta), 0);

  const htmlDoc = `
  <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" dir="rtl" lang="ar">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(state.settings.warehouseName)} — تقرير المخزون</title>
    <style>
      @page { size: A4; margin: 1.6cm; }
      body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; direction: rtl; text-align: right; color: #0f172a; line-height: 1.5; }
      .header-box { background-color: #0b2545; color: #ffffff; padding: 18px 22px; border-radius: 8px; margin-bottom: 18px; }
      .header-box h1 { margin: 0 0 6px 0; font-size: 20px; color: #ffffff; }
      .header-meta { font-size: 12px; color: #cbd5e1; }
      .kpi-table { width: 100%; border-collapse: separate; border-spacing: 8px; margin: 0 -8px 18px -8px; }
      .kpi-cell { width: 25%; background-color: #f8fafc; border: 1px solid #cbd5e1; border-top: 3px solid #1677ff; padding: 10px 12px; text-align: center; }
      .kpi-label { font-size: 11px; color: #475569; margin-bottom: 4px; }
      .kpi-val { font-size: 17px; font-weight: bold; color: #0f172a; }
      .section-title { font-size: 14px; font-weight: bold; color: #0b3b75; background-color: #eff6ff; border-right: 4px solid #1677ff; padding: 7px 12px; margin: 20px 0 10px 0; }
      table.data-table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-bottom: 14px; }
      table.data-table th { background-color: #0f2d52; color: #ffffff; font-weight: bold; padding: 8px; border: 1px solid #1e3a5f; text-align: right; }
      table.data-table td { border: 1px solid #cbd5e1; padding: 7px 8px; text-align: right; vertical-align: middle; }
      table.data-table tr:nth-child(even) td { background-color: #f8fafc; }
      .badge-in { color: #047857; font-weight: bold; }
      .badge-out { color: #b91c1c; font-weight: bold; }
      .badge-warn { color: #b45309; font-weight: bold; }
      .ltr { direction: ltr; unicode-bidi: embed; font-family: Consolas, monospace; }
      .footer-sign { margin-top: 26px; padding-top: 12px; border-top: 1px solid #cbd5e1; font-size: 11.5px; color: #475569; display: flex; justify-content: space-between; }
    </style>
  </head>
  <body>
    <div class="header-box">
      <h1>${escapeHtml(state.settings.warehouseName)} — تقرير المخزون الرسمي</h1>
      <div class="header-meta">
        الفترة: <strong>${escapeHtml(periodLabel(range))}</strong> &nbsp;|&nbsp;
        تاريخ الطباعة: ${escapeHtml(new Date().toLocaleString('ar-EG'))} &nbsp;|&nbsp;
        واتساب: <span class="ltr">${escapeHtml(state.settings.whatsappNumber)}</span>
      </div>
    </div>

    <table class="kpi-table">
      <tr>
        <td class="kpi-cell">
          <div class="kpi-label">الرصيد الحر بالمخزن</div>
          <div class="kpi-val" style="color:#047857;">${totalFree.toLocaleString('en-US')}</div>
        </td>
        <td class="kpi-cell">
          <div class="kpi-label">أرصدة العملاء</div>
          <div class="kpi-val" style="color:#0284c7;">${totalAllocated.toLocaleString('en-US')}</div>
        </td>
        <td class="kpi-cell">
          <div class="kpi-label">وارد الفترة</div>
          <div class="kpi-val badge-in">+${totalIn.toLocaleString('en-US')}</div>
        </td>
        <td class="kpi-cell">
          <div class="kpi-label">منصرف الفترة</div>
          <div class="kpi-val badge-out">-${totalOut.toLocaleString('en-US')}</div>
        </td>
      </tr>
    </table>

    <div class="section-title">أولاً: الرصيد الحر وأصناف المخزن (${metrics.length})</div>
    <table class="data-table">
      <thead>
        <tr>
          <th>الكود</th><th>اسم الإكسسوار</th><th>الوحدة</th><th>الرصيد الفعلي</th><th>للعملاء</th><th>الرصيد الحر</th><th>الحد الأدنى</th><th>الحالة</th>
        </tr>
      </thead>
      <tbody>
        ${
          metrics.length === 0
            ? '<tr><td colspan="8" style="text-align:center;">لا توجد أصناف مسجلة حالياً</td></tr>'
            : metrics
                .map((m) => {
                  const statusTxt =
                    m.status === 'zero'
                      ? '<span class="badge-out">نفاد</span>'
                      : m.status === 'over_allocated'
                      ? '<span class="badge-warn">عجز</span>'
                      : m.status === 'low'
                      ? '<span class="badge-warn">منخفض</span>'
                      : '<span class="badge-in">متاح</span>';
                  return `<tr>
                    <td class="ltr">${escapeHtml(m.item.sku)}</td>
                    <td><strong>${escapeHtml(m.item.name)}</strong></td>
                    <td>${escapeHtml(m.item.unit)}</td>
                    <td>${m.item.physicalStock.toLocaleString('en-US')}</td>
                    <td>${m.allocatedStock.toLocaleString('en-US')}</td>
                    <td><strong>${m.freeStock.toLocaleString('en-US')}</strong></td>
                    <td>${m.item.minThreshold.toLocaleString('en-US')}</td>
                    <td>${statusTxt}</td>
                  </tr>`;
                })
                .join('')
        }
      </tbody>
    </table>

    <div class="section-title">ثانياً: الرصيد الموجود لكل عميل بالمخزن (${custSummaries.length})</div>
    <table class="data-table">
      <thead>
        <tr><th>كود العميل</th><th>اسم العميل</th><th>عدد الأصناف</th><th>إجمالي الرصيد</th><th>تفصيل الإكسسوارات</th></tr>
      </thead>
      <tbody>
        ${
          custSummaries.length === 0
            ? '<tr><td colspan="5" style="text-align:center;">لا توجد أرصدة مخصصة لعملاء حالياً</td></tr>'
            : custSummaries
                .map(
                  (c) => `<tr>
                    <td class="ltr">${escapeHtml(c.customer.code)}</td>
                    <td><strong>${escapeHtml(c.customer.name)}</strong></td>
                    <td>${c.itemsCount}</td>
                    <td><strong>${c.totalQuantity.toLocaleString('en-US')}</strong></td>
                    <td>${c.allocations
                      .map(
                        (a) =>
                          `${escapeHtml(a.item.name)}: <strong>${a.allocation.quantity.toLocaleString('en-US')}</strong> ${escapeHtml(a.item.unit)}`
                      )
                      .join(' &nbsp;|&nbsp; ')}</td>
                  </tr>`
                )
                .join('')
        }
      </tbody>
    </table>

    <div class="section-title">ثالثاً: سجل الحركات (${filteredMovements.length})</div>
    <table class="data-table">
      <thead>
        <tr><th>التاريخ والوقت</th><th>العملية</th><th>الصنف</th><th>الكمية</th><th>قبل ← بعد</th><th>المسؤول</th><th>الجهة / العميل</th></tr>
      </thead>
      <tbody>
        ${
          filteredMovements.length === 0
            ? '<tr><td colspan="7" style="text-align:center;">لا توجد حركات مسجلة في هذه الفترة</td></tr>'
            : filteredMovements
                .map(
                  (m) => `<tr>
                    <td>${escapeHtml(new Date(m.createdAt).toLocaleString('ar-EG'))}</td>
                    <td>${escapeHtml(movementTypeLabel(m.type))}</td>
                    <td>${escapeHtml(m.itemName)} <span class="ltr">(${escapeHtml(m.itemSku)})</span></td>
                    <td class="${m.quantityDelta > 0 ? 'badge-in' : 'badge-out'}">
                      <span class="ltr">${m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}</span> ${escapeHtml(m.unit)}
                    </td>
                    <td>${m.beforeStock} ← <strong>${m.afterStock}</strong></td>
                    <td><strong>${escapeHtml(m.personName)}</strong></td>
                    <td>${escapeHtml(m.counterpartyName || '—')}</td>
                  </tr>`
                )
                .join('')
        }
      </tbody>
    </table>

    <div class="footer-sign">
      <span>تم إعداد التقرير آلياً من نظام ${escapeHtml(state.settings.warehouseName)}</span>
      <span>اعتماد الإدارة: محمد رضا</span>
    </div>
  </body>
  </html>`;

  const blob = new Blob(['\ufeff', htmlDoc], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `تقرير-مخزن-الدولية-${new Date().toISOString().slice(0, 10)}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportBackupJson(state: WarehouseState): void {
  const safeCopy = {
    ...state,
    users: state.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      createdAt: u.createdAt,
    })),
    settings: {
      ...state.settings,
      supabaseAnonKey: '',
    },
  };
  const blob = new Blob([JSON.stringify(safeCopy, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dawliya-warehouse-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
