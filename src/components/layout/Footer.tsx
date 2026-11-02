import { Link } from 'react-router-dom';
import { Bike, Clock, Mail, MapPin, Phone } from 'lucide-react';
import { useSiteSettings } from '../../context/SiteSettingsContext';

const CURRENT_YEAR = new Date().getFullYear();

const links = [
  { to: '/motors', label: 'Pilih Motor' },
  { to: '/how-it-works', label: 'Cara Sewa' },
  { to: '/about', label: 'Tentang Kami' },
  { to: '/contact', label: 'Kontak' },
];
const legal = [
  { to: '/terms', label: 'Syarat dan Ketentuan' },
  { to: '/privacy', label: 'Kebijakan Privasi' },
];

export function Footer() {
  const { settings } = useSiteSettings();

  return (
    <footer className="mt-16 bg-primary-900 text-neutral-200">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="md:col-span-2">
          <Link to="/" className="inline-flex items-center gap-2 text-xl font-bold text-white">
            <Bike aria-hidden className="h-6 w-6" />
            {settings.name}
          </Link>
          <p className="mt-3 max-w-sm text-sm text-neutral-300">{settings.tagline}. Motor terawat, proses mudah, harga transparan.</p>
          <ul className="mt-5 space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              {settings.address}
            </li>
            <li className="flex items-center gap-2">
              <Phone aria-hidden className="h-4 w-4" />
              <a href={`tel:${settings.phone.replace(/[^+\d]/g, '')}`} className="hover:underline">
                {settings.phone}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Mail aria-hidden className="h-4 w-4" />
              <a href={`mailto:${settings.email}`} className="hover:underline">
                {settings.email}
              </a>
            </li>
            <li className="flex items-start gap-2">
              <Clock aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{settings.openingHours.map((h) => `${h.label}: ${h.value}`).join(' · ')}</span>
            </li>
          </ul>
        </div>
        <nav aria-label="Tautan footer">
          <h2 className="text-sm font-semibold text-white">Jelajahi</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {links.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="hover:text-white hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Informasi hukum">
          <h2 className="text-sm font-semibold text-white">Informasi</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {legal.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="hover:text-white hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-primary-800 py-4 text-center text-xs text-neutral-300">
        © {CURRENT_YEAR} {settings.name}. Seluruh hak cipta dilindungi.
      </div>
    </footer>
  );
}
