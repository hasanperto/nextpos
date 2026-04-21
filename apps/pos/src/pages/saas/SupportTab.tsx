import React, { useEffect, useState } from 'react';
import { 
    FiMessageSquare, FiSend, FiClock, FiCheckCircle, FiBook, FiPlus, 
    FiChevronRight, FiSearch, FiLayers, FiMessageCircle, FiTrash2, FiEdit3, FiZap 
} from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { StatCard, SectionCard, EmptyState, Modal, InputGroup, SelectGroup } from './SaaSShared';
import { motion, AnimatePresence } from 'framer-motion';

export const SupportTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const {
        tickets, ticketMessages, supportStats, knowledgeBase, selectedTicket,
        fetchTickets, fetchSupportStats, fetchTicketDetail, sendTicketMessage,
        updateTicket, fetchKnowledgeBase, addKBArticle
    } = useSaaSStore();

    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [newMessage, setNewMessage] = useState('');
    const [showKBModal, setShowKBModal] = useState(false);
    const [kbForm, setKbForm] = useState({ title: '', category: 'general', content: '', tags: '' });

    useEffect(() => { 
        fetchTickets(); 
        fetchSupportStats(); 
        fetchKnowledgeBase(); 
    }, [fetchTickets, fetchSupportStats, fetchKnowledgeBase]);

    const handleSelectTicket = async (id: number) => {
        setSelectedId(id);
        await fetchTicketDetail(id);
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedId) return;
        await sendTicketMessage(selectedId, newMessage);
        setNewMessage('');
    };

    const handleCreateKB = async (e: React.FormEvent) => {
        e.preventDefault();
        const success = await addKBArticle(kbForm);
        if (success) { 
            setShowKBModal(false); 
            setKbForm({ title: '', category: 'general', content: '', tags: '' }); 
        }
    };

    const ss = supportStats;

    const containerVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { 
            opacity: 1, 
            y: 0,
            transition: { duration: 0.5, staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, scale: 0.98 },
        visible: { opacity: 1, scale: 1 }
    };

    return (
        <motion.div 
            className="space-y-8 pb-10"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
        >
            {/* 1. Support Health Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-4 sm:px-0">
                <StatCard 
                    label={t('support.stat.open')} 
                    value={ss?.open || 0} 
                    icon={<FiMessageSquare />} 
                    color="blue" 
                    trendStatus="stable"
                    trend="LIVE"
                />
                <StatCard 
                    label={t('support.stat.progress')} 
                    value={ss?.inProgress || 0} 
                    icon={<FiClock />} 
                    color="amber" 
                    sub="Active Resolution"
                />
                <StatCard 
                    label={t('support.stat.closed')} 
                    value={ss?.closed || 0} 
                    icon={<FiCheckCircle />} 
                    color="emerald" 
                    trendStatus="up"
                    trend="+18%"
                />
                <StatCard 
                    label={t('support.stat.avgMin')} 
                    value={`${ss?.avgResponseMinutes || 0}m`} 
                    icon={<FiZap />} 
                    color="purple" 
                    sub="Response Velocity"
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 px-4 sm:px-0">
                {/* 2. Ticket Terminal */}
                <div className="xl:col-span-4 h-fit">
                    <SectionCard 
                        title={t('support.listTitle')} 
                        icon={<FiMessageCircle className="text-amber-400" />}
                        action={
                            <div className="relative group">
                                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={12} />
                                <input 
                                    type="text" 
                                    className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-[10px] text-white outline-none focus:border-amber-500/50 transition-all w-28" 
                                    placeholder="Ticket..."
                                />
                            </div>
                        }
                    >
                        <div className="space-y-3 max-h-[550px] overflow-y-auto pr-2 custom-scrollbar">
                            <AnimatePresence mode="popLayout">
                                {tickets.length > 0 ? tickets.map((ticket: any) => (
                                    <motion.button 
                                        key={ticket.id} 
                                        layout
                                        onClick={() => handleSelectTicket(ticket.id)}
                                        className={`w-full text-left p-4 rounded-3xl transition-all border group relative overflow-hidden ${
                                            selectedId === ticket.id 
                                            ? 'bg-blue-600/10 border-blue-500/40 shadow-xl shadow-blue-500/5' 
                                            : 'bg-slate-900/40 border-white/5 hover:bg-slate-800/60'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-black text-white tracking-tight truncate pr-4">{ticket.subject}</div>
                                                <div className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest flex items-center gap-1">
                                                    <FiLayers size={10} /> {ticket.tenant_name || 'Global Ops'}
                                                </div>
                                            </div>
                                            <FiChevronRight className={`mt-1 transition-transform ${selectedId === ticket.id ? 'text-blue-400 translate-x-1' : 'text-slate-600 group-hover:text-slate-400'}`} size={16} />
                                        </div>
                                        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-white/5">
                                            <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-xl border-2 ${
                                                ticket.status === 'open' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-lg shadow-blue-500/10' :
                                                ticket.status === 'in_progress' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-lg shadow-amber-500/10' :
                                                'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                            } tracking-widest font-mono`}>
                                                {ticket.status.toUpperCase()}
                                            </span>
                                            <span className={`text-[10px] font-black uppercase tracking-widest italic ${
                                                ticket.priority === 'critical' || ticket.priority === 'high' ? 'text-rose-500 animate-pulse' : 'text-slate-600'
                                            }`}>
                                                {ticket.priority}
                                            </span>
                                        </div>
                                    </motion.button>
                                )) : <EmptyState icon={<FiMessageSquare />} message={t('support.emptyList')} />}
                            </AnimatePresence>
                        </div>
                    </SectionCard>
                </div>

                {/* 3. Correspondence Engine */}
                <div className="xl:col-span-8">
                    <SectionCard 
                        title={selectedTicket ? `TKT-${selectedTicket.id.toString().padStart(5, '0')}: ${selectedTicket.subject}` : t('support.detailPlaceholder')} 
                        icon={<FiSend className="text-blue-400" />}
                        action={selectedTicket && (
                            <div className="flex items-center gap-4">
                                <select 
                                    value={selectedTicket.status} 
                                    onChange={e => { updateTicket(selectedTicket.id, e.target.value); }}
                                    className="bg-slate-900 border border-white/10 rounded-xl text-[10px] font-black px-4 py-2 outline-none text-white uppercase tracking-widest hover:border-blue-500/30 transition-all cursor-pointer"
                                >
                                    <option value="open">{t('support.status.open')}</option>
                                    <option value="in_progress">{t('support.status.in_progress')}</option>
                                    <option value="waiting">{t('support.status.waiting')}</option>
                                    <option value="closed">{t('support.status.closed')}</option>
                                </select>
                            </div>
                        )}
                    >
                        {selectedTicket ? (
                            <div className="flex flex-col h-[550px]">
                                {/* Thread container */}
                                <div className="flex-1 space-y-6 overflow-y-auto mb-6 pr-4 custom-scrollbar">
                                    {/* Original message - Client */}
                                    <motion.div 
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="max-w-[85%] group"
                                    >
                                        <div className="flex items-center gap-3 mb-2 px-1">
                                            <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-black text-slate-500">OP</div>
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('support.customer')}</span>
                                            <span className="text-[9px] text-slate-600 font-bold">{new Date(selectedTicket.created_at).toLocaleString()}</span>
                                        </div>
                                        <div className="p-5 bg-white/[0.03] border border-white/5 rounded-tr-[32px] rounded-bl-[32px] rounded-br-[32px] shadow-xl group-hover:border-white/10 transition-all">
                                            <p className="text-sm text-slate-300 leading-relaxed font-bold italic opacity-90">{selectedTicket.message}</p>
                                        </div>
                                    </motion.div>

                                    <AnimatePresence mode="popLayout">
                                        {ticketMessages.map((m: any) => (
                                            <motion.div 
                                                key={m.id}
                                                initial={{ opacity: 0, x: m.sender_type === 'admin' ? 20 : -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                className={`max-w-[85%] ${m.sender_type === 'admin' ? 'ml-auto' : ''} group`}
                                            >
                                                <div className={`flex items-center gap-3 mb-2 px-1 ${m.sender_type === 'admin' ? 'flex-row-reverse' : ''}`}>
                                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${m.sender_type === 'admin' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-white/5 text-slate-500'}`}>
                                                        {m.sender_type === 'admin' ? 'AD' : 'EX'}
                                                    </div>
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{m.sender_name}</span>
                                                    <span className="text-[9px] text-slate-600 font-bold">{new Date(m.created_at).toLocaleString()}</span>
                                                </div>
                                                <div className={`p-5 rounded-[32px] shadow-xl border transition-all ${
                                                    m.sender_type === 'admin' 
                                                    ? 'bg-blue-600/10 border-blue-500/20 text-slate-200 rounded-tr-[8px] group-hover:bg-blue-600/15' 
                                                    : 'bg-white/[0.03] border-white/5 text-slate-300 rounded-tl-[8px] group-hover:bg-white/[0.05]'
                                                }`}>
                                                    <p className="text-sm leading-relaxed">{m.message}</p>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>

                                {/* Rich Input */}
                                <div className="border-t border-white/5 pt-6 relative">
                                    <div className="absolute -top-3 right-8 flex gap-2">
                                        <button type="button" title="Bilgi bankası" aria-label="Bilgi bankası" className="p-2 bg-slate-900/80 border border-white/10 rounded-xl text-slate-500 hover:text-white transition-colors backdrop-blur-md shadow-2xl"><FiBook size={14} /></button>
                                        <button type="button" title="Geçmiş" aria-label="Geçmiş" className="p-2 bg-slate-900/80 border border-white/10 rounded-xl text-slate-500 hover:text-white transition-colors backdrop-blur-md shadow-2xl"><FiClock size={14} /></button>
                                    </div>
                                    <div className="flex gap-4">
                                        <input 
                                            type="text" 
                                            value={newMessage} 
                                            onChange={e => setNewMessage(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                            placeholder={t('support.replyPlaceholder')} 
                                            className="flex-1 bg-white/[0.03] border border-white/10 rounded-[28px] px-8 py-5 text-sm outline-none text-white focus:border-blue-500/30 transition-all font-bold placeholder:text-slate-600 shadow-inner" 
                                        />
                                        <button 
                                            onClick={handleSendMessage} 
                                            className="bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 w-16 h-16 rounded-[28px] text-white flex items-center justify-center shadow-2xl shadow-blue-900/40 hover:scale-105 active:scale-95 transition-all group border border-white/10"
                                        >
                                            <FiSend size={24} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : <EmptyState icon={<FiMessageSquare />} message={t('support.selectPrompt')} />}
                    </SectionCard>
                </div>
            </div>

            {/* 4. Global Knowledge Hub */}
            <motion.div variants={itemVariants} className="px-4 sm:px-0">
                <SectionCard 
                    title={t('support.kbTitle')} 
                    icon={<FiBook className="text-cyan-400" />}
                    action={
                        <button 
                            onClick={() => setShowKBModal(true)} 
                            className="text-[10px] bg-cyan-700 hover:bg-cyan-600 text-white px-6 py-2.5 rounded-[18px] font-black flex items-center gap-2 shadow-lg shadow-cyan-900/20 active:scale-95 transition-all uppercase tracking-widest"
                        >
                            <FiPlus size={14} /> {t('support.kbNew')}
                        </button>
                    }
                >
                    {knowledgeBase.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {knowledgeBase.map((kb: any) => (
                                <motion.div 
                                    key={kb.id} 
                                    whileHover={{ y: -5 }}
                                    className="p-6 bg-slate-900/40 backdrop-blur-xl rounded-[40px] border border-white/5 hover:border-cyan-500/30 transition-all group relative overflow-hidden flex flex-col"
                                >
                                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity rotate-12 scale-150">
                                        <FiBook size={60} />
                                    </div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <span className="px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-[8px] font-black text-cyan-400 uppercase tracking-[0.2em]">{kb.category}</span>
                                        <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse" />
                                    </div>
                                    <h4 className="font-black text-base text-white tracking-tight mb-2 group-hover:text-cyan-400 transition-colors">{kb.title}</h4>
                                    <p className="text-[11px] text-slate-400 font-bold leading-relaxed line-clamp-3 mb-6">{kb.content}</p>
                                    
                                    <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{kb.view_count} Interactions</span>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <FiEdit3 size={12} className="text-slate-500 hover:text-white cursor-pointer" />
                                            <FiTrash2 size={12} className="text-slate-500 hover:text-rose-400 cursor-pointer" />
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    ) : <EmptyState icon={<FiBook />} message={t('support.kbEmpty')} />}
                </SectionCard>
            </motion.div>

            {/* KB Production Modal */}
            <AnimatePresence>
                {showKBModal && (
                    <Modal show={showKBModal} onClose={() => setShowKBModal(false)} title={t('support.kbModalTitle')} maxWidth="max-w-xl">
                        <form onSubmit={handleCreateKB} className="space-y-6">
                            <InputGroup label={t('support.kbTitleLabel')} value={kbForm.title} onChange={v => setKbForm({ ...kbForm, title: v })} placeholder={t('support.kbTitlePh')} />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <SelectGroup label={t('support.kbCategory')} value={kbForm.category} onChange={v => setKbForm({ ...kbForm, category: v })} options={[
                                    { label: t('support.kbCat.general'), value: 'general' }, { label: t('support.kbCat.setup'), value: 'setup' }, 
                                    { label: t('support.kbCat.billing'), value: 'billing' }, { label: t('support.kbCat.technical'), value: 'technical' }
                                ]} />
                                <InputGroup label={t('support.kbTags')} value={kbForm.tags} onChange={v => setKbForm({ ...kbForm, tags: v })} placeholder="e.g., pos, backup" />
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 block">{t('support.kbContent')}</label>
                                <textarea 
                                    value={kbForm.content} 
                                    onChange={e => setKbForm({ ...kbForm, content: e.target.value })} 
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none h-40 font-bold text-sm leading-relaxed focus:border-cyan-500/50 transition-all shadow-inner" 
                                    placeholder="Draft your solution here..."
                                />
                            </div>
                            <button type="submit" className="w-full bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-700 py-4 rounded-2xl text-white font-black shadow-xl shadow-cyan-900/40 active:scale-95 transition-all text-xs tracking-[0.2em] uppercase border border-white/10">{t('support.kbPublish')}</button>
                        </form>
                    </Modal>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
