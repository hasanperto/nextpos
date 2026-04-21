import React, { useMemo } from 'react';
import { IMaskInput } from 'react-imask';
import {
    FiBriefcase,
    FiMail,
    FiLock,
    FiUser,
    FiHash,
    FiFileText,
    FiMapPin,
    FiPhone,
    FiSmartphone,
    FiPercent,
    FiDatabase,
    FiEdit3,
    FiGlobe,
    FiPackage,
    FiCreditCard,
    FiTrendingUp,
    FiAlertCircle,
} from 'react-icons/fi';
import type { ResellerForm, ResellerPaymentMethod } from './resellerFormTypes';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { useSaaSStore } from '../../store/useSaaSStore';

const inpBase =
    'w-full bg-black/25 border border-white/10 rounded-lg py-2 pl-9 pr-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 read-only:opacity-60';

const taBase =
    'w-full bg-black/25 border border-white/10 rounded-lg py-2 pl-9 pr-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 resize-y min-h-[52px]';

const phoneMask = '0 000 000 00 00';
const taxMask = '00000000000';
const postalMask = '00000';

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
    return (
        <label className="mb-1 block text-[10px] font-medium text-slate-500">
            {children}
            {required ? <span className="text-rose-400/90"> *</span> : null}
        </label>
    );
}

function IconInput({
    icon,
    children,
}: {
    icon: React.ReactNode;
    children: React.ReactElement<{ className?: string }>;
}) {
    return (
        <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 text-slate-500 [&>svg]:h-3.5 [&>svg]:w-3.5">
                {icon}
            </span>
            {React.cloneElement(children, {
                className: `${inpBase} ${children.props.className || ''}`.trim(),
            })}
        </div>
    );
}

function IconTextarea({
    icon,
    children,
}: {
    icon: React.ReactNode;
    children: React.ReactElement<{ className?: string }>;
}) {
    return (
        <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-2.5 z-[1] text-slate-500 [&>svg]:h-3.5 [&>svg]:w-3.5">
                {icon}
            </span>
            {React.cloneElement(children, {
                className: `${taBase} ${children.props.className || ''}`.trim(),
            })}
        </div>
    );
}

function MaskedIconField({
    icon,
    mask,
    value,
    onAcceptUnmasked,
    placeholder,
    inputMode,
}: {
    icon: React.ReactNode;
    mask: string;
    value: string;
    onAcceptUnmasked: (digits: string) => void;
    placeholder?: string;
    inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
    return (
        <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 text-slate-500 [&>svg]:h-3.5 [&>svg]:w-3.5">
                {icon}
            </span>
            <IMaskInput
                mask={mask}
                lazy
                value={value.replace(/\D/g, '')}
                unmask
                onAccept={(_val: string, maskRef: { unmaskedValue: string }) => onAcceptUnmasked(maskRef.unmaskedValue)}
                placeholder={placeholder}
                inputMode={inputMode}
                className={inpBase}
            />
        </div>
    );
}

function FormCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={`rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-3 ${className}`}>
            <h3 className="mb-2.5 border-l-2 border-emerald-500/40 pl-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {title}
            </h3>
            {children}
        </div>
    );
}

type PlanRow = { id: number; name: string; price: number; license_count: number };

export type ResellerEditContext = {
    currentPlanId: number | null;
    currentPlanPrice: number | null;
    currentPlanName: string | null;
    currentPlanLicenses: number | null;
};

type Props = {
    f: ResellerForm;
    setF: React.Dispatch<React.SetStateAction<ResellerForm>>;
    mode: 'create' | 'edit';
    /** Planlar sekmesindeki bayi paketleri (yeni bayi formu) */
    plans?: PlanRow[];
    /** Düzenleme: mevcut paket bilgisi (yükseltme farkı) */
    editContext?: ResellerEditContext | null;
};

export function ResellerFormFields({ f, setF, mode, plans = [], editContext = null }: Props) {
    const { t } = useSaaSLocale();
    const { settings } = useSaaSStore();
    const currency = settings?.currency || '€';

    const upgradeCandidates = useMemo(() => {
        if (mode !== 'edit' || !editContext) return [];
        const curId = editContext.currentPlanId;
        const curP = Number(editContext.currentPlanPrice ?? 0);
        if (!curId) return plans;
        return plans.filter((p) => p.id !== curId && p.price > curP);
    }, [mode, editContext, plans]);

    const upgradePreview = useMemo(() => {
        if (mode !== 'edit' || f.upgrade_reseller_plan_id == null) return null;
        const target = plans.find((p) => p.id === f.upgrade_reseller_plan_id);
        if (!target) return null;
        const hadPlan = Boolean(editContext?.currentPlanId);
        const curPrice = Number(editContext?.currentPlanPrice ?? 0);
        const curLic = Number(editContext?.currentPlanLicenses ?? 0);
        const diff = hadPlan ? Math.max(0, target.price - curPrice) : target.price;
        const extraLic = hadPlan ? Math.max(0, target.license_count - curLic) : target.license_count;
        return { target, diff, extraLic };
    }, [mode, f.upgrade_reseller_plan_id, plans, editContext]);
    return (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-12 xl:gap-4">
            <div className="space-y-3 xl:col-span-5">
                <FormCard title={t('reseller.form.companyAccount')}>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <FieldLabel required>{t('reseller.form.companyTitle')}</FieldLabel>
                            <IconInput icon={<FiBriefcase />}>
                                <input
                                    required
                                    type="text"
                                    value={f.company_name}
                                    onChange={(e) => setF((p) => ({ ...p, company_name: e.target.value }))}
                                    placeholder={t('reseller.form.companyTitlePh')}
                                />
                            </IconInput>
                        </div>
                        <div>
                            <FieldLabel required={mode === 'create'}>{t('reseller.form.username')}</FieldLabel>
                            <IconInput icon={<FiUser />}>
                                <input
                                    required={mode === 'create'}
                                    readOnly={mode === 'edit'}
                                    type="text"
                                    value={f.username}
                                    onChange={(e) => setF((p) => ({ ...p, username: e.target.value }))}
                                    autoComplete="username"
                                />
                            </IconInput>
                        </div>
                        <div>
                            <FieldLabel required>{t('reseller.form.email')}</FieldLabel>
                            <IconInput icon={<FiMail />}>
                                <input
                                    required
                                    type="email"
                                    value={f.email}
                                    onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))}
                                    autoComplete="email"
                                />
                            </IconInput>
                        </div>
                        {mode === 'create' ? (
                            <div className="sm:col-span-2">
                                <FieldLabel required>{t('reseller.form.password')}</FieldLabel>
                                <IconInput icon={<FiLock />}>
                                    <input
                                        required
                                        type="password"
                                        value={f.password}
                                        onChange={(e) => setF((p) => ({ ...p, password: e.target.value }))}
                                        autoComplete="new-password"
                                    />
                                </IconInput>
                            </div>
                        ) : (
                            <div className="sm:col-span-2">
                                <FieldLabel>{t('reseller.form.newPassword')}</FieldLabel>
                                <IconInput icon={<FiLock />}>
                                    <input
                                        type="password"
                                        value={f.password}
                                        onChange={(e) => setF((p) => ({ ...p, password: e.target.value }))}
                                        placeholder={t('reseller.form.newPasswordPh')}
                                        autoComplete="new-password"
                                    />
                                </IconInput>
                            </div>
                        )}
                        <div className="sm:col-span-2 flex items-center gap-2 rounded-lg border border-white/5 bg-black/15 px-2 py-1.5">
                            <input
                                type="checkbox"
                                id="reseller-active"
                                checked={f.active}
                                onChange={(e) => setF((p) => ({ ...p, active: e.target.checked }))}
                                className="h-3.5 w-3.5 rounded border-white/20 bg-black/30 accent-emerald-500"
                            />
                            <label htmlFor="reseller-active" className="cursor-pointer text-xs text-slate-400">
                                {t('reseller.form.activeHelp')}
                            </label>
                        </div>
                    </div>
                </FormCard>

                <FormCard title={t('reseller.form.tax')}>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                            <FieldLabel>{t('reseller.form.taxNo')}</FieldLabel>
                            <MaskedIconField
                                icon={<FiHash />}
                                mask={taxMask}
                                value={f.tax_number}
                                onAcceptUnmasked={(digits) => setF((p) => ({ ...p, tax_number: digits }))}
                                placeholder={t('reseller.form.taxNoPh')}
                                inputMode="numeric"
                            />
                        </div>
                        <div>
                            <FieldLabel>{t('reseller.form.taxOffice')}</FieldLabel>
                            <IconInput icon={<FiFileText />}>
                                <input type="text" value={f.tax_office} onChange={(e) => setF((p) => ({ ...p, tax_office: e.target.value }))} />
                            </IconInput>
                        </div>
                    </div>
                </FormCard>

                <FormCard title={t('reseller.form.finance')}>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <FieldLabel>{t('reseller.form.commissionPct')}</FieldLabel>
                            <IconInput icon={<FiPercent />}>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={f.commission_rate}
                                    onChange={(e) => setF((p) => ({ ...p, commission_rate: Number(e.target.value) }))}
                                    className="tabular-nums text-emerald-300/90"
                                />
                            </IconInput>
                        </div>
                        {mode === 'create' && (
                            <div>
                                <FieldLabel>{t('reseller.form.initialLicenses')}</FieldLabel>
                                <IconInput icon={<FiDatabase />}>
                                    <input
                                        type="number"
                                        min={0}
                                        value={f.available_licenses}
                                        onChange={(e) => setF((p) => ({ ...p, available_licenses: Number(e.target.value) }))}
                                        className="tabular-nums"
                                    />
                                </IconInput>
                            </div>
                        )}
                    </div>
                </FormCard>

                {mode === 'create' && (
                    <FormCard title={t('reseller.form.planSection')}>
                        <div className="space-y-2">
                            {plans.length === 0 && (
                                <p className="text-[10px] text-amber-400/90">{t('reseller.form.noPlansInSystem')}</p>
                            )}
                            <div>
                                <FieldLabel>{t('reseller.form.planSelect')}</FieldLabel>
                                <IconInput icon={<FiPackage />}>
                                    <select
                                        value={f.reseller_plan_id != null ? String(f.reseller_plan_id) : ''}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setF((p) => ({
                                                ...p,
                                                reseller_plan_id: v === '' ? null : Number(v),
                                                purchase_payment_method: 'cash',
                                            }));
                                        }}
                                    >
                                        <option value="">{t('reseller.form.planNone')}</option>
                                        {plans.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name} — {currency}{Number(p.price).toFixed(2)} · +{p.license_count} lic
                                            </option>
                                        ))}
                                    </select>
                                </IconInput>
                            </div>
                            {f.reseller_plan_id != null && (
                                <div>
                                    <FieldLabel>{t('reseller.form.paymentMethod')}</FieldLabel>
                                    <IconInput icon={<FiCreditCard />}>
                                        <select
                                            value={f.purchase_payment_method}
                                            onChange={(e) =>
                                                setF((prev) => ({
                                                    ...prev,
                                                    purchase_payment_method: e.target.value as ResellerPaymentMethod,
                                                }))
                                            }
                                        >
                                            <option value="cash">{t('reseller.form.payCash')}</option>
                                            <option value="invoice">{t('reseller.form.payInvoice')}</option>
                                            <option value="complimentary">{t('reseller.form.payComplimentary')}</option>
                                        </select>
                                    </IconInput>
                                </div>
                            )}
                            <p className="text-[10px] leading-relaxed text-slate-500">{t('reseller.form.planHint')}</p>
                        </div>
                    </FormCard>
                )}

                {mode === 'edit' && (Boolean(f.reseller_plan_name) || f.reseller_plan_id != null) && (
                    <FormCard title={t('reseller.form.editPlan')}>
                        <p className="text-xs text-slate-300">
                            {f.reseller_plan_name || t('reseller.form.editPlanNone')}
                        </p>
                        {f.purchase_payment_method ? (
                            <p className="mt-1 text-[10px] text-slate-500">
                                {t('reseller.form.paymentMethod')}:{' '}
                                {f.purchase_payment_method === 'invoice'
                                    ? t('reseller.form.payInvoice')
                                    : f.purchase_payment_method === 'complimentary'
                                      ? t('reseller.form.payComplimentary')
                                      : t('reseller.form.payCash')}
                            </p>
                        ) : null}
                    </FormCard>
                )}

                {mode === 'edit' && editContext && (
                    <FormCard title={t('reseller.form.upgradeSection')}>
                        <div className="mb-2 flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-200/90">
                            <FiAlertCircle className="mt-0.5 shrink-0" size={12} />
                            <span>{t('reseller.form.upgradeHint')}</span>
                        </div>
                        {upgradeCandidates.length === 0 ? (
                            <p className="text-[10px] text-slate-500">{t('reseller.form.noUpgradePlans')}</p>
                        ) : (
                            <div className="space-y-2">
                                <div>
                                    <FieldLabel>{t('reseller.form.upgradeSelect')}</FieldLabel>
                                    <IconInput icon={<FiTrendingUp />}>
                                        <select
                                            value={f.upgrade_reseller_plan_id != null ? String(f.upgrade_reseller_plan_id) : ''}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setF((p) => ({
                                                    ...p,
                                                    upgrade_reseller_plan_id: v === '' ? null : Number(v),
                                                    upgrade_payment_method: 'cash',
                                                }));
                                            }}
                                        >
                                            <option value="">{t('reseller.form.upgradeNone')}</option>
                                            {upgradeCandidates.map((p) => (
                                                <option key={p.id} value={p.id}>
                                                    {p.name} — {currency}{Number(p.price).toFixed(2)} · +{p.license_count} lic
                                                </option>
                                            ))}
                                        </select>
                                    </IconInput>
                                </div>
                                {upgradePreview && (
                                    <>
                                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                                            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
                                                <span className="text-slate-500">{t('reseller.form.upgradeDiff')}</span>
                                                <div className="font-mono text-emerald-300/95">
                                                    {currency}{upgradePreview.diff.toFixed(2)}
                                                </div>
                                            </div>
                                            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
                                                <span className="text-slate-500">{t('reseller.form.upgradeExtraLic')}</span>
                                                <div className="font-mono text-slate-200">+{upgradePreview.extraLic}</div>
                                            </div>
                                        </div>
                                        <div>
                                            <FieldLabel>{t('reseller.form.upgradePayLabel')}</FieldLabel>
                                            <IconInput icon={<FiCreditCard />}>
                                                <select
                                                    value={f.upgrade_payment_method}
                                                    onChange={(e) =>
                                                        setF((prev) => ({
                                                            ...prev,
                                                            upgrade_payment_method: e.target.value as ResellerPaymentMethod,
                                                        }))
                                                    }
                                                >
                                                    <option value="cash">{t('reseller.form.payCash')}</option>
                                                    <option value="invoice">{t('reseller.form.payInvoice')}</option>
                                                    <option value="complimentary">{t('reseller.form.payComplimentary')}</option>
                                                </select>
                                            </IconInput>
                                        </div>
                                        <p className="text-[10px] text-slate-500">{t('reseller.form.upgradePayHint')}</p>
                                    </>
                                )}
                            </div>
                        )}
                    </FormCard>
                )}
            </div>

            <div className="space-y-3 xl:col-span-7">
                <FormCard title={t('reseller.form.address')}>
                    <div className="space-y-2">
                        <div>
                            <FieldLabel>{t('reseller.form.billingAddress')}</FieldLabel>
                            <IconTextarea icon={<FiMapPin />}>
                                <textarea
                                    rows={2}
                                    value={f.billing_address}
                                    onChange={(e) => setF((p) => ({ ...p, billing_address: e.target.value }))}
                                    placeholder={t('reseller.form.billingAddressPh')}
                                />
                            </IconTextarea>
                        </div>
                        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                            <div>
                                <FieldLabel>{t('reseller.form.district')}</FieldLabel>
                                <IconInput icon={<FiMapPin />}>
                                    <input type="text" value={f.district} onChange={(e) => setF((p) => ({ ...p, district: e.target.value }))} />
                                </IconInput>
                            </div>
                            <div>
                                <FieldLabel>{t('reseller.form.city')}</FieldLabel>
                                <IconInput icon={<FiMapPin />}>
                                    <input type="text" value={f.city} onChange={(e) => setF((p) => ({ ...p, city: e.target.value }))} />
                                </IconInput>
                            </div>
                            <div>
                                <FieldLabel>{t('reseller.form.postalCode')}</FieldLabel>
                                <MaskedIconField
                                    icon={<FiHash />}
                                    mask={postalMask}
                                    value={f.postal_code}
                                    onAcceptUnmasked={(digits) => setF((p) => ({ ...p, postal_code: digits }))}
                                    placeholder={t('reseller.form.postalPh')}
                                    inputMode="numeric"
                                />
                            </div>
                            <div>
                                <FieldLabel>{t('reseller.form.country')}</FieldLabel>
                                <IconInput icon={<FiGlobe />}>
                                    <input type="text" value={f.country} onChange={(e) => setF((p) => ({ ...p, country: e.target.value }))} />
                                </IconInput>
                            </div>
                        </div>
                    </div>
                </FormCard>

                <FormCard title={t('reseller.form.contact')}>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="sm:col-span-3">
                            <FieldLabel>{t('reseller.form.contactPerson')}</FieldLabel>
                            <IconInput icon={<FiUser />}>
                                <input type="text" value={f.contact_person} onChange={(e) => setF((p) => ({ ...p, contact_person: e.target.value }))} />
                            </IconInput>
                        </div>
                        <div>
                            <FieldLabel>{t('reseller.form.phone')}</FieldLabel>
                            <MaskedIconField
                                icon={<FiPhone />}
                                mask={phoneMask}
                                value={f.phone}
                                onAcceptUnmasked={(digits) => setF((p) => ({ ...p, phone: digits }))}
                                placeholder={t('reseller.form.phoneFormatPh')}
                                inputMode="tel"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <FieldLabel>{t('reseller.form.mobile')}</FieldLabel>
                            <MaskedIconField
                                icon={<FiSmartphone />}
                                mask={phoneMask}
                                value={f.mobile_phone}
                                onAcceptUnmasked={(digits) => setF((p) => ({ ...p, mobile_phone: digits }))}
                                placeholder={t('reseller.form.phoneFormatPh')}
                                inputMode="tel"
                            />
                        </div>
                    </div>
                </FormCard>

                <FormCard title={t('reseller.form.internalNote')}>
                    <IconTextarea icon={<FiEdit3 />}>
                        <textarea
                            rows={2}
                            value={f.admin_notes}
                            onChange={(e) => setF((p) => ({ ...p, admin_notes: e.target.value }))}
                            className="min-h-[64px]"
                            placeholder={t('reseller.form.internalNotePh')}
                        />
                    </IconTextarea>
                </FormCard>
            </div>
        </div>
    );
}
