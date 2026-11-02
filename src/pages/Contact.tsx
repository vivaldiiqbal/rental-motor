import { useState } from 'react';
import type { FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Clock, ExternalLink, Mail, MapPin, Phone } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PageContainer } from '../components/layout/PageContainer';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Button } from '../components/ui/Button';
import { sendContactMessage } from '../services/api';
import { site } from '../config/site';
import { isEmail } from '../lib/validators';

type Field = 'name' | 'email' | 'message';

export default function Contact() {
  const [v, setV] = useState({ name: '', email: '', message: '' });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  const errors: Record<Field, string> = {
    name: v.name.trim().length < 3 ? 'Nama minimal 3 karakter.' : '',
    email: !isEmail(v.email) ? 'Format email tidak valid.' : '',
    message: v.message.trim().length < 10 ? 'Pesan minimal 10 karakter.' : '',
  };
  const show = (f: Field) => (touched[f] ? errors[f] : '');
  const blur = (f: Field) => () => setTouched((t) => ({ ...t, [f]: true }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, message: true });
    if (Object.values(errors).some(Boolean) || busy) return;
    setBusy(true);
    try {
      await sendContactMessage(v);
      toast.success('Pesan terkirim. Kami akan membalas secepatnya.');
      setV({ name: '', email: '', message: '' });
      setTouched({});
    } catch {
      toast.error('Gagal mengirim pesan. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(site.mapQuery)}`;

  return (
    <PageContainer>
      <Seo title="Kontak" description={`Hubungi ${site.name} untuk pertanyaan, bantuan pemesanan, atau saran.`} />
      <Breadcrumb items={[{ label: 'Beranda', to: '/' }, { label: 'Kontak' }]} />
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">Hubungi kami</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <form onSubmit={submit} noValidate className="card space-y-4 p-5 sm:p-6">
          <Input label="Nama" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} onBlur={blur('name')} error={show('name')} autoComplete="name" />
          <Input label="Email" required type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} onBlur={blur('email')} error={show('email')} autoComplete="email" />
          <Textarea label="Pesan" required value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} onBlur={blur('message')} error={show('message')} maxLength={1000} />
          <Button type="submit" loading={busy}>
            Kirim pesan
          </Button>
        </form>

        <div className="space-y-6">
          <ul className="card space-y-4 p-5 text-sm sm:p-6">
            <li className="flex items-start gap-3">
              <MapPin aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
              {site.address}
            </li>
            <li className="flex items-center gap-3">
              <Phone aria-hidden className="h-5 w-5 text-primary-600" />
              <a href={`tel:${site.phone.replace(/[^+\d]/g, '')}`} className="hover:underline">
                {site.phone}
              </a>
            </li>
            <li className="flex items-center gap-3">
              <Mail aria-hidden className="h-5 w-5 text-primary-600" />
              <a href={`mailto:${site.email}`} className="hover:underline">
                {site.email}
              </a>
            </li>
            {site.openingHours.map((h) => (
              <li key={h.label} className="flex items-center gap-3">
                <Clock aria-hidden className="h-5 w-5 text-primary-600" />
                {h.label}: {h.value}
              </li>
            ))}
          </ul>

          <div className="card overflow-hidden">
            {mapFailed ? (
              <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-neutral-100 p-6 text-center text-sm text-neutral-500">
                <MapPin aria-hidden className="h-8 w-8" />
                Peta tidak dapat dimuat.
              </div>
            ) : (
              <iframe
                title={`Peta lokasi ${site.name}`}
                src={`https://maps.google.com/maps?q=${encodeURIComponent(site.mapQuery)}&output=embed`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                onError={() => setMapFailed(true)}
                className="aspect-[4/3] w-full border-0"
              />
            )}
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[44px] items-center justify-center gap-2 border-t border-neutral-200 text-sm font-medium text-primary-600 hover:bg-neutral-50"
            >
              Buka di Google Maps <ExternalLink aria-hidden className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
