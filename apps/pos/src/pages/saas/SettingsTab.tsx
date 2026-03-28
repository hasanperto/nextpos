import React, { useState, useEffect } from 'react';
import { FiSettings, FiSave, FiAlertCircle, FiPercent, FiDatabase, FiSmartphone, FiClock } from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { SectionCard, InputGroup } from './SaaSShared';

export const SettingsTab: React.FC = () => {
    const { settings, fetchSettings, updateSettings, isLoading } = useSaaSStore();
    const [localSettings, setLocalSettings] = useState<any>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        if (settings) {
            setLocalSettings({ ...settings });
        } else {
            fetchSettings();
        }
    }, [settings]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const ok = await updateSettings(localSettings);
        if (ok) {
            setMessage({ type: 'success', text: 'Sistem ayarları başarıyla güncellendi.' });
            setTimeout(() => setMessage(null), 3000);
        } else {
            setMessage({ type: 'error', text: 'Ayarlar güncellenirken bir hata oluştu.' });
        }
    };

    if (!localSettings) return <div className="p-10 text-center animate-pulse text-slate-500 font-black tracking-widest uppercase text-xs">Ayarlar Yükleniyor...</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-600 rounded-2xl shadow-xl shadow-blue-600/20 text-white"><FiSettings size={24} /></div>
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tighter uppercase">SİSTEM YAPILANDIRMASI</h2>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Komisyon Oranları, Ücretler ve Global Kurallar</p>
                    </div>
                </div>
            </header>

            {message && (
                <div className={`p-4 rounded-2xl border flex items-center gap-3 animate-in zoom-in duration-300 ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                    {message.type === 'success' ? <FiAlertCircle /> : <FiAlertCircle />}
                    <span className="text-xs font-bold uppercase tracking-wide">{message.text}</span>
                </div>
            )}

            <form onSubmit={handleSave} className="space-y-6 pb-20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 1. Global Financials */}
                    <SectionCard title="Küresel Finansal Parametreler" icon={<FiDatabase className="text-indigo-400" />}>
                        <div className="space-y-4">
                            <InputGroup label="Para Birimi" value={localSettings.currency || 'EUR'} onChange={v => setLocalSettings({...localSettings, currency: v})} />
                            <InputGroup label="Yıllık Ödeme İndirim Oranı (%)" type="number" value={localSettings.annual_discount_rate || 15} onChange={v => setLocalSettings({...localSettings, annual_discount_rate: Number(v)})} />
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Bayi Başına Global Ayarlar</span>
                                <InputGroup label="Deneme Süresi (Gün)" type="number" value={localSettings.trial_days || 14} onChange={v => setLocalSettings({...localSettings, trial_days: Number(v)})} />
                            </div>
                        </div>
                    </SectionCard>

                    {/* 2. Reseller Commissions (Setup) */}
                    <SectionCard title="Bayi Kurulum Komisyonları (Setup)" icon={<FiPercent className="text-emerald-400" />}>
                        <div className="space-y-4">
                             <div className="grid grid-cols-2 gap-4">
                                <InputGroup label="Bayi Payı (%)" type="number" value={localSettings.reseller_setup_rate || 75} onChange={v => setLocalSettings({...localSettings, reseller_setup_rate: Number(v)})} />
                                <InputGroup label="Sistem Payı (%)" type="number" value={localSettings.system_setup_rate || 25} onChange={v => setLocalSettings({...localSettings, system_setup_rate: Number(v)})} />
                             </div>
                             <p className="text-[10px] text-slate-500 font-medium italic">* Kurulum ücretinden (Setup Fee) yapılacak olan paylaşım oranı.</p>
                        </div>
                    </SectionCard>

                    {/* 3. Reseller Commissions (Service/Monthly) */}
                    <SectionCard title="Servis & Hizmet Paylaşımı" icon={<FiClock className="text-blue-400" />}>
                        <div className="space-y-4">
                             <div className="grid grid-cols-2 gap-4">
                                <InputGroup label="Bayi Payı (%)" type="number" value={localSettings.reseller_monthly_rate || 50} onChange={v => setLocalSettings({...localSettings, reseller_monthly_rate: Number(v)})} />
                                <InputGroup label="Sistem Payı (%)" type="number" value={localSettings.system_monthly_rate || 50} onChange={v => setLocalSettings({...localSettings, system_monthly_rate: Number(v)})} />
                             </div>
                             <p className="text-[10px] text-slate-500 font-medium italic">* Aylık veya Yıllık yenilemelerden yapılacak paylaşım oranı.</p>
                        </div>
                    </SectionCard>

                    {/* 4. Extra Module & Addons */}
                    <SectionCard title="Ek Modül & Cihaz Satışları" icon={<FiSmartphone className="text-amber-400" />}>
                         <div className="space-y-4">
                            <InputGroup label="Bayi Komisyonu (%)" type="number" value={localSettings.reseller_addon_rate || 15} onChange={v => setLocalSettings({...localSettings, reseller_addon_rate: Number(v)})} />
                            <p className="text-[10px] text-slate-500 font-medium italic">* Paket dışı modül ve ek donanım kayıtlarından bayi payı.</p>
                         </div>
                    </SectionCard>
                </div>

                <div className="sticky bottom-6 flex justify-end">
                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-4 rounded-2xl font-black shadow-2xl shadow-blue-600/40 flex items-center gap-3 active:scale-95 transition-all text-xs tracking-[0.2em] uppercase disabled:opacity-50"
                    >
                        <FiSave size={20} /> AYARLARI SİSTEME UYGULA
                    </button>
                </div>
            </form>
        </div>
    );
};
