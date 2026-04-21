import React, { useEffect, useState } from 'react';
import { FiGrid, FiSave } from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { SectionCard } from './SaaSShared';

export const PlanModulesMatrixCard: React.FC = () => {
    const { t } = useSaaSLocale();
    const { plans, fetchPlans, fetchPlanModuleMatrix, savePlanModuleRules, planModuleMatrix, settings } = useSaaSStore();
    const currency = settings?.currency || '€';
    const [planCode, setPlanCode] = useState('basic');
    const [localRules, setLocalRules] = useState<Record<string, 'included' | 'addon' | 'locked'>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchPlans();
    }, [fetchPlans]);

    useEffect(() => {
        fetchPlanModuleMatrix(planCode);
    }, [planCode, fetchPlanModuleMatrix]);

    useEffect(() => {
        if (planModuleMatrix?.planCode === planCode && planModuleMatrix.modules?.length) {
            const r: Record<string, 'included' | 'addon' | 'locked'> = {};
            for (const m of planModuleMatrix.modules) {
                r[m.code] = m.mode;
            }
            setLocalRules(r);
        }
    }, [planModuleMatrix, planCode]);

    const modules = planModuleMatrix?.planCode === planCode ? planModuleMatrix.modules : [];

    const handleSave = async () => {
        if (!Object.keys(localRules).length) return;
        setSaving(true);
        await savePlanModuleRules(planCode, localRules);
        setSaving(false);
    };

    const planOptions = plans.length
        ? plans.map((p) => ({ label: p.name, value: p.code }))
        : [
              { label: 'Basic', value: 'basic' },
              { label: 'Pro', value: 'pro' },
              { label: 'Enterprise', value: 'enterprise' },
          ];

    return (
        <SectionCard
            title={t('plans.matrix.title')}
            icon={<FiGrid className="text-violet-400" />}
            action={
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !modules.length}
                    className="text-xs bg-violet-600 text-white px-3 py-2 rounded-xl font-bold flex items-center gap-1 disabled:opacity-40"
                >
                    <FiSave size={12} /> {saving ? t('plans.matrix.saving') : t('plans.matrix.save')}
                </button>
            }
        >
            <p className="text-xs text-slate-500 mb-4">
                {t('plans.matrix.helpPrefix')} <strong className="text-slate-300">{t('plans.mode.included')}</strong> ({t('plans.matrix.free')}),{' '}
                <strong className="text-slate-300">{t('plans.mode.addon')}</strong> {t('plans.matrix.or')}{' '}
                <strong className="text-slate-300">{t('plans.mode.locked')}</strong>.
            </p>
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('plans.matrix.plan')}</label>
                <select
                    value={planCode}
                    onChange={(e) => setPlanCode(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white min-w-[200px]"
                >
                    {planOptions.map((o) => (
                        <option key={o.value} value={o.value} className="bg-slate-900">
                            {o.label}
                        </option>
                    ))}
                </select>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-white/5">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-white/5">
                            <th className="px-4 py-3">{t('plans.matrix.colModule')}</th>
                            <th className="px-4 py-3">{t('plans.matrix.colPrice')}</th>
                            <th className="px-4 py-3">{t('plans.matrix.colStatus')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                        {modules.map((m) => (
                            <tr key={m.code} className="hover:bg-white/[0.02]">
                                <td className="px-4 py-3">
                                    <div className="font-bold text-white">{m.name}</div>
                                    <div className="text-[10px] text-slate-500 font-mono">{m.code}</div>
                                </td>
                                <td className="px-4 py-3 text-slate-400">
                                    {currency}{m.setup_price} / {currency}{m.monthly_price}
                                </td>
                                <td className="px-4 py-3">
                                    <select
                                        value={localRules[m.code] ?? m.mode}
                                        onChange={(e) =>
                                            setLocalRules((prev) => ({
                                                ...prev,
                                                [m.code]: e.target.value as 'included' | 'addon' | 'locked',
                                            }))
                                        }
                                        className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
                                    >
                                        {(['included', 'addon', 'locked'] as const).map((mode) => (
                                            <option key={mode} value={mode} className="bg-slate-900">
                                                {t(`plans.mode.${mode}`)}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!modules.length && (
                    <div className="p-8 text-center text-slate-500 text-sm">{t('plans.matrix.empty')}</div>
                )}
            </div>
        </SectionCard>
    );
};
