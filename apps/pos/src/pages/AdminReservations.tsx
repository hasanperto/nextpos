import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiCalendar, FiPlus, FiRefreshCcw, FiTrash2, FiUser, FiPhone, FiUsers, FiMapPin, FiFileText, FiActivity } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { useNavigate } from 'react-router-dom';
import { ModernConfirmModal } from '../features/terminal/components/ModernConfirmModal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';

type Reservation = {
    id: number;
    table_id: number | null;
    table_name?: string | null;
    section_name?: string | null;
    customer_name: string;
    phone?: string | null;
    guest_count: number;
    reservation_at: string;
    notes?: string | null;
    status: 'reserved' | 'seated' | 'cancelled' | 'no_show';
};

type TableRow = {
    id: number;
    name: string;
    section_name?: string;
};

const statusKeys: Reservation['status'][] = ['reserved', 'seated', 'cancelled', 'no_show'];

export const AdminReservations: React.FC = () => {
    const navigate = useNavigate();
    const { getAuthHeaders, logout } = useAuthStore();
    const { t } = usePosLocale();
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<Reservation[]>([]);
    const [tables, setTables] = useState<TableRow[]>([]);
    const [locked, setLocked] = useState(false);
    const [confirm, setConfirm] = useState<null | { title: string; description: string; onConfirm: () => void }>(null);
    const [filterStatus, setFilterStatus] = useState<'all' | Reservation['status']>('all');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
    const [form, setForm] = useState({
        customer_name: '',
        phone: '',
        guest_count: 2,
        reservation_at: `${new Date().toISOString().slice(0, 10)}T19:00`,
        table_id: '',
        notes: '',
    });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const headers = getAuthHeaders();
            const [resvRes, tableRes] = await Promise.all([
                fetch(
                    `/api/v1/admin/reservations?from=${encodeURIComponent(selectedDate)}&to=${encodeURIComponent(selectedDate)}${
                        filterStatus === 'all' ? '' : `&status=${encodeURIComponent(filterStatus)}`
                    }`,
                    { headers }
                ),
                fetch('/api/v1/tables', { headers }),
            ]);
            if (resvRes.status === 401 || tableRes.status === 401) {
                logout();
                return;
            }
            const tableData = tableRes.ok ? await tableRes.json() : [];
            if (resvRes.status === 403) {
                setLocked(true);
                setRows([]);
                setTables(Array.isArray(tableData) ? tableData : []);
                return;
            }
            setLocked(false);
            const resvData = resvRes.ok ? await resvRes.json() : [];
            setRows(Array.isArray(resvData) ? resvData : []);
            setTables(Array.isArray(tableData) ? tableData : []);
        } finally {
            setLoading(false);
        }
    }, [filterStatus, getAuthHeaders, logout, selectedDate]);

    useEffect(() => {
        void load();
    }, [load]);

    const tenantId = useAuthStore(s => s.tenantId);
    useEffect(() => {
        if (!tenantId) return;
        import('socket.io-client').then(({ io }) => {
            const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
            socket.on('connect', () => {
                socket.emit('join:tenant', tenantId);
            });
            const handleUpdate = () => {
                void load();
            };
            socket.on('reservations:updated', handleUpdate);
            socket.on('tables:updated', handleUpdate);
            return () => {
                socket.disconnect();
            };
        });
    }, [tenantId, load]);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/v1/admin/reservations', {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customer_name: form.customer_name,
                phone: form.phone || null,
                guest_count: Number(form.guest_count) || 1,
                reservation_at: new Date(form.reservation_at).toISOString(),
                table_id: form.table_id ? Number(form.table_id) : null,
                notes: form.notes || null,
                status: 'reserved',
            }),
        });
        if (res.status === 403) {
            setLocked(true);
            return;
        }
        if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            toast.error((j as { error?: string }).error || t('admin.reservations.saveError'));
            return;
        }
        setForm({
            customer_name: '',
            phone: '',
            guest_count: 2,
            reservation_at: `${selectedDate}T19:00`,
            table_id: '',
            notes: '',
        });
        await load();
    };

    const updateStatus = async (id: number, status: Reservation['status']) => {
        const res = await fetch(`/api/v1/admin/reservations/${id}`, {
            method: 'PUT',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        if (res.status === 403) {
            setLocked(true);
            return;
        }
        if (res.ok) void load();
    };

    const remove = async (id: number) => {
        setConfirm({
            title: t('admin.reservations.deleteTitle'),
            description: t('admin.reservations.deleteConfirm'),
            onConfirm: () => {
                void (async () => {
                    const res = await fetch(`/api/v1/admin/reservations/${id}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders(),
                    });
                    if (res.status === 403) {
                        setLocked(true);
                        return;
                    }
                    if (!res.ok) {
                        const j = await res.json().catch(() => ({}));
                        toast.error(j.error || t('admin.reservations.deleteError'));
                        return;
                    }
                    toast.success(t('admin.reservations.deleted'));
                    void load();
                })();
            },
        });
    };

    const metrics = useMemo(() => {
        const reserved = rows.filter((r) => r.status === 'reserved').length;
        const seated = rows.filter((r) => r.status === 'seated').length;
        const cancelled = rows.filter((r) => r.status === 'cancelled' || r.status === 'no_show').length;
        return { reserved, seated, cancelled };
    }, [rows]);

    const statusLabel = useCallback((status: Reservation['status']) => {
        switch (status) {
            case 'reserved':
                return t('admin.reservations.status.reserved');
            case 'seated':
                return t('admin.reservations.status.seated');
            case 'cancelled':
                return t('admin.reservations.status.cancelled');
            case 'no_show':
                return t('admin.reservations.status.no_show');
        }
    }, [t]);

    const tableOptions = useMemo(
        () => [
            { v: '', l: t('admin.reservations.field.table') },
            ...tables.map((tbl) => ({
                v: String(tbl.id),
                l: tbl.section_name ? `${tbl.name} (${tbl.section_name})` : tbl.name,
            })),
        ],
        [tables, t],
    );

    if (locked) {
        return (
            <div className="p-6">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <div className="mb-2 text-sm font-black text-white">{t('modules.locked.title')}</div>
                    <div className="mb-4 text-xs font-semibold text-slate-400">{t('modules.locked.reservation.desc')}</div>
                    <button
                        type="button"
                        onClick={() => navigate('/admin/settings', { replace: true })}
                        className="rounded-xl border border-violet-500/40 bg-violet-600/30 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-violet-100 hover:bg-violet-600/50 transition-all"
                    >
                        {t('modules.locked.cta')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#020617] text-slate-100 font-sans relative">
            {/* Ambient glows */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[20%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[150px]" />
            </div>

            <header className="flex flex-col md:flex-row gap-4 md:h-24 shrink-0 md:items-center justify-between border-b border-white/5 bg-[#0f172a]/95 backdrop-blur-md p-4 md:px-8 z-10">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-blue-600/10 border border-blue-500/35 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                        <FiCalendar size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white uppercase italic tracking-tight">{t('admin.reservations.title')}</h2>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{t('admin.reservations.subtitle')}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => void load()}
                    className="p-3.5 bg-white/5 border border-white/10 rounded-2xl text-slate-400 hover:bg-white/10 transition-all cursor-pointer"
                    aria-label={t('admin.reservations.refresh')}
                    title={t('admin.reservations.refresh')}
                >
                    <FiRefreshCcw className={loading ? 'animate-spin' : ''} size={16} />
                </button>
            </header>

            <div className="flex-1 overflow-auto p-4 md:p-8 space-y-6 z-10">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    <div className="bg-white/[0.02] border border-blue-500/15 backdrop-blur-md p-6 rounded-[28px] shadow-2xl flex flex-col justify-between relative group">
                        <p className="text-[9px] font-black uppercase tracking-widest text-blue-400 mb-2">{t('admin.reservations.metric.pending')}</p>
                        <p className="text-3xl font-black text-white">{metrics.reserved}</p>
                    </div>
                    <div className="bg-white/[0.02] border border-emerald-500/15 backdrop-blur-md p-6 rounded-[28px] shadow-2xl flex flex-col justify-between relative group">
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-2">{t('admin.reservations.metric.seated')}</p>
                        <p className="text-3xl font-black text-white">{metrics.seated}</p>
                    </div>
                    <div className="bg-white/[0.02] border border-rose-500/15 backdrop-blur-md p-6 rounded-[28px] shadow-2xl flex flex-col justify-between relative group">
                        <p className="text-[9px] font-black uppercase tracking-widest text-rose-400 mb-2">{t('admin.reservations.metric.cancelled')}</p>
                        <p className="text-3xl font-black text-white">{metrics.cancelled}</p>
                    </div>
                </div>

                <form onSubmit={save} className="grid grid-cols-1 gap-4 rounded-[2rem] border border-white/5 bg-white/[0.02] backdrop-blur-md p-6 shadow-2xl lg:grid-cols-6 items-end relative z-10">
                    <Input
                        required
                        placeholder={t('admin.reservations.field.customerName')}
                        value={form.customer_name}
                        onChange={(val) => setForm((f) => ({ ...f, customer_name: val }))}
                        icon={<FiUser />}
                        className="bg-white/5 border border-white/10 text-white rounded-xl focus:border-indigo-500 text-xs"
                    />
                    <Input
                        placeholder={t('admin.reservations.field.phone')}
                        value={form.phone}
                        onChange={(val) => setForm((f) => ({ ...f, phone: val }))}
                        icon={<FiPhone />}
                        mask="phone"
                        className="bg-white/5 border border-white/10 text-white rounded-xl focus:border-indigo-500 text-xs"
                    />
                    <Input
                        type="number"
                        min={1}
                        placeholder={t('admin.reservations.field.guestCount')}
                        value={form.guest_count}
                        onChange={(val) => setForm((f) => ({ ...f, guest_count: Number(val) || 1 }))}
                        icon={<FiUsers />}
                        mask="number"
                        className="bg-white/5 border border-white/10 text-white rounded-xl focus:border-indigo-500 text-xs"
                    />
                    <Input
                        type="datetime-local"
                        value={form.reservation_at}
                        onChange={(val) => setForm((f) => ({ ...f, reservation_at: val }))}
                        icon={<FiCalendar />}
                        className="bg-white/5 border border-white/10 text-white rounded-xl focus:border-indigo-500 text-xs font-mono"
                    />
                    <Select
                        value={form.table_id}
                        onChange={(val) => setForm((f) => ({ ...f, table_id: val }))}
                        icon={<FiMapPin />}
                        className="bg-[#0f172a] border border-white/10 text-white rounded-xl focus:border-indigo-500 text-xs cursor-pointer"
                        options={tableOptions}
                    />
                    <button type="submit" className="h-[46px] w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all cursor-pointer">
                        <FiPlus size={14} /> {t('admin.reservations.addBtn')}
                    </button>
                    <div className="lg:col-span-6">
                        <Input
                            placeholder={t('admin.reservations.field.notes')}
                            value={form.notes}
                            onChange={(val) => setForm((f) => ({ ...f, notes: val }))}
                            icon={<FiFileText />}
                            className="bg-white/5 border border-white/10 text-white rounded-xl focus:border-indigo-500 text-xs"
                        />
                    </div>
                </form>

                <div className="flex flex-wrap items-center gap-4 rounded-[2rem] border border-white/5 bg-white/[0.02] backdrop-blur-md p-4 shadow-2xl relative z-10">
                    <div className="relative flex items-center w-full sm:w-auto">
                        <FiCalendar className="absolute left-4 text-slate-400 pointer-events-none" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-full sm:w-48 pl-11 pr-4 py-3 bg-[#0f172a] text-white border border-white/10 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 transition-all cursor-pointer"
                        />
                    </div>
                    <div className="relative flex items-center w-full sm:w-auto">
                        <FiActivity className="absolute left-4 text-slate-400 pointer-events-none" />
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value as 'all' | Reservation['status'])}
                            className="w-full sm:w-48 pl-11 pr-4 py-3 bg-[#0f172a] text-white border border-white/10 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 transition-all appearance-none cursor-pointer"
                        >
                            <option value="all" className="bg-[#0f172a] text-white">{t('admin.reservations.filter.allStatus')}</option>
                            {statusKeys.map((status) => (
                                <option key={status} value={status} className="bg-[#0f172a] text-white">
                                    {statusLabel(status)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="overflow-hidden rounded-[2rem] border border-white/5 bg-white/[0.02] backdrop-blur-md shadow-2xl relative z-10 overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.01] text-[9px] font-black uppercase text-slate-500 tracking-widest">
                                <th className="p-4">{t('admin.reservations.col.time')}</th>
                                <th className="p-4">{t('admin.reservations.col.customer')}</th>
                                <th className="p-4">{t('admin.reservations.col.table')}</th>
                                <th className="p-4">{t('admin.reservations.col.guests')}</th>
                                <th className="p-4">{t('admin.reservations.col.status')}</th>
                                <th className="p-4 text-right">{t('admin.reservations.col.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-bold">
                            {rows.map((r) => (
                                <tr key={r.id} className="border-b border-white/[0.04] text-slate-300 hover:bg-white/[0.01] transition-colors group">
                                    <td className="p-4 font-mono font-bold text-sm text-white">
                                        {new Date(r.reservation_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="p-4">
                                        <p className="font-bold text-white text-xs uppercase tracking-wide">{r.customer_name}</p>
                                        <p className="text-[10px] text-slate-500 font-semibold">{r.phone || '-'}</p>
                                    </td>
                                    <td className="p-4 font-semibold text-xs">{r.table_name ? (r.section_name ? `${r.table_name} (${r.section_name})` : r.table_name) : '-'}</td>
                                    <td className="p-4">
                                        <span className="inline-flex items-center justify-center px-2.5 py-1 text-[10px] font-black uppercase rounded-lg bg-white/5 border border-white/10 text-slate-350">
                                            {t('admin.reservations.guestLabel').replace('{{count}}', String(r.guest_count))}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <select
                                            value={r.status}
                                            onChange={(e) => void updateStatus(r.id, e.target.value as Reservation['status'])}
                                            className="rounded-lg border border-white/10 bg-[#0f172a] px-3 py-1.5 text-xs font-bold text-slate-200 outline-none focus:border-indigo-500 transition-all cursor-pointer"
                                        >
                                            {statusKeys.map((status) => (
                                                <option key={status} value={status}>
                                                    {statusLabel(status)}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="p-4 text-right">
                                        <button
                                            type="button"
                                            onClick={() => void remove(r.id)}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/25 bg-rose-600/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-rose-450 hover:bg-rose-650/20 hover:text-rose-350 transition-all cursor-pointer"
                                        >
                                            <FiTrash2 /> {t('admin.reservations.delete')}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">
                                        {t('admin.reservations.empty')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <ModernConfirmModal
                isOpen={!!confirm}
                onClose={() => setConfirm(null)}
                title={confirm?.title || ''}
                description={confirm?.description || ''}
                confirmText={t('admin.reservations.confirmDelete')}
                cancelText={t('admin.reservations.cancel')}
                type="danger"
                onConfirm={() => confirm?.onConfirm()}
            />
        </main>
    );
};
