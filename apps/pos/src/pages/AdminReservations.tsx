import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiCalendar, FiPlus, FiRefreshCcw, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { useNavigate } from 'react-router-dom';
import { ModernConfirmModal } from '../features/terminal/components/ModernConfirmModal';

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

const statusOptions: Reservation['status'][] = ['reserved', 'seated', 'cancelled', 'no_show'];

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
            toast.error((j as { error?: string }).error || 'Rezervasyon kaydedilemedi. Lütfen tekrar deneyin.');
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
            title: 'Rezervasyonu sil',
            description: 'Bu rezervasyonu silmek istiyor musunuz? Bu işlem geri alınamaz.',
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
                        toast.error(j.error || 'Rezervasyon silinemedi. Lütfen tekrar deneyin.');
                        return;
                    }
                    toast.success('Rezervasyon silindi');
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
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#F1F5F9]">
            <header className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8 shadow-sm">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Masa Rezervasyon</h2>
                    <p className="text-sm text-slate-500">Gunluk rezervasyon takibi ve masa atama</p>
                </div>
                <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-200 p-2" aria-label="Yenile" title="Yenile">
                    <FiRefreshCcw className={loading ? 'animate-spin' : ''} />
                </button>
            </header>

            <div className="flex-1 overflow-auto p-8 space-y-6">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                        <p className="text-xs font-bold uppercase text-blue-700">Bekleyen Rezervasyon</p>
                        <p className="mt-1 text-2xl font-black text-blue-900">{metrics.reserved}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-xs font-bold uppercase text-emerald-700">Masaya Oturan</p>
                        <p className="mt-1 text-2xl font-black text-emerald-900">{metrics.seated}</p>
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                        <p className="text-xs font-bold uppercase text-rose-700">Iptal / Gelmedi</p>
                        <p className="mt-1 text-2xl font-black text-rose-900">{metrics.cancelled}</p>
                    </div>
                </div>

                <form onSubmit={save} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-6">
                    <input
                        required
                        placeholder="Musteri"
                        value={form.customer_name}
                        onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                    />
                    <input
                        placeholder="Telefon"
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                    />
                    <input
                        type="number"
                        min={1}
                        value={form.guest_count}
                        onChange={(e) => setForm((f) => ({ ...f, guest_count: Number(e.target.value) || 1 }))}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                    />
                    <input
                        type="datetime-local"
                        value={form.reservation_at}
                        onChange={(e) => setForm((f) => ({ ...f, reservation_at: e.target.value }))}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                    />
                    <select
                        value={form.table_id}
                        onChange={(e) => setForm((f) => ({ ...f, table_id: e.target.value }))}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                    >
                        <option value="">Masa sec (opsiyonel)</option>
                        {tables.map((t) => (
                            <option key={t.id} value={String(t.id)}>
                                {t.name}
                            </option>
                        ))}
                    </select>
                    <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">
                        <FiPlus /> Rezervasyon Ekle
                    </button>
                    <input
                        placeholder="Not"
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 lg:col-span-6"
                    />
                </form>

                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <FiCalendar className="text-slate-500" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-transparent outline-none"
                        />
                    </div>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as 'all' | Reservation['status'])}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                    >
                        <option value="all">Tum durumlar</option>
                        {statusOptions.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th className="p-3">Saat</th>
                                <th className="p-3">Musteri</th>
                                <th className="p-3">Masa</th>
                                <th className="p-3">Kisi</th>
                                <th className="p-3">Durum</th>
                                <th className="p-3">Islem</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className="border-t border-slate-100">
                                    <td className="p-3">{new Date(r.reservation_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                    <td className="p-3">
                                        <p className="font-bold">{r.customer_name}</p>
                                        <p className="text-xs text-slate-500">{r.phone || '-'}</p>
                                    </td>
                                    <td className="p-3">{r.table_name || '-'}</td>
                                    <td className="p-3">{r.guest_count}</td>
                                    <td className="p-3">
                                        <select
                                            value={r.status}
                                            onChange={(e) => void updateStatus(r.id, e.target.value as Reservation['status'])}
                                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400"
                                        >
                                            {statusOptions.map((s) => (
                                                <option key={s} value={s}>
                                                    {s}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="p-3">
                                        <button type="button" onClick={() => void remove(r.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700">
                                            <FiTrash2 /> Sil
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-4 text-sm text-slate-500">
                                        Bu tarih ve filtre icin kayit yok.
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
                confirmText="SİL"
                cancelText="VAZGEÇ"
                type="danger"
                onConfirm={() => confirm?.onConfirm()}
            />
        </main>
    );
};
