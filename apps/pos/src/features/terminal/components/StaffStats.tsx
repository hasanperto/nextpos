import type { DailyReportData } from '../../../hooks/useDailyReport';
import { FiActivity, FiDollarSign, FiClock, FiShoppingBag, FiUsers, FiTrendingUp } from 'react-icons/fi';
import { usePosLocale } from '../../../contexts/PosLocaleContext';

interface StaffStatsProps {
    data?: DailyReportData | null;
}

export const StaffStatsModal: React.FC<StaffStatsProps> = ({ data }) => {
    const { t } = usePosLocale();

    const stats = [
        { 
            label: t('staff.total_sales') || 'Toplam Satış', 
            value: data ? `₺${data.orders.gross.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '₺0,00', 
            icon: <FiDollarSign />, 
            color: 'text-emerald-500' 
        },
        { 
            label: t('staff.order_count') || 'Sipariş Sayısı', 
            value: data ? data.orders.orders.toString() : '0', 
            icon: <FiShoppingBag />, 
            color: 'text-blue-500' 
        },
        { 
            label: t('staff.avg_cart') || 'Ort. Sepet', 
            value: data && data.orders.orders > 0 ? `₺${(data.orders.gross / data.orders.orders).toFixed(2)}` : '₺0,00', 
            icon: <FiTrendingUp />, 
            color: 'text-amber-500' 
        },
        { label: t('staff.preparation_time') || 'Hazırlık Süresi', value: '18 dk', icon: <FiClock />, color: 'text-purple-500' },
        { label: t('staff.customer_satisfaction') || 'Müşteri Memnuniyeti', value: '%98', icon: <FiUsers />, color: 'text-rose-500' },
        { label: t('staff.active_time') || 'Aktiflik', value: '6 sa 24 dk', icon: <FiActivity />, color: 'text-cyan-500' },
    ];

    return (
        <div className="p-4 rounded-3xl bg-white/5 border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    {t('staff.stats_summary') || 'Performans Özeti'}
                </h4>
                <FiTrendingUp className="text-emerald-500 animate-bounce" size={14} />
            </div>
            <div className="grid grid-cols-2 gap-3">
                {stats.map((s, i) => (
                    <div key={i} className="p-3 rounded-2xl bg-[#0d1220] border border-white/[0.03]">
                        <div className={`p-1.5 w-max rounded-lg bg-black/40 ${s.color} mb-2`}>
                            {s.icon}
                        </div>
                        <div className="text-lg font-black text-white tabular-nums tracking-tight leading-none mb-1">{s.value}</div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{s.label}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};
