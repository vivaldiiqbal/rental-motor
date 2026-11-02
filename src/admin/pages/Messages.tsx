import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Send, CheckCircle2, Eye, X, Mail, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';
import type { ContactMessage } from '../types';
import { DataTable, type Column } from '../components/DataTable';
import { FilterBar } from '../components/FilterBar';
import { formatDate } from '../../utils/formatDate';

export const Messages: React.FC = () => {

  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');

  // Reply Modal
  const [activeMessage, setActiveMessage] = useState<ContactMessage | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getMessages({ search, page, limit });
      setMessages(res.data);
      if (res.meta) {
        setTotal(res.meta.total ?? 0);
        setTotalPages(res.meta.totalPages ?? 1);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat pesan masuk.');
    } finally {
      setLoading(false);
    }
  }, [search, page, limit]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleOpenMessage = async (msg: ContactMessage) => {
    setActiveMessage(msg);
    setReplyText(msg.replyNote || '');

    if (!msg.isRead) {
      try {
        await adminApi.markMessageRead(msg.id);
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, isRead: true } : m)),
        );
      } catch {
        // silent
      }
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMessage || !replyText.trim()) return;

    setSending(true);
    try {
      const updated = await adminApi.replyMessage(activeMessage.id, replyText.trim());
      toast.success(`Balasan untuk ${activeMessage.name} berhasil disimpan.`);
      setActiveMessage(updated);
      setMessages((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m)),
      );
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan balasan.');
    } finally {
      setSending(false);
    }
  };

  const columns: Column<ContactMessage>[] = [
    {
      key: 'name',
      header: 'Pengirim',
      sortable: true,
      render: (item) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900">{item.name}</span>
            {!item.isRead && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </div>
          <p className="text-[11px] text-gray-400">{item.email}</p>
        </div>
      ),
    },
    {
      key: 'subject',
      header: 'Subjek & Pesan',
      render: (item) => (
        <div className="max-w-md">
          <p className="font-semibold text-gray-800 truncate">{item.subject}</p>
          <p className="text-xs text-gray-500 truncate mt-0.5">{item.message}</p>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Waktu Masuk',
      render: (item) => (
        <span className="text-gray-600 text-xs">{formatDate(item.createdAt)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (item) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
            item.repliedAt
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : item.isRead
              ? 'bg-gray-100 text-gray-600 border border-gray-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          {item.repliedAt ? 'Dibalas' : item.isRead ? 'Dibaca' : 'Baru'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => handleOpenMessage(item)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold"
          >
            <Eye className="w-3.5 h-3.5" />
            Buka Pesan
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Pesan Masuk & Bantuan</h1>
        <p className="text-xs text-gray-500 mt-1">
          Kotak pesan pertanyaan dan formulir kontak bantuan dari pengunjung serta pelanggan RodaKita.
        </p>
      </div>

      <FilterBar
        search={search}
        onSearchChange={(s) => {
          setSearch(s);
          setPage(1);
        }}
        searchPlaceholder="Cari pengirim, email, atau isi pesan..."
        hasActiveFilters={search !== ''}
        onReset={() => {
          setSearch('');
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={messages}
        loading={loading}
        error={error}
        onRetry={fetchMessages}
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => {
          setLimit(l);
          setPage(1);
        }}
        onRowClick={(msg) => handleOpenMessage(msg)}
        emptyText="Belum ada pesan masuk"
        emptySubtext="Semua pertanyaan pelanggan telah ditanggapi."
      />

      {/* Message View & Reply Modal */}
      {activeMessage && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setActiveMessage(null)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-xl border border-gray-100 space-y-4">
              <button
                type="button"
                onClick={() => setActiveMessage(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary-900" />
                <h3 className="text-base font-bold text-gray-900">{activeMessage.subject}</h3>
              </div>

              {/* Sender Details */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs">
                <div>
                  <span className="text-[10px] text-gray-400 block font-medium">Dari</span>
                  <span className="font-semibold text-gray-900">{activeMessage.name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block font-medium">Email</span>
                  <span className="text-gray-800">{activeMessage.email}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block font-medium">Waktu Kirim</span>
                  <span className="text-gray-700">{formatDate(activeMessage.createdAt)}</span>
                </div>
              </div>

              {/* Message Content */}
              <div className="p-4 rounded-xl bg-white border border-gray-200 text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">
                {activeMessage.message}
              </div>

              {/* Reply Section */}
              <form onSubmit={handleSendReply} className="space-y-3 pt-2 border-t border-gray-100">
                <label className="text-xs font-bold text-gray-900 block">
                  Balasan / Catatan Tindak Lanjut:
                </label>
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Ketik tanggapan atau catatan tindak lanjut operasional..."
                  className="w-full text-xs p-3 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-900"
                />

                {/* External Reply Shortcuts: Email & WhatsApp */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={`mailto:${activeMessage.email}?subject=Re: ${encodeURIComponent(activeMessage.subject)}&body=${encodeURIComponent(replyText || 'Halo ' + activeMessage.name + ',')}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-semibold border border-blue-200 transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Balas via Email (mailto)
                  </a>
                  {activeMessage.phone && (
                    <a
                      href={`https://wa.me/${activeMessage.phone.replace(/[^0-9]/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(
                        replyText || `Halo ${activeMessage.name}, terima kasih telah menghubungi RodaKita. Terkait pesan Anda "${activeMessage.subject}": `,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-semibold border border-emerald-200 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Balas via WhatsApp
                    </a>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  {activeMessage.repliedAt && (
                    <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Telah dibalas pada {formatDate(activeMessage.repliedAt)}
                    </span>
                  )}
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setActiveMessage(null)}
                      className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-xl"
                    >
                      Tutup
                    </button>
                    <button
                      type="submit"
                      disabled={sending || !replyText.trim()}
                      className="inline-flex items-center gap-1.5 px-5 py-2 bg-primary-900 hover:bg-primary-800 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {sending ? 'Menyimpan...' : 'Simpan Balasan'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Messages;
