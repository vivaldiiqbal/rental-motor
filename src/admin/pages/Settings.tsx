import React, { useEffect, useState } from 'react';
import {
  Save,
  Shield,
  HelpCircle,
  RotateCcw,
  Building,
  Calendar,
  Percent,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';
import type { SystemSettings } from '../types';
import { FormField } from '../components/FormField';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { usePermission } from '../hooks/usePermission';

export const Settings: React.FC = () => {
  const { can } = usePermission();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  // Dialogs
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [resetDefaultDialogOpen, setResetDefaultDialogOpen] = useState(false);
  const [resetFactoryDialogOpen, setResetFactoryDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Dev simulate error state
  const [simulateError, setSimulateError] = useState(() => {
    return localStorage.getItem('DEV_SIMULATE_ERRORS') === 'true';
  });

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const res = await adminApi.getSettings();
        setSettings({
          ...res.data,
          brandName: res.data.brandName || res.data.storeName || 'RodaKita Rental Motor',
          lateFeeToleranceMinutes: res.data.lateFeeToleranceMinutes ?? 120,
          cancellationThresholdHours: res.data.cancellationThresholdHours ?? 24,
          cancellationRefundPercent: res.data.cancellationRefundPercent ?? 75,
        });
      } catch (err: any) {
        toast.error(err.message || 'Gagal memuat pengaturan.');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const validateForm = (): boolean => {
    if (!settings) return false;

    if (!settings.brandName?.trim() && !settings.storeName?.trim()) {
      toast.error('Nama brand rental tidak boleh kosong.');
      return false;
    }

    const phone = settings.whatsappNumber || settings.whatsapp || '';
    if (phone && !/^\+?[0-9]{8,20}$/.test(phone.replace(/[-\s]/g, ''))) {
      toast.error('Nomor WhatsApp harus berformat 8-20 digit angka (opsional awalan +).');
      return false;
    }

    const email = settings.contactEmail || settings.email || '';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('Format email kontak resmi tidak valid.');
      return false;
    }

    if (settings.minRentalDays < 1) {
      toast.error('Durasi sewa minimal setidaknya 1 hari.');
      return false;
    }
    if (settings.maxRentalDays < settings.minRentalDays) {
      toast.error('Durasi sewa maksimal tidak boleh lebih kecil dari durasi minimal.');
      return false;
    }
    if (settings.maxRentalDays > 90) {
      toast.error('Durasi sewa maksimal paling banyak 90 hari.');
      return false;
    }
    if (settings.minRenterAge !== undefined && (settings.minRenterAge < 17 || settings.minRenterAge > 100)) {
      toast.error('Usia minimum penyewa harus antara 17 sampai 100 tahun.');
      return false;
    }
    if (settings.bookingExpireMinutes < 5 || settings.bookingExpireMinutes > 1440) {
      toast.error('Menit kedaluwarsa pembayaran harus antara 5 s/d 1440 menit (24 jam).');
      return false;
    }
    if (
      (settings.lateFeeToleranceMinutes ?? 0) < 0 ||
      (settings.lateFeeToleranceMinutes ?? 0) > 240
    ) {
      toast.error('Toleransi keterlambatan harus antara 0 s/d 240 menit.');
      return false;
    }
    if (settings.lateFeePercentPerHour < 1 || settings.lateFeePercentPerHour > 100) {
      toast.error('Persen denda per jam harus antara 1% s/d 100%.');
      return false;
    }
    if (
      (settings.cancellationThresholdHours ?? 0) < 0 ||
      (settings.cancellationThresholdHours ?? 0) > 168
    ) {
      toast.error('Ambang batas pembatalan sewa harus antara 0 s/d 168 jam (7 hari).');
      return false;
    }
    if (
      (settings.cancellationRefundPercent ?? 0) < 0 ||
      (settings.cancellationRefundPercent ?? 0) > 100
    ) {
      toast.error('Persen pengembalian refund pembatalan harus antara 0% s/d 100%.');
      return false;
    }

    return true;
  };

  const handleOpenSaveDialog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaveDialogOpen(true);
  };

  const handleSaveConfirmed = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await adminApi.updateSettings({
        ...settings,
        storeName: settings.brandName || settings.storeName,
        whatsappNumber: settings.whatsappNumber || settings.whatsapp,
        contactEmail: settings.contactEmail || settings.email,
        address: settings.address || settings.officeAddress,
      });
      setSettings(updated);
      toast.success('Pengaturan sistem dan aturan bisnis berhasil disimpan.');
      setSaveDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    setResetting(true);
    try {
      const reset = await adminApi.resetSettings();
      setSettings(reset);
      setResetDefaultDialogOpen(false);
      toast.success('Pengaturan berhasil direset ke nilai default.');
    } catch (err: any) {
      toast.error(err.message || 'Gagal mereset pengaturan.');
    } finally {
      setResetting(false);
    }
  };

  const handleToggleSimulateError = (enabled: boolean) => {
    setSimulateError(enabled);
    if (enabled) {
      localStorage.setItem('DEV_SIMULATE_ERRORS', 'true');
      toast.error('Simulasi Error diaktifkan (API akan merespons error).');
    } else {
      localStorage.removeItem('DEV_SIMULATE_ERRORS');
      toast.success('Simulasi Error dinonaktifkan (API normal kembali).');
    }
  };

  const handleResetDatabase = async () => {
    setResetting(true);
    try {
      await adminApi.resetStore();
      toast.success('Database mock berhasil direset ke kondisi awal demonstrasi!');
      setResetFactoryDialogOpen(false);
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Gagal mereset database mock.');
    } finally {
      setResetting(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="py-20 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-3 border-primary-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-gray-500 mt-3">Memuat konfigurasi sistem...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Pengaturan Sistem Rental</h1>
          <p className="text-xs text-gray-500 mt-1">
            Konfigurasi aturan operasional, batas kedaluwarsa, denda keterlambatan, dan kebijakan pembatalan.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setResetDefaultDialogOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold border border-gray-300 self-start sm:self-auto transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset ke Default
        </button>
      </div>

      <form onSubmit={handleOpenSaveDialog} className="space-y-6">
        {/* Card 1: Identitas Brand & Jam Operasional */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center gap-2">
            <Building className="w-4 h-4 text-primary-900" />
            Identitas Brand & Kontak Resmi
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Nama Brand Rental" required>
              <input
                type="text"
                value={settings.brandName || settings.storeName}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    brandName: e.target.value,
                    storeName: e.target.value,
                  })
                }
                placeholder="RodaKita Rental Motor"
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                required
              />
            </FormField>

            <FormField label="Nomor WhatsApp Customer Service" required>
              <input
                type="text"
                value={settings.whatsappNumber || settings.whatsapp}
                onChange={(e) => setSettings({ ...settings, whatsapp: e.target.value, whatsappNumber: e.target.value })}
                placeholder="0812-3456-7890"
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-mono font-semibold"
                required
              />
            </FormField>

            <FormField label="Email Kontak Resmi" helperText="Email resmi untuk korespondensi pelanggan">
              <input
                type="email"
                value={settings.contactEmail || settings.email || ''}
                onChange={(e) => setSettings({ ...settings, email: e.target.value, contactEmail: e.target.value })}
                placeholder="kontak@rodakita.com"
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
              />
            </FormField>

            <FormField label="Jam Operasional Garasi" required helperText="Format bebas, misal: 08:00 - 21:00 WIB">
              <input
                type="text"
                value={settings.operationalHours}
                onChange={(e) => setSettings({ ...settings, operationalHours: e.target.value })}
                placeholder="08:00 - 21:00 WIB"
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                required
              />
            </FormField>

            <FormField label="Alamat Garasi Pusat">
              <input
                type="text"
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value, officeAddress: e.target.value })}
                placeholder="Jl. Malioboro No. 123, Yogyakarta"
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
              />
            </FormField>
          </div>
        </div>

        {/* Card 2: Durasi Sewa, Usia & Kedaluwarsa Pembayaran */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary-900" />
            Ketentuan Durasi Sewa & Batas Pembayaran
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormField label="Durasi Minimal (Hari)" required helperText="Batas paling sedikit (1 hari)">
              <input
                type="number"
                min={1}
                max={30}
                value={settings.minRentalDays}
                onChange={(e) => setSettings({ ...settings, minRentalDays: Number(e.target.value) })}
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                required
              />
            </FormField>

            <FormField label="Durasi Maksimal (Hari)" required helperText="Batas paling banyak sewa reguler">
              <input
                type="number"
                min={settings.minRentalDays}
                max={90}
                value={settings.maxRentalDays}
                onChange={(e) => setSettings({ ...settings, maxRentalDays: Number(e.target.value) })}
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                required
              />
            </FormField>

            <FormField label="Usia Minimum Penyewa" required helperText="Batas umur minimal penyewa (tahun)">
              <input
                type="number"
                min={17}
                max={100}
                value={settings.minRenterAge ?? 18}
                onChange={(e) => setSettings({ ...settings, minRenterAge: Number(e.target.value) })}
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                required
              />
            </FormField>

            <FormField label="Menit Batas Bayar" required helperText="Waktu tunggu sebelum pending hangus">
              <input
                type="number"
                min={5}
                max={1440}
                value={settings.bookingExpireMinutes}
                onChange={(e) => setSettings({ ...settings, bookingExpireMinutes: Number(e.target.value) })}
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                required
              />
            </FormField>
          </div>
        </div>

        {/* Card 3: Toleransi Keterlambatan, Denda, dan Deposit */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary-900" />
            Keterlambatan, Denda, & Jaminan Deposit
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField
              label="Toleransi Keterlambatan (Menit)"
              required
              helperText="Keterlambatan di bawah batas ini diabaikan (bebas denda)"
            >
              <input
                type="number"
                min={0}
                max={360}
                step={10}
                value={settings.lateFeeToleranceMinutes ?? 120}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    lateFeeToleranceMinutes: Number(e.target.value),
                  })
                }
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                required
              />
            </FormField>

            <FormField
              label="Persen Denda / Jam (%)"
              required
              helperText="Persen dari harga harian unit per jam keterlambatan"
            >
              <input
                type="number"
                min={1}
                max={100}
                value={settings.lateFeePercentPerHour}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    lateFeePercentPerHour: Number(e.target.value),
                  })
                }
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                required
              />
            </FormField>

            <FormField
              label="Deposit Standar (Rp)"
              required
              helperText="Uang jaminan yang ditahan selama masa sewa"
            >
              <input
                type="number"
                min={0}
                step={25000}
                value={settings.defaultDeposit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultDeposit: Number(e.target.value),
                  })
                }
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                required
              />
            </FormField>
          </div>
        </div>

        {/* Card 4: Kebijakan Pembatalan & Refund */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center gap-2">
            <Percent className="w-4 h-4 text-primary-900" />
            Kebijakan Pembatalan & Pengembalian Dana (Refund)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Ambang Batas Waktu Pembatalan (Jam Sebelum Mulai)"
              required
              helperText="Batas waktu jam sebelum tanggal/jam pickup sewa dimulai"
            >
              <input
                type="number"
                min={1}
                max={168}
                value={settings.cancellationThresholdHours ?? 24}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    cancellationThresholdHours: Number(e.target.value),
                  })
                }
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                required
              />
            </FormField>

            <FormField
              label="Persentase Refund Dana (%)"
              required
              helperText="Persen dana sewa yang dikembalikan jika membatalkan sebelum ambang batas"
            >
              <input
                type="number"
                min={0}
                max={100}
                value={settings.cancellationRefundPercent ?? 75}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    cancellationRefundPercent: Number(e.target.value),
                  })
                }
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                required
              />
            </FormField>
          </div>
        </div>

        {/* Save Settings Button */}
        {can('settings:edit') && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-900 hover:bg-primary-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        )}
      </form>

      {/* Card 5: Alat Uji Pengembang & Reset (QA Tools) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-amber-600" />
          Alat Uji & Simulasi Error (QA Developer Tools)
        </h3>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 gap-3">
          <div>
            <h4 className="text-xs font-bold text-gray-900">Simulasi Kegagalan Jaringan (Error Trapping)</h4>
            <p className="text-xs text-gray-500 mt-0.5">
              Aktifkan <code>DEV_SIMULATE_ERRORS=true</code> untuk menguji ketahanan UI saat API gagal.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleToggleSimulateError(!simulateError)}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl border transition-colors ${
              simulateError
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
            }`}
          >
            {simulateError ? 'Nonaktifkan Simulasi Error' : 'Aktifkan Simulasi Error'}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-rose-50/50 rounded-xl border border-rose-200 gap-3">
          <div>
            <h4 className="text-xs font-bold text-rose-900">Reset Database Mock (Factory Reset)</h4>
            <p className="text-xs text-rose-700 mt-0.5">
              Mengembalikan seluruh data booking, motor, dokumen, dan riwayat audit ke data awal demonstrasi.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setResetFactoryDialogOpen(true)}
            className="px-3.5 py-2 text-xs font-bold text-rose-700 bg-white border border-rose-300 hover:bg-rose-50 rounded-xl shadow-xs"
          >
            Reset Database Mock
          </button>
        </div>
      </div>

      {/* Save Confirmation Modal */}
      <ConfirmDialog
        isOpen={saveDialogOpen}
        title="Simpan Perubahan Pengaturan?"
        message="Aturan bisnis dan toleransi baru akan segera diterapkan ke seluruh alur transaksi operasional."
        variant="primary"
        confirmText="Ya, Simpan"
        loading={saving}
        onConfirm={handleSaveConfirmed}
        onClose={() => setSaveDialogOpen(false)}
      />

      {/* Reset Default Confirmation Modal */}
      <ConfirmDialog
        isOpen={resetDefaultDialogOpen}
        title="Kembalikan ke Nilai Default?"
        message="Semua nilai toleransi keterlambatan, jam operasional, dan ambang pembatalan pada formulir ini akan diisi ulang dengan nilai baku sistem."
        variant="warning"
        confirmText="Reset ke Default"
        onConfirm={handleResetToDefault}
        onClose={() => setResetDefaultDialogOpen(false)}
      />

      {/* Factory Reset Confirmation Modal */}
      <ConfirmDialog
        isOpen={resetFactoryDialogOpen}
        title="Reset Database Mock ke Awal?"
        message="Semua perubahan booking, penambahan motor baru, dan verifikasi dokumen yang telah Anda lakukan selama sesi ini akan dikembalikan ke data default pabrikan."
        variant="danger"
        confirmText="Reset Sekarang"
        loading={resetting}
        onConfirm={handleResetDatabase}
        onClose={() => setResetFactoryDialogOpen(false)}
      />
    </div>
  );
};
export default Settings;
