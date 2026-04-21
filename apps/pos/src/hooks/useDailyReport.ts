import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';

export interface DailyReportData {
    orders: {
        orders: number;
        gross: number;
        tax: number;
        subtotal: number;
    };
    payments: {
        payment_total: number;
        tip_total: number;
        payment_lines: number;
    };
    paymentsByMethod: {
        method: string;
        total: number;
        tips: number;
        cnt: number;
    }[];
}

export const useDailyReport = () => {
    const { token, tenantId } = useAuthStore();
    const [data, setData] = useState<DailyReportData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const res = await fetch(`/api/v1/admin/reports/z-report?date=${today}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-tenant-id': tenantId || ''
                }
            });

            if (!res.ok) throw new Error('Report fetch failed');
            const result = await res.json();
            setData(result);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token) {
            void fetchReport();
        }
    }, [token]);

    return { data, loading, error, refresh: fetchReport };
};
