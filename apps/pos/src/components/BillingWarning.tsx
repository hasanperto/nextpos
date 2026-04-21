import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';

/** `/api/v1/billing/status` → `payment_history` satırı ile uyumlu */
interface PendingPaymentLine {
    id: number;
    tenant_id: string;
    amount: number;
    currency: string;
    payment_type: string;
    payment_method: string | null;
    description: string | null;
    status: string;
    due_date: string | null;
    paid_at: string | null;
    created_at: string;
}

interface BillingStatus {
    isSuspended: boolean;
    hasWarning: boolean;
    nextPaymentDue: string | null;
    daysRemaining: number | null;
    pendingPaymentLine: PendingPaymentLine | null;
    planCode?: string | null;
    maxDevices?: { base: number; extra: number; total: number } | null;
    entitlements?: { code: string; enabled: boolean; mode: string }[];
}

export const BillingWarning: React.FC = () => {
    const { isAuthenticated } = useAuthStore();
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const auth = useAuthStore.getState();
        if (!isAuthenticated || !auth.user || auth.user.isSaaSAdmin) return;

        const checkStatus = async () => {
            try {
                setLoading(true);
                const headers = useAuthStore.getState().getAuthHeaders();
                const res = await fetch('/api/v1/billing/status', { headers });
                if (res.ok) {
                    const data = await res.json();
                    setStatus(data);
                    useAuthStore.getState().setBillingWorkspace({
                        planCode: data.planCode ?? null,
                        maxDevices: data.maxDevices ?? null,
                        entitlements: Array.isArray(data.entitlements) ? data.entitlements : [],
                    });
                }
            } catch (err) {
                console.warn('Billing status check failed', err);
            } finally {
                setLoading(false);
            }
        };

        checkStatus();
        
        // Periyodik kontrol (6 saatte bir)
        const interval = setInterval(checkStatus, 6 * 60 * 60 * 1000);
        return () => clearInterval(interval);
    }, [isAuthenticated]);

    if (!status || !status.hasWarning || loading) return null;

    return (
        <div className="billing-warning-banner" style={{
            backgroundColor: '#d32f2f',
            color: 'white',
            padding: '12px 20px',
            textAlign: 'center',
            fontWeight: 'bold',
            zIndex: 9999,
            position: 'sticky',
            top: 0,
            width: '100%',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            fontSize: '14px',
            borderBottom: '2px solid #b71c1c'
        }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <div style={{ flex: 1, textAlign: 'left' }}>
                Ödeme Vadesi Yaklaştı! Son Ödeme Tarihi: <span style={{ textDecoration: 'underline' }}>{status.nextPaymentDue}</span> 
                {status.daysRemaining !== null && (
                    <span style={{ marginLeft: '5px' }}>
                        ({status.daysRemaining < 0 ? 'Gecikti!' : `${status.daysRemaining} gün kaldı`})
                    </span>
                )}
                <div style={{ fontSize: '12px', fontWeight: 'normal', marginTop: '2px' }}>
                    Sistemin kesintisiz çalışması için lütfen ödemenizi yapınız.
                </div>
            </div>
            <button 
                onClick={() => toast('Ödeme için bayinizle iletişime geçin veya yönetici panelinden ödeme linki oluşturun.', { duration: 6000 })}
                style={{
                    backgroundColor: 'white',
                    color: '#d32f2f',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
            >
                Ödeme Yap
            </button>
        </div>
    );
};
