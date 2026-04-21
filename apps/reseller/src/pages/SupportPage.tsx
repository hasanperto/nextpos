import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useResellerStore } from '../store/useResellerStore.ts';
import { messages } from '../i18n/messages.ts';
import { EmptyState } from '../components/Shared.tsx';

type TicketMessage = {
    id: number;
    sender_type?: string;
    sender_name?: string;
    message?: string;
    created_at?: string;
};

export function SupportPage() {
    const { lang, supportTickets, fetchSupportTickets, token, tenants, fetchTenants } = useResellerStore();
    const t = (k: string) => messages[lang][k] || k;
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
                toast.error(json.error || t('support.createErr'));
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
        high: 'bg-red-500/10 text-red-400',
        medium: 'bg-orange-500/10 text-orange-400',
        low: 'bg-slate-500/10 text-slate-400',
    };

    return (
        <div className="space-y-6 animate-in">
            <p className="text-slate-500 text-sm">{t('support.subtitle')}</p>

            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 space-y-3">
                <h3 className="text-xs font-black text-white uppercase tracking-widest">{t('support.createTitle')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">{t('support.tenantSelect')}</label>
                        <select
                            value={newTenantId}
                            onChange={(e) => setNewTenantId(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                        >
                            <option value="">{t('support.tenantPlatform')}</option>
                            {tenants.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">{t('support.priority')}</label>
                        <select
                            value={newPriority}
                            onChange={(e) => setNewPriority(e.target.value as 'low' | 'medium' | 'high')}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                        >
                            <option value="low">low</option>
                            <option value="medium">medium</option>
                            <option value="high">high</option>
                        </select>
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">{t('support.subject')}</label>
                    <input
                        value={newSubject}
                        onChange={(e) => setNewSubject(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">{t('support.message')}</label>
                    <textarea
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        rows={3}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                    />
                </div>
                <button
                    type="button"
                    disabled={busy || !newSubject.trim() || !newMessage.trim()}
                    onClick={() => void createTicket()}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-black text-white"
                >
                    {t('support.newTicket')}
                </button>
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
