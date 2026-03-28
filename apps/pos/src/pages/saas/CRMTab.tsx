import React, { useEffect, useState } from 'react';
import { FiUsers, FiFileText, FiPhone, FiMail, FiMessageCircle, FiPlus, FiCalendar } from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { SectionCard, EmptyState, Modal, InputGroup, SelectGroup } from './SaaSShared';

export const CRMTab: React.FC = () => {
    const { customerNotes, contracts, tenants, fetchCustomerNotes, addCustomerNote, fetchContracts, addContract } = useSaaSStore();
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [showContractModal, setShowContractModal] = useState(false);
    const [note, setNote] = useState({ tenant_id: '', note_type: 'internal', subject: '', content: '' });
    const [contract, setContract] = useState({ tenant_id: '', start_date: '', end_date: '', monthly_amount: 50, notes: '' });

    useEffect(() => { fetchCustomerNotes(); fetchContracts(); }, []);

    const handleCreateNote = async (e: React.FormEvent) => {
        e.preventDefault();
        const success = await addCustomerNote(note);
        if (success) { setShowNoteModal(false); setNote({ tenant_id: '', note_type: 'internal', subject: '', content: '' }); }
    };

    const handleCreateContract = async (e: React.FormEvent) => {
        e.preventDefault();
        const success = await addContract(contract);
        if (success) { setShowContractModal(false); setContract({ tenant_id: '', start_date: '', end_date: '', monthly_amount: 50, notes: '' }); }
    };

    const noteIcons: any = { call: <FiPhone />, email: <FiMail />, meeting: <FiCalendar />, internal: <FiMessageCircle />, complaint: <FiMessageCircle />, feedback: <FiMessageCircle /> };
    const noteColors: any = { call: 'text-blue-400', email: 'text-emerald-400', meeting: 'text-amber-400', internal: 'text-slate-400', complaint: 'text-red-400', feedback: 'text-purple-400' };

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Notes */}
                <SectionCard title="İletişim Notları" icon={<FiMessageCircle className="text-purple-400" />}
                    action={<button onClick={() => setShowNoteModal(true)} className="text-xs bg-purple-600 text-white px-3 py-2 rounded-xl font-bold flex items-center gap-1"><FiPlus size={12} /> Yeni Not</button>}>
                    {customerNotes.length > 0 ? (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                            {customerNotes.map(n => (
                                <div key={n.id} className="p-4 bg-black/20 rounded-xl hover:bg-black/30 transition-all border border-white/5">
                                    <div className="flex items-start gap-3">
                                        <div className={`p-2 bg-white/5 rounded-lg ${noteColors[n.note_type] || 'text-slate-400'}`}>
                                            {noteIcons[n.note_type] || <FiMessageCircle />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start">
                                                <span className="font-bold text-sm text-white">{n.subject || n.note_type.toUpperCase()}</span>
                                                <span className="text-[9px] text-slate-500">{new Date(n.created_at).toLocaleDateString()}</span>
                                            </div>
                                            <div className="text-xs text-blue-400 mt-0.5">{n.tenant_name}</div>
                                            <p className="text-xs text-slate-400 mt-2 line-clamp-2">{n.content}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <EmptyState icon={<FiMessageCircle />} message="Henüz not yok" />}
                </SectionCard>

                {/* Contracts */}
                <SectionCard title="Sözleşmeler" icon={<FiFileText className="text-emerald-400" />}
                    action={<button onClick={() => setShowContractModal(true)} className="text-xs bg-emerald-600 text-white px-3 py-2 rounded-xl font-bold flex items-center gap-1"><FiPlus size={12} /> Yeni Sözleşme</button>}>
                    {contracts.length > 0 ? (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                            {contracts.map(c => (
                                <div key={c.id} className="p-4 bg-black/20 rounded-xl hover:bg-black/30 transition-all border border-white/5">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-bold text-sm text-white">{c.tenant_name}</div>
                                            <div className="text-[10px] font-mono text-blue-400 mt-1">{c.contract_number}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-black text-emerald-400">€{Number(c.monthly_amount || 0).toLocaleString()}/ay</div>
                                            <span className={`text-[9px] font-black uppercase ${c.status === 'active' ? 'text-emerald-400' : 'text-red-400'}`}>{c.status}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 mt-2 text-[10px] text-slate-500">
                                        <span>Başlangıç: {c.start_date}</span>
                                        {c.end_date && <span>Bitiş: {c.end_date}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <EmptyState icon={<FiFileText />} message="Sözleşme yok" />}
                </SectionCard>
            </div>

            {/* Note Modal */}
            <Modal show={showNoteModal} onClose={() => setShowNoteModal(false)} title="Yeni İletişim Notu" maxWidth="max-w-xl">
                <form onSubmit={handleCreateNote} className="space-y-5">
                    <SelectGroup label="Restoran" value={note.tenant_id} onChange={v => setNote({ ...note, tenant_id: v })} options={[{ label: 'Seçin...', value: '' }, ...tenants.map(t => ({ label: t.name, value: t.id }))]} />
                    <SelectGroup label="Not Tipi" value={note.note_type} onChange={v => setNote({ ...note, note_type: v })} options={[
                        { label: 'Dahili Not', value: 'internal' }, { label: 'Telefon', value: 'call' }, { label: 'E-posta', value: 'email' },
                        { label: 'Toplantı', value: 'meeting' }, { label: 'Şikayet', value: 'complaint' }, { label: 'Geri Bildirim', value: 'feedback' }
                    ]} />
                    <InputGroup label="Konu" value={note.subject} onChange={v => setNote({ ...note, subject: v })} placeholder="Kısa başlık..." />
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">İçerik</label>
                        <textarea value={note.content} onChange={e => setNote({ ...note, content: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none h-24" />
                    </div>
                    <button type="submit" className="w-full bg-gradient-to-r from-purple-600 to-violet-600 py-4 rounded-xl text-white font-black">KAYDET</button>
                </form>
            </Modal>

            {/* Contract Modal */}
            <Modal show={showContractModal} onClose={() => setShowContractModal(false)} title="Yeni Sözleşme" maxWidth="max-w-xl">
                <form onSubmit={handleCreateContract} className="space-y-5">
                    <SelectGroup label="Restoran" value={contract.tenant_id} onChange={v => setContract({ ...contract, tenant_id: v })} options={[{ label: 'Seçin...', value: '' }, ...tenants.map(t => ({ label: t.name, value: t.id }))]} />
                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Başlangıç" type="date" value={contract.start_date} onChange={v => setContract({ ...contract, start_date: v })} />
                        <InputGroup label="Bitiş" type="date" value={contract.end_date} onChange={v => setContract({ ...contract, end_date: v })} />
                    </div>
                    <InputGroup label="Aylık Tutar (€)" type="number" value={contract.monthly_amount} onChange={v => setContract({ ...contract, monthly_amount: Number(v) })} />
                    <button type="submit" className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 py-4 rounded-xl text-white font-black">OLUŞTUR</button>
                </form>
            </Modal>
        </div>
    );
};
