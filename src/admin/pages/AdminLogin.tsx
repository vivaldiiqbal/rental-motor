import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ShieldCheck, Lock, Mail, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../services/api';
import { Seo } from '../../components/Seo';

const TOKEN_KEY = 'rk_token_v1';
const CURRENT_ADMIN_KEY = 'rk_admin_session_v2';
const SESSION_KEY = 'rk_session_v1';

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !password) {
      setErrorMessage('Email dan kata sandi wajib diisi.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post('/auth/login', {
        email: email.trim(),
        password,
      });

      const { user, token } = res.data.data;

      if (user.role !== 'admin' && user.role !== 'staff') {
        throw new Error(
          `Akses ditolak: Akun ${user.email} terdaftar sebagai Customer. Halaman ini hanya untuk Administrator dan Staf.`,
        );
      }

      // Simpan sesi otentikasi
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem('rk_admin_token_v1', token);
      localStorage.setItem(SESSION_KEY, String(user.id));
      localStorage.setItem(CURRENT_ADMIN_KEY, JSON.stringify(user));

      toast.success(`Selamat datang, ${user.name}!`);
      navigate(redirectTarget, { replace: true });
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.message ||
        'Gagal masuk ke panel admin. Periksa kembali email dan sandi Anda.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const fillQuick = (mail: string, pass: string) => {
    setEmail(mail);
    setPassword(pass);
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 text-white relative overflow-hidden">
      <Seo title="Login Administrator" description="Masuk ke Panel Admin RodaKita." />

      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-800/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-6 sm:p-8 shadow-2xl relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-primary-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-primary-500/30 mb-3">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Panel Administrator</h1>
          <p className="text-xs text-slate-400 mt-1">
            Portal masuk resmi staf & pengelola rental motor RodaKita
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-5 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Email Administrator / Staf
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@rodakita.id"
                autoComplete="email"
                className="w-full bg-slate-900/60 border border-slate-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Kata Sandi
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-slate-900/60 border border-slate-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 transition-all outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                title={showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 active:scale-[0.99] font-semibold text-sm shadow-lg shadow-primary-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Memverifikasi...</span>
              </>
            ) : (
              <span>Masuk ke Panel Admin</span>
            )}
          </button>
        </form>

        {/* Quick Credentials Helper */}
        <div className="mt-6 pt-5 border-t border-slate-700/60">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5 text-center">
            Pilihan Akun Admin Aktif:
          </p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => fillQuick('admin@rodakita.id', 'Admin12345')}
              className="w-full p-2.5 rounded-xl bg-slate-900/50 hover:bg-slate-900 border border-slate-700/60 flex items-center justify-between text-left text-xs transition-colors"
            >
              <div>
                <p className="font-semibold text-slate-200">Admin Bawaan Sistem</p>
                <p className="text-[11px] text-slate-400">admin@rodakita.id</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-300 font-semibold">
                Admin
              </span>
            </button>

            <button
              type="button"
              onClick={() => fillQuick('staff@rodakita.id', 'Staff12345')}
              className="w-full p-2.5 rounded-xl bg-slate-900/50 hover:bg-slate-900 border border-slate-700/60 flex items-center justify-between text-left text-xs transition-colors"
            >
              <div>
                <p className="font-semibold text-slate-200">Staf Operasional</p>
                <p className="text-[11px] text-slate-400">staff@rodakita.id</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold">
                Staff
              </span>
            </button>
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-5 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Beranda RodaKita</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
