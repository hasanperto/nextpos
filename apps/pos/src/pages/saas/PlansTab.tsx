import React, { useEffect, useState } from 'react';
import { FiCreditCard, FiTag, FiToggleLeft, FiToggleRight, FiGift, FiPlus, FiPackage } from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { SectionCard, EmptyState, Modal, InputGroup, SelectGroup } from './SaaSShared';

export const PlansTab: React.FC = () => {
    const { 
        plans, promoCodes, resellerPlans,
        fetchPlans, addPlan, updatePlan, deletePlan,
        fetchPromoCodes, addPromoCode, togglePromoCode, 
        fetchSettings, fetchResellerPlans, addResellerPlan, deleteResellerPlan
    } = useSaaSStore();

    const [showPromoModal, setShowPromoModal] = useState(false);
    const [showPlanModal, setShowPlanModal] = useState(false);
    const [showResellerModal, setShowResellerModal] = useState(false);
    
    const [promo, setPromo] = useState({ code: '', discount_type: 'percent' as const, discount_value: 10, max_uses: 100, valid_until: '' });
    const [newPlan, setNewPlan] = useState({ name: '', code: '', monthly_fee: 49, setup_fee: 499, max_users: 10, max_branches: 3, max_products: 1000, trial_days: 14 });
    const [resPlan, setResPlan] = useState({ name: '', code: '', price: 999, license_count: 10, description: '' });

    useEffect(() => { 
        fetchPlans(); 
        fetchPromoCodes(); 
        fetchSettings(); 
        fetchResellerPlans();
    }, []);

    const handleCreatePromo = async (e: React.FormEvent) => {
        e.preventDefault();
        const success = await addPromoCode(promo);
        if (success) { setShowPromoModal(false); setPromo({ code: '', discount_type: 'percent', discount_value: 10, max_uses: 100, valid_until: '' }); }
    };

    const handleCreatePlan = async (e: React.FormEvent) => {
        e.preventDefault();
        const success = await addPlan(newPlan);
        if (success) { 
            setShowPlanModal(false); 
            setNewPlan({ name: '', code: '', monthly_fee: 49, setup_fee: 499, max_users: 10, max_branches: 3, max_products: 1000, trial_days: 14 }); 
        }
    };

    const handleCreateResellerPlan = async (e: React.FormEvent) => {
        e.preventDefault();
        const success = await addResellerPlan(resPlan);
        if (success) {
            setShowResellerModal(false);
            setResPlan({ name: '', code: '', price: 999, license_count: 10, description: '' });
        }
    };

    return (
        <div className="space-y-8 pb-10">
            {/* Plans Grid */}
            <SectionCard 
                title="Abonelik Planları (Restoran)" 
                icon={<FiCreditCard className="text-blue-400" />}
                action={<button onClick={() => setShowPlanModal(true)} className="text-xs bg-blue-600 text-white px-3 py-2 rounded-xl font-bold flex items-center gap-1"><FiPlus size={12} /> Yeni Plan</button>}
            >
                {plans.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {plans.map(p => {
                            const colors = { 
                                basic: { bg: 'from-slate-700 to-slate-600', border: 'border-slate-500/30' }, 
                                pro: { bg: 'from-blue-700 to-indigo-600', border: 'border-blue-500/30' }, 
                                enterprise: { bg: 'from-amber-700 to-orange-600', border: 'border-amber-500/30' } 
                            } as any;
                            const c = colors[p.code] || { bg: 'from-purple-700 to-purple-600', border: 'border-purple-500/30' };
                            return (
                                <div key={p.id} className={`bg-gradient-to-br ${c.bg} p-6 rounded-2xl border ${c.border} relative overflow-hidden group`}>
                                    <h4 className="text-xl font-black text-white uppercase relative z-10">{p.name}</h4>
                                    <div className="mt-4 space-y-2 relative z-10">
                                        <div className="flex justify-between text-sm"><span className="text-white/60">Aylık:</span><span className="font-black text-white">€{p.monthly_fee}</span></div>
                                        <div className="flex justify-between text-sm"><span className="text-white/60">Kurulum:</span><span className="font-bold text-white/80">€{p.setup_fee}</span></div>
                                        <div className="flex justify-between text-sm"><span className="text-white/60">Cihaz/Şube:</span><span className="font-bold">{p.max_users}/{p.max_branches}</span></div>
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between relative z-10">
                                        <button onClick={() => updatePlan(p.id, { is_active: !p.is_active })} className="text-white/40 hover:text-white transition-all">
                                            {p.is_active ? <FiToggleRight size={20} /> : <FiToggleLeft size={20} />}
                                        </button>
                                        <button onClick={() => { if(confirm('Silsin mi?')) deletePlan(p.id); }} className="text-red-400 text-[10px] font-black uppercase">SİL</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : <EmptyState icon={<FiCreditCard />} message="Plan tanımı yok" />}
            </SectionCard>

            {/* Reseller Packages */}
            <SectionCard 
                title="Bayi Lisans Paketleri (Satışlık)" 
                icon={<FiPackage className="text-emerald-400" />}
                action={<button onClick={() => setShowResellerModal(true)} className="text-xs bg-emerald-600 text-white px-3 py-2 rounded-xl font-bold flex items-center gap-1"><FiPlus size={12} /> Yeni Paket</button>}
            >
                {resellerPlans.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {resellerPlans.map(rp => (
                            <div key={rp.id} className="p-5 bg-black/20 border border-white/5 rounded-2xl group relative overflow-hidden">
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{rp.code}</span>
                                <h4 className="text-lg font-bold text-white mt-1">{rp.name}</h4>
                                <div className="mt-4 flex justify-between items-end">
                                    <div>
                                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Lisans</span>
                                        <span className="text-xl font-black text-white">{rp.license_count}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Fiyat</span>
                                        <span className="text-xl font-black text-blue-400">€{rp.price}</span>
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-white/5 flex gap-2">
                                    <button onClick={() => { if(confirm('Bu paketi silmek istediğinize emin misiniz?')) deleteResellerPlan(rp.id); }} className="flex-1 py-2 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-black uppercase hover:bg-red-500 hover:text-white transition-all">SİL</button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <EmptyState icon={<FiPackage />} message="Sistemde henüz bayi paketi tanımlanmamış." />}
            </SectionCard>

            {/* Promo Codes */}
            <SectionCard title="Promosyon Kodları" icon={<FiGift className="text-pink-400" />}
                action={<button onClick={() => setShowPromoModal(true)} className="text-xs bg-pink-600 text-white px-3 py-2 rounded-xl font-bold flex items-center gap-1"><FiPlus size={12} /> Yeni Kod</button>}>
                {promoCodes.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {promoCodes.map(p => (
                            <div key={p.id} className={`p-4 rounded-xl border transition-all ${p.is_active ? 'bg-black/20 border-white/5' : 'bg-red-500/5 border-red-500/10 opacity-50'}`}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className="text-lg font-black text-pink-400 font-mono">{p.code}</span>
                                        <div className="text-sm font-bold text-white mt-1">
                                            {p.discount_type === 'percent' ? `%${p.discount_value} İndirim` : `€${p.discount_value} İndirim`}
                                        </div>
                                    </div>
                                    <button onClick={() => togglePromoCode(p.id)} className="text-slate-400 hover:text-white">{p.is_active ? <FiToggleRight size={18} /> : <FiToggleLeft size={18} />}</button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <EmptyState icon={<FiGift />} message="Promosyon kodu yok" />}
            </SectionCard>

            {/* Modals */}
            <Modal show={showPlanModal} onClose={() => setShowPlanModal(false)} title="Yeni Abonelik Planı Oluştur">
                <form onSubmit={handleCreatePlan} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Plan İsmi" value={newPlan.name} onChange={v => setNewPlan({...newPlan, name: v})} placeholder="Örn: Premium" />
                        <InputGroup label="Plan Kodu" value={newPlan.code} onChange={v => setNewPlan({...newPlan, code: v})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Aylık (€)" type="number" value={newPlan.monthly_fee} onChange={v => setNewPlan({...newPlan, monthly_fee: Number(v)})} />
                        <InputGroup label="Kurulum (€)" type="number" value={newPlan.setup_fee} onChange={v => setNewPlan({...newPlan, setup_fee: Number(v)})} />
                    </div>
                    <button type="submit" className="w-full py-4 bg-blue-600 text-white font-black rounded-xl">OLUŞTUR</button>
                </form>
            </Modal>

            <Modal show={showResellerModal} onClose={() => setShowResellerModal(false)} title="Yeni Bayi Paketi Tanımla">
                <form onSubmit={handleCreateResellerPlan} className="space-y-4">
                    <InputGroup label="Paket Adı" value={resPlan.name} onChange={v => setResPlan({...resPlan, name: v})} />
                    <InputGroup label="Sistem Kodu" value={resPlan.code} onChange={v => setResPlan({...resPlan, code: v})} />
                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Lisans (Adet)" type="number" value={resPlan.license_count} onChange={v => setResPlan({...resPlan, license_count: Number(v)})} />
                        <InputGroup label="Fiyat (€)" type="number" value={resPlan.price} onChange={v => setResPlan({...resPlan, price: Number(v)})} />
                    </div>
                    <button type="submit" className="w-full py-4 bg-emerald-600 text-white font-black rounded-xl uppercase">PAKETİ YAYINLA</button>
                </form>
            </Modal>

            <Modal show={showPromoModal} onClose={() => setShowPromoModal(false)} title="Yeni Promosyon Kodu">
                <form onSubmit={handleCreatePromo} className="space-y-5">
                    <InputGroup label="Kod" value={promo.code} onChange={v => setPromo({ ...promo, code: v })} />
                    <SelectGroup label="İndirim Tipi" value={promo.discount_type} onChange={v => setPromo({ ...promo, discount_type: v as any })} options={[{ label: 'Yüzde (%)', value: 'percent' }, { label: 'Sabit (€)', value: 'fixed' }]} />
                    <InputGroup label="Değer" type="number" value={promo.discount_value} onChange={v => setPromo({ ...promo, discount_value: Number(v) })} />
                    <button type="submit" className="w-full bg-pink-600 py-4 rounded-xl text-white font-black text-xs uppercase">OLUŞTUR</button>
                </form>
            </Modal>
        </div>
    );
};
