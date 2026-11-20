import React, { useMemo, useState } from 'react';
import type { MovementType, ReportPreset, WarehouseState } from '../types/warehouse';
import { filterMovementsByDateRange } from '../utils/warehouseLogic';
import { formatDateTime, formatNum, movementMeta } from './UiShared';

interface MovementsViewProps {
  state: WarehouseState;
}

export const MovementsView: React.FC<MovementsViewProps> = ({ state }) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | MovementType>('all');
  const [preset, setPreset] = useState<ReportPreset>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filtered = useMemo(() => {
    const byDate = filterMovementsByDateRange(state.movements, { preset, startDate, endDate });
    const q = search.trim().toLowerCase();
    return byDate.filter((m) => {
      if (typeFilter !== 'all' && m.type !== typeFilter) return false;
      if (!q) return true;
      return (
        m.itemName.toLowerCase().includes(q) ||
        m.itemSku.toLowerCase().includes(q) ||
        m.personName.toLowerCase().includes(q) ||
        (m.counterpartyName || '').toLowerCase().includes(q) ||
        (m.notes || '').toLowerCase().includes(q)
      );
    });
  }, [state.movements, search, typeFilter, preset, startDate, endDate]);

  return (
    <div className="space-y-5">
      <div className="glass-card space-y-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-2.5 text-[18px] text-[#8FA6C3]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالصنف، الكود، أو المسؤول..."
              className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/65 pr-9 pl-3 text-sm text-white placeholder-[#4B6485] outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd] focus:shadow-[0_0_0_3px_rgba(70,218,253,0.14)]"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | MovementType)}
            aria-label="نوع الحركة"
            className="h-10 rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
          >
            <option value="all">كل الحركات</option>
            <option value="stock_in">إضافة</option>
            <option value="stock_out">صرف</option>
            <option value="allocation">تخصيص</option>
            <option value="adjustment">تعديل رصيد</option>
            <option value="item_create">صنف جديد</option>
            <option value="item_delete">حذف صنف</option>
          </select>

          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as ReportPreset)}
            aria-label="الفترة الزمنية"
            className="h-10 rounded-xl border border-white/15 bg-[#071426]/65 px-3 text-sm text-white outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd]"
          >
            <option value="all">كل الفترات</option>
            <option value="today">اليوم</option>
            <option value="weekly">أسبوعي</option>
            <option value="monthly">شهري</option>
            <option value="custom">مخصص</option>
          </select>
        </div>

        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3 text-sm">
            <label className="flex items-center gap-2 text-[#c1c6d7]">
              <span>من:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 rounded-xl border border-white/15 bg-[#071426]/65 px-2.5 text-white outline-none focus:border-[#46dafd]"
              />
            </label>
            <label className="flex items-center gap-2 text-[#c1c6d7]">
              <span>إلى:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 rounded-xl border border-white/15 bg-[#071426]/65 px-2.5 text-white outline-none focus:border-[#46dafd]"
              />
            </label>
          </div>
        )}
      </div>

      <div className="glass-card overflow-hidden rounded-2xl">
        <div className="border-b border-white/10 bg-white/5 px-4 py-3 text-[12.5px] text-[#8FA6C3]">
          عدد الحركات: <strong className="tabular-nums text-white">{filtered.length}</strong>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[13px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-[12px] text-[#8FA6C3]">
                <th className="px-4 py-3 font-semibold">التاريخ</th>
                <th className="px-4 py-3 font-semibold">العملية</th>
                <th className="px-4 py-3 font-semibold">الصنف</th>
                <th className="px-4 py-3 font-semibold">الكمية</th>
                <th className="px-4 py-3 font-semibold">الرصيد</th>
                <th className="px-4 py-3 font-semibold">المسؤول</th>
                <th className="px-4 py-3 font-semibold">العميل / الجهة</th>
                <th className="px-4 py-3 font-semibold">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[#8FA6C3]">
                    لا توجد حركات مسجلة.
                  </td>
                </tr>
              ) : (
                filtered.map((m) => {
                  const meta = movementMeta(m.type);
                  return (
                    <tr
                      key={m.id}
                      className="transition-colors duration-150 hover:bg-[#1677FF]/[0.1] active:bg-[#1677FF]/[0.18]"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-[12px] text-[#c1c6d7]">
                        {formatDateTime(m.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 font-semibold ${meta.colorClass}`}>
                          <span className="material-symbols-outlined text-[16px]">{meta.icon}</span>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{m.itemName}</div>
                        <div dir="ltr" className="font-mono text-[11px] text-[#8FA6C3]">
                          {m.itemSku}
                        </div>
                      </td>
                      <td
                        className={`tabular-nums px-4 py-3 font-bold ${
                          m.quantityDelta > 0
                            ? 'text-[#10B981]'
                            : m.quantityDelta < 0
                            ? 'text-[#EF4444]'
                            : 'text-[#8FA6C3]'
                        }`}
                      >
                        <span dir="ltr" className="inline-block">
                          {m.quantityDelta > 0 ? `+${formatNum(m.quantityDelta)}` : formatNum(m.quantityDelta)}
                        </span>{' '}
                        {m.unit}
                      </td>
                      <td className="tabular-nums px-4 py-3 text-[12px] text-[#d7e3fc]">
                        {formatNum(m.beforeStock)} ← <strong className="text-white">{formatNum(m.afterStock)}</strong>
                      </td>
                      <td className="px-4 py-3 font-medium text-white">{m.personName}</td>
                      <td className="px-4 py-3 text-[#20C5E8]">{m.counterpartyName || '—'}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-[12px] text-[#8FA6C3]">
                        {m.notes || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
