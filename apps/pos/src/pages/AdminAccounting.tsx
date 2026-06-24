import React, { useState, useEffect, useMemo } from 'react';
import { 
    FiDollarSign, FiSearch, FiRefreshCcw, FiEdit, 
    FiCheckCircle, FiXCircle, FiCalendar, FiFileText, FiGift, FiTrendingUp,
    FiArrowUpRight, FiArrowDownLeft, FiBookOpen, FiPieChart, FiUsers, FiPlus,
    FiDownload, FiPrinter, FiPlusCircle, FiList
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { usePosLocale } from '../contexts/PosLocaleContext';

interface Transaction {
    id: number;
    total_amount: number;
    discount_amount?: number;
    payment_status: string;
    status: string;
    notes: string | null;
    deleted_at?: string | null;
    deleted_by?: number | null;
    delete_reason?: string | null;
    created_at: string;
    table_name: string | null;
    waiter_name: string | null;
    payment_method: string | null;
    items: {
        id: number;
        product_name: string;
        quantity: number;
        unit_price: number;
        total_price: number;
        status: string;
    }[];
}

interface CashBookEntry {
    id: string;
    createdAt: string;
    type: 'cash_in' | 'cash_out';
    amount: number;
    category: string;
    notes: string;
    user: string;
}

export const AdminAccounting: React.FC = () => {
    const { isAuthenticated, token, tenantId, user, refreshTokenAction } = useAuthStore();
    const { settings, fetchSettings } = usePosStore();
    const { t } = usePosLocale();
    const currency = settings?.currency || '€';

    const cashCategoryLabel = (cat: string) => {
        const key = `admin.accounting.cashbook.category.${cat}`;
        const label = t(key);
        return label !== key ? label : cat;
    };

    const cashModalCategoryLabel = (cat: string) => {
        const key = `admin.accounting.modal.cash.category.${cat}`;
        const label = t(key);
        return label !== key ? label : cat;
    };
    
    const [activeTab, setActiveTab] = useState<'overview' | 'ledger' | 'cashbook'>('overview');
    const [type, setType] = useState<'sales' | 'cancelled'>('sales');
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    
    // Modals
    const [editing, setEditing] = useState<Transaction | null>(null);
    const [editForm, setEditForm] = useState({ total_amount: 0, status: '', notes: '' });
    const [voiding, setVoiding] = useState(false);
    const [showCashModal, setShowCashModal] = useState(false);
    const [cashForm, setCashForm] = useState({ type: 'cash_out' as 'cash_in' | 'cash_out', amount: '', category: 'local_grocery', notes: '' });

    // Expandable transaction row state
    const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

    const [visibility, setVisibility] = useState<{ hideCancelled: boolean; hideDeleted: boolean }>({
        hideCancelled: false,
        hideDeleted: false,
    });

    const [summary, setSummary] = useState({
        today_turnover: 0,
        total_turnover: 0,
        total_cancelled: 0,
        total_discount: 0
    });

    const [filters, setFilters] = useState({
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
        minAmount: '',
        maxAmount: '',
        paymentMethod: 'all',
        waiterName: 'all',
        showPanel: false
    });

    // Cash Book local state
    const [cashEntries, setCashEntries] = useState<CashBookEntry[]>([]);

    const fetchTransactions = async (retry = true) => {
        if (!isAuthenticated || !token || !tenantId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/admin/accounting?type=${type}&startDate=${filters.startDate}&endDate=${filters.endDate}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-tenant-id': tenantId,
                    'Content-Type': 'application/json'
                }
            });
            
            if (res.ok) {
                const data = await res.json();
                setTransactions(data.transactions || []);
                setSummary(data.summary || { today_turnover: 0, total_turnover: 0, total_cancelled: 0, total_discount: 0 });
            } else if (res.status === 401 && retry) {
                const success = await refreshTokenAction();
                if (success) setTimeout(() => fetchTransactions(false), 200);
            }
        } catch (e) { 
            console.error(e); 
            toast.error(t('admin.accounting.toast.loadError'));
        } finally { 
            setLoading(false); 
        }
    };

    // Load configurations and cashbook from localStorage
    useEffect(() => {
        if (isAuthenticated && token && tenantId) {
            void fetchTransactions();
            void fetchSettings();
            
            // Load Cashbook
            const stored = localStorage.getItem(`pos-cashbook-${tenantId}`);
            if (stored) {
                try {
                    setCashEntries(JSON.parse(stored));
                } catch {
                    setCashEntries([]);
                }
            } else {
                // Seeding default mock entries for realistic demonstration
                const defaults: CashBookEntry[] = [
                    { id: '1', createdAt: new Date(Date.now() - 3 * 3600000).toISOString(), type: 'cash_in', amount: 300, category: 'initial_cash', notes: 'Günün başlangıç kasası nakit girişi', user: 'Admin' },
                    { id: '2', createdAt: new Date(Date.now() - 2 * 3600000).toISOString(), type: 'cash_out', amount: 25.50, category: 'local_grocery', notes: 'Manavdan eksik maydanoz ve limon', user: 'Admin' },
                    { id: '3', createdAt: new Date(Date.now() - 30 * 60000).toISOString(), type: 'cash_out', amount: 80, category: 'supplier_payment', notes: 'Ekmek fırını günlük ödemesi', user: 'Admin' }
                ];
                setCashEntries(defaults);
                localStorage.setItem(`pos-cashbook-${tenantId}`, JSON.stringify(defaults));
            }
        }
    }, [type, isAuthenticated, token, tenantId, filters.startDate, filters.endDate]);

    useEffect(() => {
        if (!isAuthenticated || !token || !tenantId) return;
        const load = async () => {
            try {
                const res = await fetch('/api/v1/admin/settings', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'x-tenant-id': tenantId,
                    },
                });
                if (!res.ok) return;
                const data = await res.json();
                const v = data?.accountingVisibility || {};
                setVisibility({
                    hideCancelled: Boolean(v.hideCancelled),
                    hideDeleted: Boolean(v.hideDeleted),
                });
            } catch {
                /* ignore */
            }
        };
        void load();
    }, [isAuthenticated, token, tenantId]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing || !token || !tenantId) return;
        try {
            const res = await fetch(`/api/v1/admin/accounting/${editing.id}`, {
                method: 'PUT',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'x-tenant-id': tenantId,
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify(editForm)
            });
            if (res.ok) {
                toast.success(t('admin.accounting.toast.updated'));
                setEditing(null);
                void fetchTransactions();
            } else if (res.status === 401) {
                const refreshed = await refreshTokenAction();
                if (refreshed) void handleUpdate(e);
            }
        } catch { 
            toast.error(t('admin.accounting.toast.saveError')); 
        }
    };

    const handleVoid = async () => {
        if (!editing || !token || !tenantId) return;
        const reason = editForm.notes.trim();
        if (!reason) {
            toast.error(t('admin.accounting.toast.voidReasonRequired'));
            return;
        }
        setVoiding(true);
        try {
            const res = await fetch(`/api/v1/admin/accounting/${editing.id}/void`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-tenant-id': tenantId,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ reason }),
            });
            if (res.ok) {
                toast.success(t('admin.accounting.toast.voidSuccess'));
                setEditing(null);
                void fetchTransactions();
            } else if (res.status === 401) {
                const refreshed = await refreshTokenAction();
                if (refreshed) void handleVoid();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err?.error || t('admin.accounting.toast.voidError'));
            }
        } catch {
            toast.error(t('admin.accounting.toast.voidConnectionError'));
        } finally {
            setVoiding(false);
        }
    };

    // Cash Book Handlers
    const handleAddCashFlow = (e: React.FormEvent) => {
        e.preventDefault();
        const amt = parseFloat(cashForm.amount);
        if (isNaN(amt) || amt <= 0) {
            toast.error(t('admin.accounting.toast.invalidAmount'));
            return;
        }

        const newEntry: CashBookEntry = {
            id: String(Date.now()),
            createdAt: new Date().toISOString(),
            type: cashForm.type,
            amount: amt,
            category: cashForm.category,
            notes: cashForm.notes,
            user: user?.name || 'Admin'
        };

        const updated = [newEntry, ...cashEntries];
        setCashEntries(updated);
        localStorage.setItem(`pos-cashbook-${tenantId}`, JSON.stringify(updated));
        
        // Reset and close
        setCashForm({ type: 'cash_out', amount: '', category: 'local_grocery', notes: '' });
        setShowCashModal(false);
        toast.success(t('admin.accounting.toast.cashFlowSaved'));
    };

    const handleDeleteCashFlow = (id: string) => {
        const updated = cashEntries.filter(entry => entry.id !== id);
        setCashEntries(updated);
        localStorage.setItem(`pos-cashbook-${tenantId}`, JSON.stringify(updated));
        toast.success(t('admin.accounting.toast.cashFlowDeleted'));
    };

    // Filtered transaction list for Ledger view
    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            const textMatch = t.id.toString().includes(search) || 
                (t.table_name || '').toLowerCase().includes(search.toLowerCase()) ||
                (t.waiter_name || '').toLowerCase().includes(search.toLowerCase());
            
            if (!textMatch) return false;

            if (filters.minAmount && Number(t.total_amount) < Number(filters.minAmount)) return false;
            if (filters.maxAmount && Number(t.total_amount) > Number(filters.maxAmount)) return false;

            if (filters.waiterName !== 'all' && t.waiter_name !== filters.waiterName) return false;
            
            if (filters.paymentMethod !== 'all') {
                const pm = (t.payment_method || '').toLowerCase();
                const filterPm = filters.paymentMethod.toLowerCase();
                if (filterPm === 'credit_card' && !pm.includes('card') && !pm.includes('kart') && !pm.includes('stripe')) return false;
                if (filterPm === 'cash' && !pm.includes('cash') && !pm.includes('nakit')) return false;
                if (filterPm === 'other' && (pm.includes('card') || pm.includes('kart') || pm.includes('cash') || pm.includes('nakit'))) return false;
            }

            return true;
        });
    }, [transactions, search, filters.minAmount, filters.maxAmount, filters.waiterName, filters.paymentMethod]);

    // Unique arrays for filters
    const uniqueWaiters = useMemo(() => {
        return Array.from(new Set(transactions.map(t => t.waiter_name).filter(Boolean)));
    }, [transactions]);

    // Dynamic Calculations & Analytics based on active transactions
    const analytics = useMemo(() => {
        let grossSales = 0;
        let discountTotal = 0;
        let dineInGross = 0;
        let takeawayGross = 0;
        let cashGross = 0;
        let cardGross = 0;
        let otherGross = 0;

        const hourlyDistribution = Array(24).fill(0);
        const waiterSales: Record<string, { total: number; count: number }> = {};
        const categorySales: Record<string, number> = {};

        // Only calculate on successful sales type transactions
        const activeSales = transactions.filter(t => t.status !== 'cancelled' && !t.deleted_at);

        activeSales.forEach((txn) => {
            const amt = Number(txn.total_amount) || 0;
            grossSales += amt;
            discountTotal += Number(txn.discount_amount) || 0;

            // VAT Type (Dine-in is 19% VAT, Takeaway is 7% VAT)
            if (txn.table_name) {
                dineInGross += amt;
            } else {
                takeawayGross += amt;
            }

            // Payment Methods
            const pm = (txn.payment_method || 'nakit').toLowerCase();
            if (pm.includes('card') || pm.includes('kart') || pm.includes('stripe')) {
                cardGross += amt;
            } else if (pm.includes('cash') || pm.includes('nakit')) {
                cashGross += amt;
            } else {
                otherGross += amt;
            }

            // Hourly Distribution
            try {
                const hour = new Date(txn.created_at).getHours();
                if (hour >= 0 && hour < 24) {
                    hourlyDistribution[hour] += amt;
                }
            } catch (err) {
                console.error(err);
            }

            // Staff performance
            const waiter = txn.waiter_name || t('admin.accounting.fallback.quickSale');
            if (!waiterSales[waiter]) {
                waiterSales[waiter] = { total: 0, count: 0 };
            }
            waiterSales[waiter].total += amt;
            waiterSales[waiter].count += 1;

            // Product distribution
            if (Array.isArray(txn.items)) {
                txn.items.forEach(item => {
                    const itemName = item.product_name || t('admin.accounting.fallback.other');
                    categorySales[itemName] = (categorySales[itemName] || 0) + (Number(item.total_price) || 0);
                });
            }
        });

        // VAT Mathematics
        const dineInNet = dineInGross / 1.19;
        const dineInTax = dineInGross - dineInNet;

        const takeawayNet = takeawayGross / 1.07;
        const takeawayTax = takeawayGross - takeawayNet;

        const netSalesTotal = dineInNet + takeawayNet;
        const taxTotal = dineInTax + takeawayTax;

        // Sort waiter list
        const waiterLeaderboard = Object.entries(waiterSales)
            .map(([name, stat]) => ({ name, total: stat.total, count: stat.count, avgTicket: stat.count > 0 ? stat.total / stat.count : 0 }))
            .sort((a, b) => b.total - a.total);

        // Sort top products
        const topProducts = Object.entries(categorySales)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        return {
            grossSales,
            netSalesTotal,
            taxTotal,
            discountTotal,
            vatDetails: {
                dineInGross,
                dineInNet,
                dineInTax,
                takeawayGross,
                takeawayNet,
                takeawayTax
            },
            payments: {
                cash: cashGross,
                card: cardGross,
                other: otherGross,
                total: cashGross + cardGross + otherGross
            },
            hourlyDistribution,
            waiterLeaderboard,
            topProducts
        };
    }, [transactions, t]);

    // Cash Book Balance summary
    const cashBookSummary = useMemo(() => {
        let totalIn = 0;
        let totalOut = 0;
        cashEntries.forEach(entry => {
            const amt = Number(entry.amount) || 0;
            if (entry.type === 'cash_in') {
                totalIn += amt;
            } else {
                totalOut += amt;
            }
        });
        return {
            totalIn,
            totalOut,
            balance: totalIn - totalOut
        };
    }, [cashEntries]);

    // Print Simulation
    const handleMockPrint = (trx: Transaction) => {
        toast.success(t('admin.accounting.toast.printQueued').replace('{{id}}', String(trx.id)));
        console.log('PRINTING ADISYON:', trx);
    };

    // Toggle row expand
    const toggleRow = (id: number) => {
        setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // CSV Export
    const handleExportCSV = () => {
        if (filteredTransactions.length === 0) {
            toast.error(t('admin.accounting.toast.exportEmpty'));
            return;
        }

        let csv = `${t('admin.accounting.export.csvHeader')}\n`;
        filteredTransactions.forEach(txn => {
            const dateStr = new Date(txn.created_at).toLocaleString('tr-TR');
            const typeStr = txn.table_name || t('admin.accounting.ledger.quickSale');
            const waiterStr = txn.waiter_name || t('admin.accounting.fallback.cashier');
            const payStr = txn.payment_method || t('admin.accounting.fallback.cash');
            const statusStr = txn.status === 'completed' ? t('admin.accounting.status.completed') : t('admin.accounting.status.cancelled');
            csv += `${txn.id},"${dateStr}","${typeStr}","${waiterStr}","${payStr}","${statusStr}",${txn.total_amount}\n`;
        });

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Muhasebe_Raporu_${filters.startDate}_${filters.endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(t('admin.accounting.toast.csvDownloaded'));
    };

    // Print PDF Report (Modern browser window print styling)
    const handlePrintReport = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const dateRangeStr = `${filters.startDate} / ${filters.endDate}`;
        const transactionRows = filteredTransactions.map(txn => `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">#${txn.id}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${new Date(txn.created_at).toLocaleString('tr-TR')}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${txn.table_name || t('admin.accounting.ledger.quickSale')}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${txn.waiter_name || t('admin.accounting.fallback.cashier')}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${txn.payment_method || t('admin.accounting.fallback.cash')}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${txn.status === 'completed' ? t('admin.accounting.status.completed') : t('admin.accounting.status.cancelled')}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${Number(txn.total_amount).toFixed(2)} ${currency}</td>
            </tr>
        `).join('');

        const vatTable = `
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px;">
                <thead>
                    <tr style="background-color: #f5f5f5;">
                        <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">${t('admin.accounting.vat.col.category')}</th>
                        <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">${t('admin.accounting.vat.col.gross')}</th>
                        <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">${t('admin.accounting.vat.col.net')}</th>
                        <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">${t('admin.accounting.vat.col.tax')}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd;">${t('admin.accounting.vat.dineIn')}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${analytics.vatDetails.dineInGross.toFixed(2)} ${currency}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${analytics.vatDetails.dineInNet.toFixed(2)} ${currency}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${analytics.vatDetails.dineInTax.toFixed(2)} ${currency}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd;">${t('admin.accounting.vat.takeaway')}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${analytics.vatDetails.takeawayGross.toFixed(2)} ${currency}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${analytics.vatDetails.takeawayNet.toFixed(2)} ${currency}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${analytics.vatDetails.takeawayTax.toFixed(2)} ${currency}</td>
                    </tr>
                    <tr style="font-weight: bold; background-color: #fafafa;">
                        <td style="padding: 10px; border: 1px solid #ddd;">${t('admin.accounting.vat.total')}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${analytics.grossSales.toFixed(2)} ${currency}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${analytics.netSalesTotal.toFixed(2)} ${currency}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${analytics.taxTotal.toFixed(2)} ${currency}</td>
                    </tr>
                </tbody>
            </table>
        `;

        printWindow.document.write(`
            <html>
                <head>
                    <title>${t('admin.accounting.report.title')}</title>
                    <style>
                        body { font-family: sans-serif; color: #333; padding: 20px; line-height: 1.4; }
                        h2, h3 { margin-bottom: 5px; }
                        .summary-box { border: 1px solid #ccc; padding: 15px; border-radius: 8px; margin-bottom: 20px; background-color: #fafafa; }
                    </style>
                </head>
                <body>
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h2>${t('admin.accounting.report.heading')}</h2>
                        <h3 style="color: #666; font-weight: normal; font-size: 14px;">${t('admin.accounting.report.dateRange').replace('{{range}}', dateRangeStr)}</h3>
                    </div>

                    <div class="summary-box">
                        <h3>${t('admin.accounting.report.summaryTitle')}</h3>
                        <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                            <div><strong>${t('admin.accounting.report.grossRevenue')}:</strong> ${analytics.grossSales.toFixed(2)} ${currency}</div>
                            <div><strong>${t('admin.accounting.report.netRevenue')}:</strong> ${analytics.netSalesTotal.toFixed(2)} ${currency}</div>
                            <div><strong>${t('admin.accounting.report.vatTotal')}:</strong> ${analytics.taxTotal.toFixed(2)} ${currency}</div>
                            <div><strong>${t('admin.accounting.report.discountTotal')}:</strong> ${analytics.discountTotal.toFixed(2)} ${currency}</div>
                        </div>
                    </div>

                    <h3>${t('admin.accounting.report.vatDetails')}</h3>
                    ${vatTable}

                    <h3 style="margin-top: 30px;">${t('admin.accounting.payment.title')}</h3>
                    <div style="margin-top: 10px;">
                        ${t('admin.accounting.payment.cash')}: ${analytics.payments.cash.toFixed(2)} ${currency} |
                        ${t('admin.accounting.payment.card')}: ${analytics.payments.card.toFixed(2)} ${currency} |
                        ${t('admin.accounting.payment.other')}: ${analytics.payments.other.toFixed(2)} ${currency}
                    </div>

                    <h3 style="margin-top: 30px;">${t('admin.accounting.report.ledgerDetails').replace('{{count}}', String(filteredTransactions.length))}</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                        <thead>
                            <tr style="background-color: #f5f5f5; font-weight: bold;">
                                <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">${t('admin.accounting.report.col.id')}</th>
                                <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">${t('admin.accounting.report.col.time')}</th>
                                <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">${t('admin.accounting.report.col.table')}</th>
                                <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">${t('admin.accounting.report.col.waiter')}</th>
                                <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">${t('admin.accounting.report.col.payment')}</th>
                                <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">${t('admin.accounting.report.col.status')}</th>
                                <th style="padding: 8px; text-align: right; border-bottom: 2px solid #ddd;">${t('admin.accounting.report.col.amount')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${transactionRows}
                        </tbody>
                    </table>

                    <div style="margin-top: 50px; font-size: 10px; color: #888; text-align: center;">
                        ${t('admin.accounting.report.footer').replace('{{date}}', new Date().toLocaleString('tr-TR'))}
                    </div>

                    <script>
                        window.onload = function() { window.print(); window.close(); }
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#020617] text-slate-100 font-sans relative">
            {/* Background Ambient Glows */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/5 rounded-full blur-[150px] pointer-events-none" />

            <header className="flex flex-col md:flex-row gap-4 md:h-24 shrink-0 md:items-center justify-between border-b border-white/5 bg-[#0f172a]/95 backdrop-blur-md p-4 md:px-10 z-10">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/35 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                        <FiDollarSign size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white uppercase italic tracking-tight">{t('admin.accounting.title')}</h2>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{t('admin.accounting.subtitle')}</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Date filter directly in header for instant access */}
                    <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 gap-2">
                        <FiCalendar className="text-slate-400" size={14}/>
                        <input 
                            type="date" 
                            className="bg-transparent border-none text-xs font-bold text-white outline-none color-scheme-dark cursor-pointer"
                            style={{ colorScheme: 'dark' }}
                            value={filters.startDate}
                            onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                        />
                        <span className="text-slate-600 text-xs">/</span>
                        <input 
                            type="date" 
                            className="bg-transparent border-none text-xs font-bold text-white outline-none color-scheme-dark cursor-pointer"
                            style={{ colorScheme: 'dark' }}
                            value={filters.endDate}
                            onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                        />
                    </div>

                    <button 
                        onClick={() => void fetchTransactions()} 
                        aria-label={t('admin.accounting.refresh')}
                        className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-slate-400 hover:text-emerald-400 hover:bg-white/10 transition-all active:scale-95"
                    >
                        <FiRefreshCcw className={loading ? 'animate-spin' : ''} size={16} />
                    </button>

                    <button 
                        onClick={handlePrintReport}
                        className="flex items-center gap-2 px-5 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all"
                    >
                        <FiPrinter size={14}/> {t('admin.accounting.printReport')}
                    </button>

                    <button 
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 px-5 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-900/20"
                    >
                        <FiDownload size={14}/> {t('admin.accounting.exportCsv')}
                    </button>
                </div>
            </header>

            {/* Navigation Tabs */}
            <div className="bg-[#0a0f1d] border-b border-white/5 px-10 flex items-center justify-between shrink-0">
                <div className="flex gap-8">
                    <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={<FiPieChart/>} label={t('admin.accounting.tab.overview')} />
                    <TabButton active={activeTab === 'ledger'} onClick={() => setActiveTab('ledger')} icon={<FiList/>} label={t('admin.accounting.tab.ledger')} />
                    <TabButton active={activeTab === 'cashbook'} onClick={() => setActiveTab('cashbook')} icon={<FiBookOpen/>} label={t('admin.accounting.tab.cashbook')} />
                </div>
                {activeTab === 'cashbook' && (
                    <button 
                        onClick={() => setShowCashModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-indigo-900/20"
                    >
                        <FiPlus size={14}/> {t('admin.accounting.addCashFlow')}
                    </button>
                )}
            </div>

            {/* main body container */}
            <div className="flex-1 overflow-y-auto no-scrollbar relative min-h-0">
                <AnimatePresence mode="wait">
                    {/* TAB 1: OVERVIEW & ANALYTICS */}
                    {activeTab === 'overview' && (
                        <motion.div 
                            key="overview"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            className="p-4 md:p-10 space-y-8"
                        >
                            {/* Summary cards */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 min-w-0">
                                <OverviewCard title={t('admin.accounting.card.grossRevenue')} value={analytics.grossSales} icon={<FiDollarSign/>} color="emerald" currency={currency} desc={t('admin.accounting.card.grossRevenueDesc')} />
                                <OverviewCard title={t('admin.accounting.card.netRevenue')} value={analytics.netSalesTotal} icon={<FiTrendingUp/>} color="blue" currency={currency} desc={t('admin.accounting.card.netRevenueDesc')} />
                                <OverviewCard title={t('admin.accounting.card.vatTotal')} value={analytics.taxTotal} icon={<FiFileText/>} color="purple" currency={currency} desc={t('admin.accounting.card.vatTotalDesc')} />
                                <OverviewCard title={t('admin.accounting.card.cancelLoss')} value={summary.total_cancelled} icon={<FiXCircle/>} color="rose" currency={currency} desc={t('admin.accounting.card.cancelLossDesc')} />
                            </div>

                            {/* VAT / KDV Breakdown & Payments grid */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                {/* VAT breakdown */}
                                <div className="lg:col-span-2 bg-white/[0.02] border border-white/5 backdrop-blur-md p-6 rounded-[2rem] shadow-2xl flex flex-col justify-between">
                                    <div>
                                        <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 mb-6">
                                            <FiFileText className="text-purple-400" /> {t('admin.accounting.vat.title')}
                                        </h3>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-xs border-collapse">
                                                <thead>
                                                    <tr className="border-b border-white/5 bg-white/[0.01] text-[9px] font-black uppercase text-slate-500 tracking-widest">
                                                        <th className="p-3">{t('admin.accounting.vat.col.category')}</th>
                                                        <th className="p-3 text-right">{t('admin.accounting.vat.col.gross')}</th>
                                                        <th className="p-3 text-right">{t('admin.accounting.vat.col.net')}</th>
                                                        <th className="p-3 text-right">{t('admin.accounting.vat.col.tax')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/5 font-bold text-slate-300">
                                                    <tr className="hover:bg-white/[0.01]">
                                                        <td className="p-3">{t('admin.accounting.vat.dineIn')}</td>
                                                        <td className="p-3 text-right text-white font-mono">{analytics.vatDetails.dineInGross.toFixed(2)} {currency}</td>
                                                        <td className="p-3 text-right font-mono">{analytics.vatDetails.dineInNet.toFixed(2)} {currency}</td>
                                                        <td className="p-3 text-right text-purple-400 font-mono">{analytics.vatDetails.dineInTax.toFixed(2)} {currency}</td>
                                                    </tr>
                                                    <tr className="hover:bg-white/[0.01]">
                                                        <td className="p-3">{t('admin.accounting.vat.takeaway')}</td>
                                                        <td className="p-3 text-right text-white font-mono">{analytics.vatDetails.takeawayGross.toFixed(2)} {currency}</td>
                                                        <td className="p-3 text-right font-mono">{analytics.vatDetails.takeawayNet.toFixed(2)} {currency}</td>
                                                        <td className="p-3 text-right text-purple-400 font-mono">{analytics.vatDetails.takeawayTax.toFixed(2)} {currency}</td>
                                                    </tr>
                                                    <tr className="bg-white/[0.02] font-black text-sm text-white">
                                                        <td className="p-3">{t('admin.accounting.vat.total')}</td>
                                                        <td className="p-3 text-right font-mono text-emerald-400">{analytics.grossSales.toFixed(2)} {currency}</td>
                                                        <td className="p-3 text-right font-mono">{analytics.netSalesTotal.toFixed(2)} {currency}</td>
                                                        <td className="p-3 text-right font-mono text-purple-400">{analytics.taxTotal.toFixed(2)} {currency}</td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div className="mt-6 p-4 rounded-xl border border-white/5 bg-white/[0.01] text-[10px] text-slate-500 font-semibold leading-relaxed">
                                        {t('admin.accounting.vat.note')}
                                    </div>
                                </div>

                                {/* Payment Methods Breakdown */}
                                <div className="bg-white/[0.02] border border-white/5 backdrop-blur-md p-6 rounded-[2rem] shadow-2xl flex flex-col justify-between">
                                    <div>
                                        <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 mb-6">
                                            <FiPieChart className="text-blue-400" /> {t('admin.accounting.payment.title')}
                                        </h3>
                                        <div className="space-y-6">
                                            <PaymentProgress 
                                                label={t('admin.accounting.payment.cash')} 
                                                amount={analytics.payments.cash} 
                                                total={analytics.payments.total} 
                                                color="bg-emerald-500" 
                                                currency={currency} 
                                            />
                                            <PaymentProgress 
                                                label={t('admin.accounting.payment.card')} 
                                                amount={analytics.payments.card} 
                                                total={analytics.payments.total} 
                                                color="bg-blue-500" 
                                                currency={currency} 
                                            />
                                            <PaymentProgress 
                                                label={t('admin.accounting.payment.other')} 
                                                amount={analytics.payments.other} 
                                                total={analytics.payments.total} 
                                                color="bg-slate-500" 
                                                currency={currency} 
                                            />
                                        </div>
                                    </div>
                                    <div className="border-t border-white/5 pt-4 mt-6">
                                        <div className="flex justify-between items-baseline font-bold">
                                            <span className="text-xs text-slate-400">{t('admin.accounting.payment.totalVolume')}</span>
                                            <span className="text-lg text-white font-mono">{analytics.payments.total.toFixed(2)} {currency}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Charts & Staff Leaderboard */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                {/* SVG Hourly Distribution Chart */}
                                <div className="lg:col-span-2 bg-white/[0.02] border border-white/5 backdrop-blur-md p-6 rounded-[2rem] shadow-2xl">
                                    <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 mb-8">
                                        <FiTrendingUp className="text-emerald-400" /> {t('admin.accounting.hourly.title')}
                                    </h3>
                                    
                                    <div className="h-64 flex items-end justify-between gap-1 px-4 relative">
                                        {/* Chart horizontal guide lines */}
                                        <div className="absolute inset-x-0 bottom-0 h-px bg-white/5" />
                                        <div className="absolute inset-x-0 bottom-[33%] h-px bg-white/5" />
                                        <div className="absolute inset-x-0 bottom-[66%] h-px bg-white/5" />
                                        <div className="absolute inset-x-0 top-0 h-px bg-white/5" />
                                        
                                        {analytics.hourlyDistribution.map((vol, hr) => {
                                            const maxVal = Math.max(...analytics.hourlyDistribution, 100);
                                            const pct = (vol / maxVal) * 100;
                                            return (
                                                <div key={hr} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                                                    {/* Tooltip on hover */}
                                                    <div className="absolute bottom-full mb-2 bg-[#0c1526] border border-white/10 px-2 py-1 rounded text-[9px] font-black text-emerald-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-xl font-mono">
                                                        {vol.toFixed(2)} {currency}
                                                    </div>
                                                    <div 
                                                        className="w-full bg-gradient-to-t from-emerald-600/40 to-emerald-400 rounded-t-md transition-all duration-700 min-h-[4px] group-hover:from-emerald-500 group-hover:to-emerald-300" 
                                                        style={{ height: `${Math.max(4, pct)}%` }}
                                                    />
                                                    <span className="text-[9px] font-black text-slate-500 mt-2 select-none">
                                                        {String(hr).padStart(2, '0')}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Personnel Commision & Sales Leaderboard */}
                                <div className="bg-white/[0.02] border border-white/5 backdrop-blur-md p-6 rounded-[2rem] shadow-2xl flex flex-col justify-between">
                                    <div>
                                        <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 mb-6">
                                            <FiUsers className="text-indigo-400" /> {t('admin.accounting.staff.title')}
                                        </h3>
                                        <div className="space-y-4 max-h-60 overflow-y-auto no-scrollbar">
                                            {analytics.waiterLeaderboard.map((item, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3.5 bg-white/[0.01] border border-white/5 rounded-2xl group hover:bg-white/[0.03] transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-black text-xs">
                                                            {idx + 1}
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-black text-white uppercase">{item.name}</div>
                                                            <div className="text-[9px] font-bold text-slate-500">{t('admin.accounting.staff.ticketSummary').replace('{{count}}', String(item.count)).replace('{{avg}}', item.avgTicket.toFixed(2)).replace('{{currency}}', currency)}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right font-mono font-black text-xs text-white">
                                                        {item.total.toFixed(2)} {currency}
                                                    </div>
                                                </div>
                                            ))}
                                            {analytics.waiterLeaderboard.length === 0 && (
                                                <p className="text-center text-slate-500 py-10 font-bold uppercase tracking-widest text-xs">{t('admin.accounting.noData')}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* TAB 2: LEDGER / TRANSACTIONS LIST */}
                    {activeTab === 'ledger' && (
                        <motion.div 
                            key="ledger"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            className="p-4 md:p-10 space-y-6"
                        >
                            {/* Filter and search bar */}
                            <div className="flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center bg-white/[0.02] border border-white/5 p-6 rounded-[2rem] shadow-xl">
                                <div className="flex items-center gap-4 flex-1">
                                    <div className="relative flex-1 max-w-md">
                                        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                        <input 
                                            placeholder={t('admin.accounting.ledger.searchPlaceholder')}
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-5 py-3 text-xs font-bold text-white outline-none focus:border-emerald-500/50 transition-all placeholder:text-slate-600"
                                        />
                                    </div>
                                    
                                    <button 
                                        onClick={() => setFilters(prev => ({ ...prev, showPanel: !prev.showPanel }))}
                                        className={`px-5 py-3 flex items-center gap-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${filters.showPanel ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
                                    >
                                        <FiFileText size={14}/> {t('admin.accounting.ledger.advancedFilters')}
                                    </button>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                    <button 
                                        onClick={() => setType('sales')}
                                        className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${type === 'sales' ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'}`}
                                    >
                                        {t('admin.accounting.ledger.sales')}
                                    </button>
                                    {!visibility.hideCancelled && (
                                        <button 
                                            onClick={() => setType('cancelled')}
                                            className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${type === 'cancelled' ? 'bg-rose-600/10 border-rose-500/30 text-rose-450' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'}`}
                                        >
                                            {t('admin.accounting.ledger.cancelled')}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Expandable Advanced Filters Box */}
                            {filters.showPanel && (
                                <div className="bg-white/[0.01] border border-white/5 rounded-[2rem] p-6 grid grid-cols-1 md:grid-cols-4 gap-6 animate-in slide-in-from-top duration-300">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{t('admin.accounting.filters.amountRange').replace('{{currency}}', currency)}</label>
                                        <div className="flex gap-2">
                                            <input placeholder={t('admin.accounting.filters.minAmount')} value={filters.minAmount} onChange={e => setFilters({...filters, minAmount: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-[10px] font-black text-white focus:border-emerald-500 outline-none" />
                                            <input placeholder={t('admin.accounting.filters.maxAmount')} value={filters.maxAmount} onChange={e => setFilters({...filters, maxAmount: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-[10px] font-black text-white focus:border-emerald-500 outline-none" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{t('admin.accounting.filters.paymentMethod')}</label>
                                        <select value={filters.paymentMethod} onChange={e => setFilters({...filters, paymentMethod: e.target.value})} className="w-full bg-[#0c1526] border border-white/10 rounded-xl p-3 text-[10px] font-black text-white focus:border-emerald-500 outline-none uppercase tracking-widest">
                                            <option value="all">{t('admin.accounting.filters.all')}</option>
                                            <option value="cash">{t('admin.accounting.filters.cash')}</option>
                                            <option value="credit_card">{t('admin.accounting.filters.card')}</option>
                                            <option value="other">{t('admin.accounting.filters.other')}</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{t('admin.accounting.filters.staff')}</label>
                                        <select value={filters.waiterName} onChange={e => setFilters({...filters, waiterName: e.target.value})} className="w-full bg-[#0c1526] border border-white/10 rounded-xl p-3 text-[10px] font-black text-white focus:border-emerald-500 outline-none uppercase tracking-widest">
                                            <option value="all">{t('admin.accounting.filters.allStaff')}</option>
                                            {uniqueWaiters.map(w => <option key={w} value={w!} className="bg-slate-900">{w?.toUpperCase()}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex items-end">
                                        <button 
                                            onClick={() => setFilters(prev => ({ ...prev, minAmount: '', maxAmount: '', paymentMethod: 'all', waiterName: 'all' }))}
                                            className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl py-3 text-[9px] font-black uppercase tracking-widest transition-all"
                                        >
                                            {t('admin.accounting.filters.reset')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Ledger records container */}
                            <div className="space-y-4">
                                {filteredTransactions.map(txn => {
                                    const isExpanded = !!expandedRows[txn.id];
                                    return (
                                        <div 
                                            key={txn.id}
                                            className="bg-white/[0.02] border border-white/5 rounded-[2rem] overflow-hidden transition-all hover:bg-white/[0.03]"
                                        >
                                            {/* Header row */}
                                            <div 
                                                onClick={() => toggleRow(txn.id)}
                                                className="p-6 md:px-8 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                                            >
                                                <div className="flex items-center gap-6">
                                                    <div className="h-14 w-14 rounded-2xl bg-black/30 border border-white/5 flex flex-col items-center justify-center">
                                                        <span className="text-[8px] font-black text-slate-500 leading-none mb-0.5">ID</span>
                                                        <span className="text-sm font-black text-white font-mono">#{txn.id}</span>
                                                    </div>
                                                    
                                                    <div>
                                                        <div className="flex items-center gap-3">
                                                            <h4 className="text-base font-black text-white uppercase italic tracking-tight">
                                                                {txn.table_name ? `${txn.table_name}` : t('admin.accounting.ledger.quickSale')}
                                                            </h4>
                                                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                                                txn.payment_method?.toLowerCase().includes('card') || txn.payment_method?.toLowerCase().includes('stripe')
                                                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                            }`}>
                                                                {txn.payment_method || t('admin.accounting.fallback.cash')}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-3 text-[9px] font-bold text-slate-500 mt-1 uppercase tracking-wider">
                                                            <span>{new Date(txn.created_at).toLocaleString('tr-TR')}</span>
                                                            <span>•</span>
                                                            <span>{t('admin.accounting.ledger.waiter').replace('{{name}}', txn.waiter_name || t('admin.accounting.fallback.cashier'))}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-8 justify-between md:justify-end">
                                                    <div className="text-right">
                                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">{t('admin.accounting.ledger.amount')}</p>
                                                        <p className={`text-xl font-black italic tracking-tighter tabular-nums ${txn.status === 'completed' ? 'text-emerald-400' : 'text-slate-500 line-through'}`}>
                                                            {Number(txn.total_amount).toFixed(2)} {currency}
                                                        </p>
                                                    </div>
                                                    
                                                    <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-white transition-all">
                                                        {isExpanded ? '▲' : '▼'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Expandable details panel */}
                                            {isExpanded && (
                                                <div className="px-6 md:px-8 pb-6 pt-2 border-t border-white/5 bg-black/10 space-y-4 animate-in fade-in duration-200">
                                                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('admin.accounting.ledger.itemDetails')}</div>
                                                    <div className="divide-y divide-white/5">
                                                        {txn.items?.map((item, idx) => (
                                                            <div key={idx} className="py-2.5 flex items-center justify-between text-xs font-bold">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-emerald-400 font-black font-mono">{item.quantity}x</span>
                                                                    <span className="text-slate-300">{item.product_name}</span>
                                                                </div>
                                                                <div className="text-slate-400 font-mono">
                                                                    {Number(item.unit_price).toFixed(2)} {currency} x {item.quantity} = <span className="text-white font-black">{Number(item.total_price).toFixed(2)} {currency}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {txn.notes && (
                                                        <div className="p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl text-[10px] font-bold text-rose-350">
                                                            <span className="font-black">{t('admin.accounting.ledger.adminNote')}</span> {txn.notes}
                                                        </div>
                                                    )}

                                                    <div className="flex justify-end gap-3 pt-3 border-t border-white/5">
                                                        <button 
                                                            onClick={() => handleMockPrint(txn)}
                                                            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all"
                                                        >
                                                            {t('admin.accounting.ledger.printReceipt')}
                                                        </button>
                                                        <button 
                                                            onClick={() => { setEditing(txn); setEditForm({ total_amount: Number(txn.total_amount), status: txn.status, notes: txn.notes || '' }); }}
                                                            className="px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/25 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all"
                                                        >
                                                            {t('admin.accounting.ledger.editTransaction')}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {filteredTransactions.length === 0 && !loading && (
                                    <div className="flex flex-col items-center justify-center py-32 opacity-30">
                                        <FiFileText size={60} className="mb-4 text-slate-500 animate-bounce" />
                                        <h4 className="text-sm font-black italic tracking-widest text-white uppercase">{t('admin.accounting.ledger.noResults')}</h4>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* TAB 3: CASH BOOK (KASA DEFTERİ) */}
                    {activeTab === 'cashbook' && (
                        <motion.div 
                            key="cashbook"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            className="p-4 md:p-10 space-y-8"
                        >
                            {/* Cash drawer stats */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-[#0f172a]/45 border border-white/5 p-6 rounded-[2rem] backdrop-blur-md flex items-center gap-5">
                                    <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                                        <FiBookOpen size={24}/>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{t('admin.accounting.cashbook.balance')}</p>
                                        <p className="text-2xl font-black text-white font-mono mt-0.5">{cashBookSummary.balance.toFixed(2)} {currency}</p>
                                    </div>
                                </div>
                                <div className="bg-[#0f172a]/45 border border-white/5 p-6 rounded-[2rem] backdrop-blur-md flex items-center gap-5">
                                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                                        <FiArrowUpRight size={24}/>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{t('admin.accounting.cashbook.totalIn')}</p>
                                        <p className="text-2xl font-black text-emerald-400 font-mono mt-0.5">{cashBookSummary.totalIn.toFixed(2)} {currency}</p>
                                    </div>
                                </div>
                                <div className="bg-[#0f172a]/45 border border-white/5 p-6 rounded-[2rem] backdrop-blur-md flex items-center gap-5">
                                    <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-450 flex items-center justify-center">
                                        <FiArrowDownLeft size={24}/>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{t('admin.accounting.cashbook.totalOut')}</p>
                                        <p className="text-2xl font-black text-rose-450 font-mono mt-0.5">{cashBookSummary.totalOut.toFixed(2)} {currency}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Safe transactions list */}
                            <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">
                                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                                    <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                                        <FiBookOpen className="text-indigo-400" /> {t('admin.accounting.cashbook.ledgerTitle')}
                                    </h3>
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{t('admin.accounting.cashbook.history')}</span>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm border-collapse">
                                        <thead>
                                            <tr className="border-b border-white/5 bg-white/[0.01] text-[9px] font-black uppercase text-slate-500 tracking-widest">
                                                <th className="p-4 px-6">{t('admin.accounting.cashbook.col.date')}</th>
                                                <th className="p-4">{t('admin.accounting.cashbook.col.type')}</th>
                                                <th className="p-4">{t('admin.accounting.cashbook.col.category')}</th>
                                                <th className="p-4">{t('admin.accounting.cashbook.col.notes')}</th>
                                                <th className="p-4">{t('admin.accounting.cashbook.col.user')}</th>
                                                <th className="p-4 text-right">{t('admin.accounting.cashbook.col.amount')}</th>
                                                <th className="p-4" />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5 font-bold">
                                            {cashEntries.map(entry => (
                                                    <tr key={entry.id} className="hover:bg-white/[0.01] transition-colors text-slate-300">
                                                        <td className="p-4 px-6 text-xs font-mono text-slate-400">
                                                            {new Date(entry.createdAt).toLocaleString('tr-TR')}
                                                        </td>
                                                        <td className="p-4">
                                                            <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider ${
                                                                entry.type === 'cash_in' 
                                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' 
                                                                    : 'bg-rose-500/10 text-rose-450 border border-rose-500/25'
                                                            }`}>
                                                                {entry.type === 'cash_in' ? t('admin.accounting.cashbook.type.in') : t('admin.accounting.cashbook.type.out')}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 text-xs text-white">
                                                            {cashCategoryLabel(entry.category)}
                                                        </td>
                                                        <td className="p-4 text-xs max-w-xs truncate" title={entry.notes}>
                                                            {entry.notes || '—'}
                                                        </td>
                                                        <td className="p-4 text-xs text-slate-400">
                                                            {entry.user}
                                                        </td>
                                                        <td className={`p-4 text-right font-mono font-black text-xs ${
                                                            entry.type === 'cash_in' ? 'text-emerald-400' : 'text-rose-450'
                                                        }`}>
                                                            {entry.type === 'cash_in' ? '+' : '-'}{entry.amount.toFixed(2)} {currency}
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <button 
                                                                onClick={() => handleDeleteCashFlow(entry.id)}
                                                                className="px-2.5 py-1 bg-white/5 border border-white/5 rounded-lg text-[9px] font-black uppercase tracking-wider text-rose-450 hover:bg-rose-500/10 transition-all"
                                                            >
                                                                {t('admin.accounting.cashbook.delete')}
                                                            </button>
                                                        </td>
                                                    </tr>
                                            ))}
                                            {cashEntries.length === 0 && (
                                                <tr>
                                                    <td colSpan={7} className="p-10 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">{t('admin.accounting.cashbook.empty')}</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Modal: Operational Override (Edit Transaction) */}
            {editing && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-8">
                    <form onSubmit={handleUpdate} className="w-full max-w-xl rounded-[3rem] bg-[#0c1526] border border-white/10 p-12 shadow-2xl animate-in zoom-in-95 duration-500 text-white">
                        <header className="flex items-center gap-6 mb-10 border-b border-white/5 pb-6">
                             <div className="w-14 h-14 rounded-3xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
                                 <FiEdit size={24}/>
                             </div>
                             <div>
                                 <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">{t('admin.accounting.modal.edit.title')}</h3>
                                 <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">{t('admin.accounting.modal.edit.transactionId').replace('{{id}}', String(editing.id))}</p>
                             </div>
                        </header>

                        <div className="space-y-6 mb-10">
                             <Input 
                                 required
                                 type="text" 
                                 mask="price"
                                 label={t('admin.accounting.modal.edit.amount').replace('{{currency}}', currency)}
                                 value={editForm.total_amount} 
                                 onChange={v => setEditForm({...editForm, total_amount: parseFloat(v) || 0})}
                             />
                             
                             <Select
                                 label={t('admin.accounting.modal.edit.status')}
                                 value={editForm.status}
                                 onChange={v => setEditForm({...editForm, status: v})}
                                 options={[
                                     { v: 'completed', l: t('admin.accounting.modal.edit.statusCompleted') },
                                     { v: 'cancelled', l: t('admin.accounting.modal.edit.statusCancelled') }
                                 ]}
                             />

                             <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{t('admin.accounting.modal.edit.notes')}</label>
                                <textarea
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-xs font-bold text-white focus:border-indigo-500/50 outline-none transition-all min-h-[100px] placeholder:text-slate-600"
                                    placeholder={t('admin.accounting.modal.edit.notesPlaceholder')}
                                    value={editForm.notes} 
                                    onChange={e => setEditForm({...editForm, notes: e.target.value})}
                                />
                             </div>
                        </div>

                        <div className="flex flex-wrap justify-between gap-4">
                            <button
                                type="button"
                                disabled={voiding || editing.status === 'cancelled' || editing.payment_status === 'refunded'}
                                onClick={() => void handleVoid()}
                                className="px-6 py-3 rounded-2xl border border-rose-500/40 bg-rose-600/20 text-rose-200 hover:bg-rose-600/40 disabled:opacity-40 disabled:cursor-not-allowed text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                                {voiding ? t('admin.accounting.modal.voiding') : t('admin.accounting.modal.void')}
                            </button>
                            <div className="flex gap-4 ml-auto">
                                <button type="button" onClick={() => setEditing(null)} className="px-6 py-3 border border-white/10 text-slate-450 hover:text-white hover:bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">{t('admin.accounting.modal.cancel')}</button>
                                <button type="submit" className="px-8 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-900/20 active:scale-95 transition-all">{t('admin.accounting.modal.save')}</button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {/* Modal: Add Cash Flow (Cash book entry) */}
            {showCashModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-8">
                    <form onSubmit={handleAddCashFlow} className="w-full max-w-xl rounded-[3rem] bg-[#0c1526] border border-white/10 p-12 shadow-2xl animate-in zoom-in-95 duration-500 text-white">
                        <header className="flex items-center gap-6 mb-10 border-b border-white/5 pb-6">
                             <div className="w-14 h-14 rounded-3xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
                                 <FiPlusCircle size={24}/>
                             </div>
                             <div>
                                 <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">{t('admin.accounting.modal.cash.title')}</h3>
                                 <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">{t('admin.accounting.modal.cash.subtitle')}</p>
                             </div>
                        </header>

                        <div className="space-y-6 mb-10">
                             <Select
                                 label={t('admin.accounting.modal.cash.type')}
                                 value={cashForm.type}
                                 onChange={v => setCashForm({ ...cashForm, type: v as 'cash_in' | 'cash_out' })}
                                 options={[
                                     { v: 'cash_out', l: t('admin.accounting.modal.cash.typeOut') },
                                     { v: 'cash_in', l: t('admin.accounting.modal.cash.typeIn') }
                                 ]}
                             />

                             <Input 
                                 required
                                 type="text" 
                                 mask="price"
                                 label={t('admin.accounting.modal.cash.amount').replace('{{currency}}', currency)}
                                 value={cashForm.amount} 
                                 onChange={v => setCashForm({...cashForm, amount: v})}
                             />
                             
                             <Select
                                 label={t('admin.accounting.modal.cash.category')}
                                 value={cashForm.category}
                                 onChange={v => setCashForm({ ...cashForm, category: v })}
                                 options={[
                                     { v: 'local_grocery', l: cashModalCategoryLabel('local_grocery') },
                                     { v: 'supplier_payment', l: cashModalCategoryLabel('supplier_payment') },
                                     { v: 'staff_payout', l: cashModalCategoryLabel('staff_payout') },
                                     { v: 'initial_cash', l: cashModalCategoryLabel('initial_cash') },
                                     { v: 'safe_withdrawal', l: cashModalCategoryLabel('safe_withdrawal') },
                                     { v: 'other', l: cashModalCategoryLabel('other') }
                                 ]}
                             />

                             <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{t('admin.accounting.modal.cash.notes')}</label>
                                <textarea
                                    required
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-xs font-bold text-white focus:border-indigo-500/50 outline-none transition-all min-h-[100px] placeholder:text-slate-600"
                                    placeholder={t('admin.accounting.modal.cash.notesPlaceholder')}
                                    value={cashForm.notes} 
                                    onChange={e => setCashForm({...cashForm, notes: e.target.value})}
                                />
                             </div>
                        </div>

                        <div className="flex justify-end gap-4">
                            <button type="button" onClick={() => setShowCashModal(false)} className="px-6 py-3 border border-white/10 text-slate-450 hover:text-white hover:bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">{t('admin.accounting.modal.cancel')}</button>
                            <button type="submit" className="px-8 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-900/20 active:scale-95 transition-all">{t('admin.accounting.modal.cash.update')}</button>
                        </div>
                    </form>
                </div>
            )}
        </main>
    );
};

interface OverviewCardProps {
    title: string;
    value: number | string | null | undefined;
    icon: React.ReactNode;
    color: 'emerald' | 'blue' | 'purple' | 'rose';
    currency: string;
    desc: string;
}

const OverviewCard: React.FC<OverviewCardProps> = ({ title, value, icon, color, currency, desc }) => {
    const themeClasses = {
        emerald: 'from-emerald-500/10 to-emerald-950/20 border-emerald-500/20 text-emerald-400',
        blue: 'from-blue-500/10 to-blue-950/20 border-blue-500/20 text-blue-400',
        purple: 'from-purple-500/10 to-purple-950/20 border-purple-500/20 text-purple-400',
        rose: 'from-rose-500/10 to-rose-950/20 border-rose-500/20 text-rose-400'
    };

    const numValue = Number(value) || 0;

    return (
        <div className={`bg-gradient-to-br ${themeClasses[color]} min-w-0 p-6 rounded-[2.5rem] border shadow-xl flex items-start gap-4 transition-all hover:scale-[1.02]`}>
            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-wide text-slate-500 leading-snug break-words">{title}</p>
                <p className="text-xl font-black text-white font-mono tracking-tight mt-1">{numValue.toFixed(2)} {currency}</p>
                <p className="text-[8px] font-semibold text-slate-600 mt-1 uppercase tracking-wide leading-snug break-words">{desc}</p>
            </div>
        </div>
    );
};

interface PaymentProgressProps {
    label: string;
    amount: number | string | null | undefined;
    total: number | string | null | undefined;
    color: string;
    currency: string;
}

const PaymentProgress: React.FC<PaymentProgressProps> = ({ label, amount, total, color, currency }) => {
    const numAmount = Number(amount) || 0;
    const numTotal = Number(total) || 0;
    const pct = numTotal > 0 ? (numAmount / numTotal) * 100 : 0;
    return (
        <div className="space-y-2 font-bold">
            <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">{label}</span>
                <span className="text-white font-mono">{numAmount.toFixed(2)} {currency} ({pct.toFixed(1)}%)</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
};

interface TabButtonProps {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, icon, label }) => (
    <button 
        onClick={onClick}
        className={`h-16 flex items-center gap-2.5 px-3 border-b-2 transition-all font-black text-[9px] uppercase tracking-wider relative ${
            active ? 'text-white border-emerald-500' : 'border-transparent text-slate-500 hover:text-slate-350'
        }`}
    >
        {active && (
            <motion.div 
                layoutId="active-account-tab" 
                className="absolute bottom-0 inset-x-0 h-0.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" 
            />
        )}
        {icon} <span>{label}</span>
    </button>
);
