import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiUser, FiBarChart2, FiFileText, FiChevronRight, FiShield, FiClock, FiKey, FiMail, FiPhone, FiGrid, FiMove, FiPlay, FiSquare, FiCoffee, FiActivity, FiSettings, FiSend, FiHelpCircle, FiMessageSquare, FiGlobe } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import { useUIStore } from '../../../store/useUIStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { usePosStore } from '../../../store/usePosStore';
import { usePosLocale } from '../../../contexts/PosLocaleContext';
import toast from 'react-hot-toast';
import { useDailyReport } from '../../../hooks/useDailyReport';
import { useStaffStats } from '../../../hooks/useStaffStats';
import { StaffStatsModal } from './StaffStats';

export const StaffPanelModal: React.FC = () => {
    const { staffPanelTab, setStaffPanelTab, preferredFloorView, setPreferredFloorView } = useUIStore();
    const { user } = useAuthStore();
    const { settings } = usePosStore();
    const { t } = usePosLocale();
    
    const { data: globalReport } = useDailyReport();
    const { data: staffReport, refresh: refreshStats } = useStaffStats();

    const [shiftBusy, setShiftBusy] = React.useState(false);
    const [breakBusy, setBreakBusy] = React.useState(false);
    const [shiftDuration, setShiftDuration] = React.useState<string>('00:00:00');

    // Live Network & Support States
    const [isOnline, setIsOnline] = React.useState(navigator.onLine);
    const [urgentMsg, setUrgentMsg] = React.useState('');
    const [sendingMsg, setSendingMsg] = React.useState(false);

    React.useEffect(() => {
        const pingOnline = () => setIsOnline(true);
        const pingOffline = () => setIsOnline(false);
        window.addEventListener('online', pingOnline);
        window.addEventListener('offline', pingOffline);
        return () => {
            window.removeEventListener('online', pingOnline);
            window.removeEventListener('offline', pingOffline);
        };
    }, []);

    const handleSendUrgentMsg = async () => {
        if (!urgentMsg.trim()) return;
        setSendingMsg(true);
        try {
            const res = await fetch('/api/v1/service-calls/from-cashier', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${useAuthStore.getState().token}`,
                    'x-tenant-id': useAuthStore.getState().tenantId || '',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `ACİL DESTEK TALEBİ: ${urgentMsg.trim()}`
                })
            });
            if (res.ok) {
                toast.success(t('staff.message_sent_success') || 'Destek talebi yöneticiye iletildi!');
                setUrgentMsg('');
            } else {
                toast.error(t('staff.message_sent_error') || 'Talep iletilemedi');
            }
        } catch {
            toast.error(t('staff.connection_error') || 'Bağlantı hatası oluştu');
        } finally {
            setSendingMsg(false);
        }
    };

    React.useEffect(() => {
        const lastShift = staffReport?.lastShift;
        if (!lastShift || lastShift.clock_out) {
            setShiftDuration('00:00:00');
            return;
        }

        const updateTimer = () => {
            const diffMs = Date.now() - new Date(lastShift.clock_in).getTime();
            if (diffMs < 0) {
                setShiftDuration('00:00:00');
                return;
            }
            const hours = Math.floor(diffMs / 3600000);
            const minutes = Math.floor((diffMs % 3600000) / 60000);
            const seconds = Math.floor((diffMs % 60000) / 1000);
            setShiftDuration(
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            );
        };

        updateTimer();
        const iv = setInterval(updateTimer, 1000);
        return () => clearInterval(iv);
    }, [staffReport?.lastShift]);

    const handleClockIn = async () => {
        setShiftBusy(true);
        try {
            const res = await fetch('/api/v1/users/clock-in', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${useAuthStore.getState().token}`,
                    'x-tenant-id': useAuthStore.getState().tenantId || ''
                }
            });
            if (res.ok) {
                toast.success(t('staff.clock_in_success') || 'Mesai başarıyla başlatıldı!');
                await refreshStats();
            } else {
                toast.error(t('staff.clock_in_error') || 'Mesai başlatılamadı');
            }
        } catch (err) {
            toast.error(t('staff.connection_error') || 'Bağlantı hatası oluştu');
        } finally {
            setShiftBusy(false);
        }
    };

    const handleClockOut = async () => {
        setShiftBusy(true);
        try {
            const res = await fetch('/api/v1/users/clock-out', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${useAuthStore.getState().token}`,
                    'x-tenant-id': useAuthStore.getState().tenantId || ''
                }
            });
            if (res.ok) {
                toast.success(t('staff.clock_out_success') || 'Mesai başarıyla bitirildi!');
                await refreshStats();
            } else {
                toast.error(t('staff.clock_out_error') || 'Mesai bitirilemedi');
            }
        } catch (err) {
            toast.error(t('staff.connection_error') || 'Bağlantı hatası oluştu');
        } finally {
            setShiftBusy(false);
        }
    };

    const handleToggleBreak = async () => {
        if (user?.role !== 'waiter') return;
        setBreakBusy(true);
        try {
            const onBreak = !staffReport?.waiterOnBreak;
            const res = await fetch('/api/v1/users/waiter-break', {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${useAuthStore.getState().token}`,
                    'x-tenant-id': useAuthStore.getState().tenantId || '',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ onBreak })
            });
            if (res.ok) {
                toast.success(onBreak ? (t('waiter.break_enabled_toast') || 'Molaya çıkıldı') : (t('waiter.break_disabled_toast') || 'Mola bitirildi'));
                await refreshStats();
            } else {
                toast.error(t('waiter.break_error_toast') || 'İşlem başarısız');
            }
        } catch (err) {
            toast.error(t('waiter.toast_connection_error') || 'Bağlantı hatası');
        } finally {
            setBreakBusy(false);
        }
    };

    const isAdmin = user?.role === 'admin';
    const isCashier = user?.role === 'cashier';
    const grossVal = staffReport?.today.total_revenue || 0;
    const dynamicTaxRate = (settings?.taxRate ?? 19) / 100;
    const subtotalVal = grossVal / (1 + dynamicTaxRate);
    const taxVal = grossVal - subtotalVal;

    const staffFallback = {
        orders: {
            orders: staffReport?.today.total_orders || 0,
            gross: grossVal,
            tax: taxVal,
            subtotal: subtotalVal
        },
        payments: {
            payment_total: grossVal,
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
        { id: 'help', label: t('staff.help_settings') || 'Ayarlar & Destek', icon: <FiSettings /> },
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

                                        <div className="p-6 rounded-3xl bg-white/5 border border-white/5 space-y-4">
                                            <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                <FiGrid className="text-pink-500"/> {t('staff.layout_pref') || 'Kat Planı Görünümü'}
                                            </h4>
                                            <div className="space-y-3">
                                                <p className="text-[11px] font-bold text-slate-400 leading-relaxed uppercase tracking-wide">
                                                    {t('staff.layout_desc') || 'Masaların ekranda nasıl listeleneceğini seçin:'}
                                                </p>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreferredFloorView('grid')}
                                                        className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all gap-2 ${
                                                            preferredFloorView === 'grid'
                                                                ? 'bg-blue-600/25 border-blue-500 text-white shadow-lg shadow-blue-900/30'
                                                                : 'bg-black/20 border-white/5 text-slate-400 hover:bg-white/5 hover:text-white'
                                                        }`}
                                                    >
                                                        <FiGrid size={24} />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">{t('staff.layout_grid') || 'Grid Liste'}</span>
                                                    </button>
                                                    
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreferredFloorView('visual')}
                                                        className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all gap-2 ${
                                                            preferredFloorView === 'visual'
                                                                ? 'bg-blue-600/25 border-blue-500 text-white shadow-lg shadow-blue-900/30'
                                                                : 'bg-black/20 border-white/5 text-slate-400 hover:bg-white/5 hover:text-white'
                                                        }`}
                                                    >
                                                        <FiMove size={24} />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">{t('staff.layout_visual') || 'Görsel Kat Planı'}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-6 rounded-3xl bg-white/5 border border-white/5 space-y-4">
                                            <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                <FiActivity className="text-amber-500"/> {t('staff.shift_control') || 'Mesai & Çalışma Durumu'}
                                            </h4>
                                            
                                            <div className="space-y-4">
                                                {/* Mesai Durum Rozeti */}
                                                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-black/20">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t('staff.current_duty') || 'Mesai Durumu'}</span>
                                                        <div className="flex items-center gap-2">
                                                            {staffReport?.lastShift && !staffReport.lastShift.clock_out ? (
                                                                <span className="inline-flex px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black rounded-lg uppercase tracking-widest animate-pulse">
                                                                    {t('staff.on_duty') || 'GÖREVDE'}
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-black rounded-lg uppercase tracking-widest">
                                                                    {t('staff.off_duty') || 'MESAİDE DEĞİL'}
                                                                </span>
                                                            )}
                                                            {staffReport?.waiterOnBreak && (
                                                                <span className="inline-flex px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-black rounded-lg uppercase tracking-widest">
                                                                    {t('staff.on_break') || 'MOLADA'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    
                                                    {staffReport?.lastShift && !staffReport.lastShift.clock_out && (
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t('staff.work_time') || 'Süre'}</span>
                                                            <span className="text-sm font-black text-white tabular-nums tracking-tight">{shiftDuration}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Mesai Kontrolleri */}
                                                <div className="flex gap-2">
                                                    {staffReport?.lastShift && !staffReport.lastShift.clock_out ? (
                                                        <button
                                                            type="button"
                                                            disabled={shiftBusy}
                                                            onClick={handleClockOut}
                                                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-600/10 border border-red-500/25 hover:bg-red-600 hover:text-white text-red-400 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-[0.98]"
                                                        >
                                                            <FiSquare size={14} />
                                                            {t('staff.clock_out') || 'Mesai Bitir'}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            disabled={shiftBusy}
                                                            onClick={handleClockIn}
                                                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600/10 border border-emerald-500/25 hover:bg-emerald-600 hover:text-white text-emerald-400 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-[0.98]"
                                                        >
                                                            <FiPlay size={14} />
                                                            {t('staff.clock_in') || 'Mesai Başlat'}
                                                        </button>
                                                    )}

                                                    {/* Mola Butonu (Sadece garson rolü için) */}
                                                    {user?.role === 'waiter' && staffReport?.lastShift && !staffReport.lastShift.clock_out && (
                                                        <button
                                                            type="button"
                                                            disabled={breakBusy}
                                                            onClick={handleToggleBreak}
                                                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-[0.98] border ${
                                                                staffReport?.waiterOnBreak
                                                                    ? 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-900/30'
                                                                    : 'bg-amber-600/10 border-amber-500/25 hover:bg-amber-600 hover:text-white text-amber-400'
                                                            }`}
                                                        >
                                                            <FiCoffee size={14} />
                                                            {staffReport?.waiterOnBreak ? (t('waiter.break_end') || 'Molayı Bitir') : (t('waiter.break_start') || 'Molaya Çık')}
                                                        </button>
                                                    )}
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

                            {staffPanelTab === 'help' && (
                                <motion.div key="help" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-2xl font-black text-white tracking-tighter">{t('staff.help_settings') || 'Ayarlar & Destek Merkezi'}</h3>
                                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                                            {isOnline ? 'SİSTEM ÇEVRİMİÇİ' : 'BAĞLANTI YOK'}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Sistem Teşhis & Durum Kartı */}
                                        <div className="p-6 rounded-3xl bg-white/5 border border-white/5 space-y-4">
                                            <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                <FiGlobe className="text-blue-500"/> {t('staff.system_diag') || 'Sistem Teşhis & Durum'}
                                            </h4>
                                            
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center p-3 rounded-2xl bg-black/20 text-xs">
                                                    <span className="font-bold text-slate-500 uppercase">{t('staff.network') || 'İnternet Bağlantısı'}</span>
                                                    <span className={`font-black uppercase tracking-wider ${isOnline ? 'text-emerald-400' : 'text-rose-500'}`}>
                                                        {isOnline ? 'AKTİF (ÇEVRİMİÇİ)' : 'BAĞLANTI KESİLDİ'}
                                                    </span>
                                                </div>

                                                <div className="flex justify-between items-center p-3 rounded-2xl bg-black/20 text-xs">
                                                    <span className="font-bold text-slate-500 uppercase">{t('staff.pos_version') || 'Terminal Sürümü'}</span>
                                                    <span className="font-black text-white">v2.4.0 Premium</span>
                                                </div>

                                                <div className="flex justify-between items-center p-3 rounded-2xl bg-black/20 text-xs">
                                                    <span className="font-bold text-slate-500 uppercase">{t('staff.user_auth') || 'Yetki Seviyesi'}</span>
                                                    <span className="font-black text-amber-400 uppercase tracking-widest">{user?.role || 'Staff'}</span>
                                                </div>

                                                <div className="flex justify-between items-center p-3 rounded-2xl bg-black/20 text-xs">
                                                    <span className="font-bold text-slate-500 uppercase">{t('staff.host') || 'Bağlantı Adresi'}</span>
                                                    <span className="font-bold text-slate-400 select-all">{window.location.host}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Sorumlu Çağırma & WhatsApp Desteği */}
                                        <div className="p-6 rounded-3xl bg-white/5 border border-white/5 space-y-4">
                                            <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                <FaWhatsapp className="text-emerald-500"/> {t('staff.supervisor_support') || 'Sorumlu & Yönetici Çağır'}
                                            </h4>
                                            
                                            <div className="space-y-4">
                                                <p className="text-[11px] font-bold text-slate-400 leading-relaxed uppercase tracking-wide">
                                                    {t('staff.support_desc') || 'Herhangi bir aksaklık durumunda doğrudan sorumlu yöneticiyle WhatsApp üzerinden anında sohbet başlatın:'}
                                                </p>
                                                
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const defaultNum = '+905423821034';
                                                        const num = settings?.integrations?.whatsapp?.phoneNumber || settings?.phone || defaultNum;
                                                        const rawNum = num.replace(/\s+/g, '').replace(/[^\d+]/g, '');
                                                        const text = encodeURIComponent(
                                                            `Merhaba, NextPOS Terminali üzerinden bir yardıma ihtiyacım var. Aktif Personel: ${user?.name || user?.username || 'Staff'} (${user?.role || 'Staff'}). Lütfen acil olarak yardımcı olabilir misiniz?`
                                                        );
                                                        window.open(`https://wa.me/${rawNum}?text=${text}`, '_blank');
                                                    }}
                                                    className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-600/10 border border-emerald-500/25 hover:bg-emerald-600 hover:text-white text-emerald-400 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-[0.98] shadow-lg hover:shadow-emerald-500/10"
                                                >
                                                    <FaWhatsapp size={18} />
                                                    {t('staff.call_supervisor') || 'Sorumlu Çağır (WhatsApp)'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Admine Acil Mesaj Gönder */}
                                    <div className="bg-white/5 border border-white/5 rounded-3xl p-6 space-y-4">
                                        <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                            <FiSend className="text-pink-500"/> {t('staff.msg_admin') || 'Yöneticiye / Admine Acil Mesaj Gönder'}
                                        </h4>
                                        <p className="text-[11px] font-bold text-slate-400 leading-relaxed uppercase tracking-wide">
                                            {t('staff.msg_admin_desc') || 'Yazacağınız mesaj anlık olarak tüm POS terminallerine ve yönetici paneline acil servis çağrısı bildirimi olarak düşecektir:'}
                                        </p>
                                        
                                        <div className="relative">
                                            <textarea
                                                value={urgentMsg}
                                                onChange={(e) => setUrgentMsg(e.target.value)}
                                                placeholder={t('staff.msg_admin_placeholder') || 'Örn: Masalarda POS cihazı kağıdı bitti, lütfen yedek getirebilir misiniz?'}
                                                className="w-full h-24 p-4 rounded-2xl bg-black/35 border border-white/5 text-sm font-bold text-white placeholder-slate-600 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/30 transition-all custom-scrollbar resize-none"
                                            />
                                        </div>

                                        <div className="flex justify-end">
                                            <button
                                                type="button"
                                                disabled={sendingMsg || !urgentMsg.trim()}
                                                onClick={handleSendUrgentMsg}
                                                className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-[0.98] shadow-lg ${
                                                    urgentMsg.trim()
                                                        ? 'bg-pink-600 text-white hover:bg-pink-500 shadow-pink-900/30'
                                                        : 'bg-white/5 text-slate-600 border border-transparent cursor-not-allowed'
                                                }`}
                                            >
                                                <FiSend size={12} />
                                                {sendingMsg ? 'Gönderiliyor...' : (t('staff.send_msg') || 'Mesajı Gönder')}
                                            </button>
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
