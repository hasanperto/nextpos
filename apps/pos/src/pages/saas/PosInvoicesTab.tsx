import React, { useEffect, useState } from 'react';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import {
    FiFileText, FiRefreshCw, FiSearch, FiPrinter, FiDownload, FiZap, FiUsers, FiLayers, FiDollarSign
} from 'react-icons/fi';
import { SectionCard, EmptyState, Modal, Badge } from './SaaSShared';
import { motion, AnimatePresence } from 'framer-motion';

const statusColor: Record<string, string> = {
    paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-emerald-500/5',
    pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-amber-500/5',
    overdue: 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-rose-500/5',
    cancelled: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20',
};

export const PosInvoicesTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const {
        fetchInvoices, invoices,
        fetchInvoiceDetail, settings,
    } = useSaaSStore();

    const currency = settings?.currency || '€';
    
    const [loading, setLoading] = useState(false);
    const [invoiceModal, setInvoiceModal] = useState<any | null>(null);
    const [invoiceLoading, setInvoiceLoading] = useState(false);
    
    // Filters
    const [filterStatus, setFilterStatus] = useState('');
    const [filterTenant, setFilterTenant] = useState('');
    const [filterFrom, setFilterFrom] = useState('');
    const [filterTo, setFilterTo] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            await fetchInvoices({
                status: filterStatus || undefined,
                tenant: filterTenant || undefined,
                from: filterFrom || undefined,
                to: filterTo || undefined
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, [filterStatus, filterTenant, filterFrom, filterTo]);

    const openInvoice = async (invoiceNumber: string) => {
        if (!invoiceNumber || invoiceNumber === '—') return;
        setInvoiceLoading(true);
        const detail = await fetchInvoiceDetail(invoiceNumber);
        setInvoiceModal(detail);
        setInvoiceLoading(false);
    };

    return (
        <motion.div 
            className="space-y-8 pb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
                <div className="space-y-1">
                    <div className="flex items-center gap-3 text-blue-500 mb-1">
                        <FiZap className="animate-pulse" size={14} />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">Billing Headquarters</span>
                    </div>
                    <h2 className="text-4xl font-black text-slate-800 dark:text-white tracking-tighter uppercase italic drop-shadow-sm">
                        {t('tab.posInvoices') || 'Sales Invoice Center'}
                    </h2>
                    <p className="text-[11px] text-slate-500 font-bold uppercase tracking-[0.2em] max-w-xl opacity-60">
                        {t('posInvoices.subtitle')}
                    </p>
                </div>
                
                <button
                    onClick={load}
                    disabled={loading}
                    className="px-6 py-3.5 bg-white/5 hover:bg-white/10 rounded-xl flex items-center gap-3 transition-all active:scale-95 text-[10px] font-black uppercase tracking-[0.2em] text-slate-800 dark:text-white border border-slate-200 dark:border-slate-800 shadow-sm disabled:opacity-50"
                >
                    <FiRefreshCw className={loading ? 'animate-spin' : ''} /> {t('posInvoices.refresh')}
                </button>
            </div>

            <SectionCard 
                title={t('posInvoices.filters')} 
                icon={<FiSearch className="text-blue-400" />}
                action={
                    <div className="flex flex-wrap gap-4 items-center">
                        <select 
                            value={filterStatus} 
                            onChange={e => setFilterStatus(e.target.value)} 
                            className="bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white text-[10px] font-black uppercase rounded-2xl px-5 py-3 outline-none hover:border-blue-500/40 transition-all cursor-pointer shadow-xl appearance-none"
                        >
                            <option value="">STATUS: ALL</option>
                            <option value="paid">PAID</option>
                            <option value="draft">DRAFT</option>
                            <option value="overdue">OVERDUE</option>
                        </select>
                        <div className="relative group min-w-[200px]">
                            <FiSearch className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-blue-500 transition-colors" size={14} />
                            <input 
                                type="text" 
                                value={filterTenant} 
                                onChange={e => setFilterTenant(e.target.value)} 
                                className="bg-white/5 border border-slate-200 dark:border-slate-800 rounded-2xl pl-12 pr-6 py-3 text-[11px] font-black text-slate-800 dark:text-white outline-none focus:border-blue-500/50 focus:bg-blue-500/10 transition-all w-full placeholder:text-slate-700" 
                                placeholder="RESTORAN ARA..." 
                            />
                        </div>
                        <div className="flex items-center gap-2 bg-slate-900/60 rounded-2xl p-1 border border-slate-200 dark:border-slate-800">
                            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="bg-transparent border-none text-slate-800 dark:text-white text-[10px] font-black px-3 py-2 outline-none cursor-pointer" />
                            <span className="text-slate-700 font-bold px-1">/</span>
                            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="bg-transparent border-none text-slate-800 dark:text-white text-[10px] font-black px-3 py-2 outline-none cursor-pointer" />
                        </div>
                    </div>
                }
            >
                <div className="overflow-x-auto -mx-6 custom-scrollbar mt-6">
                    <table className="w-full text-left border-separate border-spacing-y-2 px-6">
                        <thead>
                            <tr className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] opacity-60">
                                <th className="px-6 py-4">{t('accounting.colInvoice')}</th>
                                <th className="px-6 py-4">{t('accounting.colTenant')}</th>
                                <th className="px-6 py-4 text-right">{t('accounting.colAmount')}</th>
                                <th className="px-6 py-4 text-center">{t('accounting.colStatus')}</th>
                                <th className="px-6 py-4 text-right">{t('accounting.colCreated')}</th>
                                <th className="px-6 py-4 text-right">{t('posInvoices.colActions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices && invoices.length > 0 ? invoices.map((inv: any) => (
                                <tr key={inv.id} className="group hover:bg-white/[0.02] transition-colors">
                                    <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent first:rounded-l-[24px] last:rounded-r-[24px] border-y border-slate-200 dark:border-slate-800 first:border-l last:border-r">
                                        <button onClick={() => openInvoice(inv.invoice_number)} className="text-blue-400 hover:text-slate-800 dark:text-white transition-all font-black uppercase tracking-tighter italic">
                                            <FiFileText className="inline mr-2 opacity-40" /> #{inv.invoice_number}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-slate-200 dark:border-slate-800 border-l-0 font-black text-slate-800 dark:text-white text-xs uppercase tracking-tight truncate max-w-[200px]">{inv.tenant_name || inv.tenant_id}</td>
                                    <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-slate-200 dark:border-slate-800 border-l-0 text-right font-black text-slate-800 dark:text-white tabular-nums italic">{currency}{Number(inv.total || 0).toLocaleString()}</td>
                                    <td className="px-6 py-5 bg-white/[0.02] group-hover:bg-transparent border-y border-slate-200 dark:border-slate-800 border-l-0 text-center">
                                        <Badge color={inv.status === 'paid' ? 'emerald' : inv.status === 'overdue' ? 'rose' : 'amber'}>
                                            {(inv.status || 'draft').toUpperCase()}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-5 bg-white/[0.02] group-hover:bg-transparent border-y border-slate-200 dark:border-slate-800 border-l-0 text-right">
                                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest tabular-nums">{new Date(inv.created_at).toLocaleDateString('tr-TR')}</span>
                                    </td>
                                    <td className="px-6 py-5 bg-white/[0.02] group-hover:bg-transparent border-y border-slate-200 dark:border-slate-800 border-l-0 rounded-r-[24px] text-right border-r">
                                        <button 
                                            onClick={() => openInvoice(inv.invoice_number)}
                                            className="p-2.5 text-slate-500 dark:text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all active:scale-90 border border-transparent hover:border-blue-500/20 shadow-sm"
                                        >
                                            <FiDownload size={14} />
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6}>
                                        <EmptyState icon={<FiFileText />} message={loading ? t('posInvoices.loading') : t('posInvoices.noData')} />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </SectionCard>

            {/* ═══ FATURA DETAY MODAL ═══ */}
            <AnimatePresence>
                {(invoiceModal || invoiceLoading) && (
                    <Modal 
                        show={!!(invoiceModal || invoiceLoading)} 
                        onClose={() => setInvoiceModal(null)} 
                        title={t('accounting.invoiceDetailTitle')}
                        maxWidth="max-w-4xl"
                    >
                        {invoiceLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
                                <span className="text-xs font-black text-slate-500 uppercase tracking-widest animate-pulse">Retrieving Document...</span>
                            </div>
                        ) : invoiceModal ? (
                            <div className="space-y-10">
                                {/* Header Section */}
                                <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                                    <div className="space-y-4">
                                        <div className="p-4 bg-gradient-to-br from-blue-600 to-indigo-700 w-fit rounded-3xl shadow-sm relative overflow-hidden">
                                            <FiZap size={32} className="text-slate-800 dark:text-white drop-shadow-lg" />
                                        </div>
                                        <div>
                                            <h4 className="text-3xl font-black text-slate-800 dark:text-white italic tracking-tighter">NEXTPOS <span className="text-blue-500">PRO</span></h4>
                                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">Financial Services Ltd.</p>
                                        </div>
                                    </div>
                                    <div className="text-right space-y-4">
                                        <div className="p-6 bg-white/[0.03] border border-slate-200 dark:border-slate-800 rounded-2xl inline-block">
                                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">{t('accounting.colInvoice')}</div>
                                            <div className="text-2xl font-black text-slate-800 dark:text-white tabular-nums tracking-tighter">#{invoiceModal.invoice_number}</div>
                                            <div className={`mt-2 px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] inline-block ${statusColor[invoiceModal.status] || statusColor.pending}`}>
                                                {(invoiceModal.status || 'draft').toUpperCase()}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Issued On</span>
                                            <span className="text-sm font-black text-slate-600 dark:text-slate-500 dark:text-slate-400 italic">{invoiceModal.created_at ? new Date(invoiceModal.created_at).toLocaleString('tr-TR') : ''}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Billing info grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4 group hover:border-blue-500/20 transition-all">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl"><FiUsers size={14}/></div>
                                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">{t('accounting.invoiceTo')}</span>
                                        </div>
                                        <div className="text-xl font-black text-slate-800 dark:text-white uppercase italic tracking-tight leading-tighter">{invoiceModal.company_title || invoiceModal.tenant_name || '—'}</div>
                                        <div className="space-y-1 text-slate-500 dark:text-slate-400 font-bold text-[11px] leading-relaxed">
                                            {invoiceModal.tenant_address && <p>{invoiceModal.tenant_address}</p>}
                                            {invoiceModal.authorized_person && <p className="text-slate-500 uppercase tracking-widest mt-2">{t('accounting.fieldAuthorized')}: {invoiceModal.authorized_person}</p>}
                                        </div>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4 group hover:border-white/20 transition-all">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl"><FiLayers size={14}/></div>
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{t('accounting.fieldContact')}</span>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1">Email</span>
                                                    <span className="text-[11px] font-black text-slate-600 dark:text-slate-500 dark:text-slate-400 truncate block underline decoration-white/10">{invoiceModal.contact_email || '—'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1">Tax No</span>
                                                    <span className="text-[11px] font-black text-slate-600 dark:text-slate-500 dark:text-slate-400 block italic">{invoiceModal.tax_number || '—'}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1">Address Detail</span>
                                                <span className="text-[11px] text-slate-500 font-bold">{invoiceModal.tax_office || ''} Internal Node</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Items Table */}
                                <div className="overflow-hidden border border-slate-200 dark:border-slate-800 rounded-2xl bg-white/[0.01]">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-white/5 text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">
                                                <th className="px-8 py-5">{t('accounting.invoiceItem')}</th>
                                                <th className="px-8 py-5 text-center">{t('accounting.invoiceQty')}</th>
                                                <th className="px-8 py-5 text-right">{t('accounting.invoiceUnitPrice')}</th>
                                                <th className="px-8 py-5 text-right">{t('accounting.colAmount')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/[0.03]">
                                            {(Array.isArray(invoiceModal.items) ? invoiceModal.items : []).map((item: any, idx: number) => (
                                                <tr key={idx} className="group hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-8 py-5 text-sm font-black text-slate-800 dark:text-white italic">{item.description}</td>
                                                    <td className="px-8 py-5 text-center text-xs font-bold text-slate-500">{item.quantity}</td>
                                                    <td className="px-8 py-5 text-right text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">{currency}{Number(item.unit_price || 0).toLocaleString()}</td>
                                                    <td className="px-8 py-5 text-right text-base font-black text-slate-800 dark:text-white tabular-nums group-hover:text-blue-400 transition-colors">{currency}{Number(item.total || 0).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Totals & Action */}
                                <div className="flex flex-col md:flex-row justify-between items-end gap-8 pt-6 border-t border-slate-200 dark:border-slate-800">
                                    <div className="flex gap-4">
                                        <button 
                                            onClick={() => {
                                                const w = window.open('', '_blank');
                                                if (w) { w.document.write(buildInvoiceHtml(invoiceModal, currency)); w.document.close(); }
                                            }}
                                            className="px-8 py-4 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center gap-3 transition-all active:scale-95 text-[10px] font-black uppercase tracking-[0.2em] text-slate-800 dark:text-white border border-slate-200 dark:border-slate-800 shadow-sm"
                                        >
                                            <FiPrinter size={16} /> {t('accounting.print') || 'Print / PDF'}
                                        </button>
                                    </div>
                                    <div className="w-full md:w-80 space-y-3 bg-gradient-to-br from-white/[0.02] to-transparent p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                        <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                                            <span>Subtotal</span>
                                            <span className="tabular-nums">{currency}{Number(invoiceModal.subtotal || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                                            <span>Tax Support ({invoiceModal.tax_rate || 19}%)</span>
                                            <span className="tabular-nums">{currency}{Number(invoiceModal.tax_amount || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="pt-4 mt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                                            <span className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-[0.2em]">Total</span>
                                            <span className="text-3xl font-black text-slate-800 dark:text-white tabular-nums italic tracking-tighter drop-shadow-sm">{currency}{Number(invoiceModal.total || 0).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </Modal>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

function buildInvoiceHtml(inv: any, currency: string): string {
    const items = Array.isArray(inv.items) ? inv.items : [];
    const rows = items.map((it: any) => `
        <tr>
            <td style="padding:15px;border-bottom:1px solid #f0f0f0;font-weight:bold">${it.description || ''}</td>
            <td style="padding:15px;border-bottom:1px solid #f0f0f0;text-align:center">${it.quantity}</td>
            <td style="padding:15px;border-bottom:1px solid #f0f0f0;text-align:right">${currency}${Number(it.unit_price || 0).toLocaleString()}</td>
            <td style="padding:15px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:bold">${currency}${Number(it.total || 0).toLocaleString()}</td>
        </tr>
    `).join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${inv.invoice_number}</title>
    <style>
        body{font-family:'Inter',system-ui,sans-serif;max-width:850px;margin:50px auto;color:#1e293b;padding:40px;border:1px solid #f1f5f9;border-radius:16px;box-shadow:0 10px 50px rgba(0,0,0,0.05)}
        .header{display:flex;justify-content:space-between;margin-bottom:50px}
        .logo{font-size:28px;font-weight:900;letter-spacing:-1px;color:#0f172a;font-style:italic}
        .logo span{color:#2563eb}
        .inv-details{text-align:right}
        .inv-details h1{font-size:40px;font-weight:900;margin:0;color:#0f172a;letter-spacing:-2px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:50px}
        .box{background:#f8fafc;padding:25px;border-radius:20px}
        .box-label{font-size:10px;font-weight:900;text-transform:uppercase;color:#94a3b8;letter-spacing:2px;margin-bottom:10px}
        table{width:100%;border-collapse:collapse;margin:40px 0}
        th{background:#f8fafc;padding:15px;text-align:left;font-size:11px;text-transform:uppercase;font-weight:900;color:#64748b}
        .totals{margin-left:auto;width:300px;background:#0f172a;color:#fff;padding:30px;border-radius:24px}
        .total-row{display:flex;justify-content:space-between;margin-bottom:10px;font-size:12px;opacity:0.8}
        .grand-total{display:flex;justify-content:space-between;margin-top:20px;border-top:1px solid rgba(255,255,255,0.1);padding-top:20px;font-size:24px;font-weight:900}
        @media print{body{margin:0;border:none;box-shadow:none}}
    </style></head><body>
    <div class="header">
        <div class="logo">NEXTPOS <span>PRO</span></div>
        <div class="inv-details">
            <h1>INVOICE</h1>
            <div style="font-weight:bold;font-size:16px">#${inv.invoice_number}</div>
            <div style="color:#64748b;font-size:12px;margin-top:5px">${inv.created_at ? new Date(inv.created_at).toLocaleDateString('tr-TR') : ''}</div>
        </div>
    </div>
    <div class="grid">
        <div class="box">
            <div class="box-label">Billed To</div>
            <div style="font-size:18px;font-weight:900">${inv.company_title || inv.tenant_name || '—'}</div>
            <div style="font-size:13px;color:#64748b;margin-top:8px">${inv.tenant_address || ''}</div>
        </div>
        <div class="box">
            <div class="box-label">Account Details</div>
            <div style="font-size:14px;font-weight:bold;display:grid;gap:5px">
                <div style="display:flex;justify-content:space-between"><span style="color:#94a3b8">Authorized</span> <span>${inv.authorized_person || '—'}</span></div>
                <div style="display:flex;justify-content:space-between"><span style="color:#94a3b8">Tax ID</span> <span>${inv.tax_number || '—'}</span></div>
                <div style="display:flex;justify-content:space-between"><span style="color:#94a3b8">Contact</span> <span>${inv.contact_email || '—'}</span></div>
            </div>
        </div>
    </div>
    <table><thead><tr><th>Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals">
        <div class="total-row"><span>Subtotal</span> <span>${currency}${Number(inv.subtotal || 0).toLocaleString()}</span></div>
        <div class="total-row"><span>Tax (${inv.tax_rate || 19}%)</span> <span>${currency}${Number(inv.tax_amount || 0).toLocaleString()}</span></div>
        <div class="grand-total"><span>TOTAL</span> <span>${currency}${Number(inv.total || 0).toLocaleString()}</span></div>
    </div>
    <script>window.onload=function(){window.print()}</script>
    </body></html>`;
}
