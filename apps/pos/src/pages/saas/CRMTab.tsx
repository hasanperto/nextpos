import React, { useEffect, useState } from 'react';
import { 
    FiFileText, FiPhone, FiMail, FiMessageCircle, FiPlus, FiCalendar, 
    FiUserCheck, FiAlertTriangle, FiTrendingUp, FiTrash2, FiEdit3, FiSearch, FiLayers, FiClock
} from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { SectionCard, EmptyState, Modal, InputGroup, SelectGroup, StatCard } from './SaaSShared';
import { motion, AnimatePresence } from 'framer-motion';

export const CRMTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const { 
        customerNotes, contracts, tenants, admin, settings,
        fetchCustomerNotes, addCustomerNote, fetchContracts, addContract 
    } = useSaaSStore();
    const currency = settings?.currency || '€';
    const isReseller = admin?.role === 'reseller';
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [showContractModal, setShowContractModal] = useState(false);
    const [note, setNote] = useState({ tenant_id: '', note_type: 'internal', subject: '', content: '' });
    const [contract, setContract] = useState({ tenant_id: '', start_date: '', end_date: '', monthly_amount: 50, notes: '' });
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => { 
        fetchCustomerNotes(); 
        fetchContracts(); 
    }, [fetchCustomerNotes, fetchContracts]);

    const handleCreateNote = async (e: React.FormEvent) => {
        e.preventDefault();
        const success = await addCustomerNote(note);
        if (success) { 
            setShowNoteModal(false); 
            setNote({ tenant_id: '', note_type: 'internal', subject: '', content: '' }); 
        }
    };

    const handleCreateContract = async (e: React.FormEvent) => {
        e.preventDefault();
        const success = await addContract(contract);
        if (success) { 
            setShowContractModal(false); 
            setContract({ tenant_id: '', start_date: '', end_date: '', monthly_amount: 50, notes: '' }); 
        }
    };

    const noteIcons: any = { 
        call: <FiPhone />, 
        email: <FiMail />, 
        meeting: <FiCalendar />, 
        internal: <FiMessageCircle />, 
        complaint: <FiAlertTriangle />, 
        feedback: <FiTrendingUp /> 
    };

    const noteColors: any = { 
        call: 'bg-blue-500/10 text-blue-400', 
        email: 'bg-emerald-500/10 text-emerald-400', 
        meeting: 'bg-amber-500/10 text-amber-400', 
        internal: 'bg-slate-500/10 text-slate-400', 
        complaint: 'bg-rose-500/10 text-rose-400', 
        feedback: 'bg-purple-500/10 text-purple-400' 
    };

    const filteredNotes = customerNotes.filter((n: any) => 
        n.subject?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        n.tenant_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.content?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const containerVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { 
            opacity: 1, 
            y: 0,
            transition: { duration: 0.5, staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, scale: 0.95 },
        visible: { opacity: 1, scale: 1 }
    };

    return (
        <motion.div 
            className="space-y-8 pb-10"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
        >
            {/* 1. Retention Insights Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard 
                    label={t('crm.relationshipHealth')} 
                    value={isReseller ? "EXCELLENT" : "STABLE"} 
                    icon={<FiUserCheck className="text-emerald-400" />} 
                    color="emerald" 
                    trendStatus="up"
                    trend="+12%"
                />
                <StatCard 
                    label={t('crm.pendingNotes')} 
                    value={customerNotes.filter((n: any) => n.note_type === 'complaint').length} 
                    icon={<FiAlertTriangle />} 
                    color="rose" 
                    sub={isReseller ? "Requires Portfolio Scan" : "System-wide Alerts"}
                />
                <StatCard 
                    label={isReseller ? "COMMISSION RATE" : t('crm.avgResponse')} 
                    value={isReseller ? `${admin?.commissionRate || 0}%` : "1.8h"} 
                    icon={isReseller ? <FiTrendingUp /> : <FiClock />} 
                    color="indigo" 
                />
                <StatCard 
                    label={t('crm.churnRisk')} 
                    value="0%" 
                    icon={<FiTrendingUp className="rotate-45" />} 
                    color="blue" 
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 2. Customer Interaction Timeline */}
                <SectionCard 
                    title={t('crm.notesTitle')} 
                    icon={<FiMessageCircle className="text-purple-400" />}
                    action={
                        <div className="flex items-center gap-4">
                            <div className="relative hidden sm:block">
                                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={12} />
                                <input 
                                    type="text" 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-1.5 text-[10px] text-white outline-none focus:border-purple-500/50 transition-all w-32"
                                    placeholder={t('crm.searchPh')}
                                />
                            </div>
                            <button 
                                type="button" 
                                onClick={() => setShowNoteModal(true)} 
                                className="text-[10px] bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl font-black flex items-center gap-2 shadow-lg shadow-purple-900/20 active:scale-95 transition-all uppercase tracking-widest"
                            >
                                <FiPlus size={12} /> {t('crm.newNoteShort')}
                            </button>
                        </div>
                    }
                >
                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                        <AnimatePresence mode="popLayout">
                            {filteredNotes.length > 0 ? (
                                filteredNotes.map((noteRow: any) => (
                                    <motion.div 
                                        key={noteRow.id}
                                        layout
                                        variants={itemVariants}
                                        className="p-5 bg-slate-900/40 backdrop-blur-xl rounded-[32px] hover:border-purple-500/30 transition-all border border-white/5 group relative overflow-hidden"
                                    >
                                        <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity rotate-12">
                                            {noteIcons[noteRow.note_type] || <FiMessageCircle size={100} />}
                                        </div>
                                        <div className="flex items-start gap-4">
                                            <div className={`p-3 rounded-2xl ${noteColors[noteRow.note_type] || 'bg-slate-500/10 text-slate-400'} border border-white/5 group-hover:scale-110 transition-transform`}>
                                                {noteIcons[noteRow.note_type] || <FiMessageCircle size={18} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="font-black text-white text-sm tracking-tight truncate pr-4">{noteRow.subject || noteRow.note_type.toUpperCase()}</span>
                                                    <span className="text-[10px] text-slate-500 font-bold whitespace-nowrap">{new Date(noteRow.created_at).toLocaleDateString()}</span>
                                                </div>
                                                <div className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-1">
                                                    <FiLayers size={10} /> {noteRow.tenant_name}
                                                </div>
                                                <p className="text-[11px] text-slate-400 mt-3 leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all">{noteRow.content}</p>
                                                
                                                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 cursor-help hover:text-white transition-colors">
                                                            <FiEdit3 size={12} />
                                                        </div>
                                                        <div className="w-6 h-6 rounded-lg bg-red-500/5 flex items-center justify-center text-slate-500 hover:text-red-400 cursor-pointer transition-colors">
                                                            <FiTrash2 size={12} />
                                                        </div>
                                                    </div>
                                                    <span className="text-[9px] text-slate-600 font-bold italic uppercase tracking-tighter">Recorded by Admin</span>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))
                            ) : <EmptyState icon={<FiMessageCircle />} message={t('crm.notesEmpty')} />}
                        </AnimatePresence>
                    </div>
                </SectionCard>

                {/* 3. Operational Contracts & SLA */}
                <SectionCard 
                    title={t('crm.contractsTitle')} 
                    icon={<FiFileText className="text-emerald-400" />}
                    action={
                        <button 
                            type="button" 
                            onClick={() => setShowContractModal(true)} 
                            className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-black flex items-center gap-2 shadow-lg shadow-emerald-900/20 active:scale-95 transition-all uppercase tracking-widest"
                        >
                            <FiPlus size={12} /> {t('crm.newContractShort')}
                        </button>
                    }
                >
                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                        <AnimatePresence mode="popLayout">
                            {contracts.length > 0 ? (
                                contracts.map((c: any) => (
                                    <motion.div 
                                        key={c.id}
                                        layout
                                        variants={itemVariants}
                                        className="p-6 bg-slate-900/40 backdrop-blur-xl rounded-[32px] hover:border-emerald-500/30 transition-all border border-white/5 group relative overflow-hidden"
                                    >
                                        <div className="flex justify-between items-start relative z-10">
                                            <div className="flex gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/10 group-hover:scale-110 transition-transform">
                                                    <FiFileText size={20} />
                                                </div>
                                                <div>
                                                    <div className="font-black text-white text-sm tracking-tight">{c.tenant_name}</div>
                                                    <div className="text-[10px] font-black text-emerald-400/80 uppercase tracking-widest mt-1 bg-emerald-400/5 px-2 py-0.5 rounded-lg border border-emerald-400/10 inline-block font-mono">#{c.id.toString().padStart(4, '0')}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-lg font-black text-white italic">{currency}{Number(c.monthly_amount || 0).toLocaleString()}<span className="text-[10px] text-slate-500 not-italic">/mo</span></div>
                                                <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg border ${c.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                                                    {c.status}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-4 mt-8 pt-4 border-t border-white/5">
                                            <div className="space-y-1">
                                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">{t('crm.startDate')}</span>
                                                <span className="text-xs font-bold text-slate-300 font-mono">{c.start_date}</span>
                                            </div>
                                            <div className="space-y-1 text-right">
                                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">{t('crm.endDate')}</span>
                                                <span className={c.end_date ? "text-xs font-bold text-slate-300 font-mono" : "text-xs font-bold text-amber-400 italic"}>{c.end_date || 'Lifetime'}</span>
                                            </div>
                                        </div>
                                        
                                        <div className="mt-4 flex bg-white/5 rounded-2xl p-1 gap-1 border border-white/5 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                                            <button type="button" className="flex-1 py-1 text-[9px] font-black uppercase text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all tracking-widest">Digital PDF</button>
                                            <button type="button" className="flex-1 py-1 text-[9px] font-black uppercase text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all tracking-widest">SLA Audit</button>
                                        </div>
                                    </motion.div>
                                ))
                            ) : <EmptyState icon={<FiFileText />} message={t('crm.contractsEmpty')} />}
                        </AnimatePresence>
                    </div>
                </SectionCard>
            </div>

            {/* Note Modal */}
            <Modal show={showNoteModal} onClose={() => setShowNoteModal(false)} title={t('crm.noteModalTitle')} maxWidth="max-w-xl">
                <form onSubmit={handleCreateNote} className="space-y-6">
                    <SelectGroup label={t('crm.restaurant')} value={note.tenant_id} onChange={v => setNote({ ...note, tenant_id: v })} options={[{ label: t('crm.selectTenant'), value: '' }, ...tenants.map((tn: any) => ({ label: tn.name, value: tn.id }))]} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <SelectGroup label={t('crm.noteType')} value={note.note_type} onChange={v => setNote({ ...note, note_type: v })} options={[
                            { label: 'Internal Note', value: 'internal' }, { label: 'Call Log', value: 'call' }, { label: 'Email Outreach', value: 'email' },
                            { label: 'Client Meeting', value: 'meeting' }, { label: 'Critical Complaint', value: 'complaint' }, { label: 'User Feedback', value: 'feedback' }
                        ]} />
                        <InputGroup label={t('crm.subject')} value={note.subject} onChange={v => setNote({ ...note, subject: v })} placeholder="e.g., Performance Review Q1" />
                    </div>
                    <div>
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 block">Interaction Context</label>
                        <textarea 
                            value={note.content} 
                            onChange={e => setNote({ ...note, content: e.target.value })} 
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none h-32 focus:border-purple-500/50 transition-all text-sm leading-relaxed" 
                            placeholder="Detail what was discussed or decided..."
                        />
                    </div>
                    <button type="submit" className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 py-4 rounded-2xl text-white font-black shadow-xl shadow-purple-900/40 active:scale-95 transition-all text-xs tracking-[0.2em] uppercase">Save Interaction</button>
                </form>
            </Modal>

            {/* Contract Modal */}
            <Modal show={showContractModal} onClose={() => setShowContractModal(false)} title={t('crm.contractModalTitle')} maxWidth="max-w-xl">
                <form onSubmit={handleCreateContract} className="space-y-6">
                    <SelectGroup label={t('crm.restaurant')} value={contract.tenant_id} onChange={v => setContract({ ...contract, tenant_id: v })} options={[{ label: t('crm.selectTenant'), value: '' }, ...tenants.map((tn: any) => ({ label: tn.name, value: tn.id }))]} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <InputGroup label={t('crm.startDate')} type="date" value={contract.start_date} onChange={v => setContract({ ...contract, start_date: v })} />
                        <InputGroup label={t('crm.endDate')} type="date" value={contract.end_date} onChange={v => setContract({ ...contract, end_date: v })} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <InputGroup label={t('crm.monthlyAmount')} type="number" value={contract.monthly_amount} onChange={v => setContract({ ...contract, monthly_amount: Number(v) })} />
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">Contract Status</label>
                            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-emerald-400 font-bold text-xs">DRAFT / PENDING SIGNATURE</div>
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 py-4 rounded-2xl text-white font-black shadow-xl shadow-emerald-900/40 active:scale-95 transition-all text-xs tracking-[0.2em] uppercase">Initialize Contract</button>
                </form>
            </Modal>
        </motion.div>
    );
};
