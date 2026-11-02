import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  Eye,
  X,
  FileCode2,
} from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { adminApi } from '../services/adminApi';
import type { AuditLogEntry } from '../types';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate } from '../../utils/formatDate';

export const AuditLog: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  // Detail Modal State
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getAuditLogs({
        search,
        page,
        limit,
      });

      let filtered = res.data;
      if (actionFilter !== 'all') {
        filtered = filtered.filter((l) => l.action.includes(actionFilter));
      }
      if (actorFilter !== 'all') {
        filtered = filtered.filter((l) => l.actorName === actorFilter);
      }
      if (dateFilter) {
        filtered = filtered.filter((l) => l.timestamp.startsWith(dateFilter));
      }

      setLogs(filtered);
      if (res.meta) {
        setTotal(res.meta.total ?? 0);
        setTotalPages(res.meta.totalPages ?? 1);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat log audit.');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, actorFilter, dateFilter, search, page, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Unique actors for filter dropdown
  const uniqueActors = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.actorName) set.add(l.actorName);
    });
    return Array.from(set);
  }, [logs]);

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'timestamp',
      header: 'Waktu Aktivitas',
      render: (item) => {
        let formatted = item.timestamp;
        try {
          formatted =
            format(new Date(item.timestamp), 'd MMM yyyy, HH:mm:ss', { locale: id }) + ' WIB';
        } catch {
          // ignore
        }
        return <span className="font-mono text-xs text-gray-600">{formatted}</span>;
      },
    },
    {
      key: 'actorName',
      header: 'Siapa (Aktor)',
      render: (item) => (
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-900">{item.actorName}</span>
          <StatusBadge status={item.actorRole} size="sm" />
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Aksi',
      render: (item) => (
        <span className="font-mono text-xs font-bold text-primary-900 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
          {item.action}
        </span>
      ),
    },
    {
      key: 'module',
      header: 'Objek / Modul',
      render: (item) => (
        <div>
          <span className="font-semibold text-xs text-gray-800">{item.module}</span>
          {item.targetName && (
            <p className="text-[10px] text-gray-500 font-mono">{item.targetName}</p>
          )}
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Rincian Perubahan',
      render: (item) => <p className="text-xs text-gray-700 max-w-md truncate">{item.details}</p>,
    },
    {
      key: 'actions',
      header: 'Detail',
      align: 'right',
      render: (item) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedLog(item);
          }}
          className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs"
          title="Lihat Detail Perubahan Sebelum & Sesudah"
        >
          <Eye className="w-4 h-4" />
        </button>
      ),
    },
  ];

  const hasActiveFilters =
    search !== '' || actionFilter !== 'all' || actorFilter !== 'all' || dateFilter !== '';

  const handleResetFilters = () => {
    setSearch('');
    setActionFilter('all');
    setActorFilter('all');
    setDateFilter('');
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Log Audit Sistem</h1>
        <p className="text-xs text-gray-500 mt-1">
          Rekaman jejak aktivitas operasional internal: siapa yang mengubah data, aksi yang dilakukan, objek terkait, dan rincian perubahannya.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari rincian atau objek..."
              className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-900"
            />
          </div>

          {/* Actor Filter */}
          <div>
            <select
              value={actorFilter}
              onChange={(e) => {
                setActorFilter(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-900"
            >
              <option value="all">Semua Pengguna (Aktor)</option>
              {uniqueActors.map((actor) => (
                <option key={actor} value={actor}>
                  {actor}
                </option>
              ))}
            </select>
          </div>

          {/* Action Filter */}
          <div>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-900"
            >
              <option value="all">Semua Jenis Aksi</option>
              <option value="LOGIN">LOGIN</option>
              <option value="CONFIRM_PAYMENT">CONFIRM_PAYMENT</option>
              <option value="HANDOVER">HANDOVER (Serah Terima)</option>
              <option value="RETURN">RETURN (Pengembalian)</option>
              <option value="VERIFY_DOCUMENT">VERIFY_DOCUMENT</option>
              <option value="REJECT_DOCUMENT">REJECT_DOCUMENT</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>

          {/* Date Filter */}
          <div>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setPage(1);
              }}
              title="Filter Tanggal Log"
              className="w-full text-xs p-2 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-900"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
            >
              Reset Filter
            </button>
          </div>
        )}
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={logs}
        loading={loading}
        error={error}
        onRetry={fetchLogs}
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => {
          setLimit(l);
          setPage(1);
        }}
        onRowClick={(item) => setSelectedLog(item)}
        emptyText="Belum ada riwayat audit"
        emptySubtext="Aktivitas operasional admin dan staf akan otomatis tercatat di sini."
      />

      {/* Detail Panel Modal: Siapa, Aksi, Objek, Waktu, Perubahan Sebelum/Sesudah */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary-900" />
                  Rincian Log Audit
                </h3>
                <p className="text-[11px] text-gray-500">ID Log: {selectedLog.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200">
                <div>
                  <span className="text-[10px] text-gray-400 font-bold block uppercase">Pelaksana (Siapa)</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-bold text-gray-900">{selectedLog.actorName}</span>
                    <StatusBadge status={selectedLog.actorRole} size="sm" />
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-gray-400 font-bold block uppercase">Waktu Aktivitas</span>
                  <span className="font-mono text-gray-800 font-medium mt-0.5 block">
                    {formatDate(selectedLog.timestamp)}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-gray-400 font-bold block uppercase">Jenis Aksi</span>
                  <span className="font-mono font-bold text-primary-900">{selectedLog.action}</span>
                </div>

                <div>
                  <span className="text-[10px] text-gray-400 font-bold block uppercase">Objek / Modul</span>
                  <span className="font-semibold text-gray-800">
                    {selectedLog.module} {selectedLog.targetName ? `(${selectedLog.targetName})` : ''}
                  </span>
                </div>
              </div>

              {/* Detail Perubahan Sebelum / Sesudah */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <FileCode2 className="w-4 h-4 text-primary-900" />
                  Catatan Perubahan (Audit Trail):
                </span>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl font-mono text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {selectedLog.details}
                </div>
              </div>

              {selectedLog.ipAddress && (
                <div className="text-[11px] text-gray-400 font-mono">
                  Alamat IP: {selectedLog.ipAddress}
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="px-4 py-2 bg-primary-900 hover:bg-primary-800 text-white rounded-xl font-semibold"
                >
                  Tutup Panel Detail
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AuditLog;
