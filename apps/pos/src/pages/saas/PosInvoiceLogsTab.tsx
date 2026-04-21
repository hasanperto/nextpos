import React, { useEffect, useMemo, useState } from 'react';
import { FiRefreshCw, FiSearch } from 'react-icons/fi';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { useSaaSStore } from '../../store/useSaaSStore';
import { InputGroup, SectionCard, SelectGroup } from './SaaSShared';

function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

export const PosInvoiceLogsTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const {
        tenants,
        fetchTenants,
        fetchPosInvoiceEvents,
        selectedTenantId,
        setSelectedTenantId,
        setSelectedPosInvoiceNo,
    } = useSaaSStore();

    const today = useMemo(() => isoDate(new Date()), []);
    const weekAgo = useMemo(() => isoDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), []);

    const [tenantId, setTenantIdLocal] = useState<string>('');
    const [from, setFrom] = useState(weekAgo);
    const [to, setTo] = useState(today);
    const [posInvoiceNo, setPosInvoiceNo] = useState('');
    const [eventType, setEventType] = useState('');
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<any[]>([]);

    useEffect(() => {
        if (!tenants.length) fetchTenants();
    }, [tenants.length, fetchTenants]);

    useEffect(() => {
        if (!tenantId && selectedTenantId) setTenantIdLocal(selectedTenantId);
    }, [tenantId, selectedTenantId]);

    useEffect(() => {
        if (!tenantId && tenants.length) setTenantIdLocal(String(tenants[0]?.id || ''));
    }, [tenantId, tenants]);

    const tenantOptions = useMemo(() => {
        return tenants.map((x: any) => ({ value: String(x.id), label: `${x.name || 'Tenant'} (${String(x.id).slice(0, 8)})` }));
    }, [tenants]);

    async function load() {
        if (!tenantId) return;
        setLoading(true);
        try {
            const data = await fetchPosInvoiceEvents(tenantId, {
                posInvoiceNo: posInvoiceNo.trim() || undefined,
                eventType: eventType.trim() || undefined,
                from: from ? `${from}T00:00:00Z` : undefined,
                to: to ? `${to}T23:59:59Z` : undefined,
                limit: 300,
            });
            setRows(data || []);
        } finally {
            setLoading(false);
        }
    }

    function openInvoice(row: any) {
        const tId = String(tenantId);
        const inv = String(row.pos_invoice_no || '').trim();
        if (!tId || !inv) return;
        setSelectedTenantId(tId);
        setSelectedPosInvoiceNo(inv);
        window.dispatchEvent(new CustomEvent('saas:navigate', { detail: { tab: 'posInvoices' } }));
    }

    useEffect(() => {
        if (tenantId) {
            setSelectedTenantId(tenantId);
            void load();
        }
    }, [tenantId]);

    return (
        <div className="space-y-8">
            <div className="flex items-start justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight">{t('tab.posInvoiceLogs')}</h1>
                    <p className="text-slate-400 text-sm">PDF üretim, e‑posta gönderim ve hata logları (POS satış faturası).</p>
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading || !tenantId}
                    className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold flex items-center gap-2 disabled:opacity-50"
                >
                    <FiRefreshCw />
                    Yenile
                </button>
            </div>

            <SectionCard title="Filtreler">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <SelectGroup
                        label="Restoran"
                        value={tenantId}
                        onChange={(v) => setTenantIdLocal(v)}
                        options={tenantOptions}
                    />
                    <InputGroup label="Başlangıç" value={from} onChange={setFrom} type="date" />
                    <InputGroup label="Bitiş" value={to} onChange={setTo} type="date" />
                    <InputGroup label="Fatura no" value={posInvoiceNo} onChange={setPosInvoiceNo} placeholder="POS-123" />
                    <InputGroup label="Event type" value={eventType} onChange={setEventType} placeholder="POS_INVOICE_EMAILED" />
                </div>
            </SectionCard>

            <SectionCard title="Loglar">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-slate-400 border-b border-white/10">
                                <th className="py-3 pr-4">Zaman</th>
                                <th className="py-3 pr-4">Event</th>
                                <th className="py-3 pr-4">Fatura</th>
                                <th className="py-3 pr-4">Actor</th>
                                <th className="py-3 pr-2 text-right">Aksiyon</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={String(r.id)} className="border-b border-white/5 hover:bg-white/5">
                                    <td className="py-3 pr-4 text-slate-300">{String(r.created_at).replace('T', ' ').slice(0, 19)}</td>
                                    <td className="py-3 pr-4 text-white font-bold">{String(r.event_type)}</td>
                                    <td className="py-3 pr-4 text-slate-300">{String(r.pos_invoice_no || '—')}</td>
                                    <td className="py-3 pr-4 text-slate-300">{String(r.created_by || '—')}</td>
                                    <td className="py-3 pr-2 text-right">
                                        <button
                                            type="button"
                                            onClick={() => openInvoice(r)}
                                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white"
                                        >
                                            <FiSearch />
                                            Aç
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {!rows.length && (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-slate-500">
                                        {loading ? 'Yükleniyor…' : 'Kayıt yok.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </SectionCard>
        </div>
    );
};

