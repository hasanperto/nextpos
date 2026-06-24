import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FiInfo, FiDollarSign, FiUsers, FiCreditCard, FiMapPin,
    FiBriefcase, FiCalendar, FiMail, FiPhone, FiFileText,
    FiBox, FiCheckCircle, FiAlertCircle, FiClock, FiTrendingUp
} from 'react-icons/fi';
import { Modal, Badge } from './SaaSShared';
import { useSaaSStore, type Reseller } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';

const API = import.meta.env.VITE_API_URL || '';

interface ResellerTenant {
    id: string;
    name: string;
    schema_name: string;
    status: string;
    subscription_plan: string;
    license_expires_at: string;
    contact_email: string;
    contact_phone?: string;
    max_users: number;
    max_branches: number;
    created_at: string;
}

interface ResellerPayment {
    id: number;
    amount: number;
    currency: string;
    payment_type: string;
    payment_method: string;
    status: string;
    description: string;
    paid_at: string | null;
    created_at: string;
    created_by: string;
}

interface Props {
    reseller: Reseller;
    onClose: () => void;
    commSummary?: { total_earned: number; total_pending: number; tenant_count: number } | null;
}

type TabId = 'overview' | 'restaurants' | 'finance' | 'wallet';

const InfoRow: React.FC<{ label: string; value: React.ReactNode; icon?: React.ReactNode }> = ({ label, value, icon }) => (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
        {icon && <span className="text-slate-400 mt-0.5 shrink-0">{icon}</span>}
        <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{label}</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-white truncate">{value || '—'}</div>
        </div>
    </div>
);

const payTypeLabel = (t: string) => {
    const map: Record<string, string> = {
        reseller_package_onboarding: 'Paket Onboarding',
        license_upgrade: 'Lisans Yükseltme',
        reseller_income: 'Komisyon Geliri',
        subscription: 'Abonelik',
        setup: 'Kurulum',
        addon: 'Ek Modül',
        reseller_wallet_topup: 'Cüzdan Yükleme',
        refund: 'İade',
    };
    return map[t] || t;
};

const statusColor = (s: string): 'emerald' | 'amber' | 'rose' | 'slate' =>
    s === 'paid' ? 'emerald' : s === 'pending' ? 'amber' : s === 'overdue' ? 'rose' : 'slate';

export const ResellerDetailModal: React.FC<Props> = ({ reseller, onClose, commSummary }) => {
    const { t } = useSaaSLocale();
    const { settings, resellerWalletTopups } = useSaaSStore();
    const currency = settings?.currency || '€';

    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const [tenants, setTenants] = useState<ResellerTenant[]>([]);
    const [payments, setPayments] = useState<ResellerPayment[]>([]);
    const [loading, setLoading] = useState({ tenants: true, payments: true });

    const token = useSaaSStore.getState().token;

    const fetchTenants = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/tenants/resellers/${reseller.id}/tenants`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setTenants(await res.json());
        } catch { /* silent */ }
        setLoading(prev => ({ ...prev, tenants: false }));
    }, [reseller.id, token]);

    const fetchPayments = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/tenants/resellers/${reseller.id}/payments`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setPayments(await res.json());
        } catch { /* silent */ }
        setLoading(prev => ({ ...prev, payments: false }));
    }, [reseller.id, token]);

    useEffect(() => {
        void fetchTenants();
        void fetchPayments();
    }, [fetchTenants, fetchPayments]);

    const resellerTopups = resellerWalletTopups.filter(
        (t: any) => t.reseller_id === reseller.id || t.username === reseller.username
    );

    const totalPaid = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    const totalPending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);

    const tabs: { id: TabId; label: string; icon: React.ReactNode; count?: number }[] = [
        { id: 'overview', label: 'Genel Bakış', icon: <FiInfo /> },
        { id: 'restaurants', label: 'Restoranlar', icon: <FiUsers />, count: tenants.length },
        { id: 'finance', label: 'Finans', icon: <FiDollarSign />, count: payments.length },
        { id: 'wallet', label: 'Cüzdan', icon: <FiCreditCard /> },
    ];

    const createdDate = reseller.created_at
        ? new Date(reseller.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
        : '—';

    return (
        <Modal show={true} onClose={onClose} title={reseller.company_name || reseller.username} maxWidth="max-w-5xl">
            <div className="flex flex-col sm:flex-row gap-6 -mt-2">
                {/* Sidebar */}
                <div className="w-full sm:w-48 shrink-0 flex flex-col gap-1">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold text-sm ${
                                activeTab === tab.id
                                    ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                        >
                            {React.cloneElement(tab.icon as any, { size: 18 })}
                            <span className="flex-1 text-left">{tab.label}</span>
                            {tab.count !== undefined && tab.count > 0 && (
                                <span className={`text-xs px-1.5 py-0.5 rounded-md ${
                                    activeTab === tab.id ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                }`}>{tab.count}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 min-h-[450px]">
                    <AnimatePresence mode="wait">
                        {/* ═══ OVERVIEW ═══ */}
                        {activeTab === 'overview' && (
                            <motion.div key="overview" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-6">
                                {/* Header */}
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-2xl">
                                            <FiBriefcase size={28} />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-slate-800 dark:text-white">{reseller.company_name || reseller.username}</h3>
                                            <div className="text-xs text-slate-500 mt-1 font-mono">UID: {reseller.username}</div>
                                        </div>
                                    </div>
                                    <Badge color={reseller.active === 1 || reseller.active === true ? 'emerald' : 'rose'}>
                                        {reseller.active === 1 || reseller.active === true ? 'AKTİF' : 'PASİF'}
                                    </Badge>
                                </div>

                                {/* Stats row */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl text-center">
                                        <div className="text-2xl font-black text-blue-600 dark:text-blue-400">{reseller.total_tenants ?? tenants.length}</div>
                                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Restoranlar</div>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl text-center">
                                        <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{reseller.available_licenses}</div>
                                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Lisans</div>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl text-center">
                                        <div className="text-2xl font-black text-amber-600 dark:text-amber-400">{currency}{Number(reseller.wallet_balance || 0).toLocaleString()}</div>
                                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Cüzdan</div>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl text-center">
                                        <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">%{Number(reseller.commission_rate || 0).toFixed(0)}</div>
                                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Komisyon</div>
                                    </div>
                                </div>

                                {/* Detail rows */}
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5">
                                    <InfoRow label="E-posta" value={reseller.email} icon={<FiMail size={14} />} />
                                    <InfoRow label="Telefon" value={reseller.phone || reseller.mobile_phone} icon={<FiPhone size={14} />} />
                                    <InfoRow label="Yetkili Kişi" value={reseller.contact_person} icon={<FiUsers size={14} />} />
                                    <InfoRow label="Kayıt Tarihi" value={createdDate} icon={<FiCalendar size={14} />} />
                                    <InfoRow label="Vergi No / Dairesi" value={[reseller.tax_number, reseller.tax_office].filter(Boolean).join(' — ') || '—'} icon={<FiFileText size={14} />} />
                                    <InfoRow label="Adres" value={[reseller.billing_address, reseller.district, reseller.city, reseller.postal_code, reseller.country].filter(Boolean).join(', ') || '—'} icon={<FiMapPin size={14} />} />
                                    <InfoRow label="Aktif Paket" value={reseller.reseller_plan_name ? `${reseller.reseller_plan_name} (${currency}${reseller.reseller_plan_price})` : 'Paket yok'} icon={<FiBox size={14} />} />
                                </div>

                                {reseller.admin_notes && (
                                    <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-4 rounded-xl">
                                        <div className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Admin Notları</div>
                                        <div className="text-sm text-amber-800 dark:text-amber-300">{reseller.admin_notes}</div>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* ═══ RESTAURANTS ═══ */}
                        {activeTab === 'restaurants' && (
                            <motion.div key="restaurants" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                                <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <FiUsers className="text-blue-500" /> Bağlı Restoranlar ({tenants.length})
                                </h4>
                                {loading.tenants ? (
                                    <div className="py-12 flex flex-col items-center gap-3">
                                        <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                                        <span className="text-xs font-semibold text-slate-500">Yükleniyor…</span>
                                    </div>
                                ) : tenants.length > 0 ? (
                                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                                        {tenants.map(ten => (
                                            <div key={ten.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-blue-300 dark:hover:border-blue-500/30 transition-colors">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold shrink-0">
                                                        {ten.name[0]?.toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-sm text-slate-800 dark:text-white truncate">{ten.name}</div>
                                                        <div className="text-[10px] text-slate-500 font-mono">{ten.schema_name}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <div className="text-right hidden sm:block">
                                                        <div className="text-[10px] font-bold text-slate-500 uppercase">{ten.subscription_plan}</div>
                                                        <div className="text-[10px] text-slate-400">{ten.max_users} kullanıcı / {ten.max_branches} şube</div>
                                                    </div>
                                                    <Badge color={ten.status === 'active' ? 'emerald' : ten.status === 'suspended' ? 'rose' : 'slate'}>
                                                        {ten.status.toUpperCase()}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                                        <FiUsers size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                                        <p className="text-sm text-slate-500">Bu bayiye bağlı restoran bulunmuyor.</p>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* ═══ FINANCE ═══ */}
                        {activeTab === 'finance' && (
                            <motion.div key="finance" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-5">
                                {/* Summary cards */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 p-4 rounded-xl text-emerald-700 dark:text-emerald-400">
                                        <div className="text-[10px] font-black uppercase tracking-widest mb-1">Toplam Ödenen</div>
                                        <div className="text-xl font-black tabular-nums">{currency}{totalPaid.toFixed(2)}</div>
                                    </div>
                                    <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-4 rounded-xl text-amber-700 dark:text-amber-400">
                                        <div className="text-[10px] font-black uppercase tracking-widest mb-1">Bekleyen</div>
                                        <div className="text-xl font-black tabular-nums">{currency}{totalPending.toFixed(2)}</div>
                                    </div>
                                    <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 p-4 rounded-xl text-indigo-700 dark:text-indigo-400">
                                        <div className="text-[10px] font-black uppercase tracking-widest mb-1">Komisyon Kazancı</div>
                                        <div className="text-xl font-black tabular-nums">{currency}{(commSummary?.total_earned ?? 0).toFixed(2)}</div>
                                    </div>
                                </div>

                                {/* Payment history */}
                                <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <FiFileText className="text-blue-500" /> Ödeme Geçmişi
                                </h4>
                                {loading.payments ? (
                                    <div className="py-8 flex justify-center"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
                                ) : payments.length > 0 ? (
                                    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                                        {payments.map(p => (
                                            <div key={p.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-xs font-semibold text-slate-800 dark:text-white truncate">{p.description || payTypeLabel(p.payment_type)}</div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[10px] text-slate-500">{new Date(p.created_at).toLocaleDateString('tr-TR')}</span>
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold uppercase">{payTypeLabel(p.payment_type)}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0 ml-3">
                                                    <div className="font-bold text-sm text-slate-800 dark:text-white tabular-nums">{currency}{p.amount.toFixed(2)}</div>
                                                    <Badge color={statusColor(p.status)}>{p.status.toUpperCase()}</Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-500">
                                        Ödeme geçmişi bulunmuyor.
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* ═══ WALLET ═══ */}
                        {activeTab === 'wallet' && (
                            <motion.div key="wallet" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-5">
                                {/* Balance card */}
                                <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-6 text-white relative overflow-hidden">
                                    <div className="absolute -right-6 -bottom-6 opacity-10"><FiCreditCard size={120} /></div>
                                    <div className="relative z-10">
                                        <div className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">Güncel Bakiye</div>
                                        <div className="text-3xl font-black tabular-nums">{currency}{Number(reseller.wallet_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                        <div className="flex items-center gap-4 mt-4 text-xs font-bold">
                                            <span className="flex items-center gap-1"><FiTrendingUp size={14} /> Lisans: {reseller.available_licenses}</span>
                                            <span className="flex items-center gap-1"><FiCheckCircle size={14} /> Paket: {reseller.reseller_plan_name || '—'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Top-up history */}
                                <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <FiClock className="text-amber-500" /> Cüzdan Yükleme Talepleri
                                </h4>
                                {resellerTopups.length > 0 ? (
                                    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
                                        {resellerTopups.map((tu: any) => (
                                            <div key={tu.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                                                <div className="min-w-0">
                                                    <div className="text-xs font-semibold text-slate-800 dark:text-white">{currency}{Number(tu.amount).toFixed(2)}</div>
                                                    <div className="text-[10px] text-slate-500">{tu.created_at ? new Date(tu.created_at).toLocaleDateString('tr-TR') : '—'}</div>
                                                </div>
                                                <Badge color={tu.status === 'approved' ? 'emerald' : tu.status === 'pending' ? 'amber' : 'rose'}>
                                                    {tu.status?.toUpperCase()}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-500">
                                        Bu bayiye ait cüzdan yükleme talebi yok.
                                    </div>
                                )}

                                {/* Wallet-related payments */}
                                {payments.filter(p => p.payment_type === 'reseller_wallet_topup' || p.payment_type === 'license_upgrade').length > 0 && (
                                    <>
                                        <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                            <FiDollarSign className="text-emerald-500" /> Cüzdan Hareketleri
                                        </h4>
                                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                                            {payments
                                                .filter(p => p.payment_type === 'reseller_wallet_topup' || p.payment_type === 'license_upgrade' || p.payment_type === 'reseller_package_onboarding')
                                                .map(p => (
                                                    <div key={p.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                                                        <div className="min-w-0">
                                                            <div className="text-xs font-semibold text-slate-800 dark:text-white truncate">{p.description || payTypeLabel(p.payment_type)}</div>
                                                            <div className="text-[10px] text-slate-500">{new Date(p.created_at).toLocaleDateString('tr-TR')}</div>
                                                        </div>
                                                        <div className="font-bold text-sm tabular-nums text-slate-800 dark:text-white">{currency}{p.amount.toFixed(2)}</div>
                                                    </div>
                                                ))}
                                        </div>
                                    </>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </Modal>
    );
};
