import React, { useCallback, useEffect, useState } from 'react';
import { FiEdit2, FiMapPin, FiPlus, FiRefreshCcw, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { useNavigate } from 'react-router-dom';
import { ModernConfirmModal } from '../features/terminal/components/ModernConfirmModal';

type Branch = { id: number; name: string };

type Zone = {
    id: number;
    name: string;
    min_order: string | number;
    delivery_fee: string | number;
    est_minutes: number;
    polygon: unknown;
    is_active: boolean;
    branch_id: number | null;
};

const emptyForm = {
    name: '',
    min_order: '0',
    delivery_fee: '0',
    est_minutes: '30',
    polygonJson: '',
    is_active: true,
    branch_id: '' as string | number,
};

export const AdminDeliveryZones: React.FC = () => {
    const navigate = useNavigate();
    const { getAuthHeaders, logout, user } = useAuthStore();
    const { settings, fetchSettings } = usePosStore();
    const { t } = usePosLocale();
    const currency = settings?.currency || '€';
    const [zones, setZones] = useState<Zone[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [locked, setLocked] = useState(false);
    const [modal, setModal] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [editId, setEditId] = useState<number | null>(null);
    const [confirm, setConfirm] = useState<null | { title: string; description: string; onConfirm: () => void }>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await fetch('/api/v1/admin/delivery-zones', { headers: getAuthHeaders() });
        if (res.status === 401) {
            logout();
            return;
        }
        if (res.status === 403) {
            setLocked(true);
            setZones([]);
            setBranches([]);
            setLoading(false);
            return;
        }
        setLocked(false);
        if (res.ok) {
            const data = await res.json();
            setZones(Array.isArray(data.zones) ? data.zones : []);
            setBranches(Array.isArray(data.branches) ? data.branches : []);
        }
        setLoading(false);
    }, [getAuthHeaders, logout]);

    useEffect(() => {
        void load();
        void fetchSettings();
    }, [load]);

    if (locked) {
        return (
            <div className="p-6">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <div className="mb-2 text-sm font-black text-white">{t('modules.locked.title')}</div>
                    <div className="mb-4 text-xs font-semibold text-slate-400">{t('modules.locked.courier.desc')}</div>
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

    const openCreate = () => {
        setEditId(null);
        setForm({
            ...emptyForm,
            branch_id: user?.branchId != null ? String(user.branchId) : '',
        });
        setModal(true);
    };

    const openEdit = (z: Zone) => {
        setEditId(z.id);
        setForm({
            name: z.name,
            min_order: String(z.min_order ?? 0),
            delivery_fee: String(z.delivery_fee ?? 0),
            est_minutes: String(z.est_minutes ?? 30),
            polygonJson:
                z.polygon != null ? JSON.stringify(z.polygon, null, 2) : '',
            is_active: Boolean(z.is_active),
            branch_id: z.branch_id != null ? z.branch_id : '',
        });
        setModal(true);
    };

    const parsePolygon = (): object | null => {
        const t = form.polygonJson.trim();
        if (!t) return null;
        const p = JSON.parse(t) as object;
        return p;
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        let polygon: object | null = null;
        try {
            if (form.polygonJson.trim()) {
                polygon = parsePolygon();
            }
        } catch {
            toast.error(t('admin.deliveryZones.toast.invalidPolygon'));
            return;
        }

        const body: Record<string, unknown> = {
            name: form.name.trim(),
            min_order: Number(form.min_order) || 0,
            delivery_fee: Number(form.delivery_fee) || 0,
            est_minutes: Number(form.est_minutes) || 30,
            polygon,
            is_active: form.is_active,
        };
        if (form.branch_id === '' || form.branch_id === undefined) {
            body.branch_id = null;
        } else {
            body.branch_id = Number(form.branch_id);
        }

        const url =
            editId != null
                ? `/api/v1/admin/delivery-zones/${editId}`
                : '/api/v1/admin/delivery-zones';
        const method = editId != null ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (res.status === 401) {
            logout();
            return;
        }
        if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            toast.error((j as { error?: string }).error || t('admin.deliveryZones.toast.saveError'));
            return;
        }
        setModal(false);
        void load();
    };

    const remove = async (z: Zone) => {
        setConfirm({
            title: t('admin.deliveryZones.deleteModalTitle'),
            description: t('admin.deliveryZones.deleteConfirm').replace('{{name}}', z.name),
            onConfirm: () => {
                void (async () => {
                    const res = await fetch(`/api/v1/admin/delivery-zones/${z.id}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders(),
                    });
                    if (res.status === 401) {
                        logout();
                        return;
                    }
                    if (!res.ok) {
                        const j = await res.json().catch(() => ({}));
                        toast.error((j as { error?: string }).error || t('admin.deliveryZones.toast.deleteError'));
                        return;
                    }
                    toast.success(t('admin.deliveryZones.toast.deleted'));
                    void load();
                })();
            },
        });
    };

    return (
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#020617] text-slate-100 font-sans relative">
            {/* Ambient glows */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[20%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[150px]" />
            </div>

            {/* Header */}
            <header className="flex flex-col md:flex-row gap-4 md:h-24 shrink-0 md:items-center justify-between border-b border-white/5 bg-[#0f172a]/95 backdrop-blur-md p-4 md:px-8 z-10">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-blue-600/10 border border-blue-500/35 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                        <FiMapPin size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white uppercase italic tracking-tight">{t('admin.deliveryZones.title')}</h2>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                            {t('admin.deliveryZones.subtitle')}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 justify-end">
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="p-3.5 bg-white/5 border border-white/10 rounded-2xl text-slate-400 hover:bg-white/10 transition-all cursor-pointer"
                        title={t('admin.deliveryZones.refresh')}
                        aria-label={t('admin.deliveryZones.refresh')}
                    >
                        <FiRefreshCcw className={loading ? 'animate-spin' : ''} size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={openCreate}
                        className="px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 cursor-pointer"
                    >
                        <FiPlus size={14} /> {t('admin.deliveryZones.newZone')}
                    </button>
                </div>
            </header>

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-4 md:p-8 z-10">
                <div className="overflow-hidden rounded-[2rem] border border-white/5 bg-white/[0.02] backdrop-blur-md shadow-2xl">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.01] text-[9px] font-black uppercase text-slate-500 tracking-widest">
                                <th className="p-4">{t('admin.deliveryZones.col.name')}</th>
                                <th className="p-4">{t('admin.deliveryZones.col.minOrder')}</th>
                                <th className="p-4">{t('admin.deliveryZones.col.deliveryFee')}</th>
                                <th className="p-4">{t('admin.deliveryZones.col.estTime')}</th>
                                <th className="p-4">{t('admin.deliveryZones.col.branch')}</th>
                                <th className="p-4">{t('admin.deliveryZones.col.active')}</th>
                                <th className="p-4 w-32" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-bold">
                            {zones.map((z) => {
                                const br = branches.find((b) => b.id === z.branch_id);
                                return (
                                    <tr key={z.id} className="hover:bg-white/[0.01] transition-all">
                                        <td className="p-4 text-xs font-black text-white uppercase">{z.name}</td>
                                        <td className="p-4 text-xs text-indigo-400 font-mono">{currency}{Number(z.min_order).toFixed(2)}</td>
                                        <td className="p-4 text-xs text-emerald-400 font-mono">{currency}{Number(z.delivery_fee).toFixed(2)}</td>
                                        <td className="p-4 text-xs text-slate-400 font-mono">
                                            {t('admin.deliveryZones.estMinutes').replace('{{minutes}}', String(z.est_minutes))}
                                        </td>
                                        <td className="p-4 text-xs text-slate-400 uppercase">{br?.name ?? '—'}</td>
                                        <td className="p-4 text-xs">
                                            <span
                                                className={`rounded-lg px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${
                                                    z.is_active
                                                        ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
                                                        : 'border border-white/5 bg-white/5 text-slate-500'
                                                }`}
                                            >
                                                {z.is_active ? t('admin.deliveryZones.status.yes') : t('admin.deliveryZones.status.no')}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => openEdit(z)}
                                                    className="rounded-xl p-2 text-indigo-400 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/20 transition-all cursor-pointer"
                                                    title={t('admin.deliveryZones.editTitle')}
                                                >
                                                    <FiEdit2 size={16} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void remove(z)}
                                                    className="rounded-xl p-2 text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
                                                    title={t('admin.deliveryZones.deleteTitle')}
                                                >
                                                    <FiTrash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {zones.length === 0 && !loading && (
                        <div className="py-20 flex flex-col items-center justify-center bg-white/[0.01]">
                            <FiMapPin className="mb-4 text-slate-600 animate-pulse" size={48} />
                            <p className="text-xs font-black uppercase tracking-widest text-slate-500">{t('admin.deliveryZones.empty')}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal */}
            {modal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <form
                        onSubmit={save}
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2.5rem] border border-white/10 bg-slate-950 p-8 shadow-2xl space-y-6 relative"
                    >
                        <div>
                            <h3 className="text-lg font-black text-white uppercase italic tracking-tight">
                                {editId != null ? t('admin.deliveryZones.modal.editTitle') : t('admin.deliveryZones.modal.createTitle')}
                            </h3>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{t('admin.deliveryZones.modal.subtitle')}</p>
                        </div>

                        <div>
                            <label className="mb-2 block text-[9px] font-black uppercase text-slate-400 tracking-wider">
                                {t('admin.deliveryZones.field.name')}
                            </label>
                            <input
                                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none text-white text-xs font-bold focus:border-indigo-500 transition-all"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder={t('admin.deliveryZones.field.namePlaceholder')}
                                required
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="mb-2 block text-[9px] font-black uppercase text-slate-400 tracking-wider">
                                    {t('admin.deliveryZones.field.minOrder').replace('{{currency}}', currency)}
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none text-white text-xs font-bold focus:border-indigo-500 transition-all font-mono"
                                    value={form.min_order}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, min_order: e.target.value }))
                                    }
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-[9px] font-black uppercase text-slate-400 tracking-wider">
                                    {t('admin.deliveryZones.field.deliveryFee').replace('{{currency}}', currency)}
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none text-white text-xs font-bold focus:border-indigo-500 transition-all font-mono"
                                    value={form.delivery_fee}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, delivery_fee: e.target.value }))
                                    }
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-[9px] font-black uppercase text-slate-400 tracking-wider">
                                    {t('admin.deliveryZones.field.estMinutes')}
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none text-white text-xs font-bold focus:border-indigo-500 transition-all font-mono"
                                    value={form.est_minutes}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, est_minutes: e.target.value }))
                                    }
                                />
                            </div>
                        </div>

                        <div>
                            <label className="mb-2 block text-[9px] font-black uppercase text-slate-400 tracking-wider">
                                {t('admin.deliveryZones.field.branch')}
                            </label>
                            <select
                                className="w-full rounded-xl border border-white/10 bg-[#0f172a] px-4 py-3 outline-none text-white text-xs font-bold focus:border-indigo-500 transition-all cursor-pointer"
                                value={form.branch_id === '' ? '' : String(form.branch_id)}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        branch_id: e.target.value === '' ? '' : Number(e.target.value),
                                    }))
                                }
                            >
                                <option value="">{t('admin.deliveryZones.field.allBranches')}</option>
                                {branches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="is_active_checkbox"
                                checked={form.is_active}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, is_active: e.target.checked }))
                                }
                                className="h-4 w-4 rounded border-white/10 bg-white/5 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                            />
                            <label htmlFor="is_active_checkbox" className="text-xs font-black uppercase text-slate-300 tracking-wider cursor-pointer">
                                {t('admin.deliveryZones.field.activeCheckbox')}
                            </label>
                        </div>

                        <div>
                            <label className="mb-2 block text-[9px] font-black uppercase text-slate-400 tracking-wider">
                                {t('admin.deliveryZones.field.polygon')}
                            </label>
                            <textarea
                                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none text-white text-xs font-semibold focus:border-indigo-500 transition-all font-mono resize-y"
                                rows={4}
                                placeholder='{"type":"Polygon","coordinates":[[[lng, lat], ...]]}'
                                value={form.polygonJson}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, polygonJson: e.target.value }))
                                }
                            />
                            <p className="mt-2 text-[10px] text-slate-400 font-semibold leading-relaxed">
                                <span className="text-indigo-400 font-bold">{t('admin.deliveryZones.field.polygonHintHow')} </span>
                                {t('admin.deliveryZones.field.polygonHintBefore')}{' '}
                                <a 
                                    href="https://geojson.io" 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="text-indigo-400 hover:text-indigo-300 underline font-bold"
                                >
                                    geojson.io
                                </a>{' '}
                                {t('admin.deliveryZones.field.polygonHintAfter')}
                            </p>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                            <button
                                type="button"
                                onClick={() => setModal(false)}
                                className="px-6 py-3 rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                            >
                                {t('admin.deliveryZones.cancel')}
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
                            >
                                {t('admin.deliveryZones.save')}
                            </button>
                        </div>
                    </form>
                </div>
            )}
            <ModernConfirmModal
                isOpen={!!confirm}
                onClose={() => setConfirm(null)}
                title={confirm?.title || ''}
                description={confirm?.description || ''}
                confirmText={t('admin.deliveryZones.confirmDelete')}
                cancelText={t('admin.deliveryZones.confirmCancel')}
                type="danger"
                onConfirm={() => confirm?.onConfirm()}
            />
        </main>
    );
};
