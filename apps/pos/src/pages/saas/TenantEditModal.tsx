import React, { useEffect, useState } from 'react';
import { FiEdit3, FiCopy, FiRefreshCw } from 'react-icons/fi';
import { useSaaSStore, type Tenant } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { Modal, InputGroup, SelectGroup } from './SaaSShared';

type Plan = 'basic' | 'pro' | 'enterprise';

function toPatchBody(t: {
    name: string;
    status: Tenant['status'];
    subscriptionPlan: Plan;
    contactEmail: string;
    contactPhone: string;
    authorizedPerson: string;
    taxOffice: string;
    taxNumber: string;
    address: string;
    maxUsers: number;
    maxBranches: number;
    deviceResetQuotaOverride: number | null;
}) {
    const body: Record<string, unknown> = {
        name: t.name.trim(),
        status: t.status,
        subscriptionPlan: t.subscriptionPlan,
        maxUsers: t.maxUsers,
        maxBranches: t.maxBranches,
    };
    const em = t.contactEmail.trim();
    if (em) body.contactEmail = em;
    const ph = t.contactPhone.trim();
    if (ph) body.contactPhone = ph;
    const ap = t.authorizedPerson.trim();
    if (ap) body.authorizedPerson = ap;
    const txo = t.taxOffice.trim();
    if (txo) body.taxOffice = txo;
    const txn = t.taxNumber.trim();
    if (txn) body.taxNumber = txn;
    const ad = t.address.trim();
    if (ad) body.address = ad;
    body.deviceResetQuotaOverride = t.deviceResetQuotaOverride;
    return body;
}

function generateMasterPassword(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const len = 8;
    const bytes = new Uint8Array(len);
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    let out = '';
    for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
}

export const TenantEditModal: React.FC<{
    tenant: Tenant;
    onClose: () => void;
}> = ({ tenant, onClose }) => {
    const { t } = useSaaSLocale();
    const { updateTenant, error } = useSaaSStore();
    const [saving, setSaving] = useState(false);
    const [generatingMaster, setGeneratingMaster] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [form, setForm] = useState({
        name: tenant.name,
        status: tenant.status,
        subscriptionPlan: (tenant.subscription_plan || 'basic') as Plan,
        contactEmail: tenant.contact_email || '',
        contactPhone: tenant.contact_phone || '',
        authorizedPerson: tenant.authorized_person || '',
        taxOffice: tenant.tax_office || '',
        taxNumber: tenant.tax_number || '',
        address: tenant.address || '',
        maxUsers: tenant.max_users,
        maxBranches: tenant.max_branches,
        deviceResetQuotaOverride: tenant.device_reset_quota_override ?? null,
    });

    useEffect(() => {
        setForm({
            name: tenant.name,
            status: tenant.status,
            subscriptionPlan: (tenant.subscription_plan || 'basic') as Plan,
            contactEmail: tenant.contact_email || '',
            contactPhone: tenant.contact_phone || '',
            authorizedPerson: tenant.authorized_person || '',
            taxOffice: tenant.tax_office || '',
            taxNumber: tenant.tax_number || '',
            address: tenant.address || '',
            maxUsers: tenant.max_users,
            maxBranches: tenant.max_branches,
            deviceResetQuotaOverride: tenant.device_reset_quota_override ?? null,
        });
    }, [tenant]);

    const handleGenerateMasterPassword = async () => {
        const pw = generateMasterPassword();
        setGeneratingMaster(true);
        const ok = await updateTenant(tenant.id, { masterPassword: pw });
        setGeneratingMaster(false);
        if (ok) setCopiedField(null);
    };

    const copyToClipboard = async (text: string, fieldKey: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(fieldKey);
            window.setTimeout(() => setCopiedField((k) => (k === fieldKey ? null : k)), 2000);
        } catch {
            /* yut */
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (form.name.trim().length < 2) return;
        setSaving(true);
        const ok = await updateTenant(tenant.id, toPatchBody(form));
        setSaving(false);
        if (ok) onClose();
    };

    return (
        <Modal show={true} title={t('tenantEdit.title')} onClose={onClose} maxWidth="max-w-2xl" titleUppercase={false}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-slate-300 text-xs space-y-3">
                    <div className="flex items-start gap-3">
                        <FiEdit3 className="text-blue-400 shrink-0 mt-0.5" size={18} />
                        <div className="min-w-0 flex-1">
                            <span className="font-mono text-slate-400 block">{tenant.schema_name}</span>
                            <span className="text-[10px] text-slate-500">{t('tenantEdit.schemaHint')}</span>
                        </div>
                    </div>

                    <div className="space-y-2 pl-0 sm:pl-8 border-t border-blue-500/20 pt-3">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('tenantEdit.licenseUuid')}</span>
                            <div className="flex items-start gap-2">
                                <span className="font-mono text-[11px] text-slate-200 break-all flex-1 min-w-0">{tenant.id}</span>
                                <button
                                    type="button"
                                    onClick={() => void copyToClipboard(tenant.id, 'uuid')}
                                    className={`shrink-0 p-1 rounded-md transition-colors ${
                                        copiedField === 'uuid' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-white hover:bg-white/10'
                                    }`}
                                    title={copiedField === 'uuid' ? t('tenants.copied') : t('tenantEdit.copyValue')}
                                    aria-label={t('tenantEdit.copyValue')}
                                >
                                    <FiCopy size={14} />
                                </button>
                            </div>
                        </div>

                        {tenant.special_license_key ? (
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('tenantEdit.specialLicenseKey')}</span>
                                <div className="flex items-start gap-2">
                                    <span className="font-mono text-[11px] text-slate-200 break-all flex-1 min-w-0">{tenant.special_license_key}</span>
                                    <button
                                        type="button"
                                        onClick={() => void copyToClipboard(tenant.special_license_key!, 'special')}
                                        className={`shrink-0 p-1 rounded-md transition-colors ${
                                            copiedField === 'special' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-white hover:bg-white/10'
                                        }`}
                                        title={copiedField === 'special' ? t('tenants.copied') : t('tenantEdit.copyValue')}
                                        aria-label={t('tenantEdit.copyValue')}
                                    >
                                        <FiCopy size={14} />
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('tenantEdit.masterPassword')}</span>
                            <div className="flex flex-wrap items-start gap-2">
                                <span className="font-mono text-[11px] text-amber-200/90 break-all flex-1 min-w-0">
                                    {tenant.master_password?.trim() ? tenant.master_password : t('tenantEdit.notSet')}
                                </span>
                                {tenant.master_password?.trim() ? (
                                    <button
                                        type="button"
                                        onClick={() => void copyToClipboard(tenant.master_password!.trim(), 'master')}
                                        className={`shrink-0 p-1 rounded-md transition-colors ${
                                            copiedField === 'master' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-white hover:bg-white/10'
                                        }`}
                                        title={copiedField === 'master' ? t('tenants.copied') : t('tenantEdit.copyValue')}
                                        aria-label={t('tenantEdit.copyValue')}
                                    >
                                        <FiCopy size={14} />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={generatingMaster}
                                        onClick={() => void handleGenerateMasterPassword()}
                                        className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50"
                                    >
                                        <FiRefreshCw size={12} className={generatingMaster ? 'animate-spin' : ''} />
                                        {generatingMaster ? t('tenantEdit.generatingMaster') : t('tenantEdit.generateMaster')}
                                    </button>
                                )}
                            </div>
                        </div>

                        <p className="text-[10px] text-slate-500 pt-1">{t('tenantEdit.sensitiveNote')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputGroup label={t('tenantEdit.name')} value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder={t('tenantEdit.namePh')} />
                    <SelectGroup
                        label={t('tenantEdit.status')}
                        value={form.status}
                        onChange={(v) => setForm({ ...form, status: v as Tenant['status'] })}
                        options={[
                            { label: t('tenantEdit.status.active'), value: 'active' },
                            { label: t('tenantEdit.status.suspended'), value: 'suspended' },
                            { label: t('tenantEdit.status.inactive'), value: 'inactive' },
                        ]}
                    />
                    <SelectGroup
                        label={t('modal.tenant.plan')}
                        value={form.subscriptionPlan}
                        onChange={(v) => setForm({ ...form, subscriptionPlan: v as Plan })}
                        options={[
                            { label: 'Basic', value: 'basic' },
                            { label: 'Pro', value: 'pro' },
                            { label: 'Enterprise', value: 'enterprise' },
                        ]}
                    />
                    <InputGroup label={t('modal.tenant.email')} type="email" value={form.contactEmail} onChange={(v) => setForm({ ...form, contactEmail: v })} placeholder={t('modal.tenant.emailPh')} />
                    <InputGroup label={t('modal.tenant.phone')} value={form.contactPhone} onChange={(v) => setForm({ ...form, contactPhone: v })} placeholder={t('modal.tenant.phonePh')} />
                    <InputGroup label={t('modal.tenant.contact')} value={form.authorizedPerson} onChange={(v) => setForm({ ...form, authorizedPerson: v })} />
                    <InputGroup label={t('modal.tenant.taxOffice')} value={form.taxOffice} onChange={(v) => setForm({ ...form, taxOffice: v })} />
                    <InputGroup label={t('tenantEdit.taxId')} value={form.taxNumber} onChange={(v) => setForm({ ...form, taxNumber: v })} />
                </div>
                <InputGroup label={t('modal.tenant.address')} value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder={t('modal.tenant.addressPh')} />

                <div className="grid grid-cols-2 gap-4">
                    <InputGroup
                        label={t('modal.tenant.maxUsers')}
                        value={String(form.maxUsers)}
                        onChange={(v) => setForm({ ...form, maxUsers: Math.max(1, parseInt(v, 10) || 1) })}
                    />
                    <InputGroup
                        label={t('modal.tenant.maxBranches')}
                        value={String(form.maxBranches)}
                        onChange={(v) => setForm({ ...form, maxBranches: Math.max(1, parseInt(v, 10) || 1) })}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputGroup
                        label="Cihaz Kilidi Reset Kotası (Ay)"
                        value={form.deviceResetQuotaOverride == null ? '' : String(form.deviceResetQuotaOverride)}
                        onChange={(v) => {
                            const trimmed = String(v).trim();
                            if (!trimmed) {
                                setForm({ ...form, deviceResetQuotaOverride: null });
                                return;
                            }
                            const parsed = Number.parseInt(trimmed, 10);
                            setForm({ ...form, deviceResetQuotaOverride: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 });
                        }}
                        placeholder="Boş bırak: plan varsayılanı"
                    />
                </div>

                {error && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">{error}</div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-slate-400 hover:bg-white/10 font-bold text-sm">
                        {t('tenantEdit.cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={saving || form.name.trim().length < 2}
                        className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm disabled:opacity-50"
                    >
                        {saving ? t('tenantEdit.saving') : t('tenantEdit.save')}
                    </button>
                </div>
            </form>
        </Modal>
    );
};
