import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { useUIStore } from '../store/useUIStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { getSocketOrigin } from '../lib/socketOrigin';
import toast from 'react-hot-toast';
import { FaWhatsapp } from 'react-icons/fa6';
import { FiPhoneCall } from 'react-icons/fi';

export const useCashierRealtimeSync = () => {
    const { token, tenantId } = useAuthStore();
    const { 
        fetchOrders, 
        fetchTables, 
        fetchCategories, 
        fetchProducts, 
        fetchModifiers,
        setTablePresence 
    } = usePosStore();

    const { 
        setPendingOnlineOrders, 
        addWhatsappOrder, 
        setOnlineOrderAlert,
        setCallerId,
        addRecentCall
    } = useUIStore();

    const [socket, setSocket] = useState<Socket | null>(null);
    const timerRef = useRef<any>(null);
    const menuPullRef = useRef<any>(null);
    const tablesPullRef = useRef<any>(null);

    useEffect(() => {
        if (!token || !tenantId) return;

        const newSocket = io(getSocketOrigin(), {
            auth: { token },
            query: { tenantId },
            path: '/socket.io',
            transports: ['polling', 'websocket'],
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
            setSocket(null);
        };
    }, [token, tenantId]);

    useEffect(() => {
        if (!socket) return;

        const onConnect = () => {
            console.log('Cashier Socket Connected');
            socket.emit('join:tenant', tenantId);
            socket.emit('presence:staff_register', { tenantId });
        };


        const onWhatsAppOrder = (data: any) => {
            addWhatsappOrder({
                ...data,
                receivedAt: new Date().toISOString()
            });

            toast.custom((t) => (
                <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-white dark:bg-slate-900 shadow-2xl rounded-3xl pointer-events-auto flex ring-1 ring-black ring-opacity-5 border-2 border-[#25D366]`}>
                    <div className="flex-1 w-0 p-4">
                        <div className="flex items-start">
                            <div className="flex-shrink-0 pt-0.5">
                                <div className="h-12 w-12 rounded-full bg-[#25D366] flex items-center justify-center text-white shadow-lg shadow-[#25D366]/30">
                                    <FaWhatsapp size={24} />
                                </div>
                            </div>
                            <div className="ml-4 flex-1">
                                <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                    Yeni WhatsApp Siparişi!
                                </p>
                                <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                                    {data.customerName || data.phone || 'Yeni Mesaj'}
                                </p>
                                <div className="mt-2 flex gap-2">
                                    <button 
                                        onClick={() => { toast.dismiss(t.id); useUIStore.getState().setWaOrder(true); }}
                                        className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 bg-[#25D366] text-white rounded-lg shadow-md hover:brightness-110"
                                    >
                                        Görüntüle
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ), { position: 'top-right', duration: 10000 });
            // Premium bildirim kartı
            useNotificationStore.getState().addNotification({
                kind: 'whatsapp_order',
                title: 'Yeni WhatsApp Siparişi!',
                body: data.customerName || data.phone || 'Yeni mesaj geldi',
                customerName: data.customerName,
                totalAmount: data.total,
                ttl: 15000,
            });
            void playNotification('new_order');
            void fetchOrders();
        };

        const onIncomingCall = (data: any) => {
            const callData = {
                ...data,
                receivedAt: new Date().toISOString()
            };
            addRecentCall(callData);
        };

        const flush = () => {
            void fetchOrders();
            void fetchTables();
        };

        const onOrderReady = (data: any) => {
            const orderIdStr = String(data.orderId || '');
            const shortId = orderIdStr.length > 4 ? orderIdStr.slice(-4) : orderIdStr;
            toast.success(`Sipariş Hazır: #${shortId}`, {
                icon: '🍳',
                style: { background: '#10b981', color: '#fff', fontWeight: 'bold' }
            });
            // Premium bildirim kartı
            useNotificationStore.getState().addNotification({
                kind: 'item_ready',
                title: `Sipariş #${shortId} Hazır!`,
                body: data.tableName ? `Masa: ${data.tableName}` : 'Mutfaktan hazır bilgisi',
                tableId: data.tableId != null ? Number(data.tableId) : undefined,
                tableName: data.tableName,
                orderId: data.orderId,
                ttl: 12000,
            });
            void playNotification('item_ready');
            void fetchOrders();
        };

        const onServiceCall = (data: any) => {
            const isBill = data.type === 'bill' || data.callType?.includes('bill');
            toast(`Masa ${data.tableName}: ${isBill ? 'Hesap İstiyor' : 'Garson Çağırıyor'}`, {
                icon: isBill ? '🧾' : '🔔',
                duration: 10000,
                position: 'top-right'
            });
            // Premium bildirim kartı
            useNotificationStore.getState().addNotification({
                kind: 'service_call',
                title: isBill ? 'Hesap İsteniyor' : 'Garson Çağrılıyor',
                body: `Masa ${data.tableName || '?'} — ${isBill ? 'Hesap talebi' : 'Müşteri garson bekliyor'}`,
                tableId: data.tableId != null ? Number(data.tableId) : undefined,
                tableName: data.tableName,
                ttl: 15000,
            });
            void playNotification('service_call');
            void fetchTables();
        };

        const onServiceCallUnanswered = (data: any) => {
            const waited = Number(data?.waitedSeconds) || 60;
            toast.error(`Garson ${waited} sn icinde yanitlamadi, cagriniz baska garsona yonlendirildi.`, {
                duration: 9000,
                position: 'top-right',
                icon: '⏱️',
            });
        };

        const onTableFocused = (data: any) => {
            if (!data?.tableId) return;
            useUIStore.getState().setTablePresence(Number(data.tableId), {
                waiterId: data.waiterId != null ? Number(data.waiterId) : 0,
                waiterName: String(data.waiterName || '')
            });
        };

        const onTableBlurred = (data: any) => {
            if (!data?.tableId) return;
            useUIStore.getState().setTablePresence(Number(data.tableId), null);
        };

        const onOnlineOrder = (data: any) => {
            const { addExternalOrder, setOnlineOrderAlert } = useUIStore.getState();
            
            addExternalOrder({
                id: data.id || `ext-${Date.now()}`,
                source: data.source || 'web',
                status: 'pending',
                customer_name: data.customerName || 'Web Siparişi (Test)',
                customer_phone: data.phone || 'N/A',
                delivery_address: data.address || '72070 Tübingen',
                order_type: data.order_type || 'delivery',
                payment_method: data.payment_method || 'cash',
                payment_status: data.payment_status || 'pending',
                total_amount: data.total || 0,

                created_at: data.receivedAt || new Date().toISOString(),
                items: data.items || [],
                notes: data.note || ''
            });

            setOnlineOrderAlert(true);
            toast.error('Yeni Online Sipariş Alındı!', {
                duration: 8000,
                position: 'top-right',
                icon: '🌐'
            });
            // Premium bildirim kartı
            useNotificationStore.getState().addNotification({
                kind: 'external_order',
                title: 'Yeni Online Sipariş!',
                body: `${data.customerName || 'Web Siparişi'} — ${data.order_type === 'delivery' ? 'Teslimat' : 'Gel-Al'}`,
                customerName: data.customerName,
                totalAmount: data.total,
                ttl: 15000,
            });
            void playNotification('new_order');
        };


        const scheduleMenuPull = () => {
            if (menuPullRef.current) clearTimeout(menuPullRef.current);
            menuPullRef.current = setTimeout(() => {
                void fetchCategories();
                void fetchProducts();
                void fetchModifiers();
                toast.success('Menü Güncellendi');
            }, 2000);
        };

        const scheduleTablesPull = () => {
            if (tablesPullRef.current) clearTimeout(tablesPullRef.current);
            tablesPullRef.current = setTimeout(() => {
                void fetchTables();
            }, 1000);
        };

        socket.on('connect', onConnect);
        socket.on('customer:service_call', onServiceCall);
        socket.on('cashier:service_call_unanswered', onServiceCallUnanswered);
        socket.on('table:focused', onTableFocused);
        socket.on('table:blurred', onTableBlurred);
        socket.on('table:viewing', onTableFocused);
        socket.on('table:stopped_viewing', onTableBlurred);
        socket.on('external_order:new', onOnlineOrder);
        socket.on('customer:whatsapp_order', onWhatsAppOrder);
        socket.on('sync:menu_revision', scheduleMenuPull);
        socket.on('sync:tables_changed', scheduleTablesPull);
        socket.on('order:new', (data: any) => {
            const tid = `order-${data.orderId || data.id || 'generic'}`;
            toast.success('Yeni Sipariş! 📋', { id: tid });
            flush();
        });
        socket.on('order:ready', onOrderReady);
        socket.on('order:status_changed', flush);
        socket.on('payment:received', (data: any) => {
            const pid = `order-${data.orderId || 'generic'}`;
            toast.success('Ödeme Alındı! 💰', { id: pid });
            flush();
        });
        socket.on('table:session_opened', flush);
        socket.on('order:courier_updated', (data: any) => {
            if (data?.courierId == null) {
                toast.error(`⚠️ Kurye Sipariş #${data?.orderId} atamasını KABUL ETMEDİ / İPTAL ETTİ!`, {
                    duration: 8000,
                    id: `courier-release-${data?.orderId}`,
                });
            } else {
                toast.success(`🛵 Kurye Sipariş #${data?.orderId} atamasını KABUL ETTİ!`, {
                    duration: 6000,
                    id: `courier-claim-${data?.orderId}`,
                });
            }
            flush();
        });
        socket.on('kitchen:ticket_updated', flush);
        socket.on('INCOMING_CALL', onIncomingCall);
        socket.on('external_order:simulated', onOnlineOrder);
        socket.on('CLEAR_CALL_HISTORY_SIGNAL', () => {
            localStorage.removeItem('pos-call-history');
            useUIStore.setState({ recentCalls: [], pendingCalls: 0 });
            toast.success('Arama geçmişi temizlendi.');
            setTimeout(() => {
                window.location.reload();
            }, 500);
        });


        const bc = new BroadcastChannel('pos-test-channel');
        bc.onmessage = (event) => {
            if (event.data.type === 'TEST_SIM_WHATSAPP') onWhatsAppOrder({
                id: `wa-test-${Date.now()}`,
                phone: '+49 162 ' + Math.floor(Math.random() * 9000000 + 1000000),
                customerName: 'Test Müşteri ' + Math.floor(Math.random() * 100),
                total: 24.50,
                receivedAt: new Date().toISOString(),
                items: [
                    { name: 'Special Pizza', price: 12.50, quantity: 1, notes: 'Acılı olsun' },
                    { name: 'Döner Dürüm', price: 7.00, quantity: 1 },
                    { name: 'Kola', price: 2.50, quantity: 2 }
                ],
                address: 'Berlin Str. 123, 10115 Berlin',
                note: 'Zili çalmayın lütfen.'
            });
            if (event.data.type === 'TEST_SIM_CALL') onIncomingCall({
                number: '+90 532 ' + Math.floor(Math.random() * 9000000 + 1000000),
                name: 'Arayan Test ' + Math.floor(Math.random() * 100),
                address: 'Örnek Mahallesi, Test Sokak No: ' + Math.floor(Math.random() * 50) + ', İstanbul',
                receivedAt: new Date().toISOString()
            });
            if (event.data.type === 'TEST_SIM_KITCHEN') usePosStore.getState().addFakeReadyOrder();
        };

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            if (menuPullRef.current) clearTimeout(menuPullRef.current);
            if (tablesPullRef.current) clearTimeout(tablesPullRef.current);
            socket.off('connect', onConnect);
            socket.off('customer:service_call', onServiceCall);
            socket.off('cashier:service_call_unanswered', onServiceCallUnanswered);
            socket.off('table:focused', onTableFocused);
            socket.off('table:blurred', onTableBlurred);
            socket.off('table:viewing', onTableFocused);
            socket.off('table:stopped_viewing', onTableBlurred);
            socket.off('external_order:new', onOnlineOrder);
            socket.off('customer:whatsapp_order', onWhatsAppOrder);
            socket.off('sync:menu_revision', scheduleMenuPull);
            socket.off('sync:tables_changed', scheduleTablesPull);
            socket.off('order:new');
            socket.off('order:ready', onOrderReady);
            socket.off('order:status_changed', flush);
            socket.off('payment:received');
            socket.off('table:session_opened', flush);
            socket.off('order:courier_updated');
            socket.off('kitchen:ticket_updated', flush);
            socket.off('INCOMING_CALL', onIncomingCall);
            socket.off('external_order:simulated');
            socket.off('CLEAR_CALL_HISTORY_SIGNAL');
            bc.close();
        };
    }, [
        socket,
        tenantId,
        token,
        fetchOrders,
        fetchTables,
        fetchCategories,
        fetchProducts,
        fetchModifiers,
        setTablePresence,
        setPendingOnlineOrders,
        addWhatsappOrder,
        setOnlineOrderAlert,
        setCallerId,
        addRecentCall
    ]);
}
