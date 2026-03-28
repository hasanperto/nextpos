import React, { useEffect, useState } from 'react';
import { FiMessageSquare, FiSend, FiClock, FiCheckCircle, FiBook, FiPlus, FiChevronRight } from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { StatCard, SectionCard, EmptyState, Modal, InputGroup, SelectGroup } from './SaaSShared';

export const SupportTab: React.FC = () => {
    const {
        tickets, ticketMessages, supportStats, knowledgeBase, selectedTicket,
        fetchTickets, fetchSupportStats, fetchTicketDetail, sendTicketMessage,
        updateTicket, fetchKnowledgeBase, addKBArticle
    } = useSaaSStore();

    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [newMessage, setNewMessage] = useState('');
    const [showKBModal, setShowKBModal] = useState(false);
    const [kbForm, setKbForm] = useState({ title: '', category: 'general', content: '', tags: '' });

    useEffect(() => { fetchTickets(); fetchSupportStats(); fetchKnowledgeBase(); }, []);

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
        if (success) { setShowKBModal(false); setKbForm({ title: '', category: 'general', content: '', tags: '' }); }
    };

    const ss = supportStats;

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label="Açık Talepler" value={ss?.open || 0} icon={<FiMessageSquare />} color="blue" />
                <StatCard label="İşleniyor" value={ss?.inProgress || 0} icon={<FiClock />} color="amber" />
                <StatCard label="Kapatılmış" value={ss?.closed || 0} icon={<FiCheckCircle />} color="emerald" />
                <StatCard label="Ort. Yanıt (dk)" value={ss?.avgResponseMinutes || 0} icon={<FiSend />} color="purple" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6" style={{ minHeight: 500 }}>
                {/* Ticket List */}
                <div className="col-span-1">
                    <SectionCard title="Destek Talepleri" icon={<FiMessageSquare className="text-amber-400" />}>
                        <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
                            {tickets.length > 0 ? tickets.map(t => (
                                <button key={t.id} onClick={() => handleSelectTicket(t.id)}
                                    className={`w-full text-left p-3 rounded-xl transition-all border ${
                                        selectedId === t.id ? 'bg-blue-600/10 border-blue-500/30' : 'bg-black/20 border-white/5 hover:bg-black/30'
                                    }`}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate">{t.subject}</div>
                                            <div className="text-[10px] text-slate-500 mt-0.5">{t.tenant_name || t.tenant_id}</div>
                                        </div>
                                        <FiChevronRight className="text-slate-600 mt-1" size={14} />
                                    </div>
                                    <div className="flex gap-2 mt-2">
                                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${
                                            t.status === 'open' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                            t.status === 'in_progress' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                            'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                        }`}>{t.status.replace('_', ' ')}</span>
                                        <span className={`text-[8px] font-bold uppercase ${
                                            t.priority === 'high' || t.priority === 'critical' ? 'text-red-400' : 'text-slate-500'
                                        }`}>{t.priority}</span>
                                    </div>
                                </button>
                            )) : <EmptyState icon={<FiMessageSquare />} message="Talep yok" />}
                        </div>
                    </SectionCard>
                </div>

                {/* Ticket Detail & Chat */}
                <div className="col-span-2">
                    <SectionCard title={selectedTicket ? selectedTicket.subject : 'Talep Detayı'} icon={<FiSend className="text-blue-400" />}
                        action={selectedTicket && (
                            <select value={selectedTicket.status} onChange={e => { updateTicket(selectedTicket.id, e.target.value); }}
                                className="bg-black/40 border border-white/10 rounded-lg text-[10px] px-2 py-1.5 outline-none text-white font-bold">
                                <option value="open">Açık</option>
                                <option value="in_progress">İşleniyor</option>
                                <option value="waiting">Bekliyor</option>
                                <option value="closed">Kapatıldı</option>
                            </select>
                        )}>
                        {selectedTicket ? (
                            <div className="flex flex-col" style={{ minHeight: 350 }}>
                                {/* Messages */}
                                <div className="flex-1 space-y-3 max-h-[300px] overflow-y-auto mb-4 pr-2">
                                    {/* Original message */}
                                    <div className="p-3 bg-slate-800/50 rounded-xl">
                                        <div className="text-[10px] text-slate-500 mb-1">Müşteri • {new Date(selectedTicket.created_at).toLocaleString()}</div>
                                        <p className="text-sm text-slate-300">{selectedTicket.message}</p>
                                    </div>
                                    {ticketMessages.map(m => (
                                        <div key={m.id} className={`p-3 rounded-xl ${m.sender_type === 'admin' ? 'bg-blue-600/10 border border-blue-500/20 ml-8' : 'bg-slate-800/50 mr-8'}`}>
                                            <div className="text-[10px] text-slate-500 mb-1">{m.sender_name} • {new Date(m.created_at).toLocaleString()}</div>
                                            <p className="text-sm text-slate-300">{m.message}</p>
                                        </div>
                                    ))}
                                </div>
                                {/* Reply Input */}
                                <div className="flex gap-2 border-t border-white/5 pt-4">
                                    <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                        placeholder="Yanıt yazın..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none text-white" />
                                    <button onClick={handleSendMessage} className="bg-blue-600 px-5 rounded-xl text-white font-bold hover:bg-blue-500 transition-all"><FiSend /></button>
                                </div>
                            </div>
                        ) : <EmptyState icon={<FiMessageSquare />} message="Soldan bir talep seçin" />}
                    </SectionCard>
                </div>
            </div>

            {/* Knowledge Base */}
            <SectionCard title="Bilgi Bankası" icon={<FiBook className="text-cyan-400" />}
                action={<button onClick={() => setShowKBModal(true)} className="text-xs bg-cyan-600 text-white px-3 py-2 rounded-xl font-bold flex items-center gap-1"><FiPlus size={12} /> Yeni Makale</button>}>
                {knowledgeBase.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {knowledgeBase.map((kb: any) => (
                            <div key={kb.id} className="p-4 bg-black/20 rounded-xl border border-white/5 hover:border-cyan-500/20 transition-all">
                                <h4 className="font-bold text-sm text-white">{kb.title}</h4>
                                <div className="text-[10px] text-cyan-400 mt-1">{kb.category}</div>
                                <p className="text-xs text-slate-500 mt-2 line-clamp-2">{kb.content}</p>
                                <div className="text-[9px] text-slate-600 mt-2">{kb.view_count} görüntülenme</div>
                            </div>
                        ))}
                    </div>
                ) : <EmptyState icon={<FiBook />} message="Henüz makale yok" />}
            </SectionCard>

            {/* KB Modal */}
            <Modal show={showKBModal} onClose={() => setShowKBModal(false)} title="Yeni Bilgi Bankası Makalesi" maxWidth="max-w-xl">
                <form onSubmit={handleCreateKB} className="space-y-5">
                    <InputGroup label="Başlık" value={kbForm.title} onChange={v => setKbForm({ ...kbForm, title: v })} placeholder="Yardım makalesi başlığı" />
                    <SelectGroup label="Kategori" value={kbForm.category} onChange={v => setKbForm({ ...kbForm, category: v })} options={[
                        { label: 'Genel', value: 'general' }, { label: 'Kurulum', value: 'setup' }, { label: 'Ödeme', value: 'billing' }, { label: 'Teknik', value: 'technical' }
                    ]} />
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">İçerik</label>
                        <textarea value={kbForm.content} onChange={e => setKbForm({ ...kbForm, content: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none h-32" />
                    </div>
                    <InputGroup label="Etiketler (virgülle)" value={kbForm.tags} onChange={v => setKbForm({ ...kbForm, tags: v })} placeholder="pos, kurulum, hata" />
                    <button type="submit" className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 py-4 rounded-xl text-white font-black">YAYINLA</button>
                </form>
            </Modal>
        </div>
    );
};
