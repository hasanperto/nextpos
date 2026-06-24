
import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';

export interface StaffStatsData {
    today: {
        total_orders: number;
        total_revenue: number;
    };
    lastShift: {
        id: number;
        clock_in: string;
        clock_out: string | null;
        duration_mins: number | null;
    } | null;
    tipsToday: number;
    userName: string;
    role: string;
    waiterOnBreak?: boolean;
}

export const useStaffStats = () => {
    const { token, getAuthHeaders } = useAuthStore();
    const [data, setData] = useState<StaffStatsData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/users/my-stats`, {
                headers: getAuthHeaders()
            });

            if (!res.ok) throw new Error('Staff stats fetch failed');
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
            void fetchStats();
        }
    }, [token]);

    return { data, loading, error, refresh: fetchStats };
};
