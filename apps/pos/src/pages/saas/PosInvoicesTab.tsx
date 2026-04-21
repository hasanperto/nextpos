import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FiDownload, FiMail, FiRefreshCw } from 'react-icons/fi';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { useSaaSStore } from '../../store/useSaaSStore';
import { InputGroup, Modal, SectionCard, SelectGroup } from './SaaSShared';

function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

export const PosInvoicesTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const {
        tenants,
        fetchTenants,
        fetchPosInvoices,
        fetchPosInvoiceDetail,
        fetchPosInvoicePdf,
        sendPosInvoiceEmail,
        fetchPosInvoiceEvents,
        selectedTenantId,
        selectedPosInvoiceNo,
        setSelectedPosInvoiceNo,
    } = useSaaSStore();

    const today = useMemo(() => isoDate(new Date()), []);
    const weekAgo = useMemo(() => isoDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), []);

    const [tenantId, setTenantId] = useState('');
    const [from, setFrom] = useState(weekAgo);
    const [to, setTo] = useState(today);
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<any[]>([]);

    const [detailOpen, setDetailOpen] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detail, setDetail] = useState<any | null>(null);
    const [events, setEvents] = useState<any[]>([]);
    const [eventsLoading, setEventsLoading] = useState(false);

    const [emailOpen, setEmailOpen] = useState(false);
    const [emailTo, setEmailTo] = useState('');
    const [emailSending, setEmailSending] = useState(false);

    useEffect(() => {
        if (!tenants.length) fetchTenants();
    }, [tenants.length, fetchTenants]);

    useEffect(() => {
        if (!tenantId && tenants.length) setTenantId(String(tenants[0]?.id || ''));
    }, [tenantId, tenants]);

    useEffect(() => {
        if (selectedTenantId && selectedTenantId !== tenantId) {
            setTenantId(selectedTenantId);
        }
    }, [selectedTenantId, tenantId]);

    const tenantOptions = useMemo(() => {
        return tenants.map((x: any) => ({ value: String(x.id), label: `${x.name || 'Tenant'} (${String(x.id).slice(0, 8)})` }));
    }, [tenants]);

    async function load() {
        if (!tenantId) return;
        setLoading(true);
        try {
            const data = await fetchPosInvoices(tenantId, { from, to, q, limit: 200 });
            setRows(data || []);
        } finally {
            setLoading(false);
        }
    }

    async function openDetail(posInvoiceNo: string) {
        if (!tenantId) return;
        setDetailLoading(true);
        try {
            const d = await fetchPosInvoiceDetail(tenantId, posInvoiceNo);
            if (!d) {
                toast.error('Fatura bulunamadı');
                return;
            }
            setDetail(d);
            setDetailOpen(true);
            setEmailTo(String(d.customer_email || '').trim());
            setEvents([]);
            setEventsLoading(true);
            const ev = await fetchPosInvoiceEvents(tenantId, { posInvoiceNo: String(d.pos_invoice_no), limit: 200 });
            setEvents(ev || []);
        } finally {
            setEventsLoading(false);
            setDetailLoading(false);
        }
    }

    async function downloadPdf(posInvoiceNo: string) {
        if (!tenantId) return;
        try {
            const blob = await fetchPosInvoicePdf(tenantId, posInvoiceNo);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${posInvoiceNo}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('PDF indirilemedi');
        }
    }

    async function sendEmail() {
        if (!tenantId || !detail?.pos_invoice_no) return;
        setEmailSending(true);
        try {
            const r = await sendPosInvoiceEmail(tenantId, String(detail.pos_invoice_no), emailTo.trim() || undefined);
            if (!r.ok) {
                toast.error(r.error || 'Mail gönderilemedi');
                return;
            }
            toast.success('Mail gönderildi');
            setEmailOpen(false);
            const ev = await fetchPosInvoiceEvents(tenantId, { posInvoiceNo: String(detail.pos_invoice_no), limit: 200 });
            setEvents(ev || []);
        } finally {
            setEmailSending(false);
        }
    }

    useEffect(() => {
        if (tenantId) load();
    }, [tenantId]);

    useEffect(() => {
        if (!tenantId || !selectedPosInvoiceNo) return;
        void openDetail(selectedPosInvoiceNo).finally(() => setSelectedPosInvoiceNo(null));
    }, [tenantId, selectedPosInvoiceNo]);

    return (
        <div className="space-y-8">
            <div className="flex items-start justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight">{t('tab.posInvoices')}</h1>
                    <p className="text-slate-400 text-sm">POS satış faturaları: arama, PDF, e‑posta gönderim ve log.</p>
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
                <p className="text-slate-400 text-xs mb-4">Fatura numarası, telefon, e‑posta, müşteri adı veya order id ile arayın.</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <SelectGroup label="Restoran" value={tenantId} onChange={setTenantId} options={tenantOptions} />
                    <InputGroup label="Başlangıç" value={from} onChange={setFrom} type="date" />
                    <InputGroup label="Bitiş" value={to} onChange={setTo} type="date" />
                    <InputGroup label="Arama" value={q} onChange={setQ} placeholder="Fatura no / tel / email / order id" />
                </div>
                <div className="mt-4 text-xs text-slate-400">
                    Gösterilen: <span className="text-white font-bold">{rows.length}</span>
                </div>
            </SectionCard>

            <SectionCard title="Satış Faturaları">
                <p className="text-slate-400 text-xs mb-4">Liste satırına tıklayın: detay + PDF + mail.</p>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-slate-400 border-b border-white/10">
                                <th className="py-3 pr-4">Tarih</th>
                                <th className="py-3 pr-4">Fatura</th>
                                <th className="py-3 pr-4">Şube</th>
                                <th className="py-3 pr-4">Kasiyer</th>
                                <th className="py-3 pr-4 text-right">Toplam</th>
                                <th className="py-3 pr-4">Ödeme</th>
                                <th className="py-3 pr-4">Durum</th>
                                <th className="py-3 pr-2 text-right">Aksiyon</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr
                                    key={String(r.pos_invoice_no)}
                                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                                    onClick={() => openDetail(String(r.pos_invoice_no))}
                                >
                                    <td className="py-3 pr-4 text-slate-300">{String(r.created_at).replace('T', ' ').slice(0, 16)}</td>
                                    <td className="py-3 pr-4 text-white font-bold">{r.pos_invoice_no}</td>
                                    <td className="py-3 pr-4 text-slate-300">{r.branch_name || r.branch_id || '—'}</td>
                                    <td className="py-3 pr-4 text-slate-300">{r.cashier_name || r.cashier_id || '—'}</td>
                                    <td className="py-3 pr-4 text-right text-white font-bold">{Number(r.total_amount || 0).toFixed(2)}</td>
                                    <td className="py-3 pr-4 text-slate-300">{r.payment_method || '—'}</td>
                                    <td className="py-3 pr-4 text-slate-300">{r.payment_status || r.status || '—'}</td>
                                    <td className="py-3 pr-2 text-right">
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                downloadPdf(String(r.pos_invoice_no));
                                            }}
                                        >
                                            <FiDownload />
                                            PDF
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {!rows.length && (
                                <tr>
                                    <td colSpan={8} className="py-8 text-center text-slate-500">
                                        {loading ? 'Yükleniyor…' : 'Kayıt yok.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </SectionCard>

            <Modal show={detailOpen} onClose={() => setDetailOpen(false)} title={detail ? `Fatura — ${detail.pos_invoice_no}` : 'Fatura'}>
                {!detail || detailLoading ? (
                    <div className="text-slate-300">Yükleniyor…</div>
                ) : (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Kaynak</div>
                                <div className="text-white font-bold">Order #{detail.order_id}</div>
                                <div className="text-slate-300 text-sm">{detail.branch_name || detail.branch_id || '—'}</div>
                                <div className="text-slate-300 text-sm">{detail.cashier_name || detail.cashier_id || '—'}</div>
                            </div>
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Toplamlar</div>
                                <div className="text-slate-300 text-sm">Ara: {Number(detail.subtotal || 0).toFixed(2)}</div>
                                <div className="text-slate-300 text-sm">İndirim: {Number(detail.discount_amount || 0).toFixed(2)}</div>
                                <div className="text-slate-300 text-sm">KDV: {Number(detail.tax_amount || 0).toFixed(2)}</div>
                                <div className="text-white font-black text-lg">Genel: {Number(detail.total_amount || 0).toFixed(2)}</div>
                            </div>
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Müşteri</div>
                                <div className="text-white font-bold">{detail.customer_name || '—'}</div>
                                <div className="text-slate-300 text-sm">{detail.customer_phone || detail.delivery_phone || '—'}</div>
                                <div className="text-slate-300 text-sm">{detail.customer_email || '—'}</div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold"
                                onClick={() => downloadPdf(String(detail.pos_invoice_no))}
                            >
                                <FiDownload />
                                PDF indir
                            </button>
                            <button
                                type="button"
                                className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 text-white font-bold"
                                onClick={() => setEmailOpen(true)}
                            >
                                <FiMail />
                                Mail gönder
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Kalemler</div>
                                <div className="space-y-3">
                                    {(detail.items || []).map((it: any) => (
                                        <div key={String(it.id)} className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="text-white font-bold">
                                                    {Number(it.quantity)} × {it.product_name || 'Item'}{it.variant_name ? ` (${it.variant_name})` : ''}
                                                </div>
                                                {it.notes && <div className="text-slate-400 text-xs">{it.notes}</div>}
                                            </div>
                                            <div className="text-white font-bold">{Number(it.total_price || 0).toFixed(2)}</div>
                                        </div>
                                    ))}
                                    {!detail.items?.length && <div className="text-slate-500">Kalem yok.</div>}
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Ödemeler</div>
                                <div className="space-y-3">
                                    {(detail.payments || []).map((p: any) => (
                                        <div key={String(p.id)} className="flex items-center justify-between gap-3">
                                            <div className="text-slate-300">
                                                <span className="text-white font-bold">{p.method}</span>
                                                {p.cashier_name && <span className="text-slate-500"> · {p.cashier_name}</span>}
                                            </div>
                                            <div className="text-white font-bold">{Number(p.amount || 0).toFixed(2)}</div>
                                        </div>
                                    ))}
                                    {!detail.payments?.length && <div className="text-slate-500">Ödeme yok.</div>}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{t('tab.posInvoiceLogs')}</div>
                            {eventsLoading ? (
                                <div className="text-slate-300">Yükleniyor…</div>
                            ) : (
                                <div className="space-y-2">
                                    {events.map((e) => (
                                        <div key={String(e.id)} className="flex items-center justify-between gap-4">
                                            <div className="text-slate-300 text-sm">
                                                <span className="text-white font-bold">{e.event_type}</span>
                                                {e.created_by ? <span className="text-slate-500"> · {e.created_by}</span> : null}
                                            </div>
                                            <div className="text-slate-500 text-xs">{String(e.created_at).replace('T', ' ').slice(0, 19)}</div>
                                        </div>
                                    ))}
                                    {!events.length && <div className="text-slate-500">Log yok.</div>}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            <Modal show={emailOpen} onClose={() => setEmailOpen(false)} title="Fatura mail gönder">
                <div className="space-y-4">
                    <InputGroup label="Alıcı e‑posta" value={emailTo} onChange={setEmailTo} placeholder="musteri@ornek.com" />
                    <button
                        type="button"
                        onClick={sendEmail}
                        disabled={emailSending}
                        className="w-full px-4 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black disabled:opacity-50"
                    >
                        {emailSending ? 'Gönderiliyor…' : 'Gönder'}
                    </button>
                </div>
            </Modal>
        </div>
    );
};
