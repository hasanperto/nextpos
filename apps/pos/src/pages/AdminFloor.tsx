import React, { useCallback, useEffect, useState } from 'react';
import { FiPlus, FiTrash2, FiRefreshCcw, FiSave, FiCopy, FiGrid, FiMove, FiEdit2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
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
    const { t } = usePosLocale();
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
    const [editSection, setEditSection] = useState<Section | null>(null);
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
        const posUrl = `${window.location.origin}/qr/${encodeURIComponent(qr)}?tenant=${encodeURIComponent(tenantId)}`;
        const webMenuBase = import.meta.env.VITE_QR_MENU_URL || '';
        const webUrl = webMenuBase
            ? `${webMenuBase.replace(/\/$/, '')}/table/${encodeURIComponent(qr)}?tenant=${encodeURIComponent(tenantId)}`
            : null;
        const url = webUrl || posUrl;
        void navigator.clipboard.writeText(url).then(() => {
            toast.success(webUrl ? t('admin.floor.qrCopiedWeb') : t('admin.floor.qrCopiedPos'));
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

    const openNewSection = () => {
        setEditSection(null);
        setSecForm({ name: '', floor: 0, sort_order: 0 });
        setSecModal(true);
    };

    const openEditSection = (s: Section) => {
        setEditSection(s);
        setSecForm({ name: s.name, floor: s.floor, sort_order: s.sort_order });
        setSecModal(true);
    };

    const saveSection = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = editSection ? `/api/v1/admin/sections/${editSection.id}` : '/api/v1/admin/sections';
        const method = editSection ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(secForm),
        });
        if (res.ok) {
            setSecModal(false);
            setEditSection(null);
            setSecForm({ name: '', floor: 0, sort_order: 0 });
            void load();
            toast.success(editSection ? t('admin.floor.sectionUpdated') : t('admin.floor.sectionCreated'));
        } else {
            const j = await res.json().catch(() => ({}));
            toast.error((j as { error?: string }).error || t('admin.floor.operationFailed'));
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
                toast.error(j.error || t('admin.floor.bulkCreateFailed'));
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
            title: t('admin.floor.confirmDeleteSectionTitle'),
            description: t('admin.floor.confirmDeleteSectionDesc'),
            confirmText: t('admin.floor.confirmDelete'),
            onConfirm: () => {
                void (async () => {
                    const res = await fetch(`/api/v1/admin/sections/${id}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders(),
                    });
                    if (res.ok) {
                        toast.success(t('admin.floor.sectionDeleted'));
                        void load();
                        return;
                    }
                    const j = await res.json().catch(() => ({}));
                    toast.error((j as { error?: string }).error || t('admin.floor.deleteFailed'));
                })();
            },
        });
    };

    const delTable = async (id: number) => {
        setConfirm({
            title: t('admin.floor.confirmDeleteTableTitle'),
            description: t('admin.floor.confirmDeleteTableDesc'),
            confirmText: t('admin.floor.confirmDelete'),
            onConfirm: () => {
                void (async () => {
                    const res = await fetch(`/api/v1/admin/tables/${id}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders(),
                    });
                    if (res.ok) {
                        toast.success(t('admin.floor.tableDeleted'));
                        void load();
                        return;
                    }
                    const j = await res.json().catch(() => ({}));
                    toast.error((j as { error?: string }).error || t('admin.floor.deleteFailed'));
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
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#020617] text-slate-100 font-sans relative">
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-[150px] pointer-events-none" />
            <header className="flex h-20 shrink-0 items-center justify-between border-b border-white/5 bg-[#0f172a]/95 backdrop-blur-md px-8">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-white">{t('admin.floor.title')}</h2>
                    <p className="text-sm text-slate-400">{t('admin.floor.subtitle')}</p>
                </div>
                <div className="flex gap-2">
                    <div className="flex bg-white/5 p-1 rounded-xl mr-4 border border-white/10">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            <FiGrid /> {t('admin.floor.view.list')}
                        </button>
                        <button
                            onClick={() => setViewMode('visual')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${viewMode === 'visual' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            <FiMove /> {t('admin.floor.view.floorPlan')}
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => void load()}
                        className="rounded-lg border border-white/10 p-2 text-slate-400 hover:bg-white/5 transition-colors"
                        title={t('admin.floor.refresh')}
                        aria-label={t('admin.floor.refresh')}
                    >
                        <FiRefreshCcw className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        type="button"
                        onClick={openNewSection}
                        className="flex items-center gap-2 rounded-lg bg-white/10 border border-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/[0.15] transition-colors"
                    >
                        <FiPlus /> {t('admin.floor.btn.section')}
                    </button>
                    <button
                        type="button"
                        onClick={openNewTable}
                        className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition-colors"
                    >
                        <FiPlus /> {t('admin.floor.btn.table')}
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-8">
                <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {sections.map((s) => (
                        <div
                            key={s.id}
                            className="flex items-center justify-between rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-md p-4"
                        >
                            <div>
                                <p className="font-bold text-white">{s.name}</p>
                                <p className="text-xs text-slate-400">
                                    {t('admin.floor.sectionMeta')
                                        .replace('{{floor}}', String(s.floor))
                                        .replace('{{order}}', String(s.sort_order))}
                                </p>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => openEditSection(s)}
                                    className="rounded-xl p-2 text-blue-400 hover:bg-blue-500/10 transition-colors"
                                    title={t('admin.floor.editSection')}
                                    aria-label={t('admin.floor.editSection')}
                                >
                                    <FiEdit2 />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => delSection(s.id)}
                                    className="rounded-xl p-2 text-red-400 hover:bg-red-500/10 transition-colors"
                                    title={t('admin.floor.deleteSection')}
                                    aria-label={t('admin.floor.deleteSection')}
                                >
                                    <FiTrash2 />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {viewMode === 'visual' ? (
                    <div className="flex-1 h-[calc(100vh-200px)] -m-8 relative">
                        <TableDesignerLayout initialSections={sections} initialTables={tables} />
                    </div>
                ) : (
                <div className="overflow-hidden rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-md">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-white/5 text-xs uppercase text-slate-400 border-b border-white/5">
                            <tr>
                                <th className="p-3">{t('admin.floor.col.table')}</th>
                                <th className="p-3">{t('admin.floor.col.section')}</th>
                                <th className="p-3">{t('admin.floor.col.capacity')}</th>
                                <th className="p-3">{t('admin.floor.col.shape')}</th>
                                <th className="p-3">{t('admin.floor.col.xy')}</th>
                                <th className="p-3">{t('admin.floor.col.qr')}</th>
                                <th className="p-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04] text-slate-300">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-slate-500">
                                        {t('admin.floor.loading')}
                                    </td>
                                </tr>
                            ) : (
                                tables.map((row) => (
                                    <tr key={row.id} className="hover:bg-white/[0.03] transition-colors">
                                        <td className="p-3 font-bold text-white">{row.name}</td>
                                        <td className="p-3 text-slate-400">{row.section_name || row.section_id}</td>
                                        <td className="p-3">{row.capacity}</td>
                                        <td className="p-3">{row.shape}</td>
                                        <td className="p-3 font-mono text-xs text-slate-400">
                                            {row.position_x ?? '—'} , {row.position_y ?? '—'}
                                        </td>
                                        <td className="max-w-[180px] p-3 text-xs text-slate-400">
                                            <span className="block truncate">{row.qr_code || '—'}</span>
                                            {row.qr_code && tenantId && (
                                                <button
                                                    type="button"
                                                    onClick={() => copyQrMenuUrl(row.qr_code)}
                                                    className="mt-1 flex items-center gap-1 font-bold text-blue-400 hover:underline"
                                                >
                                                    <FiCopy size={12} /> {t('admin.floor.copyLink')}
                                                </button>
                                            )}
                                        </td>
                                        <td className="p-3">
                                            <button
                                                type="button"
                                                onClick={() => openEditTable(row)}
                                                className="mr-2 text-blue-400 hover:underline"
                                            >
                                                {t('admin.floor.edit')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => delTable(row.id)}
                                                className="text-red-400 hover:text-red-300 transition-colors"
                                                title={t('admin.floor.deleteTable')}
                                                aria-label={t('admin.floor.deleteTable')}
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
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                    <form
                        onSubmit={saveSection}
                        className="w-full max-w-md rounded-2xl bg-[#0c1526] border border-white/10 p-6 shadow-2xl text-white"
                    >
                        <h3 className="mb-4 text-lg font-bold text-white">
                            {editSection ? t('admin.floor.modal.editSection') : t('admin.floor.modal.newSection')}
                        </h3>
                        <label className="mb-2 block text-sm font-bold text-slate-300">{t('admin.floor.field.name')}</label>
                        <input
                            required
                            className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-indigo-500"
                            value={secForm.name}
                            onChange={(e) => setSecForm({ ...secForm, name: e.target.value })}
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-sm font-bold text-slate-300">{t('admin.floor.field.floor')}</label>
                                <input
                                    type="number"
                                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-indigo-500"
                                    value={secForm.floor}
                                    onChange={(e) =>
                                        setSecForm({ ...secForm, floor: Number(e.target.value) })
                                    }
                                />
                            </div>
                            <div>
                                <label className="text-sm font-bold text-slate-300">{t('admin.floor.field.sortOrder')}</label>
                                <input
                                    type="number"
                                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-indigo-500"
                                    value={secForm.sort_order}
                                    onChange={(e) =>
                                        setSecForm({ ...secForm, sort_order: Number(e.target.value) })
                                    }
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setSecModal(false);
                                    setEditSection(null);
                                }}
                                className="rounded-xl px-4 py-2 text-slate-400 hover:bg-white/5 font-bold transition-colors"
                            >
                                {t('admin.floor.cancel')}
                            </button>
                            <button
                                type="submit"
                                className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 font-bold shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
                            >
                                <FiSave /> {t('admin.floor.save')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {tblModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                    <form
                        onSubmit={saveTable}
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[#0c1526] border border-white/10 p-6 shadow-2xl text-white"
                    >
                        <h3 className="mb-4 text-lg font-bold text-white">
                            {editTable ? t('admin.floor.modal.editTable') : t('admin.floor.modal.newTable')}
                        </h3>

                        {!editTable && (
                            <div className="mb-4 flex bg-white/5 p-1 rounded-xl border border-white/10">
                                <button
                                    type="button"
                                    onClick={() => setIsBulk(false)}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${!isBulk ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    {t('admin.floor.mode.single')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsBulk(true)}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${isBulk ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    {t('admin.floor.mode.bulk')}
                                </button>
                            </div>
                        )}

                        <label className="text-sm font-bold text-slate-300">{t('admin.floor.field.section')}</label>
                        <select
                            required
                            className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-indigo-500"
                            value={tblForm.section_id}
                            onChange={(e) => setTblForm({ ...tblForm, section_id: e.target.value })}
                        >
                            <option value="" className="bg-[#0c1526]">{t('admin.floor.select')}</option>
                            {sections.map((s) => (
                                <option key={s.id} value={s.id} className="bg-[#0c1526]">
                                    {s.name}
                                </option>
                            ))}
                        </select>

                        {isBulk ? (
                            <div className="space-y-3 bg-white/5 p-4 rounded-xl border border-white/10 mb-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase">{t('admin.floor.bulk.prefix')}</label>
                                    <input
                                        className="w-full rounded-xl border border-white/10 bg-[#0c1526] px-4 py-2.5 text-white outline-none focus:border-indigo-500"
                                        value={bulkForm.prefix}
                                        onChange={(e) => setBulkForm({ ...bulkForm, prefix: e.target.value })}
                                        placeholder={t('admin.floor.tablePrefixPlaceholder')}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase">{t('admin.floor.bulk.startNo')}</label>
                                        <input
                                            type="number"
                                            className="w-full rounded-xl border border-white/10 bg-[#0c1526] px-4 py-2.5 text-white outline-none focus:border-indigo-500"
                                            value={bulkForm.start}
                                            onChange={(e) => setBulkForm({ ...bulkForm, start: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase">{t('admin.floor.bulk.endNo')}</label>
                                        <input
                                            type="number"
                                            className="w-full rounded-xl border border-white/10 bg-[#0c1526] px-4 py-2.5 text-white outline-none focus:border-indigo-500"
                                            value={bulkForm.end}
                                            onChange={(e) => setBulkForm({ ...bulkForm, end: Number(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase">EN (Table)</label>
                                        <input
                                            className="w-full rounded-xl border border-white/10 bg-[#0c1526] px-4 py-2.5 text-white outline-none focus:border-indigo-500"
                                            value={bulkForm.translations_prefix.en}
                                            onChange={(e) => setBulkForm({ ...bulkForm, translations_prefix: { ...bulkForm.translations_prefix, en: e.target.value } })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase">DE (Tisch)</label>
                                        <input
                                            className="w-full rounded-xl border border-white/10 bg-[#0c1526] px-4 py-2.5 text-white outline-none focus:border-indigo-500"
                                            value={bulkForm.translations_prefix.de}
                                            onChange={(e) => setBulkForm({ ...bulkForm, translations_prefix: { ...bulkForm.translations_prefix, de: e.target.value } })}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <label className="text-sm font-bold text-slate-300">{t('admin.floor.field.nameTr')}</label>
                                <input
                                    required
                                    className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-indigo-500"
                                    value={tblForm.name}
                                    onChange={(e) => setTblForm({ ...tblForm, name: e.target.value })}
                                />
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">İngilizce Ad (EN)</label>
                                        <input
                                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-indigo-500"
                                            value={tblForm.translations.en}
                                            onChange={(e) => setTblForm({ ...tblForm, translations: { ...tblForm.translations, en: e.target.value } })}
                                            placeholder="Table 1"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Almanca Ad (DE)</label>
                                        <input
                                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-indigo-500"
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
                                <label className="text-sm font-bold text-slate-300">{t('admin.floor.field.capacity')}</label>
                                <input
                                    type="number"
                                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-indigo-500"
                                    value={tblForm.capacity}
                                    onChange={(e) =>
                                        setTblForm({ ...tblForm, capacity: Number(e.target.value) })
                                    }
                                />
                            </div>
                            <div>
                                <label className="text-sm font-bold text-slate-300">{t('admin.floor.col.shape')}</label>
                                <select
                                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-indigo-500"
                                    value={tblForm.shape}
                                    onChange={(e) => setTblForm({ ...tblForm, shape: e.target.value })}
                                >
                                    <option value="square" className="bg-[#0c1526]">{t('admin.floor.shape.square')}</option>
                                    <option value="round" className="bg-[#0c1526]">{t('admin.floor.shape.round')}</option>
                                    <option value="rect" className="bg-[#0c1526]">{t('admin.floor.shape.rect')}</option>
                                </select>
                            </div>
                        </div>

                        {!isBulk && (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-sm font-bold text-slate-300">X (Konum)</label>
                                    <input
                                        type="number"
                                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-indigo-500"
                                        value={tblForm.position_x}
                                        onChange={(e) => setTblForm({ ...tblForm, position_x: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-bold text-slate-300">Y (Konum)</label>
                                    <input
                                        type="number"
                                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-indigo-500"
                                        value={tblForm.position_y}
                                        onChange={(e) => setTblForm({ ...tblForm, position_y: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setTblModal(false);
                                    setEditTable(null);
                                }}
                                className="rounded-xl px-4 py-2 text-slate-400 hover:bg-white/5 font-bold transition-colors"
                            >
                                {t('admin.floor.cancel')}
                            </button>
                            <button type="submit" className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-8 py-2 text-white font-bold shadow-lg shadow-indigo-600/20 active:scale-95 transition-all">
                                {isBulk ? t('admin.floor.bulk.createAll') : t('admin.floor.save')}
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
