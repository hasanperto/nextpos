import React, { useCallback, useEffect, useState } from 'react';
import { 
    FiPlus, FiTrash2, FiRefreshCcw, FiEdit2, 
    FiUsers, FiCheckCircle, FiAlertCircle, FiShield
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { ModernConfirmModal } from '../features/terminal/components/ModernConfirmModal';

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

function waiterZoneLabel(u: UserRow, sectionList: SectionRow[]): string {
    if (u.role === 'kitchen') {
        const ks = u.kitchen_station || 'all';
        if (ks === 'all') return 'Tüm Mutfak';
        if (ks === 'hot') return 'Ana Mutfak (Sıcak)';
        if (ks === 'cold') return 'Soğuk';
        if (ks === 'bar') return 'Bar';
        return ks;
    }
    if (u.role !== 'waiter') return '—';
    const all =
        u.waiter_all_sections === undefined ||
        u.waiter_all_sections === null ||
        u.waiter_all_sections === true ||
        u.waiter_all_sections === 1 ||
        String(u.waiter_all_sections).toLowerCase() === 'true';
    if (all) return 'Tüm salon';
    const sid = u.waiter_section_id;
    if (sid == null) return 'Bölge seçilmedi';
    const name = sectionList.find((s) => s.id === Number(sid))?.name;
    return name ?? `Bölge #${sid}`;
}

export const AdminStaff: React.FC = () => {
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

    const canAdd = users.length < maxUsers;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!editing && !canAdd) {
            toast.error(`Lisanstaki personel limitine ulaştınız (${maxUsers}). Lütfen paketinizi yükseltin.`);
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
            toast.error('Yeni kullanıcı için şifre gerekli. Lütfen şifre alanını doldurun.');
            return;
        }
        if (form.role === 'waiter' && !form.waiterAllSections && (form.waiterSectionId == null || !Number.isFinite(form.waiterSectionId))) {
            toast.error('Garson için tek bölge seçildi. Lütfen bir bölge seçin.');
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
            toast.error((j as { error?: string }).error || 'İşlem başarısız. Lütfen tekrar deneyin.');
        }
    };

    const del = async (id: number) => {
        setConfirm({
            title: 'Personeli sil',
            description: 'Bu personeli silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
            confirmText: 'SİL',
            type: 'danger',
            onConfirm: () => {
                void (async () => {
                    const res = await fetch(`/api/v1/users/${id}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders(),
                    });
                    if (!res.ok) {
                        const j = await res.json().catch(() => ({}));
                        toast.error((j as { error?: string }).error || 'Silinemedi. Lütfen tekrar deneyin.');
                        return;
                    }
                    toast.success('Personel silindi');
                    void load();
                })();
            },
        });
    };

    const resetDevice = async (id: number) => {
        setConfirm({
            title: 'Cihaz kilidini sıfırla',
            description: 'Bu personelin cihaz kilidini sıfırlamak istiyor musunuz?',
            confirmText: 'SIFIRLA',
            type: 'warning',
            onConfirm: () => {
                void (async () => {
                    const res = await fetch(`/api/v1/users/${id}/reset-device`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                    });
                    if (!res.ok) {
                        const j = await res.json().catch(() => ({}));
                        toast.error((j as { error?: string }).error || 'Sıfırlanamadı. Lütfen tekrar deneyin.');
                        return;
                    }
                    toast.success('Cihaz kilidi sıfırlandı');
                    void load();
                })();
            },
        });
    };

    const resetAllDevices = async () => {
        setConfirm({
            title: 'Tüm cihaz kilitlerini sıfırla',
            description: 'Tüm personelin cihaz kilidini sıfırlamak istiyor musunuz?',
            confirmText: 'SIFIRLA',
            type: 'warning',
            onConfirm: () => {
                void (async () => {
                    const res = await fetch('/api/v1/users/reset-devices/all', {
                        method: 'POST',
                        headers: getAuthHeaders(),
                    });
                    if (!res.ok) {
                        const j = await res.json().catch(() => ({}));
                        toast.error((j as { error?: string }).error || 'Sıfırlanamadı. Lütfen tekrar deneyin.');
                        return;
                    }
                    toast.success('Cihaz kilitleri sıfırlandı');
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
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#F8FAFC]">
            <header className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center text-white">
                        <FiShield size={20} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-800">Personel & Erişim</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Sistem kullanıcılarını yönetin</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 transition-colors"
                        title="Yenile"
                        aria-label="Yenile"
                    >
                        <FiRefreshCcw className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        type="button"
                        onClick={() => void resetAllDevices()}
                        className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-amber-700 hover:bg-amber-100 transition-colors"
                    >
                        Cihaz Sıfırla
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (!canAdd) {
                                toast.error(`Limit doldu (${maxUsers}). Yeni ekleme yapılamaz.`);
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
                        className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-black text-white shadow-lg transition-all active:scale-95 ${canAdd ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200' : 'bg-slate-400 cursor-not-allowed'}`}
                    >
                        <FiPlus /> YENİ PERSONEL EKLE
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-8 space-y-8">
                {/* LİSANS DURUM KARTLARI */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xl shadow-inner group">
                             <FiUsers className="group-hover:scale-110 transition-transform"/>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AKTİF PERSONEL</p>
                            <p className="text-2xl font-black text-slate-800">{users.length} <span className="text-slate-300 text-lg">/ {maxUsers}</span></p>
                        </div>
                    </div>
                    
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-5">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner ${canAdd ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                             {canAdd ? <FiCheckCircle /> : <FiAlertCircle />}
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">LİSANS DURUMU</p>
                            <p className="text-sm font-black text-slate-800 uppercase tracking-tight">
                                {canAdd ? 'EKLEME YAPILABİLİR' : 'LİMİT DOLDU'}
                            </p>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-5 relative overflow-hidden group">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                             <FiShield size={24}/>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">GÜVENLİK</p>
                            <p className="text-sm font-black text-slate-800 uppercase tracking-tight">2FA & PIN AKTİF</p>
                        </div>
                    </div>
                </div>

                <div className="overflow-hidden rounded-[32px] border border-slate-100 bg-white shadow-xl shadow-slate-200/40">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-slate-50/50 border-b border-slate-100">
                            <tr>
                                <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ad Soyad</th>
                                <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Kullanıcı Adı</th>
                                <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rol</th>
                                <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Salon / Bölge</th>
                                <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">PIN</th>
                                <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Son Giriş</th>
                                <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cihaz</th>
                                <th className="p-5" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {users.map((u) => (
                                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="p-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500">
                                                {u.name.split(' ').map(n=>n[0]).join('')}
                                            </div>
                                            <span className="font-bold text-slate-700">{u.name}</span>
                                        </div>
                                    </td>
                                    <td className="p-5 font-mono text-[11px] text-slate-400">{u.username}</td>
                                    <td className="p-5">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600`}>
                                            {u.role}
                                        </span>
                                    </td>
                                    <td className="p-5 text-xs font-bold text-slate-600 max-w-[140px] truncate" title={waiterZoneLabel(u, sections)}>
                                        {waiterZoneLabel(u, sections)}
                                    </td>
                                    <td className="p-5 font-mono text-center font-black text-blue-600 tracking-widest">{u.pin_code || '-'}</td>
                                    <td className="p-5">
                                        <div className="text-xs font-bold text-slate-600">
                                            {u.last_login ? new Date(u.last_login).toLocaleDateString('tr-TR') : '-'}
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                            {u.last_login ? new Date(u.last_login).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-[11px] text-slate-400">
                                                {u.device_id ? String(u.device_id).slice(0, 8) : '—'}
                                            </span>
                                            {u.device_id && (
                                                <button
                                                    type="button"
                                                    onClick={() => resetDevice(u.id)}
                                                    className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700 hover:bg-amber-100"
                                                >
                                                    Sıfırla
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-5 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                type="button"
                                                onClick={() => openEdit(u)}
                                                className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"
                                                title="Düzenle"
                                                aria-label="Düzenle"
                                            >
                                                <FiEdit2 size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => del(u.id)}
                                                className="p-2 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100"
                                                disabled={u.role === 'admin'}
                                                title="Sil"
                                                aria-label="Sil"
                                            >
                                                <FiTrash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {modal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <form onSubmit={submit} className="w-full max-w-md rounded-[32px] bg-white p-10 shadow-2xl animate-in zoom-in-95 duration-300">
                        <h3 className="mb-8 text-xl font-black text-slate-800 flex items-center gap-3 border-b border-slate-50 pb-6">
                            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center"><FiPlus size={16}/></div>
                            {editing ? 'Personeli Güncelle' : 'Yeni Personel Kaydı'}
                        </h3>
                        <div className="space-y-4 mb-8">
                             <div>
                                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Tam Adı</label>
                                <input required className="w-full rounded-2xl border-2 border-slate-50 bg-slate-50/50 px-5 py-3.5 text-sm font-bold focus:border-indigo-500 focus:bg-white outline-none transition-all" placeholder="Ad Soyad" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                             </div>
                             <div>
                                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Kullanıcı Adı</label>
                                <input required className="w-full rounded-2xl border-2 border-slate-50 bg-slate-50/50 px-5 py-3.5 text-sm font-bold focus:border-indigo-500 focus:bg-white outline-none transition-all" placeholder="Kullanıcı adı" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} disabled={!!editing} />
                             </div>
                             <div>
                                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Erişim Şifresi</label>
                                <input type="password" className="w-full rounded-2xl border-2 border-slate-50 bg-slate-50/50 px-5 py-3.5 text-sm font-bold focus:border-indigo-500 focus:bg-white outline-none transition-all" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                             </div>
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Sistem Rolü</label>
                                    <select
                                        className="w-full rounded-2xl border-2 border-slate-50 bg-slate-50/50 px-5 py-3.5 text-sm font-bold focus:border-indigo-500 focus:bg-white transition-all appearance-none"
                                        value={form.role}
                                        onChange={(e) => {
                                            const r = e.target.value as (typeof ROLES)[number];
                                            setForm({
                                                ...form,
                                                role: r,
                                                waiterAllSections: r === 'waiter' ? form.waiterAllSections : true,
                                                waiterSectionId: r === 'waiter' ? form.waiterSectionId : null,
                                            });
                                        }}
                                    >
                                        {ROLES.map((r) => (
                                            <option key={r} value={r}>
                                                {r.toUpperCase()}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Oturum PIN (6 Haneli)</label>
                                    <input className="w-full rounded-2xl border-2 border-slate-50 bg-slate-50/50 px-5 py-3.5 text-sm font-bold focus:border-indigo-500 focus:bg-white outline-none transition-all tracking-widest" maxLength={6} placeholder="000000" value={form.pinCode} onChange={(e) => setForm({ ...form, pinCode: e.target.value })} />
                                </div>
                             </div>
                             {form.role === 'waiter' && (
                                 <div className="rounded-2xl border-2 border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
                                     <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                                         Garson — sorumlu olduğu alan
                                     </p>
                                     <p className="text-xs text-slate-600 leading-snug">
                                         Kasiyer bu bölgedeki masayı açtığında, yükü en az olan uygun garsona atanır.
                                     </p>
                                     <div className="flex flex-wrap gap-2">
                                         <button
                                             type="button"
                                             onClick={() =>
                                                 setForm({ ...form, waiterAllSections: true, waiterSectionId: null })
                                             }
                                             className={`rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wide transition-all ${
                                                 form.waiterAllSections
                                                     ? 'bg-indigo-600 text-white shadow-md'
                                                     : 'bg-white text-slate-500 border border-slate-200'
                                             }`}
                                         >
                                             Tüm bölgeler
                                         </button>
                                         <button
                                             type="button"
                                             onClick={() => setForm({ ...form, waiterAllSections: false })}
                                             className={`rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wide transition-all ${
                                                 !form.waiterAllSections
                                                     ? 'bg-indigo-600 text-white shadow-md'
                                                     : 'bg-white text-slate-500 border border-slate-200'
                                             }`}
                                         >
                                             Tek bölge
                                         </button>
                                     </div>
                                     {!form.waiterAllSections && (
                                         <div>
                                             <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">
                                                 Bölge
                                             </label>
                                             <select
                                                 required={!form.waiterAllSections}
                                                 className="w-full rounded-2xl border-2 border-slate-50 bg-white px-5 py-3.5 text-sm font-bold focus:border-indigo-500 outline-none transition-all"
                                                 value={form.waiterSectionId ?? ''}
                                                 onChange={(e) =>
                                                     setForm({
                                                         ...form,
                                                         waiterSectionId: e.target.value ? Number(e.target.value) : null,
                                                     })
                                                 }
                                             >
                                                 <option value="">Bölge seçin…</option>
                                                 {sections.map((s) => (
                                                     <option key={s.id} value={s.id}>
                                                         {s.name}
                                                     </option>
                                                 ))}
                                             </select>
                                         </div>
                                     )}
                                 </div>
                             )}
                             {form.role === 'kitchen' && (
                                 <div className="rounded-2xl border-2 border-orange-100 bg-orange-50/40 p-4 space-y-3">
                                     <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">
                                         Mutfak Bölümü Yetkisi
                                     </p>
                                     <p className="text-xs text-slate-600 leading-snug">
                                         Personel mutfak ekranını (KDS) açtığında doğrudan bu bölüme yönlendirilir.
                                     </p>
                                     <select
                                         className="w-full rounded-2xl border-2 border-slate-50 bg-white px-5 py-3.5 text-sm font-bold focus:border-orange-500 outline-none transition-all"
                                         value={form.kitchenStation}
                                         onChange={(e) => setForm({ ...form, kitchenStation: e.target.value })}
                                     >
                                         <option value="all">Tüm İstasyonlar</option>
                                         <option value="hot">Ana Mutfak (Sıcak)</option>
                                         <option value="cold">Soğuk</option>
                                         <option value="bar">Bar</option>
                                     </select>
                                 </div>
                             )}
                        </div>
                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-50">
                            <button type="button" onClick={() => setModal(false)} className="rounded-xl px-6 py-3.5 text-xs font-black text-slate-400 hover:text-slate-600 transition-colors uppercase">Vazgeç</button>
                            <button type="submit" className="rounded-xl bg-indigo-600 px-8 py-3.5 text-xs font-black text-white shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all uppercase">Değişiklikleri Onayla</button>
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
                type={confirm?.type || 'warning'}
                onConfirm={() => confirm?.onConfirm()}
            />
        </main>
    );
};
