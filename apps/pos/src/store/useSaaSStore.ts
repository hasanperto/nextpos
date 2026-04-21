import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ═══════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════

export interface Tenant {
    id: string;
    name: string;
    schema_name: string;
    status: 'active' | 'suspended' | 'inactive';
    subscription_plan: string;
    license_expires_at: string;
    contact_email: string;
    contact_phone?: string;
    authorized_person?: string;
    tax_office?: string;
    tax_number?: string;
    special_license_key?: string;
    address?: string;
    master_password?: string;
    max_users: number;
    max_branches: number;
    device_reset_quota_monthly?: number;
    device_reset_quota_override?: number | null;
    device_reset_used?: number;
    device_reset_remaining?: number;
    device_reset_month?: string;
    created_at: string;
}

export interface BillingModuleRow {
    code: string;
    name: string;
    description?: string | null;
    category: string;
    setup_price: number;
    monthly_price: number;
    sort_order?: number;
}

/** Süper admin: faturalama modül kataloğu (pasif dahil, tam satır) */
export interface BillingModuleAdminRow {
    id: number;
    code: string;
    name: string;
    description: string | null;
    category: string;
    setup_price: number;
    monthly_price: number;
    icon: string | null;
    sort_order: number;
    is_active: number;
    created_at?: string;
}

export type BillingModuleCreateInput = {
    code: string;
    name: string;
    description?: string | null;
    category: 'core' | 'feature' | 'channel' | 'device' | 'service' | 'integration';
    setup_price: number;
    monthly_price: number;
    icon?: string | null;
    sort_order?: number;
};

export type BillingModulePatchInput = Partial<{
    name: string;
    description: string | null;
    category: 'core' | 'feature' | 'channel' | 'device' | 'service' | 'integration';
    setup_price: number;
    monthly_price: number;
    icon: string | null;
    sort_order: number;
    is_active: boolean;
}>;

export interface PlanModuleRow {
    code: string;
    name: string;
    description?: string | null;
    category: string;
    setup_price: number;
    monthly_price: number;
    mode: 'included' | 'addon' | 'locked';
}

export type ResellerWalletTopupRow = {
    id: number;
    reseller_id: number;
    amount: string | number;
    currency?: string;
    note?: string | null;
    payment_method?: string | null;
    transfer_reference?: string | null;
    transfer_date?: string | null;
    transfer_time?: string | null;
    stripe_checkout_session_id?: string | null;
    status: string;
    created_at?: string;
    username?: string | null;
    company_name?: string | null;
};

export interface Reseller {
    id: number;
    username: string;
    email: string;
    active: boolean | number;
    role: string;
    company_name: string;
    tax_number?: string | null;
    tax_office?: string | null;
    billing_address?: string | null;
    city?: string | null;
    district?: string | null;
    postal_code?: string | null;
    country?: string | null;
    phone?: string | null;
    mobile_phone?: string | null;
    contact_person?: string | null;
    admin_notes?: string | null;
    commission_rate: number;
    available_licenses: number;
    wallet_balance: number;
    reseller_plan_id?: number | null;
    reseller_plan_name?: string | null;
    reseller_plan_price?: number | null;
    reseller_plan_licenses?: number | null;
    purchase_payment_method?: string | null;
    created_at: string;
    total_tenants?: number;
    tenant_count?: number;
    monthly_volume?: number;
}

interface SaaSStats {
    totalTenants: number;
    activeTenants: number;
    monthlyRevenue: number;
    systemHealth: number;
    lastUpdate: string;
    wallet_balance?: number;
    available_licenses?: number;
}

interface SupportTicket {
    id: number;
    tenant_id: string;
    tenant_name?: string;
    subject: string;
    message: string;
    status: 'open' | 'in_progress' | 'waiting' | 'closed';
    priority: 'low' | 'medium' | 'high' | 'critical';
    category?: string;
    first_response_at?: string;
    resolved_at?: string;
    created_at: string;
}

interface SystemBackup {
    id: number;
    filename: string;
    size: number;
    status: string;
    backup_type?: string;
    tenant_id?: string;
    created_by: string;
    created_at: string;
}

interface SystemSettings {
    id?: number;
    currency: string;
    base_subscription_fee: number;
    monthly_license_fee: number;
    trial_days?: number;
    reseller_setup_rate?: number;
    system_setup_rate?: number;
    reseller_monthly_rate?: number;
    system_monthly_rate?: number;
    reseller_addon_rate?: number;
    annual_discount_rate?: number;
    audit_retention_days?: number;
    // Compliance & Global (Faz 10/11)
    tse_enabled?: boolean;
    fiscal_provider?: 'fiskaly' | 'sign_de' | 'none';
    digital_receipt_enabled?: boolean;
    archive_retention_years?: number;
    // Virtual POS (Phase 13)
    iyzico_api_key?: string;
    iyzico_secret_key?: string;
    paytr_merchant_id?: string;
    paytr_merchant_key?: string;
    paytr_merchant_salt?: string;
    stripe_public_key?: string;
    stripe_secret_key?: string;
    active_gateway?: 'iyzico' | 'paytr' | 'stripe' | 'none';
    /** 1: sandbox/test (iyzico URI, PayTR test, Stripe sk_test_) */
    virtual_pos_test_mode?: number;
    /** SaaS: bayi havale ekranında gösterilecek banka hesapları */
    reseller_bank_accounts?: Array<{
        bank_name: string;
        account_holder: string;
        iban: string;
        currency?: string;
        note?: string;
    }>;
}

interface PaymentRecord {
    id: number;
    tenant_id: string;
    tenant_name?: string;
    amount: number;
    currency: string;
    payment_type: string;
    payment_method: string;
    invoice_number: string;
    description?: string;
    status: string;
    due_date?: string;
    paid_at?: string;
    created_at: string;
}

interface FinancialSummary {
    totalRevenue?: number; // Süper admin: toplanan abonelik/lisans geliri
    totalEarnings?: number; // Bayi komisyon geliri
    pendingRevenue: number;
    monthlyEarnings?: { month: string; total: number }[];
    /** Süper admin: aylık gelir serisi */
    monthlyRevenue?: { month: string; total: number; count: number }[];
    nextMonthEstimatedRevenue?: number;
    pendingPayments?: { total: number; count: number };
    overduePayments?: { total: number; count: number };
    planDistribution: { plan: string; count: number }[];
    revenueByType?: { type: string; total: number }[];
    /** Süper admin: restoran / bayi / ek modül / komisyon */
    breakdown?: {
        restaurantTenantPaid: number;
        resellerChannelPaid: number;
        addonModulesPaid: number;
        commissionPaidToResellers: number;
        /** Onaylanan bayi cüzdan yüklemeleri (payment_history) */
        resellerWalletTopupsPaid?: number;
    };
    pendingBreakdown?: { tenant: number; resellerChannel: number; other: number };
    paidByPaymentType?: { payment_type: string; total: number; count: number }[];
    lastUpdate?: string;
}

interface AuditLog {
    id: number;
    user_id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    old_value: any;
    new_value: any;
    ip_address: string;
    user_agent?: string;
    risk_level?: 'low' | 'medium' | 'high';
    created_at: string;
}

interface SecuritySummary {
    failedLogins24h: number;
    successLogins24h: number;
    totalAuditLogs24h: number;
    activeApiKeys: number;
    recentActivity: { action: string; count: number }[];
}

interface ApiKey {
    id: number;
    tenant_id: string;
    tenant_name?: string;
    key_value: string;
    name: string;
    permissions: any;
    is_active: boolean;
    last_used_at?: string;
    expires_at?: string;
    created_at: string;
}

interface GrowthReport {
    monthlyGrowth: { month: string; new_tenants: number }[];
    churnRate: number;
    churnedCount: number;
    totalTenants: number;
    topTenants: any[];
    planDistribution: { plan: string; count: number; revenue?: number }[];
    revenueForecast?: number;
    churnRiskCount?: number;
    aiInsights?: {
        forecastMessage: string;
        riskLevel: 'healthy' | 'warning' | 'critical';
    };
}

interface SubscriptionPlan {
    id: number;
    name: string;
    code: string;
    monthly_fee: number;
    setup_fee: number;
    features: any;
    max_users: number;
    max_branches: number;
    max_products: number;
    max_devices?: number;
    max_printers?: number;
    device_reset_quota_monthly?: number;
    trial_days: number;
    is_active: boolean;
}

interface PromoCode {
    id: number;
    code: string;
    discount_type: 'percent' | 'fixed';
    discount_value: number;
    max_uses: number;
    used_count: number;
    valid_from?: string;
    valid_until?: string;
    is_active: boolean;
}

interface CustomerNote {
    id: number;
    tenant_id: string;
    tenant_name?: string;
    note_type: string;
    subject?: string;
    content: string;
    created_by: string;
    created_at: string;
}

interface Contract {
    id: number;
    tenant_id: string;
    tenant_name?: string;
    contract_number: string;
    start_date: string;
    end_date?: string;
    monthly_amount: number;
    status: string;
    created_at: string;
}

interface SystemHealth {
    status: string;
    dbLatency: string;
    dbSizes: any[];
    activeConnections: number;
    uptimeSeconds: number;
    uptimeFormatted: string;
    recentMetrics: any[];
}

interface AlertRule {
    id: number;
    name: string;
    metric_type: string;
    threshold: number;
    operator: string;
    severity: string;
    is_active: boolean;
    last_triggered?: string;
}

interface TicketMessage {
    id: number;
    ticket_id: number;
    sender_type: 'admin' | 'tenant';
    sender_name: string;
    message: string;
    created_at: string;
}

interface SupportStats {
    open: number;
    inProgress: number;
    closed: number;
    avgResponseMinutes: number;
}

interface BackupStats {
    totalBackups: number;
    totalSizeMB: string;
    byType: any[];
    recentBackups: SystemBackup[];
}

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

interface SaaSState {
    token: string | null;
    admin: any | null;
    tenants: Tenant[];
    stats: SaaSStats | null;
    backups: SystemBackup[];
    tickets: SupportTicket[];
    settings: SystemSettings | null;
    isLoading: boolean;
    error: string | null;

    // New state
    payments: PaymentRecord[];
    financialSummary: FinancialSummary | null;
    financeInbox: { pending: PaymentRecord[]; paidRecent: PaymentRecord[] } | null;
    accountingUpcoming: PaymentRecord[];
    accountingInstallments: PaymentRecord[];
    accountingNotifications: any[];
    accountingAllPayments: { rows: PaymentRecord[]; summary: any } | null;
    invoices: any[];
    posInvoices: any[];
    posInvoiceEvents: any[];
    selectedTenantId: string | null;
    selectedPosInvoiceNo: string | null;
    auditLogs: AuditLog[];
    securitySummary: SecuritySummary | null;
    apiKeys: ApiKey[];
    growthReport: GrowthReport | null;
    plans: SubscriptionPlan[];
    promoCodes: PromoCode[];
    customerNotes: CustomerNote[];
    contracts: Contract[];
    systemHealth: SystemHealth | null;
    alertRules: AlertRule[];
    ticketMessages: TicketMessage[];
    supportStats: SupportStats | null;
    backupStats: BackupStats | null;
    knowledgeBase: any[];
    selectedTicket: SupportTicket | null;
    resellers: Reseller[];
    resellerPlans: any[];
    resellerWalletTopups: ResellerWalletTopupRow[];
    /** Süper admin: bekleyen bayi cüzdan talebi sayısı */
    resellerTopupPendingCount: number | null;
    /** Paket × modül matrisi (son yüklenen) */
    planModuleMatrix: { planCode: string; modules: PlanModuleRow[] } | null;
    billingModuleCatalog: BillingModuleRow[];
    billingModulesAdmin: BillingModuleAdminRow[];
    /** GET /modules/admin hata metni (token gecikmesi / 403 / ağ) */
    billingModulesAdminError: string | null;
    /** Gerçek zamanlı bayi/sistem akışı */
    liveFeed: any[];
    /** { [tenantId]: count } */
    presence: Record<string, number>;
    addLiveFeedItem: (item: any) => void;
    clearLiveFeed: () => void;
    /** Gerçek zamanlı istatistik yaması (sayfa yenilemeden MRR artışı vb.) */
    updateStatsOnSale: (amount: number) => void;

    // Auth
    /** Tüm kiracıların anlık online statusunu toplar */
    fetchPresence: () => Promise<void>;
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => void;

    // Original
    fetchTenants: () => Promise<void>;
    fetchStats: () => Promise<void>;
    fetchBackups: () => Promise<void>;
    fetchTickets: () => Promise<void>;
    fetchSettings: () => Promise<void>;
    createBackup: () => Promise<boolean>;
    createTenant: (data: any) => Promise<boolean>;
    updateTenant: (id: string, data: any) => Promise<boolean>;
    updateTicket: (id: number, status: string) => Promise<boolean>;
    updateSettings: (data: SystemSettings) => Promise<boolean>;

    // Reseller
    fetchResellers: () => Promise<void>;
    createReseller: (data: any) => Promise<boolean>;
    updateReseller: (id: number, data: any) => Promise<boolean>;
    deleteReseller: (id: number) => Promise<boolean>;
    fetchResellerPlans: () => Promise<void>;
    addResellerPlan: (data: any) => Promise<boolean>;
    updateResellerPlan: (id: number, data: any) => Promise<boolean>;
    deleteResellerPlan: (id: number) => Promise<boolean>;
    purchaseResellerPlan: (planId: number) => Promise<boolean>;
    fetchResellerWalletTopupsAdmin: () => Promise<void>;
    fetchResellerTopupPendingCount: () => Promise<void>;
    reviewResellerWalletTopup: (id: number, action: 'approve' | 'reject') => Promise<{ ok: boolean; error?: string }>;

    // Finance
    fetchPayments: (filters?: any) => Promise<void>;
    fetchFinancialSummary: () => Promise<void>;
    fetchFinanceInbox: () => Promise<void>;
    addPayment: (data: any) => Promise<boolean>;
    updatePaymentStatus: (id: number, status: string) => Promise<boolean>;
    recordSubscriptionPayment: (tenantId: string, amount?: number, billingCycle?: 'monthly' | 'yearly') => Promise<boolean>;
    sendPaymentDueMail: (paymentId: number) => Promise<boolean>;
    fetchAccountingUpcoming: () => Promise<void>;
    fetchAccountingInstallments: (status?: string) => Promise<void>;
    fetchAccountingNotifications: (limit?: number) => Promise<void>;
    fetchAccountingAllPayments: (filters?: any) => Promise<void>;
    fetchInvoices: (filters?: { status?: string; tenant?: string; from?: string; to?: string }) => Promise<void>;
    fetchInvoiceDetail: (invoiceNumber: string) => Promise<any | null>;
    fetchPosInvoices: (tenantId: string, filters?: { from?: string; to?: string; branchId?: number; cashierId?: number; status?: string; paymentStatus?: string; paymentMethod?: string; q?: string; limit?: number }) => Promise<any[]>;
    fetchPosInvoiceDetail: (tenantId: string, posInvoiceNo: string) => Promise<any | null>;
    fetchPosInvoicePdf: (tenantId: string, posInvoiceNo: string) => Promise<Blob>;
    sendPosInvoiceEmail: (tenantId: string, posInvoiceNo: string, to?: string) => Promise<{ ok: boolean; error?: string }>;
    fetchPosInvoiceEvents: (tenantId: string, filters?: { posInvoiceNo?: string; from?: string; to?: string; eventType?: string; limit?: number }) => Promise<any[]>;
    setSelectedTenantId: (tenantId: string | null) => void;
    setSelectedPosInvoiceNo: (posInvoiceNo: string | null) => void;

    // Security
    fetchAuditLogs: (filters?: any) => Promise<void>;
    fetchSecuritySummary: () => Promise<void>;
    fetchLoginAttempts: () => Promise<void>;
    fetchApiKeys: () => Promise<void>;
    addApiKey: (data: any) => Promise<boolean>;
    revokeApiKey: (id: number) => Promise<boolean>;

    // Reports
    fetchGrowthReport: () => Promise<void>;

    // Plans
    fetchPlans: () => Promise<void>;
    addPlan: (data: any) => Promise<boolean>;
    updatePlan: (id: number, data: any) => Promise<boolean>;
    deletePlan: (id: number) => Promise<boolean>;
    fetchPromoCodes: () => Promise<void>;
    addPromoCode: (data: any) => Promise<boolean>;
    togglePromoCode: (id: number) => Promise<boolean>;

    // CRM
    fetchCustomerNotes: (tenant_id?: string) => Promise<void>;
    addCustomerNote: (data: any) => Promise<boolean>;
    fetchContracts: (tenant_id?: string) => Promise<void>;
    addContract: (data: any) => Promise<boolean>;

    // Monitoring
    fetchSystemHealth: () => Promise<void>;
    fetchAlertRules: () => Promise<void>;
    addAlertRule: (data: any) => Promise<boolean>;
    toggleAlertRule: (id: number) => Promise<boolean>;

    // Support
    fetchSupportStats: () => Promise<void>;
    fetchTicketDetail: (id: number) => Promise<any>;
    fetchTicketMessages: (ticketId: number) => Promise<void>;
    sendTicketMessage: (ticketId: number, message: string) => Promise<boolean>;
    fetchKnowledgeBase: () => Promise<void>;
    addKBArticle: (data: any) => Promise<boolean>;

    // Backup
    createTenantBackup: (tenant_id: string) => Promise<boolean>;
    fetchBackupStats: () => Promise<void>;

    // Billing / modüller
    fetchPlanModuleMatrix: (planCode: string) => Promise<void>;
    savePlanModuleRules: (planCode: string, rules: Record<string, 'included' | 'addon' | 'locked'>) => Promise<boolean>;
    fetchBillingCatalog: () => Promise<void>;
    fetchBillingModulesAdmin: () => Promise<void>;
    createBillingModule: (input: BillingModuleCreateInput) => Promise<boolean>;
    updateBillingModule: (code: string, patch: BillingModulePatchInput) => Promise<boolean>;
    deleteBillingModule: (code: string, hard?: boolean) => Promise<boolean>;
    fetchTenantEntitlements: (
        tenantId: string
    ) => Promise<{
        tenantId: string;
        entitlements: any[];
        billingSnapshot?: {
            planCode: string;
            billingCycle: 'monthly' | 'yearly';
            monthlyRecurringTotal: number;
            planBaseMonthly: number;
            monthlyFromAddons: number;
            nextPaymentDue: string | null;
        } | null;
    } | null>;
    purchaseTenantAddons: (
        tenantId: string,
        module_codes: string[],
        extra_device_qty?: number,
        payment_method?: 'wallet_balance' | 'bank_transfer' | 'admin_card' | 'cash'
    ) => Promise<{ ok: boolean; error?: string; added?: string[]; skipped?: string[]; totals?: { setup: number; monthly: number } }>;
    
    // Virtual POS (Phase 13)
    generatePaymentLink: (data: {
        tenantId: string;
        amount: number;
        currency: string;
        description: string;
        paymentType?: 'subscription' | 'addon' | 'license';
    }) => Promise<{ 
        ok: boolean; 
        paymentUrl?: string; 
        gateway?: string; 
        error?: string;
        token?: string;
    }>;

    // QR Web Menu Domain
    fetchQrDomains: (tenantId: string) => Promise<any[]>;
    addQrDomain: (tenantId: string, domain: string) => Promise<boolean>;
    updateQrDomain: (tenantId: string, domainId: number, isActive: boolean) => Promise<boolean>;
    deleteQrDomain: (tenantId: string, domainId: number) => Promise<boolean>;
    checkQrDomainAvailability: (domain: string) => Promise<{ available: boolean; domain: string } | null>;
}

// ═══════════════════════════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════════════════════════

const api = async (path: string, token: string | null, options?: RequestInit) => {
    const res = await fetch(`/api/v1/tenants${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...(options?.headers || {}),
        },
    });
    return res;
};

const billingApi = async (path: string, token: string | null, options?: RequestInit) => {
    const res = await fetch(`/api/v1/billing${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options?.headers || {}),
        },
    });
    return res;
};

const saasPublicApi = async (path: string, token: string | null, options?: RequestInit) => {
    const res = await fetch(`/api/v1/saas-public${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options?.headers || {}),
        },
    });
    return res;
};

// ═══════════════════════════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════════════════════════

export const useSaaSStore = create<SaaSState>()(
    persist(
        (set, get) => ({
            token: null, admin: null, tenants: [], stats: null, backups: [], tickets: [],
            settings: null, isLoading: false, error: null,
            // New state defaults
            payments: [], financialSummary: null, financeInbox: null,
            accountingUpcoming: [], accountingInstallments: [], accountingNotifications: [], accountingAllPayments: null, invoices: [],
            posInvoices: [],
            posInvoiceEvents: [],
            selectedTenantId: null,
            selectedPosInvoiceNo: null,
            auditLogs: [], securitySummary: null,
            apiKeys: [], growthReport: null, plans: [], promoCodes: [],
            customerNotes: [], contracts: [], systemHealth: null, alertRules: [],
            ticketMessages: [], supportStats: null, backupStats: null, knowledgeBase: [],
            selectedTicket: null,
            resellers: [],
            resellerPlans: [],
            resellerWalletTopups: [],
            resellerTopupPendingCount: null,
            planModuleMatrix: null,
            billingModuleCatalog: [],
            billingModulesAdmin: [],
            billingModulesAdminError: null,
            liveFeed: [],
            presence: {},
            setSelectedTenantId: (tenantId) => set({ selectedTenantId: tenantId }),
            setSelectedPosInvoiceNo: (posInvoiceNo) => set({ selectedPosInvoiceNo: posInvoiceNo }),

            addLiveFeedItem: (item) => set((s) => ({
                liveFeed: [item, ...s.liveFeed].slice(0, 50)
            })),
            clearLiveFeed: () => set({ liveFeed: [] }),
            updateStatsOnSale: (amount) => set((s) => {
                if (!s.stats) return {};
                return {
                    stats: {
                        ...s.stats,
                        monthlyRevenue: (Number(s.stats.monthlyRevenue) || 0) + amount
                    }
                };
            }),

            fetchPresence: async () => {
                const { token } = get();
                if (!token) return;
                try {
                    const res = await fetch('/api/v1/tenants/presence', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        set({ presence: data.byTenant || {} });
                    }
                } catch {}
            },

            // ═══════════════════ AUTH ═══════════════════
            login: async (username, password) => {
                set({ isLoading: true, error: null });
                try {
                    const res = await fetch('/api/v1/auth/login/saas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password }),
                    });
                    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Giriş başarısız'); }
                    const data = await res.json();
                    set({ token: data.accessToken, admin: data.user, isLoading: false });
                    return true;
                } catch (error: any) { set({ error: error.message, isLoading: false }); return false; }
            },
            logout: () => set({ 
                token: null, admin: null, tenants: [], stats: null, backups: [], tickets: [],
                settings: null, payments: [], financialSummary: null, auditLogs: [],
                financeInbox: null, accountingUpcoming: [], accountingInstallments: [], accountingNotifications: [], accountingAllPayments: null, invoices: [], posInvoices: [], posInvoiceEvents: [],
                selectedTenantId: null, selectedPosInvoiceNo: null,
                securitySummary: null, apiKeys: [], growthReport: null, plans: [], promoCodes: [],
                customerNotes: [], contracts: [], systemHealth: null, alertRules: [],
                ticketMessages: [], supportStats: null, backupStats: null, knowledgeBase: [], selectedTicket: null, resellers: [],
                resellerWalletTopups: [],
                resellerTopupPendingCount: null,
                planModuleMatrix: null, billingModuleCatalog: [], billingModulesAdmin: [], billingModulesAdminError: null,
            }),

            // ═══════════════════ RESELLER ═══════════════════
            fetchResellers: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/resellers', token);
                    if (res.ok) set({ resellers: await res.json() });
                } catch {}
            },
            createReseller: async (data: any) => {
                const { token } = get();
                try {
                    const res = await api('/resellers', token, { method: 'POST', body: JSON.stringify(data) });
                    if (res.ok) { await get().fetchResellers(); return true; }
                    return false;
                } catch { return false; }
            },
            updateReseller: async (id: number, data: any) => {
                const { token } = get();
                try {
                    const res = await api(`/resellers/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) });
                    if (res.ok) { await get().fetchResellers(); return true; }
                    return false;
                } catch { return false; }
            },
            deleteReseller: async (id: number) => {
                const { token } = get();
                try {
                    const res = await api(`/resellers/${id}`, token, { method: 'DELETE' });
                    if (res.ok) { await get().fetchResellers(); return true; }
                    return false;
                } catch { return false; }
            },
            fetchResellerPlans: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/resellers/plans', token);
                    if (res.ok) set({ resellerPlans: await res.json() });
                } catch {}
            },
            addResellerPlan: async (data: any) => {
                const { token } = get();
                try {
                    const res = await api('/resellers/plans', token, { method: 'POST', body: JSON.stringify(data) });
                    if (res.ok) { get().fetchResellerPlans(); return true; }
                    return false;
                } catch { return false; }
            },
            updateResellerPlan: async (id: number, data: any) => {
                const { token } = get();
                try {
                    const res = await api(`/resellers/plans/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) });
                    if (res.ok) { get().fetchResellerPlans(); return true; }
                    return false;
                } catch { return false; }
            },
            deleteResellerPlan: async (id: number) => {
                const { token } = get();
                try {
                    const res = await api(`/resellers/plans/${id}`, token, { method: 'DELETE' });
                    if (res.ok) { get().fetchResellerPlans(); return true; }
                    return false;
                } catch { return false; }
            },
            fetchResellerWalletTopupsAdmin: async () => {
                const { token } = get();
                if (!token) return;
                try {
                    const res = await api('/reseller/wallet/topup-admin', token);
                    if (res.ok) {
                        const raw = await res.json();
                        set({ resellerWalletTopups: Array.isArray(raw) ? raw : [] });
                    }
                } catch {}
            },
            fetchResellerTopupPendingCount: async () => {
                const { token } = get();
                if (!token) return;
                try {
                    const res = await api('/reseller/wallet/topup-admin/pending-count', token);
                    if (res.ok) {
                        const data = (await res.json()) as { count?: number };
                        set({ resellerTopupPendingCount: Number(data.count ?? 0) });
                    }
                } catch {}
            },
            reviewResellerWalletTopup: async (id, action) => {
                const { token } = get();
                if (!token) return { ok: false, error: 'no token' };
                try {
                    const res = await api(`/reseller/wallet/topup-requests/${id}`, token, {
                        method: 'PATCH',
                        body: JSON.stringify({ action }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        return { ok: false, error: String((data as { error?: string }).error || 'İşlem başarısız') };
                    }
                    await get().fetchResellerWalletTopupsAdmin();
                    await get().fetchResellerTopupPendingCount();
                    await get().fetchResellers();
                    return { ok: true };
                } catch {
                    return { ok: false, error: 'İşlem başarısız' };
                }
            },
            purchaseResellerPlan: async (planId: number) => {
                const { token } = get();
                set({ isLoading: true });
                try {
                    const res = await api('/resellers/plans/purchase', token, {
                        method: 'POST',
                        body: JSON.stringify({ planId })
                    });
                    if (res.ok) {
                        await get().fetchStats(); // Update available licenses
                        set({ isLoading: false });
                        return true;
                    }
                    const err = await res.json();
                    set({ error: err.error, isLoading: false });
                    return false;
                } catch {
                    set({ isLoading: false });
                    return false;
                }
            },

            // ═══════════════════ ORIGINAL ═══════════════════
            fetchTenants: async () => {
                const { token } = get(); if (!token) return;
                set({ isLoading: true });
                try {
                    const res = await api('/', token);
                    if (!res.ok) { if (res.status === 401) get().logout(); throw new Error('Tenantlar yüklenemedi'); }
                    const data = await res.json();
                    set({ tenants: Array.isArray(data) ? data : [], isLoading: false });
                } catch { set({ isLoading: false }); }
            },
            fetchStats: async () => {
                const { token } = get(); if (!token) return;
                try { 
                    const res = await api('/stats', token); 
                    if (res.ok) {
                        const data = await res.json();
                        const update: any = { stats: data };
                        if (data.resellerData) {
                            update.admin = { ...get().admin, ...data.resellerData };
                        }
                        set(update);
                    }
                } catch {}
            },
            fetchBackups: async () => {
                const { token } = get(); if (!token) return;
                try { const res = await api('/system/backups', token); if (res.ok) set({ backups: await res.json() }); } catch {}
            },
            fetchTickets: async () => {
                const { token } = get(); if (!token) return;
                try { const res = await api('/system/tickets', token); if (res.ok) set({ tickets: await res.json() }); } catch {}
            },
            fetchSettings: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/system/settings', token);
                    if (res.ok) set({ settings: await res.json() });
                } catch {}
            },
            updateSettings: async (data: SystemSettings) => {
                const { token } = get(); if (!token) return false;
                try {
                    const res = await api('/system/settings', token, {
                        method: 'PATCH',
                        body: JSON.stringify(data)
                    });
                    if (res.ok) {
                        get().fetchSettings();
                        set({ error: null });
                        return true;
                    }
                    const err = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
                    const msg = [err.error, err.detail].filter(Boolean).join(' — ') || 'Kayıt başarısız';
                    set({ error: msg });
                    return false;
                } catch {
                    set({ error: 'Ağ hatası' });
                    return false;
                }
            },
            createBackup: async () => {
                const { token } = get(); set({ isLoading: true });
                try {
                    const res = await api('/system/backups', token, { method: 'POST' });
                    if (res.ok) { get().fetchBackups(); set({ isLoading: false }); return true; }
                    set({ isLoading: false }); return false;
                } catch { set({ isLoading: false }); return false; }
            },
            updateTicket: async (id, status) => {
                const { token } = get();
                try {
                    const res = await api(`/system/tickets/${id}`, token, {
                        method: 'PATCH', body: JSON.stringify({ status }),
                    });
                    if (res.ok) { get().fetchTickets(); return true; }
                    return false;
                } catch { return false; }
            },
            createTenant: async (data) => {
                const { token } = get(); set({ isLoading: true, error: null });
                try {
                    const res = await api('/', token, { method: 'POST', body: JSON.stringify(data) });
                    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Tenant oluşturulamadı'); }
                    await get().fetchTenants(); await get().fetchStats(); set({ isLoading: false }); return true;
                } catch (error: any) { set({ isLoading: false, error: error.message }); return false; }
            },
            updateTenant: async (id, data) => {
                const { token } = get(); set({ isLoading: true, error: null });
                try {
                    const res = await api(`/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) });
                    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Güncelleme hatası'); }
                    await get().fetchTenants(); await get().fetchStats(); set({ isLoading: false }); return true;
                } catch (error: any) { set({ isLoading: false, error: error.message }); return false; }
            },

            // ═══════════════════ FINANCE ═══════════════════
            fetchPayments: async (filters) => {
                const { token } = get(); if (!token) return;
                try {
                    const params = new URLSearchParams(filters || {}).toString();
                    const res = await api(`/finance/payments?${params}`, token);
                    if (res.ok) set({ payments: await res.json() });
                } catch {}
            },
            fetchFinancialSummary: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/finance/summary', token);
                    if (res.ok) set({ financialSummary: await res.json() });
                } catch {}
            },
            fetchFinanceInbox: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/finance/inbox', token);
                    if (res.ok) set({ financeInbox: await res.json() });
                } catch {}
            },
            addPayment: async (data) => {
                const { token } = get();
                try {
                    const res = await api('/finance/payments', token, { method: 'POST', body: JSON.stringify(data) });
                    if (res.ok) { get().fetchPayments(); get().fetchFinancialSummary(); return true; }
                    return false;
                } catch { return false; }
            },
            updatePaymentStatus: async (id, status) => {
                const { token } = get();
                try {
                    const res = await api(`/finance/payments/${id}/status`, token, {
                        method: 'PATCH', body: JSON.stringify({ status }),
                    });
                    if (res.ok) { get().fetchPayments(); get().fetchFinancialSummary(); return true; }
                    return false;
                } catch { return false; }
            },
            recordSubscriptionPayment: async (tenantId: string, amount?: number, billingCycle?: 'monthly' | 'yearly') => {
                const { token } = get();
                if (!token) return false;
                try {
                    const res = await billingApi(`/tenants/${encodeURIComponent(tenantId)}/record-payment`, token, {
                        method: 'POST',
                        body: JSON.stringify({
                            ...(billingCycle ? { billingCycle } : {}),
                            ...(amount != null ? { amount } : {}),
                            description: `Abonelik yenileme bildirimi`,
                        }),
                    });
                    if (res.ok) {
                        await get().fetchPayments();
                        await get().fetchFinancialSummary();
                        await get().fetchFinanceInbox();
                        return true;
                    }
                    return false;
                } catch {
                    return false;
                }
            },
            sendPaymentDueMail: async (paymentId: number) => {
                const { token } = get();
                if (!token) return false;
                try {
                    const res = await api(`/finance/payments/${paymentId}/send-mail`, token, { method: 'POST' });
                    if (res.ok) return true;
                    return false;
                } catch {
                    return false;
                }
            },
            fetchAccountingUpcoming: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/finance/accounting/upcoming', token);
                    if (res.ok) set({ accountingUpcoming: await res.json() });
                } catch {}
            },
            fetchAccountingInstallments: async (status?: string) => {
                const { token } = get(); if (!token) return;
                try {
                    const qs = status ? `?status=${status}` : '';
                    const res = await api(`/finance/accounting/installments${qs}`, token);
                    if (res.ok) set({ accountingInstallments: await res.json() });
                } catch {}
            },
            fetchAccountingNotifications: async (limit?: number) => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api(`/finance/accounting/notifications?limit=${limit || 50}`, token);
                    if (res.ok) set({ accountingNotifications: await res.json() });
                } catch {}
            },
            fetchAccountingAllPayments: async (filters?: any) => {
                const { token } = get(); if (!token) return;
                try {
                    const params = new URLSearchParams(filters || {}).toString();
                    const res = await api(`/finance/accounting/all-payments?${params}`, token);
                    if (res.ok) set({ accountingAllPayments: await res.json() });
                } catch {}
            },
            fetchInvoices: async (filters?: { status?: string; tenant?: string; from?: string; to?: string }) => {
                const { token } = get(); if (!token) return;
                try {
                    const qs = new URLSearchParams();
                    if (filters?.status) qs.set('status', filters.status);
                    if (filters?.tenant) qs.set('tenant', filters.tenant);
                    if (filters?.from) qs.set('from', filters.from);
                    if (filters?.to) qs.set('to', filters.to);
                    const q = qs.toString();
                    const res = await api(`/finance/invoices${q ? '?' + q : ''}`, token);
                    if (res.ok) set({ invoices: await res.json() });
                } catch {}
            },
            fetchInvoiceDetail: async (invoiceNumber: string) => {
                const { token } = get(); if (!token) return null;
                try {
                    const res = await api(`/finance/invoices/${encodeURIComponent(invoiceNumber)}`, token);
                    if (res.ok) return await res.json();
                    return null;
                } catch { return null; }
            },
            fetchPosInvoices: async (tenantId, filters) => {
                const { token } = get();
                if (!token) return [];
                try {
                    const qs = new URLSearchParams();
                    if (filters?.from) qs.set('from', filters.from);
                    if (filters?.to) qs.set('to', filters.to);
                    if (filters?.branchId != null) qs.set('branchId', String(filters.branchId));
                    if (filters?.cashierId != null) qs.set('cashierId', String(filters.cashierId));
                    if (filters?.status) qs.set('status', filters.status);
                    if (filters?.paymentStatus) qs.set('paymentStatus', filters.paymentStatus);
                    if (filters?.paymentMethod) qs.set('paymentMethod', filters.paymentMethod);
                    if (filters?.q) qs.set('q', filters.q);
                    if (filters?.limit != null) qs.set('limit', String(filters.limit));
                    const res = await api(`/${encodeURIComponent(tenantId)}/pos-invoices${qs.toString() ? `?${qs.toString()}` : ''}`, token);
                    if (!res.ok) return [];
                    const data = await res.json();
                    set({ posInvoices: data });
                    return data;
                } catch {
                    return [];
                }
            },
            fetchPosInvoiceDetail: async (tenantId, posInvoiceNo) => {
                const { token } = get();
                if (!token) return null;
                try {
                    const res = await api(`/${encodeURIComponent(tenantId)}/pos-invoices/${encodeURIComponent(posInvoiceNo)}`, token);
                    if (!res.ok) return null;
                    return await res.json();
                } catch {
                    return null;
                }
            },
            fetchPosInvoicePdf: async (tenantId, posInvoiceNo) => {
                const { token } = get();
                if (!token) throw new Error('No token');
                const res = await api(`/${encodeURIComponent(tenantId)}/pos-invoices/${encodeURIComponent(posInvoiceNo)}/pdf`, token);
                if (!res.ok) throw new Error('PDF alınamadı');
                return await res.blob();
            },
            sendPosInvoiceEmail: async (tenantId, posInvoiceNo, to) => {
                const { token } = get();
                if (!token) return { ok: false, error: 'No token' };
                try {
                    const res = await api(`/${encodeURIComponent(tenantId)}/pos-invoices/${encodeURIComponent(posInvoiceNo)}/send-email`, token, {
                        method: 'POST',
                        body: JSON.stringify({ to }),
                    });
                    if (res.ok) return { ok: true };
                    const err = await res.json().catch(() => ({}));
                    return { ok: false, error: err?.error || 'Gönderim başarısız' };
                } catch (e: any) {
                    return { ok: false, error: e?.message || 'Gönderim başarısız' };
                }
            },
            fetchPosInvoiceEvents: async (tenantId, filters) => {
                const { token } = get();
                if (!token) return [];
                try {
                    const qs = new URLSearchParams();
                    if (filters?.posInvoiceNo) qs.set('posInvoiceNo', filters.posInvoiceNo);
                    if (filters?.from) qs.set('from', filters.from);
                    if (filters?.to) qs.set('to', filters.to);
                    if (filters?.eventType) qs.set('eventType', filters.eventType);
                    if (filters?.limit != null) qs.set('limit', String(filters.limit));
                    const res = await api(`/${encodeURIComponent(tenantId)}/pos-invoices-events${qs.toString() ? `?${qs.toString()}` : ''}`, token);
                    if (!res.ok) return [];
                    const data = await res.json();
                    set({ posInvoiceEvents: data });
                    return data;
                } catch {
                    return [];
                }
            },

            // ═══════════════════ SECURITY ═══════════════════
            fetchAuditLogs: async (filters) => {
                const { token } = get(); if (!token) return;
                try {
                    const params = new URLSearchParams(filters || {}).toString();
                    const res = await api(`/security/audit-logs?${params}`, token);
                    if (res.ok) set({ auditLogs: await res.json() });
                } catch {}
            },
            fetchSecuritySummary: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/security/summary', token);
                    if (res.ok) set({ securitySummary: await res.json() });
                } catch {}
            },
            fetchLoginAttempts: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/security/login-attempts', token);
                    if (res.ok) { /* stored in auditLogs for simplicity */ }
                } catch {}
            },
            fetchApiKeys: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/security/api-keys', token);
                    if (res.ok) set({ apiKeys: await res.json() });
                } catch {}
            },
            addApiKey: async (data) => {
                const { token } = get();
                try {
                    const res = await api('/security/api-keys', token, { method: 'POST', body: JSON.stringify(data) });
                    if (res.ok) { get().fetchApiKeys(); return true; }
                    return false;
                } catch { return false; }
            },
            revokeApiKey: async (id) => {
                const { token } = get();
                try {
                    const res = await api(`/security/api-keys/${id}/revoke`, token, { method: 'PATCH' });
                    if (res.ok) { get().fetchApiKeys(); return true; }
                    return false;
                } catch { return false; }
            },

            // ═══════════════════ REPORTS ═══════════════════
            fetchGrowthReport: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/reports/growth', token);
                    if (res.ok) set({ growthReport: await res.json() });
                } catch {}
            },

            // ═══════════════════ PLANS ═══════════════════
            fetchPlans: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/plans', token);
                    if (res.ok) set({ plans: await res.json() });
                } catch {}
            },
            addPlan: async (data) => {
                const { token } = get();
                try {
                    const res = await api('/plans', token, { method: 'POST', body: JSON.stringify(data) });
                    if (res.ok) { get().fetchPlans(); return true; }
                    return false;
                } catch { return false; }
            },
            updatePlan: async (id, data) => {
                const { token } = get();
                try {
                    const res = await api(`/plans/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) });
                    if (res.ok) { get().fetchPlans(); return true; }
                    return false;
                } catch { return false; }
            },
            deletePlan: async (id) => {
                const { token } = get();
                try {
                    const res = await api(`/plans/${id}`, token, { method: 'DELETE' });
                    if (res.ok) { get().fetchPlans(); return true; }
                    return false;
                } catch { return false; }
            },
            fetchPromoCodes: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/promos', token);
                    if (res.ok) set({ promoCodes: await res.json() });
                } catch {}
            },
            addPromoCode: async (data) => {
                const { token } = get();
                try {
                    const res = await api('/promos', token, { method: 'POST', body: JSON.stringify(data) });
                    if (res.ok) { get().fetchPromoCodes(); return true; }
                    return false;
                } catch { return false; }
            },
            togglePromoCode: async (id) => {
                const { token } = get();
                try {
                    const res = await api(`/promos/${id}/toggle`, token, { method: 'PATCH' });
                    if (res.ok) { get().fetchPromoCodes(); return true; }
                    return false;
                } catch { return false; }
            },

            // ═══════════════════ CRM ═══════════════════
            fetchCustomerNotes: async (tenant_id) => {
                const { token } = get(); if (!token) return;
                try {
                    const params = tenant_id ? `?tenant_id=${tenant_id}` : '';
                    const res = await api(`/crm/notes${params}`, token);
                    if (res.ok) set({ customerNotes: await res.json() });
                } catch {}
            },
            addCustomerNote: async (data) => {
                const { token } = get();
                try {
                    const res = await api('/crm/notes', token, { method: 'POST', body: JSON.stringify(data) });
                    if (res.ok) { get().fetchCustomerNotes(); return true; }
                    return false;
                } catch { return false; }
            },
            fetchContracts: async (tenant_id) => {
                const { token } = get(); if (!token) return;
                try {
                    const params = tenant_id ? `?tenant_id=${tenant_id}` : '';
                    const res = await api(`/crm/contracts${params}`, token);
                    if (res.ok) set({ contracts: await res.json() });
                } catch {}
            },
            addContract: async (data) => {
                const { token } = get();
                try {
                    const res = await api('/crm/contracts', token, { method: 'POST', body: JSON.stringify(data) });
                    if (res.ok) { get().fetchContracts(); return true; }
                    return false;
                } catch { return false; }
            },

            // ═══════════════════ MONITORING ═══════════════════
            fetchSystemHealth: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/monitoring/health', token);
                    if (res.ok) set({ systemHealth: await res.json() });
                } catch {}
            },
            fetchAlertRules: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/monitoring/alerts', token);
                    if (res.ok) set({ alertRules: await res.json() });
                } catch {}
            },
            addAlertRule: async (data) => {
                const { token } = get();
                try {
                    const res = await api('/monitoring/alerts', token, { method: 'POST', body: JSON.stringify(data) });
                    if (res.ok) { get().fetchAlertRules(); return true; }
                    return false;
                } catch { return false; }
            },
            toggleAlertRule: async (id) => {
                const { token } = get();
                try {
                    const res = await api(`/monitoring/alerts/${id}/toggle`, token, { method: 'PATCH' });
                    if (res.ok) { get().fetchAlertRules(); return true; }
                    return false;
                } catch { return false; }
            },

            // ═══════════════════ SUPPORT ═══════════════════
            fetchSupportStats: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/support/stats', token);
                    if (res.ok) set({ supportStats: await res.json() });
                } catch {}
            },
            fetchTicketDetail: async (id) => {
                const { token } = get(); if (!token) return null;
                try {
                    const res = await api(`/support/tickets/${id}`, token);
                    if (res.ok) {
                        const data = await res.json();
                        set({ selectedTicket: data, ticketMessages: data.messages || [] });
                        return data;
                    }
                    return null;
                } catch { return null; }
            },
            fetchTicketMessages: async (ticketId) => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api(`/support/tickets/${ticketId}/messages`, token);
                    if (res.ok) set({ ticketMessages: await res.json() });
                } catch {}
            },
            sendTicketMessage: async (ticketId, message) => {
                const { token } = get();
                try {
                    const res = await api(`/support/tickets/${ticketId}/messages`, token, {
                        method: 'POST', body: JSON.stringify({ message, sender_type: 'admin', sender_name: 'Admin' }),
                    });
                    if (res.ok) { get().fetchTicketMessages(ticketId); return true; }
                    return false;
                } catch { return false; }
            },
            fetchKnowledgeBase: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/support/kb', token);
                    if (res.ok) set({ knowledgeBase: await res.json() });
                } catch {}
            },
            addKBArticle: async (data) => {
                const { token } = get();
                try {
                    const res = await api('/support/kb', token, { method: 'POST', body: JSON.stringify(data) });
                    if (res.ok) { get().fetchKnowledgeBase(); return true; }
                    return false;
                } catch { return false; }
            },

            // ═══════════════════ BACKUP ═══════════════════
            createTenantBackup: async (tenant_id) => {
                const { token } = get();
                try {
                    const res = await api('/backups/tenant', token, {
                        method: 'POST', body: JSON.stringify({ tenant_id }),
                    });
                    if (res.ok) { get().fetchBackups(); get().fetchBackupStats(); return true; }
                    return false;
                } catch { return false; }
            },
            fetchBackupStats: async () => {
                const { token } = get(); if (!token) return;
                try {
                    const res = await api('/backups/stats', token);
                    if (res.ok) set({ backupStats: await res.json() });
                } catch {}
            },

            // ═══════════════════ BILLING / MODÜLLER ═══════════════════
            fetchBillingCatalog: async () => {
                try {
                    const res = await billingApi('/modules', null);
                    if (res.ok) set({ billingModuleCatalog: await res.json() });
                } catch {}
            },
            fetchBillingModulesAdmin: async () => {
                const { token } = get();
                if (!token) {
                    set({ billingModulesAdminError: 'Oturum yok — tekrar giriş yapın.' });
                    return;
                }
                set({ billingModulesAdminError: null });
                try {
                    const res = await billingApi('/modules/admin', token);
                    if (res.ok) {
                        const rows = await res.json();
                        set({ billingModulesAdmin: Array.isArray(rows) ? rows : [], billingModulesAdminError: null });
                        return;
                    }
                    const errBody = await res.json().catch(() => ({} as { error?: string; detail?: string }));
                    let msg =
                        res.status === 403
                            ? 'Bu liste için süper yönetici yetkisi gerekir.'
                            : res.status === 401
                              ? 'Oturum süresi doldu — tekrar giriş yapın.'
                              : errBody.error || `Liste alınamadı (${res.status})`;
                    if (errBody.detail) msg = `${msg} — ${errBody.detail}`;
                    set({ billingModulesAdminError: msg });
                } catch {
                    set({ billingModulesAdminError: 'Ağ hatası — API çalışıyor mu?' });
                }
            },
            createBillingModule: async (input) => {
                const { token } = get();
                if (!token) return false;
                try {
                    const res = await billingApi('/modules', token, {
                        method: 'POST',
                        body: JSON.stringify(input),
                    });
                    if (res.ok) {
                        await get().fetchBillingCatalog();
                        await get().fetchBillingModulesAdmin();
                        return true;
                    }
                    return false;
                } catch {
                    return false;
                }
            },
            updateBillingModule: async (code, patch) => {
                const { token } = get();
                if (!token) return false;
                try {
                    const res = await billingApi(`/modules/${encodeURIComponent(code)}`, token, {
                        method: 'PATCH',
                        body: JSON.stringify(patch),
                    });
                    if (res.ok) {
                        await get().fetchBillingCatalog();
                        await get().fetchBillingModulesAdmin();
                        return true;
                    }
                    return false;
                } catch {
                    return false;
                }
            },
            deleteBillingModule: async (code, hard) => {
                const { token } = get();
                if (!token) return false;
                const q = hard ? '?hard=true' : '';
                try {
                    const res = await billingApi(`/modules/${encodeURIComponent(code)}${q}`, token, {
                        method: 'DELETE',
                    });
                    if (res.ok) {
                        await get().fetchBillingCatalog();
                        await get().fetchBillingModulesAdmin();
                        return true;
                    }
                    return false;
                } catch {
                    return false;
                }
            },
            fetchPlanModuleMatrix: async (planCode: string) => {
                const { token } = get();
                if (!token) return;
                try {
                    const res = await billingApi(`/plan-modules/${encodeURIComponent(planCode)}`, token);
                    if (res.ok) {
                        const data = await res.json();
                        set({ planModuleMatrix: { planCode: data.planCode, modules: data.modules || [] } });
                    }
                } catch {}
            },
            savePlanModuleRules: async (planCode: string, rules) => {
                const { token } = get();
                if (!token) return false;
                try {
                    const res = await billingApi(`/plan-modules/${encodeURIComponent(planCode)}`, token, {
                        method: 'PUT',
                        body: JSON.stringify({ rules }),
                    });
                    if (res.ok) {
                        const data = await res.json();
                        set({ planModuleMatrix: { planCode: data.planCode, modules: data.modules || [] } });
                        return true;
                    }
                    return false;
                } catch {
                    return false;
                }
            },
            fetchTenantEntitlements: async (tenantId: string) => {
                const { token } = get();
                if (!token) return null;
                try {
                    const res = await billingApi(`/tenants/${encodeURIComponent(tenantId)}/entitlements`, token);
                    if (res.ok) return await res.json();
                    return null;
                } catch {
                    return null;
                }
            },
            purchaseTenantAddons: async (
                tenantId,
                module_codes,
                extra_device_qty,
                payment_method?: 'wallet_balance' | 'bank_transfer' | 'admin_card' | 'cash'
            ) => {
                const { token } = get();
                if (!token) return { ok: false, error: 'Oturum yok' };
                try {
                    const res = await billingApi(`/tenants/${encodeURIComponent(tenantId)}/addons`, token, {
                        method: 'POST',
                        body: JSON.stringify({
                            module_codes,
                            extra_device_qty,
                            ...(payment_method ? { payment_method } : {}),
                        }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (res.ok) {
                        return {
                            ok: true,
                            added: data.added,
                            skipped: data.skipped,
                            totals: data.totals,
                        };
                    }
                    return { ok: false, error: data.error || 'İşlem başarısız' };
                } catch (e: any) {
                    return { ok: false, error: e?.message || 'Ağ hatası' };
                }
            },

            generatePaymentLink: async (data: {
                tenantId: string;
                amount: number;
                currency: string;
                description: string;
                paymentType?: 'subscription' | 'addon' | 'license';
            }) => {
                const { token } = get();
                if (!token) return { ok: false, error: 'Authorization required' };
                try {
                    const res = await saasPublicApi('/checkout', token, {
                        method: 'POST',
                        body: JSON.stringify(data)
                    });
                    const d = await res.json();
                    if (res.ok) {
                        return { ok: true, paymentUrl: d.paymentUrl, gateway: d.gateway, token: d.token || d.sessionId };
                    }
                    return { ok: false, error: d.error || 'Ödeme linki oluşturulamadı' };
                } catch (e: any) {
                    return { ok: false, error: e.message };
                }
            },

            fetchQrDomains: async (tenantId: string) => {
                const { token } = get();
                try {
                    const res = await api(`/${tenantId}/qr-domains`, token);
                    if (res.ok) return await res.json();
                } catch { /* silent */ }
                return [];
            },

            addQrDomain: async (tenantId: string, domain: string) => {
                const { token } = get();
                try {
                    const res = await api(`/${tenantId}/qr-domains`, token, {
                        method: 'POST',
                        body: JSON.stringify({ domain }),
                    });
                    return res.ok;
                } catch { return false; }
            },

            updateQrDomain: async (tenantId: string, domainId: number, isActive: boolean) => {
                const { token } = get();
                try {
                    const res = await api(`/${tenantId}/qr-domains/${domainId}`, token, {
                        method: 'PATCH',
                        body: JSON.stringify({ isActive }),
                    });
                    return res.ok;
                } catch { return false; }
            },

            deleteQrDomain: async (tenantId: string, domainId: number) => {
                const { token } = get();
                try {
                    const res = await api(`/${tenantId}/qr-domains/${domainId}`, token, {
                        method: 'DELETE',
                    });
                    return res.ok;
                } catch { return false; }
            },

            checkQrDomainAvailability: async (domain: string) => {
                const { token } = get();
                try {
                    const res = await api(`/qr-domains/check?domain=${encodeURIComponent(domain)}`, token);
                    if (res.ok) return await res.json();
                } catch { /* silent */ }
                return null;
            },
        }),
        { name: 'nextpos-saas-storage' }
    )
);
