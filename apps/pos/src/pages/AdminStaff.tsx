import React, { useCallback, useEffect, useState } from 'react';
import { 
    FiPlus, FiTrash2, FiRefreshCcw, FiEdit2, 
    FiUsers, FiCheckCircle, FiAlertCircle, FiShield, FiUser, FiLock
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { ModernConfirmModal } from '../features/terminal/components/ModernConfirmModal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { usePosLocale } from '../contexts/PosLocaleContext';

type UserRow = {
    id: number;
    username: string;
    name: string;
    role: string;
    pin_code: string | null;
    status: string;
    last_login: string | null;
    device_id?: string | null;
    waiter_all_sections?: number | boolean | null;
    waiter_section_id?: number | null;
    kitchen_station?: string | null;
};

type SectionRow = { id: number; name: string };

const ROLES = ['admin', 'cashier', 'waiter', 'kitchen', 'courier'] as const;

function waiterZoneLabel(
    user: UserRow,
    sectionList: SectionRow[],
    t: (key: string) => string
): string {
    if (user.role === 'kitchen') {
        const ks = user.kitchen_station || 'all';
        if (ks === 'all') return t('admin.staff.zone.allKitchen');
        if (ks === 'hot') return t('admin.staff.zone.hotKitchen');
        if (ks === 'cold') return t('admin.staff.zone.cold');
        if (ks === 'bar') return t('admin.staff.zone.bar');
        return ks;
    }
    if (user.role !== 'waiter') return '—';
    const all =
        user.waiter_all_sections === undefined ||
        user.waiter_all_sections === null ||
        user.waiter_all_sections === true ||
        user.waiter_all_sections === 1 ||
        String(user.waiter_all_sections).toLowerCase() === 'true';
    if (all) return t('admin.staff.zone.allFloor');
    const sid = user.waiter_section_id;
    if (sid == null) return t('admin.staff.zone.notSelected');
    const name = sectionList.find((section) => section.id === Number(sid))?.name;
    return name ?? t('admin.staff.zone.number').replace('{{id}}', String(sid));
}

function roleLabel(role: string, t: (key: string) => string): string {
    const key = `admin.staff.role.${role}` as const;
    const translated = t(key);
    return translated !== key ? translated : role.toUpperCase();
}

export const AdminStaff: React.FC = () => {
    const { t } = usePosLocale();
    const { getAuthHeaders, logout } = useAuthStore();
    const [users, setUsers] = useState<UserRow[]>([]);
    const [sections, setSections] = useState<SectionRow[]>([]);
    const [confirm, setConfirm] = useState<null | { title: string; description: string; confirmText: string; type: 'danger' | 'warning' | 'info'; onConfirm: () => void }>(null);
    const [maxUsers, setMaxUsers] = useState(0);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [editing, setEditing] = useState<UserRow | null>(null);
    const [form, setForm] = useState({
        username: '',
        password: '',
        name: '',
        role: 'waiter' as (typeof ROLES)[number],
        pinCode: '',
        status: 'active',
        waiterAllSections: true,
        waiterSectionId: null as number | null,
        kitchenStation: 'all',
    });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/users', { headers: getAuthHeaders() });
            if (res.status === 401) {
                logout();
                return;
            }
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users || []);
                setMaxUsers(data.maxUsers || 0);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders, logout]);

    const loadSections = useCallback(async () => {
        try {
            const res = await fetch('/api/v1/tables/sections', { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setSections(Array.isArray(data) ? data : []);
            }
        } catch {
            setSections([]);
        }
    }, [getAuthHeaders]);

    useEffect(() => {
        void load();
        void loadSections();
    }, [load, loadSections]);

    const canAdd = maxUsers === 0 || maxUsers >= 9999 || users.length < maxUsers;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!editing && !canAdd) {
            toast.error(t('admin.staff.err.limit').replace('{{max}}', String(maxUsers)));
            return;
        }

        if (form.pinCode && form.pinCode.length !== 6) {
            toast.error(t('admin.staff.err.pinLength'));
            return;
        }

        const body: Record<string, unknown> = {
            username: form.username,
            name: form.name,
            role: form.role,
            status: form.status,
        };
        if (form.pinCode) body.pinCode = form.pinCode;
        if (form.password) body.password = form.password;
        if (form.role === 'waiter') {
            body.waiterAllSections = form.waiterAllSections;
            body.waiterSectionId = form.waiterAllSections ? null : form.waiterSectionId;
        }
        if (form.role === 'kitchen') {
            body.kitchenStation = form.kitchenStation;
        }

        if (!editing && !form.password) {
            toast.error(t('admin.staff.err.passwordRequired'));
            return;
        }
        if (form.role === 'waiter' && !form.waiterAllSections && (form.waiterSectionId == null || !Number.isFinite(form.waiterSectionId))) {
            toast.error(t('admin.staff.err.waiterZone'));
            return;
        }

        const url = editing ? `/api/v1/users/${editing.id}` : '/api/v1/users';
        const method = editing ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        
        if (res.ok) {
            setModal(false);
            setEditing(null);
            setForm({
                username: '',
                password: '',
                name: '',
                role: 'waiter',
                pinCode: '',
                status: 'active',
                waiterAllSections: true,
                waiterSectionId: null,
                kitchenStation: 'all',
            });
            void load();
        } else {
            const j = await res.json().catch(() => ({}));
            toast.error((j as { error?: string }).error || t('admin.staff.err.operation'));
        }
    };

    const del = async (id: number) => {
        setConfirm({
            title: t('admin.staff.confirm.deleteTitle'),
            description: t('admin.staff.confirm.deleteDesc'),
            confirmText: t('admin.staff.confirm.deleteBtn'),
            type: 'danger',
            onConfirm: () => {
                void (async () => {
                    const res = await fetch(`/api/v1/users/${id}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders(),
                    });
                    if (!res.ok) {
                        const j = await res.json().catch(() => ({}));
                        toast.error((j as { error?: string }).error || t('admin.staff.err.delete'));
                        return;
                    }
                    toast.success(t('admin.staff.success.deleted'));
                    void load();
                })();
            },
        });
    };

    const resetDevice = async (id: number) => {
        setConfirm({
            title: t('admin.staff.confirm.resetDeviceTitle'),
            description: t('admin.staff.confirm.resetDeviceDesc'),
            confirmText: t('admin.staff.confirm.resetBtn'),
            type: 'warning',
            onConfirm: () => {
                void (async () => {
                    const res = await fetch(`/api/v1/users/${id}/reset-device`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                    });
                    if (!res.ok) {
                        const j = await res.json().catch(() => ({}));
                        toast.error((j as { error?: string }).error || t('admin.staff.err.reset'));
                        return;
                    }
                    toast.success(t('admin.staff.success.deviceReset'));
                    void load();
                })();
            },
        });
    };

    const resetAllDevices = async () => {
        setConfirm({
            title: t('admin.staff.confirm.resetAllTitle'),
            description: t('admin.staff.confirm.resetAllDesc'),
            confirmText: t('admin.staff.confirm.resetBtn'),
            type: 'warning',
            onConfirm: () => {
                void (async () => {
                    const res = await fetch('/api/v1/users/reset-devices/all', {
                        method: 'POST',
                        headers: getAuthHeaders(),
                    });
                    if (!res.ok) {
                        const j = await res.json().catch(() => ({}));
                        toast.error((j as { error?: string }).error || t('admin.staff.err.reset'));
                        return;
                    }
                    toast.success(t('admin.staff.success.allDevicesReset'));
                    void load();
                })();
            },
        });
    };

    const openEdit = (u: UserRow) => {
        setEditing(u);
        const wAll =
            u.waiter_all_sections === undefined || u.waiter_all_sections === null
                ? true
                : u.waiter_all_sections === true ||
                  u.waiter_all_sections === 1 ||
                  String(u.waiter_all_sections).toLowerCase() === 'true';
        setForm({
            username: u.username,
            password: '',
            name: u.name,
            role: u.role as (typeof ROLES)[number],
            pinCode: u.pin_code || '',
            status: u.status || 'active',
            waiterAllSections: wAll,
            waiterSectionId: u.waiter_section_id != null ? Number(u.waiter_section_id) : null,
            kitchenStation: u.kitchen_station || 'all',
        });
        setModal(true);
    };

    return (
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#020617] text-slate-100 font-sans relative">
            {/* Ambient glows */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[20%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[150px]" />
            </div>

            <header className="flex flex-col md:flex-row gap-4 md:h-24 shrink-0 md:items-center justify-between border-b border-white/5 bg-[#0f172a]/95 backdrop-blur-md p-4 md:px-8 z-10">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-indigo-600/10 border border-indigo-500/35 flex items-center justify-center text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                        <FiShield size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white uppercase italic tracking-tight">{t('admin.staff.title')}</h2>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{t('admin.staff.subtitle')}</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="p-3.5 bg-white/5 border border-white/10 rounded-2xl text-slate-400 hover:bg-white/10 transition-all cursor-pointer animate-none"
                        title={t('admin.staff.refresh')}
                        aria-label={t('admin.staff.refresh')}
                    >
                        <FiRefreshCcw className={loading ? 'animate-spin' : ''} size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={() => void resetAllDevices()}
                        className="px-6 py-3.5 rounded-2xl border border-amber-500/25 bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                    >
                        {t('admin.staff.resetAllDevices')}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (!canAdd) {
                                toast.error(t('admin.staff.err.limitShort').replace('{{max}}', String(maxUsers)));
                                return;
                            }
                            setEditing(null);
                            setForm({
                                username: '',
                                password: '',
                                name: '',
                                role: 'waiter',
                                pinCode: '',
                                status: 'active',
                                waiterAllSections: true,
                                waiterSectionId: null,
                                kitchenStation: 'all',
                            });
                            setModal(true);
                        }}
                        disabled={!canAdd}
                        className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                            canAdd 
                                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20' 
                                : 'bg-slate-800 text-slate-650 border border-white/5 cursor-not-allowed'
                        }`}
                    >
                        <FiPlus size={14} /> {t('admin.staff.addStaff')}
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-4 md:p-8 space-y-8 z-10">
                {/* LİSANS DURUM KARTLARI */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white/[0.02] border border-white/5 backdrop-blur-md p-6 rounded-[28px] shadow-2xl flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-black text-xl shadow-inner group">
                             <FiUsers className="group-hover:scale-110 transition-transform" size={24}/>
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('admin.staff.activeStaff')}</p>
                            <p className="text-2xl font-black text-white">{users.length} <span className="text-slate-600 text-lg">/ {maxUsers}</span></p>
                        </div>
                    </div>
                    
                    <div className="bg-white/[0.02] border border-white/5 backdrop-blur-md p-6 rounded-[28px] shadow-2xl flex items-center gap-5">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner ${
                            canAdd 
                                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
                                : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                        }`}>
                             {canAdd ? <FiCheckCircle size={24}/> : <FiAlertCircle size={24}/>}
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('admin.staff.licenseStatus')}</p>
                            <p className={`text-md font-black uppercase tracking-tight ${canAdd ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {canAdd ? t('admin.staff.canAdd') : t('admin.staff.limitReached')}
                            </p>
                        </div>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 backdrop-blur-md p-6 rounded-[28px] shadow-2xl flex items-center gap-5 relative overflow-hidden group">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                             <FiShield size={24}/>
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('admin.staff.securityProtocol')}</p>
                            <p className="text-md font-black text-white uppercase tracking-tight">{t('admin.staff.devicePin')}</p>
                        </div>
                    </div>
                </div>

                <div className="overflow-hidden rounded-[2rem] border border-white/5 bg-white/[0.02] backdrop-blur-md shadow-2xl">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.01] text-[9px] font-black uppercase text-slate-500 tracking-widest">
                                <th className="p-5">{t('admin.staff.col.name')}</th>
                                <th className="p-5">{t('admin.staff.col.username')}</th>
                                <th className="p-5">{t('admin.staff.col.role')}</th>
                                <th className="p-5">{t('admin.staff.col.zone')}</th>
                                <th className="p-5 text-center">{t('admin.staff.col.pin')}</th>
                                <th className="p-5">{t('admin.staff.col.lastLogin')}</th>
                                <th className="p-5">{t('admin.staff.col.device')}</th>
                                <th className="p-5" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-bold">
                            {users.map((row) => {
                                const roleColors: Record<string, string> = {
                                    admin: 'bg-purple-500/10 border border-purple-500/20 text-purple-400',
                                    cashier: 'bg-blue-500/10 border border-blue-500/20 text-blue-400',
                                    waiter: 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400',
                                    kitchen: 'bg-orange-500/10 border border-orange-500/20 text-orange-400',
                                    courier: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400',
                                };
                                const badgeClass = roleColors[row.role] || 'bg-white/5 border border-white/10 text-slate-400';

                                return (
                                    <tr key={row.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="p-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-black text-slate-300">
                                                    {row.name.split(' ').map(n=>n[0]).join('')}
                                                </div>
                                                <span className="font-bold text-white uppercase text-xs tracking-wide">{row.name}</span>
                                            </div>
                                        </td>
                                        <td className="p-5 font-mono text-[10px] text-slate-400">@{row.username}</td>
                                        <td className="p-5">
                                            <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-wider ${badgeClass}`}>
                                                {roleLabel(row.role, t)}
                                            </span>
                                        </td>
                                        <td className="p-5 text-xs text-slate-300 max-w-[140px] truncate" title={waiterZoneLabel(row, sections, t)}>
                                            {waiterZoneLabel(row, sections, t)}
                                        </td>
                                        <td className="p-5 font-mono text-center font-black text-indigo-400 tracking-wider text-xs">{row.pin_code || '-'}</td>
                                        <td className="p-5">
                                            <div className="text-xs text-slate-200">
                                                {row.last_login ? new Date(row.last_login).toLocaleDateString('tr-TR') : '-'}
                                            </div>
                                            <div className="text-[10px] font-semibold text-slate-500">
                                                {row.last_login ? new Date(row.last_login).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </div>
                                        </td>
                                        <td className="p-5">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-[10px] text-slate-500 select-all">
                                                    {row.device_id ? String(row.device_id).slice(0, 8) : '—'}
                                                </span>
                                                {row.device_id && (
                                                    <button
                                                        type="button"
                                                        onClick={() => resetDevice(row.id)}
                                                        className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/25 rounded-lg text-[9px] font-black uppercase tracking-wider text-amber-400 hover:bg-amber-500/20 transition-all cursor-pointer"
                                                    >
                                                        {t('admin.staff.unbindDevice')}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-5">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    type="button"
                                                    onClick={() => openEdit(row)}
                                                    className="p-2 rounded-xl bg-blue-600/10 border border-blue-500/30 text-blue-400 hover:bg-blue-600/25 hover:text-blue-300 transition-all cursor-pointer"
                                                    title={t('admin.staff.edit')}
                                                    aria-label={t('admin.staff.edit')}
                                                >
                                                    <FiEdit2 size={13} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => del(row.id)}
                                                    className="p-2 rounded-xl bg-rose-600/10 border border-rose-500/30 text-rose-450 hover:bg-rose-600/25 hover:text-rose-350 transition-all cursor-pointer"
                                                    disabled={row.role === 'admin'}
                                                    title={t('admin.staff.delete')}
                                                    aria-label={t('admin.staff.delete')}
                                                >
                                                    <FiTrash2 size={13} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {modal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <form onSubmit={submit} className="w-full max-w-md rounded-[2.5rem] bg-[#0f172a]/95 border border-white/10 p-8 shadow-2xl animate-in zoom-in-95 duration-300 text-white">
                        <h3 className="mb-6 text-base font-black text-white flex items-center gap-3 border-b border-white/5 pb-4">
                            <div className="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-500/35 flex items-center justify-center text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                                <FiPlus size={16}/>
                            </div>
                            {editing ? t('admin.staff.modal.edit') : t('admin.staff.modal.add')}
                        </h3>
                        <div className="space-y-4 mb-6">
                             <Input
                                 required
                                 label={t('admin.staff.form.fullName')}
                                 placeholder={t('admin.staff.form.fullNamePh')}
                                 value={form.name || ''}
                                 onChange={(v) => setForm({ ...form, name: v })}
                                 icon={<FiUser className="w-4 h-4" />}
                                 className="bg-white/5 border border-white/10 text-white rounded-xl focus:border-indigo-500"
                             />
                             <Input
                                 required
                                 label={t('admin.staff.form.username')}
                                 placeholder={t('admin.staff.form.usernamePh')}
                                 value={form.username || ''}
                                 onChange={(v) => setForm({ ...form, username: v })}
                                 disabled={!!editing}
                                 icon={<FiUsers className="w-4 h-4" />}
                                 className="bg-white/5 border border-white/10 text-white rounded-xl focus:border-indigo-500"
                             />
                             <Input
                                 type="password"
                                 label={t('admin.staff.form.password')}
                                 placeholder="••••••••"
                                 value={form.password || ''}
                                 onChange={(v) => setForm({ ...form, password: v })}
                                 icon={<FiLock className="w-4 h-4" />}
                                 className="bg-white/5 border border-white/10 text-white rounded-xl focus:border-indigo-500"
                             />
                             <div className="grid grid-cols-2 gap-4">
                                 <Select
                                     label={t('admin.staff.form.role')}
                                     value={form.role}
                                     onChange={(v) => {
                                         const r = v as (typeof ROLES)[number];
                                         setForm({
                                             ...form,
                                             role: r,
                                             waiterAllSections: r === 'waiter' ? form.waiterAllSections : true,
                                             waiterSectionId: r === 'waiter' ? form.waiterSectionId : null,
                                         });
                                     }}
                                     icon={<FiShield className="w-4 h-4" />}
                                     options={ROLES.map((r) => ({ v: r, l: roleLabel(r, t).toUpperCase() }))}
                                     className="bg-[#0f172a] border border-white/10 text-white rounded-xl focus:border-indigo-500"
                                 />
                                 <Input
                                     label={t('admin.staff.form.pin')}
                                     placeholder="000000"
                                     value={form.pinCode || ''}
                                     onChange={(v) => setForm({ ...form, pinCode: v })}
                                     mask="pin"
                                     icon={<FiLock className="w-4 h-4" />}
                                     className="bg-white/5 border border-white/10 text-white rounded-xl focus:border-indigo-500 font-mono"
                                 />
                             </div>
                             {form.role === 'waiter' && (
                                 <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-4 space-y-3">
                                     <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                                         {t('admin.staff.waiter.title')}
                                     </p>
                                     <p className="text-xs text-slate-400 leading-snug">
                                         {t('admin.staff.waiter.hint')}
                                     </p>
                                     <div className="flex flex-wrap gap-2">
                                         <button
                                             type="button"
                                             onClick={() =>
                                                 setForm({ ...form, waiterAllSections: true, waiterSectionId: null })
                                             }
                                             className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                                 form.waiterAllSections
                                                     ? 'bg-indigo-600 text-white shadow-md'
                                                     : 'bg-white/5 text-slate-400 border border-white/10'
                                             }`}
                                         >
                                             {t('admin.staff.waiter.allZones')}
                                         </button>
                                         <button
                                             type="button"
                                             onClick={() => setForm({ ...form, waiterAllSections: false })}
                                             className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                                 !form.waiterAllSections
                                                     ? 'bg-indigo-600 text-white shadow-md'
                                                     : 'bg-white/5 text-slate-400 border border-white/10'
                                             }`}
                                         >
                                             {t('admin.staff.waiter.singleZone')}
                                         </button>
                                     </div>
                                     {!form.waiterAllSections && (
                                          <Select
                                              required={!form.waiterAllSections}
                                              label={t('admin.staff.waiter.zone')}
                                              value={form.waiterSectionId ?? ''}
                                              onChange={(v) =>
                                                  setForm({
                                                      ...form,
                                                      waiterSectionId: v ? Number(v) : null,
                                                  })
                                              }
                                              icon={<FiShield className="w-4 h-4" />}
                                              options={[
                                                  { v: '', l: t('admin.staff.waiter.selectZone') },
                                                  ...sections.map((section) => ({ v: section.id, l: section.name }))
                                              ]}
                                              className="bg-[#0f172a] border border-white/10 text-white rounded-xl focus:border-indigo-500"
                                          />
                                      )}
                                 </div>
                             )}
                             {form.role === 'kitchen' && (
                                 <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-4 space-y-3">
                                     <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">
                                         {t('admin.staff.kitchen.title')}
                                     </p>
                                     <p className="text-xs text-slate-400 leading-snug">
                                         {t('admin.staff.kitchen.hint')}
                                     </p>
                                     <Select
                                          label={t('admin.staff.kitchen.station')}
                                          value={form.kitchenStation}
                                          onChange={(v) => setForm({ ...form, kitchenStation: v })}
                                          icon={<FiShield className="w-4 h-4" />}
                                          options={[
                                              { v: 'all', l: t('admin.staff.kitchen.allStations') },
                                              { v: 'hot', l: t('admin.staff.zone.hotKitchen') },
                                              { v: 'cold', l: t('admin.staff.zone.cold') },
                                              { v: 'bar', l: t('admin.staff.zone.bar') }
                                          ]}
                                          className="bg-[#0f172a] border border-white/10 text-white rounded-xl focus:border-indigo-500"
                                      />
                                 </div>
                              )}
                         </div>
                         <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                             <button 
                                 type="button" 
                                 onClick={() => setModal(false)} 
                                 className="px-6 py-3 rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                             >
                                 {t('admin.staff.cancel')}
                             </button>
                             <button 
                                 type="submit" 
                                 className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
                             >
                                 {t('admin.staff.submit')}
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
                confirmText={confirm?.confirmText || t('admin.staff.confirm.yes')}
                cancelText={t('admin.staff.cancel')}
                type={confirm?.type || 'warning'}
                onConfirm={() => confirm?.onConfirm()}
            />
        </main>
    );
};
