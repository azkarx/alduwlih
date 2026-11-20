import { motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import warehouseLogoImg from '../assets/images/alduwlih_emblem_logo_1795096287883.jpg';
import type { WarehouseSettings } from '../types/warehouse';

interface LoginViewProps {
  settings: WarehouseSettings;
  initialError: string;
  onLogin: (email: string, password: string) => Promise<void>;
}

export const LoginView: React.FC<LoginViewProps> = ({ settings, initialError, onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onLogin(email, password);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'تعذر تسجيل الدخول.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-aurora-bg flex min-h-screen items-center justify-center px-4 py-10 text-[#d7e3fc]">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md space-y-5"
      >
        <div className="flex flex-col items-center text-center">
          <motion.div
            whileHover={{ scale: 1.07, rotate: -3 }}
            whileTap={{ scale: 0.94 }}
            className="glass-card-interactive flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-[#46dafd]/45 bg-[#071426] text-[#46dafd] shadow-[0_0_28px_rgba(32,197,232,0.24)]"
          >
            {!logoFailed ? (
              <img
                src={warehouseLogoImg}
                alt={settings.warehouseName}
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="material-symbols-outlined text-[32px]">warehouse</span>
            )}
          </motion.div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-white">
            {settings.warehouseName}
          </h1>
          <p className="mt-1 text-[13px] text-[#8FA6C3]">{settings.warehouseSubtitle}</p>
        </div>

        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          onSubmit={handleLogin}
          className="glass-card space-y-4 rounded-2xl p-6"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-white">تسجيل الدخول</h2>
            <span className="flex items-center gap-1 text-[11.5px] text-[#10B981]">
              <span className="material-symbols-outlined text-[15px]">verified_user</span>
              محمي
            </span>
          </div>

          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
              البريد الإلكتروني
            </label>
            <input
              id="login-email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@domain.com"
              autoComplete="username"
              className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/70 px-3 text-sm text-white placeholder-[#4B6485] outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd] focus:shadow-[0_0_0_3px_rgba(70,218,253,0.14)]"
              required
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
              كلمة المرور
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPass ? 'text' : 'password'}
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-10 w-full rounded-xl border border-white/15 bg-[#071426]/70 pl-10 pr-3 text-sm text-white placeholder-[#4B6485] outline-none transition-all duration-150 hover:border-white/30 focus:border-[#46dafd] focus:shadow-[0_0_0_3px_rgba(70,218,253,0.14)]"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass((visible) => !visible)}
                aria-label={showPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                className="absolute inset-y-0 left-2 flex items-center rounded-lg px-1 text-[#8FA6C3] hover:text-white active:scale-90"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showPass ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {error && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              className="rounded-xl border border-[#EF4444]/50 bg-[#2A161E]/85 px-3 py-2 text-[12.5px] text-[#ffdad6]"
            >
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="shine-cta flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-[#1677FF] to-[#0ea5e9] text-sm font-bold text-white shadow-lg disabled:cursor-wait disabled:opacity-70"
          >
            <span>{busy ? 'جارٍ التحقق...' : 'دخول'}</span>
            {!busy && <span className="material-symbols-outlined text-[18px]">arrow_back</span>}
          </button>
        </motion.form>
      </motion.div>
    </div>
  );
};
