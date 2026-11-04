import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { Motor, PublicAddon, CartAddonItem } from '../types';
import { countDays } from '../lib/format';
import { readStorage, writeStorage } from '../lib/storage';

const CART_STORAGE_KEY = 'rk_rental_cart';

export interface CartMotorInfo {
  id: string;
  slug: string;
  name: string;
  brand: string;
  pricePerDay: number;
  deposit: number;
  image?: string;
  images?: string[];
  plate?: string;
}

export interface BookingCartState {
  motor: CartMotorInfo | null;
  startDate?: string;
  endDate?: string;
  pickup: 'store' | 'delivery';
  address: string;
  addons: CartAddonItem[];
}

interface BookingCartContextValue {
  cart: BookingCartState;
  motor: CartMotorInfo | null;
  startDate?: string;
  endDate?: string;
  pickup: 'store' | 'delivery';
  address: string;
  addons: CartAddonItem[];
  rentalDays: number;
  addonsCount: number;
  totalItemsCount: number;
  addonsTotalPerDay: number;
  addonsSubtotal: number;
  hasMotor: boolean;
  checkoutUrl: string | null;
  setMotor: (motor: Motor | CartMotorInfo | null, start?: string, end?: string) => void;
  setRentalDates: (start?: string, end?: string) => void;
  setPickup: (pickup: 'store' | 'delivery', address?: string) => void;
  addAddon: (addon: PublicAddon | CartAddonItem, quantity?: number) => void;
  removeAddon: (addonIdOrCode: string | number) => void;
  updateAddonQty: (addonIdOrCode: string | number, qty: number) => void;
  toggleAddon: (addon: PublicAddon | CartAddonItem) => void;
  hasAddon: (addonIdOrCode: string | number) => boolean;
  getAddonQty: (addonIdOrCode: string | number) => number;
  clearAddons: () => void;
  clearCart: () => void;
}

const defaultCartState: BookingCartState = {
  motor: null,
  startDate: undefined,
  endDate: undefined,
  pickup: 'store',
  address: '',
  addons: [],
};

const BookingCartContext = createContext<BookingCartContextValue | null>(null);

export const BookingCartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<BookingCartState>(() => {
    const saved = readStorage<BookingCartState | null>(CART_STORAGE_KEY, null);
    if (saved && typeof saved === 'object') {
      return {
        ...defaultCartState,
        ...saved,
        addons: Array.isArray(saved.addons) ? saved.addons : [],
      };
    }
    return defaultCartState;
  });

  // Sinkronkan state ke localStorage setiap ada perubahan
  useEffect(() => {
    writeStorage(CART_STORAGE_KEY, cart);
  }, [cart]);

  const rentalDays = useMemo(() => {
    if (!cart.startDate || !cart.endDate) return 1;
    const days = countDays(cart.startDate, cart.endDate);
    return Math.max(1, days);
  }, [cart.startDate, cart.endDate]);

  const setMotor = (motor: Motor | CartMotorInfo | null, start?: string, end?: string) => {
    setCart((prev) => ({
      ...prev,
      motor: motor
        ? {
            id: String(motor.id),
            slug: motor.slug,
            name: motor.name,
            brand: motor.brand,
            pricePerDay: motor.pricePerDay,
            deposit: motor.deposit || 200000,
            image: motor.images?.[0] || (motor as CartMotorInfo).image || '',
            images: motor.images || [],
            plate: motor.plate || '',
          }
        : null,
      startDate: start !== undefined ? start : prev.startDate,
      endDate: end !== undefined ? end : prev.endDate,
    }));
  };

  const setRentalDates = (start?: string, end?: string) => {
    setCart((prev) => ({
      ...prev,
      startDate: start,
      endDate: end,
    }));
  };

  const setPickup = (pickup: 'store' | 'delivery', address: string = '') => {
    setCart((prev) => ({
      ...prev,
      pickup,
      address,
    }));
  };

  const addAddon = (addon: PublicAddon | CartAddonItem, quantity = 1) => {
    const addonId = String((addon as any).addon_id ?? (addon as any).id ?? (addon as any).code);
    const code = String((addon as any).code || addonId);
    const pricePerDay = Number((addon as any).price_per_day ?? (addon as any).pricePerDay ?? 0);
    const name = addon.name;
    const description = addon.description || '';

    setCart((prev) => {
      const idx = prev.addons.findIndex(
        (a) => String(a.addon_id) === addonId || String(a.code) === code,
      );
      let updatedAddons: CartAddonItem[];

      if (idx >= 0) {
        updatedAddons = [...prev.addons];
        const newQty = Math.min(20, updatedAddons[idx].quantity + Math.max(1, quantity));
        updatedAddons[idx] = {
          ...updatedAddons[idx],
          quantity: newQty,
        };
      } else {
        updatedAddons = [
          ...prev.addons,
          {
            addon_id: addonId,
            code,
            name,
            price_per_day: pricePerDay,
            quantity: Math.min(20, Math.max(1, quantity)),
            description,
          },
        ];
      }

      return {
        ...prev,
        addons: updatedAddons,
      };
    });
  };

  const removeAddon = (addonIdOrCode: string | number) => {
    const key = String(addonIdOrCode);
    setCart((prev) => ({
      ...prev,
      addons: prev.addons.filter(
        (a) => String(a.addon_id) !== key && String(a.code) !== key,
      ),
    }));
  };

  const updateAddonQty = (addonIdOrCode: string | number, qty: number) => {
    const key = String(addonIdOrCode);
    setCart((prev) => {
      if (qty <= 0) {
        return {
          ...prev,
          addons: prev.addons.filter(
            (a) => String(a.addon_id) !== key && String(a.code) !== key,
          ),
        };
      }

      const safeQty = Math.min(20, Math.max(1, Math.floor(qty)));
      return {
        ...prev,
        addons: prev.addons.map((a) =>
          String(a.addon_id) === key || String(a.code) === key
            ? { ...a, quantity: safeQty }
            : a,
        ),
      };
    });
  };

  const toggleAddon = (addon: PublicAddon | CartAddonItem) => {
    const addonId = String((addon as any).addon_id ?? (addon as any).id ?? (addon as any).code);
    const code = String((addon as any).code || addonId);
    const exists = cart.addons.some(
      (a) => String(a.addon_id) === addonId || String(a.code) === code,
    );

    if (exists) {
      removeAddon(addonId);
    } else {
      addAddon(addon, 1);
    }
  };

  const hasAddon = (addonIdOrCode: string | number): boolean => {
    const key = String(addonIdOrCode);
    return cart.addons.some((a) => String(a.addon_id) === key || String(a.code) === key);
  };

  const getAddonQty = (addonIdOrCode: string | number): number => {
    const key = String(addonIdOrCode);
    const item = cart.addons.find((a) => String(a.addon_id) === key || String(a.code) === key);
    return item ? item.quantity : 0;
  };

  const clearAddons = () => {
    setCart((prev) => ({
      ...prev,
      addons: [],
    }));
  };

  const clearCart = () => {
    setCart(defaultCartState);
  };

  const addonsCount = cart.addons.reduce((acc, curr) => acc + curr.quantity, 0);
  const addonsTotalPerDay = cart.addons.reduce(
    (acc, curr) => acc + curr.price_per_day * curr.quantity,
    0,
  );
  const addonsSubtotal = addonsTotalPerDay * rentalDays;
  const hasMotor = Boolean(cart.motor);
  const totalItemsCount = (hasMotor ? 1 : 0) + (cart.addons.length > 0 ? cart.addons.length : 0);

  const checkoutUrl = useMemo(() => {
    if (!cart.motor) return null;
    const params = new URLSearchParams();
    if (cart.startDate) params.set('start', cart.startDate);
    if (cart.endDate) params.set('end', cart.endDate);
    const qs = params.toString();
    return `/booking/${cart.motor.slug}${qs ? `?${qs}` : ''}`;
  }, [cart.motor, cart.startDate, cart.endDate]);

  return (
    <BookingCartContext.Provider
      value={{
        cart,
        motor: cart.motor,
        startDate: cart.startDate,
        endDate: cart.endDate,
        pickup: cart.pickup,
        address: cart.address,
        addons: cart.addons,
        rentalDays,
        addonsCount,
        totalItemsCount,
        addonsTotalPerDay,
        addonsSubtotal,
        hasMotor,
        checkoutUrl,
        setMotor,
        setRentalDates,
        setPickup,
        addAddon,
        removeAddon,
        updateAddonQty,
        toggleAddon,
        hasAddon,
        getAddonQty,
        clearAddons,
        clearCart,
      }}
    >
      {children}
    </BookingCartContext.Provider>
  );
};

export function useBookingCart() {
  const context = useContext(BookingCartContext);
  if (!context) {
    throw new Error('useBookingCart must be used within a BookingCartProvider');
  }
  return context;
}
