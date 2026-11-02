export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

export const navLinks: NavItem[] = [
  { to: '/', label: 'Beranda', end: true },
  { to: '/motors', label: 'Pilih Motor' },
  { to: '/how-it-works', label: 'Cara Sewa' },
  { to: '/about', label: 'Tentang' },
  { to: '/contact', label: 'Kontak' },
];
