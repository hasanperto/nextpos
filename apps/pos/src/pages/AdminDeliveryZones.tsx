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
            toast.error('Polygon alanı geçerli JSON olmalı. Lütfen formatı kontrol edip tekrar deneyin.');
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
            toast.error((j as { error?: string }).error || 'Kaydedilemedi. Lütfen tekrar deneyin.');
            return;
        }
        setModal(false);
        void load();
    };

    const remove = async (z: Zone) => {
        setConfirm({
            title: 'Teslimat bölgesini sil',
            description: `"${z.name}" silinsin mi? Bu işlem geri alınamaz.`,
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
                        toast.error((j as { error?: string }).error || 'Silinemedi. Lütfen tekrar deneyin.');
                        return;
                    }
                    toast.success('Bölge silindi');
                    void load();
                })();
            },
        });
    };

    return (
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#F1F5F9]">
            <header className="flex h-20 shrink-0 flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-8 shadow-sm">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Teslimat bölgeleri</h2>
                    <p className="text-sm text-slate-500">
                        Minimum sipariş, ücret ve tahmini süre. Harita çokgeni (GeoJSON) isteğe bağlı JSON.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="rounded-lg border border-slate-200 p-2"
                        title="Yenile"
                    >
                        <FiRefreshCcw className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        type="button"
                        onClick={openCreate}
                        className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500"
                    >
                        <FiPlus size={18} /> Yeni bölge
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-8">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th className="p-3">Bölge</th>
                                <th className="p-3">Min. sipariş ({currency})</th>
                                <th className="p-3">Teslimat ({currency})</th>
                                <th className="p-3">Süre (dk)</th>
                                <th className="p-3">Şube</th>
                                <th className="p-3">Aktif</th>
                                <th className="p-3 w-32" />
                            </tr>
                        </thead>
                        <tbody>
                            {zones.map((z) => {
                                const br = branches.find((b) => b.id === z.branch_id);
                                return (
                                    <tr key={z.id} className="border-t border-slate-100">
                                        <td className="p-3 font-bold">{z.name}</td>
                                        <td className="p-3">{Number(z.min_order).toFixed(2)}</td>
                                        <td className="p-3">{Number(z.delivery_fee).toFixed(2)}</td>
                                        <td className="p-3">{z.est_minutes}</td>
                                        <td className="p-3 text-slate-600">{br?.name ?? '—'}</td>
                                        <td className="p-3">
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                                    z.is_active
                                                        ? 'bg-emerald-100 text-emerald-800'
                                                        : 'bg-slate-200 text-slate-600'
                                                }`}
                                            >
                                                {z.is_active ? 'Evet' : 'Hayır'}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <div className="flex gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => openEdit(z)}
                                                    className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                                                    title="Düzenle"
                                                >
                                                    <FiEdit2 size={16} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void remove(z)}
                                                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                                                    title="Sil"
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
                        <p className="p-8 text-center text-slate-500">
                            <FiMapPin className="mx-auto mb-2 opacity-40" size={32} />
                            Henüz teslimat bölgesi yok.
                        </p>
                    )}
                </div>
            </div>

            {modal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <form
                        onSubmit={save}
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
                    >
                        <h3 className="mb-4 text-lg font-bold text-slate-800">
                            {editId != null ? 'Bölgeyi düzenle' : 'Yeni bölge'}
                        </h3>
                        <label className="mb-2 block text-xs font-bold uppercase text-slate-500">
                            Ad
                        </label>
                        <input
                            className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2"
                            value={form.name}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            required
                        />
                        <div className="mb-3 grid grid-cols-3 gap-2">
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500">
                                    Min. {currency}
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="w-full rounded-lg border border-slate-200 px-2 py-2"
                                    value={form.min_order}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, min_order: e.target.value }))
                                    }
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500">
                                    Ücret {currency}
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="w-full rounded-lg border border-slate-200 px-2 py-2"
                                    value={form.delivery_fee}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, delivery_fee: e.target.value }))
                                    }
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-500">
                                    Süre dk
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    className="w-full rounded-lg border border-slate-200 px-2 py-2"
                                    value={form.est_minutes}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, est_minutes: e.target.value }))
                                    }
                                />
                            </div>
                        </div>
                        <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                            Şube
                        </label>
                        <select
                            className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2"
                            value={form.branch_id === '' ? '' : String(form.branch_id)}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    branch_id: e.target.value === '' ? '' : Number(e.target.value),
                                }))
                            }
                        >
                            <option value="">(Tüm şubeler)</option>
                            {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                        <label className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-700">
                            <input
                                type="checkbox"
                                checked={form.is_active}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, is_active: e.target.checked }))
                                }
                            />
                            Aktif
                        </label>
                        <label className="mb-1 mt-3 block text-xs font-bold uppercase text-slate-500">
                            Polygon (JSON, isteğe bağlı)
                        </label>
                        <textarea
                            className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
                            rows={5}
                            placeholder='{"type":"Polygon","coordinates":[...]}'
                            value={form.polygonJson}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, polygonJson: e.target.value }))
                            }
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setModal(false)}
                                className="rounded-xl px-4 py-2 text-slate-600 hover:bg-slate-100"
                            >
                                İptal
                            </button>
                            <button
                                type="submit"
                                className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-500"
                            >
                                Kaydet
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
                confirmText="SİL"
                cancelText="VAZGEÇ"
                type="danger"
                onConfirm={() => confirm?.onConfirm()}
            />
        </main>
    );
};
