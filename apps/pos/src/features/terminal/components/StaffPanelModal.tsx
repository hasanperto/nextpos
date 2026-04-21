import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiUser, FiBarChart2, FiFileText, FiChevronRight, FiShield, FiClock, FiKey, FiMail, FiPhone } from 'react-icons/fi';
import { useUIStore } from '../../../store/useUIStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { usePosLocale } from '../../../contexts/PosLocaleContext';
import toast from 'react-hot-toast';
import { useDailyReport } from '../../../hooks/useDailyReport';
import { useStaffStats } from '../../../hooks/useStaffStats';
import { StaffStatsModal } from './StaffStats';



export const StaffPanelModal: React.FC = () => {
    const { staffPanelTab, setStaffPanelTab } = useUIStore();
    const { user } = useAuthStore();
    const { t } = usePosLocale();
    
    const { data: globalReport } = useDailyReport();
    const { data: staffReport } = useStaffStats();

    const isAdmin = user?.role === 'admin';
    const isCashier = user?.role === 'cashier';
    /** Garson/mutfak: kişisel /users/my-stats. Admin + kasiyer: Z-rapor (API'de cashier izinli). */
    const staffFallback = {
        orders: {
            orders: staffReport?.today.total_orders || 0,
            gross: staffReport?.today.total_revenue || 0,
            tax: (staffReport?.today.total_revenue || 0) * 0.19,
            subtotal: (staffReport?.today.total_revenue || 0) * 0.81
        },
        payments: {
            payment_total: staffReport?.today.total_revenue || 0,
            tip_total: staffReport?.tipsToday || 0,
            payment_lines: staffReport?.today.total_orders || 0
        },
        paymentsByMethod: [] as unknown[]
    } as const;

    const reportData =
        isAdmin || isCashier ? globalReport ?? (staffFallback as any) : (staffFallback as any);

    const profitMarginPct =
        reportData && Number(reportData.orders?.gross) > 0
            ? ((Number(reportData.orders.subtotal) / Number(reportData.orders.gross)) * 100).toFixed(1)
            : '0.0';

    if (!staffPanelTab) return null;

    const tabs = [
        { id: 'profile', label: t('staff.profile') || 'Profil', icon: <FiUser /> },
        { id: 'stats', label: t('staff.stats') || 'İstatistik', icon: <FiBarChart2 /> },
        { id: 'report', label: t('staff.daily_report') || 'Günlük Rapor', icon: <FiFileText /> },
    ];


    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-6">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setStaffPanelTab(null)}
                    className="absolute inset-0 bg-black/80 backdrop-blur-xl"
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="relative w-full max-w-4xl bg-[#0a0e1a] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row h-[80vh]"
                >
                    {/* Sidebar Tabs */}
                    <div className="w-full md:w-64 bg-[#0d1220] border-r border-white/5 p-6 flex flex-col">
                        <div className="mb-8">
                            <h2 className="text-xl font-black text-white tracking-tight uppercase italic underline decoration-blue-500 decoration-4 underline-offset-8 mb-2">
                                {t('terminal.staff') || 'Personel'}
                            </h2>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                                {t('staff.panel_desc') || 'Yönetim ve Takip Merkezi'}
                            </p>
                        </div>


                        <div className="flex-1 space-y-2">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setStaffPanelTab(tab.id as any)}
                                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all font-bold text-sm ${
                                        staffPanelTab === tab.id
                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                                            : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                    }`}
                                >
                                    <span className="text-lg">{tab.icon}</span>
                                    <span>{tab.label}</span>
                                    {staffPanelTab === tab.id && <motion.div layoutId="tab-indicator" className="ml-auto"><FiChevronRight /></motion.div>}
                                </button>
                            ))}
                        </div>

                        <button 
                            onClick={() => setStaffPanelTab(null)}
                            className="mt-4 flex items-center justify-center gap-2 p-3 rounded-2xl bg-white/5 text-slate-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest border border-transparent hover:border-white/10"
                        >
                            <FiX size={14} /> {t('common.close') || 'Kapat'}
                        </button>

                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        <AnimatePresence mode="wait">
                            {staffPanelTab === 'profile' && (
                                <motion.div key="profile" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-8">
                                    <div className="flex items-center gap-6">
                                        <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center text-4xl text-white font-black shadow-2xl shadow-blue-900/40">
                                            {user?.name?.charAt(0) || 'P'}
                                        </div>
                                        <div>
                                            <h3 className="text-3xl font-black text-white tracking-tighter mb-1">{user?.name || 'Staff'}</h3>
                                            <div className="flex items-center gap-3">
                                                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
                                                    {t('staff.active_duty') || 'Aktif Görevde'}
                                                </span>
                                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest underline decoration-slate-800 underline-offset-4">{user?.role || 'Staff'}</span>
                                            </div>
                                        </div>

                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="p-6 rounded-3xl bg-white/5 border border-white/5 space-y-4">
                                            <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest"><FiUser className="text-blue-500"/> {t('staff.identity_info') || 'Kimlik Bilgileri'}</h4>
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-3 p-3 rounded-2xl bg-black/20">
                                                    <FiMail className="text-slate-500"/>
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-bold text-slate-600 uppercase">{t('staff.username') || 'Kullanıcı Adı'}</span>
                                                        <span className="text-sm font-bold text-white">{user?.username || 'user'}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3 p-3 rounded-2xl bg-black/20">
                                                    <FiPhone className="text-slate-500"/>
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-bold text-slate-600 uppercase">{t('staff.phone') || 'Telefon'}</span>
                                                        <span className="text-sm font-bold text-white">+90 5XX XXX XX XX</span>
                                                    </div>
                                                </div>

                                            </div>
                                        </div>

                                        <div className="p-6 rounded-3xl bg-white/5 border border-white/5 space-y-4">
                                            <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest"><FiShield className="text-emerald-500"/> {t('staff.security') || 'Güvenlik'}</h4>
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-3 p-3 rounded-2xl bg-black/20">
                                                    <FiKey className="text-slate-500"/>
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-bold text-slate-600 uppercase">{t('staff.pin_code') || 'PIN Kodu'}</span>
                                                        <span className="text-sm font-bold text-white">**** ({t('staff.defined') || 'Tanımlı'})</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3 p-3 rounded-2xl bg-black/20">
                                                    <FiClock className="text-slate-500"/>
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-bold text-slate-600 uppercase">{t('staff.last_login')}</span>
                                                        <span className="text-sm font-bold text-white">
                                                            {new Date().toLocaleDateString('tr-TR')} {new Date().getHours().toString().padStart(2, '0')}:00
                                                        </span>
                                                    </div>
                                                </div>

                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                             {staffPanelTab === 'stats' && (
                                <motion.div key="stats" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-2xl font-black text-white tracking-tighter">{t('staff.sales_performance') || 'Satış & Performans Verileri'}</h3>
                                        <span className="text-[10px] font-black uppercase text-slate-500 tabular-nums">{t('common.last_24h') || 'Son 24 Saat'}</span>
                                    </div>

                                    <StaffStatsModal data={reportData} />
                                </motion.div>
                            )}

                            {staffPanelTab === 'report' && (
                                <motion.div key="report" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-2xl font-black text-white tracking-tighter">{t('staff.daily_report') || 'Gün Sonu Raporu'}</h3>
                                        <button 
                                            onClick={async () => {
                                                try {
                                                    const res = await fetch(`/api/v1/admin/reports/z-report/pdf?date=${new Date().toISOString().split('T')[0]}`, {
                                                        headers: { 'Authorization': `Bearer ${useAuthStore.getState().token}`, 'x-tenant-id': useAuthStore.getState().tenantId || '' }
                                                    });
                                                    if (!res.ok) throw new Error('PDF generate failed');
                                                    const blob = await res.blob();
                                                    const url = window.URL.createObjectURL(blob);
                                                    const a = document.createElement('a');
                                                    a.href = url;
                                                    a.download = `z-report-${new Date().toISOString().split('T')[0]}.pdf`;
                                                    a.click();
                                                } catch (e) {
                                                    toast.error(t('staff.pdf_error') || 'PDF oluşturulamadı');
                                                }
                                            }}
                                            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg shadow-emerald-900/30 active:scale-95 transition-all"
                                        >
                                            {t('staff.print_report')}
                                        </button>
                                    </div>


                                    <div className="bg-white/5 border border-white/5 rounded-3xl p-8 space-y-6">
                                        <div className="flex items-center justify-between border-b border-white/5 pb-6">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">{t('staff.daily_revenue') || 'Günlük Ciro'}</span>
                                                <span className="text-4xl font-black text-white tabular-nums tracking-tighter">
                                                    ₺{reportData?.orders.gross.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) || '0,00'}
                                                </span>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-2">{t('staff.profit_rate') || 'Kar Oranı'}</span>
                                                <span className="text-2xl font-black text-emerald-400 tabular-nums">
                                                    +%{profitMarginPct}
                                                </span>
                                            </div>
                                        </div>



                                        <div className="grid grid-cols-2 gap-8 py-4">
                                            <div className="space-y-4">
                                                <h5 className="text-[10px] font-black text-slate-600 uppercase tracking-widest underline decoration-slate-800 underline-offset-4">{t('staff.payment_types') || 'Ödeme Tipleri'}</h5>
                                                <div className="space-y-2">
                                                    {(reportData?.paymentsByMethod as any[])?.map((pm: any, idx: number) => (
                                                        <div key={idx} className="flex justify-between text-xs font-bold">
                                                            <span className="text-slate-500">{t(`cart.paymentMethod.${pm.method}`) || pm.method}</span>
                                                            <span className="text-white">₺{pm.total.toLocaleString('tr-TR')}</span>
                                                        </div>
                                                    ))}
                                                    {(!reportData || reportData.paymentsByMethod.length === 0) && (
                                                        <div className="text-[10px] font-bold text-slate-600 italic">{t('staff.no_data') || 'Veri bulunamadı'}</div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                <h5 className="text-[10px] font-black text-slate-600 uppercase tracking-widest underline decoration-slate-800 underline-offset-4">{t('staff.operational') || 'Operasyonel'}</h5>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-xs font-bold"><span className="text-slate-500">{t('staff.cancellations') || 'İptaller'}</span><span className="text-rose-500">0 {t('common.quantity_unit') || 'Adet'}</span></div>
                                                    <div className="flex justify-between text-xs font-bold"><span className="text-slate-500">{t('staff.returns') || 'İadeler'}</span><span className="text-rose-500">₺0</span></div>
                                                    <div className="flex justify-between text-xs font-bold"><span className="text-slate-500">{t('staff.discounts') || 'İndirimler'}</span><span className="text-amber-500">₺0</span></div>
                                                </div>
                                            </div>
                                        </div>



                                        <div className="mt-8 p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-start gap-4">
                                            <FiShield className="text-orange-500 mt-1 shrink-0" size={18}/>
                                            <p className="text-[11px] font-bold text-orange-200/70 leading-relaxed italic">
                                                {t('staff.report_disclaimer') || 'Bu rapor sadece aktif seans verilerini kapsamaktadır.'}
                                            </p>
                                        </div>

                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
