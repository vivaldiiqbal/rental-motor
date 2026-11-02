import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Clock,
  FileText,
  Upload,
  AlertTriangle,
  Info,
  PhoneCall,
  UserCheck,
  Eye,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RefreshCw,
  X,
  XCircle,
  ShieldCheck,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { Seo } from '../components/Seo';
import { PageContainer } from '../components/layout/PageContainer';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { Tabs } from '../components/ui/Tabs';
import { Input, Select } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Checkbox } from '../components/ui/Checkbox';
import { PasswordInput } from '../components/ui/PasswordInput';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import * as api from '../services/api';
import { isPasswordAcceptable, isPhone } from '../lib/validators';
import type { DocStatus, User, RenterReadiness, UserDocumentInfo } from '../types';

const docMeta: Record<DocStatus, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' }> = {
  none: { label: 'Belum diunggah', tone: 'neutral' },
  pending: { label: 'Menunggu verifikasi', tone: 'warning' },
  verified: { label: 'Terverifikasi', tone: 'success' },
  rejected: { label: 'Ditolak', tone: 'danger' },
};
const MAX_FILE = 5 * 1024 * 1024;

function PersonalTab({ user }: { user: User }) {
  const { setUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [address, setAddress] = useState(user.address);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const errors = {
    name: name.trim().length < 3 ? 'Nama lengkap minimal 3 karakter.' : '',
    phone: !isPhone(phone) ? 'Nomor HP tidak valid.' : '',
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (errors.name || errors.phone) return;
    setBusy(true);
    try {
      setUser(await api.updateProfile(user.id, { name: name.trim(), phone: phone.trim(), address: address.trim() }));
      toast.success('Data diri disimpan.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="max-w-lg space-y-4">
      <Input label="Nama lengkap" required value={name} onChange={(e) => setName(e.target.value)} error={touched ? errors.name : ''} />
      <Input label="Email" value={user.email} disabled hint="Email tidak dapat diubah." readOnly />
      <Input label="Nomor HP / WhatsApp" required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={touched ? errors.phone : ''} />
      <Textarea label="Alamat" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={250} />
      <Button type="submit" loading={busy}>
        Simpan perubahan
      </Button>
    </form>
  );
}

function DocumentPreviewModal({
  isOpen,
  onClose,
  title,
  kind,
  status,
  reviewerNote,
  updatedAt,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  kind: 'ktp' | 'sim';
  status: DocStatus;
  reviewerNote?: string | null;
  updatedAt: number;
}) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setRotation(0);
      setImgLoaded(false);
      setImgError(false);
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const docUrl = api.getDocumentUrl(kind, updatedAt);
  const meta = docMeta[status] || docMeta.none;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-neutral-950/80 backdrop-blur-sm animate-fadeIn">
      <div
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden border border-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-neutral-200 bg-neutral-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-50 rounded-lg text-primary-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base sm:text-lg text-ink">{title}</h3>
                <Badge
                  tone={meta.tone}
                  icon={
                    status === 'verified' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : status === 'pending' ? (
                      <Clock className="h-3.5 w-3.5" />
                    ) : status === 'rejected' ? (
                      <XCircle className="h-3.5 w-3.5" />
                    ) : undefined
                  }
                >
                  {meta.label}
                </Badge>
              </div>
              <p className="text-xs text-neutral-500">Pratinjau berkas identitas resmi Anda</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 transition-colors"
            aria-label="Tutup pratinjau"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 sm:px-6 py-2.5 bg-neutral-100 border-b border-neutral-200 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-neutral-500 font-medium mr-1 hidden sm:inline">Kontrol Foto:</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white border border-neutral-300 hover:bg-neutral-50 font-medium text-neutral-700 transition"
              title="Perbesar foto"
            >
              <ZoomIn className="h-3.5 w-3.5" />
              Perbesar
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white border border-neutral-300 hover:bg-neutral-50 font-medium text-neutral-700 transition"
              title="Perkecil foto"
            >
              <ZoomOut className="h-3.5 w-3.5" />
              Perkecil
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setRotation(0);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white border border-neutral-300 hover:bg-neutral-50 font-medium text-neutral-700 transition"
              title="Kembalikan ukuran normal"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset ({Math.round(zoom * 100)}%)
            </button>
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white border border-neutral-300 hover:bg-neutral-50 font-medium text-neutral-700 transition"
              title="Putar 90 derajat"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Putar ({rotation}°)
            </button>
          </div>
          <a
            href={docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-primary-600 hover:text-primary-700 hover:bg-primary-50 font-medium transition"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Buka Tab Baru
          </a>
        </div>

        {/* Rejection Note Warning if Rejected */}
        {status === 'rejected' && reviewerNote && (
          <div className="mx-5 sm:mx-6 mt-4 p-3.5 rounded-xl bg-danger-50 border border-danger-200 flex items-start gap-3 text-xs text-danger-800">
            <AlertTriangle className="h-5 w-5 text-danger-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-danger-900">Catatan Penolakan Verifikator:</p>
              <p className="mt-0.5">{reviewerNote}</p>
              <p className="mt-1 text-danger-700 font-medium">Harap unggah ulang foto yang jelas dan pastikan seluruh tulisan terbaca tanpa silau.</p>
            </div>
          </div>
        )}

        {/* Viewport Image */}
        <div className="relative flex-1 min-h-[320px] sm:min-h-[380px] max-h-[60vh] overflow-auto p-4 flex items-center justify-center bg-neutral-900/95">
          {!imgLoaded && !imgError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" />
              <span className="text-xs">Memuat foto dokumen...</span>
            </div>
          )}

          {imgError ? (
            <div className="text-center p-6 text-neutral-400">
              <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-neutral-200">Gagal memuat pratinjau foto langsung</p>
              <p className="text-xs text-neutral-400 mt-1">
                Silakan buka di tab baru atau unduh kembali berkas identitas Anda.
              </p>
              <a
                href={docUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block px-3 py-1.5 rounded-lg bg-neutral-800 text-neutral-200 text-xs hover:bg-neutral-700 transition"
              >
                Buka Dokumen
              </a>
            </div>
          ) : (
            <div
              className="transition-transform duration-200 ease-out flex items-center justify-center"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
              }}
            >
              <img
                src={docUrl}
                alt={`Foto ${title}`}
                className={`max-w-full max-h-[55vh] object-contain rounded-lg shadow-2xl transition-opacity duration-300 ${
                  imgLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                onLoad={() => setImgLoaded(true)}
                onError={() => {
                  setImgError(true);
                  setImgLoaded(false);
                }}
              />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-3.5 bg-neutral-50 border-t border-neutral-200">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <ShieldCheck className="h-4 w-4 text-success-600 shrink-0" />
            <span>Dokumen disimpan terenkripsi. Hanya Anda dan staf verifikasi yang memiliki akses.</span>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Tutup Pratinjau
          </Button>
        </div>
      </div>
    </div>
  );
}

function DocRow({
  kind,
  title,
  status,
  docInfo,
  lastUpdated,
  onUpload,
  onOpenPreview,
}: {
  kind: 'ktp' | 'sim';
  title: string;
  status: DocStatus;
  docInfo?: UserDocumentInfo | null;
  lastUpdated: number;
  onUpload: (k: 'ktp' | 'sim', file: File) => Promise<void>;
  onOpenPreview: (k: 'ktp' | 'sim') => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const meta = docMeta[status] || docMeta.none;
  const isUploaded = status !== 'none';
  const docUrl = api.getDocumentUrl(kind, lastUpdated);

  const onFile = async (file?: File) => {
    if (!file) return;
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('File berformat PDF ditolak. Harap unggah foto identitas asli (JPG, PNG, atau WEBP).');
      return;
    }
    if (!/^(image\/(jpeg|png|webp))$/.test(file.type)) {
      toast.error('Format file tidak didukung. Harap unggah format JPG, PNG, atau WEBP.');
      return;
    }
    if (file.size > MAX_FILE) {
      toast.error('Ukuran file melebihi batas 5 MB. Harap unggah file yang lebih kecil.');
      return;
    }
    setBusy(true);
    try {
      await onUpload(kind, file);
      setThumbError(false);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const formattedDate = docInfo?.uploadedAt
    ? new Date(docInfo.uploadedAt).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <li className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 shadow-xs transition hover:shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Left Side: Thumbnail Preview or Placeholder */}
        <div className="flex items-start sm:items-center gap-4 w-full sm:w-auto">
          {isUploaded ? (
            <div
              onClick={() => onOpenPreview(kind)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onOpenPreview(kind);
              }}
              className="group relative w-32 sm:w-36 aspect-[16/10] shrink-0 rounded-xl overflow-hidden bg-neutral-900 border border-neutral-200 cursor-pointer shadow-xs hover:border-primary-400 transition"
              title="Klik untuk melihat foto dokumen dalam resolusi penuh"
            >
              {!thumbError ? (
                <img
                  src={docUrl}
                  alt={`Pratinjau ${title}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={() => setThumbError(true)}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-2 text-neutral-400 bg-neutral-800">
                  <FileText className="h-6 w-6 text-primary-400 mb-1" />
                  <span className="text-[10px] text-center font-medium">Foto Dokumen</span>
                </div>
              )}
              {/* Hover overlay badge */}
              <div className="absolute inset-0 bg-neutral-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 text-white text-xs font-medium transition-opacity backdrop-blur-[1px]">
                <Eye className="h-3.5 w-3.5" />
                <span>Lihat</span>
              </div>
            </div>
          ) : (
            <div className="w-32 sm:w-36 aspect-[16/10] shrink-0 rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 flex flex-col items-center justify-center p-2 text-neutral-400">
              <FileText className="h-6 w-6 text-neutral-300 mb-1" />
              <span className="text-[10px] font-medium text-neutral-500">Belum Ada Foto</span>
            </div>
          )}

          {/* Document Title & Meta Information */}
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold text-base text-ink">{title}</h4>
              <Badge
                tone={meta.tone}
                icon={
                  status === 'verified' ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : status === 'pending' ? (
                    <Clock className="h-3.5 w-3.5" />
                  ) : status === 'rejected' ? (
                    <XCircle className="h-3.5 w-3.5" />
                  ) : undefined
                }
              >
                {meta.label}
              </Badge>
            </div>

            {isUploaded ? (
              <div className="text-xs text-neutral-500 space-y-0.5">
                {formattedDate && <p>Diupload: {formattedDate} WIB</p>}
                {status === 'verified' && (
                  <p className="text-success-700 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Siap digunakan untuk serah terima motor
                  </p>
                )}
                {status === 'pending' && (
                  <p className="text-amber-700 font-medium flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Sedang ditinjau oleh staf verifikasi
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-neutral-500">
                Wajib diunggah agar proses verifikasi dan serah-terima motor dapat diproses.
              </p>
            )}
          </div>
        </div>

        {/* Right Side: Action Buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-100">
          <input
            ref={input}
            id={`file-${kind}`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
            disabled={busy}
          />

          {isUploaded && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onOpenPreview(kind)}
              leftIcon={<Eye className="h-4 w-4" />}
            >
              Lihat Foto
            </Button>
          )}

          <Button
            variant={isUploaded ? 'secondary' : 'primary'}
            size="sm"
            loading={busy}
            onClick={() => input.current?.click()}
            leftIcon={<Upload className="h-4 w-4" />}
          >
            {isUploaded ? 'Ganti Foto' : 'Unggah Foto'}
          </Button>
        </div>
      </div>

      {/* Rejection Note Alert Banner */}
      {status === 'rejected' && docInfo?.reviewerNote && (
        <div className="mt-3 p-3 rounded-xl bg-danger-50 border border-danger-200 text-xs text-danger-800 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-danger-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-danger-900">Alasan Penolakan: </span>
            <span>{docInfo.reviewerNote}</span>
            <p className="mt-1 font-medium text-danger-700">Silakan klik "Ganti Foto" untuk mengunggah ulang dokumen yang sesuai.</p>
          </div>
        </div>
      )}
    </li>
  );
}

function DocumentsTab({ user }: { user: User }) {
  const { setUser, refresh } = useAuth();
  const [docDetails, setDocDetails] = useState<Record<'ktp' | 'sim', UserDocumentInfo> | null>(null);
  const [activePreview, setActivePreview] = useState<'ktp' | 'sim' | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const hasPending = user.documents.ktp === 'pending' || user.documents.sim === 'pending';

  const loadDocuments = async () => {
    try {
      const res = await api.getMyDocuments();
      setDocDetails(res);
      if (res && (res.ktp.status !== user.documents.ktp || res.sim.status !== user.documents.sim)) {
        setUser({
          ...user,
          documents: {
            ktp: res.ktp.status,
            sim: res.sim.status,
          },
        });
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void loadDocuments();
  }, [user.id]);

  // Real-time synchronization: subscribe to document updates
  useRealtimeSubscription(['document.updated', 'counters.changed'], () => {
    void loadDocuments();
    void refresh();
    setLastUpdated(Date.now());
  });

  // Periodic refresh while documents are pending
  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => {
      void refresh();
      void loadDocuments();
      setLastUpdated(Date.now());
    }, 4000);
    return () => clearInterval(t);
  }, [hasPending, refresh]);

  const upload = async (kind: 'ktp' | 'sim', file: File) => {
    try {
      const updatedUser = await api.uploadDocument(user.id, kind, file);
      setUser(updatedUser);
      setLastUpdated(Date.now());
      await loadDocuments();
      toast.success(`Foto ${kind.toUpperCase()} berhasil diunggah. Dokumen sedang diverifikasi.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengunggah foto dokumen.');
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      {/* Information Header */}
      <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 space-y-1.5">
        <div className="flex items-center gap-2 font-semibold text-neutral-900 text-sm">
          <ShieldCheck className="h-4 w-4 text-primary-600" />
          Verifikasi Keabsahan Dokumen Identitas
        </div>
        <p>
          Unggah foto asli fisik KTP dan SIM C Anda. Anda dapat memeriksa hasil foto secara langsung dengan tombol{' '}
          <strong className="text-neutral-900">"Lihat Foto"</strong> untuk memastikan ketajaman dan keterbacaan data identitas sebelum diserahkan.
        </p>
        <p className="text-neutral-500 text-[11px]">
          Format didukung: JPG, JPEG, PNG, atau WebP (maksimal 5 MB per foto).
        </p>
      </div>

      {/* Document List */}
      <ul className="space-y-3.5">
        <DocRow
          kind="ktp"
          title="KTP (Kartu Tanda Penduduk)"
          status={docDetails?.ktp?.status || user.documents.ktp}
          docInfo={docDetails?.ktp}
          lastUpdated={lastUpdated}
          onUpload={upload}
          onOpenPreview={(k) => setActivePreview(k)}
        />
        <DocRow
          kind="sim"
          title="SIM C (Surat Izin Mengemudi)"
          status={docDetails?.sim?.status || user.documents.sim}
          docInfo={docDetails?.sim}
          lastUpdated={lastUpdated}
          onUpload={upload}
          onOpenPreview={(k) => setActivePreview(k)}
        />
      </ul>

      {/* Interactive Inspection Modal */}
      {activePreview && (
        <DocumentPreviewModal
          isOpen={Boolean(activePreview)}
          onClose={() => setActivePreview(null)}
          kind={activePreview}
          title={activePreview === 'ktp' ? 'KTP (Kartu Tanda Penduduk)' : 'SIM C (Surat Izin Mengemudi)'}
          status={user.documents[activePreview]}
          reviewerNote={docDetails?.[activePreview]?.reviewerNote}
          updatedAt={lastUpdated}
        />
      )}
    </div>
  );
}

function SecurityTab({ user }: { user: User }) {
  const [old, setOld] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const errors = {
    old: old ? '' : 'Kata sandi lama wajib diisi.',
    pw: isPasswordAcceptable(pw) ? '' : 'Minimal 8 karakter, mengandung huruf dan angka.',
    confirm: confirm === pw ? '' : 'Konfirmasi kata sandi tidak sama.',
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (errors.old || errors.pw || errors.confirm) return;
    setBusy(true);
    try {
      await api.changePassword(user.id, old, pw);
      toast.success('Kata sandi berhasil diganti.');
      setOld('');
      setPw('');
      setConfirm('');
      setTouched(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengganti kata sandi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="max-w-lg space-y-4">
      <PasswordInput label="Kata sandi lama" required autoComplete="current-password" value={old} onChange={(e) => setOld(e.target.value)} error={touched ? errors.old : ''} />
      <PasswordInput label="Kata sandi baru" required showStrength autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={touched ? errors.pw : ''} />
      <PasswordInput label="Ulangi kata sandi baru" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={touched ? errors.confirm : ''} />
      <Button type="submit" loading={busy}>
        Ganti kata sandi
      </Button>
    </form>
  );
}

function PreferencesTab({ user }: { user: User }) {
  const { setUser } = useAuth();
  const [prefs, setPrefs] = useState(user.preferences);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      setUser(await api.updateProfile(user.id, { preferences: prefs }));
      toast.success('Preferensi disimpan.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-lg space-y-4">
      <Checkbox label="Notifikasi booking lewat email" checked={prefs.emailNotif} onChange={(e) => setPrefs({ ...prefs, emailNotif: e.target.checked })} />
      <Checkbox label="Notifikasi booking lewat WhatsApp" checked={prefs.whatsappNotif} onChange={(e) => setPrefs({ ...prefs, whatsappNotif: e.target.checked })} />
      <Checkbox label="Info promo dan penawaran" checked={prefs.promo} onChange={(e) => setPrefs({ ...prefs, promo: e.target.checked })} />
      <Button onClick={save} loading={busy}>
        Simpan preferensi
      </Button>
    </div>
  );
}

function RenterDataTab({ user }: { user: User }) {
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [readiness, setReadiness] = useState<RenterReadiness | null>(null);

  // Form Fields
  const [fullNameKtp, setFullNameKtp] = useState('');
  const [nik, setNik] = useState('');
  const [nikLast4, setNikLast4] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState(user.phone || '');
  const [addressKtp, setAddressKtp] = useState('');
  const [stayAddress, setStayAddress] = useState('');

  // Emergency Contact
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState<'orang tua' | 'pasangan' | 'saudara' | 'kerabat' | 'teman'>('orang tua');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  // Agreements
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [gpsConsent, setGpsConsent] = useState(false);

  // Initial fetch
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await api.getRenterProfile();
        if (!active) return;
        setReadiness(res.readiness);
        if (res.profile) {
          const p = res.profile;
          setFullNameKtp(p.fullNameKtp || '');
          setBirthDate(p.birthDate ? p.birthDate.slice(0, 10) : '');
          setNikLast4(p.nikLast4 || null);
          setPhone(p.phoneE164 || user.phone || '');
          setAddressKtp(p.addressKtp || '');
          setStayAddress(p.stayAddress || '');
          if (p.emergencyContact) {
            setEmergencyName(p.emergencyContact.name || '');
            setEmergencyRelation((p.emergencyContact.relation as any) || 'orang tua');
            setEmergencyPhone(p.emergencyContact.phone || '');
          }
          setTermsAccepted(Boolean(p.termsVersionAccepted));
          setGpsConsent(Boolean(p.gpsConsentAt));
        } else {
          // Pre-fill from user account
          setFullNameKtp(user.name || '');
          setPhone(user.phone || '');
          setAddressKtp(user.address || '');
        }
      } catch (err) {
        console.error('Failed to load renter profile:', err);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [user]);

  // Validation
  const words = fullNameKtp.trim().split(/\s+/).filter(Boolean);
  const isNameValid = words.length >= 2 && /^[a-zA-Z\s'.]+$/.test(fullNameKtp);
  const isNikValid = nikLast4 && !nik ? true : /^\d{16}$/.test(nik.trim());
  const isPhoneValid = isPhone(phone);
  const isEmergencyPhoneValid = isPhone(emergencyPhone);
  const isDifferentEmergencyPhone = emergencyPhone.trim() !== phone.trim();

  // Age calculation
  let age = 0;
  if (birthDate) {
    const diff = Date.now() - new Date(birthDate).getTime();
    age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  }
  const isAgeValid = Boolean(birthDate) && age >= 18;

  const errors = {
    fullNameKtp: !isNameValid ? 'Wajib minimal 2 kata sesuai KTP tanpa angka atau simbol.' : '',
    nik: !isNikValid ? 'NIK harus 16 digit angka.' : '',
    birthDate: !birthDate
      ? 'Tanggal lahir wajib diisi.'
      : !isAgeValid
      ? `Usia minimal sewa 18 tahun (usia Anda ${age} tahun).`
      : '',
    phone: !isPhoneValid ? 'Nomor HP tidak valid.' : '',
    addressKtp: !addressKtp.trim() ? 'Alamat sesuai KTP wajib diisi.' : '',
    stayAddress: !stayAddress.trim() ? 'Alamat tinggal / hotel selama di Bali wajib diisi.' : '',
    emergencyName: !emergencyName.trim() ? 'Nama kontak darurat wajib diisi.' : '',
    emergencyPhone: !isEmergencyPhoneValid
      ? 'Nomor HP kontak darurat tidak valid.'
      : !isDifferentEmergencyPhone
      ? 'Nomor darurat tidak boleh sama dengan nomor Anda sendiri.'
      : '',
  };

  const hasErrors = Object.values(errors).some(Boolean);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors) {
      toast.error('Mohon lengkapi seluruh formulir data penyewa dengan benar.');
      return;
    }
    setBusy(true);
    try {
      const payload: any = {
        fullNameKtp: fullNameKtp.trim(),
        birthDate,
        addressKtp: addressKtp.trim(),
        phone: phone.trim(),
        stayAddress: stayAddress.trim(),
        emergencyName: emergencyName.trim(),
        emergencyRelation,
        emergencyPhone: emergencyPhone.trim(),
        termsAccepted,
        gpsConsent,
      };
      if (nik.trim()) {
        payload.nik = nik.trim();
      }

      const res = await api.updateRenterProfile(payload);
      setReadiness(res.readiness);
      if (res.profile?.nikLast4) setNikLast4(res.profile.nikLast4);
      setNik(''); // reset raw nik input
      toast.success('Data penyewa resmi berhasil disimpan.');
      await refresh();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan profil penyewa.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-neutral-500">
        Memuat profil penyewa resmi...
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Box Status Kesiapan Sewa */}
      <div
        className={`rounded-2xl border p-4.5 sm:p-5 transition-colors ${
          readiness?.isReady
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
            : 'bg-amber-50/70 border-amber-200 text-amber-900'
        }`}
      >
        <div className="flex items-start gap-3">
          {readiness?.isReady ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-sm">
                {readiness?.isReady
                  ? 'Profil Penyewa Siap untuk Sewa Motor'
                  : 'Profil Penyewa Belum Lengkap untuk Pemesanan'}
              </h3>
              <Badge
                tone={readiness?.isReady ? 'success' : 'warning'}
                icon={readiness?.isReady ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
              >
                {readiness?.isReady ? 'Lengkap & Siap' : 'Perlu Dilengkapi'}
              </Badge>
            </div>
            <p className="text-xs text-neutral-600 mt-1">
              Data ini menjadi sumber tunggal terverifikasi untuk kontrak sewa dan peninjauan staf operasional saat serah terima motor.
            </p>

            {readiness && !readiness.isReady && (
              <div className="mt-3 pt-3 border-t border-amber-200/70 text-xs space-y-1 text-amber-800">
                <span className="font-semibold block">Catatan yang harus dipenuhi:</span>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {readiness.missingFields.map((field, idx) => (
                    <li key={idx}>{field}</li>
                  ))}
                  {readiness.pendingDocuments.map((doc, idx) => (
                    <li key={idx}>Dokumen {doc.toUpperCase()} belum terverifikasi</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Box Peringatan Keamanan Perubahan Identitas */}
      <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3.5 text-xs text-sky-900 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-sky-600 mt-0.5 flex-shrink-0" />
        <div>
          <span className="font-bold block">Pemberitahuan Keamanan Dokumen</span>
          <p className="text-sky-800 text-[11px] mt-0.5 leading-relaxed">
            Demi keselamatan dan kepatuhan hukum, pengubahan identitas kunci (Nama KTP, NIK, atau Tanggal Lahir) pada akun yang telah terverifikasi akan mereset status dokumen Anda kembali ke <strong>Menunggu Verifikasi</strong>.
          </p>
        </div>
      </div>

      <form onSubmit={submit} noValidate className="space-y-5">
        {/* Bagian 1: Identitas Resmi Sesuai KTP */}
        <div className="space-y-3.5 pt-2">
          <h4 className="text-sm font-bold text-ink border-b border-neutral-200 pb-2 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-primary-600" />
            1. Identitas Resmi (KTP)
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nama Lengkap Sesuai KTP"
              required
              placeholder="Contoh: Budi Santoso"
              value={fullNameKtp}
              onChange={(e) => setFullNameKtp(e.target.value)}
              error={touched ? errors.fullNameKtp : ''}
              hint="Minimal 2 kata, tanpa angka atau simbol"
            />

            <div>
              <Input
                label="Nomor Induk Kependudukan (NIK)"
                required={!nikLast4}
                maxLength={16}
                placeholder={nikLast4 ? `••••••••••••${nikLast4}` : '16 digit NIK'}
                value={nik}
                onChange={(e) => setNik(e.target.value.replace(/\D/g, ''))}
                error={touched ? errors.nik : ''}
                hint={nikLast4 ? `Tersimpan aman (akhiran ${nikLast4}). Isi hanya bila ingin mengganti.` : '16 digit angka sesuai KTP'}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Tanggal Lahir"
              type="date"
              required
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              error={touched ? errors.birthDate : ''}
              hint="Usia minimal penyewa adalah 18 tahun"
            />

            <Input
              label="Nomor WhatsApp / HP Aktif"
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={touched ? errors.phone : ''}
              hint="Format Indonesia (08... atau +628...)"
            />
          </div>
        </div>

        {/* Bagian 2: Kontak Darurat */}
        <div className="space-y-3.5 pt-2">
          <h4 className="text-sm font-bold text-ink border-b border-neutral-200 pb-2 flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-primary-600" />
            2. Kontak Darurat (Keluarga / Kerabat)
          </h4>
          <p className="text-xs text-neutral-500">
            Wajib diisi dengan nomor kontak keluarga kandung atau kerabat yang dapat dihubungi saat situasi darurat.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Nama Kontak Darurat"
              required
              placeholder="Nama keluarga/kerabat"
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              error={touched ? errors.emergencyName : ''}
            />

            <Select
              label="Hubungan / Relasi"
              required
              value={emergencyRelation}
              onChange={(e) => setEmergencyRelation(e.target.value as any)}
            >
              <option value="orang tua">Orang Tua</option>
              <option value="pasangan">Pasangan (Suami/Istri)</option>
              <option value="saudara">Saudara Kandung</option>
              <option value="kerabat">Kerabat / Keluarga</option>
              <option value="teman">Teman Dekat</option>
            </Select>

            <Input
              label="Nomor HP Darurat"
              required
              type="tel"
              placeholder="0812..."
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              error={touched ? errors.emergencyPhone : ''}
              hint="Tidak boleh sama dengan nomor Anda"
            />
          </div>
        </div>

        {/* Bagian 3: Alamat KTP & Tempat Menginap */}
        <div className="space-y-3.5 pt-2">
          <h4 className="text-sm font-bold text-ink border-b border-neutral-200 pb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary-600" />
            3. Alamat Domisili & Tempat Menginap
          </h4>

          <Textarea
            label="Alamat Sesuai KTP"
            required
            placeholder="Alamat lengkap sesuai identitas KTP Anda"
            value={addressKtp}
            onChange={(e) => setAddressKtp(e.target.value)}
            error={touched ? errors.addressKtp : ''}
            maxLength={250}
          />

          <Textarea
            label="Alamat Tempat Menginap / Hotel (di Bali / Jogja)"
            required
            placeholder="Nama hotel / villa / kost beserta alamat selama masa sewa"
            value={stayAddress}
            onChange={(e) => setStayAddress(e.target.value)}
            error={touched ? errors.stayAddress : ''}
            maxLength={250}
          />
        </div>

        {/* Bagian 4: Persetujuan Regulasi */}
        <div className="space-y-3 pt-2 bg-neutral-50 p-4 rounded-xl border border-neutral-200 text-xs">
          <h4 className="font-bold text-neutral-800">4. Persetujuan Layanan & Keselamatan</h4>

          <Checkbox
            label="Saya menyatakan telah membaca dan menyetujui Syarat & Ketentuan Sewa RodaKita."
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
          />

          <Checkbox
            label="Saya menyetujui pemantauan GPS pada unit motor rental demi keselamatan dan keamanan operasional selama masa sewa."
            checked={gpsConsent}
            onChange={(e) => setGpsConsent(e.target.checked)}
          />
        </div>

        <Button type="submit" loading={busy} className="w-full sm:w-auto">
          Simpan Data Penyewa Resmi
        </Button>
      </form>
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const [tab, setTab] = useState(() => (window.location.hash === '#renter-data' ? 'penyewa' : 'penyewa'));

  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === '#renter-data') {
        setTab('penyewa');
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  if (!user) return null; // dijaga RequireAuth

  return (
    <PageContainer narrow>
      <Seo title="Profil" description="Kelola data diri, data penyewa resmi, dokumen, keamanan, dan preferensi akun Anda." />
      <Breadcrumb items={[{ label: 'Beranda', to: '/' }, { label: 'Profil' }]} />
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">Profil saya</h1>
      <div className="card mt-6 p-5 sm:p-6">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'penyewa', label: 'Data Penyewa (Resmi)', content: <RenterDataTab user={user} /> },
            { id: 'dokumen', label: 'Dokumen', content: <DocumentsTab user={user} /> },
            { id: 'data', label: 'Akun Dasar', content: <PersonalTab user={user} /> },
            { id: 'keamanan', label: 'Keamanan', content: <SecurityTab user={user} /> },
            { id: 'preferensi', label: 'Preferensi', content: <PreferencesTab user={user} /> },
          ]}
        />
      </div>
    </PageContainer>
  );
}
