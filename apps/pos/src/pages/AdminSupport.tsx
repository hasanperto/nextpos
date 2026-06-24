import React, { useEffect, useState, useCallback } from 'react';
import { 
    FiMessageSquare, FiSend, FiPlus, FiAlertCircle, FiCheckCircle, 
    FiClock, FiChevronRight, FiInfo, FiPlusCircle, FiHelpCircle, FiArrowLeft, FiUser
} from 'react-icons/fi';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import toast from 'react-hot-toast';

interface TicketMessage {
    id: number;
    ticket_id: number;
    sender_type: 'admin' | 'reseller' | 'client';
    sender_name: string;
    message: string;
    created_at: string;
}

interface SupportTicket {
    id: number;
    tenant_id: string;
    subject: string;
    message: string;
    status: 'open' | 'in_progress' | 'waiting' | 'closed';
    priority: 'low' | 'medium' | 'high';
    category: string;
    reseller_username: string | null;
    reseller_company_name: string | null;
    created_at: string;
    updated_at: string;
    messages?: TicketMessage[];
}

export const AdminSupport: React.FC = () => {
    const { token, tenantId, getAuthHeaders } = useAuthStore();
    const { settings } = usePosStore();
    const { t } = usePosLocale();
    const currency = settings?.currency || '€';

    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
    const [messages, setMessages] = useState<TicketMessage[]>([]);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // New Ticket Form
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTicket, setNewTicket] = useState({
        subject: '',
        message: '',
        priority: 'medium',
        category: 'general'
    });

    // New Message input
    const [replyText, setReplyText] = useState('');
    const [sendingReply, setSendingReply] = useState(false);

    const fetchTickets = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/admin/support/tickets', {
                headers: getAuthHeaders()
            });
            if (res.ok) {
                const data = await res.json();
                setTickets(data || []);
            } else {
                toast.error('Destek talepleri yüklenemedi');
            }
        } catch (error) {
            console.error('[ERROR] fetchTickets:', error);
            toast.error('Bağlantı hatası');
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders]);

    useEffect(() => {
        void fetchTickets();
    }, [fetchTickets]);

    const fetchTicketDetails = async (id: number) => {
        setLoadingDetail(true);
        try {
            const res = await fetch(`/api/v1/admin/support/tickets/${id}`, {
                headers: getAuthHeaders()
            });
            if (res.ok) {
                const data = await res.json();
                setSelectedTicket(data);
                setMessages(data.messages || []);
            } else {
                toast.error('Talep detayları yüklenemedi');
            }
        } catch (error) {
            console.error('[ERROR] fetchTicketDetails:', error);
            toast.error('Bağlantı hatası');
        } finally {
            setLoadingDetail(false);
        }
    };

    const handleCreateTicket = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTicket.subject.trim() || !newTicket.message.trim()) {
            toast.error('Lütfen tüm zorunlu alanları doldurun');
            return;
        }

        try {
            const res = await fetch('/api/v1/admin/support/tickets', {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newTicket)
            });

            if (res.ok) {
                toast.success('Destek talebiniz başarıyla oluşturuldu');
                setShowCreateModal(false);
                setNewTicket({ subject: '', message: '', priority: 'medium', category: 'general' });
                void fetchTickets();
            } else {
                const errData = await res.json();
                toast.error(errData.error || 'Talep oluşturulamadı');
            }
        } catch (error) {
            console.error('[ERROR] handleCreateTicket:', error);
            toast.error('Bağlantı hatası');
        }
    };

    const handleSendReply = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!replyText.trim() || !selectedTicket) return;

        setSendingReply(true);
        try {
            const res = await fetch(`/api/v1/admin/support/tickets/${selectedTicket.id}/messages`, {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: replyText })
            });

            if (res.ok) {
                setReplyText('');
                // Refresh ticket details to load new messages
                await fetchTicketDetails(selectedTicket.id);
            } else {
                toast.error('Mesaj iletilemedi');
            }
        } catch (error) {
            console.error('[ERROR] handleSendReply:', error);
            toast.error('Bağlantı hatası');
        } finally {
            setSendingReply(false);
        }
    };

    const getStatusBadge = (status: SupportTicket['status']) => {
        switch (status) {
            case 'open':
                return (
                    <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        Açık
                    </span>
                );
            case 'in_progress':
                return (
                    <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                        Yanıtlandı / İşlemde
                    </span>
                );
            case 'waiting':
                return (
                    <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        Beklemede
                    </span>
                );
            case 'closed':
                return (
                    <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-white/5 text-slate-500 border border-white/5">
                        Kapatıldı
                    </span>
                );
        }
    };

    const getPriorityColor = (priority: SupportTicket['priority']) => {
        switch (priority) {
            case 'high':
                return 'text-rose-400';
            case 'medium':
                return 'text-amber-400';
            default:
                return 'text-slate-400';
        }
    };

    return (
        <main className="flex flex-col h-full bg-[#020617] text-slate-100 font-sans relative">
            {/* Ambient Glows */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-[150px] pointer-events-none" />

            {/* Header */}
            <header className="flex h-20 shrink-0 items-center justify-between border-b border-white/5 bg-[#0f172a]/95 backdrop-blur-md px-10 shadow-sm z-10">
                <div>
                    <h2 className="text-xl font-black bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent flex items-center gap-2">
                        <FiMessageSquare className="text-emerald-500" />
                        Destek Talepleri & İletişim Merkezi
                    </h2>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-0.5">
                        Sistem & Bayi Teknik Destek Hattı
                    </p>
                </div>

                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-900/20 active:scale-95"
                >
                    <FiPlus size={14} /> Yeni Destek Talebi Aç
                </button>
            </header>

            {/* Main Area */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative min-h-0">
                {/* Left Column: Ticket List */}
                <div className={`w-full md:w-96 border-r border-white/5 flex flex-col bg-[#070b16]/40 backdrop-blur-sm shrink-0 min-h-0 ${selectedTicket ? 'hidden md:flex' : 'flex'}`}>
                    <div className="p-4 border-b border-white/5">
                        <div className="relative">
                            <FiHelpCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                            <input
                                type="text"
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-indigo-500/50"
                                placeholder="Talep konusu veya ID ile ara..."
                                disabled
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
                                <div className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-emerald-500 animate-spin" />
                                <span className="text-[10px] font-black uppercase tracking-wider">Yükleniyor...</span>
                            </div>
                        ) : tickets.length === 0 ? (
                            <div className="text-center py-20 text-slate-500">
                                <FiMessageSquare className="mx-auto mb-4 opacity-30" size={36} />
                                <p className="text-xs font-black uppercase tracking-widest">Kayıtlı destek talebi yok</p>
                                <p className="text-[9px] font-bold text-slate-600 mt-2">Yeni bir talep açarak teknik destek alabilirsiniz.</p>
                            </div>
                        ) : (
                            tickets.map(ticket => (
                                <button
                                    key={ticket.id}
                                    onClick={() => fetchTicketDetails(ticket.id)}
                                    className={`w-full text-left p-4 rounded-2xl border transition-all relative overflow-hidden ${
                                        selectedTicket?.id === ticket.id
                                            ? 'bg-indigo-600/10 border-indigo-500/30'
                                            : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
                                    }`}
                                >
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-xs font-black text-white truncate pr-2">
                                                {ticket.subject}
                                            </div>
                                            <div className="text-[8px] font-bold text-slate-500 mt-1 uppercase tracking-widest">
                                                #{ticket.id} · {new Date(ticket.created_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <div className="shrink-0">
                                            {getStatusBadge(ticket.status)}
                                        </div>
                                    </div>

                                    {/* Reseller connection info */}
                                    {ticket.reseller_company_name && (
                                        <div className="text-[8px] font-bold text-emerald-400 mt-2 bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/10 inline-block uppercase tracking-wider">
                                            Bayi: {ticket.reseller_company_name}
                                        </div>
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Right Column: Ticket Conversation details */}
                <div className={`flex-1 flex flex-col min-h-0 bg-[#070b16]/10 relative ${!selectedTicket ? 'hidden md:flex items-center justify-center p-10 text-slate-500' : 'flex'}`}>
                    {selectedTicket ? (
                        <>
                            {/* Ticket Detail Header */}
                            <div className="p-6 border-b border-white/5 bg-[#0f172a]/20 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-4">
                                    <button 
                                        onClick={() => setSelectedTicket(null)}
                                        className="md:hidden p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white"
                                    >
                                        <FiArrowLeft size={16} />
                                    </button>
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-sm font-black text-white">
                                                #{selectedTicket.id} · {selectedTicket.subject}
                                            </h3>
                                            {getStatusBadge(selectedTicket.status)}
                                        </div>
                                        
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                                            <span>Öncelik: <strong className={getPriorityColor(selectedTicket.priority)}>{selectedTicket.priority}</strong></span>
                                            <span>Kategori: <strong>{selectedTicket.category}</strong></span>
                                            <span>Oluşturma: <strong>{new Date(selectedTicket.created_at).toLocaleString()}</strong></span>
                                        </div>
                                    </div>
                                </div>

                                {/* Reseller card inside details */}
                                {selectedTicket.reseller_company_name && (
                                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-2 text-right shrink-0">
                                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Atanan Destek Bayisi</div>
                                        <div className="text-xs font-black text-emerald-400 mt-0.5">{selectedTicket.reseller_company_name}</div>
                                        {selectedTicket.reseller_username && (
                                            <div className="text-[8px] font-bold text-slate-600 mt-0.5 lowercase">@{selectedTicket.reseller_username}</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Message Thread */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar min-h-0 bg-[#020617]/20">
                                {loadingDetail ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
                                        <div className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-emerald-500 animate-spin" />
                                        <span className="text-[10px] font-black uppercase tracking-wider">Yükleniyor...</span>
                                    </div>
                                ) : (
                                    <>
                                        {/* Initial Message */}
                                        <div className="max-w-[85%]">
                                            <div className="flex items-center gap-2 mb-1.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                                <div className="w-5 h-5 rounded bg-white/5 flex items-center justify-center text-[9px] font-black text-slate-400">RA</div>
                                                <span>Restoran Yetkilisi</span>
                                                <span className="text-[8px] text-slate-600 font-bold ml-2">{new Date(selectedTicket.created_at).toLocaleString()}</span>
                                            </div>
                                            <div className="p-4 bg-white/[0.03] border border-white/5 rounded-tr-[24px] rounded-br-[24px] rounded-bl-[24px] shadow-lg">
                                                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{selectedTicket.message}</p>
                                            </div>
                                        </div>

                                        {/* Conversations */}
                                        {messages.map(msg => {
                                            const isAdminMsg = msg.sender_type === 'admin' || msg.sender_type === 'reseller';
                                            return (
                                                <div key={msg.id} className={`max-w-[85%] ${isAdminMsg ? 'ml-auto' : ''}`}>
                                                    <div className={`flex items-center gap-2 mb-1.5 text-[9px] font-black text-slate-500 uppercase tracking-widest ${isAdminMsg ? 'flex-row-reverse' : ''}`}>
                                                        <div className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-black ${
                                                            msg.sender_type === 'admin' ? 'bg-indigo-600 text-white shadow shadow-indigo-900/50' : 
                                                            msg.sender_type === 'reseller' ? 'bg-emerald-600 text-white shadow shadow-emerald-900/50' :
                                                            'bg-white/5 text-slate-400'
                                                        }`}>
                                                            {msg.sender_type === 'admin' ? 'AD' : msg.sender_type === 'reseller' ? 'BY' : 'RA'}
                                                        </div>
                                                        <span>
                                                            {msg.sender_type === 'admin' ? 'Destek Ekibi' : msg.sender_type === 'reseller' ? `Bayi (${selectedTicket.reseller_company_name || msg.sender_name})` : 'Restoran Yetkilisi'}
                                                        </span>
                                                        <span className="text-[8px] text-slate-600 font-bold ml-2 mr-2">{new Date(msg.created_at).toLocaleString()}</span>
                                                    </div>
                                                    <div className={`p-4 rounded-2xl shadow-lg border ${
                                                        isAdminMsg 
                                                            ? 'bg-indigo-600/10 border-indigo-500/20 text-indigo-100 rounded-tl-2xl rounded-bl-2xl rounded-br-2xl'
                                                            : 'bg-white/[0.03] border-white/5 text-slate-300 rounded-tr-2xl rounded-br-2xl rounded-bl-2xl'
                                                    }`}>
                                                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                            </div>

                            {/* Reply Form */}
                            {selectedTicket.status !== 'closed' ? (
                                <form onSubmit={handleSendReply} className="p-6 border-t border-white/5 bg-[#0f172a]/20 flex gap-4 shrink-0 items-center">
                                    <input
                                        type="text"
                                        value={replyText}
                                        onChange={e => setReplyText(e.target.value)}
                                        placeholder="Destek ekibine yanıt yazın..."
                                        className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-xs text-white placeholder:text-slate-500 outline-none focus:border-indigo-500/50 transition-all font-bold"
                                        disabled={sendingReply}
                                    />
                                    <button
                                        type="submit"
                                        disabled={sendingReply || !replyText.trim()}
                                        className="w-12 h-12 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-2xl flex items-center justify-center active:scale-95 transition-all shadow-lg shadow-indigo-900/30"
                                    >
                                        <FiSend size={18} />
                                    </button>
                                </form>
                            ) : (
                                <div className="p-6 border-t border-white/5 bg-white/[0.01] text-center text-[10px] font-black uppercase tracking-widest text-slate-600 shrink-0">
                                    Bu destek talebi kapatılmıştır. Gerekirse yeni bir talep açabilirsiniz.
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center">
                            <FiMessageSquare className="mx-auto mb-4 opacity-10" size={64} />
                            <p className="text-xs font-black uppercase tracking-widest">Detayları görmek için talep seçin</p>
                            <p className="text-[9px] font-bold text-slate-600 mt-2">Sol listeden bir destek talebi seçin veya yeni bir talep oluşturun.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Create Ticket Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="bg-[#0c1526] border border-white/10 w-full max-w-xl rounded-[2rem] overflow-hidden shadow-2xl relative">
                        <div className="p-6 border-b border-white/5 flex justify-between items-center">
                            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                                <FiPlusCircle className="text-emerald-400" /> Yeni Destek Talebi Oluştur
                            </h3>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-3 py-1.5 border border-white/10 rounded-xl text-slate-500 hover:text-white text-[9px] font-black uppercase tracking-wider transition-all"
                            >
                                Kapat
                            </button>
                        </div>

                        <form onSubmit={handleCreateTicket} className="p-6 space-y-5">
                            <div>
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Talep Konusu</label>
                                <input
                                    type="text"
                                    required
                                    value={newTicket.subject}
                                    onChange={e => setNewTicket({ ...newTicket, subject: e.target.value })}
                                    placeholder="Örn: Barkod okuyucu bağlantı problemi"
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white placeholder:text-slate-600 outline-none focus:border-indigo-500/50"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Kategori</label>
                                    <select
                                        value={newTicket.category}
                                        onChange={e => setNewTicket({ ...newTicket, category: e.target.value })}
                                        className="w-full bg-[#0c1526] border border-white/10 rounded-2xl px-5 py-3 text-xs text-white outline-none focus:border-indigo-500/50"
                                    >
                                        <option value="technical">Teknik / Donanım</option>
                                        <option value="billing">Muhasebe / Fatura</option>
                                        <option value="setup">Kurulum & Şema</option>
                                        <option value="general">Genel Soru / Destek</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Öncelik</label>
                                    <select
                                        value={newTicket.priority}
                                        onChange={e => setNewTicket({ ...newTicket, priority: e.target.value })}
                                        className="w-full bg-[#0c1526] border border-white/10 rounded-2xl px-5 py-3 text-xs text-white outline-none focus:border-indigo-500/50"
                                    >
                                        <option value="low">Düşük</option>
                                        <option value="medium">Orta</option>
                                        <option value="high">Yüksek (Acil)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Mesajınız / Sorunun Açıklaması</label>
                                <textarea
                                    required
                                    rows={5}
                                    value={newTicket.message}
                                    onChange={e => setNewTicket({ ...newTicket, message: e.target.value })}
                                    placeholder="Lütfen yaşadığınız problemi detaylıca açıklayın, gerekiyorsa donanım marka model bilgisini girin..."
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-xs text-white placeholder:text-slate-600 outline-none focus:border-indigo-500/50 resize-none"
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-900/30"
                            >
                                Talebi Gönder
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
};

export default AdminSupport;

