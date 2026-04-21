import React, { useState, useEffect } from 'react';
import {
    FiSettings, FiSave, FiAlertCircle, FiPercent, FiDatabase,
    FiSmartphone, FiClock, FiShield, FiBriefcase, FiRefreshCw,
    FiZap, FiCheckCircle, FiCreditCard, FiGlobe, FiPlus, FiTrash2, FiHome, FiKey
} from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { SectionCard, InputGroup, SelectGroup, ToggleGroup } from './SaaSShared';
import { motion } from 'framer-motion';
import { ModernConfirmModal } from '../../features/terminal/components/ModernConfirmModal';

export const SettingsTab: React.FC = () => {
    const { t, lang, setLang, languages } = useSaaSLocale();
    const { settings, fetchSettings, updateSettings, isLoading } = useSaaSStore();
    const [localSettings, setLocalSettings] = useState<any>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [retentionPreset, setRetentionPreset] = useState<string>('90');
    const [confirm, setConfirm] = useState<null | { title: string; description: string; onConfirm: () => void }>(null);

    useEffect(() => {
        if (settings) {
            const initialRetention = Number(settings.audit_retention_days || 90);
            const preset = [30, 90, 180, 365, 730].includes(initialRetention) ? String(initialRetention) : 'custom';
            setLocalSettings({ 
                ...settings,
                iyzico_api_key: settings.iyzico_api_key || '',
                iyzico_secret_key: settings.iyzico_secret_key || '',
                paytr_merchant_id: settings.paytr_merchant_id || '',
                paytr_merchant_key: settings.paytr_merchant_key || '',
                paytr_merchant_salt: settings.paytr_merchant_salt || '',
                stripe_public_key: settings.stripe_public_key || '',
                stripe_secret_key: settings.stripe_secret_key || '',
                active_gateway: settings.active_gateway || 'iyzico',
                virtual_pos_test_mode: Number(settings.virtual_pos_test_mode) === 1 ? 1 : 0,
                reseller_bank_accounts: Array.isArray(settings.reseller_bank_accounts)
                    ? settings.reseller_bank_accounts
                    : [],
            });
            setRetentionPreset(preset);
        } else {
            fetchSettings();
        }
    }, [settings, fetchSettings]);

    const doSave = async () => {
        const ok = await updateSettings(localSettings);
        if (ok) {
            setMessage({ type: 'success', text: t('settings.saveOk') });
            setTimeout(() => setMessage(null), 3000);
        } else {
            const detail = useSaaSStore.getState().error || t('settings.saveErr');
            setMessage({ type: 'error', text: detail });
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const prevRetention = Number(settings?.audit_retention_days ?? 90);
        const nextRetention = Number(localSettings.audit_retention_days ?? 90);
        if (Number.isFinite(nextRetention) && nextRetention < prevRetention) {
            setConfirm({
                title: t('settings.title'),
                description: t('settings.auditRetentionConfirm'),
                onConfirm: () => void doSave(),
            });
            return;
        }
        await doSave();
    };

    if (!localSettings) return (
        <div className="flex items-center justify-center h-[50vh]">
            <div className="p-10 text-center animate-pulse text-slate-500 font-black tracking-widest uppercase text-xs">
                <FiRefreshCw className="mx-auto mb-4 animate-spin" size={24} />
                {t('settings.loading')}
            </div>
        </div>
    );

    const containerVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { 
            opacity: 1, 
            y: 0,
            transition: { duration: 0.6, staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 15 },
        visible: { opacity: 1, y: 0 }
    };

    return (
        <motion.div 
            className="max-w-6xl mx-auto space-y-8 pb-32"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
        >
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4 sm:px-0">
                <motion.div className="flex items-center gap-6" variants={itemVariants}>
                    <div className="p-5 bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-600 rounded-[32px] shadow-2xl shadow-blue-500/20 text-white border border-white/20 relative group">
                        <FiSettings size={32} className="drop-shadow-lg group-hover:rotate-90 transition-transform duration-700" />
                        <div className="absolute inset-0 bg-white/20 rounded-[32px] animate-pulse opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div>
                        <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">{t('settings.title')}</h2>
                        <div className="flex items-center gap-3 mt-3">
                            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                                <FiCheckCircle size={10} /> {t('settings.activeNode')}
                            </span>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">
                                {t('settings.subtitle')}
                            </p>
                        </div>
                    </div>
                </motion.div>
                
                <motion.div className="flex items-center gap-3" variants={itemVariants}>
                    {message && (
                        <div className={`px-6 py-3 rounded-2xl border-2 flex items-center gap-3 shadow-xl animate-in fade-in zoom-in duration-300 ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-emerald-500/10' : 'bg-rose-500/10 border-rose-500/20 text-rose-400 shadow-rose-500/10'}`}>
                            <FiAlertCircle size={16} />
                            <span className="text-xs font-black uppercase tracking-wider">{message.text}</span>
                        </div>
                    )}
                </motion.div>
            </header>

            <motion.div variants={itemVariants} className="px-4 sm:px-0">
                <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/[0.07] px-5 py-4 text-xs text-slate-300 leading-relaxed">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-1">
                        {t('settings.saasPanelAccess')}
                    </p>
                    <p className="font-mono text-[11px] text-slate-400">{t('settings.saasPanelAccessBody')}</p>
                </div>
            </motion.div>

            <form onSubmit={handleSave} className="grid grid-cols-1 xl:grid-cols-12 gap-8 px-4 sm:px-0">
                {/* LEFT COLUMN - Global & Finance */}
                <div className="xl:col-span-7 space-y-8">
                    {/* 1. Global Financial Architecture */}
                    <motion.div variants={itemVariants}>
                        <SectionCard title={t('settings.globalFinance')} icon={<FiDatabase className="text-indigo-400" />}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <InputGroup label={t('settings.currency')} value={localSettings.currency || 'EUR'} onChange={v => setLocalSettings({...localSettings, currency: v})} />
                                <InputGroup label={t('settings.annualDisc')} type="number" value={localSettings.annual_discount_rate || 15} onChange={v => setLocalSettings({...localSettings, annual_discount_rate: Number(v)})} />
                                
                                <div className="md:col-span-2 p-6 bg-gradient-to-br from-white/[0.03] to-transparent rounded-[32px] border border-white/5 group hover:border-indigo-500/30 transition-all relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                                        <FiBriefcase size={80} />
                                    </div>
                                    <div className="flex items-center gap-3 mb-5 relative z-10">
                                        <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/10 group-hover:scale-110 transition-transform"><FiBriefcase size={16} /></div>
                                        <span className="text-[11px] font-black text-slate-300 uppercase tracking-[0.2em]">{t('settings.resellerGlobal')}</span>
                                    </div>
                                    <InputGroup label={t('settings.trialDays')} type="number" value={localSettings.trial_days || 14} onChange={v => setLocalSettings({...localSettings, trial_days: Number(v)})} />
                                    <SelectGroup
                                        label={t('settings.auditRetentionPreset')}
                                        value={retentionPreset}
                                        onChange={(v) => {
                                            setRetentionPreset(v);
                                            if (v !== 'custom') {
                                                setLocalSettings({ ...localSettings, audit_retention_days: Number(v) });
                                            }
                                        }}
                                        options={[
                                            { label: '30 gün', value: '30' },
                                            { label: '90 gün', value: '90' },
                                            { label: '180 gün', value: '180' },
                                            { label: '365 gün', value: '365' },
                                            { label: '730 gün', value: '730' },
                                            { label: t('settings.auditRetentionCustom'), value: 'custom' },
                                        ]}
                                    />
                                    {retentionPreset === 'custom' && (
                                        <InputGroup
                                            label={t('settings.auditRetentionDays')}
                                            type="number"
                                            value={localSettings.audit_retention_days || 90}
                                            onChange={v => setLocalSettings({ ...localSettings, audit_retention_days: Number(v) })}
                                        />
                                    )}
                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest italic">
                                        {t('settings.auditRetentionHint')}
                                    </p>
                                    <div className="mt-4 flex items-center gap-2 px-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest italic">{t('settings.resellerGlobalHint')}</span>
                                    </div>
                                </div>
                            </div>
                        </SectionCard>
                    </motion.div>

                    {/* 1.5. Virtual POS Gateways Architecture (Phase 13) */}
                    <motion.div variants={itemVariants}>
                        <SectionCard title={t('settings.gateway.title')} icon={<FiCreditCard className="text-blue-400" />}>
                            <div className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <SelectGroup 
                                        label={t('settings.gateway.primary')} 
                                        value={localSettings.active_gateway} 
                                        onChange={v => setLocalSettings({...localSettings, active_gateway: v})}
                                        options={[
                                            { label: t('settings.gateway.iyzico'), value: 'iyzico' },
                                            { label: t('settings.gateway.paytr'), value: 'paytr' },
                                            { label: t('settings.gateway.stripe'), value: 'stripe' }
                                        ]}
                                    />
                                    <div className="space-y-3">
                                        <ToggleGroup
                                            label={t('settings.gateway.testMode')}
                                            active={Number(localSettings.virtual_pos_test_mode) === 1}
                                            onChange={(v) =>
                                                setLocalSettings({ ...localSettings, virtual_pos_test_mode: v ? 1 : 0 })
                                            }
                                        />
                                        <p className="text-[10px] text-slate-500 leading-relaxed">{t('settings.gateway.testModeHint')}</p>
                                    </div>
                                    <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 flex items-center gap-3">
                                        <FiZap className="text-blue-400 shrink-0" size={16} />
                                        <p className="text-[10px] font-black text-blue-400/70 uppercase tracking-tight">{t('settings.gateway.note')}</p>
                                    </div>
                                </div>

                                <div className="h-px bg-white/5 w-full" />

                                {localSettings.active_gateway === 'iyzico' && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-white/[0.02] border border-white/5 rounded-[32px]">
                                        <InputGroup label={t('settings.gateway.iyzicoApiKey')} value={localSettings.iyzico_api_key} onChange={v => setLocalSettings({...localSettings, iyzico_api_key: v})} />
                                        <InputGroup label={t('settings.gateway.iyzicoSecretKey')} type="password" value={localSettings.iyzico_secret_key} onChange={v => setLocalSettings({...localSettings, iyzico_secret_key: v})} />
                                    </motion.div>
                                )}

                                {localSettings.active_gateway === 'paytr' && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 p-6 bg-white/[0.02] border border-white/5 rounded-[32px]">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <InputGroup label={t('settings.gateway.paytrMerchantId')} value={localSettings.paytr_merchant_id} onChange={v => setLocalSettings({...localSettings, paytr_merchant_id: v})} />
                                            <InputGroup label={t('settings.gateway.paytrMerchantKey')} value={localSettings.paytr_merchant_key} onChange={v => setLocalSettings({...localSettings, paytr_merchant_key: v})} />
                                            <InputGroup label={t('settings.gateway.paytrMerchantSalt')} type="password" value={localSettings.paytr_merchant_salt} onChange={v => setLocalSettings({...localSettings, paytr_merchant_salt: v})} />
                                        </div>
                                    </motion.div>
                                )}

                                {localSettings.active_gateway === 'stripe' && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-white/[0.02] border border-white/5 rounded-[32px]">
                                        <InputGroup label={t('settings.gateway.stripePublicKey')} value={localSettings.stripe_public_key} onChange={v => setLocalSettings({...localSettings, stripe_public_key: v})} />
                                        <InputGroup label={t('settings.gateway.stripeSecretKey')} type="password" value={localSettings.stripe_secret_key} onChange={v => setLocalSettings({...localSettings, stripe_secret_key: v})} />
                                    </motion.div>
                                )}

                                <div className="p-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.06]">
                                    <p className="text-[10px] font-black text-cyan-300 uppercase tracking-widest mb-1">
                                        {t('settings.gateway.resellerStripeTopup')}
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                                        {t('settings.gateway.resellerStripeTopupHint')}
                                    </p>
                                </div>
                            </div>
                        </SectionCard>
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <SectionCard title={t('settings.bankAccounts.title')} icon={<FiHome className="text-emerald-400" />}>
                            <p className="text-[10px] text-slate-500 font-medium mb-4 max-w-2xl">{t('settings.bankAccounts.hint')}</p>
                            <div className="space-y-4">
                                {(localSettings.reseller_bank_accounts || []).map(
                                    (row: { bank_name: string; account_holder: string; iban: string; currency?: string; note?: string }, idx: number) => (
                                        <div
                                            key={idx}
                                            className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 rounded-2xl border border-white/10 bg-white/[0.02]"
                                        >
                                            <div className="md:col-span-3">
                                                <InputGroup
                                                    label={t('settings.bankAccounts.bankName')}
                                                    value={row.bank_name || ''}
                                                    onChange={(v) => {
                                                        const next = [...(localSettings.reseller_bank_accounts || [])];
                                                        next[idx] = { ...next[idx], bank_name: v };
                                                        setLocalSettings({ ...localSettings, reseller_bank_accounts: next });
                                                    }}
                                                />
                                            </div>
                                            <div className="md:col-span-3">
                                                <InputGroup
                                                    label={t('settings.bankAccounts.holder')}
                                                    value={row.account_holder || ''}
                                                    onChange={(v) => {
                                                        const next = [...(localSettings.reseller_bank_accounts || [])];
                                                        next[idx] = { ...next[idx], account_holder: v };
                                                        setLocalSettings({ ...localSettings, reseller_bank_accounts: next });
                                                    }}
                                                />
                                            </div>
                                            <div className="md:col-span-3">
                                                <InputGroup
                                                    label={t('settings.bankAccounts.iban')}
                                                    value={row.iban || ''}
                                                    onChange={(v) => {
                                                        const next = [...(localSettings.reseller_bank_accounts || [])];
                                                        next[idx] = { ...next[idx], iban: v };
                                                        setLocalSettings({ ...localSettings, reseller_bank_accounts: next });
                                                    }}
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <InputGroup
                                                    label={t('settings.bankAccounts.currency')}
                                                    value={row.currency || 'EUR'}
                                                    onChange={(v) => {
                                                        const next = [...(localSettings.reseller_bank_accounts || [])];
                                                        next[idx] = { ...next[idx], currency: v };
                                                        setLocalSettings({ ...localSettings, reseller_bank_accounts: next });
                                                    }}
                                                />
                                            </div>
                                            <div className="md:col-span-1 flex items-end justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const next = (localSettings.reseller_bank_accounts || []).filter((_: unknown, i: number) => i !== idx);
                                                        setLocalSettings({ ...localSettings, reseller_bank_accounts: next });
                                                    }}
                                                    className="p-3 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                                                    aria-label="remove"
                                                >
                                                    <FiTrash2 size={16} />
                                                </button>
                                            </div>
                                            <div className="md:col-span-12">
                                                <InputGroup
                                                    label={t('settings.bankAccounts.note')}
                                                    value={row.note || ''}
                                                    onChange={(v) => {
                                                        const next = [...(localSettings.reseller_bank_accounts || [])];
                                                        next[idx] = { ...next[idx], note: v };
                                                        setLocalSettings({ ...localSettings, reseller_bank_accounts: next });
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )
                                )}
                                <button
                                    type="button"
                                    onClick={() =>
                                        setLocalSettings({
                                            ...localSettings,
                                            reseller_bank_accounts: [
                                                ...(localSettings.reseller_bank_accounts || []),
                                                { bank_name: '', account_holder: '', iban: '', currency: 'EUR', note: '' },
                                            ],
                                        })
                                    }
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-500/30 text-emerald-300 text-xs font-black uppercase tracking-widest hover:bg-emerald-500/10"
                                >
                                    <FiPlus size={14} /> {t('settings.bankAccounts.add')}
                                </button>
                            </div>
                        </SectionCard>
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <SectionCard title={t('settings.uiLanguage')} icon={<FiGlobe className="text-cyan-400" />}>
                            <div className="max-w-sm">
                                <SelectGroup
                                    label={t('settings.uiLanguage')}
                                    value={lang}
                                    onChange={(v) => {
                                        if (v === 'de' || v === 'en' || v === 'tr') setLang(v);
                                    }}
                                    options={languages
                                        .filter((l) => l.code === 'de' || l.code === 'en' || l.code === 'tr')
                                        .map((l) => ({
                                            label: `${l.flagEmoji ?? '🌐'} ${l.nativeName ?? l.name}`,
                                            value: l.code,
                                        }))}
                                />
                            </div>
                        </SectionCard>
                    </motion.div>

                    {/* 2. Standart Hesap Şifreleri */}
                    <motion.div variants={itemVariants}>
                        <SectionCard title={t('settings.accountPasswords') || 'Hesap Şifreleri'} icon={<FiShield className="text-sky-400" />}>
                            <div className="space-y-4">
                                <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
                                    {t('settings.accountPasswordsHint') || 'Standart hesapların şifrelerini buradan değiştirebilirsiniz.'}
                                </p>
                                {[
                                    { role: 'admin', label: 'Admin', defaultPw: 'admin123' },
                                    { role: 'cashier', label: 'Kasiyer', defaultPw: 'kasa123' },
                                    { role: 'waiter', label: 'Garson', defaultPw: 'garson123' },
                                    { role: 'kitchen', label: 'Mutfak', defaultPw: 'mutfak123' },
                                ].map((acc) => (
                                    <ChangePasswordRow key={acc.role} role={acc.role} label={acc.label} defaultPw={acc.defaultPw} />
                                ))}
                            </div>
                        </SectionCard>
                    </motion.div>

                    {/* 3. Commissions Ecosystem */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <motion.div variants={itemVariants}>
                            <SectionCard title={t('settings.setupComm')} icon={<FiPercent className="text-emerald-400" />}>
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-3">
                                        <InputGroup label={t('settings.resellerPct')} type="number" value={localSettings.reseller_setup_rate || 75} onChange={v => setLocalSettings({...localSettings, reseller_setup_rate: Number(v)})} />
                                        <InputGroup label={t('settings.systemPct')} type="number" value={localSettings.system_setup_rate || 25} onChange={v => setLocalSettings({...localSettings, system_setup_rate: Number(v)})} />
                                    </div>
                                    <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                                        <p className="text-[10px] text-emerald-400/70 font-bold uppercase tracking-tight leading-relaxed">{t('settings.setupHint')}</p>
                                    </div>
                                </div>
                            </SectionCard>
                        </motion.div>

                        <motion.div variants={itemVariants}>
                            <SectionCard title={t('settings.serviceShare')} icon={<FiClock className="text-blue-400" />}>
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-3">
                                        <InputGroup label={t('settings.resellerPct')} type="number" value={localSettings.reseller_monthly_rate || 50} onChange={v => setLocalSettings({...localSettings, reseller_monthly_rate: Number(v)})} />
                                        <InputGroup label={t('settings.systemPct')} type="number" value={localSettings.system_monthly_rate || 50} onChange={v => setLocalSettings({...localSettings, system_monthly_rate: Number(v)})} />
                                    </div>
                                    <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                                        <p className="text-[10px] text-blue-400/70 font-bold uppercase tracking-tight leading-relaxed">{t('settings.serviceHint')}</p>
                                    </div>
                                </div>
                            </SectionCard>
                        </motion.div>

                        <motion.div variants={itemVariants} className="md:col-span-2">
                            <SectionCard title={t('settings.addonTitle')} icon={<FiSmartphone className="text-amber-400" />}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                                    <div className="space-y-4 text-center md:text-left">
                                        <InputGroup label={t('settings.resellerAddonPct')} type="number" value={localSettings.reseller_addon_rate || 15} onChange={v => setLocalSettings({...localSettings, reseller_addon_rate: Number(v)})} />
                                        <p className="text-[10px] text-amber-400/70 font-black uppercase tracking-tight leading-relaxed px-1 font-mono italic">{t('settings.addonHint')}</p>
                                    </div>
                                    <div className="p-6 bg-gradient-to-br from-white/[0.02] to-transparent rounded-[32px] border border-white/5 flex flex-col items-center justify-center group hover:border-amber-500/20 transition-all">
                                        <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl mb-3 group-hover:scale-110 transition-transform"><FiZap size={20} /></div>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Performance Load</span>
                                        <span className="text-xl font-black text-white italic">0.12ms <span className="text-[10px] text-emerald-400 not-italic uppercase tracking-widest font-bold">Optimal</span></span>
                                    </div>
                                </div>
                            </SectionCard>
                        </motion.div>
                    </div>
                </div>

                {/* RIGHT COLUMN - Compliance & Master Plan */}
                <div className="xl:col-span-5 space-y-8">
                    <motion.div variants={itemVariants}>
                        <SectionCard title={t('settings.legalTitle')} icon={<FiShield className="text-rose-400" />}>
                            <div className="space-y-6">
                                <div className="p-8 bg-gradient-to-br from-rose-500/[0.08] to-transparent rounded-[40px] border border-rose-500/10 space-y-8 relative overflow-hidden group">
                                    <div className="absolute -top-10 -right-10 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity rotate-12">
                                        <FiShield size={200} />
                                    </div>
                                    
                                    <ToggleGroup 
                                        label={t('settings.legalTseEnabled')}
                                        active={localSettings.tse_enabled}
                                        onChange={v => setLocalSettings({...localSettings, tse_enabled: v})}
                                    />
                                    
                                    <div className="space-y-2">
                                        <SelectGroup 
                                            label={t('settings.legalFiscalProvider')} 
                                            value={localSettings.fiscal_provider || 'none'} 
                                            onChange={(v: string) => setLocalSettings({...localSettings, fiscal_provider: v})} 
                                            options={[
                                                { label: 'None / Global Basic', value: 'none' },
                                                { label: 'Fiskaly (DE/EU Cloud TSE)', value: 'fiskaly' },
                                                { label: 'SIGN DE (DE/Hardware TSE)', value: 'sign_de' },
                                                { label: 'DSFinV-K Direct Export', value: 'dsfinvk' }
                                            ]} 
                                        />
                                        <div className="flex justify-end pr-2">
                                            <span className="text-[8px] font-black text-rose-400/50 uppercase tracking-[0.1em] italic">Fiscal-compliant transaction logging active</span>
                                        </div>
                                    </div>

                                    <ToggleGroup 
                                        label={t('settings.legalDigitalReceipt')}
                                        active={localSettings.digital_receipt_enabled}
                                        onChange={(v: boolean) => setLocalSettings({...localSettings, digital_receipt_enabled: v})}
                                    />

                                    <div className="grid grid-cols-2 gap-4">
                                        <InputGroup 
                                            label={t('settings.legalArchiveYears')} 
                                            type="number" 
                                            value={localSettings.archive_retention_years || 10} 
                                            onChange={v => setLocalSettings({...localSettings, archive_retention_years: Number(v)})} 
                                        />
                                        <div className="flex flex-col justify-end pb-1 px-1">
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-tight">Regulatory Requirement: 10Y (DE)</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-white/[0.03] rounded-[32px] border border-white/5 flex gap-5 group hover:border-amber-500/20 transition-all">
                                    <div className="p-3.5 bg-amber-500/10 text-amber-500 rounded-2xl h-fit border border-amber-500/10 group-hover:scale-110 transition-transform"><FiAlertCircle size={24} /></div>
                                    <div>
                                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest block mb-1">Global Compliance Hint</span>
                                        <p className="text-[11px] text-slate-400 font-bold leading-relaxed">{t('settings.legalHint')}</p>
                                    </div>
                                </div>
                            </div>
                        </SectionCard>
                    </motion.div>

                    <motion.div variants={itemVariants} className="sticky bottom-8 h-fit">
                        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/30 to-indigo-600/30 blur-2xl rounded-[40px] opacity-0 group-hover:opacity-100 transition-opacity" />
                        <button 
                            type="submit" 
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white py-6 rounded-[32px] font-black shadow-2xl shadow-blue-900/40 flex items-center justify-center gap-4 active:scale-95 active:shadow-inner transition-all text-sm tracking-[0.2em] uppercase disabled:opacity-50 group border border-white/10 relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                            <FiSave size={24} className="group-hover:scale-110 group-hover:-rotate-12 transition-transform relative z-10" />
                            <span className="relative z-10">{t('settings.submit')}</span>
                        </button>
                    </motion.div>
                </div>
            </form>
            <ModernConfirmModal
                isOpen={!!confirm}
                onClose={() => setConfirm(null)}
                title={confirm?.title || ''}
                description={confirm?.description || ''}
                confirmText="ONAYLA"
                cancelText="VAZGEÇ"
                type="warning"
                onConfirm={() => confirm?.onConfirm()}
            />
        </motion.div>
    );
};

/** Bir tenant hesabının şifresini değiştirir */
const ChangePasswordRow: React.FC<{ role: string; label: string; defaultPw: string }> = ({ role, label, defaultPw }) => {
    const { tenants, token } = useSaaSStore();
    const tenant = tenants[0] ?? null;
    const [showForm, setShowForm] = useState(false);
    const [newPw, setNewPw] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPw || newPw.length < 6) { setMsg({ ok: false, text: 'Min 6 karakter' }); return; }
        if (!tenant?.schema_name || !token) return;
        setBusy(true);
        try {
            const res = await fetch('/api/v1/tenants/change-user-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ schema_name: tenant.schema_name, username: role, new_password: newPw }),
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ ok: true, text: 'Şifre değiştirildi!' });
                setNewPw('');
                setShowForm(false);
            } else {
                setMsg({ ok: false, text: data.error || 'Hata' });
            }
        } catch { setMsg({ ok: false, text: 'Bağlantı hatası' }); }
        finally { setBusy(false); }
    };

    return (
        <div className="bg-white/[0.03] rounded-2xl border border-white/5 p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-sky-500/10 text-sky-400 rounded-xl"><FiKey size={14} /></div>
                    <div>
                        <span className="text-xs font-bold text-slate-300">{label}</span>
                        <span className="text-[10px] text-slate-600 font-mono ml-2">{role}</span>
                        <p className="text-[10px] text-slate-600">Varsayılan: <span className="font-mono">{defaultPw}</span></p>
                    </div>
                </div>
                {!showForm ? (
                    <button onClick={() => setShowForm(true)} className="px-3 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-[10px] font-black uppercase text-sky-400 hover:bg-sky-500/20 transition-all">
                        Değiştir
                    </button>
                ) : (
                    <form onSubmit={handleSave} className="flex items-center gap-2">
                        <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Yeni şifre" minLength={6}
                            className="w-28 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/30" />
                        <button disabled={busy} type="submit" className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-black uppercase text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-40">
                            {busy ? '...' : 'Kaydet'}
                        </button>
                        <button type="button" onClick={() => { setShowForm(false); setNewPw(''); setMsg(null); }} className="px-2 py-1.5 text-[10px] text-slate-500 hover:text-slate-300">
                            İptal
                        </button>
                    </form>
                )}
            </div>
            {msg && (
                <div className={`mt-2 text-[10px] font-bold ${msg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{msg.text}</div>
            )}
        </div>
    );
};
