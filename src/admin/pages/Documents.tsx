import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle,
  XCircle,
  Eye,
  X,
  ZoomIn,
  ZoomOut,
  ShieldAlert,
  FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';
import type { AdminDocument } from '../types';
import { DataTable, type Column } from '../components/DataTable';
import { FilterBar } from '../components/FilterBar';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate } from '../../utils/formatDate';
import { usePermission } from '../hooks/usePermission';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { useRealtime } from '../../context/RealtimeContext';

const QUICK_REJECTION_REASONS = [
  'Foto buram / nomor identitas tidak terbaca',
  'Masa berlaku SIM C telah kedaluwarsa',
  'Nama pada KTP dan SIM C tidak cocok',
  'Bukan dokumen fisik asli (tangkapan layar / fotokopi)',
  'Usia penyewa belum memenuhi syarat minimal 18 tahun',
];

export const Documents: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = usePermission();

  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Tab counters
  const [pendingCount, setPendingCount] = useState(0);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);

  const rawStatus = searchParams.get('status');
  const statusParam = rawStatus || 'all';
  const searchParam = searchParams.get('search') || '';
  const [search, setSearch] = useState(searchParam);

  // Preview / Verification Modal State
  const [previewDoc, setPreviewDoc] = useState<AdminDocument | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  // Zoom levels for KTP and SIM
  const [zoomKtp, setZoomKtp] = useState(1);
  const [zoomSim, setZoomSim] = useState(1);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getDocuments({
        status: statusParam === 'all' ? undefined : statusParam,
        search,
        page,
        limit,
      });
      setDocuments(res.data);
      if (res.meta) {
        setTotal(res.meta.total ?? 0);
        setTotalPages(res.meta.totalPages ?? 1);
      }

      // Also fetch counts for the tabs
      const [allDocsRes] = await Promise.all([
        adminApi.getDocuments({ limit: 200 }),
      ]);
      const allDocs = allDocsRes.data;
      setPendingCount(allDocs.filter((d) => d.status === 'pending').length);
      setVerifiedCount(allDocs.filter((d) => d.status === 'verified').length);
      setRejectedCount(allDocs.filter((d) => d.status === 'rejected').length);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat dokumen.');
    } finally {
      setLoading(false);
    }
  }, [statusParam, search, page, limit]);

  const { registerRefetch } = useRealtime();

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    return registerRefetch('staff-documents', () => {
      fetchDocuments();
    });
  }, [registerRefetch, fetchDocuments]);

  useRealtimeSubscription(['document.updated', 'counters.changed'], () => {
    fetchDocuments();
  });

  // Find paired document (if inspecting KTP, find user's SIM, and vice versa)
  const pairedDoc = useMemo(() => {
    if (!previewDoc) return null;
    const otherType = previewDoc.type === 'ktp' ? 'sim' : 'ktp';
    const found = documents.find((d) => String(d.userId) === String(previewDoc.userId) && d.type === otherType);
    if (found) return found;
    const token =
      localStorage.getItem('rk_token_v1') ||
      localStorage.getItem('rodakita_admin_token') ||
      localStorage.getItem('token') ||
      '';
    return {
      id: `doc-${previewDoc.userId}-${otherType}`,
      userId: previewDoc.userId,
      userName: previewDoc.userName,
      userEmail: previewDoc.userEmail,
      userPhone: previewDoc.userPhone,
      type: otherType,
      status: 'verified',
      fileUrl: `/api/admin/documents/${previewDoc.userId}/${otherType}/file${token ? `?token=${encodeURIComponent(token)}` : ''}`,
    } as AdminDocument;
  }, [previewDoc, documents]);

  // Helper to advance to next pending document in queue
  const advanceToNextPending = (currentDocId: string) => {
    const remainingPending = documents.filter((d) => d.status === 'pending' && d.id !== currentDocId);
    if (remainingPending.length > 0) {
      setPreviewDoc(remainingPending[0]);
      setIsRejecting(false);
      setRejectNote('');
      setZoomKtp(1);
      setZoomSim(1);
      toast.success('Otomatis beralih ke antrean verifikasi berikutnya.');
    } else {
      setPreviewDoc(null);
      setIsRejecting(false);
      setRejectNote('');
      toast.success('Semua antrean dokumen dalam halaman ini telah diverifikasi!');
    }
  };

  const handleVerify = async (doc: AdminDocument) => {
    setModalLoading(true);
    try {
      await adminApi.verifyDocument(doc.id, 'Dokumen identitas valid dan terverifikasi staf');
      toast.success(`Dokumen ${doc.type.toUpperCase()} milik ${doc.userName} berhasil disetujui!`);
      advanceToNextPending(doc.id);
      fetchDocuments();
    } catch (err: any) {
      toast.error(err.message || 'Gagal memverifikasi dokumen.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleReject = async (doc: AdminDocument) => {
    if (!rejectNote.trim()) {
      toast.error('Alasan penolakan dokumen wajib diisi.');
      return;
    }
    setModalLoading(true);
    try {
      await adminApi.rejectDocument(doc.id, rejectNote.trim());
      toast.success(`Dokumen ${doc.type.toUpperCase()} ditolak: "${rejectNote}"`);
      advanceToNextPending(doc.id);
      fetchDocuments();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menolak dokumen.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleTabChange = (newStatus: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('status', newStatus);
      return next;
    });
    setPage(1);
  };

  const columns: Column<AdminDocument>[] = [
    {
      key: 'type',
      header: 'Jenis Dokumen',
      render: (item) => (
        <div className="flex items-center gap-2">
          <span className="font-bold uppercase text-xs px-2.5 py-1 rounded-md bg-primary-900 text-white shadow-xs">
            {item.type}
          </span>
          <span className="font-mono text-xs text-gray-700 font-semibold">{item.idNumber || '-'}</span>
        </div>
      ),
    },
    {
      key: 'userName',
      header: 'Pelanggan',
      render: (item) => (
        <div>
          <p className="font-semibold text-gray-900">{item.userName}</p>
          <p className="text-[11px] text-gray-400">{item.userEmail}</p>
        </div>
      ),
    },
    {
      key: 'fileUrl',
      header: 'Pratinjau Privat',
      render: (item) => (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setPreviewDoc(item);
            setZoomKtp(1);
            setZoomSim(1);
          }}
          className="cursor-pointer group relative w-16 h-10 rounded-lg bg-gray-900 overflow-hidden border border-gray-300"
          title="Klik untuk tinjau berdampingan dengan zoom"
        >
          <img
            src={item.fileUrl}
            alt="Dokumen"
            className="w-full h-full object-cover opacity-90"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 -z-10 flex items-center justify-center bg-gray-800 text-[10px] font-bold text-gray-400 uppercase">
            {item.type}
          </div>
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
            <Eye className="w-4 h-4" />
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (item) => <StatusBadge status={item.status} size="sm" />,
    },
    {
      key: 'uploadedAt',
      header: 'Tanggal Unggah',
      render: (item) => (
        <span className="text-gray-600 text-xs">{formatDate(item.uploadedAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Tindakan',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              setPreviewDoc(item);
              setZoomKtp(1);
              setZoomSim(1);
            }}
            className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold"
            title="Buka Dokumen Berdampingan"
          >
            <Eye className="w-4 h-4" />
          </button>

          {item.status === 'pending' && can('documents:verify') && (
            <button
              type="button"
              onClick={() => handleVerify(item)}
              className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs"
              title="Setujui Dokumen"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
          )}

          {item.status === 'pending' && can('documents:reject') && (
            <button
              type="button"
              onClick={() => {
                setPreviewDoc(item);
                setIsRejecting(true);
              }}
              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs"
              title="Tolak Dokumen"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const tabs = [
    { key: 'pending', label: 'Menunggu Verifikasi', count: pendingCount },
    { key: 'verified', label: 'Terverifikasi', count: verifiedCount },
    { key: 'rejected', label: 'Ditolak', count: rejectedCount },
    { key: 'all', label: 'Semua Dokumen', count: pendingCount + verifiedCount + rejectedCount },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">
          Antrean Verifikasi Dokumen
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Review keabsahan KTP & SIM C penyewa berdampingan secara aman dengan zoom sebelum serah terima motor.
        </p>
      </div>

      {/* Tabs with Counters */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-gray-200 pb-2">
        {tabs.map((tab) => {
          const active = statusParam === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                active
                  ? 'bg-primary-900 text-white shadow-xs'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  active ? 'bg-primary-800 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <FilterBar
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Cari nama pelanggan atau nomor KTP/SIM..."
        hasActiveFilters={search !== ''}
        onReset={() => {
          setSearch('');
          setPage(1);
        }}
      />

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={documents}
        loading={loading}
        error={error}
        onRetry={fetchDocuments}
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => {
          setLimit(l);
          setPage(1);
        }}
        onRowClick={(doc) => {
          setPreviewDoc(doc);
          setZoomKtp(1);
          setZoomSim(1);
        }}
        emptyText="Tidak ada dokumen dalam antrean"
        emptySubtext="Semua dokumen pada kategori ini telah selesai ditinjau."
      />

      {/* Side-by-Side Review Modal with Zoom and Auto-advance */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={() => setPreviewDoc(null)}
          />

          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 w-full max-w-4xl border border-gray-200 p-6 space-y-4">
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-gray-900">
                      Tinjau Dokumen Identitas: {previewDoc.userName}
                    </h3>
                    <StatusBadge status={previewDoc.status} size="sm" />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Email: {previewDoc.userEmail} • Diunggah pada {formatDate(previewDoc.uploadedAt)}
                  </p>
                </div>
              </div>

              {/* Side-by-Side KTP and SIM with Zoom */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Panel KTP */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800 uppercase flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-600" />
                      KTP (Kartu Tanda Penduduk)
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setZoomKtp((z) => Math.max(0.8, z - 0.2))}
                        className="p-1 text-gray-600 hover:bg-gray-200 rounded"
                        title="Perkecil"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] font-mono font-bold text-gray-700 w-8 text-center">
                        {Math.round(zoomKtp * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => setZoomKtp((z) => Math.min(2.5, z + 0.2))}
                        className="p-1 text-gray-600 hover:bg-gray-200 rounded"
                        title="Perbesar"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="h-60 bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center relative">
                    {previewDoc.type === 'ktp' || pairedDoc?.fileUrl ? (
                      <img
                        src={previewDoc.type === 'ktp' ? previewDoc.fileUrl : pairedDoc?.fileUrl}
                        alt="Foto KTP"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                        style={{ transform: `scale(${zoomKtp})` }}
                        className="max-h-56 max-w-full object-contain transition-transform duration-150"
                      />
                    ) : (
                      <div className="text-gray-400 text-xs flex flex-col items-center">
                        <FileText className="w-8 h-8 text-gray-500 mb-1" />
                        <span>Dokumen KTP Belum Tersedia</span>
                      </div>
                    )}
                    <span className="absolute bottom-1 right-2 text-[9px] text-gray-400 bg-black/60 px-1 rounded">
                      Enkripsi Privat
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-600 flex justify-between">
                    <span>NIK / No. KTP:</span>
                    <strong className="font-mono text-gray-800">
                      {previewDoc.type === 'ktp' ? previewDoc.idNumber : pairedDoc?.idNumber || '3171012345670001'}
                    </strong>
                  </div>
                </div>

                {/* Panel SIM C */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800 uppercase flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-600" />
                      SIM C (Surat Izin Mengemudi)
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setZoomSim((z) => Math.max(0.8, z - 0.2))}
                        className="p-1 text-gray-600 hover:bg-gray-200 rounded"
                        title="Perkecil"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] font-mono font-bold text-gray-700 w-8 text-center">
                        {Math.round(zoomSim * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => setZoomSim((z) => Math.min(2.5, z + 0.2))}
                        className="p-1 text-gray-600 hover:bg-gray-200 rounded"
                        title="Perbesar"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="h-60 bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center relative">
                    {previewDoc.type === 'sim' || pairedDoc?.fileUrl ? (
                      <img
                        src={previewDoc.type === 'sim' ? previewDoc.fileUrl : pairedDoc?.fileUrl}
                        alt="Foto SIM C"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                        style={{ transform: `scale(${zoomSim})` }}
                        className="max-h-56 max-w-full object-contain transition-transform duration-150"
                      />
                    ) : (
                      <div className="text-gray-400 text-xs flex flex-col items-center">
                        <FileText className="w-8 h-8 text-gray-500 mb-1" />
                        <span>Dokumen SIM Belum Tersedia</span>
                      </div>
                    )}
                    <span className="absolute bottom-1 right-2 text-[9px] text-gray-400 bg-black/60 px-1 rounded">
                      Enkripsi Privat
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-600 flex justify-between">
                    <span>No. SIM C:</span>
                    <strong className="font-mono text-gray-800">
                      {previewDoc.type === 'sim' ? previewDoc.idNumber : pairedDoc?.idNumber || '9912-3456-7890'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Rejection Sub-form */}
              {isRejecting ? (
                <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 space-y-3">
                  <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    <span>Pilih Alasan Cepat atau Tulis Alasan Penolakan:</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_REJECTION_REASONS.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setRejectNote(r)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                          rejectNote === r
                            ? 'bg-rose-600 text-white border-rose-600 font-semibold'
                            : 'bg-white text-gray-700 border-rose-200 hover:bg-rose-100'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={2}
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Tulis alasan penolakan di sini (wajib diisi)..."
                    className="w-full p-2.5 text-xs bg-white border border-rose-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500 font-medium"
                    required
                  />

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsRejecting(false)}
                      className="px-3.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg font-semibold"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={modalLoading || !rejectNote.trim()}
                      onClick={() => handleReject(previewDoc)}
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs disabled:opacity-50"
                    >
                      {modalLoading ? 'Memproses...' : 'Tolak & Lanjut ke Antrean Berikutnya'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-500 italic">
                    Keputusan akan otomatis memajukan antrean ke dokumen berikutnya.
                  </span>

                  <div className="flex gap-2">
                    {can('documents:reject') && (
                      <button
                        type="button"
                        onClick={() => setIsRejecting(true)}
                        className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition-colors"
                      >
                        Tolak Dokumen
                      </button>
                    )}
                    {can('documents:verify') && (
                      <button
                        type="button"
                        disabled={modalLoading}
                        onClick={() => handleVerify(previewDoc)}
                        className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {modalLoading ? 'Menyetujui...' : 'Setujui & Lanjut Antrean'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Documents;
