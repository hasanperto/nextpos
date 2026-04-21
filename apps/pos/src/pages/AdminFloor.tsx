import React, { useCallback, useEffect, useState } from 'react';
import { FiPlus, FiTrash2, FiRefreshCcw, FiSave, FiCopy, FiGrid, FiMove } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { TableDesignerLayout } from '../components/TableDesigner/TableDesignerLayout';
import { ModernConfirmModal } from '../features/terminal/components/ModernConfirmModal';

type Section = {
    id: number;
    name: string;
    floor: number;
    sort_order: number;
    is_active: boolean;
};

type TableRow = {
    id: number;
    section_id: number;
    name: string;
    capacity: number;
    shape: string;
    position_x: number | null;
    position_y: number | null;
    qr_code?: string;
    section_name?: string;
    translations?: Record<string, string>;
};

export const AdminFloor: React.FC = () => {
    const { getAuthHeaders, logout, tenantId } = useAuthStore();
    const [sections, setSections] = useState<Section[]>([]);
    const [tables, setTables] = useState<TableRow[]>([]);
    const [confirm, setConfirm] = useState<null | { title: string; description: string; confirmText: string; onConfirm: () => void }>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'list' | 'visual'>('list');
    const [visualSection, setVisualSection] = useState<number | null>(null);

    const [secModal, setSecModal] = useState(false);
    const [tblModal, setTblModal] = useState(false);
    const [secForm, setSecForm] = useState({ name: '', floor: 0, sort_order: 0 });
    const [tblForm, setTblForm] = useState({
        section_id: '',
        name: '',
        capacity: 4,
        shape: 'square',
        position_x: '',
        position_y: '',
        translations: { tr: '', en: '', de: '' } as Record<string, string>,
    });

    const [isBulk, setIsBulk] = useState(false);
    const [bulkForm, setBulkForm] = useState({
        prefix: 'Masa',
        start: 1,
        end: 10,
        translations_prefix: { tr: 'Masa', en: 'Table', de: 'Tisch' }
    });

    const [editTable, setEditTable] = useState<TableRow | null>(null);

    const copyQrMenuUrl = (qr: string | undefined) => {
        if (!tenantId || !qr) return;
        const url = `${window.location.origin}/qr/${encodeURIComponent(qr)}?tenant=${encodeURIComponent(tenantId)}`;
        void navigator.clipboard.writeText(url).then(() => {
            toast.success('Müşteri menü linki panoya kopyalandı');
        });
    };

    const load = useCallback(async () => {
        setLoading(true);
        const h = getAuthHeaders();
        try {
            const [sRes, tRes] = await Promise.all([
                fetch('/api/v1/admin/sections', { headers: h }),
                fetch('/api/v1/tables', { headers: h }),
            ]);
            if (sRes.status === 401 || tRes.status === 401) {
                logout();
                return;
            }
            const s = sRes.ok ? await sRes.json() : [];
            const t = tRes.ok ? await tRes.json() : [];
            setSections(Array.isArray(s) ? s : []);
            setTables(Array.isArray(t) ? t : []);
            if (Array.isArray(s) && s.length > 0 && !visualSection) {
                setVisualSection(s[0].id);
            }
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders, logout, visualSection]);

    useEffect(() => {
        void load();
    }, [load]);

    const saveSection = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/v1/admin/sections', {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(secForm),
        });
        if (res.ok) {
            setSecModal(false);
            setSecForm({ name: '', floor: 0, sort_order: 0 });
            void load();
        }
    };

    const saveTable = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isBulk && !editTable) {
            const bulkBody = {
                section_id: Number(tblForm.section_id),
                prefix: bulkForm.prefix,
                start: bulkForm.start,
                end: bulkForm.end,
                capacity: Number(tblForm.capacity) || 4,
                shape: tblForm.shape,
                translations_prefix: bulkForm.translations_prefix
            };
            const res = await fetch('/api/v1/admin/tables/bulk', {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(bulkBody),
            });
            if (res.ok) {
                setTblModal(false);
                void load();
            } else {
                const j = await res.json();
                toast.error(j.error || 'Toplu oluşturma başarısız. Lütfen tekrar deneyin.');
            }
            return;
        }

        const body = {
            section_id: Number(tblForm.section_id),
            name: tblForm.name,
            translations: tblForm.translations,
            capacity: Number(tblForm.capacity) || 4,
            shape: tblForm.shape,
            position_x: tblForm.position_x === '' ? null : Number(tblForm.position_x),
            position_y: tblForm.position_y === '' ? null : Number(tblForm.position_y),
        };
        const url = editTable ? `/api/v1/admin/tables/${editTable.id}` : '/api/v1/admin/tables';
        const method = editTable ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (res.ok) {
            setTblModal(false);
            setEditTable(null);
            setTblForm({
                section_id: sections[0]?.id?.toString() || '',
                name: '',
                capacity: 4,
                shape: 'square',
                position_x: '',
                position_y: '',
                translations: { tr: '', en: '', de: '' }
            });
            void load();
        }
    };

    const delSection = async (id: number) => {
        setConfirm({
            title: 'Bölgeyi sil',
            description: 'Bu bölgeyi silmek istiyor musunuz? Bu işlem geri alınamaz.',
            confirmText: 'SİL',
            onConfirm: () => {
                void (async () => {
                    const res = await fetch(`/api/v1/admin/sections/${id}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders(),
                    });
                    if (res.ok) {
                        toast.success('Bölge silindi');
                        void load();
                        return;
                    }
                    const j = await res.json().catch(() => ({}));
                    toast.error((j as { error?: string }).error || 'Silinemedi. Lütfen tekrar deneyin.');
                })();
            },
        });
    };

    const delTable = async (id: number) => {
        setConfirm({
            title: 'Masayı sil',
            description: 'Bu masayı silmek istiyor musunuz? Bu işlem geri alınamaz.',
            confirmText: 'SİL',
            onConfirm: () => {
                void (async () => {
                    const res = await fetch(`/api/v1/admin/tables/${id}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders(),
                    });
                    if (res.ok) {
                        toast.success('Masa silindi');
                        void load();
                        return;
                    }
                    const j = await res.json().catch(() => ({}));
                    toast.error((j as { error?: string }).error || 'Silinemedi. Lütfen tekrar deneyin.');
                })();
            },
        });
    };

    const openNewTable = () => {
        setEditTable(null);
        setTblForm({
            section_id: sections[0]?.id?.toString() || '',
            name: '',
            capacity: 4,
            shape: 'square',
            position_x: '',
            position_y: '',
            translations: { tr: '', en: '', de: '' }
        });
        setIsBulk(false);
        setTblModal(true);
    };

    const openEditTable = (t: TableRow) => {
        setEditTable(t);
        setTblForm({
            section_id: String(t.section_id),
            name: t.name,
            capacity: t.capacity,
            shape: t.shape || 'square',
            position_x: t.position_x != null ? String(t.position_x) : '',
            position_y: t.position_y != null ? String(t.position_y) : '',
            translations: t.translations || { tr: '', en: '', de: '' }
        });
        setIsBulk(false);
        setTblModal(true);
    };



    return (
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#F1F5F9]">
            <header className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8 shadow-sm">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Salon ve Masalar</h2>
                    <p className="text-sm text-slate-500">Masa bölgelerini ve interaktif kat planını tasarlayın.</p>
                </div>
                <div className="flex gap-2">
                    <div className="flex bg-slate-100 p-1 rounded-xl mr-4 border border-slate-200">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${viewMode === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <FiGrid /> Liste
                        </button>
                        <button
                            onClick={() => setViewMode('visual')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${viewMode === 'visual' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <FiMove /> Kat Planı
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => void load()}
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                        title="Yenile"
                        aria-label="Yenile"
                    >
                        <FiRefreshCcw className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setSecModal(true)}
                        className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                    >
                        <FiPlus /> Bölge
                    </button>
                    <button
                        type="button"
                        onClick={openNewTable}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-md shadow-blue-600/20"
                    >
                        <FiPlus /> Masa
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-8">
                <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {sections.map((s) => (
                        <div
                            key={s.id}
                            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                        >
                            <div>
                                <p className="font-bold text-slate-800">{s.name}</p>
                                <p className="text-xs text-slate-500">
                                    Kat {s.floor} · sıra {s.sort_order}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => delSection(s.id)}
                                className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                                title="Bölgeyi sil"
                                aria-label="Bölgeyi sil"
                            >
                                <FiTrash2 />
                            </button>
                        </div>
                    ))}
                </div>

                {viewMode === 'visual' ? (
                    <div className="flex-1 h-[calc(100vh-200px)] -m-8 relative">
                        <TableDesignerLayout initialSections={sections} initialTables={tables} />
                    </div>
                ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th className="p-3">Masa</th>
                                <th className="p-3">Bölge</th>
                                <th className="p-3">Kapasite</th>
                                <th className="p-3">Şekil</th>
                                <th className="p-3">X / Y</th>
                                <th className="p-3">QR</th>
                                <th className="p-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-slate-400">
                                        Yükleniyor
                                    </td>
                                </tr>
                            ) : (
                                tables.map((t) => (
                                    <tr key={t.id} className="border-t border-slate-100">
                                        <td className="p-3 font-bold">{t.name}</td>
                                        <td className="p-3 text-slate-600">{t.section_name || t.section_id}</td>
                                        <td className="p-3">{t.capacity}</td>
                                        <td className="p-3">{t.shape}</td>
                                        <td className="p-3 font-mono text-xs">
                                            {t.position_x ?? '—'} , {t.position_y ?? '—'}
                                        </td>
                                        <td className="max-w-[180px] p-3 text-xs text-slate-500">
                                            <span className="block truncate">{t.qr_code || '—'}</span>
                                            {t.qr_code && tenantId && (
                                                <button
                                                    type="button"
                                                    onClick={() => copyQrMenuUrl(t.qr_code)}
                                                    className="mt-1 flex items-center gap-1 font-bold text-blue-600 hover:underline"
                                                >
                                                    <FiCopy size={12} /> Link kopyala
                                                </button>
                                            )}
                                        </td>
                                        <td className="p-3">
                                            <button
                                                type="button"
                                                onClick={() => openEditTable(t)}
                                                className="mr-2 text-blue-600 hover:underline"
                                            >
                                                Düzenle
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => delTable(t.id)}
                                                className="text-red-500"
                                                title="Masayı sil"
                                                aria-label="Masayı sil"
                                            >
                                                <FiTrash2 className="inline" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                )}
            </div>

            {secModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
                    <form
                        onSubmit={saveSection}
                        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
                    >
                        <h3 className="mb-4 text-lg font-bold">Yeni bölge</h3>
                        <label className="mb-2 block text-sm font-bold">Ad</label>
                        <input
                            required
                            className="mb-3 w-full rounded border p-2"
                            value={secForm.name}
                            onChange={(e) => setSecForm({ ...secForm, name: e.target.value })}
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-sm font-bold">Kat</label>
                                <input
                                    type="number"
                                    className="w-full rounded border p-2"
                                    value={secForm.floor}
                                    onChange={(e) =>
                                        setSecForm({ ...secForm, floor: Number(e.target.value) })
                                    }
                                />
                            </div>
                            <div>
                                <label className="text-sm font-bold">Sıra</label>
                                <input
                                    type="number"
                                    className="w-full rounded border p-2"
                                    value={secForm.sort_order}
                                    onChange={(e) =>
                                        setSecForm({ ...secForm, sort_order: Number(e.target.value) })
                                    }
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setSecModal(false)}
                                className="rounded-lg px-4 py-2 text-slate-600"
                            >
                                İptal
                            </button>
                            <button
                                type="submit"
                                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white"
                            >
                                <FiSave /> Kaydet
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {tblModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
                    <form
                        onSubmit={saveTable}
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
                    >
                        <h3 className="mb-4 text-lg font-bold">
                            {editTable ? 'Masa düzenle' : 'Yeni masa'}
                        </h3>

                        {!editTable && (
                            <div className="mb-4 flex bg-slate-100 p-1 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => setIsBulk(false)}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${!isBulk ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-indigo-600'}`}
                                >
                                    Tekli
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsBulk(true)}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${isBulk ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-indigo-600'}`}
                                >
                                    Toplu (Ardışık)
                                </button>
                            </div>
                        )}

                        <label className="text-sm font-bold">Bölge</label>
                        <select
                            required
                            className="mb-3 w-full rounded border p-2"
                            value={tblForm.section_id}
                            onChange={(e) => setTblForm({ ...tblForm, section_id: e.target.value })}
                        >
                            <option value="">Seçin</option>
                            {sections.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>

                        {isBulk ? (
                            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">Örnek İsim Ön Ek (TR)</label>
                                    <input
                                        className="w-full rounded border p-2 bg-white"
                                        value={bulkForm.prefix}
                                        onChange={(e) => setBulkForm({ ...bulkForm, prefix: e.target.value })}
                                        placeholder="Masa"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase">Başlangıç No</label>
                                        <input
                                            type="number"
                                            className="w-full rounded border p-2 bg-white"
                                            value={bulkForm.start}
                                            onChange={(e) => setBulkForm({ ...bulkForm, start: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase">Bitiş No</label>
                                        <input
                                            type="number"
                                            className="w-full rounded border p-2 bg-white"
                                            value={bulkForm.end}
                                            onChange={(e) => setBulkForm({ ...bulkForm, end: Number(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase">EN (Table)</label>
                                        <input
                                            className="w-full rounded border p-2 bg-white"
                                            value={bulkForm.translations_prefix.en}
                                            onChange={(e) => setBulkForm({ ...bulkForm, translations_prefix: { ...bulkForm.translations_prefix, en: e.target.value } })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase">DE (Tisch)</label>
                                        <input
                                            className="w-full rounded border p-2 bg-white"
                                            value={bulkForm.translations_prefix.de}
                                            onChange={(e) => setBulkForm({ ...bulkForm, translations_prefix: { ...bulkForm.translations_prefix, de: e.target.value } })}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <label className="text-sm font-bold">Ad (TR)</label>
                                <input
                                    required
                                    className="mb-3 w-full rounded border p-2"
                                    value={tblForm.name}
                                    onChange={(e) => setTblForm({ ...tblForm, name: e.target.value })}
                                />
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">İngilizce Ad (EN)</label>
                                        <input
                                            className="w-full rounded border p-2"
                                            value={tblForm.translations.en}
                                            onChange={(e) => setTblForm({ ...tblForm, translations: { ...tblForm.translations, en: e.target.value } })}
                                            placeholder="Table 1"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Almanca Ad (DE)</label>
                                        <input
                                            className="w-full rounded border p-2"
                                            value={tblForm.translations.de}
                                            onChange={(e) => setTblForm({ ...tblForm, translations: { ...tblForm.translations, de: e.target.value } })}
                                            placeholder="Tisch 1"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-sm font-bold">Kapasite</label>
                                <input
                                    type="number"
                                    className="w-full rounded border p-2"
                                    value={tblForm.capacity}
                                    onChange={(e) =>
                                        setTblForm({ ...tblForm, capacity: Number(e.target.value) })
                                    }
                                />
                            </div>
                            <div>
                                <label className="text-sm font-bold">Şekil</label>
                                <select
                                    className="w-full rounded border p-2"
                                    value={tblForm.shape}
                                    onChange={(e) => setTblForm({ ...tblForm, shape: e.target.value })}
                                >
                                    <option value="square">Kare</option>
                                    <option value="round">Yuvarlak</option>
                                    <option value="rect">Dikdörtgen</option>
                                </select>
                            </div>
                        </div>

                        {!isBulk && (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-sm font-bold">X (Konum)</label>
                                    <input
                                        type="number"
                                        className="w-full rounded border p-2"
                                        value={tblForm.position_x}
                                        onChange={(e) => setTblForm({ ...tblForm, position_x: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-bold">Y (Konum)</label>
                                    <input
                                        type="number"
                                        className="w-full rounded border p-2"
                                        value={tblForm.position_y}
                                        onChange={(e) => setTblForm({ ...tblForm, position_y: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="mt-6 flex justify-end gap-2 border-t pt-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setTblModal(false);
                                    setEditTable(null);
                                }}
                                className="rounded-lg px-4 py-2 text-slate-600 font-bold"
                            >
                                İptal
                            </button>
                            <button type="submit" className="rounded-lg bg-indigo-600 px-8 py-2 text-white font-bold shadow-md shadow-indigo-600/20 active:scale-95 transition-all">
                                {isBulk ? 'Hepsini Oluştur' : 'Kaydet'}
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
                confirmText={confirm?.confirmText || 'EVET'}
                cancelText="VAZGEÇ"
                type="danger"
                onConfirm={() => confirm?.onConfirm()}
            />
        </main>
    );
};
