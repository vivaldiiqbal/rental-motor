import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { Seo } from '../components/Seo';
import { AuthCard } from '../components/layout/AuthCard';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { requestPasswordReset } from '../services/api';
import { isEmail } from '../lib/validators';

/** Halaman simulasi: tidak ada email sungguhan yang dikirim. */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const error = !email.trim() ? 'Email wajib diisi.' : !isEmail(email) ? 'Format email tidak valid.' : '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (error) return;
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Lupa kata sandi" subtitle="Masukkan email akun Anda. Kami akan mengirim tautan pemulihan.">
      <Seo title="Lupa Kata Sandi" />
      {sent ? (
        <div role="status" className="text-center">
          <MailCheck aria-hidden className="mx-auto h-12 w-12 text-success-600" />
          <p className="mt-3 font-semibold text-ink">Periksa email Anda</p>
          <p className="mt-1 text-sm text-neutral-500">
            Jika <span className="font-medium">{email}</span> terdaftar, tautan pemulihan akan dikirim. (Simulasi: tidak ada email yang
            benar-benar dikirim.)
          </p>
          <Button to="/login" className="mt-6" fullWidth>
            Kembali ke halaman masuk
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} error={touched ? error : ''} />
          <Button type="submit" fullWidth size="lg" loading={busy}>
            Kirim tautan pemulihan
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="font-medium text-primary-600 hover:underline">
              Kembali ke halaman masuk
            </Link>
          </p>
        </form>
      )}
    </AuthCard>
  );
}
