import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Store, Truck, Upload, X, CheckCircle2 } from 'lucide-react';
import type { Booking } from '../../types';
import { Modal } from '../ui/Modal';
import { requestBookingReturn } from '../../services/api';

interface RequestReturnModalProps {
  open: boolean;
  booking: Booking | null;
  motorName?: string;
  onClose: () => void;
  onSuccess: (updated: Booking) => void;
}

export const RequestReturnModal: React.FC<RequestReturnModalProps> = ({
  open,
  booking,
  motorName,
  onClose,
  onSuccess,
}) => {
  const [returnMethod, setReturnMethod] = useState<'store' | 'pickup'>('store');
  const [notes, setNotes] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [photoName, setPhotoName] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  if (!booking) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Ukuran foto maksimal 2 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoPreview(reader.result);
        setPhotoName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (returnMethod === 'pickup' && notes.trim().length < 5) {
      toast.error('Mohon isi lokasi penjemputan pada kolom catatan.');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await requestBookingReturn(booking.id || booking.code, {
        returnMethod,
        notes: notes.trim(),
        photoUrl: photoPreview || undefined,
      });
      toast.success('Pengajuan pengembalian motor berhasil dikirim ke Admin.');
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengajukan pengembalian motor.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Ajukan Pengembalian Motor">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700">
          <div className="font-bold text-slate-900 text-sm">
            {motorName || booking.motorName || 'Sewa Motor RodaKita'}
          </div>
          <div className="mt-0.5 text-slate-500">
            Kode Booking: <span className="font-mono font-semibold text-slate-700">{booking.code || booking.id}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Pilih Metode Pengembalian <span className="text-red-600">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setReturnMethod('store')}
              className={`text-left p-3.5 rounded-xl border-2 transition ${
                returnMethod === 'store'
                  ? 'border-blue-700 bg-blue-50/50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
                <Store className="w-4 h-4 text-blue-700" /> Kembalikan ke Toko
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Antar langsung motor ke garasi RodaKita (Jl. Sudirman No. 123)
              </p>
            </button>

            <button
              type="button"
              onClick={() => setReturnMethod('pickup')}
              className={`text-left p-3.5 rounded-xl border-2 transition ${
                returnMethod === 'pickup'
                  ? 'border-blue-700 bg-blue-50/50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
                <Truck className="w-4 h-4 text-blue-700" /> Minta Jemput Petugas
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Petugas kami menjemput motor di lokasi Anda (Pickup)
              </p>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-1">
            {returnMethod === 'pickup'
              ? 'Lokasi Penjemputan & Catatan Kondisi Motor *'
              : 'Catatan Kondisi Motor (Opsional)'}
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              returnMethod === 'pickup'
                ? 'Contoh: Jemput di Lobby Hotel Santika Jl. Sudirman, kondisi motor baik & bensin penuh...'
                : 'Contoh: Kondisi motor aman, helm 2 lengkap, sudah tiba di toko...'
            }
            className="w-full p-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-1">
            Foto Kondisi Motor Saat Dikembalikan (Opsional)
          </label>
          {photoPreview ? (
            <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-50 p-2">
              <img
                src={photoPreview}
                alt="Preview kondisi motor"
                className="w-full h-40 object-cover rounded-lg"
              />
              <div className="flex items-center justify-between mt-2 px-1">
                <span className="text-xs text-slate-600 truncate">{photoName}</span>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoPreview('');
                    setPhotoName('');
                  }}
                  className="text-xs text-red-600 hover:underline flex items-center gap-1 font-medium"
                >
                  <X className="w-3.5 h-3.5" /> Hapus Foto
                </button>
              </div>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-blue-600 rounded-xl p-4 cursor-pointer transition bg-slate-50/50">
              <Upload className="w-5 h-5 text-slate-400 mb-1" />
              <span className="text-xs font-medium text-slate-700">
                Klik untuk unggah foto kondisi motor
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5">JPG, PNG, WEBP (Maks. 2MB)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-10 px-5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {submitting ? 'Mengirim...' : 'Kirim Pengajuan Pengembalian'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
