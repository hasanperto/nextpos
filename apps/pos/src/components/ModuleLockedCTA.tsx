import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiLock } from 'react-icons/fi';
import { usePosLocale } from '../contexts/PosLocaleContext';

const MODULE_DESC_KEYS: Record<string, string> = {
    customer_crm: 'modules.locked.crm.desc',
    inventory: 'modules.locked.inventory.desc',
    courier_module: 'modules.locked.courier.desc',
    table_reservation: 'modules.locked.reservation.desc',
    queue_display: 'modules.locked.queue.desc',
    kitchen_display: 'modules.locked.kitchen.desc',
    waiter_tablet: 'modules.locked.waiter.desc',
};

export const ModuleLockedCTA: React.FC<{ code: string }> = ({ code }) => {
    const navigate = useNavigate();
    const { t } = usePosLocale();
    const descKey = MODULE_DESC_KEYS[code] || 'modules.locked.default.desc';

    return (
        <div className="p-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="mb-2 flex items-center gap-2 text-sm font-black text-white">
                    <FiLock className="text-violet-400" />
                    {t('modules.locked.title')}
                </div>
                <div className="mb-4 text-xs font-semibold text-slate-400">{t(descKey)}</div>
                <button
                    type="button"
                    onClick={() => navigate('/admin/billing', { replace: true })}
                    className="rounded-xl border border-violet-500/40 bg-violet-600/30 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-violet-100 hover:bg-violet-600/50 transition-all"
                >
                    {t('modules.locked.cta')}
                </button>
            </div>
        </div>
    );
};
