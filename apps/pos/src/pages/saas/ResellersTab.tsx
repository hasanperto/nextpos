import React, { useEffect, useState } from 'react';
import { useSaaSStore } from '../../store/useSaaSStore';
import { FiUsers, FiPlus, FiBriefcase, FiDollarSign, FiPercent, FiTrash2, FiEdit, FiDatabase } from 'react-icons/fi';

export const ResellersTab: React.FC = () => {
    const { resellers, fetchResellers, createReseller, updateReseller, deleteReseller } = useSaaSStore();
    const [showNewModal, setShowNewModal] = useState(false);
    const [showManageModal, setShowManageModal] = useState(false);
    const [selectedReseller, setSelectedReseller] = useState<any>(null);

    const [form, setForm] = useState({
        username: '', email: '', password: '', company_name: '', commission_rate: 60, available_licenses: 0
    });
    
    const [transferLicenses, setTransferLicenses] = useState(0);

    useEffect(() => {
        fetchResellers();
    }, [fetchResellers]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (await createReseller(form)) {
            setShowNewModal(false);
            setForm({ username: '', email: '', password: '', company_name: '', commission_rate: 60, available_licenses: 0 });
        } else {
            alert("Bayi oluşturulamadı. Aynı kullanıcı adı/email kullanılıyor olabilir.");
        }
    };

    const handleTransfer = async () => {
        if (!selectedReseller || transferLicenses <= 0) return;
        if (await updateReseller(selectedReseller.id, { add_licenses: transferLicenses })) {
            setShowManageModal(false);
            setTransferLicenses(0);
        }
    };

    const handleDelete = async (id: number) => {
        if (window.confirm("Bu bayiyi silmek istediğinize emin misiniz? (Alt restoranları boşa çıkacaktır)")) {
            await deleteReseller(id);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {/* Header / Stats */}
            <div className="flex justify-between items-center bg-slate-900/50 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md">
                <div>
                    <h2 className="text-2xl font-black text-white flex items-center gap-3">
                        <FiUsers className="text-emerald-400" />
                        Bayiler ve Çözüm Ortakları
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">Bölgesel partnerlerinizi, komisyonlarını ve lisans havuzlarını yönetin.</p>
                </div>
                <button
                    onClick={() => setShowNewModal(true)}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
                >
                    <FiPlus /> Yeni Bayi Oluştur
                </button>
            </div>

            {/* List */}
            <div className="bg-slate-900/40 rounded-2xl border border-slate-700/50 overflow-hidden backdrop-blur-md">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] font-black tracking-wider">
                        <tr>
                            <th className="px-6 py-4">Firma / Kullanıcı</th>
                            <th className="px-6 py-4">Finans & Komisyon</th>
                            <th className="px-6 py-4 text-center">Lisans Deposu</th>
                            <th className="px-6 py-4 text-center">Aktif Restoran</th>
                            <th className="px-6 py-4 text-right">İşlemler</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                        {resellers?.map((res) => (
                            <tr key={res.id} className="hover:bg-slate-800/50 transition-colors">
                                <td className="px-6 py-4 flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                                        <FiBriefcase size={18} />
                                    </div>
                                    <div>
                                        <div className="font-bold text-white text-base">{res.company_name || 'İsimsiz Bayi'}</div>
                                        <div className="text-xs text-slate-500">{res.username} • {res.email}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="font-mono text-emerald-400 font-bold">€{(Number(res.wallet_balance) || 0).toFixed(2)}</div>
                                    <div className="text-xs text-slate-500">%{(Number(res.commission_rate) || 0).toFixed(0)} Kesinti Oranı</div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-black border border-blue-500/20">
                                        <FiDatabase /> {res.available_licenses} Adet
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className="text-white font-bold">{res.total_tenants || 0} Restoran</span>
                                </td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    <button 
                                        onClick={() => { setSelectedReseller(res); setShowManageModal(true); }}
                                        className="p-2 text-indigo-400 hover:bg-indigo-500/20 rounded-lg transition-colors" title="Lisans Transferi & Yönetim"
                                    >
                                        <FiEdit size={16} />
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(res.id)}
                                        className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors" title="Bayiyi Sil"
                                    >
                                        <FiTrash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {(!resellers || resellers.length === 0) && (
                            <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">Henüz hiçbir bayi oluşturulmadı.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Yeni Bayi Ekle Modal */}
            {showNewModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <form onSubmit={handleCreate} className="bg-slate-800 rounded-2xl w-full max-w-lg overflow-hidden border border-slate-700 shadow-2xl">
                        <div className="p-6 border-b border-slate-700">
                            <h3 className="text-xl font-black text-white">Yeni Bayi Hesabı</h3>
                            <p className="text-sm text-slate-400">Bayiniz panele Username / Şifre ile girecektir.</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Firma Adı</label>
                                    <input required type="text" value={form.company_name} onChange={e => setForm({...form, company_name: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white" placeholder="Örn: Ege Bölge POS" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">E-Posta</label>
                                    <input required type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white" placeholder="info@partner.com" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Giriş Adı (Username)</label>
                                    <input required type="text" value={form.username} onChange={e => setForm({...form, username: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Şifre</label>
                                    <input required type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Bayi Komisyonu (%)</label>
                                    <div className="relative">
                                        <FiPercent className="absolute left-3 top-3 text-emerald-400" />
                                        <input type="number" value={form.commission_rate} onChange={e => setForm({...form, commission_rate: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 pl-9 text-emerald-400 font-bold" min="0" max="100" />
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1">Sistem üzerinden yaptığı satışlardan alacağı pay.</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Hoşgeldin Lisansı</label>
                                    <div className="relative">
                                        <FiDatabase className="absolute left-3 top-3 text-blue-400" />
                                        <input type="number" value={form.available_licenses} onChange={e => setForm({...form, available_licenses: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 pl-9 text-white font-bold" min="0" />
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1">Başlangıç hediye lisans sayısı.</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-900/50 border-t border-slate-700 flex justify-end gap-3">
                            <button type="button" onClick={() => setShowNewModal(false)} className="px-5 py-2.5 text-slate-300 hover:text-white transition-colors">İptal</button>
                            <button type="submit" className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-6 py-2.5 rounded-xl font-bold transition-colors">Bayiyi Kaydet</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Yönetim / Transfer Modal */}
            {showManageModal && selectedReseller && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-800 rounded-2xl w-full max-w-sm overflow-hidden border border-slate-700 shadow-2xl">
                        <div className="p-6 border-b border-slate-700">
                            <h3 className="text-xl font-black text-white">Lisans Transferi</h3>
                            <p className="text-sm text-slate-400">{selectedReseller.company_name}</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex justify-between items-center p-4 bg-slate-900 rounded-xl">
                                <span className="text-slate-400 text-sm">Mevcut Lisans Deposu</span>
                                <span className="text-white font-black text-xl">{selectedReseller.available_licenses}</span>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-2">Eklenecek / Satılacak Lisans Sayısı</label>
                                <input 
                                    type="number" 
                                    value={transferLicenses} 
                                    onChange={e => setTransferLicenses(Number(e.target.value))} 
                                    className="w-full bg-slate-900 border border-indigo-500/50 rounded-xl px-4 py-3 text-white font-black text-xl text-center focus:border-indigo-500 outline-none" 
                                    min="1"
                                />
                                <p className="text-[10px] text-slate-500 mt-2 text-center">Bu adet bayinin havuzuna aktarılacak ve o kadar restoran kurabilecektir.</p>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-900/50 border-t border-slate-700 flex justify-end gap-3">
                            <button onClick={() => {setShowManageModal(false); setTransferLicenses(0);}} className="px-5 py-2.5 text-slate-300 hover:text-white transition-colors">Vazgeç</button>
                            <button onClick={handleTransfer} className="bg-indigo-500 hover:bg-indigo-400 text-white px-6 py-2.5 rounded-xl font-bold transition-colors">Transfer Et</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
