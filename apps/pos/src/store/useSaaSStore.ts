import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ═══════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════

interface Tenant {
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
    created_at: string;
}

export interface Reseller {
    id: number;
    username: string;
    email: string;
    active: boolean;
    role: string;
    company_name: string;
    commission_rate: number;
    available_licenses: number;
    wallet_balance: number;
    created_at: string;
    total_tenants?: number;
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
    totalRevenue?: number; // System total
    totalEarnings?: number; // Reseller earnings
    pendingRevenue: number;
    monthlyEarnings?: { month: string; total: number }[];
    monthlyRevenue?: { month: string; total: number; count: number }[];
    pendingPayments?: { total: number; count: number };
    overduePayments?: { total: number; count: number };
    planDistribution: { plan: string; count: number }[];
    revenueByType?: { type: string; total: number }[];
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
    planDistribution: { plan: string; count: number }[];
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

    // Auth
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

    // Finance
    fetchPayments: (filters?: any) => Promise<void>;
    fetchFinancialSummary: () => Promise<void>;
    addPayment: (data: any) => Promise<boolean>;
    updatePaymentStatus: (id: number, status: string) => Promise<boolean>;

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

// ═══════════════════════════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════════════════════════

export const useSaaSStore = create<SaaSState>()(
    persist(
        (set, get) => ({
            token: null, admin: null, tenants: [], stats: null, backups: [], tickets: [],
            settings: null, isLoading: false, error: null,
            // New state defaults
            payments: [], financialSummary: null, auditLogs: [], securitySummary: null,
            apiKeys: [], growthReport: null, plans: [], promoCodes: [],
            customerNotes: [], contracts: [], systemHealth: null, alertRules: [],
            ticketMessages: [], supportStats: null, backupStats: null, knowledgeBase: [],
            selectedTicket: null,
            resellers: [],
            resellerPlans: [],

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
                securitySummary: null, apiKeys: [], growthReport: null, plans: [], promoCodes: [],
                customerNotes: [], contracts: [], systemHealth: null, alertRules: [],
                ticketMessages: [], supportStats: null, backupStats: null, knowledgeBase: [], selectedTicket: null, resellers: []
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
                        return true;
                    }
                    return false;
                } catch { return false; }
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
        }),
        { name: 'nextpos-saas-storage' }
    )
);
