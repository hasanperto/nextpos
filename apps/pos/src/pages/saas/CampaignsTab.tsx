/**
 * NextPOS — Kampanya & Kupon Yönetimi
 * SaaS Admin Panel
 */

import React, { useState, useEffect } from 'react';
import {
    FiTag, FiPlus, FiEdit, FiTrash2, FiSend, FiBarChart2,
    FiGift, FiTruck, FiCheck,
    FiPercent as FiPercentIcon, FiDollarSign,
    FiUsers, FiClock, FiCheckCircle
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { AnimatePresence } from 'framer-motion';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { StatCard, SectionCard, Modal, InputGroup } from './SaaSShared';
import { useAuthStore } from '../../store/useAuthStore';

type DiscountType = 'percent' | 'fixed' | 'free_item' | 'free_delivery';
type CouponStatus = 'active' | 'paused' | 'expired' | 'depleted';
type AudienceFilter = 'all' | 'tier_bronze' | 'tier_silver' | 'tier_gold' | 'new_customer' | 'vip';

interface Campaign {
    id: number;
    name: string;
    description: string | null;
    discount_type: DiscountType;
    discount_value: number;
    min_order_amount: number;
    max_discount_amount: number | null;
    start_date: string;
    end_date: string;
    usage_limit_total: number | null;
    usage_limit_per_customer: number | null;
    usage_count: number;
    audience_filter: AudienceFilter;
    is_auto_apply: boolean;
    status: CouponStatus;
}

interface Coupon {
    id: number;
    code: string;
    customer_id: number | null;
    phone: string | null;
    email: string | null;
    discount_type: DiscountType;
    discount_value: number;
    min_order_amount: number;
    valid_from: string;
    valid_until: string;
    usage_limit: number;
    usage_count: number;
    status: CouponStatus;
}

interface CouponStats {
    total_coupons: number;
    active_coupons: number;
    used_coupons: number;
    total_discount_given: number;
    campaigns_count: number;
    top_campaigns: { name: string; usage_count: number; total_discount: number }[];
}

type TabType = 'campaigns' | 'coupons' | 'stats' | 'sms';

const discountTypeLabels: Record<DiscountType, string> = {
    percent: 'Yüzde İndirim',
    fixed: 'Sabit TL İndirim',
    free_item: 'Ücretsiz Ürün',
    free_delivery: 'Ücretsiz Teslimat',
};

const discountTypeIcons: Record<DiscountType, React.ReactNode> = {
    percent: <FiPercentIcon size={14} />,
    fixed: <FiDollarSign size={14} />,
    free_item: <FiGift size={14} />,
    free_delivery: <FiTruck size={14} />,
};

const audienceLabels: Record<AudienceFilter, string> = {
    all: 'Herkes',
    tier_bronze: 'Bronze Müşteriler',
    tier_silver: 'Silver Müşteriler',
    tier_gold: 'Gold Müşteriler',
    new_customer: 'Yeni Müşteriler',
    vip: 'VIP Müşteriler',
};

const statusColors: Record<CouponStatus, string> = {
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    paused: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    expired: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    depleted: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export const CampaignsTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const { getAuthHeaders } = useAuthStore();
    const [activeTab, setActiveTab] = useState<TabType>('campaigns');

    // Data
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [stats, setStats] = useState<CouponStats | null>(null);
    const [loading, setLoading] = useState(false);

    // Filters
    const [campaignFilter, setCampaignFilter] = useState<CouponStatus | 'all'>('all');
    const [couponFilter, setCouponFilter] = useState<CouponStatus | 'all'>('all');

    // Modals
    const [showCampaignModal, setShowCampaignModal] = useState(false);
    const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
    const [showBulkModal, setShowBulkModal] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        discount_type: 'percent' as DiscountType,
        discount_value: 10,
        min_order_amount: 0,
        max_discount_amount: '' as string | number,
        start_date: new Date().toISOString().slice(0, 16),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
        usage_limit_total: '' as string | number,
        usage_limit_per_customer: '' as string | number,
        audience_filter: 'all' as AudienceFilter,
        is_auto_apply: false,
    });

    // Bulk generate
    const [bulkCount, setBulkCount] = useState(10);
    const [bulkValidDays, setBulkValidDays] = useState(30);
    const [bulkPhones, setBulkPhones] = useState('');

    // SMS
    const [smsCampaignId, setSmsCampaignId] = useState<number | null>(null);

    const headers = getAuthHeaders();

    const fetchCampaigns = async () => {
        setLoading(true);
        try {
            const url = campaignFilter === 'all'
                ? '/api/v1/saas-public/campaigns'
                : `/api/v1/saas-public/campaigns?status=${campaignFilter}`;
            const res = await fetch(url, { headers });
            if (res.ok) {
                const data = await res.json();
                setCampaigns(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error('fetchCampaigns:', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchCoupons = async () => {
        setLoading(true);
        try {
            const url = couponFilter === 'all'
                ? '/api/v1/saas-public/coupons'
                : `/api/v1/saas-public/coupons?status=${couponFilter}`;
            const res = await fetch(url, { headers });
            if (res.ok) {
                const data = await res.json();
                setCoupons(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error('fetchCoupons:', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const res = await fetch('/api/v1/saas-public/coupons/stats', { headers });
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (e) {
            console.error('fetchStats:', e);
        }
    };

    useEffect(() => {
        if (activeTab === 'campaigns') fetchCampaigns();
        else if (activeTab === 'coupons') fetchCoupons();
        else if (activeTab === 'stats') fetchStats();
    }, [activeTab, campaignFilter, couponFilter]);

    const openCampaignModal = (campaign?: Campaign) => {
        if (campaign) {
            setEditingCampaign(campaign);
            setFormData({
                name: campaign.name,
                description: campaign.description || '',
                discount_type: campaign.discount_type,
                discount_value: campaign.discount_value,
                min_order_amount: campaign.min_order_amount,
                max_discount_amount: campaign.max_discount_amount || '',
                start_date: new Date(campaign.start_date).toISOString().slice(0, 16),
                end_date: new Date(campaign.end_date).toISOString().slice(0, 16),
                usage_limit_total: campaign.usage_limit_total || '',
                usage_limit_per_customer: campaign.usage_limit_per_customer || '',
                audience_filter: campaign.audience_filter,
                is_auto_apply: campaign.is_auto_apply,
            });
        } else {
            setEditingCampaign(null);
            setFormData({
                name: '',
                description: '',
                discount_type: 'percent',
                discount_value: 10,
                min_order_amount: 0,
                max_discount_amount: '',
                start_date: new Date().toISOString().slice(0, 16),
                end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
                usage_limit_total: '',
                usage_limit_per_customer: '',
                audience_filter: 'all',
                is_auto_apply: false,
            });
        }
        setShowCampaignModal(true);
    };

    const saveCampaign = async () => {
        if (!formData.name.trim()) {
            toast.error('Kampanya adı gerekli');
            return;
        }
        if (formData.discount_value <= 0) {
            toast.error('İndirim değeri 0\'dan büyük olmalı');
            return;
        }

        const payload = {
            ...formData,
            discount_value: Number(formData.discount_value),
            min_order_amount: Number(formData.min_order_amount),
            max_discount_amount: formData.max_discount_amount ? Number(formData.max_discount_amount) : undefined,
            usage_limit_total: formData.usage_limit_total ? Number(formData.usage_limit_total) : undefined,
            usage_limit_per_customer: formData.usage_limit_per_customer ? Number(formData.usage_limit_per_customer) : undefined,
        };

        try {
            const url = editingCampaign
                ? `/api/v1/saas-public/campaigns/${editingCampaign.id}`
                : '/api/v1/saas-public/campaigns';
            const method = editingCampaign ? 'PATCH' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                toast.success(editingCampaign ? 'Kampanya güncellendi' : 'Kampanya oluşturuldu');
                setShowCampaignModal(false);
                void fetchCampaigns();
                void fetchStats();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Kayıt hatası');
            }
        } catch (e) {
            toast.error('Kayıt hatası');
        }
    };

    const deleteCampaign = async (id: number) => {
        if (!confirm('Bu kampanyayı silmek istediğinize emin misiniz?')) return;
        try {
            const res = await fetch(`/api/v1/saas-public/campaigns/${id}`, {
                method: 'DELETE',
                headers,
            });
            if (res.ok) {
                toast.success('Kampanya silindi');
                void fetchCampaigns();
                void fetchStats();
            }
        } catch {
            toast.error('Silme hatası');
        }
    };

    const deleteCoupon = async (id: number) => {
        if (!confirm('Bu kuponu silmek istediğinize emin misiniz?')) return;
        try {
            const res = await fetch(`/api/v1/coupons/${id}`, {
                method: 'DELETE',
                headers,
            });
            if (res.ok) {
                toast.success('Kupon silindi');
                void fetchCoupons();
                void fetchStats();
            }
        } catch {
            toast.error('Silme hatası');
        }
    };

    const generateBulkCoupons = async () => {
        if (!editingCampaign) return;
        if (bulkCount < 1 || bulkCount > 1000) {
            toast.error('1-1000 arası kupon üretilebilir');
            return;
        }

        const phoneList = bulkPhones
            .split('\n')
            .map(p => p.trim())
            .filter(p => p.length > 0);

        try {
            const res = await fetch('/api/v1/coupons/bulk', {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaign_id: editingCampaign.id,
                    count: bulkCount,
                    phone_list: phoneList.length > 0 ? phoneList : undefined,
                    valid_days: bulkValidDays,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                toast.success(`${data.created} kupon oluşturuldu`);
                setShowBulkModal(false);
                void fetchCoupons();
                void fetchStats();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Kupon üretilemedi');
            }
        } catch {
            toast.error('Kupon üretilemedi');
        }
    };

    const sendSmsCoupons = async () => {
        if (!smsCampaignId) return;
        try {
            const res = await fetch('/api/v1/coupons/send-sms', {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaign_id: smsCampaignId,
                    phone_list: bulkPhones.split('\n').map(p => p.trim()).filter(p => p),
                    valid_days: bulkValidDays,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                toast.success(data.message || 'SMS gönderimi başlatıldı');
            } else {
                const err = await res.json();
                toast.error(err.error || 'SMS gönderilemedi');
            }
        } catch {
            toast.error('SMS gönderilemedi');
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    };

    const tabs = [
        { id: 'campaigns' as TabType, label: 'Kampanyalar', icon: <FiTag size={14} /> },
        { id: 'coupons' as TabType, label: 'Kuponlar', icon: <FiGift size={14} /> },
        { id: 'stats' as TabType, label: 'İstatistikler', icon: <FiBarChart2 size={14} /> },
        { id: 'sms' as TabType, label: 'SMS Dağıtım', icon: <FiSend size={14} /> },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-white">{t('campaigns.title', 'Kampanya & Kupon')}</h2>
                    <p className="text-xs text-slate-400 mt-1">
                        İndirim kampanyaları, kupon kodları ve müşteri promosyonları
                    </p>
                </div>
                <button
                    onClick={() => openCampaignModal()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white transition-all"
                >
                    <FiPlus size={14} /> Yeni Kampanya
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-800/50 p-1 rounded-2xl w-fit">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            activeTab === tab.id
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                        }`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Campaign List */}
            {activeTab === 'campaigns' && (
                <div className="space-y-4">
                    <div className="flex gap-2 items-center">
                        <span className="text-xs text-slate-400">Filtre:</span>
                        {(['all', 'active', 'paused', 'expired', 'depleted'] as const).map(s => (
                            <button
                                key={s}
                                onClick={() => setCampaignFilter(s)}
                                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                    campaignFilter === s
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                }`}
                            >
                                {s === 'all' ? 'Tümü' : s}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : campaigns.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <FiTag size={32} className="mx-auto mb-2 opacity-50" />
                            <p>Henüz kampanya yok</p>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {campaigns.map(c => (
                                <div key={c.id} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 hover:border-blue-500/30 transition-all">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-bold text-white">{c.name}</span>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusColors[c.status]}`}>
                                                    {c.status}
                                                </span>
                                                {c.is_auto_apply && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                                        Otomatik
                                                    </span>
                                                )}
                                            </div>
                                            {c.description && (
                                                <p className="text-xs text-slate-400 mb-2">{c.description}</p>
                                            )}
                                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
                                                <span className="flex items-center gap-1">
                                                    {discountTypeIcons[c.discount_type]}
                                                    {c.discount_type === 'percent'
                                                        ? `%${c.discount_value} indirim`
                                                        : c.discount_type === 'fixed'
                                                            ? `${c.discount_value} TL indirim`
                                                            : c.discount_type === 'free_delivery'
                                                                ? 'Ücretsiz teslimat'
                                                                : 'Ücretsiz ürün'
                                                    }
                                                </span>
                                                {c.min_order_amount > 0 && (
                                                    <span>Min: {c.min_order_amount} TL</span>
                                                )}
                                                {c.max_discount_amount && (
                                                    <span>Max: {c.max_discount_amount} TL</span>
                                                )}
                                                <span className="flex items-center gap-1">
                                                    <FiClock size={10} />
                                                    {formatDate(c.start_date)} — {formatDate(c.end_date)}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <FiUsers size={10} />
                                                    {audienceLabels[c.audience_filter]}
                                                </span>
                                                <span>Kullanım: {c.usage_count}{c.usage_limit_total ? `/${c.usage_limit_total}` : ''}</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    setEditingCampaign(c);
                                                    setShowBulkModal(true);
                                                }}
                                                className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all"
                                                title="Kupon Üret"
                                            >
                                                <FiPlus size={16} />
                                            </button>
                                            <button
                                                onClick={() => openCampaignModal(c)}
                                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-all"
                                                title="Düzenle"
                                            >
                                                <FiEdit size={16} />
                                            </button>
                                            <button
                                                onClick={() => deleteCampaign(c.id)}
                                                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                                                title="Sil"
                                            >
                                                <FiTrash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Coupons List */}
            {activeTab === 'coupons' && (
                <div className="space-y-4">
                    <div className="flex gap-2 items-center">
                        <span className="text-xs text-slate-400">Filtre:</span>
                        {(['all', 'active', 'paused', 'expired', 'depleted'] as const).map(s => (
                            <button
                                key={s}
                                onClick={() => setCouponFilter(s)}
                                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                    couponFilter === s
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                }`}
                            >
                                {s === 'all' ? 'Tümü' : s}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : coupons.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <FiGift size={32} className="mx-auto mb-2 opacity-50" />
                            <p>Henüz kupon yok</p>
                        </div>
                    ) : (
                        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-slate-700/50">
                                        <th className="text-left p-3 text-slate-400 font-bold">Kod</th>
                                        <th className="text-left p-3 text-slate-400 font-bold">Tür</th>
                                        <th className="text-left p-3 text-slate-400 font-bold">Değer</th>
                                        <th className="text-left p-3 text-slate-400 font-bold">Geçerlilik</th>
                                        <th className="text-left p-3 text-slate-400 font-bold">Kullanım</th>
                                        <th className="text-left p-3 text-slate-400 font-bold">Durum</th>
                                        <th className="text-right p-3 text-slate-400 font-bold">İşlem</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {coupons.map(c => (
                                        <tr key={c.id} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                                            <td className="p-3 font-mono font-bold text-blue-400">{c.code}</td>
                                            <td className="p-3 text-slate-300">
                                                {discountTypeLabels[c.discount_type]}
                                            </td>
                                            <td className="p-3 text-slate-300">
                                                {c.discount_type === 'percent'
                                                    ? `%${c.discount_value}`
                                                    : `${c.discount_value} TL`}
                                            </td>
                                            <td className="p-3 text-slate-400">
                                                {formatDate(c.valid_from)} — {formatDate(c.valid_until)}
                                            </td>
                                            <td className="p-3 text-slate-400">
                                                {c.usage_count}{c.usage_limit ? `/${c.usage_limit}` : ''}
                                            </td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusColors[c.status]}`}>
                                                    {c.status}
                                                </span>
                                            </td>
                                            <td className="p-3 text-right">
                                                <button
                                                    onClick={() => deleteCoupon(c.id)}
                                                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                                >
                                                    <FiTrash2 size={14} />
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

            {/* Stats */}
            {activeTab === 'stats' && (
                <div className="space-y-6">
                    {stats && (
                        <>
                            <div className="grid grid-cols-4 gap-4">
                                <StatCard
                                    label="Toplam Kupon"
                                    value={stats.total_coupons}
                                    icon={<FiTag size={16} />}
                                    color="blue"
                                />
                                <StatCard
                                    label="Aktif Kupon"
                                    value={stats.active_coupons}
                                    icon={<FiCheckCircle size={16} />}
                                    color="green"
                                />
                                <StatCard
                                    label="Kullanılan"
                                    value={stats.used_coupons}
                                    icon={<FiGift size={16} />}
                                    color="purple"
                                />
                                <StatCard
                                    label="Toplam İndirim"
                                    value={`${stats.total_discount_given.toLocaleString()} ₺`}
                                    icon={<FiPercentIcon size={16} />}
                                    color="amber"
                                />
                            </div>

                            <SectionCard title="En Çok Kullanılan Kampanyalar">
                                {stats.top_campaigns.length === 0 ? (
                                    <p className="text-slate-500 text-xs text-center py-4">Henüz veri yok</p>
                                ) : (
                                    <div className="space-y-2">
                                        {stats.top_campaigns.map((c, i) => (
                                            <div key={i} className="flex items-center justify-between p-3 bg-slate-800/40 rounded-xl">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-lg font-black text-slate-600">{i + 1}</span>
                                                    <span className="font-bold text-white">{c.name}</span>
                                                </div>
                                                <div className="flex items-center gap-4 text-xs">
                                                    <span className="text-slate-400">{c.usage_count} kullanım</span>
                                                    <span className="text-green-400 font-bold">{c.total_discount.toLocaleString()} TL indirim</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </SectionCard>
                        </>
                    )}
                </div>
            )}

            {/* SMS Dağıtım */}
            {activeTab === 'sms' && (
                <div className="space-y-6">
                    <SectionCard title="SMS ile Kupon Dağıt">
                        <div className="space-y-4">
                            <p className="text-xs text-slate-400">
                                Kampanya seçin ve telefon numaralarını girin. Her numara için otomatik kupon kodu üretilir ve WhatsApp/SMS ile gönderilir.
                            </p>

                            <div>
                                <label className="text-xs font-bold text-slate-300 mb-1 block">Kampanya Seç</label>
                                <select
                                    value={smsCampaignId || ''}
                                    onChange={e => setSmsCampaignId(Number(e.target.value) || null)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                                >
                                    <option value="">Kampanya seçin...</option>
                                    {campaigns.filter(c => c.status === 'active').map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-300 mb-1 block">
                                    Telefon Numaraları (her satıra bir numara)
                                </label>
                                <textarea
                                    value={bulkPhones}
                                    onChange={e => setBulkPhones(e.target.value)}
                                    placeholder="0532 123 45 67&#10;0533 987 65 43&#10;0541 555 55 55"
                                    rows={8}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-slate-600"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <InputGroup
                                    label="Geçerlilik Süresi (gün)"
                                    type="number"
                                    value={bulkValidDays}
                                    onChange={v => setBulkValidDays(Number(v))}
                                />
                            </div>

                            <button
                                onClick={() => {
                                    if (!smsCampaignId) { toast.error('Kampanya seçin'); return; }
                                    if (!bulkPhones.trim()) { toast.error('Telefon numarası girin'); return; }
                                    void sendSmsCoupons();
                                }}
                                className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 rounded-xl text-xs font-bold text-white transition-all"
                            >
                                <FiSend size={14} /> SMS Gönder
                            </button>
                        </div>
                    </SectionCard>
                </div>
            )}

            {/* Campaign Create/Edit Modal */}
            <AnimatePresence>
                {showCampaignModal && (
                    <Modal show={showCampaignModal} onClose={() => setShowCampaignModal(false)} title={editingCampaign ? 'Kampanya Düzenle' : 'Yeni Kampanya'}>
                        <div className="space-y-4">
                            <InputGroup label="Kampanya Adı *" value={formData.name} onChange={v => setFormData(f => ({ ...f, name: v }))} />

                            <div>
                                <label className="text-xs font-bold text-slate-300 mb-1 block">Açıklama</label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                                    rows={2}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-300 mb-1 block">İndirim Türü</label>
                                    <select
                                        value={formData.discount_type}
                                        onChange={e => setFormData(f => ({ ...f, discount_type: e.target.value as DiscountType }))}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                                    >
                                        {Object.entries(discountTypeLabels).map(([k, v]) => (
                                            <option key={k} value={k}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                                <InputGroup
                                    label={formData.discount_type === 'percent' ? 'İndirim (%)' : 'İndirim (TL)'}
                                    type="number"
                                    value={formData.discount_value}
                                    onChange={v => setFormData(f => ({ ...f, discount_value: Number(v) }))}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <InputGroup label="Min. Sipariş (TL)" type="number" value={formData.min_order_amount} onChange={v => setFormData(f => ({ ...f, min_order_amount: Number(v) }))} />
                                <InputGroup label="Max. İndirim (TL)" type="number" value={formData.max_discount_amount} onChange={v => setFormData(f => ({ ...f, max_discount_amount: v }))} placeholder="Sınırsız" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <InputGroup label="Başlangıç" type="datetime-local" value={formData.start_date} onChange={v => setFormData(f => ({ ...f, start_date: v }))} />
                                <InputGroup label="Bitiş" type="datetime-local" value={formData.end_date} onChange={v => setFormData(f => ({ ...f, end_date: v }))} />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <InputGroup label="Toplam Kullanım Limiti" type="number" value={formData.usage_limit_total} onChange={v => setFormData(f => ({ ...f, usage_limit_total: v }))} placeholder="Sınırsız" />
                                <InputGroup label="Kişi Başı Limit" type="number" value={formData.usage_limit_per_customer} onChange={v => setFormData(f => ({ ...f, usage_limit_per_customer: v }))} placeholder="Sınırsız" />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-300 mb-1 block">Hedef Kitle</label>
                                <select
                                    value={formData.audience_filter}
                                    onChange={e => setFormData(f => ({ ...f, audience_filter: e.target.value as AudienceFilter }))}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                                >
                                    {Object.entries(audienceLabels).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.is_auto_apply}
                                    onChange={e => setFormData(f => ({ ...f, is_auto_apply: e.target.checked }))}
                                    className="w-4 h-4 rounded bg-slate-800 border-slate-600 text-blue-500"
                                />
                                <span className="text-xs text-slate-300">Otomatik uygula (müşteri girişinde)</span>
                            </label>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={saveCampaign}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white transition-all"
                                >
                                    <FiCheck size={14} /> {editingCampaign ? 'Güncelle' : 'Oluştur'}
                                </button>
                                <button
                                    onClick={() => setShowCampaignModal(false)}
                                    className="px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-bold text-slate-300 transition-all"
                                >
                                    İptal
                                </button>
                            </div>
                        </div>
                    </Modal>
                )}
            </AnimatePresence>

            {/* Bulk Generate Modal */}
            <AnimatePresence>
                {showBulkModal && editingCampaign && (
                    <Modal show={showBulkModal} onClose={() => setShowBulkModal(false)} title={`Kupon Üret — ${editingCampaign.name}`}>
                        <div className="space-y-4">
                            <p className="text-xs text-slate-400">
                                "{editingCampaign.name}" kampanyası için toplu kupon üretirsiniz.
                            </p>

                            <InputGroup
                                label="Kupon Adedi"
                                type="number"
                                value={bulkCount}
                                onChange={v => setBulkCount(Math.max(1, Math.min(1000, Number(v))))}
                            />

                            <InputGroup
                                label="Geçerlilik Süresi (gün)"
                                type="number"
                                value={bulkValidDays}
                                onChange={v => setBulkValidDays(Number(v))}
                            />

                            <div>
                                <label className="text-xs font-bold text-slate-300 mb-1 block">
                                    Telefon Numaraları (opsiyonel — her satıra bir numara)
                                </label>
                                <textarea
                                    value={bulkPhones}
                                    onChange={e => setBulkPhones(e.target.value)}
                                    placeholder="0532 123 45 67&#10;0533 987 65 43"
                                    rows={5}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-slate-600"
                                />
                                <p className="text-[10px] text-slate-500 mt-1">
                                    Boş bırakırsanız sadece kupon kodu üretilir, SMS gönderilmez.
                                </p>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => void generateBulkCoupons()}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-500 rounded-xl text-xs font-bold text-white transition-all"
                                >
                                    <FiPlus size={14} /> {bulkCount} Kupon Üret
                                </button>
                                <button
                                    onClick={() => setShowBulkModal(false)}
                                    className="px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-bold text-slate-300 transition-all"
                                >
                                    İptal
                                </button>
                            </div>
                        </div>
                    </Modal>
                )}
            </AnimatePresence>
        </div>
    );
};
