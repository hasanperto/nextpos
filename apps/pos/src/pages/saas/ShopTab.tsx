import React, { useEffect } from 'react';
import { useSaaSStore } from '../../store/useSaaSStore';
import { FiShoppingCart, FiCheck, FiInfo, FiTag, FiZap, FiPackage, FiDollarSign } from 'react-icons/fi';

export const ShopTab: React.FC = () => {
    const { 
        resellerPlans, fetchResellerPlans, purchaseResellerPlan, 
        isLoading, error, admin 
    } = useSaaSStore();

    useEffect(() => {
        fetchResellerPlans();
    }, []);

    const currentPlan = resellerPlans.find(p => p.id === admin?.subscription_plan_id);
    const currentPrice = currentPlan ? parseFloat(currentPlan.price) : 0;

    const handlePurchase = async (planId: number) => {
        if (confirm('Bu paketi satın almak istediğinize emin misiniz? Ücret cüzdan bakiyenizden düşülecektir.')) {
            const ok = await purchaseResellerPlan(planId);
            if (ok) {
                alert('Satın alma başarılı! Lisanslarınız hesabınıza eklendi.');
            }
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header / Info */}
            <div className="bg-gradient-to-r from-blue-600/20 to-indigo-600/20 p-8 rounded-[32px] border border-blue-500/20 backdrop-blur-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
                    <FiShoppingCart size={120} />
                </div>
                <div className="relative z-10">
                    <h2 className="text-2xl font-black text-white mb-2">Sanal Mağaza & Lisans Market</h2>
                    <p className="text-slate-400 max-w-2xl text-sm font-medium leading-relaxed">
                        Restoranlarınıza atayabileceğiniz lisansları uygun fiyatlarla toplu paketler halinde buradan satın alabilirsiniz. 
                        Satın alınan lisanslar anında <span className="text-blue-400 font-bold">"Mevcut Lisans"</span> bakiyenize eklenir.
                    </p>
                    <div className="mt-6 flex items-center gap-4">
                        <div className="bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-xl flex items-center gap-2">
                            <FiZap className="text-blue-400" />
                            <span className="text-xs font-bold text-blue-100 italic">Hızlı Aktivasyon</span>
                        </div>
                        <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl flex items-center gap-2">
                            <FiTag className="text-emerald-400" />
                            <span className="text-xs font-bold text-emerald-100">Toplu Alım İndirimi</span>
                        </div>
                    </div>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs font-bold flex items-center gap-2">
                    <FiInfo /> {error}
                </div>
            )}

            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {resellerPlans.map((plan) => {
                    const isCurrent = plan.id === admin?.subscription_plan_id;
                    const planPrice = parseFloat(plan.price);
                    const isLower = planPrice < currentPrice;
                    const isUpgrade = planPrice > currentPrice;
                    const upgradeCost = isUpgrade ? planPrice - currentPrice : planPrice;

                    return (
                        <div key={plan.id} className={`bg-white/5 border rounded-[32px] overflow-hidden transition-all group flex flex-col h-full ${isCurrent ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-white/5 hover:border-blue-500/30'}`}>
                            {isCurrent && (
                                <div className="bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest text-center py-1.5 flex items-center justify-center gap-2">
                                    <FiCheck /> MEVCUT PAKETİNİZ
                                </div>
                            )}
                            
                            <div className="p-8 pb-4">
                                <div className="flex justify-between items-start mb-6">
                                    <div className={`p-3 rounded-2xl border transition-all duration-300 ${isCurrent ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-blue-600/10 border-blue-500/20 group-hover:bg-blue-600 group-hover:text-white'}`}>
                                        <FiPackage size={24} />
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{plan.code}</span>
                                    </div>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                                <div className="flex items-baseline gap-1 mb-6">
                                    <span className="text-3xl font-black text-white">€{plan.price}</span>
                                    <span className="text-slate-500 text-xs font-bold">/ paket</span>
                                </div>
                            </div>

                            <div className="px-8 pb-8 flex-1 space-y-4">
                                <div className={`p-4 rounded-2xl border ${isCurrent ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-blue-600/5 border-blue-500/10'}`}>
                                    <span className="text-xs text-slate-400 block mb-1">Lisans Kapasitesi</span>
                                    <span className={`text-lg font-black ${isCurrent ? 'text-emerald-400' : 'text-blue-400'}`}>
                                        {isUpgrade ? `+${plan.license_count - (currentPlan?.license_count || 0)} Ek Lisans` : `+${plan.license_count} Restoran Lisansı`}
                                    </span>
                                </div>

                                <ul className="space-y-3">
                                    {plan.description?.split('+').map((feature: string, i: number) => (
                                        <li key={i} className="flex items-start gap-3 text-xs text-slate-400 font-medium">
                                            <div className={`mt-1 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${isCurrent ? 'bg-emerald-500/10' : 'bg-blue-500/10'}`}>
                                                <FiCheck className={isCurrent ? 'text-emerald-400' : 'text-emerald-400'} size={10} />
                                            </div>
                                            {feature.trim()}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="p-8 pt-0 mt-auto">
                                <button 
                                    onClick={() => handlePurchase(plan.id)}
                                    disabled={isLoading || isCurrent || isLower}
                                    className={`w-full py-4 border rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 group/btn ${
                                        isCurrent ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 cursor-default' : 
                                        isLower ? 'bg-white/5 border-white/5 text-slate-600 cursor-not-allowed grayscale' :
                                        'bg-white/5 hover:bg-emerald-600 hover:text-white border-white/10 hover:border-emerald-500 text-slate-200'
                                    }`}
                                >
                                    {isLoading ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : isCurrent ? (
                                        'AKTİF KULLANIM'
                                    ) : isLower ? (
                                        'DÜŞÜK PAKET'
                                    ) : (
                                        <>
                                            {isUpgrade ? `€${upgradeCost.toFixed(2)} İLE YÜKSELT` : 'HEMEN SATIN AL'} 
                                            <FiChevronRight className="group-hover/btn:translate-x-1 transition-transform" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Wallet Info Footer */}
            <div className="bg-slate-900 border border-white/5 p-6 rounded-[28px] flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <FiDollarSign size={24} />
                    </div>
                    <div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Güncel Cüzdan Bakiyesi</span>
                        <span className="text-2xl font-black text-white">€{admin?.wallet_balance || '0.00'}</span>
                    </div>
                </div>
                <button className="text-xs font-black text-blue-400 hover:text-blue-300 transition-all underline underline-offset-8">BAKİYE YÜKLE (KREDİ KARTI)</button>
            </div>
        </div>
    );
};

const FiChevronRight = (props: any) => (
  <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" {...props}><polyline points="9 18 15 12 9 6"></polyline></svg>
);
