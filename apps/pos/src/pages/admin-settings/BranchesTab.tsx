import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiPlus, FiRefreshCcw, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/useAuthStore';
import { ModernConfirmModal } from '../../features/terminal/components/ModernConfirmModal';

type BranchRow = {
    id: number;
    name: string;
    address: string | null;
    phone: string | null;
    default_language: string | null;
    is_online?: boolean | number | null;
    last_sync?: string | null;
    created_at?: string | null;
};

type Draft = {
    name: string;
    address: string;
    phone: string;
    default_language: string;
};

const emptyDraft = (): Draft => ({
    name: '',
    address: '',
    phone: '',
    default_language: 'de',
});

export const BranchesTab: React.FC = () => {
    const { getAuthHeaders, logout } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<BranchRow[]>([]);
    const [maxBranches, setMaxBranches] = useState<number | null>(null);
    const [modal, setModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [draft, setDraft] = useState<Draft>(emptyDraft);
    const [confirm, setConfirm] = useState<null | { title: string; description: string; onConfirm: () => void }>(null);

    const usedBranches = rows.length;
    const quotaLabel = useMemo(() => {
        if (maxBranches == null) return `${usedBranches}`;
        return `${usedBranches} / ${maxBranches}`;
    }, [usedBranches, maxBranches]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/admin/branches', { headers: getAuthHeaders() });
            if (res.status === 401) {
                logout();
                return;
            }
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                toast.error(j.error || 'Şubeler yüklenemedi');
                return;
            }
            const j = await res.json();
            setRows(Array.isArray(j?.branches) ? j.branches : []);
            setMaxBranches(j?.maxBranches != null ? Number(j.maxBranches) : null);
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders, logout]);

    useEffect(() => {
        void load();
    }, [load]);

    const openCreate = () => {
        setEditId(null);
        setDraft(emptyDraft());
        setModal(true);
    };

    const openEdit = (b: BranchRow) => {
        setEditId(b.id);
        setDraft({
            name: String(b.name || ''),
            address: String(b.address || ''),
            phone: String(b.phone || ''),
            default_language: String(b.default_language || 'de'),
        });
        setModal(true);
    };

    const closeModal = () => {
        setModal(false);
        setEditId(null);
        setDraft(emptyDraft());
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!draft.name.trim()) {
            toast.error('Şube adı zorunlu');
            return;
        }
        setSaving(true);
        try {
            const isEdit = editId != null;
            const url = isEdit ? `/api/v1/admin/branches/${editId}` : '/api/v1/admin/branches';
            const res = await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: draft.name.trim(),
                    address: draft.address.trim() ? draft.address.trim() : null,
                    phone: draft.phone.trim() ? draft.phone.trim() : null,
                    default_language: draft.default_language || 'de',
                }),
            });
            if (res.status === 401) {
                logout();
                return;
            }
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                toast.error(j.error || 'Kayıt başarısız');
                return;
            }
            toast.success(isEdit ? 'Şube güncellendi' : 'Şube oluşturuldu');
            closeModal();
            await load();
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: number) => {
        setConfirm({
            title: 'Şubeyi sil',
            description: 'Bu şubeyi silmek istiyor musunuz? Bu işlem geri alınamaz.',
            onConfirm: () => {
                void (async () => {
                    const res = await fetch(`/api/v1/admin/branches/${id}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders(),
                    });
                    if (res.status === 401) {
                        logout();
                        return;
                    }
                    if (!res.ok) {
                        const j = await res.json().catch(() => ({}));
                        toast.error(j.error || 'Şube silinemedi. Lütfen tekrar deneyin.');
                        return;
                    }
                    toast.success('Şube silindi');
                    await load();
                })();
            },
        });
    };

    return (
        <>
            <div className="space-y-10">
            <section className="bg-white/5 rounded-3xl border border-white/5 p-8 shadow-sm">
                <div className="flex items-start justify-between gap-6">
                    <div>
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">
                            ŞUBELER
                        </h3>
                        <div className="text-xs font-bold text-slate-300">
                            Kota: <span className="font-black text-white">{quotaLabel}</span>
                        </div>
                        <div className="mt-1 text-[11px] font-semibold text-slate-500">
                            Yeni şube eklemek için paketinizdeki şube kotası uygun olmalı.
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void load()}
                            className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10 transition-colors"
                            title="Yenile"
                        >
                            <FiRefreshCcw className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            type="button"
                            onClick={openCreate}
                            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-[11px] font-black text-white uppercase tracking-widest shadow-lg shadow-indigo-600/30 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <FiPlus /> Yeni Şube
                        </button>
                    </div>
                </div>

                <div className="mt-8 overflow-hidden rounded-2xl border border-white/10">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-white/5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                            <tr>
                                <th className="px-4 py-3">#</th>
                                <th className="px-4 py-3">Ad</th>
                                <th className="px-4 py-3">Adres</th>
                                <th className="px-4 py-3">Telefon</th>
                                <th className="px-4 py-3">Dil</th>
                                <th className="px-4 py-3 text-right">İşlem</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 bg-black/10">
                            {rows.map((b) => (
                                <tr key={b.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-4 py-3 font-black text-slate-200">{b.id}</td>
                                    <td className="px-4 py-3 font-bold text-white">{b.name}</td>
                                    <td className="px-4 py-3 text-slate-300">{b.address || '—'}</td>
                                    <td className="px-4 py-3 text-slate-300">{b.phone || '—'}</td>
                                    <td className="px-4 py-3 text-slate-300">{b.default_language || 'de'}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => openEdit(b)}
                                                className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-200 hover:bg-white/10 transition-colors"
                                                title="Düzenle"
                                            >
                                                <FiEdit2 />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void remove(b.id)}
                                                className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-rose-200 hover:bg-rose-500/20 transition-colors"
                                                title="Sil"
                                                disabled={b.id === 1}
                                            >
                                                <FiTrash2 />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr>
                                    <td className="px-4 py-8 text-center text-slate-500 font-semibold" colSpan={6}>
                                        Şube bulunamadı
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {modal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-6">
                    <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b1220] p-6">
                        <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    {editId != null ? 'Şube Düzenle' : 'Yeni Şube'}
                                </div>
                                <div className="mt-1 text-sm font-black text-white">{draft.name.trim() || '—'}</div>
                            </div>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-200 hover:bg-white/10 transition-colors"
                            >
                                Kapat
                            </button>
                        </div>

                        <form onSubmit={(e) => void save(e)} className="space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Şube Adı</div>
                                    <input
                                        value={draft.name}
                                        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white outline-none focus:border-indigo-500/50"
                                        placeholder="Örn: Merkez"
                                    />
                                </div>
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Adres</div>
                                    <input
                                        value={draft.address}
                                        onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white outline-none focus:border-indigo-500/50"
                                        placeholder="Opsiyonel"
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Telefon</div>
                                        <input
                                            value={draft.phone}
                                            onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                                            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white outline-none focus:border-indigo-500/50"
                                            placeholder="Opsiyonel"
                                        />
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Dil</div>
                                        <select
                                            value={draft.default_language}
                                            onChange={(e) => setDraft((d) => ({ ...d, default_language: e.target.value }))}
                                            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white outline-none focus:border-indigo-500/50"
                                        >
                                            <option value="de">Deutsch</option>
                                            <option value="tr">Türkçe</option>
                                            <option value="en">English</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-200 hover:bg-white/10 transition-colors"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700 px-5 py-2 text-[11px] font-black text-white uppercase tracking-widest shadow-lg shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {saving ? 'Kaydediliyor...' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
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
        </>
    );
};
