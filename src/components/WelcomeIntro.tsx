import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';
import type { WarehouseUser } from '../types/warehouse';
import { USER_AVATARS } from '../utils/userAvatars';
import { getWelcomeGreeting, resolveIntroPersona } from '../utils/warehouseLogic';

interface WelcomeIntroProps {
  user: WarehouseUser | null;
  mode?: 'login' | 'logout';
  warehouseName: string;
  onComplete: () => void;
}

export const WelcomeIntro: React.FC<WelcomeIntroProps> = ({
  user,
  mode = 'login',
  warehouseName,
  onComplete,
}) => {
  const persona = resolveIntroPersona(user);
  const isDalia = persona === 'dalia';
  const avatarSrc = USER_AVATARS[persona];
  const isLogout = mode === 'logout';
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgFailed = failedSrc === avatarSrc;
  const imgReady =
    readySrc === avatarSrc ||
    imgFailed ||
    Boolean(imgRef.current?.complete && imgRef.current.naturalWidth > 0);

  useEffect(() => {
    if (!user) return;
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setReadySrc(avatarSrc);
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onComplete();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [user, avatarSrc, onComplete]);

  // If the portrait hasn't cached yet (cold load over network), give up to 1200ms grace
  // so Dalia/Mohamed portraits never miss the brief intro window.
  useEffect(() => {
    if (!user || imgReady) return;
    const graceTimer = window.setTimeout(() => {
      setReadySrc(avatarSrc);
    }, 1200);
    return () => window.clearTimeout(graceTimer);
  }, [user, imgReady, avatarSrc]);

  useEffect(() => {
    if (!user || !imgReady) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const durationMs = reduced ? 850 : isLogout ? 1900 : 2200;
    const timer = window.setTimeout(onComplete, durationMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [user, imgReady, isLogout, onComplete]);

  const greeting = user ? getWelcomeGreeting(user.name, mode) : null;

  return (
    <AnimatePresence>
      {user && greeting && (
        <motion.div
          key={`${mode}-${user.id}`}
          role="dialog"
          aria-modal="true"
          aria-label={greeting.title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.03 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className={`fixed inset-0 z-[120] flex flex-col items-center justify-center overflow-hidden p-6 ${
            isDalia ? 'dalia-aurora-bg' : 'admin-aurora-bg'
          }`}
        >
          {/* Ambient Animated Aura Rings */}
          <motion.div
            initial={{ scale: 0.65, opacity: 0 }}
            animate={{ scale: 1.15, opacity: 1 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className={`pointer-events-none absolute h-[420px] w-[420px] rounded-full blur-3xl ${
              isDalia
                ? 'bg-gradient-to-tr from-[#ec4899]/28 via-[#a855f7]/24 to-[#fde68a]/16'
                : 'bg-gradient-to-tr from-[#1677FF]/28 via-[#20C5E8]/22 to-[#10B981]/14'
            }`}
          />

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className={`relative flex w-full max-w-md flex-col items-center rounded-3xl p-8 text-center shadow-2xl ${
              isDalia ? 'glass-dalia' : 'glass-card'
            }`}
          >
            {/* Portrait / Emblem with Pulsing Halo */}
            <div className="relative mb-6 flex items-center justify-center">
              <motion.span
                initial={{ scale: 0.85, opacity: 0.6 }}
                animate={{ scale: [1, 1.32, 1.5], opacity: [0.55, 0.25, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                className={`absolute ${
                  !imgFailed ? 'h-24 w-24 rounded-full' : 'h-20 w-20 rounded-3xl'
                } border ${isDalia ? 'border-[#f472b6]/60' : 'border-[#20C5E8]/60'}`}
              />
              {!imgFailed ? (
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 250, damping: 18 }}
                  className={`relative h-24 w-24 overflow-hidden rounded-full border-2 ring-4 ${
                    isDalia
                      ? 'border-[#f472b6]/75 bg-[#140920] shadow-[0_0_36px_rgba(236,72,153,0.45)] ring-[#ec4899]/20'
                      : 'border-[#46dafd]/70 bg-[#0b1d35] shadow-[0_0_36px_rgba(32,197,232,0.42)] ring-[#1677FF]/20'
                  }`}
                >
                  <img
                    key={avatarSrc}
                    ref={imgRef}
                    src={avatarSrc}
                    alt={user.name}
                    loading="eager"
                    decoding="sync"
                    referrerPolicy="no-referrer"
                    onLoad={() => setReadySrc(avatarSrc)}
                    onError={() => {
                      setFailedSrc(avatarSrc);
                      setReadySrc(avatarSrc);
                    }}
                    className={`h-full w-full object-cover ${
                      isDalia ? 'object-[35%_18%]' : 'object-[50%_20%]'
                    }`}
                  />
                </motion.div>
              ) : (
                <motion.div
                  initial={{ scale: 0.4, rotate: -18 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                  className={`relative flex h-20 w-20 items-center justify-center rounded-3xl border shadow-xl ${
                    isDalia
                      ? 'border-[#f472b6]/45 bg-gradient-to-br from-[#ec4899]/35 to-[#a855f7]/30 text-[#f9a8d4] shadow-[0_0_32px_rgba(236,72,153,0.38)]'
                      : 'border-[#46dafd]/45 bg-gradient-to-br from-[#1677FF]/35 to-[#20C5E8]/25 text-[#46dafd] shadow-[0_0_32px_rgba(32,197,232,0.35)]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[40px]">
                    {isDalia ? 'auto_awesome' : 'warehouse'}
                  </span>
                </motion.div>
              )}
            </div>

            {/* Role / Session Status Pill */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.3 }}
              className={`mb-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-semibold ${
                isDalia
                  ? 'border-[#f472b6]/35 bg-[#ec4899]/15 text-[#f9a8d4]'
                  : 'border-[#20C5E8]/35 bg-[#1677FF]/15 text-[#7ee8fa]'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">
                {isLogout ? 'lock' : 'verified'}
              </span>
              <span>
                {isLogout
                  ? 'تم تأمين الجلسة · تسجيل الخروج'
                  : isDalia
                    ? 'المشرفة · متابعة المخزون'
                    : 'مدير النظام'}
              </span>
            </motion.div>

            {/* Hero Arabic Greeting */}
            <motion.h2
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              className={`font-display bg-gradient-to-l bg-clip-text text-4xl font-extrabold tracking-tight text-transparent md:text-[42px] ${
                isDalia
                  ? 'from-white via-[#fbcfe8] to-[#e9d5ff]'
                  : 'from-white via-[#bae6fd] to-[#46dafd]'
              }`}
            >
              {greeting.title}
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.35 }}
              className={`mt-2.5 text-sm font-medium ${
                isDalia ? 'text-[#e9d5ff]/85' : 'text-[#9cb4d4]'
              }`}
            >
              {isLogout
                ? `${user.name} · ${warehouseName} — نراك قريباً`
                : `${user.name} · ${warehouseName}`}
            </motion.p>

            {/* Sleek Progress Bar */}
            <div className="mt-7 w-full overflow-hidden rounded-full bg-white/10 p-0.5">
              <motion.div
                initial={{ width: isLogout ? '100%' : '0%' }}
                animate={{ width: isLogout ? '0%' : '100%' }}
                transition={{ duration: isLogout ? 1.75 : 2.05, ease: [0.22, 1, 0.36, 1] }}
                className={`h-1.5 rounded-full ${
                  isDalia
                    ? 'bg-gradient-to-l from-[#ec4899] via-[#a855f7] to-[#fde68a]'
                    : 'bg-gradient-to-l from-[#1677FF] via-[#20C5E8] to-[#34d399]'
                }`}
              />
            </div>

            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35, duration: 0.3 }}
              onClick={onComplete}
              className={`mt-5 inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-semibold transition-all duration-150 active:scale-95 ${
                isDalia
                  ? 'border-[#f472b6]/35 bg-white/5 text-[#fbcfe8] hover:border-[#f472b6]/65 hover:bg-[#ec4899]/20 hover:text-white'
                  : 'border-white/15 bg-white/5 text-[#9cb4d4] hover:border-[#46dafd]/50 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span>{isLogout ? 'العودة لتسجيل الدخول' : 'دخول مباشر'}</span>
              <span className="material-symbols-outlined text-[16px]">
                {isLogout ? 'login' : 'arrow_back'}
              </span>
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
