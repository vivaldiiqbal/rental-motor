import type { User } from '../../types';

export const DEMO_EMAIL = 'demo@rodakita.id';
export const DEMO_PASSWORD = 'Demo12345';

export const demoUser: User = {
  id: 'u1',
  name: 'Akun Demo',
  email: DEMO_EMAIL,
  phone: '081234567890',
  address: 'Jl. Sunset Road No. 10, Denpasar, Bali',
  documents: { ktp: 'verified', sim: 'none' },
  preferences: { emailNotif: true, whatsappNotif: true, promo: false },
};
