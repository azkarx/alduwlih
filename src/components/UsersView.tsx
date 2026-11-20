import React from 'react';
import type { WarehouseState } from '../types/warehouse';
import { formatDateTime } from './UiShared';

interface UsersViewProps {
  state: WarehouseState;
  currentUserId: string;
  isAdmin: boolean;
}

export const UsersView: React.FC<UsersViewProps> = ({ state, currentUserId, isAdmin }) => (
  <div className="space-y-5">
    <div className="glass-card rounded-2xl p-4">
      <h2 className="text-[16px] font-bold text-white">المستخدمون والصلاحيات</h2>
      <p className="mt-1 text-[12px] text-[#8FA6C3]">
        تُدار الحسابات وكلمات المرور من Supabase Authentication، ولا تُحفظ كلمات المرور داخل التطبيق.
      </p>
    </div>

    <div className="glass-card overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <table className="w-full text-right text-[13px]">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 text-[12px] text-[#8FA6C3]">
              <th className="px-4 py-3 font-semibold">الاسم</th>
              <th className="px-4 py-3 font-semibold">البريد الإلكتروني</th>
              <th className="px-4 py-3 font-semibold">الصلاحية</th>
              <th className="px-4 py-3 font-semibold">الحالة</th>
              <th className="px-4 py-3 font-semibold">الإنشاء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {state.users.map((user) => (
              <tr key={user.id} className="transition-colors duration-150 hover:bg-[#1677FF]/[0.1]">
                <td className="px-4 py-3 font-semibold text-white">
                  {user.name} {user.id === currentUserId ? '(أنت)' : ''}
                </td>
                <td dir="ltr" className="px-4 py-3 font-mono text-[12px] text-[#c1c6d7]">
                  {user.email}
                </td>
                <td className="px-4 py-3 text-[12px] font-semibold text-[#afc6ff]">
                  {user.role === 'admin' ? 'مدير النظام' : 'مشرف مستودع (عرض فقط)'}
                </td>
                <td className="px-4 py-3 text-[12px] font-semibold text-[#10B981]">
                  {user.active ? 'نشط' : 'معطل'}
                </td>
                <td className="px-4 py-3 text-[12px] text-[#8FA6C3]">
                  {formatDateTime(user.createdAt)}
                </td>
              </tr>
            ))}
            {state.users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-[#8FA6C3]">
                  لا توجد حسابات مسموح بعرضها.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    {isAdmin && (
      <p className="text-[12px] text-[#8FA6C3]">
        لإضافة مستخدم أو تغيير صلاحياته، أضف حسابًا في Supabase Authentication ثم حدّث ملفه في جدول
        <span dir="ltr" className="mx-1 font-mono">user_profiles</span>.
      </p>
    )}
  </div>
);
