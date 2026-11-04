import { Link, NavLink } from 'react-router-dom';
import { CalendarCheck, Heart, LogIn, LogOut, ShieldCheck, ShoppingCart, User as UserIcon, UserPlus } from 'lucide-react';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useBookingCart } from '../../context/BookingCartContext';
import { site } from '../../config/site';
import { cn } from '../../lib/cn';

import { navLinks } from './navLinks';

export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const { ids } = useFavorites();
  const cart = useBookingCart();
  const item = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-base font-medium',
      isActive ? 'bg-neutral-100 text-primary-700' : 'text-neutral-700 hover:bg-neutral-100',
    );

  return (
    <Drawer open={open} onClose={onClose} title={site.name} side="left">
      <nav aria-label="Menu utama" className="space-y-1">
        {navLinks.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={item} onClick={onClose}>
            {l.label}
          </NavLink>
        ))}
        <hr className="my-3 border-neutral-200" />
        <NavLink
          to={cart.motor ? (cart.checkoutUrl || `/booking/${cart.motor.slug}`) : '/motors'}
          className={item}
          onClick={onClose}
        >
          <ShoppingCart aria-hidden="true" className="h-5 w-5" />
          Keranjang Sewa {cart.totalItemsCount > 0 && <span className="text-emerald-600 font-bold">({cart.totalItemsCount})</span>}
        </NavLink>
        <NavLink to="/favorites" className={item} onClick={onClose}>
          <Heart aria-hidden className="h-5 w-5" />
          Favorit {ids.length > 0 && <span className="text-neutral-500">({ids.length})</span>}
        </NavLink>
        {user ? (
          <>
            <NavLink to="/bookings" className={item} onClick={onClose}>
              <CalendarCheck aria-hidden className="h-5 w-5" />
              Booking Saya
            </NavLink>
            <NavLink to="/profile" className={item} onClick={onClose}>
              <UserIcon aria-hidden className="h-5 w-5" />
              Profil
            </NavLink>
            {(user.role === 'admin' || user.role === 'staff') && (
              <NavLink to="/admin" className={cn(item({ isActive: false }), 'text-primary-700 bg-primary-50')} onClick={onClose}>
                <ShieldCheck aria-hidden className="h-5 w-5 text-primary-700" />
                Panel Admin
              </NavLink>
            )}
            <button
              type="button"
              onClick={() => {
                logout();
                onClose();
              }}
              className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-base font-medium text-danger-600 hover:bg-danger-50"
            >
              <LogOut aria-hidden className="h-5 w-5" />
              Keluar
            </button>
          </>
        ) : (
          <div className="grid gap-2 pt-2">
            <Button to="/login" onClick={onClose} leftIcon={<LogIn aria-hidden className="h-4 w-4" />}>
              Masuk
            </Button>
            <Button
              to="/register"
              variant="secondary"
              onClick={onClose}
              leftIcon={<UserPlus aria-hidden className="h-4 w-4" />}
            >
              Daftar
            </Button>
          </div>
        )}
      </nav>
      <p className="mt-6 text-xs text-neutral-500">
        Butuh bantuan?{' '}
        <Link to="/contact" onClick={onClose} className="text-primary-600 underline">
          Hubungi kami
        </Link>
      </p>
    </Drawer>
  );
}
