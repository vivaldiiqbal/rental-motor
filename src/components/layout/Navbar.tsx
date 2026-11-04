import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Bike, CalendarCheck, ChevronDown, Heart, LogOut, Menu, ShieldCheck, ShoppingCart, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useBookingCart } from '../../context/BookingCartContext';
import { Button } from '../ui/Button';
import { MobileMenu } from './MobileMenu';
import { navLinks } from './navLinks';
import { site } from '../../config/site';
import { useSiteSettings } from '../../context/SiteSettingsContext';
import { RealtimeStatusBadge } from '../RealtimeStatusBadge';
import { cn } from '../../lib/cn';

export function Navbar() {
  const { user, logout } = useAuth();
  const { ids } = useFavorites();
  const { settings } = useSiteSettings();
  const cart = useBookingCart();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-primary-900 text-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Buka menu"
            className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-primary-800 lg:hidden"
          >
            <Menu aria-hidden className="h-6 w-6" />
          </button>
          <Link to="/" className="flex items-center gap-2 text-lg font-bold">
            <Bike aria-hidden className="h-6 w-6" />
            {settings.name || site.name}
          </Link>
        </div>

        <nav aria-label="Menu utama" className="hidden items-center gap-1 lg:flex">
          {navLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                cn(
                  'rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-150',
                  isActive ? 'bg-primary-700 text-white' : 'text-neutral-200 hover:bg-primary-800 hover:text-white',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          {user && <RealtimeStatusBadge className="mr-1 hidden sm:inline-flex" />}
          <Link
            to="/favorites"
            aria-label={`Favorit${ids.length ? `, ${ids.length} motor` : ''}`}
            className="relative flex h-11 w-11 items-center justify-center rounded-xl hover:bg-primary-800"
          >
            <Heart aria-hidden className="h-5 w-5" />
            {ids.length > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-primary-900">
                {ids.length}
              </span>
            )}
          </Link>

          {/* Keranjang Sewa Terpadu */}
          <button
            type="button"
            onClick={() => {
              if (cart.motor) {
                navigate(cart.checkoutUrl || `/booking/${cart.motor.slug}`);
              } else {
                navigate('/motors');
              }
            }}
            aria-label={`Keranjang Sewa${cart.totalItemsCount ? `, ${cart.totalItemsCount} item` : ''}`}
            title={
              cart.motor
                ? `Keranjang: ${cart.motor.name}${cart.addonsCount > 0 ? ` + ${cart.addonsCount} add-on` : ''}`
                : cart.addonsCount > 0
                ? `${cart.addonsCount} perlengkapan di keranjang. Pilih motor untuk checkout.`
                : 'Keranjang Sewa'
            }
            className="relative flex h-11 w-11 items-center justify-center rounded-xl hover:bg-primary-800 transition-colors"
          >
            <ShoppingCart aria-hidden className="h-5 w-5" />
            {cart.totalItemsCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white shadow-xs">
                {cart.totalItemsCount}
              </span>
            )}
          </button>

          {user ? (
            <div className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setUserOpen((o) => !o)}
                aria-expanded={userOpen}
                aria-haspopup="menu"
                className="flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-sm font-medium hover:bg-primary-800"
              >
                <UserIcon aria-hidden className="h-4 w-4" />
                {user.name.split(' ')[0]}
                <ChevronDown aria-hidden className="h-4 w-4" />
              </button>
              {userOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserOpen(false)} aria-hidden />
                  <div role="menu" className="absolute right-0 z-50 mt-2 w-52 rounded-xl border border-neutral-200 bg-white p-1.5 text-ink shadow-md">
                    <Link
                      role="menuitem"
                      to="/bookings"
                      onClick={() => setUserOpen(false)}
                      className="flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-sm hover:bg-neutral-100"
                    >
                      <CalendarCheck aria-hidden className="h-4 w-4" /> Booking Saya
                    </Link>
                    <Link
                      role="menuitem"
                      to="/profile"
                      onClick={() => setUserOpen(false)}
                      className="flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-sm hover:bg-neutral-100"
                    >
                      <UserIcon aria-hidden className="h-4 w-4" /> Profil
                    </Link>
                    {(user.role === 'admin' || user.role === 'staff') && (
                      <Link
                        role="menuitem"
                        to="/admin"
                        onClick={() => setUserOpen(false)}
                        className="flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100"
                      >
                        <ShieldCheck aria-hidden className="h-4 w-4 text-primary-700" /> Panel Admin
                      </Link>
                    )}
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setUserOpen(false);
                        logout();
                        navigate('/');
                      }}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-sm text-danger-600 hover:bg-danger-50"
                    >
                      <LogOut aria-hidden className="h-4 w-4" /> Keluar
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 lg:flex">
              <Button to="/login" variant="ghost" className="text-white hover:bg-primary-800">
                Masuk
              </Button>
              <Button to="/register" variant="secondary">
                Daftar
              </Button>
            </div>
          )}
        </div>
      </div>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
