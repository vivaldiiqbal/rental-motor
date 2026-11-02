import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Info,
  History,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';
import type { Motor } from '../../types';
import type { AdminBooking } from '../types';
import { FormField } from '../components/FormField';
import { ImageUploader } from '../components/ImageUploader';
import { StatusBadge } from '../components/StatusBadge';
import { formatPrice } from '../../utils/formatPrice';
import { formatDate } from '../../utils/formatDate';

const DEFAULT_FEATURE_OPTIONS = [
  '2 Helm SNI',
  '1 Helm SNI',
  'Jas Hujan',
  'Holder HP',
  'Kunci Ganda',
  'USB Charger',
  'Gembok Cakram',
  'Box Belakang',
];

export const MotorForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);

  // Form State
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('Honda');
  const [type, setType] = useState<'matic' | 'manual' | 'sport' | 'trail'>('matic');
  const [cc, setCc] = useState(125);
  const [year, setYear] = useState(2023);
  const [color, setColor] = useState('Hitam');
  const [transmission, setTransmission] = useState<'Otomatis' | 'Manual'>('Otomatis');
  const [fuelCapacity, setFuelCapacity] = useState(5);
  const [licensePlate, setLicensePlate] = useState('');
  const [pricePerDay, setPricePerDay] = useState(120000);
  const [deposit, setDeposit] = useState(200000);
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([
    '2 Helm SNI',
    'Jas Hujan',
    'Holder HP',
  ]);
  const [customFeature, setCustomFeature] = useState('');
  const [status, setStatus] = useState<'available' | 'maintenance' | 'inactive'>('available');
  const [rentalHistory, setRentalHistory] = useState<AdminBooking[]>([]);

  useEffect(() => {
    if (!isEdit || !id) return;

    const loadMotor = async () => {
      setFetching(true);
      try {
        const [motor, bookingsRes] = await Promise.all([
          adminApi.getMotorById(id),
          adminApi.getBookings({ motorId: id, limit: 50 }).catch(() => ({ data: [] })),
        ]);
        setName(motor.name || '');
        setBrand(motor.brand || 'Honda');
        setType((motor.type as any) || 'matic');
        setCc(motor.cc || 125);
        setYear(motor.year || 2023);
        setColor(motor.color || 'Hitam');
        setTransmission(motor.transmission || 'Otomatis');
        setFuelCapacity(motor.fuelCapacity || 5);
        setLicensePlate(motor.plate || '');
        setPricePerDay(motor.pricePerDay || 120000);
        setDeposit(motor.deposit ?? 200000);
        setDescription(motor.description || '');
        setImages(motor.images || []);
        if (motor.features && Array.isArray(motor.features)) {
          setFeatures(motor.features);
        }
        setStatus((motor.status as any) || 'available');
        setRentalHistory(bookingsRes.data || []);
      } catch (err: any) {
        toast.error(err.message || 'Gagal memuat data motor.');
        navigate('/admin/motors');
      } finally {
        setFetching(false);
      }
    };

    loadMotor();
  }, [id, isEdit, navigate]);

  const handleToggleFeature = (feat: string) => {
    if (features.includes(feat)) {
      setFeatures(features.filter((f) => f !== feat));
    } else {
      setFeatures([...features, feat]);
    }
  };

  const handleAddCustomFeature = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customFeature.trim();
    if (!trimmed) return;
    if (features.includes(trimmed)) {
      toast.error('Fitur sudah ada dalam daftar.');
      return;
    }
    setFeatures([...features, trimmed]);
    setCustomFeature('');
    toast.success(`Fitur "${trimmed}" ditambahkan.`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Nama motor wajib diisi.');
      return;
    }
    if (!licensePlate.trim()) {
      toast.error('Plat nomor polisi unik wajib diisi.');
      return;
    }
    if (pricePerDay <= 0) {
      toast.error('Tarif sewa harus lebih besar dari 0.');
      return;
    }
    if (deposit < 0) {
      toast.error('Nominal deposit tidak boleh negatif.');
      return;
    }

    setLoading(true);
    const payload: Partial<Motor> = {
      name: name.trim(),
      slug: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      brand,
      type,
      cc: Number(cc),
      year: Number(year),
      color: color.trim() || 'Hitam',
      transmission,
      fuelCapacity: Number(fuelCapacity),
      plate: licensePlate.trim().toUpperCase(),
      pricePerDay: Number(pricePerDay),
      deposit: Number(deposit),
      description: description.trim(),
      images:
        images.length > 0
          ? images
          : [
              'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=600&q=80',
            ],
      features,
      status,
      popularity: 50,
      rating: 5,
      reviewCount: 0,
    };

    try {
      if (isEdit && id) {
        await adminApi.updateMotor(id, payload);
        toast.success(`Unit motor ${payload.name} berhasil diperbarui.`);
      } else {
        await adminApi.createMotor(payload);
        toast.success(`Unit motor ${payload.name} berhasil ditambahkan ke armada.`);
      }
      navigate('/admin/motors');
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan unit motor.');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="py-20 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-3 border-primary-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-gray-500 mt-3">Memuat form data unit motor...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/motors')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              {isEdit ? 'Edit Data Motor' : 'Tambah Unit Motor Baru'}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {isEdit
                ? 'Perbarui spesifikasi, kelengkapan, dan foto unit motor armada.'
                : 'Daftarkan motor baru ke dalam sistem katalog sewa RodaKita.'}
            </p>
          </div>
        </div>
      </div>

      {/* Information Banner on Price Immutability */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 leading-relaxed">
          <strong>Catatan Kebijakan Tarif:</strong> Perubahan harga sewa harian maupun deposit hanya akan berlaku untuk pemesanan baru yang dibuat setelah perubahan disimpan. Booking yang sudah ada tidak akan terpengaruh.
        </div>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card 1: Identitas Motor */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">
            Informasi Pokok & Spesifikasi
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Nama Model Motor" required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Honda Vario 160 ABS"
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-semibold"
                required
              />
            </FormField>

            <FormField label="Plat Nomor Polisi (Unik)" required helperText="Harus unik, misal: B 1234 ABC">
              <input
                type="text"
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value)}
                placeholder="Contoh: B 4567 KLA"
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-mono uppercase font-bold"
                required
              />
            </FormField>

            <FormField label="Merek Pabrikan" required>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
              >
                <option value="Honda">Honda</option>
                <option value="Yamaha">Yamaha</option>
                <option value="Vespa">Vespa</option>
                <option value="Kawasaki">Kawasaki</option>
                <option value="Suzuki">Suzuki</option>
              </select>
            </FormField>

            <FormField label="Kategori Tipe" required>
              <select
                value={type}
                onChange={(e) => {
                  const newType = e.target.value as any;
                  setType(newType);
                  if (newType === 'matic') setTransmission('Otomatis');
                  else if (newType === 'sport' || newType === 'trail') setTransmission('Manual');
                }}
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
              >
                <option value="matic">Matic / Scooter</option>
                <option value="manual">Manual / Bebek</option>
                <option value="sport">Sport</option>
                <option value="trail">Trail / Adventure</option>
              </select>
            </FormField>

            <FormField label="Transmisi" required>
              <select
                value={transmission}
                onChange={(e) => setTransmission(e.target.value as 'Otomatis' | 'Manual')}
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
              >
                <option value="Otomatis">Otomatis (Matic)</option>
                <option value="Manual">Manual</option>
              </select>
            </FormField>

            <FormField label="Warna Motor" required>
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="Contoh: Hitam Glossy, Merah Matte"
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                required
              />
            </FormField>

            <FormField label="Kapasitas Mesin (CC)" required>
              <input
                type="number"
                value={cc}
                onChange={(e) => setCc(Number(e.target.value))}
                min={50}
                max={1000}
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
              />
            </FormField>

            <FormField label="Tahun Pembuatan" required>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                min={2015}
                max={2030}
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
              />
            </FormField>

            <FormField label="Kapasitas Tangki BBM (Liter)" required>
              <input
                type="number"
                step="0.5"
                value={fuelCapacity}
                onChange={(e) => setFuelCapacity(Number(e.target.value))}
                min={2}
                max={30}
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
              />
            </FormField>

            <FormField label="Status Armada" required>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-semibold"
              >
                <option value="available">Aktif / Tersedia (Ready Sewa)</option>
                <option value="maintenance">Dalam Servis / Perawatan</option>
                <option value="inactive">Nonaktif (Diarsipkan)</option>
              </select>
            </FormField>
          </div>

          <FormField label="Deskripsi Unit">
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Jelaskan kondisi fisik motor, kenyamanan berkendara, bagasi, atau informasi spesifik lainnya..."
              className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
            />
          </FormField>
        </div>

        {/* Card 2: Harga Sewa & Deposit */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">
            Tarif Sewa & Deposit Jaminan
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Tarif Sewa Harian (Rp)" required helperText="Tarif dasar untuk 1 hari (24 jam)">
              <input
                type="number"
                value={pricePerDay}
                onChange={(e) => setPricePerDay(Number(e.target.value))}
                min={10000}
                step={5000}
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
              />
            </FormField>

            <FormField label="Uang Jaminan / Deposit (Rp)" required helperText="Deposit dikembalikan saat motor selesai disewa tanpa kendala">
              <input
                type="number"
                value={deposit}
                onChange={(e) => setDeposit(Number(e.target.value))}
                min={0}
                step={10000}
                className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
              />
            </FormField>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">
              Kelengkapan & Fitur Termasuk (Pilih Chip):
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {DEFAULT_FEATURE_OPTIONS.map((feat) => {
                const active = features.includes(feat);
                return (
                  <button
                    key={feat}
                    type="button"
                    onClick={() => handleToggleFeature(feat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-primary-900 text-white border-primary-900 shadow-xs'
                        : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    {active ? `✓ ${feat}` : `+ ${feat}`}
                  </button>
                );
              })}
              {features
                .filter((f) => !DEFAULT_FEATURE_OPTIONS.includes(f))
                .map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => handleToggleFeature(f)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-primary-900 text-white border-primary-900 shadow-xs flex items-center gap-1.5"
                  >
                    <span>✓ {f}</span>
                    <span className="text-[10px] text-primary-200">×</span>
                  </button>
                ))}
            </div>

            {/* Add Custom Feature */}
            <div className="flex gap-2 max-w-sm">
              <input
                type="text"
                value={customFeature}
                onChange={(e) => setCustomFeature(e.target.value)}
                placeholder="Tambah fitur lain..."
                className="flex-1 text-xs px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
              />
              <button
                type="button"
                onClick={handleAddCustomFeature}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-lg border border-gray-300"
              >
                + Tambah
              </button>
            </div>
          </div>
        </div>

        {/* Card 3: Galeri Foto Motor */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Galeri Foto Unit</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Unggah maksimal 8 foto (JPG, PNG, WebP maks 3 MB). Foto pertama akan menjadi foto sampul utama. Seret foto untuk mengubah urutan.
            </p>
          </div>
          <ImageUploader images={images} onChange={setImages} maxImages={8} />
        </div>

        {/* Card 4: Riwayat Penyewaan Unit Ini (Hanya tampil saat Edit Motor) */}
        {isEdit && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-primary-900" />
                  <h3 className="text-sm font-bold text-gray-900">Riwayat Penyewaan Unit Ini</h3>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Daftar seluruh transaksi booking yang menggunakan unit motor ini ({licensePlate || 'Tanpa Plat'}).
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate(`/admin/rental-history?motorId=${id}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-50 hover:bg-primary-100 text-primary-900 text-xs font-semibold transition-colors"
              >
                <span>Buka Riwayat Lengkap Unit Ini</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Summary Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
                <span className="text-[11px] font-semibold text-blue-700">Total Kali Disewa</span>
                <p className="text-lg font-black text-blue-950 mt-0.5">{rentalHistory.length}x Transaksi</p>
              </div>

              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                <span className="text-[11px] font-semibold text-emerald-700">Total Pendapatan Unit</span>
                <p className="text-lg font-black text-emerald-950 mt-0.5">
                  {formatPrice(
                    rentalHistory
                      .filter((b) => ['confirmed', 'active', 'completed'].includes(b.status))
                      .reduce((sum, b) => sum + (b.totalPrice ?? b.total ?? 0), 0),
                  )}
                </p>
              </div>

              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl col-span-2 sm:col-span-1">
                <span className="text-[11px] font-semibold text-indigo-700">Selesai / Berjalan</span>
                <p className="text-lg font-black text-indigo-950 mt-0.5">
                  {rentalHistory.filter((b) => b.status === 'completed').length} Selesai •{' '}
                  {rentalHistory.filter((b) => b.status === 'active').length} Berjalan
                </p>
              </div>
            </div>

            {/* Table */}
            {rentalHistory.length === 0 ? (
              <div className="py-8 text-center text-gray-400 bg-gray-50 rounded-xl border border-gray-200 text-xs">
                Unit motor ini belum memiliki riwayat transaksi penyewaan.
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 border-b border-gray-200 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Kode Booking</th>
                      <th className="py-2.5 px-3">Penyewa</th>
                      <th className="py-2.5 px-3">Jadwal Sewa</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Total Sewa</th>
                      <th className="py-2.5 px-3">Odometer</th>
                      <th className="py-2.5 px-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {rentalHistory.slice(0, 10).map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-primary-900">
                          {b.code || b.bookingCode}
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="font-semibold text-gray-900">{b.renter?.name || b.userName || 'Penyewa'}</p>
                          <p className="text-[10px] text-gray-400">{b.renter?.phone || b.userPhone || '-'}</p>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-medium text-gray-800">
                            {formatDate(b.startDate)} - {formatDate(b.endDate)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusBadge status={b.status} size="sm" />
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-gray-900">
                          {formatPrice(b.totalPrice ?? b.total ?? 0)}
                        </td>
                        <td className="py-2.5 px-3 text-gray-500 font-mono text-[11px]">
                          {b.startOdometer !== undefined || b.handover?.startOdometer !== undefined ? (
                            <span>
                              KM {b.startOdometer ?? b.handover?.startOdometer}{' '}
                              {b.endOdometer !== undefined || b.returnInfo?.endOdometer !== undefined
                                ? `→ ${b.endOdometer ?? b.returnInfo?.endOdometer}`
                                : ''}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/bookings/${b.id}`)}
                            className="px-2 py-1 rounded bg-gray-100 hover:bg-primary-900 hover:text-white text-gray-700 transition-colors font-semibold text-[10px] inline-flex items-center gap-1"
                          >
                            <span>Detail</span>
                            <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/admin/motors')}
            className="px-4 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-900 hover:bg-primary-800 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {loading ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan Unit' : 'Terbitkan Unit Motor'}
          </button>
        </div>
      </form>
    </div>
  );
};
export default MotorForm;
