import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { useUIStore } from '../store/useUIStore';
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

        const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;
        const newSocket = io(socketUrl, {
            auth: { token },
            query: { tenantId },
            transports: ['websocket']
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
            
            void fetchOrders();
        };

        const onIncomingCall = (data: any) => {
            const callData = {
                ...data,
                receivedAt: new Date().toISOString()
            };
            addRecentCall(callData);
            
            toast.custom((t) => (
                <div 
                    onClick={() => { toast.dismiss(t.id); useUIStore.getState().setCallerId(true, data); }}
                    className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-white dark:bg-slate-900 shadow-2xl rounded-3xl pointer-events-auto flex ring-1 ring-black ring-opacity-5 border-2 border-emerald-500 cursor-pointer hover:brightness-105 active:scale-[0.98] transition-all`}
                >
                    <div className="flex-1 w-0 p-4">
                        <div className="flex items-start">
                            <div className="flex-shrink-0 pt-0.5">
                                <div className="h-12 w-12 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
                                    <FiPhoneCall size={24} />
                                </div>
                            </div>
                            <div className="ml-4 flex-1">
                                <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                    Gelen Arama!
                                </p>
                                <p className="mt-1 text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                                    {data.number}
                                </p>
                                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 truncate">
                                    {data.name || 'Bilinmeyen Numara'}
                                </p>
                                <div className="mt-2 flex gap-2">
                                    <button 
                                        onClick={() => { toast.dismiss(t.id); useUIStore.getState().setCallerId(true, data); }}
                                        className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 bg-emerald-500 text-white rounded-lg shadow-md hover:brightness-110"
                                    >
                                        Cevapla / Görüntüle
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ), { position: 'top-right', duration: 15000 });
        };

        const flush = () => {
            void fetchOrders();
            void fetchTables();
        };

        const onOrderReady = (data: any) => {
            const orderIdStr = String(data.orderId || '');
            toast.success(`Sipariş Hazır: #${orderIdStr.length > 4 ? orderIdStr.slice(-4) : orderIdStr}`, {
                icon: '🍳',
                style: { background: '#10b981', color: '#fff', fontWeight: 'bold' }
            });
            void fetchOrders();
        };

        const onServiceCall = (data: any) => {
            toast(`Masa ${data.tableName}: ${data.type === 'bill' ? 'Hesap İstiyor' : 'Garson Çağırıyor'}`, {
                icon: data.type === 'bill' ? '🧾' : '🔔',
                duration: 10000,
                position: 'top-right'
            });
            void fetchTables();
        };

        const onTableFocused = (data: any) => {
            setTablePresence(data.tableId, data.waiterName);
        };

        const onTableBlurred = (data: any) => {
            setTablePresence(data.tableId, null);
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
        socket.on('table:focused', onTableFocused);
        socket.on('table:blurred', onTableBlurred);
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
        socket.on('order:courier_updated', flush);
        socket.on('kitchen:ticket_updated', flush);
        socket.on('INCOMING_CALL', onIncomingCall);
        socket.on('external_order:simulated', onOnlineOrder);


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
            socket.off('table:focused', onTableFocused);
            socket.off('table:blurred', onTableBlurred);
            socket.off('external_order:new', onOnlineOrder);
            socket.off('customer:whatsapp_order', onWhatsAppOrder);
            socket.off('sync:menu_revision', scheduleMenuPull);
            socket.off('sync:tables_changed', scheduleTablesPull);
            socket.off('order:new', flush);
            socket.off('order:ready', onOrderReady);
            socket.off('order:status_changed', flush);
            socket.off('payment:received', flush);
            socket.off('table:session_opened', flush);
            socket.off('order:courier_updated', flush);
            socket.off('kitchen:ticket_updated', flush);
            socket.off('INCOMING_CALL', onIncomingCall);
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
