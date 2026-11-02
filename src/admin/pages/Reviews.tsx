import React, { useEffect, useState, useCallback } from 'react';
import { Star, Eye, EyeOff, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';
import type { AdminReview } from '../types';
import { DataTable, type Column } from '../components/DataTable';
import { FilterBar } from '../components/FilterBar';
import { formatDate } from '../../utils/formatDate';
import { usePermission } from '../hooks/usePermission';

export const Reviews: React.FC = () => {
  const { can } = usePermission();

  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [ratingFilter, setRatingFilter] = useState('all');

  // Moderate Modal for optional reason
  const [hideModalOpen, setHideModalOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<AdminReview | null>(null);
  const [hideReason, setHideReason] = useState('');
  const [moderateLoading, setModerateLoading] = useState(false);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getReviews({
        status: statusFilter,
        rating: ratingFilter !== 'all' ? Number(ratingFilter) : undefined,
        search,
        page,
        limit,
      });
      setReviews(res.data);
      if (res.meta) {
        setTotal(res.meta.total ?? 0);
        setTotalPages(res.meta.totalPages ?? 1);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat ulasan pelanggan.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, ratingFilter, search, page, limit]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleToggleStatus = (item: AdminReview) => {
    if (item.status === 'published') {
      // Prompt for optional reason
      setSelectedReview(item);
      setHideReason('');
      setHideModalOpen(true);
    } else {
      // Publish immediately
      processModerate(item, 'published', '');
    }
  };

  const processModerate = async (
    item: AdminReview,
    status: 'published' | 'hidden',
    reason?: string,
  ) => {
    setModerateLoading(true);
    try {
      await adminApi.moderateReview(item.id, status as any);
      toast.success(
        `Ulasan berhasil ${
          status === 'published'
            ? 'diterbitkan kembali'
            : `disembunyikan dari publik${reason ? ` (${reason})` : ''}`
        }.`,
      );
      setHideModalOpen(false);
      setSelectedReview(null);
      fetchReviews();
    } catch (err: any) {
      toast.error(err.message || 'Gagal memoderasi ulasan.');
    } finally {
      setModerateLoading(false);
    }
  };

  const columns: Column<AdminReview>[] = [
    {
      key: 'userName',
      header: 'Pelanggan',
      render: (item) => (
        <div>
          <p className="font-bold text-gray-900">{item.userName}</p>
          <p className="text-[11px] text-gray-500 font-medium">Unit: {item.motorcycleName || item.motorName || '-'}</p>
        </div>
      ),
    },
    {
      key: 'rating',
      header: 'Rating',
      align: 'center',
      render: (item) => (
        <div className="inline-flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`w-3.5 h-3.5 ${
                i < item.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'
              }`}
            />
          ))}
          <span className="text-[11px] font-bold text-gray-700 ml-1">({item.rating})</span>
        </div>
      ),
    },
    {
      key: 'comment',
      header: 'Isi Ulasan',
      render: (item) => (
        <p className="text-xs text-gray-700 italic max-w-md line-clamp-2">"{item.comment}"</p>
      ),
    },
    {
      key: 'status',
      header: 'Status Tampil',
      align: 'center',
      render: (item) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
            item.status === 'published'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-gray-100 text-gray-600 border border-gray-200'
          }`}
        >
          {item.status === 'published' ? 'Diterbitkan' : 'Disembunyikan'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Tanggal',
      render: (item) => (
        <span className="text-gray-500 text-xs">{formatDate(item.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi Moderasi',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {can('reviews:moderate') && (
            <button
              type="button"
              onClick={() => handleToggleStatus(item)}
              title={item.status === 'published' ? 'Sembunyikan Ulasan' : 'Terbitkan Ulasan'}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                item.status === 'published'
                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-700'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
              }`}
            >
              {item.status === 'published' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Ulasan Pelanggan</h1>
        <p className="text-xs text-gray-500 mt-1">
          Moderasi testimoni pelanggan. Ulasan yang disembunyikan secara otomatis dikeluarkan dari perhitungan rating motor.
        </p>
      </div>

      <FilterBar
        search={search}
        onSearchChange={(s) => {
          setSearch(s);
          setPage(1);
        }}
        searchPlaceholder="Cari nama pengulas atau komentar..."
        selects={[
          {
            key: 'rating',
            value: ratingFilter,
            options: [
              { label: 'Semua Bintang', value: 'all' },
              { label: '★ 5 Bintang', value: '5' },
              { label: '★ 4 Bintang', value: '4' },
              { label: '★ 3 Bintang', value: '3' },
              { label: '★ 2 Bintang', value: '2' },
              { label: '★ 1 Bintang', value: '1' },
            ],
            onChange: (r) => {
              setRatingFilter(r);
              setPage(1);
            },
          },
          {
            key: 'status',
            value: statusFilter,
            options: [
              { label: 'Semua Status Tampil', value: 'all' },
              { label: 'Diterbitkan (Tampil)', value: 'published' },
              { label: 'Disembunyikan (Hidden)', value: 'hidden' },
            ],
            onChange: (s) => {
              setStatusFilter(s);
              setPage(1);
            },
          },
        ]}
        hasActiveFilters={search !== '' || statusFilter !== 'all' || ratingFilter !== 'all'}
        onReset={() => {
          setSearch('');
          setStatusFilter('all');
          setRatingFilter('all');
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={reviews}
        loading={loading}
        error={error}
        onRetry={fetchReviews}
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => {
          setLimit(l);
          setPage(1);
        }}
        emptyText="Belum ada ulasan"
        emptySubtext="Tidak ada testimoni pelanggan yang cocok dengan kriteria filter."
      />

      {/* Hide Review Modal */}
      {hideModalOpen && selectedReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">Sembunyikan Ulasan</h3>
              <button
                type="button"
                onClick={() => setHideModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-gray-600">
                Ulasan dari <strong>{selectedReview.userName}</strong> akan disembunyikan dari halaman publik dan tidak akan dihitung dalam akumulasi rating motor.
              </p>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Alasan Penyembunyian (Opsional):
                </label>
                <input
                  type="text"
                  value={hideReason}
                  onChange={(e) => setHideReason(e.target.value)}
                  placeholder="Contoh: Mengandung kata tidak pantas / spam"
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setHideModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={moderateLoading}
                  onClick={() => processModerate(selectedReview, 'hidden', hideReason)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {moderateLoading ? 'Menyimpan...' : 'Sembunyikan Ulasan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default Reviews;
