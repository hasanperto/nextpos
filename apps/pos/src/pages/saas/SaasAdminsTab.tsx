import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiRefreshCw, FiKey, FiToggleLeft, FiToggleRight, FiUsers } from 'react-icons/fi';
import { useSaaSStore, type SaasAdminRow } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { SectionCard, Modal, InputGroup } from './SaaSShared';
import { motion } from 'framer-motion';

export const SaasAdminsTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const { saasAdmins, fetchSaasAdmins, patchSaasAdminActive, resetSaasAdminPassword, admin } = useSaaSStore();
    const [loading, setLoading] = useState(false);
    const [pwRow, setPwRow] = useState<SaasAdminRow | null>(null);
    const [pw1, setPw1] = useState('');
    const [pw2, setPw2] = useState('');
    const [pwBusy, setPwBusy] = useState(false);

    const selfId = admin?.id != null ? Number(admin.id) : null;

    const load = async () => {
        setLoading(true);
        await fetchSaasAdmins();
        setLoading(false);
    };

    useEffect(() => {
        void load();
    }, []);

    const toggleActive = async (row: SaasAdminRow) => {
        const next = !row.is_active;
        if (!next && row.id === selfId) {
            toast.error(t('saasUsers.errSelfDeactivate'));
            return;
        }
        const msg = next
            ? t('saasUsers.confirmActivate', { name: row.username })
            : t('saasUsers.confirmDeactivate', { name: row.username });
        if (!window.confirm(msg)) return;
        const ok = await patchSaasAdminActive(row.id, next);
        if (ok) toast.success(next ? t('saasUsers.okActive') : t('saasUsers.okInactive'));
        else toast.error(useSaaSStore.getState().error || t('saasUsers.errToggle'));
    };

    const submitPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pwRow) return;
        if (pw1.length < 8) {
            toast.error(t('saasUsers.errPwShort'));
            return;
        }
        if (pw1 !== pw2) {
            toast.error(t('saasUsers.errPwMismatch'));
            return;
        }
        setPwBusy(true);
        const ok = await resetSaasAdminPassword(pwRow.id, pw1);
        setPwBusy(false);
        if (ok) {
            toast.success(t('saasUsers.okPw'));
            setPwRow(null);
            setPw1('');
            setPw2('');
        } else {
            toast.error(useSaaSStore.getState().error || t('saasUsers.errPw'));
        }
    };

    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <SectionCard title={t('tab.saasUsers')} icon={<FiUsers className="text-blue-400" />}>
                <p className="text-xs text-slate-500 mb-4">{t('saasUsers.subtitle')}</p>
                <div className="flex justify-end mb-4">
                    <button
                        type="button"
                        onClick={() => void load()}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:bg-white/10 disabled:opacity-50"
                    >
                        <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        {t('saasUsers.refresh')}
                    </button>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-white/5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            <tr>
                                <th className="p-3">{t('saasUsers.colId')}</th>
                                <th className="p-3">{t('saasUsers.colUser')}</th>
                                <th className="p-3">{t('saasUsers.colRole')}</th>
                                <th className="p-3">{t('saasUsers.colActive')}</th>
                                <th className="p-3">{t('saasUsers.colLastLogin')}</th>
                                <th className="p-3 text-right">{t('saasUsers.colActions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {saasAdmins.length === 0 && !loading ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-slate-500">
                                        {t('saasUsers.empty')}
                                    </td>
                                </tr>
                            ) : (
                                saasAdmins.map((row) => (
                                    <tr key={row.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                                        <td className="p-3 font-mono text-slate-400">{row.id}</td>
                                        <td className="p-3">
                                            <div className="font-bold text-slate-200">{row.username}</div>
                                            <div className="text-[10px] text-slate-500">{row.full_name || row.email || '—'}</div>
                                        </td>
                                        <td className="p-3">
                                            <span className="px-2 py-0.5 rounded-lg bg-white/5 text-slate-300">{row.role}</span>
                                        </td>
                                        <td className="p-3">
                                            <button
                                                type="button"
                                                onClick={() => void toggleActive(row)}
                                                className="text-slate-400 hover:text-white transition-colors"
                                                title={row.is_active ? t('saasUsers.deactivate') : t('saasUsers.activate')}
                                            >
                                                {row.is_active ? <FiToggleRight size={22} className="text-emerald-400" /> : <FiToggleLeft size={22} />}
                                            </button>
                                        </td>
                                        <td className="p-3 text-slate-500 whitespace-nowrap">
                                            {row.last_login ? new Date(row.last_login).toLocaleString('tr-TR') : '—'}
                                        </td>
                                        <td className="p-3 text-right">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setPwRow(row);
                                                    setPw1('');
                                                    setPw2('');
                                                }}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-200 border border-amber-500/25 text-[10px] font-black uppercase hover:bg-amber-500/25"
                                            >
                                                <FiKey size={12} />
                                                {t('saasUsers.resetPw')}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </SectionCard>

            {pwRow && (
                <Modal show={!!pwRow} title={t('saasUsers.pwModalTitle', { user: pwRow.username })} onClose={() => setPwRow(null)} maxWidth="max-w-md">
                    <form onSubmit={submitPassword} className="space-y-4">
                        <p className="text-xs text-slate-500">{t('saasUsers.pwModalHint')}</p>
                        <InputGroup label={t('saasUsers.pwNew')} type="password" value={pw1} onChange={setPw1} placeholder="••••••••" />
                        <InputGroup label={t('saasUsers.pwRepeat')} type="password" value={pw2} onChange={setPw2} placeholder="••••••••" />
                        <div className="flex justify-end gap-2 pt-2">
                            <button type="button" onClick={() => setPwRow(null)} className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:bg-white/5">
                                {t('tenantEdit.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={pwBusy}
                                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black uppercase disabled:opacity-50"
                            >
                                {pwBusy ? '…' : t('saasUsers.pwSave')}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </motion.div>
    );
};
