import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { ALLOWED_OPERATORS } from '../data/seedData';
import type { ItemComputedMetrics, MovementType, OperatorName } from '../types/warehouse';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

export function formatNum(n: number): string {
  return Number(n || 0).toLocaleString('en-US');
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('ar-EG')} · ${d.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function movementMeta(type: MovementType): {
  label: string;
  icon: string;
  colorClass: string;
} {
  switch (type) {
    case 'stock_in':
      return { label: 'إضافة', icon: 'add_box', colorClass: 'text-[#10B981]' };
    case 'stock_out':
      return { label: 'صرف', icon: 'outbox', colorClass: 'text-[#EF4444]' };
    case 'allocation':
      return { label: 'تخصيص', icon: 'assignment_ind', colorClass: 'text-[#20C5E8]' };
    case 'adjustment':
      return { label: 'تعديل رصيد', icon: 'tune', colorClass: 'text-[#F59E0B]' };
    case 'item_create':
      return { label: 'صنف جديد', icon: 'new_label', colorClass: 'text-[#1677FF]' };
    case 'item_delete':
      return { label: 'حذف صنف', icon: 'delete', colorClass: 'text-[#EF4444]' };
  }
}

interface ClickRipplePoint {
  id: number;
  x: number;
  y: number;
  tone: 'cyan' | 'rose';
}

export const ClickRippleLayer: React.FC<{ isDalia?: boolean }> = ({ isDalia = false }) => {
  const [ripples, setRipples] = useState<ClickRipplePoint[]>([]);

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    let counter = 0;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const interactive = target.closest(
        'button, a[href], select, input[type="checkbox"], [role="button"], tr.cursor-pointer'
      );
      if (!interactive) return;
      const x = e.clientX;
      const y = e.clientY;
      if (x <= 0 && y <= 0) return;
      counter += 1;
      const id = counter;
      setRipples((prev) => [...prev.slice(-5), { id, x, y, tone: isDalia ? 'rose' : 'cyan' }]);
      window.setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 460);
    };
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isDalia]);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden no-print"
      aria-hidden="true"
    >
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            initial={{ opacity: 0.72, scale: 0.25 }}
            animate={{ opacity: 0, scale: 2.35 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            style={{ left: r.x - 18, top: r.y - 18 }}
            className={`absolute h-9 w-9 rounded-full border-2 ${
              r.tone === 'rose'
                ? 'border-[#f472b6]/80 bg-[#ec4899]/20 shadow-[0_0_16px_rgba(244,114,182,0.45)]'
                : 'border-[#46dafd]/80 bg-[#20C5E8]/20 shadow-[0_0_16px_rgba(70,218,253,0.45)]'
            }`}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

export const OperatorSelector: React.FC<{
  value: string;
  onChange: (name: OperatorName) => void;
  label?: string;
}> = ({ value, onChange, label = 'المسؤول عن العملية' }) => {
  return (
    <div>
      <span className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">{label} *</span>
      <div className="grid grid-cols-2 gap-2.5">
        {ALLOWED_OPERATORS.map((op) => {
          const active = value === op;
          return (
            <motion.button
              key={op}
              type="button"
              onClick={() => onChange(op)}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              className={`flex h-10 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition-all duration-150 ${
                active
                  ? 'border-[#20C5E8] bg-gradient-to-l from-[#1677FF]/35 to-[#20C5E8]/25 text-white shadow-[0_4px_16px_rgba(32,197,232,0.22)]'
                  : 'border-white/10 bg-[#071426]/65 text-[#8FA6C3] hover:border-[#46dafd]/40 hover:bg-[#102947]/70 hover:text-white active:bg-[#1677FF]/15'
              }`}
            >
              <span className="material-symbols-outlined text-[17px]">
                {active ? 'check_circle' : 'person'}
              </span>
              <span>{op}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export function StockStatusTag({ status }: { status: ItemComputedMetrics['status'] }) {
  if (status === 'zero') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#EF4444]/40 bg-[#EF4444]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#EF4444] transition-transform duration-150 hover:scale-105">
        <span className="material-symbols-outlined text-[14px]">error</span>
        نفاد
      </span>
    );
  }
  if (status === 'over_allocated') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#F59E0B] transition-transform duration-150 hover:scale-105">
        <span className="material-symbols-outlined text-[14px]">warning</span>
        عجز
      </span>
    );
  }
  if (status === 'low') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#F59E0B] transition-transform duration-150 hover:scale-105">
        <span className="material-symbols-outlined text-[14px]">trending_down</span>
        منخفض
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#10B981]/35 bg-[#10B981]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#10B981] transition-transform duration-150 hover:scale-105">
      <span className="material-symbols-outlined text-[14px]">check_circle</span>
      متاح
    </span>
  );
}

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  message,
  confirmLabel = 'تأكيد',
  danger = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onCancel();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="glass-card w-full max-w-md rounded-2xl p-6 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                  danger
                    ? 'border-[#EF4444]/40 bg-[#EF4444]/15 text-[#EF4444]'
                    : 'border-[#1677FF]/40 bg-[#1677FF]/15 text-[#1677FF]'
                }`}
              >
                <span className="material-symbols-outlined">{danger ? 'delete_forever' : 'help'}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-white">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#c1c6d7]">{message}</p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-[#d7e3fc] hover:border-white/30 hover:bg-white/10 hover:text-white active:scale-95"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`shine-cta rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg ${
                  danger
                    ? 'bg-[#EF4444] hover:bg-[#dc2626] hover:shadow-[#EF4444]/30'
                    : 'bg-[#1677FF] hover:bg-[#2F86FF]'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const ToastStack: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-5 left-5 z-50 flex max-w-sm flex-col gap-2 no-print" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: -24, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.94 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl ${
              t.type === 'error'
                ? 'border-[#EF4444]/50 bg-[#2A161E]/92 text-[#ffdad6]'
                : t.type === 'success'
                ? 'border-[#10B981]/50 bg-[#0d2b25]/92 text-[#d1fae5]'
                : 'border-[#20C5E8]/50 bg-[#102947]/92 text-[#d7e3fc]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">
                {t.type === 'error' ? 'error' : t.type === 'success' ? 'check_circle' : 'info'}
              </span>
              <span>{t.text}</span>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="إغلاق الإشعار"
              className="rounded-lg p-1 text-current opacity-70 hover:bg-white/10 hover:opacity-100 active:scale-90"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
