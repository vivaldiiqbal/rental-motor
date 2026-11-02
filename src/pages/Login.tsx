import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Seo } from '../components/Seo';
import { AuthCard } from '../components/layout/AuthCard';
import { Input } from '../components/ui/Input';
import { PasswordInput } from '../components/ui/PasswordInput';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../services/mock/users';
import { isEmail } from '../lib/validators';
import { safeRedirect } from '../lib/links';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const stateData = location.state as { from?: string; email?: string } | null;
  const from = safeRedirect(stateData?.from, '/');

  const [email, setEmail] = useState(stateData?.email || '');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');

  if (user) return <Navigate to={from} replace />;

  const errors = {
    email: !email.trim() ? 'Email wajib diisi.' : !isEmail(email) ? 'Format email tidak valid.' : '',
    password: !password ? 'Kata sandi wajib diisi.' : '',
  };

  const doLogin = async (mail: string, pass: string) => {
    setBusy(true);
    setServerError('');
    try {
      await login(mail, pass);
      toast.success('Berhasil masuk. Selamat datang!');
      navigate(from, { replace: true });
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Gagal masuk. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (errors.email || errors.password) return;
    void doLogin(email, password);
  };

  const demo = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    void doLogin(DEMO_EMAIL, DEMO_PASSWORD);
  };

  return (
    <AuthCard title="Masuk" subtitle="Masuk untuk memesan motor dan melihat booking Anda.">
      <Seo title="Masuk" description="Masuk ke akun Anda." />
      <form onSubmit={submit} noValidate className="space-y-4">
        {serverError && (
          <div role="alert" className="rounded-xl bg-danger-50 border border-danger-200 p-3 text-sm text-danger-700">
            {serverError}
          </div>
        )}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setServerError('');
          }}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={touched.email ? errors.email : ''}
        />
        <PasswordInput
          label="Kata sandi"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setServerError('');
          }}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={touched.password ? errors.password : ''}
        />
        <div className="text-right">
          <Link to="/forgot-password" className="text-sm font-medium text-primary-600 hover:underline">
            Lupa kata sandi?
          </Link>
        </div>
        <Button type="submit" fullWidth size="lg" loading={busy}>
          Masuk
        </Button>
        <Button type="button" variant="secondary" fullWidth onClick={demo} disabled={busy}>
          Masuk dengan akun demo
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        Belum punya akun?{' '}
        <Link to="/register" state={{ from }} className="font-medium text-primary-600 hover:underline">
          Daftar
        </Link>
      </p>
      <div className="mt-4 pt-4 border-t border-neutral-100 text-center">
        <Link to="/admin/login" className="text-xs text-neutral-500 hover:text-primary-600 font-medium transition-colors">
          Login khusus Administrator / Staf &rarr;
        </Link>
      </div>
    </AuthCard>
  );
}
