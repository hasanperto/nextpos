import React, { useEffect } from 'react';
import { useSaaSStore } from '../../store/useSaaSStore';
import { 
    FiDollarSign, FiTrendingUp, FiCalendar, FiAlertCircle, FiCreditCard, FiPieChart, FiShoppingBag 
} from 'react-icons/fi';

export const FinanceTab: React.FC = () => {
    const { 
        admin, payments, fetchPayments, financialSummary, fetchFinancialSummary 
    } = useSaaSStore();

    useEffect(() => {
        fetchPayments();
        fetchFinancialSummary();
    }, []);

    // Filter pending/alert payments
    const pendingPayments = payments.filter(p => p.status === 'pending');
    
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Main Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-slate-900/50 border border-white/5 p-6 rounded-[32px] group hover:border-emerald-500/30 transition-all">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
                        <FiDollarSign size={24} />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Toplam Kazanç</span>
                    <span className="text-2xl font-black text-white">€{financialSummary?.totalEarnings || '0.00'}</span>
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-400 font-bold italic">
                        <FiTrendingUp size={12} /> +12% bu ay
                    </div>
                </div>

                <div className="bg-slate-900/50 border border-white/5 p-6 rounded-[32px] group hover:border-blue-500/30 transition-all text-blue-400">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <FiShoppingBag size={24} />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Cüzdan Bakiyesi</span>
                    <span className="text-2xl font-black text-white">€{admin?.wallet_balance || '0.00'}</span>
                    <div className="mt-2 text-[10px] text-blue-400 font-bold cursor-pointer hover:underline">Para Çekme Talebi →</div>
                </div>

                <div className="bg-slate-900/50 border border-white/5 p-6 rounded-[32px] group hover:border-orange-500/30 transition-all">
                    <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-400 mb-4 group-hover:scale-110 transition-transform">
                        <FiCalendar size={24} />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Bekleyen Tahsilatlar</span>
                    <span className="text-2xl font-black text-white">€{financialSummary?.pendingRevenue || '0.00'}</span>
                    <div className="mt-2 text-[10px] text-orange-400 font-bold italic">{pendingPayments.length} Bekleyen Fatura</div>
                </div>

                <div className="bg-slate-900/50 border border-white/5 p-6 rounded-[32px] group hover:border-purple-500/30 transition-all text-purple-400">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <FiPieChart size={24} />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Aktif Lisans Hakları</span>
                    <span className="text-2xl font-black text-white">{admin?.available_licenses || '0'} Adet</span>
                    <div className="mt-2 text-[10px] text-purple-400 font-bold cursor-pointer hover:underline">Lisans Market →</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Transaction History */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between pb-2">
                        <h3 className="text-lg font-black text-white flex items-center gap-2">
                            <FiCreditCard className="text-blue-500" /> Finansal Hareketler
                        </h3>
                        <button className="text-[10px] font-black text-blue-400 border border-blue-400/20 px-3 py-1 rounded-lg hover:bg-blue-400/10 transition-all uppercase">Excel İndir</button>
                    </div>

                    <div className="bg-white/5 border border-white/5 rounded-[32px] overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-white/5 border-b border-white/5">
                                <tr>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Açıklama / Müşteri</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Tür</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Durum</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Tutar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {payments.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-slate-500 font-bold italic text-sm">Henüz finansal hareket bulunmuyor</td>
                                    </tr>
                                ) : (
                                    payments.map((p) => (
                                        <tr key={p.id} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-6 py-5">
                                                <div className="font-bold text-white text-sm">{p.description}</div>
                                                <div className="text-[10px] text-slate-500 group-hover:text-blue-400 transition-colors uppercase font-black tracking-widest mt-1">{p.tenant_name || 'Sistem Tanımlı'}</div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex justify-center">
                                                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                                                        p.payment_type === 'reseller_income' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
                                                    }`}>
                                                        {p.payment_type === 'reseller_income' ? 'Kazanç' : 'Gider'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex justify-center">
                                                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                                                        p.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 
                                                        p.status === 'pending' ? 'bg-orange-500/10 text-orange-400 animate-pulse' : 'bg-red-500/10 text-red-400'
                                                    }`}>
                                                        {p.status === 'paid' ? 'Ödendi' : p.status === 'pending' ? 'Bekliyor' : 'İptal'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <div className={`text-sm font-black ${p.payment_type === 'reseller_income' ? 'text-emerald-400' : 'text-blue-400'}`}>
                                                    {p.payment_type === 'reseller_income' ? '+' : '-'}€{p.amount}
                                                </div>
                                                <div className="text-[10px] text-slate-500 font-bold italic mt-1">
                                                    {new Date(p.created_at).toLocaleDateString('tr-TR')}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Sidebar: Commission Rules & Pending Alerts */}
                <div className="space-y-6">
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-[32px] text-white shadow-xl shadow-blue-900/20 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12 group-hover:rotate-0 transition-all duration-500">
                            <FiPieChart size={100} />
                        </div>
                        <div className="relative z-10">
                            <span className="text-[10px] font-black text-blue-200 uppercase tracking-widest block mb-4">Komisyon Yapısı</span>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                                    <span className="text-xs font-bold text-blue-100">Peşin Ödeme İndirimi</span>
                                    <span className="text-sm font-black text-white">%15</span>
                                </div>
                                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                                    <span className="text-xs font-bold text-blue-100">Bayi Payı</span>
                                    <span className="text-sm font-black text-emerald-400">%35</span>
                                </div>
                                <div className="flex items-center justify-between pb-3">
                                    <span className="text-xs font-bold text-blue-100">Sistem Payı</span>
                                    <span className="text-sm font-black text-white">%50</span>
                                </div>
                            </div>
                            <p className="mt-6 text-[10px] text-blue-200 font-medium italic leading-relaxed">
                                * 12 aylık peşin satışlarda geçerlidir. Aylık ödemelerde bayi payı aylık tahakkuk eder.
                            </p>
                        </div>
                    </div>

                    <div className="bg-slate-900/50 border border-white/5 p-8 rounded-[32px]">
                        <h4 className="text-xs font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                            <FiAlertCircle className="text-orange-500" /> Tahsilat Uyarıları
                        </h4>
                        
                        <div className="space-y-4">
                            {pendingPayments.length === 0 ? (
                                <div className="text-center py-8">
                                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mx-auto mb-3">
                                        <FiCheck size={16} />
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-bold">Tüm tahsilatlar güncel</span>
                                </div>
                            ) : (
                                pendingPayments.map(p => (
                                    <div key={p.id} className="p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-orange-500/30 transition-all cursor-pointer">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-xs font-black text-white">{p.tenant_name}</span>
                                            <span className="text-[10px] font-black text-orange-400 italic">Vadesi Geldi</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold mb-3">
                                            <FiCalendar size={12} /> {new Date(p.due_date || p.created_at).toLocaleDateString('tr-TR')}
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-white">€{p.amount}</span>
                                            <button className="text-[10px] font-black text-blue-400 hover:text-blue-300 transition-all uppercase tracking-widest">Hatırlat</button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const FiCheck = (props: any) => (
  <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" {...props}><polyline points="20 6 9 17 4 12"></polyline></svg>
);
