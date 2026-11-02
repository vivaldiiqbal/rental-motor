import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, AlertCircle, ExternalLink, UserCheck, PhoneCall } from 'lucide-react';
import { Textarea } from '../ui/Textarea';
import { getRenterProfile } from '../../services/api';
import type { BookingDraft, DraftErrors } from './draft';
import type { RenterProfile, RenterReadiness } from '../../types';

interface Props {
  draft: BookingDraft;
  errors: DraftErrors;
  onChange: (patch: Partial<BookingDraft>) => void;
}

export function StepRenterData({ draft, errors, onChange }: Props) {
  const [profile, setProfile] = useState<RenterProfile | null>(draft.profile || null);
  const [readiness, setReadiness] = useState<RenterReadiness | null>(draft.readiness || null);
  const [loading, setLoading] = useState(!draft.profile);

  useEffect(() => {
    let active = true;
    getRenterProfile()
      .then((res) => {
        if (!active) return;
        setProfile(res.profile);
        setReadiness(res.readiness);
        onChange({
          profile: res.profile,
          readiness: res.readiness,
          name: res.profile?.fullNameKtp || draft.name,
          phone: res.profile?.phoneE164 || draft.phone,
          idNumber: res.profile?.nikLast4 || draft.idNumber,
        });
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-neutral-200 pb-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Ringkasan Data Penyewa</h2>
          <p className="text-xs text-neutral-500">
            Data identitas diambil dari profil resmi akun Anda (sumber data tunggal).
          </p>
        </div>
        <Link
          to="/profile#renter-data"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-800 hover:underline"
        >
          <span>Ubah di profil</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="p-6 text-center text-xs text-neutral-500 animate-pulse bg-neutral-50 rounded-xl border border-neutral-200">
          Memuat data profil penyewa...
        </div>
      ) : (
        <div className="space-y-4">
          {/* Peringatan jika profil belum siap */}
          {readiness && !readiness.isReady && (
            <div role="alert" className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-xs text-danger-800 space-y-2">
              <div className="flex items-center gap-2 font-bold text-danger-900">
                <AlertCircle className="w-4 h-4 text-danger-600 flex-shrink-0" />
                <span>Profil Belum Memenuhi Syarat Pemesanan:</span>
              </div>
              <ul className="list-disc pl-5 space-y-1">
                {readiness.issues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
              <div className="pt-1">
                <Link
                  to={readiness.actionUrl || '/profile'}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-danger-600 hover:bg-danger-700 text-white rounded-lg font-semibold text-xs transition-colors shadow-xs"
                >
                  Lengkapi Profil Sekarang &rarr;
                </Link>
              </div>
            </div>
          )}

          {errors.name && (
            <div className="text-xs text-danger-600 bg-danger-50 p-2.5 rounded-lg border border-danger-200">
              {errors.name}
            </div>
          )}

          {/* Kartu Ringkasan Data Penyewa (Hanya Baca) */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 border-b border-neutral-100 pb-2.5">
              <UserCheck className="w-4 h-4 text-primary-700" />
              <span>Identitas KTP Penyewa</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div>
                <span className="text-neutral-400 block text-[11px] font-medium">Nama Lengkap (KTP)</span>
                <p className="font-semibold text-ink text-sm">
                  {profile?.fullNameKtp || <span className="text-danger-600 font-medium">Belum diisi</span>}
                </p>
              </div>
              <div>
                <span className="text-neutral-400 block text-[11px] font-medium">NIK (KTP Terenkripsi)</span>
                <p className="font-mono text-ink font-semibold">
                  {profile?.nikMasked || (profile?.nikLast4 ? `••••••••••••${profile.nikLast4}` : <span className="text-danger-600 font-medium">Belum diisi</span>)}
                </p>
              </div>
              <div>
                <span className="text-neutral-400 block text-[11px] font-medium">Nomor WhatsApp / HP</span>
                <p className="font-mono text-ink font-semibold">
                  {profile?.phoneE164 || draft.phone || <span className="text-danger-600 font-medium">Belum diisi</span>}
                </p>
              </div>
              <div>
                <span className="text-neutral-400 block text-[11px] font-medium">Email Akun</span>
                <p className="text-ink">
                  {draft.email || <span className="text-danger-600 font-medium">Belum diisi</span>}
                </p>
              </div>
            </div>

            <div className="border-t border-neutral-100 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-neutral-400 block text-[11px] font-medium">Alamat Sesuai KTP</span>
                <p className="text-neutral-700">
                  {profile?.addressKtp || <span className="text-danger-600 font-medium">Belum diisi</span>}
                </p>
              </div>
              <div>
                <span className="text-neutral-400 block text-[11px] font-medium">Alamat Tinggal / Penginapan Selama Sewa</span>
                <p className="text-neutral-700">
                  {profile?.stayAddress || <span className="text-danger-600 font-medium">Belum diisi</span>}
                </p>
              </div>
            </div>

            {/* Kontak Darurat */}
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 text-xs space-y-2">
              <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                <PhoneCall className="w-3.5 h-3.5 text-amber-700" />
                <span>Kontak Darurat (Emergency Contact):</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-ink">
                <div>
                  <span className="text-[10px] text-neutral-500 block">Nama Kontak</span>
                  <span className="font-semibold">
                    {profile?.emergencyContact?.name || profile?.emergencyName || <span className="text-danger-600 font-medium">Belum diisi</span>}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 block">Hubungan / Relasi</span>
                  <span className="capitalize">
                    {profile?.emergencyContact?.relation || profile?.emergencyRelation || <span className="text-danger-600 font-medium">Belum diisi</span>}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 block">Nomor HP Darurat</span>
                  <span className="font-mono font-semibold">
                    {profile?.emergencyContact?.phone || profile?.emergencyPhone || <span className="text-danger-600 font-medium">Belum diisi</span>}
                  </span>
                </div>
              </div>
            </div>

            {/* Status Dokumen */}
            <div className="flex items-center justify-between bg-neutral-50 p-3 rounded-xl border border-neutral-200 text-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-neutral-800">
                  Status Dokumen: {readiness?.pendingDocuments?.length === 0 ? (
                    <strong className="text-emerald-700">Terverifikasi Lengkap</strong>
                  ) : (
                    <span className="text-amber-700 font-medium">{readiness?.pendingDocuments?.join(', ') || 'Belum Lengkap'}</span>
                  )}
                </span>
              </div>
              <Link
                to="/profile#documents"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-700 font-semibold hover:underline text-[11px]"
              >
                Cek Dokumen &rarr;
              </Link>
            </div>
          </div>

          {/* Catatan Tambahan (Satu-satunya kolom bebas opsional dari penyewa) */}
          <Textarea
            label="Catatan Tambahan (opsional)"
            value={draft.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            maxLength={300}
            placeholder="Misal: estimasi jam serah terima, ukuran helm khusus, atau permintaan jas hujan tambahan..."
          />
        </div>
      )}
    </div>
  );
}
