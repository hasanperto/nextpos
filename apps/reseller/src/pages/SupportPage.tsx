import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
    FiMessageSquare,
    FiHome,
    FiFlag,
    FiType,
    FiSend,
    FiPlusCircle,
    FiChevronDown,
    FiAlertCircle,
    FiMinusCircle,
} from 'react-icons/fi';
import { useResellerStore } from '../store/useResellerStore.ts';
import { messages } from '../i18n/messages.ts';
import { translateApiError } from '../i18n/translateApiError.ts';
import { EmptyState } from '../components/Shared.tsx';

type TicketMessage = {
    id: number;
    sender_type?: string;
    sender_name?: string;
    message?: string;
    created_at?: string;
};

export function SupportPage() {
    const lang = useResellerStore(s => s.lang);
    const supportTickets = useResellerStore(s => s.supportTickets);
    const fetchSupportTickets = useResellerStore(s => s.fetchSupportTickets);
    const token = useResellerStore(s => s.token);
    const tenants = useResellerStore(s => s.tenants);
    const fetchTenants = useResellerStore(s => s.fetchTenants);
    const t = (k: string) => messages[lang]?.[k] || messages['de']?.[k] || messages['en']?.[k] || messages['tr']?.[k] || k;
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [messagesList, setMessagesList] = useState<TicketMessage[]>([]);
    const [reply, setReply] = useState('');
    const [busy, setBusy] = useState(false);
    const [newSubject, setNewSubject] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [newTenantId, setNewTenantId] = useState('');
    const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');

    useEffect(() => {
        fetchSupportTickets();
        fetchTenants();
    }, [fetchSupportTickets, fetchTenants]);

    const createTicket = async () => {
        if (!token || !newSubject.trim() || !newMessage.trim()) return;
        setBusy(true);
        try {
            const body: Record<string, unknown> = {
                subject: newSubject.trim(),
                message: newMessage.trim(),
                priority: newPriority,
            };
            if (newTenantId.trim()) body.tenant_id = newTenantId.trim();
            const res = await fetch('/api/v1/tenants/support/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) {
                toast.error(translateApiError(json.error, (json as { code?: string }).code, lang) || t('support.createErr'));
                return;
            }
            toast.success(t('support.createOk'));
            setNewSubject('');
            setNewMessage('');
            setNewTenantId('');
            setNewPriority('medium');
            await fetchSupportTickets();
        } catch {
            toast.error(t('support.createErr'));
        } finally {
            setBusy(false);
        }
    };

    const loadMessages = async (ticketId: number) => {
        if (!token) return;
        try {
            const res = await fetch(`/api/v1/tenants/support/tickets/${ticketId}/messages`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                setMessagesList([]);
                return;
            }
            const rows = await res.json();
            setMessagesList(Array.isArray(rows) ? rows : []);
        } catch {
            setMessagesList([]);
        }
    };

    const selectTicket = (id: number) => {
        setSelectedId(id);
        void loadMessages(id);
    };

    const updateStatus = async (id: number, status: 'open' | 'in_progress' | 'waiting' | 'closed') => {
        if (!token) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/v1/tenants/system/tickets/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) {
                toast.error(json.error || 'Durum güncellenemedi');
                return;
            }
            toast.success('Destek durumu güncellendi');
            await fetchSupportTickets();
        } catch {
            toast.error('Durum güncellenemedi');
        } finally {
            setBusy(false);
        }
    };

    const sendReply = async () => {
        if (!token || !selectedId || !reply.trim()) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/v1/tenants/support/tickets/${selectedId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ message: reply.trim() }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) {
                toast.error(json.error || 'Yanıt gönderilemedi');
                return;
            }
            setReply('');
            await loadMessages(selectedId);
            toast.success('Yanıt gönderildi');
        } catch {
            toast.error('Yanıt gönderilemedi');
        } finally {
            setBusy(false);
        }
    };

    const priorityCls: Record<string, string> = {
        high: 'bg-red-500/10 text-red-400 border-red-500/30',
        medium: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
        low: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    };

    const priorityLabel = (p: 'low' | 'medium' | 'high') => {
        if (p === 'high') return t('support.priorityHigh');
        if (p === 'low') return t('support.priorityLow');
        return t('support.priorityMedium');
    };

    const fieldClass =
        'w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/40 focus:ring-2 focus:ring-blue-500/20 transition-all';

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/25 flex items-center justify-center text-blue-400 shrink-0">
                    <FiMessageSquare size={18} />
                </div>
                <div>
                    <h2 className="text-lg font-black text-white tracking-tight">{t('support.title')}</h2>
                    <p className="text-slate-500 text-sm mt-0.5">{t('support.subtitle')}</p>
                </div>
            </div>

            <div className="rounded-2xl sm:rounded-[24px] border border-white/10 bg-slate-900/40 backdrop-blur-xl overflow-hidden shadow-2xl shadow-black/20">
                <div className="px-4 sm:px-6 py-4 border-b border-white/5 bg-gradient-to-r from-blue-600/10 via-transparent to-violet-600/5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-300">
                        <FiPlusCircle size={18} />
                    </div>
                    <div>
                        <h3 className="text-xs font-black text-white uppercase tracking-widest">{t('support.createTitle')}</h3>
                        <p className="text-[10px] text-slate-500 mt-0.5 font-medium">{t('support.createDesc')}</p>
                    </div>
                </div>

                <div className="p-4 sm:p-6 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider flex items-center gap-1.5">
                                <FiHome size={11} className="text-blue-400" />
                                {t('support.tenantSelect')}
                            </label>
                            <div className="relative">
                                <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={14} />
                                <select
                                    value={newTenantId}
                                    onChange={(e) => setNewTenantId(e.target.value)}
                                    className={`${fieldClass} appearance-none cursor-pointer`}
                                >
                                    <option value="">{t('support.tenantPlatform')}</option>
                                    {tenants.map((r) => (
                                        <option key={r.id} value={r.id}>
                                            {r.name}
                                        </option>
                                    ))}
                                </select>
                                <FiHome className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={14} />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider flex items-center gap-1.5">
                                <FiFlag size={11} className="text-orange-400" />
                                {t('support.priority')}
                            </label>
                            <div className="flex gap-2 p-1 bg-black/20 border border-white/10 rounded-xl">
                                {(['low', 'medium', 'high'] as const).map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => setNewPriority(p)}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-black uppercase transition-all border ${
                                            newPriority === p
                                                ? priorityCls[p] + ' shadow-lg'
                                                : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'
                                        }`}
                                    >
                                        {p === 'high' ? <FiAlertCircle size={12} /> : p === 'low' ? <FiMinusCircle size={12} /> : <FiFlag size={12} />}
                                        {priorityLabel(p)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider flex items-center gap-1.5">
                            <FiType size={11} className="text-violet-400" />
                            {t('support.subject')}
                        </label>
                        <div className="relative">
                            <FiType className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={14} />
                            <input
                                value={newSubject}
                                onChange={(e) => setNewSubject(e.target.value)}
                                placeholder={t('support.subjectPlaceholder')}
                                className={fieldClass}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider flex items-center gap-1.5">
                            <FiMessageSquare size={11} className="text-emerald-400" />
                            {t('support.message')}
                        </label>
                        <div className="relative">
                            <FiMessageSquare className="absolute left-3 top-3 text-slate-500 pointer-events-none" size={14} />
                            <textarea
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                rows={4}
                                placeholder={t('support.messagePlaceholder')}
                                className={`${fieldClass} min-h-[100px] resize-y pt-2.5`}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:justify-end pt-1 border-t border-white/5">
                        <button
                            type="button"
                            disabled={busy || !newSubject.trim() || !newMessage.trim()}
                            onClick={() => void createTicket()}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-black text-white uppercase tracking-wider shadow-xl shadow-blue-600/25 active:scale-[0.98] transition-all"
                        >
                            <FiSend size={14} />
                            {busy ? '…' : t('support.newTicket')}
                        </button>
                    </div>
                </div>
            </div>

            {supportTickets.length === 0 ? (
                <EmptyState text={t('support.noData')} />
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div className="xl:col-span-2 overflow-x-auto rounded-2xl border border-white/5">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-white/5 text-[10px] text-slate-500 uppercase tracking-widest font-black">
                                    <th className="px-4 py-3 text-left">{t('support.restaurant')}</th>
                                    <th className="px-4 py-3 text-left">{t('support.subject')}</th>
                                    <th className="px-4 py-3 text-center">{t('support.priority')}</th>
                                    <th className="px-4 py-3 text-center">{t('rest.status')}</th>
                                    <th className="px-4 py-3 text-center">{t('support.date')}</th>
                                    <th className="px-4 py-3 text-center">İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {supportTickets.map((tk) => (
                                    <tr key={tk.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                        <td className="px-4 py-3 font-bold text-white">{(tk as { tenant_name?: string }).tenant_name || '—'}</td>
                                        <td className="px-4 py-3 text-slate-300">{(tk as { subject?: string }).subject || '—'}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${priorityCls[tk.priority] || priorityCls.low}`}>
                                                {tk.priority}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span
                                                className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${
                                                    tk.status === 'open' || tk.status === 'in_progress' || tk.status === 'waiting'
                                                        ? 'bg-orange-500/10 text-orange-400'
                                                        : 'bg-emerald-500/10 text-emerald-400'
                                                }`}
                                            >
                                                {tk.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center text-slate-500">
                                            {tk.created_at ? new Date(tk.created_at).toLocaleDateString('tr-TR') : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                type="button"
                                                onClick={() => selectTicket(tk.id)}
                                                className="px-2 py-1 rounded-lg border border-blue-500/30 text-blue-300 hover:bg-blue-500/10"
                                            >
                                                {t('support.openTicket')}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 space-y-3">
                        {!selectedId ? (
                            <p className="text-slate-500 text-xs">{t('support.selectTicket')}</p>
                        ) : (
                            <>
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-black text-white">Ticket #{selectedId}</p>
                                    <select
                                        disabled={busy}
                                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white"
                                        onChange={(e) => void updateStatus(selectedId, e.target.value as 'open' | 'in_progress' | 'waiting' | 'closed')}
                                        defaultValue=""
                                    >
                                        <option value="" disabled>{t('support.changeStatus')}</option>
                                        <option value="open">open</option>
                                        <option value="in_progress">in_progress</option>
                                        <option value="waiting">waiting</option>
                                        <option value="closed">closed</option>
                                    </select>
                                </div>

                                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                                    {messagesList.length === 0 ? (
                                        <p className="text-slate-500 text-xs">{t('support.noMessages')}</p>
                                    ) : (
                                        messagesList.map((m) => (
                                            <div key={m.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <span className="text-[10px] text-blue-300 font-bold uppercase">{m.sender_name || m.sender_type || 'user'}</span>
                                                    <span className="text-[10px] text-slate-500">{m.created_at ? new Date(m.created_at).toLocaleString('tr-TR') : ''}</span>
                                                </div>
                                                <p className="text-xs text-slate-200 whitespace-pre-wrap">{m.message || ''}</p>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <textarea
                                        value={reply}
                                        onChange={(e) => setReply(e.target.value)}
                                        rows={3}
                                        placeholder={t('support.replyPlaceholder')}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => void sendReply()}
                                        disabled={busy || !reply.trim()}
                                        className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-black text-white"
                                    >
                                        {t('support.sendReply')}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
