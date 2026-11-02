import React, { useEffect, useState, useCallback } from 'react';
import {
  Coins,
  Plus,
  Edit2,
  Trash2,
  X,
  Sliders,
  Calendar,
  Info,
  Percent,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';
import type { AdminPricingRule, AdminDiscountTier } from '../types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormField } from '../components/FormField';
import { formatPrice } from '../../utils/formatPrice';
import { usePermission } from '../hooks/usePermission';

export const PricingManagement: React.FC = () => {
  const { can } = usePermission();

  // Active Tab: 'rules' | 'tiers'
  const [activeTab, setActiveTab] = useState<'rules' | 'tiers'>('rules');

  // Pricing Rules State
  const [rules, setRules] = useState<AdminPricingRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesSearch, setRulesSearch] = useState('');

  // Discount Tiers State
  const [tiers, setTiers] = useState<AdminDiscountTier[]>([]);
  const [tiersLoading, setTiersLoading] = useState(true);

  // Modal State - Pricing Rule
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [ruleType, setRuleType] = useState<'weekend' | 'seasonal' | 'holiday' | 'custom'>('seasonal');
  const [rateType, setRateType] = useState<'multiplier' | 'fixed' | 'percentage'>('fixed');
  const [rateValue, setRateValue] = useState<number>(50000);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [scope, setScope] = useState<'all' | 'motor_type' | 'motorcycle'>('all');
  const [scopeValue, setScopeValue] = useState('');
  const [priority, setPriority] = useState<number>(10);
  const [ruleActive, setRuleActive] = useState(true);
  const [ruleSubmitting, setRuleSubmitting] = useState(false);

  // Modal State - Discount Tier
  const [tierModalOpen, setTierModalOpen] = useState(false);
  const [editingTierId, setEditingTierId] = useState<number | null>(null);
  const [minDays, setMinDays] = useState<number>(3);
  const [discountPercent, setDiscountPercent] = useState<number>(5);
  const [tierDescription, setTierDescription] = useState('');
  const [tierActive, setTierActive] = useState(true);
  const [tierSubmitting, setTierSubmitting] = useState(false);

  // Delete Dialog State
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    type: 'rule' | 'tier';
    id: number | null;
    title: string;
  }>({
    isOpen: false,
    type: 'rule',
    id: null,
    title: '',
  });
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Load Data
  const fetchRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const res = await adminApi.getPricingRules();
      setRules(res.data || []);
    } catch (err: any) {
      toast.error(err.message || 'Gagal memuat aturan harga dinamis.');
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const fetchTiers = useCallback(async () => {
    setTiersLoading(true);
    try {
      const res = await adminApi.getDiscountTiers();
      setTiers(res.data || []);
    } catch (err: any) {
      toast.error(err.message || 'Gagal memuat tier diskon durasi sewa.');
    } finally {
      setTiersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchTiers();
  }, [fetchRules, fetchTiers]);

  // Open Create Rule Modal
  const openCreateRuleModal = () => {
    setEditingRuleId(null);
    setRuleName('');
    setRuleType('seasonal');
    setRateType('fixed');
    setRateValue(50000);
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setScope('all');
    setScopeValue('');
    setPriority(10);
    setRuleActive(true);
    setRuleModalOpen(true);
  };

  // Open Edit Rule Modal
  const openEditRuleModal = (rule: AdminPricingRule) => {
    setEditingRuleId(rule.id);
    setRuleName(rule.name);
    setRuleType(rule.ruleType);
    setRateType(rule.rateType);
    setRateValue(rule.rateValue);
    setStartDate(rule.startDate ? rule.startDate.split('T')[0] : '');
    setEndDate(rule.endDate ? rule.endDate.split('T')[0] : '');
    setScope(rule.scope);
    setScopeValue(rule.scopeValue || '');
    setPriority(rule.priority || 1);
    setRuleActive(rule.isActive);
    setRuleModalOpen(true);
  };

  // Submit Rule Form
  const handleRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) {
      toast.error('Nama aturan wajib diisi.');
      return;
    }
    if (rateValue <= 0) {
      toast.error('Nilai tarif harus lebih besar dari 0.');
      return;
    }

    setRuleSubmitting(true);
    try {
      const payload: Partial<AdminPricingRule> = {
        name: ruleName.trim(),
        ruleType,
        rateType,
        rateValue: Number(rateValue),
        startDate: startDate || null,
        endDate: endDate || null,
        scope,
        scopeValue: scope !== 'all' ? scopeValue.trim() || null : null,
        priority: Number(priority) || 1,
        isActive: ruleActive,
      };

      if (editingRuleId) {
        await adminApi.updatePricingRule(editingRuleId, payload);
        toast.success('Aturan harga berhasil diperbarui.');
      } else {
        await adminApi.createPricingRule(payload);
        toast.success('Aturan harga baru berhasil ditambahkan.');
      }
      setRuleModalOpen(false);
      fetchRules();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan aturan harga.');
    } finally {
      setRuleSubmitting(false);
    }
  };

  // Toggle Rule Status
  const handleToggleRule = async (rule: AdminPricingRule) => {
    try {
      await adminApi.updatePricingRule(rule.id, { isActive: !rule.isActive });
      toast.success(`Aturan harga ${!rule.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`);
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isActive: !r.isActive } : r))
      );
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengubah status aturan.');
    }
  };

  // Open Create Tier Modal
  const openCreateTierModal = () => {
    setEditingTierId(null);
    setMinDays(3);
    setDiscountPercent(5);
    setTierDescription('Diskon sewa 3 hari atau lebih');
    setTierActive(true);
    setTierModalOpen(true);
  };

  // Open Edit Tier Modal
  const openEditTierModal = (tier: AdminDiscountTier) => {
    setEditingTierId(tier.id);
    setMinDays(tier.minDays);
    setDiscountPercent(tier.discountPercent);
    setTierDescription(tier.description || '');
    setTierActive(tier.isActive);
    setTierModalOpen(true);
  };

  // Submit Tier Form
  const handleTierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (minDays < 1) {
      toast.error('Minimal hari sewa harus minimal 1 hari.');
      return;
    }
    if (discountPercent <= 0 || discountPercent > 100) {
      toast.error('Persentase diskon harus di antara 1% hingga 100%.');
      return;
    }

    setTierSubmitting(true);
    try {
      const payload: Partial<AdminDiscountTier> = {
        minDays: Number(minDays),
        discountPercent: Number(discountPercent),
        description: tierDescription.trim() || null,
        isActive: tierActive,
      };

      if (editingTierId) {
        await adminApi.updateDiscountTier(editingTierId, payload);
        toast.success('Tier diskon berhasil diperbarui.');
      } else {
        await adminApi.createDiscountTier(payload);
        toast.success('Tier diskon baru berhasil ditambahkan.');
      }
      setTierModalOpen(false);
      fetchTiers();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan tier diskon.');
    } finally {
      setTierSubmitting(false);
    }
  };

  // Toggle Tier Status
  const handleToggleTier = async (tier: AdminDiscountTier) => {
    try {
      await adminApi.updateDiscountTier(tier.id, { isActive: !tier.isActive });
      toast.success(`Tier diskon ${!tier.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`);
      setTiers((prev) =>
        prev.map((t) => (t.id === tier.id ? { ...t, isActive: !t.isActive } : t))
      );
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengubah status tier.');
    }
  };

  // Delete Action
  const confirmDelete = async () => {
    if (!deleteDialog.id) return;
    setDeleteLoading(true);
    try {
      if (deleteDialog.type === 'rule') {
        await adminApi.deletePricingRule(deleteDialog.id);
        toast.success('Aturan harga berhasil dihapus.');
        fetchRules();
      } else {
        await adminApi.deleteDiscountTier(deleteDialog.id);
        toast.success('Tier diskon berhasil dihapus.');
        fetchTiers();
      }
      setDeleteDialog({ isOpen: false, type: 'rule', id: null, title: '' });
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghapus item.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Filtered Rules
  const filteredRules = rules.filter(
    (r) =>
      r.name.toLowerCase().includes(rulesSearch.toLowerCase()) ||
      r.ruleType.toLowerCase().includes(rulesSearch.toLowerCase()) ||
      r.scope.toLowerCase().includes(rulesSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl shadow-xs border border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center shadow-inner">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Aturan Harga & Diskon Dinamis</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Konfigurasi harga sewa musiman, lonjakan akhir pekan, hari libur, dan tier diskon durasi sewa otomatis.
            </p>
          </div>
        </div>

        {can('pricing:manage') && (
          <div className="flex items-center gap-2">
            {activeTab === 'rules' ? (
              <button
                onClick={openCreateRuleModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Aturan Harga</span>
              </button>
            ) : (
              <button
                onClick={openCreateTierModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Tier Diskon</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs Navigasi */}
      <div className="flex border-b border-gray-200 gap-4">
        <button
          onClick={() => setActiveTab('rules')}
          className={`pb-3 px-2 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'rules'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Aturan Harga ({rules.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('tiers')}
          className={`pb-3 px-2 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'tiers'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Percent className="w-4 h-4" />
          <span>Tier Diskon Durasi ({tiers.length})</span>
        </button>
      </div>

      {/* TAB 1: PRICING RULES */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          {/* Quick Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
              <span className="text-xs text-gray-400 font-medium">Total Aturan</span>
              <p className="text-2xl font-bold text-gray-900 mt-1">{rules.length}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
              <span className="text-xs text-emerald-600 font-medium">Aturan Aktif</span>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {rules.filter((r) => r.isActive).length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
              <span className="text-xs text-blue-600 font-medium">Akhir Pekan (Weekend)</span>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                {rules.filter((r) => r.ruleType === 'weekend').length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
              <span className="text-xs text-amber-600 font-medium">Musiman & Libur</span>
              <p className="text-2xl font-bold text-amber-600 mt-1">
                {rules.filter((r) => r.ruleType === 'seasonal' || r.ruleType === 'holiday').length}
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-100 shadow-xs">
            <div className="relative w-full max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={rulesSearch}
                onChange={(e) => setRulesSearch(e.target.value)}
                placeholder="Cari aturan harga..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Table Pricing Rules */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
            {rulesLoading ? (
              <div className="p-8 text-center text-xs text-gray-400">Memuat aturan harga...</div>
            ) : filteredRules.length === 0 ? (
              <div className="p-12 text-center">
                <Info className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-gray-700">Belum Ada Aturan Harga</p>
                <p className="text-xs text-gray-400 mt-1">
                  Tambahkan aturan harga baru untuk lonjakan akhir pekan atau musim liburan.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-medium">
                      <th className="py-3 px-4">Nama Aturan</th>
                      <th className="py-3 px-4">Tipe Aturan</th>
                      <th className="py-3 px-4">Penyesuaian Tarif</th>
                      <th className="py-3 px-4">Jendela Tanggal</th>
                      <th className="py-3 px-4">Cakupan Unit</th>
                      <th className="py-3 px-4 text-center">Prioritas</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredRules.map((r) => {
                      let typeBadge = 'bg-gray-100 text-gray-700';
                      if (r.ruleType === 'weekend') typeBadge = 'bg-blue-50 text-blue-700 border border-blue-200';
                      if (r.ruleType === 'seasonal') typeBadge = 'bg-amber-50 text-amber-700 border border-amber-200';
                      if (r.ruleType === 'holiday') typeBadge = 'bg-rose-50 text-rose-700 border border-rose-200';
                      if (r.ruleType === 'custom') typeBadge = 'bg-purple-50 text-purple-700 border border-purple-200';

                      let rateDisplay = '';
                      if (r.rateType === 'fixed') rateDisplay = `+${formatPrice(r.rateValue)}/hari`;
                      else if (r.rateType === 'percentage') rateDisplay = `+${r.rateValue}%/hari`;
                      else if (r.rateType === 'multiplier') rateDisplay = `${r.rateValue}x tarif dasar`;

                      return (
                        <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-3 px-4 font-semibold text-gray-900">{r.name}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${typeBadge}`}>
                              {r.ruleType}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-medium text-emerald-600">{rateDisplay}</td>
                          <td className="py-3 px-4 text-gray-600">
                            {r.startDate && r.endDate ? (
                              <div className="flex items-center gap-1.5 text-[11px]">
                                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                <span>
                                  {r.startDate.split('T')[0]} s/d {r.endDate.split('T')[0]}
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-400 italic">Semua Tanggal (Sesuai Tipe)</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {r.scope === 'all' && <span className="text-gray-700">Semua Motor</span>}
                            {r.scope === 'motor_type' && (
                              <span className="text-indigo-600 font-medium">Tipe: {r.scopeValue}</span>
                            )}
                            {r.scope === 'motorcycle' && (
                              <span className="text-amber-600 font-medium">Unit Motor #{r.scopeValue}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center font-semibold text-gray-700">{r.priority}</td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleToggleRule(r)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                                r.isActive
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {r.isActive ? 'Aktif' : 'Nonaktif'}
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEditRuleModal(r)}
                                className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                title="Edit Aturan"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() =>
                                  setDeleteDialog({
                                    isOpen: true,
                                    type: 'rule',
                                    id: r.id,
                                    title: r.name,
                                  })
                                }
                                className="p-1.5 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Hapus Aturan"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DISCOUNT TIERS */}
      {activeTab === 'tiers' && (
        <div className="space-y-4">
          {/* Quick Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
              <span className="text-xs text-gray-400 font-medium">Total Tier Diskon</span>
              <p className="text-2xl font-bold text-gray-900 mt-1">{tiers.length}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
              <span className="text-xs text-emerald-600 font-medium">Tier Aktif</span>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {tiers.filter((t) => t.isActive).length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
              <span className="text-xs text-purple-600 font-medium">Diskon Maksimal</span>
              <p className="text-2xl font-bold text-purple-600 mt-1">
                {tiers.length > 0 ? `${Math.max(...tiers.map((t) => t.discountPercent))}%` : '0%'}
              </p>
            </div>
          </div>

          {/* Table Discount Tiers */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
            {tiersLoading ? (
              <div className="p-8 text-center text-xs text-gray-400">Memuat tier diskon...</div>
            ) : tiers.length === 0 ? (
              <div className="p-12 text-center">
                <Info className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-gray-700">Belum Ada Tier Diskon Durasi</p>
                <p className="text-xs text-gray-400 mt-1">
                  Tambahkan tier diskon baru untuk memberikan potongan harga otomatis pada sewa mingguan atau bulanan.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-medium">
                      <th className="py-3 px-4">Minimal Hari Sewa</th>
                      <th className="py-3 px-4">Persentase Diskon</th>
                      <th className="py-3 px-4">Deskripsi / Keterangan</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tiers
                      .slice()
                      .sort((a, b) => a.minDays - b.minDays)
                      .map((t) => (
                        <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-3 px-4 font-bold text-gray-900">
                            ≥ {t.minDays} hari sewa
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-black text-xs rounded-lg border border-emerald-200">
                              {t.discountPercent}% OFF
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {t.description || <span className="text-gray-400 italic">Tanpa deskripsi</span>}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleToggleTier(t)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                                t.isActive
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {t.isActive ? 'Aktif' : 'Nonaktif'}
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEditTierModal(t)}
                                className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                title="Edit Tier"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() =>
                                  setDeleteDialog({
                                    isOpen: true,
                                    type: 'tier',
                                    id: t.id,
                                    title: `Tier ≥ ${t.minDays} Hari (${t.discountPercent}%)`,
                                  })
                                }
                                className="p-1.5 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Hapus Tier"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: PRICING RULE */}
      {ruleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-in fade-in duration-200">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-base">
                {editingRuleId ? 'Edit Aturan Harga' : 'Tambah Aturan Harga Baru'}
              </h3>
              <button
                onClick={() => setRuleModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRuleSubmit} className="p-5 space-y-4">
              <FormField label="Nama Aturan" required>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="Contoh: Lonjakan Libur Natal & Tahun Baru"
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary-500"
                  required
                />
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Tipe Aturan" required>
                  <select
                    value={ruleType}
                    onChange={(e) => setRuleType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="weekend">Weekend (Sabtu & Minggu)</option>
                    <option value="seasonal">Seasonal (Musiman)</option>
                    <option value="holiday">Holiday (Hari Libur)</option>
                    <option value="custom">Custom (Kustom)</option>
                  </select>
                </FormField>

                <FormField label="Tipe Tarif" required>
                  <select
                    value={rateType}
                    onChange={(e) => setRateType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="fixed">Nominal Tetap (Rp)</option>
                    <option value="percentage">Persentase (%)</option>
                    <option value="multiplier">Pengali (Multiplier)</option>
                  </select>
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label={
                    rateType === 'fixed'
                      ? 'Nominal Tambahan (Rp/hari)'
                      : rateType === 'percentage'
                      ? 'Persentase Tambahan (%)'
                      : 'Faktor Pengali (contoh: 1.25)'
                  }
                  required
                >
                  <input
                    type="number"
                    step={rateType === 'multiplier' ? '0.05' : '1'}
                    value={rateValue}
                    onChange={(e) => setRateValue(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary-500"
                    required
                  />
                </FormField>

                <FormField label="Prioritas Evaluasi">
                  <input
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary-500"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Tanggal Mulai">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary-500"
                  />
                </FormField>
                <FormField label="Tanggal Selesai">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary-500"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Cakupan Unit">
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="all">Semua Motor</option>
                    <option value="motor_type">Jenis Motor Tertentu</option>
                    <option value="motorcycle">Unit Motor Spesifik</option>
                  </select>
                </FormField>

                {scope !== 'all' && (
                  <FormField
                    label={scope === 'motor_type' ? 'Jenis Motor (matic/manual/sport)' : 'ID Motor'}
                    required
                  >
                    <input
                      type="text"
                      value={scopeValue}
                      onChange={(e) => setScopeValue(e.target.value)}
                      placeholder={scope === 'motor_type' ? 'matic' : 'Contoh: 1'}
                      className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary-500"
                      required
                    />
                  </FormField>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="ruleActive"
                  checked={ruleActive}
                  onChange={(e) => setRuleActive(e.target.checked)}
                  className="rounded text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="ruleActive" className="text-xs font-medium text-gray-700">
                  Aktifkan aturan harga ini langsung
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setRuleModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={ruleSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
                >
                  {ruleSubmitting ? 'Menyimpan...' : 'Simpan Aturan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DISCOUNT TIER */}
      {tierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-in fade-in duration-200">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-base">
                {editingTierId ? 'Edit Tier Diskon Durasi' : 'Tambah Tier Diskon Baru'}
              </h3>
              <button
                onClick={() => setTierModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTierSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Minimal Hari Sewa" required>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={minDays}
                    onChange={(e) => setMinDays(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary-500"
                    required
                  />
                </FormField>

                <FormField label="Diskon (%)" required>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary-500"
                    required
                  />
                </FormField>
              </div>

              <FormField label="Keterangan / Deskripsi">
                <input
                  type="text"
                  value={tierDescription}
                  onChange={(e) => setTierDescription(e.target.value)}
                  placeholder="Contoh: Diskon durasi sewa 1 minggu"
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary-500"
                />
              </FormField>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="tierActive"
                  checked={tierActive}
                  onChange={(e) => setTierActive(e.target.checked)}
                  className="rounded text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="tierActive" className="text-xs font-medium text-gray-700">
                  Aktifkan tier diskon ini
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setTierModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={tierSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
                >
                  {tierSubmitting ? 'Menyimpan...' : 'Simpan Tier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE DIALOG */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title={`Hapus ${deleteDialog.type === 'rule' ? 'Aturan Harga' : 'Tier Diskon'}`}
        message={`Apakah Anda yakin ingin menghapus "${deleteDialog.title}"? Riwayat pemesanan yang telah dibuat tidak akan terpengaruh.`}
        confirmText="Hapus"
        cancelText="Batal"
        loading={deleteLoading}
        variant="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleteDialog({ isOpen: false, type: 'rule', id: null, title: '' })}
      />
    </div>
  );
};

export default PricingManagement;
