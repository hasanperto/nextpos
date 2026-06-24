import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FiPhoneCall, FiUser, FiMapPin, FiShoppingCart, FiX, FiClock, FiTrash2, FiSearch, FiTruck, FiLayers, FiAlertCircle, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { usePosStore } from '../../../store/usePosStore';
import { useUIStore } from '../../../store/useUIStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { usePosLocale } from '../../../contexts/PosLocaleContext';
import toast from 'react-hot-toast';
import { PinCodeModal } from './PinCodeModal';
import {
    appendCallsToHistory,
    buildCallerOrderPool,
    callRecordKey,
    filterActiveCalls,
    getCallDisplayStatus,
    loadCallHistoryFromStorage,
    mergeCallHistory,
    normalizeCallerPhone,
    resolveAssociatedOrderMatch,
    saveCallHistoryToStorage,
    type CallDisplayStatus,
} from '../../../lib/callerIdUtils';

const mapStoreOrderToApiOrder = (o: any) => {
    if (!o) return null;
    return {
        id: o.id,
        order_number: o.remoteId ? `#${o.remoteId}` : o.id,
        status: o.status,
        created_at: o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
        total_amount: o.total,
        service_type: o.orderType,
        payment_method: o.paymentMethod || 'cash',
        courier_name: o.courierName || '',
        notes: o.notes || '',
        picked_up_at: o.pickedUpAt ? new Date(o.pickedUpAt).toISOString() : undefined,
        cancel_reason: o.cancelReason || '',
        items: o.items?.map((it: any) => ({
            quantity: it.qty,
            product_name: it.product?.displayName || it.product?.name || 'Ürün',
            unit_price: it.price,
            notes: it.notes,
            modifiers: it.modifiers?.map((m: any) => ({ name: m.displayName || m.name }))
        }))
    };
};

const ACTIVE_ORDER_STATUSES = new Set(['pending', 'preparing', 'ready', 'shipped', 'confirmed']);

const getCallStatusState = (call: any, orders: any[], isHistory: boolean = false, apiOrders?: any[]): CallDisplayStatus => {
    const pool = apiOrders?.length ? buildCallerOrderPool(call, orders || [], apiOrders) : (orders || []);
    return getCallDisplayStatus(call, pool, 'new_call');
};

const sortCalls = (calls: any[], ordersList: any[], isHistory: boolean = false) => {
    return [...calls].sort((a, b) => {
        const statusA = getCallStatusState(a, ordersList, isHistory);
        const statusB = getCallStatusState(b, ordersList, isHistory);
        
        const priority: Record<string, number> = {
            ongoing: 0,
            new_call: 1,
            delivered: 2,
            cancelled: 3
        };
        
        const prioA = priority[statusA] ?? 0;
        const prioB = priority[statusB] ?? 0;
        
        if (prioA !== prioB) {
            return prioA - prioB;
        }
        
        const timeA = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
        const timeB = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
        const validTimeA = isNaN(timeA) ? 0 : timeA;
        const validTimeB = isNaN(timeB) ? 0 : timeB;
        return validTimeB - validTimeA;
    });
};

export const CallerIdModal: React.FC = () => {
    const { setOrderType, settings, fetchSettings, orders } = usePosStore();
    const { 
        showCallerId, 
        setCallerId, 
        setActiveCustomer, 
        setCartOpen, 
        isCartOpen, 
        recentCalls,
        removeRecentCall,
        callerIdData,
        setCallerSelector,
        checkAndMoveDeliveredCallsToHistory
    } = useUIStore();
    const { t } = usePosLocale();
    const { token, tenantId, getAuthHeaders } = useAuthStore();

    const regMode = settings?.integrations?.callerId?.createCustomerMode || 'after';

    const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
    const [historyCalls, setHistoryCalls] = useState<any[]>([]);
    const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
    const [matchingCustomers, setMatchingCustomers] = useState<Record<string, any>>({});
    const [isSavingCustomer, setIsSavingCustomer] = useState(false);
    
    // Manual Registration Form State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [formData, setFormData] = useState({ name: '', address: '', note: '' });

    const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<any | null>(null);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<string>('all');

    // PIN code states
    const [isPinModalOpen, setIsPinModalOpen] = useState(false);
    const [callToDelete, setCallToDelete] = useState<any | null>(null);

    // Ticker state to refresh preparation/courier time elapsed in real-time
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => {
            setTick(t => t + 1);
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    const currencySymbol = settings?.currency === 'EUR' ? '€' : settings?.currency === 'USD' ? '$' : '₺';
    const formatPrice = (price: number) => `${currencySymbol}${(Number(price) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const refreshHistory = useCallback(() => {
        const merged = mergeCallHistory(loadCallHistoryFromStorage(), recentCalls, orders || []);
        setHistoryCalls(merged);
        saveCallHistoryToStorage(merged);
    }, [recentCalls, orders]);

    const displayActiveCalls = useMemo(
        () => filterActiveCalls(recentCalls, orders || []),
        [recentCalls, orders],
    );

    const filterCalls = (calls: any[]) => {
        return (calls || []).filter(call => {
            const matched = matchingCustomers[call.number];
            const name = matched?.name || call.name || '';
            const num = call.number || '';
            
            const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  num.toLowerCase().includes(searchTerm.toLowerCase());
            if (!matchesSearch) return false;
            
            if (activeTab === 'active') {
                const isRegistered = !!(matched || call.customerId);
                if (filterType === 'registered') return isRegistered;
                if (filterType === 'new') return !isRegistered;
            } else {
                const status = getCallStatusState(call, orders || [], true);
                if (filterType === 'ongoing') return status === 'ongoing';
                if (filterType === 'delivered') return status === 'delivered';
                if (filterType === 'cancelled') return status === 'cancelled';
            }
            
            return true;
        });
    };

    const resolveAssociatedOrder = useCallback((call: any, apiOrders: any[] = []) => {
        if (!call) return null;

        if (call.orderId != null) {
            const byIdApi = apiOrders.find(
                (o: any) =>
                    String(o.id) === String(call.orderId)
                    || String(o.order_number || '').replace('#', '') === String(call.orderId),
            );
            if (byIdApi) return byIdApi;

            const storeById = (orders || []).find(
                (o: any) => String(o.remoteId ?? o.id) === String(call.orderId),
            );
            if (storeById) return mapStoreOrderToApiOrder(storeById);
        }

        const match = resolveAssociatedOrderMatch(call, orders || [], apiOrders);
        if (!match) return null;

        const apiHit = apiOrders.find(
            (o: any) =>
                String(o.id) === String(match.id)
                || String(o.order_number || '').replace('#', '') === String(match.remoteId ?? match.id),
        );
        if (apiHit) return apiHit;

        const storeHit = (orders || []).find(
            (o: any) => String(o.remoteId ?? o.id) === String(match.remoteId ?? match.id),
        );
        return storeHit ? mapStoreOrderToApiOrder(storeHit) : null;
    }, [orders]);

    const getActiveOrders = (orders: any[]) => {
        if (!orders || orders.length === 0) return [];
        return orders.filter((o: any) => 
            o.status === 'pending' || 
            o.status === 'preparing' || 
            o.status === 'ready' || 
            o.status === 'shipped'
        );
    };

    const activeCall = activeTab === 'active'
        ? (displayActiveCalls.find(c => `${c.number}_${c.receivedAt || ''}` === selectedNumber)
            || (callerIdData && `${callerIdData.number}_${(callerIdData as any).receivedAt || ''}` === selectedNumber ? { ...callerIdData } : null)
            || displayActiveCalls[0]
            || (callerIdData ? { ...callerIdData } : null))
        : (historyCalls.find(c => `${c.number}_${c.receivedAt || ''}` === selectedNumber) || historyCalls[0]);

    const customerOrders = selectedCustomerDetail?.recent_orders || [];
    const activeOrders = activeCall ? getActiveOrders(customerOrders) : [];

    const activeCallNumberNormalized = activeCall ? normalizeCallerPhone(activeCall.number) : '';
    const storeActiveOrder = activeCallNumberNormalized ? (orders || []).find((o) => {
        const orderPhoneNormalized = normalizeCallerPhone(o.customerPhone || '');
        const orderNameNormalized = normalizeCallerPhone(o.customerName || '');
        const isEnded = ['delivered', 'cancelled'].includes(o.status);
        return !isEnded && (orderPhoneNormalized === activeCallNumberNormalized || orderNameNormalized === activeCallNumberNormalized);
    }) : null;

    const resolvedHeaderOrder = activeCall ? resolveAssociatedOrder(activeCall, customerOrders) : null;
    const hasActiveOrder = activeOrders.length > 0 || !!storeActiveOrder
        || (resolvedHeaderOrder != null && ACTIVE_ORDER_STATUSES.has(resolvedHeaderOrder.status));

    useEffect(() => {
        if (showCallerId) {
            void fetchSettings();
            checkAndMoveDeliveredCallsToHistory(orders || []);
            refreshHistory();

            if (!selectedNumber) {
                if (callerIdData) {
                    setSelectedNumber(`${callerIdData.number}_${(callerIdData as any).receivedAt || ''}`);
                } else if (displayActiveCalls.length > 0) {
                    setSelectedNumber(`${displayActiveCalls[0].number}_${displayActiveCalls[0].receivedAt || ''}`);
                } else {
                    const merged = mergeCallHistory(loadCallHistoryFromStorage(), recentCalls, orders || []);
                    if (merged.length > 0) {
                        setSelectedNumber(`${merged[0].number}_${merged[0].receivedAt || ''}`);
                    }
                }
            }
        }
    }, [showCallerId, callerIdData, recentCalls, displayActiveCalls, selectedNumber, fetchSettings, orders, checkAndMoveDeliveredCallsToHistory, refreshHistory]);

    useEffect(() => {
        if (!showCallerId) return;
        refreshHistory();
    }, [showCallerId, orders, recentCalls, refreshHistory]);

    useEffect(() => {
        const onHistoryUpdated = () => refreshHistory();
        window.addEventListener('nextpos-call-history-updated', onHistoryUpdated);
        return () => window.removeEventListener('nextpos-call-history-updated', onHistoryUpdated);
    }, [refreshHistory]);

    // Customer Lookup Logic for all recent and history calls
    useEffect(() => {
        const allCalls = [...recentCalls, ...historyCalls];
        allCalls.forEach(call => {
            if (call.number && !matchingCustomers[call.number]) {
                const searchPhone = call.number.replace(/\D/g, '').slice(-10);
                void fetch(`/api/v1/customers/search?q=${encodeURIComponent(searchPhone)}`, {
                    headers: getAuthHeaders()
                }).then(res => res.json())
                  .then(data => {
                      if (Array.isArray(data) && data.length > 0) {
                          setMatchingCustomers(prev => ({ ...prev, [call.number]: data[0] }));
                      }
                  }).catch(() => {});
            }
        });
    }, [recentCalls, historyCalls, getAuthHeaders]);

    // Fetch full customer profile and recent orders when activeCall changes
    useEffect(() => {
        if (!activeCall) {
            setSelectedCustomerDetail(null);
            return;
        }
        const matched = matchingCustomers[activeCall.number];
        if (matched?.id) {
            setIsLoadingDetail(true);
            void fetch(`/api/v1/customers/${matched.id}`, {
                headers: getAuthHeaders()
            })
            .then(res => res.json())
            .then(data => {
                if (data && !data.error) {
                    setSelectedCustomerDetail(data);
                } else {
                    setSelectedCustomerDetail(null);
                }
            })
            .catch(() => {
                setSelectedCustomerDetail(null);
            })
            .finally(() => {
                setIsLoadingDetail(false);
            });
        } else {
            setSelectedCustomerDetail(null);
        }
    }, [activeCall, matchingCustomers, getAuthHeaders]);

    if (!showCallerId) return null;

    const handleAccept = (call: any) => {
        const matched = matchingCustomers[call.number];
        
        // If "Before Order" mode and no match, force registration form first
        if (regMode === 'before' && !matched && !isFormOpen) {
            setFormData({ name: call.name || '', address: call.address || '', note: '' });
            setIsFormOpen(true);
            return;
        }

        const customerData = {
            customerId: matched?.id || call.customerId,
            name: matched?.name || call.name || t('caller.unknown_customer'),
            number: call.number,
            address: matched?.address || call.address || ''
        };

        setCallerId(false);
        setCallerSelector(true, customerData);
        // Sipariş tamamlanana kadar listede kalsın — teslim/iptal sonrası geçmişe taşınır
    };

    const handleSaveCustomer = async (call: any) => {
        setIsSavingCustomer(true);
        try {
            const res = await fetch('/api/v1/customers', {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: formData.name || call.name || t('wa.new_message'),
                    phone: call.number,
                    address: formData.address,
                    notes: `Aramadan kaydedildi. ${formData.note} - İlk görüşme: ${new Date().toLocaleDateString()}`
                })

            });

            if (res.ok) {
                const newCust = await res.json();
                setMatchingCustomers(prev => ({ ...prev, [call.number]: newCust }));
                setIsFormOpen(false);
                setFormData({ name: '', address: '', note: '' });
            }
        } catch (e) {
            toast.error(t('caller.toast.save_error'));
        } finally {
            setIsSavingCustomer(false);
        }

    };

    const handleDeleteClick = (call: any) => {
        if (activeTab === 'history') {
            setCallToDelete(call);
            setIsPinModalOpen(true);
        } else {
            try {
                const dismissedCall = { ...call, dismissedAt: new Date().toISOString() };
                const newHistory = appendCallsToHistory([dismissedCall]);
                setHistoryCalls(mergeCallHistory(newHistory, recentCalls.filter((c) => callRecordKey(c) !== callRecordKey(call)), orders || []));
            } catch (e) {
                console.error(e);
            }

            removeRecentCall(call.number, call.receivedAt);
            toast.success('Arama listeden kaldırıldı');
            if (selectedNumber === `${call.number}_${call.receivedAt || ''}`) {
                const remaining = displayActiveCalls.filter((c) => callRecordKey(c) !== callRecordKey(call));
                setSelectedNumber(remaining[0] ? `${remaining[0].number}_${remaining[0].receivedAt || ''}` : null);
            }
        }
    };

    const handlePinSuccess = () => {
        if (!callToDelete) return;
        try {
            const newHistory = loadCallHistoryFromStorage().filter((h) => callRecordKey(h) !== callRecordKey(callToDelete));
            saveCallHistoryToStorage(newHistory);
            setHistoryCalls(mergeCallHistory(newHistory, recentCalls, orders || []));
            toast.success('Geçmiş arama kaydı silindi');
            if (selectedNumber === `${callToDelete.number}_${callToDelete.receivedAt || ''}`) {
                setSelectedNumber(newHistory[0] ? `${newHistory[0].number}_${newHistory[0].receivedAt || ''}` : null);
            }
        } catch (e) {
            toast.error('Silinirken hata oluştu');
        } finally {
            setIsPinModalOpen(false);
            setCallToDelete(null);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#020617]/90 backdrop-blur-2xl z-[100] flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-[#0f172a] border border-white/10 rounded-3xl shadow-[0_0_100px_rgba(16,185,129,0.15)] max-w-4xl w-full h-[75vh] max-h-[640px] flex overflow-hidden relative"
            >
                {/* Close Button */}
                <button 
                    onClick={() => setCallerId(false)}
                    className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-rose-500 transition-all z-20"
                >
                    <FiX size={18} />
                </button>

                {/* Left Side: Recent Calls List */}
                <div className="w-[340px] shrink-0 border-r border-white/5 flex flex-col bg-black/20">
                    <div className="p-5 border-b border-white/5">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                                <FiPhoneCall size={16} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-white uppercase tracking-tight leading-none mb-1">{t('caller.title')}</h3>
                                <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-[0.2em] leading-none">{t('caller.recent_calls')}</p>
                            </div>
                        </div>
                    </div>

                    {/* Tab Selector */}
                    <div className="flex border-b border-white/5 p-2 gap-2">
                        <button
                            onClick={() => {
                                setActiveTab('active');
                                setFilterType('all');
                                if (displayActiveCalls.length > 0) {
                                    setSelectedNumber(`${displayActiveCalls[0].number}_${displayActiveCalls[0].receivedAt || ''}`);
                                } else if (callerIdData) {
                                    setSelectedNumber(`${callerIdData.number}_${(callerIdData as any).receivedAt || ''}`);
                                } else {
                                    setSelectedNumber(null);
                                }
                            }}
                            className={`flex-1 py-2.5 px-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
                                activeTab === 'active'
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                            }`}
                        >
                            {t('caller.active_calls') || 'Aktif'} ({displayActiveCalls.length})
                        </button>
                        <button
                            onClick={() => {
                                setActiveTab('history');
                                setFilterType('all');
                                if (historyCalls.length > 0) {
                                    setSelectedNumber(`${historyCalls[0].number}_${historyCalls[0].receivedAt || ''}`);
                                } else {
                                    setSelectedNumber(null);
                                }
                            }}
                            className={`flex-1 py-2.5 px-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
                                activeTab === 'history'
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                            }`}
                        >
                            {t('caller.history_calls') || 'Geçmiş'} ({historyCalls.length})
                        </button>
                    </div>

                    {/* Search and Filters Bar */}
                    <div className="p-4 border-b border-white/5 space-y-3 bg-black/10">
                        <div className="relative">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Numara veya isim ara..."
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-bold text-white outline-none focus:border-emerald-500 transition-all placeholder-slate-500"
                            />
                            <FiSearch className="absolute left-3.5 top-3.5 text-slate-500" size={14} />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm('')} className="absolute right-3.5 top-3 text-slate-500 hover:text-white">
                                    <FiX size={14} />
                                </button>
                            )}
                        </div>
                        
                        <div className="flex flex-wrap gap-1.5">
                            {(activeTab === 'active'
                                ? [
                                      { id: 'all', label: 'Hepsi', icon: <FiLayers size={10} /> },
                                      { id: 'registered', label: 'Kayıtlı', icon: <FiUser size={10} /> },
                                      { id: 'new', label: 'Yeni', icon: <FiPhoneCall size={10} /> }
                                  ]
                                : [
                                      { id: 'all', label: 'Hepsi', icon: <FiLayers size={10} /> },
                                      { id: 'ongoing', label: 'Bekleyen', icon: <FiClock size={10} /> },
                                      { id: 'delivered', label: 'Tamamlanan', icon: <FiCheckCircle size={10} /> },
                                      { id: 'cancelled', label: 'İptal', icon: <FiX size={10} /> }
                                  ]
                            ).map((btn) => (
                                <button
                                    key={btn.id}
                                    onClick={() => setFilterType(btn.id)}
                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${
                                        filterType === btn.id
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            : 'bg-white/5 text-slate-400 border-transparent hover:text-white'
                                    }`}
                                >
                                    {btn.icon}
                                    <span>{btn.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
                        {activeTab === 'active' ? (
                            filterCalls(displayActiveCalls).length === 0 && !callerIdData ? (
                                <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-30">
                                    <FiPhoneCall size={36} className="mb-3" />
                                    <p className="font-bold text-xs">{searchTerm ? 'Arama sonucu bulunamadı' : t('caller.empty')}</p>
                                </div>
                            ) : (
                                sortCalls(filterCalls(displayActiveCalls), orders || [], false).map((call, idx) => {
                                    const matched = matchingCustomers[call.number];
                                    const isActive = selectedNumber === `${call.number}_${call.receivedAt || ''}`;

                                    const status = getCallStatusState(call, orders, false);
                                    let cardClass = '';
                                    let statusBadge = null;

                                    if (status === 'cancelled') {
                                        cardClass = isActive
                                            ? 'bg-rose-600 border-rose-600 text-white shadow-xl shadow-rose-600/20'
                                            : 'bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/15 text-rose-300';
                                        statusBadge = (
                                            <span className={`px-1.5 py-0.5 border text-[8px] font-black rounded uppercase tracking-wider ${
                                                isActive ? 'bg-white/20 border-white/30 text-white' : 'bg-rose-500/20 border-rose-500/30 text-rose-400'
                                            }`}>
                                                İptal Edildi
                                            </span>
                                        );
                                    } else if (status === 'delivered') {
                                        cardClass = isActive
                                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xl shadow-emerald-600/20'
                                            : 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/15 text-emerald-300';
                                        statusBadge = (
                                            <span className={`px-1.5 py-0.5 border text-[8px] font-black rounded uppercase tracking-wider ${
                                                isActive ? 'bg-white/20 border-white/30 text-white' : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                                            }`}>
                                                Teslim Edildi
                                            </span>
                                        );
                                    } else { // ongoing
                                        cardClass = isActive
                                            ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-600/20'
                                            : 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/15 text-blue-300';
                                        
                                        const callPhoneNormalized = normalizeCallerPhone(call.number);
                                        const matchingOrder = (orders || []).find((o) => {
                                            const orderPhoneNormalized = normalizeCallerPhone(o.customerPhone || '');
                                            const orderNameNormalized = normalizeCallerPhone(o.customerName || '');
                                            return !['delivered', 'cancelled'].includes(o.status) && (orderPhoneNormalized === callPhoneNormalized || (callPhoneNormalized && orderNameNormalized === callPhoneNormalized));
                                        });

                                        if (matchingOrder) {
                                            const orderStatus = matchingOrder.status;
                                            const label = orderStatus === 'ready' ? 'Hazır' : orderStatus === 'shipped' ? 'Kuryede' : 'Mutfakta';
                                            const badgeColors = orderStatus === 'ready'
                                                ? (isActive ? 'bg-white/20 border-white/30 text-white' : 'bg-amber-500/20 border-amber-500/30 text-amber-400')
                                                : orderStatus === 'shipped'
                                                    ? (isActive ? 'bg-white/20 border-white/30 text-white' : 'bg-sky-500/20 border-sky-500/30 text-sky-400')
                                                    : (isActive ? 'bg-white/20 border-white/30 text-white' : 'bg-orange-500/20 border-orange-500/30 text-orange-400');
                                            statusBadge = (
                                                <span className={`px-1.5 py-0.5 border text-[8px] font-black rounded uppercase tracking-wider ${badgeColors}`}>
                                                    {label}
                                                </span>
                                            );
                                        } else {
                                            statusBadge = (
                                                <span className={`px-1.5 py-0.5 border text-[8px] font-black rounded uppercase tracking-wider ${
                                                    isActive ? 'bg-white/20 border-white/30 text-white' : 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                                                }`}>
                                                    Yeni Çağrı
                                                </span>
                                            );
                                        }
                                    }

                                    return (
                                        <button
                                            key={`call-${call.number}-${call.receivedAt || idx}`}
                                            onClick={() => setSelectedNumber(`${call.number}_${call.receivedAt || ''}`)}
                                            className={`w-full p-3.5 rounded-2xl border transition-all text-left relative overflow-hidden group ${cardClass}`}
                                        >
                                            <div className="flex justify-between items-start mb-1 relative z-10">
                                                <div className="flex items-center gap-1.5">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white' : (status === 'cancelled' ? 'bg-rose-500' : status === 'delivered' ? 'bg-emerald-500' : 'bg-blue-500')} animate-pulse`} />
                                                    <span className={`text-[9px] font-black uppercase tracking-widest ${isActive ? 'text-white/80' : 'text-slate-500'}`}>
                                                        {call.receivedAt ? new Date(call.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t('caller.live')}
                                                    </span>
                                                </div>
                                                {statusBadge}
                                            </div>
                                            <div className="relative z-10">
                                                <p className={`text-sm font-mono font-black leading-tight mb-0.5 truncate ${isActive ? 'text-white' : (status === 'cancelled' ? 'text-rose-200' : status === 'delivered' ? 'text-emerald-200' : 'text-blue-200')}`}>
                                                    {call.number}
                                                </p>
                                                <p className={`text-[10px] font-bold truncate ${isActive ? 'text-white/70' : (status === 'cancelled' ? 'text-rose-400/70' : status === 'delivered' ? 'text-emerald-400/70' : 'text-blue-400/70')}`}>
                                                    {matched?.name || call.name || t('caller.unknown_customer')}
                                                </p>
                                            </div>
                                            {isActive && (
                                                <motion.div layoutId="active-pill-call" className="absolute left-0 top-0 bottom-0 w-1 bg-white" />
                                            )}
                                        </button>
                                    );
                                })
                            )
                        ) : (
                            filterCalls(historyCalls).length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-30">
                                    <FiPhoneCall size={36} className="mb-3" />
                                    <p className="font-bold text-xs">{searchTerm ? 'Arama sonucu bulunamadı' : t('caller.empty')}</p>
                                </div>
                            ) : (
                                sortCalls(filterCalls(historyCalls), orders || [], true).map((call, idx) => {
                                    const matched = matchingCustomers[call.number];
                                    const isActive = selectedNumber === `${call.number}_${call.receivedAt || ''}`;

                                    const status = getCallStatusState(call, orders, true);
                                    let cardClass = '';
                                    let statusBadge = null;

                                    if (status === 'cancelled') {
                                        cardClass = isActive
                                            ? 'bg-rose-600 border-rose-600 text-white shadow-xl shadow-rose-600/20'
                                            : 'bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/15 text-rose-300';
                                        statusBadge = (
                                            <span className={`px-1.5 py-0.5 border text-[8px] font-black rounded uppercase tracking-wider ${
                                                isActive ? 'bg-white/20 border-white/30 text-white' : 'bg-rose-500/20 border-rose-500/30 text-rose-400'
                                            }`}>
                                                İptal Edildi
                                            </span>
                                        );
                                    } else if (status === 'delivered') {
                                        cardClass = isActive
                                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xl shadow-emerald-600/20'
                                            : 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/15 text-emerald-300';
                                        statusBadge = (
                                            <span className={`px-1.5 py-0.5 border text-[8px] font-black rounded uppercase tracking-wider ${
                                                isActive ? 'bg-white/20 border-white/30 text-white' : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                                            }`}>
                                                Teslim Edildi
                                            </span>
                                        );
                                    } else { // ongoing
                                        cardClass = isActive
                                            ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-600/20'
                                            : 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/15 text-blue-300';
                                        
                                        const callPhoneNormalized = normalizeCallerPhone(call.number);
                                        const matchingOrder = (orders || []).find((o) => {
                                            const orderPhoneNormalized = normalizeCallerPhone(o.customerPhone || '');
                                            const orderNameNormalized = normalizeCallerPhone(o.customerName || '');
                                            return !['delivered', 'cancelled'].includes(o.status) && (orderPhoneNormalized === callPhoneNormalized || (callPhoneNormalized && orderNameNormalized === callPhoneNormalized));
                                        });

                                        if (matchingOrder) {
                                            const orderStatus = matchingOrder.status;
                                            const label = orderStatus === 'ready' ? 'Hazır' : orderStatus === 'shipped' ? 'Kuryede' : 'Mutfakta';
                                            const badgeColors = orderStatus === 'ready'
                                                ? (isActive ? 'bg-white/20 border-white/30 text-white' : 'bg-amber-500/20 border-amber-500/30 text-amber-400')
                                                : orderStatus === 'shipped'
                                                    ? (isActive ? 'bg-white/20 border-white/30 text-white' : 'bg-sky-500/20 border-sky-500/30 text-sky-400')
                                                    : (isActive ? 'bg-white/20 border-white/30 text-white' : 'bg-orange-500/20 border-orange-500/30 text-orange-400');
                                            statusBadge = (
                                                <span className={`px-1.5 py-0.5 border text-[8px] font-black rounded uppercase tracking-wider ${badgeColors}`}>
                                                    {label}
                                                </span>
                                            );
                                        } else {
                                            statusBadge = (
                                                <span className={`px-1.5 py-0.5 border text-[8px] font-black rounded uppercase tracking-wider ${
                                                    isActive ? 'bg-white/20 border-white/30 text-white' : 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                                                }`}>
                                                    Yeni Çağrı
                                                </span>
                                            );
                                        }
                                    }

                                    return (
                                        <button
                                            key={`hist-${call.number}-${call.receivedAt || idx}`}
                                            onClick={() => setSelectedNumber(`${call.number}_${call.receivedAt || ''}`)}
                                            className={`w-full p-3.5 rounded-2xl border transition-all text-left relative overflow-hidden group ${cardClass}`}
                                        >
                                            <div className="flex justify-between items-start mb-1 relative z-10">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-[9px] font-black uppercase tracking-widest ${isActive ? 'text-white/80' : 'text-slate-500'}`}>
                                                        {call.receivedAt ? new Date(call.receivedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + new Date(call.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t('caller.live')}
                                                    </span>
                                                </div>
                                                {statusBadge}
                                            </div>
                                            <div className="relative z-10">
                                                <p className={`text-sm font-mono font-black leading-tight mb-0.5 truncate ${isActive ? 'text-white' : (status === 'cancelled' ? 'text-rose-200' : status === 'delivered' ? 'text-emerald-200' : 'text-blue-200')}`}>
                                                    {call.number}
                                                </p>
                                                <p className={`text-[10px] font-bold truncate ${isActive ? 'text-white/70' : (status === 'cancelled' ? 'text-rose-400/70' : status === 'delivered' ? 'text-emerald-400/70' : 'text-blue-400/70')}`}>
                                                    {matched?.name || call.name || t('caller.unknown_customer')}
                                                </p>
                                            </div>
                                            {isActive && (
                                                <motion.div layoutId="active-pill-call" className="absolute left-0 top-0 bottom-0 w-1 bg-white" />
                                            )}
                                        </button>
                                    );
                                })
                            )
                        )}
                    </div>
                </div>

                {/* Right Side: Call Details */}
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-900/30">
                    <AnimatePresence mode="wait">
                        {activeCall ? (
                            <motion.div 
                                key={activeCall.number || 'fallback-active-call'}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="flex-1 flex flex-col p-6 overflow-hidden"
                            >
                                {/* Customer Info Header */}
                                <div className="flex items-start justify-between mb-5">
                                    <div className="flex gap-4 items-center">
                                        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white relative">
                                            {matchingCustomers[activeCall.number] || activeCall.customerId ? (
                                                <FiUser size={28} className="text-emerald-500" />
                                            ) : (
                                                <FiPhoneCall size={28} className="text-white/20" />
                                            )}
                                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center text-white shadow-lg">
                                                <FiPhoneCall size={12} />
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-widest uppercase ${
                                                    (matchingCustomers[activeCall.number] || activeCall.customerId) 
                                                        ? 'bg-emerald-500/10 text-emerald-500' 
                                                        : 'bg-amber-500/10 text-amber-500'
                                                }`}>
                                                    {(matchingCustomers[activeCall.number] || activeCall.customerId) ? t('caller.registered') : t('caller.new_caller')}
                                                </span>
                                            </div>

                                            <h2 className="text-3xl font-mono font-black text-white tracking-tighter mb-1">
                                                {activeCall.number}
                                            </h2>
                                            <div className="flex items-center gap-3.5 text-slate-400 font-bold text-xs">
                                                <div className="flex items-center gap-1.5">
                                                    <FiUser className="text-emerald-500" />
                                                    {matchingCustomers[activeCall.number]?.name || activeCall.name || t('caller.unknown_customer')}
                                                </div>
                                                <div className="w-1 h-1 rounded-full bg-white/10" />
                                                <div className="flex items-center gap-1.5">
                                                    <FiClock className="text-blue-400" />
                                                    {activeCall.receivedAt ? new Date(activeCall.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t('caller.now')}
                                                </div>

                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Content Grid */}
                                <div className="flex-1 grid grid-cols-2 gap-5 overflow-hidden">
                                    {/* Sol Kolon: Sipariş Takibi veya Sipariş Detayları */}
                                    <div className="flex flex-col gap-4 overflow-hidden">
                                        <div className="flex-1 bg-white/[0.03] border border-white/[0.05] rounded-2xl p-5 overflow-y-auto no-scrollbar flex flex-col justify-between">
                                            {isLoadingDetail ? (
                                                <div className="flex-1 flex items-center justify-center">
                                                    <div className="w-8 h-8 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
                                                </div>
                                            ) : (
                                                (() => {
                                                    const customerOrders = selectedCustomerDetail?.recent_orders || [];
                                                    let associatedOrder = resolveAssociatedOrder(activeCall, customerOrders);
                                                    if (!associatedOrder) {
                                                        const match = resolveAssociatedOrderMatch(activeCall, orders || [], customerOrders);
                                                        if (match) {
                                                            const storeHit = (orders || []).find(
                                                                (o: any) => String(o.remoteId ?? o.id) === String(match.remoteId ?? match.id),
                                                            );
                                                            if (storeHit) associatedOrder = mapStoreOrderToApiOrder(storeHit);
                                                        }
                                                    }
                                                    const isActiveOrder = associatedOrder && ACTIVE_ORDER_STATUSES.has(associatedOrder.status);

                                                    if (isActiveOrder && associatedOrder) {
                                                        const activeOrder = associatedOrder;

                                                        // Kitchen & Courier times
                                                        const createdTime = new Date(activeOrder.created_at).getTime();
                                                        const nowTime = new Date().getTime();
                                                        const kitchenMins = Math.max(0, Math.round((nowTime - createdTime) / 60000));

                                                        const departureTime = activeOrder.picked_up_at 
                                                            ? new Date(activeOrder.picked_up_at).getTime() 
                                                            : createdTime + 15 * 60 * 1000;
                                                        const courierMins = Math.max(0, Math.round((nowTime - departureTime) / 60000));

                                                        // Status mapping
                                                        const statusSteps = [
                                                            { id: 'pending', label: 'Sırada' },
                                                            { id: 'preparing', label: 'Mutfakta' },
                                                            { id: 'ready', label: 'Hazır' },
                                                            { id: 'shipped', label: 'Yolda' }
                                                        ];

                                                        const currentStatusIndex = statusSteps.findIndex(s => s.id === activeOrder.status);

                                                        return (
                                                            <div className="flex-1 flex flex-col h-full space-y-4">
                                                                {/* Card Header */}
                                                                <div className="flex justify-between items-center pb-3 border-b border-white/5">
                                                                    <div>
                                                                        <span className="px-2 py-0.5 rounded-full text-[8px] font-black tracking-widest uppercase bg-emerald-500/10 text-emerald-400">
                                                                            AKTİF SİPARİŞ TAKİBİ
                                                                        </span>
                                                                        <h4 className="text-white font-mono font-black text-xs mt-1">
                                                                            #{activeOrder.order_number || activeOrder.id}
                                                                        </h4>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                                                        <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider">
                                                                            {activeOrder.status === 'pending' ? 'Sırada' :
                                                                             activeOrder.status === 'preparing' ? 'Mutfakta' :
                                                                             activeOrder.status === 'ready' ? 'Hazır' : 'Yolda'}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {/* Visual Progress Stepper */}
                                                                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5">
                                                                    <div className="flex justify-between items-center relative mb-1 px-1">
                                                                        {/* Progress bar background line */}
                                                                        <div className="absolute left-5 right-5 top-1/2 -translate-y-1/2 h-[2px] bg-white/5 z-0" />
                                                                        {/* Active progress line */}
                                                                        <div 
                                                                            className="absolute left-5 top-1/2 -translate-y-1/2 h-[2px] bg-emerald-500 transition-all duration-500 z-0"
                                                                            style={{ 
                                                                                width: `${(currentStatusIndex / (statusSteps.length - 1)) * 100}%`,
                                                                                maxWidth: 'calc(100% - 2.5rem)'
                                                                            }}
                                                                        />

                                                                        {statusSteps.map((step, idx) => {
                                                                            const isCompleted = idx < currentStatusIndex;
                                                                            const isActive = idx === currentStatusIndex;
                                                                            return (
                                                                                <div key={step.id} className="flex flex-col items-center relative z-10">
                                                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                                                                                        isCompleted ? 'bg-emerald-500 text-white' :
                                                                                        isActive ? 'bg-emerald-500/20 border border-emerald-500 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]' :
                                                                                        'bg-[#0f172a] border border-white/10 text-slate-500'
                                                                                    }`}>
                                                                                        {step.id === 'pending' && <FiLayers size={11} />}
                                                                                        {step.id === 'preparing' && <FiClock size={11} />}
                                                                                        {step.id === 'ready' && <FiAlertCircle size={11} />}
                                                                                        {step.id === 'shipped' && <FiTruck size={11} />}
                                                                                    </div>
                                                                                    <span className={`text-[8px] font-black uppercase tracking-wider mt-1 ${
                                                                                        isActive ? 'text-emerald-400' :
                                                                                        isCompleted ? 'text-slate-300' : 'text-slate-500'
                                                                                    }`}>
                                                                                        {step.label}
                                                                                    </span>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>

                                                                {/* Preparation or Courier details text */}
                                                                <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex items-center gap-3.5">
                                                                    {activeOrder.status === 'pending' && (
                                                                        <>
                                                                            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                                                                                <FiLayers size={18} className="animate-pulse" />
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-[11px] font-bold text-slate-200">
                                                                                    Sipariş sıraya alınmıştır.
                                                                                </p>
                                                                                <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                                                                                    Durum: <span className="font-black text-blue-400">Onay bekliyor / İşlem sırasına alındı</span>.
                                                                                </p>
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                    {activeOrder.status === 'preparing' && (
                                                                        <>
                                                                            <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400 shrink-0">
                                                                                <FiClock size={18} className="animate-spin" style={{ animationDuration: '10s' }} />
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-[11px] font-bold text-slate-200">
                                                                                    Sipariş mutfakta hazırlanmaktadır.
                                                                                </p>
                                                                                <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                                                                                    Kronometre: <span className="font-mono font-black text-orange-400">{kitchenMins} dakikadır</span> hazırlanıyor.
                                                                                </p>
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                    {activeOrder.status === 'ready' && (
                                                                        <>
                                                                            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
                                                                                <FiAlertCircle size={18} className="animate-pulse" />
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-[11px] font-bold text-slate-200">
                                                                                    Sipariş mutfaktan çıkmıştır.
                                                                                </p>
                                                                                <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                                                                                    Durum: <span className="font-black text-amber-400">Paket hazırlandı / Kuryeye teslim bekleniyor</span>.
                                                                                </p>
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                    {activeOrder.status === 'shipped' && (
                                                                        <>
                                                                            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                                                                                <FiTruck size={18} className="animate-bounce" />
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-[11px] font-bold text-slate-200">
                                                                                    Kurye yola çıkmıştır.
                                                                                </p>
                                                                                <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                                                                                    Teslimatçı: <span className="font-bold text-emerald-400">{activeOrder.courier_name || 'Belirtilmedi'}</span> ({courierMins} dk. önce çıktı)
                                                                                </p>
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                </div>

                                                                {activeOrder.notes && (
                                                                    <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl p-3.5">
                                                                        <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                                                                            <FiAlertCircle size={15} />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="text-[8px] font-black text-amber-400/70 uppercase tracking-widest mb-1">Sipariş / Kurye Notu</p>
                                                                            <p className="text-[11px] font-bold text-amber-100 leading-snug break-words">{activeOrder.notes}</p>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Item details */}
                                                                <div className="flex-1 flex flex-col overflow-hidden bg-black/10 rounded-xl border border-white/5 p-3">
                                                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                                                        SİPARİŞ İÇERİĞİ ({activeOrder.items?.length || 0} ÜRÜN)
                                                                    </p>
                                                                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
                                                                        {activeOrder.items?.map((it: any, idx: number) => {
                                                                            let modsList: string[] = [];
                                                                            if (it.modifiers) {
                                                                                try {
                                                                                    const parsed = typeof it.modifiers === 'string' 
                                                                                        ? JSON.parse(it.modifiers) 
                                                                                        : it.modifiers;
                                                                                    if (Array.isArray(parsed)) {
                                                                                        modsList = parsed.map((m: any) => m.name || m);
                                                                                    }
                                                                                } catch (e) {}
                                                                            }

                                                                            return (
                                                                                <div key={idx} className="flex justify-between items-start text-[11px] border-b border-white/[0.02] pb-1 font-bold text-slate-200">
                                                                                    <div className="flex-1 pr-2">
                                                                                        <div className="flex items-center gap-1">
                                                                                            <span className="font-mono text-emerald-400 font-black">{it.quantity}x</span>
                                                                                            <span>{it.product_name}</span>
                                                                                        </div>
                                                                                        {modsList.length > 0 && (
                                                                                            <span className="block text-[9px] text-slate-500 italic ml-6 font-normal">
                                                                                                +{modsList.join(', ')}
                                                                                            </span>
                                                                                        )}
                                                                                        {it.notes && (
                                                                                            <span className="block text-[8px] text-amber-500/80 italic ml-6 font-normal">
                                                                                                Not: {it.notes}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <span className="font-mono font-bold text-slate-400">
                                                                                        {formatPrice(it.unit_price * it.quantity)}
                                                                                    </span>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                    <div className="pt-2 border-t border-white/5 flex justify-between items-center mt-2">
                                                                        <span className="text-[9px] font-black text-slate-500 uppercase">TOPLAM TUTAR</span>
                                                                        <span className="text-sm font-mono font-black text-emerald-400">
                                                                            {formatPrice(activeOrder.total_amount)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    } else if (associatedOrder) {
                                                        const isCancelled = associatedOrder.status === 'cancelled' || associatedOrder.payment_status === 'cancelled';
                                                        const isPaid = ['completed', 'delivered'].includes(associatedOrder.status) || associatedOrder.payment_status === 'paid';
                                                        const isDelivery = associatedOrder.service_type === 'delivery';

                                                        const dateStr = new Date(associatedOrder.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
                                                        const timeStr = new Date(associatedOrder.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                                                        return (
                                                            <div className="flex-1 flex flex-col h-full space-y-4">
                                                                {/* Card Header */}
                                                                <div className="flex justify-between items-center pb-3 border-b border-white/5">
                                                                    <div>
                                                                        <span className="px-2 py-0.5 rounded-full text-[8px] font-black tracking-widest uppercase bg-blue-500/10 text-blue-400">
                                                                            İLİŞKİLİ SİPARİŞ DETAYI
                                                                        </span>
                                                                        <h4 className="text-white font-mono font-black text-xs mt-1">
                                                                            #{associatedOrder.order_number || associatedOrder.id}
                                                                        </h4>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                                                            isCancelled 
                                                                                ? 'bg-rose-500/10 text-rose-500' 
                                                                                : isPaid 
                                                                                    ? 'bg-emerald-500/10 text-emerald-400' 
                                                                                    : 'bg-amber-500/10 text-amber-400'
                                                                        }`}>
                                                                            {isCancelled ? 'İptal' : isPaid ? 'Ödendi' : 'Bekliyor'}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {/* İptal Nedeni */}
                                                                {isCancelled && associatedOrder.cancel_reason && (
                                                                    <div className="flex items-start gap-3 bg-rose-500/8 border border-rose-500/20 rounded-xl p-3.5">
                                                                        <div className="w-8 h-8 rounded-lg bg-rose-500/15 flex items-center justify-center text-rose-400 shrink-0 mt-0.5">
                                                                            <FiAlertTriangle size={15} />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="text-[8px] font-black text-rose-400/70 uppercase tracking-widest mb-1">İptal Nedeni</p>
                                                                            <p className="text-[11px] font-bold text-rose-200 leading-snug break-words">{associatedOrder.cancel_reason}</p>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Shipping Method / Courier / Payment Details */}
                                                                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 grid grid-cols-2 gap-3 text-[11px]">
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-wider">Teslimat Türü</p>
                                                                        <p className="font-bold text-slate-200 uppercase tracking-wide text-[9px]">
                                                                            {associatedOrder.service_type === 'delivery' ? 'Paket Servis' :
                                                                             associatedOrder.service_type === 'takeaway' ? 'Gel-Al' : 'Masa Siparişi'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-wider">Ödeme Yöntemi</p>
                                                                        <p className="font-bold text-slate-200 uppercase tracking-wide text-[9px]">
                                                                            {associatedOrder.payment_method === 'cash' ? 'Nakit' :
                                                                             associatedOrder.payment_method === 'card' ? 'Kredi Kartı' :
                                                                             associatedOrder.payment_method === 'online' ? 'Online Ödeme' : associatedOrder.payment_method}
                                                                        </p>
                                                                    </div>
                                                                    {isDelivery && (
                                                                        <div className="space-y-0.5 col-span-2 pt-1.5 border-t border-white/[0.03]">
                                                                            <div className="flex justify-between items-center">
                                                                                <div>
                                                                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-wider">Kurye</p>
                                                                                    <p className="font-bold text-slate-200">{associatedOrder.courier_name || 'Atanmadı'}</p>
                                                                                </div>
                                                                                {associatedOrder.picked_up_at && (
                                                                                    <div className="text-right">
                                                                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-wider">Çıkış Saati</p>
                                                                                        <p className="font-mono text-slate-300 font-bold">
                                                                                            {new Date(associatedOrder.picked_up_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                                        </p>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {associatedOrder.notes && !isCancelled && (
                                                                    <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl p-3.5">
                                                                        <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                                                                            <FiAlertCircle size={15} />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="text-[8px] font-black text-amber-400/70 uppercase tracking-widest mb-1">Sipariş / Kurye Notu</p>
                                                                            <p className="text-[11px] font-bold text-amber-100 leading-snug break-words">{associatedOrder.notes}</p>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Time Details */}
                                                                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 px-1">
                                                                    <FiClock className="text-blue-400" size={11} />
                                                                    <span>Sipariş Zamanı: <b>{dateStr} {timeStr}</b></span>
                                                                </div>

                                                                {/* Item details */}
                                                                <div className="flex-1 flex flex-col overflow-hidden bg-black/10 rounded-xl border border-white/5 p-3">
                                                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                                                        SİPARİŞ İÇERİĞİ ({associatedOrder.items?.length || 0} ÜRÜN)
                                                                    </p>
                                                                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
                                                                        {associatedOrder.items?.map((it: any, idx: number) => {
                                                                            let modsList: string[] = [];
                                                                            if (it.modifiers) {
                                                                                try {
                                                                                    const parsed = typeof it.modifiers === 'string' 
                                                                                        ? JSON.parse(it.modifiers) 
                                                                                        : it.modifiers;
                                                                                    if (Array.isArray(parsed)) {
                                                                                        modsList = parsed.map((m: any) => m.name || m);
                                                                                    }
                                                                                } catch (e) {}
                                                                            }

                                                                            return (
                                                                                <div key={idx} className="flex justify-between items-start text-[11px] border-b border-white/[0.02] pb-1 font-bold text-slate-200">
                                                                                    <div className="flex-1 pr-2">
                                                                                        <div className="flex items-center gap-1">
                                                                                            <span className="font-mono text-emerald-400 font-black">{it.quantity}x</span>
                                                                                            <span>{it.product_name}</span>
                                                                                        </div>
                                                                                        {modsList.length > 0 && (
                                                                                            <span className="block text-[9px] text-slate-500 italic ml-6 font-normal">
                                                                                                +{modsList.join(', ')}
                                                                                            </span>
                                                                                        )}
                                                                                        {it.notes && (
                                                                                            <span className="block text-[8px] text-amber-500/80 italic ml-6 font-normal">
                                                                                                Not: {it.notes}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <span className="font-mono font-bold text-slate-400">
                                                                                        {formatPrice(it.unit_price * it.quantity)}
                                                                                    </span>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                    <div className="pt-2 border-t border-white/5 flex justify-between items-center mt-2">
                                                                        <span className="text-[9px] font-black text-slate-500 uppercase">TOPLAM TUTAR</span>
                                                                        <span className="text-sm font-mono font-black text-emerald-400">
                                                                            {formatPrice(associatedOrder.total_amount)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    } else if (activeCall.dismissedAt) {
                                                        return (
                                                            <div className="flex-1 flex flex-col items-center justify-center text-center p-5 opacity-80 h-full min-h-[300px]">
                                                                <div className="w-12 h-12 rounded-full bg-slate-500/10 flex items-center justify-center text-slate-400 mb-3 border border-white/10">
                                                                    <FiTrash2 size={22} />
                                                                </div>
                                                                <p className="font-black text-sm text-white uppercase tracking-wider">Listeden Kaldırıldı</p>
                                                                <p className="text-[10px] text-slate-400 mt-1.5 max-w-[220px] leading-normal font-bold">
                                                                    Bu arama aktif listeden kaldırıldı. İlişkili sipariş varsa geçmişten takip edilebilir.
                                                                </p>
                                                            </div>
                                                        );
                                                    } else if (getCallStatusState(activeCall, orders || [], activeTab === 'history', customerOrders) === 'cancelled') {
                                                        return (
                                                            <div className="flex-1 flex flex-col items-center justify-center text-center p-5 opacity-80 h-full min-h-[300px]">
                                                                <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 mb-3 border border-rose-500/20">
                                                                    <FiX size={24} />
                                                                </div>
                                                                <p className="font-black text-sm text-white uppercase tracking-wider">Sipariş İptal Edildi</p>
                                                                <p className="text-[10px] text-slate-400 mt-1.5 max-w-[220px] leading-normal font-bold">
                                                                    Bu numaraya ait sipariş iptal edilmiştir.
                                                                </p>
                                                                {activeCall.cancelledAt && (
                                                                    <p className="text-[8px] font-mono text-slate-500 mt-2">
                                                                        İptal Zamanı: {new Date(activeCall.cancelledAt).toLocaleString()}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        );
                                                    } else {
                                                        return (
                                                            <div className="flex-1 flex flex-col items-center justify-center text-center p-5 opacity-40">
                                                                <FiShoppingCart size={36} className="mb-3 text-slate-500" />
                                                                <p className="font-black text-xs text-white uppercase tracking-wider">Sipariş Bulunamadı</p>
                                                                <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] leading-normal">
                                                                    Bu arama ile eşleşen aktif veya geçmiş bir sipariş kaydı bulunmamaktadır.
                                                                </p>
                                                            </div>
                                                        );
                                                    }
                                                })()
                                            )}
                                        </div>
                                    </div>

                                    {/* Sağ Kolon: Müşteri Adresi, Kayıt & Genel Aksiyonlar */}
                                    <div className="flex flex-col gap-4">
                                        <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-5">
                                            <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-3">{t('caller.info')}</p>
                                            
                                            {isFormOpen ? (
                                                <div className="space-y-3">
                                                    <div className="space-y-0.5">
                                                        <label className="text-[9px] font-black text-slate-500 uppercase ml-1">{t('caller.name_label')}</label>
                                                        <input 
                                                            autoFocus
                                                            value={formData.name}
                                                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white font-bold outline-none focus:border-emerald-500 transition-all text-xs"
                                                            placeholder={t('caller.name_placeholder')}
                                                        />
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        <label className="text-[9px] font-black text-slate-500 uppercase ml-1">{t('caller.address_label')}</label>
                                                        <textarea 
                                                            value={formData.address}
                                                            onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white font-bold outline-none focus:border-emerald-500 transition-all h-16 no-scrollbar text-xs"
                                                            placeholder={t('caller.address_placeholder')}
                                                        />
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button 
                                                            onClick={() => setIsFormOpen(false)}
                                                            className="flex-1 h-9 bg-white/5 text-white/40 rounded-lg font-black uppercase text-[9px] tracking-widest hover:bg-rose-500 hover:text-white transition-all"
                                                        >
                                                            {t('caller.cancel')}
                                                        </button>
                                                        <button 
                                                            disabled={isSavingCustomer || !formData.name}
                                                            onClick={() => handleSaveCustomer(activeCall)}
                                                            className="flex-[2] h-9 bg-emerald-600 text-white rounded-lg font-black uppercase text-[9px] tracking-widest hover:brightness-110 transition-all"
                                                        >
                                                            {isSavingCustomer ? t('caller.saving') : t('caller.save_complete')}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    <div className="flex gap-3 items-start">
                                                        <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 shrink-0">
                                                            <FiMapPin size={18} />
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="text-xs font-bold text-slate-300">Teslimat Adresi</p>
                                                            <p className="text-[11px] text-white leading-normal mt-0.5">
                                                                {matchingCustomers[activeCall.number]?.address || activeCall.address || t('caller.address_not_found')}
                                                            </p>
                                                            {(matchingCustomers[activeCall.number]?.address || activeCall.address) && (
                                                                <button className="text-[8px] font-black text-orange-500 uppercase tracking-widest mt-1.5 hover:underline block">{t('caller.show_map')}</button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {selectedCustomerDetail?.notes && (
                                                        <div className="pt-2 border-t border-white/5">
                                                            <p className="text-[8px] font-black text-slate-500 uppercase tracking-wider mb-1">Müşteri Notu</p>
                                                            <p className="text-[11px] text-amber-500 font-bold italic bg-amber-500/5 border border-amber-500/10 rounded-xl p-2.5">
                                                                {selectedCustomerDetail.notes}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 flex flex-col justify-end gap-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                <button 
                                                    onClick={() => handleDeleteClick(activeCall)}
                                                    className={`h-12 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-1.5 ${activeTab === 'history' ? 'w-full col-span-2' : ''}`}
                                                >
                                                    <FiTrash2 size={14} /> {t('caller.delete')}
                                                </button>
                                                {activeTab !== 'history' && (
                                                    <button 
                                                        disabled={hasActiveOrder}
                                                        onClick={() => handleAccept(activeCall)}
                                                        className={`h-12 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all flex items-center justify-center gap-1.5 ${
                                                            hasActiveOrder
                                                                ? 'bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed'
                                                                : 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/30 hover:brightness-110 active:scale-[0.98]'
                                                        }`}
                                                    >
                                                        <FiShoppingCart size={14} /> {hasActiveOrder ? 'SİPARİŞ AKTİF' : t('caller.open_order')}
                                                    </button>
                                                )}
                                            </div>

                                            {/* Register / Edit Customer Button */}
                                            {!isFormOpen && (
                                                <button 
                                                    disabled={isSavingCustomer}
                                                    onClick={() => {
                                                        const matched = matchingCustomers[activeCall.number];
                                                        setFormData({ 
                                                            name: matched?.name || activeCall.name || '', 
                                                            address: matched?.address || activeCall.address || '', 
                                                            note: matched?.notes || '' 
                                                        });
                                                        setIsFormOpen(true);
                                                    }}
                                                    className="w-full h-11 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-blue-500 hover:text-white transition-all flex items-center justify-center gap-1.5"
                                                >
                                                    <FiUser size={14} /> 
                                                    {(matchingCustomers[activeCall.number] || activeCall.customerId) 
                                                        ? 'Müşteri Bilgilerini Güncelle' 
                                                        : t('caller.register_customer')}
                                                </button>
                                            )}

                                            <p className="text-[8px] text-center text-white/10 font-bold uppercase tracking-[0.4em] mt-1">
                                                NEXTPOS CALLER ID GATEWAY
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 opacity-20 text-white">
                                <FiPhoneCall size={64} className="mb-4 text-emerald-500" />
                                <p className="font-black text-sm uppercase tracking-wider">
                                    {activeTab === 'active' ? 'Aktif Arama Bulunmuyor' : 'Arama Geçmişi Boş'}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1 max-w-[220px] leading-normal font-bold">
                                    {activeTab === 'active' 
                                        ? 'Şu anda aktif bir çağrı bulunmamaktadır.' 
                                        : 'Henüz kaydedilmiş bir arama geçmişi bulunmuyor.'}
                                </p>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
            <PinCodeModal 
                isOpen={isPinModalOpen}
                onClose={() => {
                    setIsPinModalOpen(false);
                    setCallToDelete(null);
                }}
                onSuccess={handlePinSuccess}
                title="YÖNETİCİ ŞİFRESİ"
                description="Çağrı geçmişi kaydını silmek için yönetici şifresi gereklidir."
            />
        </div>
    );
};
