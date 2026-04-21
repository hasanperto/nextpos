import type { Reseller } from '../../store/useSaaSStore';

export type ResellerPaymentMethod = 'cash' | 'invoice' | 'complimentary';

export type ResellerForm = {
    username: string;
    email: string;
    password: string;
    company_name: string;
    tax_number: string;
    tax_office: string;
    billing_address: string;
    city: string;
    district: string;
    postal_code: string;
    country: string;
    phone: string;
    mobile_phone: string;
    contact_person: string;
    admin_notes: string;
    commission_rate: number;
    available_licenses: number;
    active: boolean;
    /** Yeni bayi: Planlar sekmesindeki bayi paketi */
    reseller_plan_id: number | null;
    /** Paket satışı — payment_history + finans özeti */
    purchase_payment_method: ResellerPaymentMethod;
    /** Düzenleme: API’den salt okunur */
    reseller_plan_name?: string | null;
    /** Düzenleme: daha yüksek bayi paketine yükseltme (fark + ödeme) */
    upgrade_reseller_plan_id: number | null;
    upgrade_payment_method: ResellerPaymentMethod;
};

function coercePaymentMethod(v: string | null | undefined): ResellerPaymentMethod {
    if (v === 'invoice' || v === 'complimentary') return v;
    return 'cash';
}

export const emptyForm = (): ResellerForm => ({
    username: '',
    email: '',
    password: '',
    company_name: '',
    tax_number: '',
    tax_office: '',
    billing_address: '',
    city: '',
    district: '',
    postal_code: '',
    country: 'Türkiye',
    phone: '',
    mobile_phone: '',
    contact_person: '',
    admin_notes: '',
    commission_rate: 60,
    available_licenses: 0,
    active: true,
    reseller_plan_id: null,
    purchase_payment_method: 'cash',
    reseller_plan_name: null,
    upgrade_reseller_plan_id: null,
    upgrade_payment_method: 'cash',
});

export function resellerToForm(r: Reseller): ResellerForm {
    return {
        username: r.username || '',
        email: r.email || '',
        password: '',
        company_name: r.company_name || '',
        tax_number: String(r.tax_number ?? '').replace(/\D/g, ''),
        tax_office: r.tax_office ?? '',
        billing_address: r.billing_address ?? '',
        city: r.city ?? '',
        district: r.district ?? '',
        postal_code: String(r.postal_code ?? '').replace(/\D/g, ''),
        country: r.country ?? 'Türkiye',
        phone: String(r.phone ?? '').replace(/\D/g, ''),
        mobile_phone: String(r.mobile_phone ?? '').replace(/\D/g, ''),
        contact_person: r.contact_person ?? '',
        admin_notes: r.admin_notes ?? '',
        commission_rate: Number(r.commission_rate) || 0,
        available_licenses: Number(r.available_licenses) || 0,
        active: r.active === 1 || r.active === true,
        reseller_plan_id: r.reseller_plan_id ?? null,
        purchase_payment_method: coercePaymentMethod(
            r.purchase_payment_method != null ? String(r.purchase_payment_method) : undefined,
        ),
        reseller_plan_name: r.reseller_plan_name ?? null,
        upgrade_reseller_plan_id: null,
        upgrade_payment_method: 'cash',
    };
}
