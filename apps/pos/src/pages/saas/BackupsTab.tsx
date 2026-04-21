import React, { useEffect, useState } from 'react';
import { 
    FiShield, FiDownload, FiRefreshCcw, FiPlay, 
    FiCheckCircle, FiAlertCircle, FiDatabase, FiHardDrive 
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { StatCard, SectionCard, EmptyState } from './SaaSShared';

export const BackupsTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const { 
        backups, tenants, isLoading: _isLoading, 
        fetchBackups, createBackup, createTenantBackup 
    } = useSaaSStore();

    const [restoringId, setRestoringId] = useState<number | null>(null);
    const [isGlobalBackupLoading, setIsGlobalBackupLoading] = useState(false);

    useEffect(() => { 
        fetchBackups(); 
    }, []);

    const handleRestore = (id: number) => {
        setRestoringId(id);
        // Simulate restore delay
        setTimeout(() => {
            setRestoringId(null);
            toast.success(t('backup.restoreDone'));
        }, 3000);
    };

    const handleGlobalBackup = async () => {
        setIsGlobalBackupLoading(true);
        const ok = await createBackup();
        if (ok) setIsGlobalBackupLoading(false);
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            {/* 1. Backup Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label={t('backup.statTotal')} value={backups.length} icon={<FiDatabase />} color="blue" />
                <StatCard label={t('backup.statDisk')} value={`${(backups.reduce((s, b) => s + Number(b.size), 0) / 1024 / 1024).toFixed(1)} MB`} icon={<FiHardDrive />} color="indigo" />
                <StatCard label={t('backup.statLastOk')} value={t('backup.statLastValue')} icon={<FiCheckCircle />} color="emerald" sub={t('backup.statLastSub')} />
                <StatCard label={t('backup.statCritical')} value="0" icon={<FiAlertCircle />} color="slate" />
            </div>

            {/* 2. Backup Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SectionCard 
                    title={t('backup.quickTitle')} 
                    icon={<FiRefreshCcw className="text-blue-400" />}
                >
                    <div className="space-y-4">
                        <div className="p-4 bg-slate-900/50 rounded-2xl border border-white/5 flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-bold text-white">{t('backup.globalTitle')}</h4>
                                <p className="text-[10px] text-slate-500 mt-1">{t('backup.globalDesc')}</p>
                            </div>
                            <button 
                                type="button"
                                onClick={handleGlobalBackup}
                                disabled={isGlobalBackupLoading}
                                className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${isGlobalBackupLoading ? 'bg-slate-700 text-slate-500' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'}`}
                            >
                                {isGlobalBackupLoading ? t('backup.globalRunning') : t('backup.globalStart')}
                            </button>
                        </div>

                        <div className="p-4 bg-slate-900/50 rounded-2xl border border-white/5">
                            <h4 className="text-sm font-bold text-white">{t('backup.tenantTitle')}</h4>
                            <p className="text-[10px] text-slate-500 mt-1 mb-4">{t('backup.tenantDesc')}</p>
                            <div className="flex gap-2">
                                <select className="flex-1 bg-slate-800 rounded-xl px-3 py-2 text-xs text-white border border-white/5 outline-none" id="tenant-backup-select">
                                    <option value="">{t('backup.selectTenant')}</option>
                                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                <button 
                                    type="button"
                                    onClick={() => {
                                        const sel = document.getElementById('tenant-backup-select') as HTMLSelectElement;
                                        if (sel.value) createTenantBackup(sel.value);
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-black uppercase shadow-lg shadow-emerald-600/20 transition-all"
                                >
                                    {t('backup.pack')}
                                </button>
                            </div>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard title={t('backup.policyTitle')} icon={<FiShield className="text-indigo-400" />}>
                     <div className="space-y-4">
                        {[
                            { label: t('backup.policy.auto'), status: t('backup.policy.autoVal') },
                            { label: t('backup.policy.retention'), status: t('backup.policy.retentionVal') },
                            { label: t('backup.policy.cloud'), status: t('backup.policy.cloudVal') },
                            { label: t('backup.policy.enc'), status: t('backup.policy.active') }
                        ].map((p, i) => (
                            <div key={i} className="flex justify-between items-center p-3 bg-black/20 rounded-xl border border-white/[0.03]">
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{p.label}</span>
                                <span className="text-[10px] font-black text-indigo-400 uppercase">{p.status}</span>
                            </div>
                        ))}
                     </div>
                </SectionCard>
            </div>

            {/* 3. Backup History Table */}
            <SectionCard title={t('backup.archiveTitle')} icon={<FiDatabase className="text-emerald-400" />}>
                <div className="overflow-x-auto -mx-6">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] border-b border-white/5">
                                <th className="px-6 py-4">{t('backup.table.file')}</th>
                                <th className="px-6 py-4">{t('backup.table.size')}</th>
                                <th className="px-6 py-4">{t('backup.table.type')}</th>
                                <th className="px-6 py-4">{t('backup.table.source')}</th>
                                <th className="px-6 py-4">{t('backup.table.date')}</th>
                                <th className="px-6 py-4 text-right">{t('backup.table.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {backups.length > 0 ? backups.map(b => (
                                <tr key={b.id} className="hover:bg-blue-500/[0.03] transition-colors group">
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg"><FiDatabase /></div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-sm text-white">{b.filename}</span>
                                                <span className="text-[9px] text-slate-500 font-mono">HASH: {String(b.id).slice(0, 16)}...</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 text-sm font-medium text-slate-300">{(Number(b.size) / 1024 / 1024).toFixed(2)} MB</td>
                                    <td className="px-6 py-5">
                                        <span className={`text-[10px] font-black px-2 py-1 rounded-md border ${
                                            b.backup_type === 'full' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 
                                            'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                        } uppercase`}>
                                            {b.backup_type || 'full'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-5 text-xs text-blue-400 font-bold uppercase">{b.created_by || 'SYSTEM'}</td>
                                    <td className="px-6 py-5">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-medium text-slate-300">{new Date(b.created_at).toLocaleDateString()}</span>
                                            <span className="text-[10px] text-slate-500 font-mono">{new Date(b.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                type="button"
                                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                                                title={t('backup.download')}
                                                aria-label={t('backup.download')}
                                            >
                                                <FiDownload size={14} />
                                            </button>
                                            <button 
                                                onClick={() => handleRestore(b.id)}
                                                disabled={restoringId !== null}
                                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border ${
                                                    restoringId === b.id ? 'bg-amber-600 text-white border-amber-500' : 'bg-amber-600/10 text-amber-500 hover:bg-amber-600 hover:text-white border-amber-500/20'
                                                }`}
                                            >
                                                {restoringId === b.id ? <FiRefreshCcw className="animate-spin" /> : <FiPlay />} 
                                                {restoringId === b.id ? t('backup.restoring') : t('backup.restore')}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12">
                                        <EmptyState icon={<FiShield />} message={t('backup.empty')} />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </SectionCard>
        </div>
    );
};
