import React, { createContext, useContext, useEffect, useState } from 'react';
import { site as defaultSite } from '../config/site';
import { getSiteMeta } from '../services/api';

export interface DynamicSiteSettings {
  name: string;
  tagline: string;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
  mapQuery: string;
  operatingHours: string;
  openingHours: ReadonlyArray<{ label: string; value: string }>;
  rental: {
    minDays: number;
    maxDays: number;
    lateFeePercentPerHour: number;
    lateFeeToleranceMinutes: number;
    freeCancelHours: number;
    minAge: number;
    bookingExpireMinutes: number;
    defaultDeposit: number;
    cancellationPolicy: Array<{ thresholdHours: number; refundPercent: number }>;
    requirements: ReadonlyArray<string>;
  };
}

interface SiteSettingsContextType {
  settings: DynamicSiteSettings;
  loading: boolean;
  refreshSettings: () => Promise<void>;
}

const SiteSettingsContext = createContext<SiteSettingsContextType>({
  settings: {
    ...defaultSite,
    operatingHours: '08:00 - 21:00 WIB',
    rental: {
      ...defaultSite.rental,
      lateFeeToleranceMinutes: 120,
      bookingExpireMinutes: 60,
      defaultDeposit: 200000,
      cancellationPolicy: [
        { thresholdHours: 48, refundPercent: 100 },
        { thresholdHours: 24, refundPercent: 50 },
        { thresholdHours: 0, refundPercent: 0 },
      ],
      requirements: [...defaultSite.rental.requirements],
    },
  },
  loading: false,
  refreshSettings: async () => {},
});

export const SiteSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<DynamicSiteSettings>({
    ...defaultSite,
    operatingHours: '08:00 - 21:00 WIB',
    rental: {
      ...defaultSite.rental,
      lateFeeToleranceMinutes: 120,
      bookingExpireMinutes: 60,
      defaultDeposit: 200000,
      cancellationPolicy: [
        { thresholdHours: 48, refundPercent: 100 },
        { thresholdHours: 24, refundPercent: 50 },
        { thresholdHours: 0, refundPercent: 0 },
      ],
      requirements: [...defaultSite.rental.requirements],
    },
  });
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    try {
      const meta = await getSiteMeta();
      if (meta) {
        setSettings((prev) => ({
          ...prev,
          name: meta.brandName || prev.name,
          email: meta.contactEmail || prev.email,
          phone: meta.whatsappNumber || prev.phone,
          whatsapp: (meta.whatsappNumber || prev.whatsapp).replace(/[^0-9]/g, ''),
          address: meta.address || prev.address,
          operatingHours: meta.operatingHours || prev.operatingHours,
          openingHours: [
            { label: 'Setiap Hari', value: meta.operatingHours || '08:00 - 21:00 WIB' },
          ],
          rental: {
            ...prev.rental,
            minDays: meta.minRentalDays ?? prev.rental.minDays,
            maxDays: meta.maxRentalDays ?? prev.rental.maxDays,
            minAge: meta.minRenterAge ?? prev.rental.minAge,
            bookingExpireMinutes: meta.bookingExpireMinutes ?? prev.rental.bookingExpireMinutes,
            lateFeeToleranceMinutes: meta.lateFeeToleranceMinutes ?? prev.rental.lateFeeToleranceMinutes,
            lateFeePercentPerHour: meta.lateFeePercentPerHour ?? prev.rental.lateFeePercentPerHour,
            defaultDeposit: meta.defaultDeposit ?? prev.rental.defaultDeposit,
            cancellationPolicy: meta.cancellationPolicy ?? prev.rental.cancellationPolicy,
          },
        }));
      }
    } catch (err) {
      console.warn('[SiteSettingsContext] Failed to load dynamic site metadata, using default:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return (
    <SiteSettingsContext.Provider value={{ settings, loading, refreshSettings: fetchSettings }}>
      {children}
    </SiteSettingsContext.Provider>
  );
};

export const useSiteSettings = () => useContext(SiteSettingsContext);
