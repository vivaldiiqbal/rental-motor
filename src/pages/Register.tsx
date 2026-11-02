import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Seo } from '../components/Seo';
import { AuthCard } from '../components/layout/AuthCard';
import { Input } from '../components/ui/Input';
import { PasswordInput } from '../components/ui/PasswordInput';
import { Checkbox } from '../components/ui/Checkbox';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { isEmail, isPasswordAcceptable, isPhone } from '../lib/validators';
import { safeRedirect } from '../lib/links';

type Field = 'name' | 'email' | 'phone' | 'password' | 'confirm' | 'agree';

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = safeRedirect((location.state as { from?: string } | null)?.from, '/');

  const [v, setV] = useState({ name: '', email: '', phone: '', password: '', confirm: '', agree: false });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');

  if (user) return <Navigate to={from} replace />;

  const errors: Record<Field, string> = {
    name: v.name.trim().length < 3 ? 'Nama lengkap minimal 3 karakter.' : '',
    email: !v.email.trim() ? 'Email wajib diisi.' : !isEmail(v.email) ? 'Format email tidak valid.' : '',
    phone: !isPhone(v.phone) ? 'Nomor HP tidak valid. Contoh: 081234567890.' : '',
    password: !isPasswordAcceptable(v.password) ? 'Minimal 8 karakter, mengandung huruf dan angka.' : '',
    confirm: v.confirm !== v.password ? 'Konfirmasi kata sandi tidak sama.' : '',
    agree: v.agree ? '' : 'Anda harus menyetujui syarat dan ketentuan.',
  };
  const touch = (f: Field) => () => setTouched((t) => ({ ...t, [f]: true }));
  const show = (f: Field) => (touched[f] ? errors[f] : '');
  const set = (patch: Partial<typeof v>) => {
    setV((s) => ({ ...s, ...patch }));
    setServerError('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, phone: true, password: true, confirm: true, agree: true });
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    try {
      await register({ name: v.name, email: v.email, phone: v.phone, password: v.password });
      toast.success('Akun berhasil dibuat. Selamat datang!');
      navigate(from, { replace: true });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Gagal mendaftar. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Daftar" subtitle="Buat akun gratis untuk mulai menyewa motor.">
      <Seo title="Daftar" description="Buat akun baru untuk memesan motor." />
      <form onSubmit={submit} noValidate className="space-y-4">
        {serverError && (
          <div role="alert" className="rounded-xl bg-danger-50 border border-danger-200 p-3 text-sm text-danger-700 space-y-1.5">
            <p>{serverError}</p>
            {serverError.toLowerCase().includes('terdaftar') && (
              <p className="pt-1 border-t border-danger-200/60 text-xs">
                Email sudah ada akun?{' '}
                <Link
                  to="/login"
                  state={{ from, email: v.email }}
                  className="font-semibold text-primary-700 underline hover:text-primary-800"
                >
                  Klik di sini untuk langsung Masuk &rarr;
                </Link>
              </p>
            )}
          </div>
        )}
        <Input label="Nama lengkap" required autoComplete="name" value={v.name} onChange={(e) => set({ name: e.target.value })} onBlur={touch('name')} error={show('name')} />
        <Input label="Email" required type="email" autoComplete="email" value={v.email} onChange={(e) => set({ email: e.target.value })} onBlur={touch('email')} error={show('email')} />
        <Input label="Nomor HP / WhatsApp" required type="tel" inputMode="tel" autoComplete="tel" placeholder="081234567890" value={v.phone} onChange={(e) => set({ phone: e.target.value })} onBlur={touch('phone')} error={show('phone')} />
        <PasswordInput label="Kata sandi" required showStrength autoComplete="new-password" value={v.password} onChange={(e) => set({ password: e.target.value })} onBlur={touch('password')} error={show('password')} />
        <PasswordInput label="Ulangi kata sandi" required autoComplete="new-password" value={v.confirm} onChange={(e) => set({ confirm: e.target.value })} onBlur={touch('confirm')} error={show('confirm')} />
        <Checkbox
          checked={v.agree}
          onChange={(e) => {
            set({ agree: e.target.checked });
            touch('agree')();
          }}
          error={show('agree')}
          label={
            <>
              Saya menyetujui{' '}
              <Link to="/terms" target="_blank" className="font-medium text-primary-600 underline">
                Syarat dan Ketentuan
              </Link>{' '}
              dan{' '}
              <Link to="/privacy" target="_blank" className="font-medium text-primary-600 underline">
                Kebijakan Privasi
              </Link>
              .
            </>
          }
        />
        <Button type="submit" fullWidth size="lg" loading={busy}>
          Daftar
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-neutral-500">
        Sudah punya akun?{' '}
        <Link to="/login" state={{ from, email: v.email }} className="font-medium text-primary-600 hover:underline">
          Masuk
        </Link>
      </p>
    </AuthCard>
  );
}
