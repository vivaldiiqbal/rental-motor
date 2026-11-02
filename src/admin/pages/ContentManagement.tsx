import React, { useEffect, useState } from 'react';
import {
  FileText,
  HelpCircle,
  Layout,
  History,
  Eye,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Save,
  Globe2,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import type {
  AdminPageItem,
  AdminPageDetail,
  AdminPageVersion,
  AdminFaqItem,
} from '../types';
import { SafeHtml } from '../../components/common/SafeHtml';
import { Button } from '../../components/ui/Button';
import toast from 'react-hot-toast';

export const ContentManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pages' | 'faqs' | 'blocks'>('pages');

  // ---------- TAB 1: PAGES ----------
  const [pages, setPages] = useState<AdminPageItem[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('terms');
  const [currentPage, setCurrentPage] = useState<AdminPageDetail | null>(null);
  const [pageTitle, setPageTitle] = useState('');
  const [pageBody, setPageBody] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<AdminPageVersion[]>([]);
  const [savingPage, setSavingPage] = useState(false);

  // ---------- TAB 2: FAQS ----------
  const [faqs, setFaqs] = useState<AdminFaqItem[]>([]);
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<AdminFaqItem | null>(null);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [faqActive, setFaqActive] = useState(true);
  const [savingFaq, setSavingFaq] = useState(false);

  // ---------- TAB 3: BLOCKS ----------
  const [heroTitle, setHeroTitle] = useState('');
  const [heroSubtitle, setHeroSubtitle] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [announcementActive, setAnnouncementActive] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementLinkUrl, setAnnouncementLinkUrl] = useState('');
  const [announcementLinkLabel, setAnnouncementLinkLabel] = useState('');
  const [announcementStartsAt, setAnnouncementStartsAt] = useState('');
  const [announcementEndsAt, setAnnouncementEndsAt] = useState('');
  const [savingBlocks, setSavingBlocks] = useState(false);

  // 1. Fetch Pages List
  const fetchPages = async () => {
    try {
      const res = await adminApi.getPages();
      setPages(res.data || []);
    } catch {
      toast.error('Gagal memuat daftar halaman.');
    }
  };

  // 2. Fetch Selected Page Detail
  const fetchPageDetail = async (slug: string) => {
    try {
      const res = await adminApi.getPage(slug);
      if (res.data) {
        setCurrentPage(res.data);
        setPageTitle(res.data.title);
        setPageBody(res.data.body);
        setChangeNote('');
      }
    } catch {
      toast.error('Gagal memuat detail halaman.');
    }
  };

  // 3. Fetch FAQs
  const fetchFaqs = async () => {
    try {
      const res = await adminApi.getFaqs();
      setFaqs(res.data || []);
    } catch {
      toast.error('Gagal memuat FAQ.');
    }
  };

  // 4. Fetch Content Blocks
  const fetchBlocks = async () => {
    try {
      const res = await adminApi.getBlocks();
      const list = res.data || [];
      const ht = list.find((b) => b.key === 'heroTitle');
      const hs = list.find((b) => b.key === 'heroSubtitle');
      const cta = list.find((b) => b.key === 'ctaText');
      const ann = list.find((b) => b.key === 'announcement');

      if (ht) setHeroTitle(typeof ht.value === 'string' ? ht.value : '');
      if (hs) setHeroSubtitle(typeof hs.value === 'string' ? hs.value : '');
      if (cta) setCtaText(typeof cta.value === 'string' ? cta.value : '');
      if (ann && ann.value && typeof ann.value === 'object') {
        setAnnouncementActive(Boolean(ann.value.isActive));
        setAnnouncementText(ann.value.text || '');
        setAnnouncementLinkUrl(ann.value.linkUrl || '');
        setAnnouncementLinkLabel(ann.value.linkLabel || '');
        setAnnouncementStartsAt(ann.value.startsAt ? ann.value.startsAt.substring(0, 16) : '');
        setAnnouncementEndsAt(ann.value.endsAt ? ann.value.endsAt.substring(0, 16) : '');
      }
    } catch {
      toast.error('Gagal memuat content blocks.');
    }
  };

  useEffect(() => {
    fetchPages();
    fetchFaqs();
    fetchBlocks();
  }, []);

  useEffect(() => {
    if (selectedSlug) {
      fetchPageDetail(selectedSlug);
    }
  }, [selectedSlug]);

  // Handle Save Page
  const handleSavePage = async () => {
    if (!pageTitle.trim()) {
      toast.error('Judul halaman wajib diisi.');
      return;
    }
    setSavingPage(true);
    try {
      const res = await adminApi.updatePage(selectedSlug, {
        title: pageTitle.trim(),
        body: pageBody,
        note: changeNote.trim() || undefined,
      });
      if (res.data) {
        toast.success(`Halaman disimpan sebagai versi ${res.data.version}!`);
        setCurrentPage(res.data);
        setChangeNote('');
        fetchPages();
      }
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan halaman.');
    } finally {
      setSavingPage(false);
    }
  };

  // Toggle Page Publish
  const handleTogglePublish = async () => {
    if (!currentPage) return;
    const nextStatus = !currentPage.isPublished;
    try {
      const res = await adminApi.togglePagePublished(selectedSlug, nextStatus);
      if (res.data) {
        toast.success(nextStatus ? 'Halaman berhasil diterbitkan!' : 'Halaman disembunyikan dari publik.');
        setCurrentPage((prev) => (prev ? { ...prev, isPublished: nextStatus } : prev));
        fetchPages();
      }
    } catch {
      toast.error('Gagal memperbarui status publikasi.');
    }
  };

  // Preview Page
  const handlePreview = async () => {
    try {
      const res = await adminApi.previewMarkdown(pageBody);
      setPreviewHtml(res.data?.html || '');
      setIsPreviewOpen(true);
    } catch {
      toast.error('Gagal membuat pratinjau.');
    }
  };

  // Version History Modal
  const handleOpenHistory = async () => {
    try {
      const res = await adminApi.getPageVersions(selectedSlug);
      setVersions(res.data || []);
      setIsHistoryOpen(true);
    } catch {
      toast.error('Gagal memuat riwayat versi.');
    }
  };

  // Restore Version
  const handleRestoreVersion = async (version: number) => {
    if (!window.confirm(`Pulihkan versi ${version}? Tindakan ini akan membuat versi baru berisi konten dari versi ${version}.`)) {
      return;
    }
    try {
      const res = await adminApi.restorePageVersion(selectedSlug, version);
      if (res.data) {
        toast.success(`Berhasil memulihkan ke versi baru #${res.data.version}!`);
        setIsHistoryOpen(false);
        fetchPageDetail(selectedSlug);
        fetchPages();
      }
    } catch (e: any) {
      toast.error(e.message || 'Gagal memulihkan versi.');
    }
  };

  // FAQ Add/Edit
  const handleOpenFaqModal = (faq?: AdminFaqItem) => {
    if (faq) {
      setEditingFaq(faq);
      setFaqQuestion(faq.question);
      setFaqAnswer(faq.answer);
      setFaqActive(faq.isActive);
    } else {
      setEditingFaq(null);
      setFaqQuestion('');
      setFaqAnswer('');
      setFaqActive(true);
    }
    setFaqModalOpen(true);
  };

  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faqQuestion.trim() || !faqAnswer.trim()) {
      toast.error('Pertanyaan dan jawaban wajib diisi.');
      return;
    }
    setSavingFaq(true);
    try {
      if (editingFaq) {
        await adminApi.updateFaq(editingFaq.id, {
          question: faqQuestion.trim(),
          answer: faqAnswer.trim(),
          isActive: faqActive,
        });
        toast.success('FAQ berhasil diperbarui.');
      } else {
        await adminApi.createFaq({
          question: faqQuestion.trim(),
          answer: faqAnswer.trim(),
          isActive: faqActive,
        });
        toast.success('FAQ baru ditambahkan.');
      }
      setFaqModalOpen(false);
      fetchFaqs();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan FAQ.');
    } finally {
      setSavingFaq(false);
    }
  };

  const handleDeleteFaq = async (id: number) => {
    if (!window.confirm('Yakin ingin menghapus pertanyaan FAQ ini?')) return;
    try {
      await adminApi.deleteFaq(id);
      toast.success('FAQ berhasil dihapus.');
      fetchFaqs();
    } catch {
      toast.error('Gagal menghapus FAQ.');
    }
  };

  const handleMoveFaq = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= faqs.length) return;

    const newFaqs = [...faqs];
    const [moved] = newFaqs.splice(index, 1);
    newFaqs.splice(targetIndex, 0, moved);
    setFaqs(newFaqs);

    try {
      await adminApi.reorderFaqs(newFaqs.map((f) => f.id));
      toast.success('Urutan FAQ diperbarui.');
    } catch {
      toast.error('Gagal menyimpan urutan FAQ.');
      fetchFaqs();
    }
  };

  // Save Content Blocks
  const handleSaveBlocks = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBlocks(true);
    try {
      if (heroTitle.trim()) await adminApi.updateBlock('heroTitle', heroTitle.trim());
      if (heroSubtitle.trim()) await adminApi.updateBlock('heroSubtitle', heroSubtitle.trim());
      if (ctaText.trim()) await adminApi.updateBlock('ctaText', ctaText.trim());

      const announcementVal = {
        isActive: announcementActive,
        text: announcementText.trim(),
        linkUrl: announcementLinkUrl.trim(),
        linkLabel: announcementLinkLabel.trim(),
        startsAt: announcementStartsAt ? new Date(announcementStartsAt).toISOString() : null,
        endsAt: announcementEndsAt ? new Date(announcementEndsAt).toISOString() : null,
      };
      await adminApi.updateBlock('announcement', announcementVal);

      toast.success('Seluruh komponen konten dan pengumuman berhasil disimpan!');
      fetchBlocks();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan konten.');
    } finally {
      setSavingBlocks(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Layout className="w-6 h-6 text-primary-600" />
            Manajemen Konten & Halaman
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Kelola isi halaman legal, riwayat versi dokumen, tanya-jawab (FAQ), dan banner pengumuman dinamis.
          </p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-gray-200 bg-white rounded-t-xl px-4 pt-2 gap-2 shadow-xs">
        <button
          onClick={() => setActiveTab('pages')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'pages'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <FileText className="w-4 h-4" />
          Halaman & Dokumen Legal
        </button>

        <button
          onClick={() => setActiveTab('faqs')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'faqs'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          Tanya Jawab (FAQ)
          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 font-bold">
            {faqs.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('blocks')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'blocks'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Komponen & Banner Pengumuman
        </button>
      </div>

      {/* TAB 1: PAGES */}
      {activeTab === 'pages' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left: Pages List */}
          <div className="lg:col-span-1 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">
              Daftar Halaman
            </h3>
            <div className="space-y-2">
              {pages.map((p) => {
                const isSelected = p.slug === selectedSlug;
                return (
                  <button
                    key={p.slug}
                    onClick={() => setSelectedSlug(p.slug)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-primary-50/70 border-primary-300 ring-2 ring-primary-500/20 shadow-xs'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-gray-900">{p.title}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          p.isPublished
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {p.isPublished ? 'Terbit' : 'Draf'}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
                      <code>/{p.slug}</code>
                      <span>Versi #{p.version}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-4 bg-primary-50/50 rounded-xl border border-primary-100 text-xs text-primary-800 space-y-2">
              <p className="font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary-600" />
                Placeholder Dinamis
              </p>
              <p className="text-[11px] leading-relaxed text-gray-600">
                Gunakan placeholder berikut di isi teks Markdown. Nilainya akan diganti otomatis dari pengaturan:
              </p>
              <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                {['{{brandName}}', '{{minDays}}', '{{maxDays}}', '{{minRenterAge}}', '{{lateFeePercentPerHour}}', '{{whatsappNumber}}', '{{contactEmail}}'].map((ph) => (
                  <span key={ph} className="bg-white px-1.5 py-0.5 rounded border border-primary-200 text-primary-900">
                    {ph}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Markdown Editor */}
          <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-gray-900">{currentPage?.title}</h2>
                  <span className="text-xs bg-gray-100 text-gray-600 font-bold px-2 py-0.5 rounded-md">
                    Versi Saat Ini: #{currentPage?.version}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Slug URL publik: <code className="text-primary-600 font-semibold">/api/content/pages/{selectedSlug}</code>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleOpenHistory}
                  leftIcon={<History className="w-4 h-4" />}
                >
                  Riwayat Versi
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handlePreview}
                  leftIcon={<Eye className="w-4 h-4" />}
                >
                  Pratinjau HTML
                </Button>

                <Button
                  type="button"
                  variant={currentPage?.isPublished ? 'danger' : 'secondary'}
                  size="sm"
                  onClick={handleTogglePublish}
                >
                  {currentPage?.isPublished ? 'Sembunyikan' : 'Terbitkan'}
                </Button>
              </div>
            </div>

            {/* Inputs */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Judul Halaman
                </label>
                <input
                  type="text"
                  value={pageTitle}
                  onChange={(e) => setPageTitle(e.target.value)}
                  maxLength={200}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  placeholder="Judul halaman..."
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Isi Konten (Markdown Format)
                  </label>
                  <span className="text-[11px] text-gray-400">
                    {pageBody.length} / 50.000 karakter
                  </span>
                </div>
                <textarea
                  rows={16}
                  value={pageBody}
                  onChange={(e) => setPageBody(e.target.value)}
                  maxLength={50000}
                  className="w-full font-mono text-xs leading-relaxed p-4 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-neutral-900 text-neutral-100"
                  placeholder="Tulis dokumen dalam format Markdown..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Catatan Perubahan (Opsional untuk riwayat versi)
                </label>
                <input
                  type="text"
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  maxLength={300}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  placeholder="Contoh: Pembaruan batas usia sewa dan kebijakan denda keterlambatan..."
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <a
                href={`/${selectedSlug}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary-600 hover:text-primary-800 font-semibold flex items-center gap-1"
              >
                Lihat di Website Publik <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <Button
                type="button"
                onClick={handleSavePage}
                disabled={savingPage}
                leftIcon={<Save className="w-4 h-4" />}
              >
                {savingPage ? 'Menyimpan...' : 'Simpan Sebagai Versi Baru'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FAQS */}
      {activeTab === 'faqs' && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Pertanyaan yang Sering Diajukan (FAQ)</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Daftar pertanyaan umum yang ditampilkan di halaman Cara Sewa. Urutkan posisi dengan tombol panah.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => handleOpenFaqModal()}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Tambah FAQ Baru
            </Button>
          </div>

          {faqs.length === 0 ? (
            <div className="p-12 text-center text-gray-400 border border-dashed rounded-xl">
              <HelpCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-medium">Belum ada pertanyaan FAQ.</p>
              <p className="text-xs text-gray-400 mt-1">Klik tombol di atas untuk menambahkan pertanyaan baru.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
              {faqs.map((faq, idx) => (
                <div
                  key={faq.id}
                  className="p-4 flex items-start justify-between gap-4 hover:bg-gray-50/70 transition-colors"
                >
                  <div className="flex items-start gap-3 flex-1">
                    <div className="flex flex-col gap-1 mt-0.5">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveFaq(idx, 'up')}
                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded hover:bg-gray-200"
                        title="Geser ke atas"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === faqs.length - 1}
                        onClick={() => handleMoveFaq(idx, 'down')}
                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded hover:bg-gray-200"
                        title="Geser ke bawah"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-900">{faq.question}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            faq.isActive
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {faq.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2">{faq.answer}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenFaqModal(faq)}
                    >
                      Ubah
                    </Button>
                    <button
                      type="button"
                      onClick={() => handleDeleteFaq(faq.id)}
                      className="p-2 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Hapus FAQ"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: BLOCKS */}
      {activeTab === 'blocks' && (
        <form onSubmit={handleSaveBlocks} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Komponen Teks & Banner Pengumuman</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Atur teks header utama di Beranda serta banner pengumuman darurat atau promosi kilat.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 border-t border-gray-100 pt-5">
            {/* Hero Title */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Judul Hero Beranda (H1)
              </label>
              <input
                type="text"
                value={heroTitle}
                onChange={(e) => setHeroTitle(e.target.value)}
                maxLength={120}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                placeholder="Contoh: Sewa motor mudah, harga jelas"
              />
              <span className="text-[10px] text-gray-400">Maksimal 120 karakter</span>
            </div>

            {/* CTA Button Text */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Teks Tombol Aksi (CTA)
              </label>
              <input
                type="text"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                maxLength={40}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                placeholder="Contoh: Lihat motor"
              />
              <span className="text-[10px] text-gray-400">Maksimal 40 karakter</span>
            </div>

            {/* Hero Subtitle */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Subjudul Hero Beranda
              </label>
              <textarea
                rows={2}
                value={heroSubtitle}
                onChange={(e) => setHeroSubtitle(e.target.value)}
                maxLength={300}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                placeholder="Contoh: Pilih motor, tentukan tanggal, dan berangkat. Tanpa biaya tersembunyi."
              />
              <span className="text-[10px] text-gray-400">Maksimal 300 karakter</span>
            </div>
          </div>

          {/* Announcement Banner Section */}
          <div className="border-t border-gray-100 pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Globe2 className="w-4 h-4 text-amber-500" />
                  Banner Pengumuman (Global Announcement)
                </h3>
                <p className="text-xs text-gray-500">
                  Akan muncul di bagian paling atas situs jika diaktifkan dan masih berada dalam rentang tanggal tayang.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={announcementActive}
                  onChange={(e) => setAnnouncementActive(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                <span className="ml-2 text-xs font-semibold text-gray-700">
                  {announcementActive ? 'Banner Aktif' : 'Banner Nonaktif'}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50/70 p-4 rounded-xl border border-gray-200">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Teks Pengumuman
                </label>
                <input
                  type="text"
                  value={announcementText}
                  onChange={(e) => setAnnouncementText(e.target.value)}
                  maxLength={300}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                  placeholder="Contoh: Diskon 20% untuk sewa akhir pekan panjang dengan kode LIBURAN!"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tautan URL (Opsional)
                </label>
                <input
                  type="text"
                  value={announcementLinkUrl}
                  onChange={(e) => setAnnouncementLinkUrl(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                  placeholder="Contoh: /promos atau https://..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Label Tombol Tautan (Opsional)
                </label>
                <input
                  type="text"
                  value={announcementLinkLabel}
                  onChange={(e) => setAnnouncementLinkLabel(e.target.value)}
                  maxLength={60}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                  placeholder="Contoh: Lihat Promo"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Mulai Tayang (Opsional)
                </label>
                <input
                  type="datetime-local"
                  value={announcementStartsAt}
                  onChange={(e) => setAnnouncementStartsAt(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Selesai Tayang (Opsional)
                </label>
                <input
                  type="datetime-local"
                  value={announcementEndsAt}
                  onChange={(e) => setAnnouncementEndsAt(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <Button
              type="submit"
              disabled={savingBlocks}
              leftIcon={<Save className="w-4 h-4" />}
            >
              {savingBlocks ? 'Menyimpan...' : 'Simpan Semua Perubahan Konten'}
            </Button>
          </div>
        </form>
      )}

      {/* MODAL: PREVIEW HTML */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary-600" />
                Pratinjau HTML Halaman (Tersanitasi)
              </h3>
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <SafeHtml html={previewHtml} />
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setIsPreviewOpen(false)}>
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VERSION HISTORY */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <History className="w-4 h-4 text-primary-600" />
                Riwayat Versi Dokumen: {selectedSlug}
              </h3>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md"
              >
                &times;
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 divide-y divide-gray-100 space-y-3">
              {versions.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-6">Belum ada riwayat versi.</p>
              ) : (
                versions.map((ver) => (
                  <div key={ver.id} className="pt-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-900">Versi #{ver.version}</span>
                        <span className="text-xs text-gray-500 font-medium">{ver.title}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(ver.createdAt).toLocaleString('id-ID')} • {ver.changeNote || 'Tanpa catatan perubahan'}
                      </p>
                    </div>
                    {ver.version !== currentPage?.version && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleRestoreVersion(ver.version)}
                        leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                      >
                        Pulihkan
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setIsHistoryOpen(false)}>
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT FAQ */}
      {faqModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleSaveFaq}
            className="bg-white rounded-2xl max-w-lg w-full flex flex-col shadow-2xl overflow-hidden"
          >
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-sm text-gray-900">
                {editingFaq ? 'Ubah Pertanyaan FAQ' : 'Tambah Pertanyaan FAQ Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setFaqModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md"
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Pertanyaan
                </label>
                <input
                  type="text"
                  required
                  value={faqQuestion}
                  onChange={(e) => setFaqQuestion(e.target.value)}
                  maxLength={300}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  placeholder="Contoh: Apakah deposit dikembalikan?"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Jawaban (Markdown)
                </label>
                <textarea
                  required
                  rows={5}
                  value={faqAnswer}
                  onChange={(e) => setFaqAnswer(e.target.value)}
                  maxLength={5000}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 font-mono"
                  placeholder="Tulis jawaban lengkap dalam format Markdown..."
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={faqActive}
                  onChange={(e) => setFaqActive(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-xs font-semibold text-gray-700">Tampilkan di halaman publik (Aktif)</span>
              </label>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setFaqModalOpen(false)}>
                Batal
              </Button>
              <Button type="submit" size="sm" disabled={savingFaq}>
                {savingFaq ? 'Menyimpan...' : 'Simpan FAQ'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
