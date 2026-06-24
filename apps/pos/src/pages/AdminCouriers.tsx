import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
    FiUser, FiPackage, FiActivity, FiMapPin, FiClock, 
    FiCheckCircle, FiDollarSign, FiSearch,
    FiMap, FiList, FiAlertCircle, FiRefreshCw, FiAlertTriangle, FiCheck, FiNavigation, FiX,
    FiPieChart, FiMessageSquare, FiSliders, FiStar, FiChevronRight, FiSend
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { useCourierChat } from '../hooks/useCourierChat';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/Input';
import { getSocketOrigin } from '../lib/socketOrigin';

interface CourierTodayStats {
    total_deliveries: number;
    cash_collected: number;
    outstanding_cash: number;
    card_collected: number;
    avg_delivery_time: number;
}

interface CourierStats {
    id: number;
    name: string;
    username: string;
    isOnline: boolean;
    location: { lat: number; lng: number } | null;
    lastSeen: number | null;
    today: CourierTodayStats;
}

interface CourierDetail {
    courier: { id: number; name: string; username: string };
    recentOrders: any[];
    totalCashToDeliver: number;
}

const DEFAULT_MAP_CENTER = { lat: 41.0082, lng: 28.9784 };

export const AdminCouriers: React.FC = () => {
    const navigate = useNavigate();
    const { tenantId, token, getAuthHeaders } = useAuthStore();
    const { settings, fetchSettings } = usePosStore();
    const { t } = usePosLocale();
    const currency = settings?.currency || '₺';
    
    const [couriers, setCouriers] = useState<CourierStats[]>([]);
    const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null);
    const [courierDetail, setCourierDetail] = useState<CourierDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [locked, setLocked] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
    const [searchTerm, setSearchTerm] = useState('');
    const socketRef = useRef<Socket | null>(null);

    // Detail Panel Tab Controls
    const [detailTab, setDetailTab] = useState<'overview' | 'orders' | 'chat' | 'settings'>('overview');

    // Leaflet map states
    const [leafletLoaded, setLeafletLoaded] = useState(false);
    const [mapInstance, setMapInstance] = useState<any>(null);
    const [markers, setMarkers] = useState<Record<number, any>>({});
    const [leafletError, setLeafletError] = useState<string | null>(null);
    const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
    const restaurantMarkerRef = useRef<any>(null);

    useEffect(() => {
        void fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        const address = settings?.registration?.address?.trim();
        if (!address) {
            setMapCenter(null);
            return;
        }

        let cancelled = false;
        const geocodeAddress = async () => {
            try {
                const params = new URLSearchParams({
                    q: address,
                    format: 'json',
                    limit: '1',
                });
                const lang = String(settings?.language || 'tr').slice(0, 2);
                const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
                    headers: { 'Accept-Language': lang },
                });
                if (!res.ok || cancelled) return;

                const data = await res.json();
                const item = data?.[0];
                if (item && !cancelled) {
                    const lat = Number(item.lat);
                    const lng = Number(item.lon);
                    if (Number.isFinite(lat) && Number.isFinite(lng)) {
                        setMapCenter({ lat, lng });
                        return;
                    }
                }
                if (!cancelled) setMapCenter(null);
            } catch {
                if (!cancelled) setMapCenter(null);
            }
        };

        void geocodeAddress();
        return () => { cancelled = true; };
    }, [settings?.registration?.address, settings?.language]);

    // 1. Dynamic Leaflet CDN Loading
    useEffect(() => {
        // Prevent loading twice if it's already in the DOM
        const alreadyHasCss = !!document.querySelector('link[href*="leaflet.css"]');
        const alreadyHasJs = !!(window as any).L;

        if (alreadyHasCss && alreadyHasJs) {
            setLeafletLoaded(true);
            return;
        }

        if (!alreadyHasCss) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
            link.crossOrigin = '';
            document.head.appendChild(link);
        }

        if (alreadyHasJs) {
            setLeafletLoaded(true);
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
        script.crossOrigin = '';
        script.onload = () => {
            setLeafletLoaded(true);
            setLeafletError(null);
        };
        script.onerror = () => {
            setLeafletError('load_error');
        };
        document.head.appendChild(script);

        // Do not remove on unmount to prevent broken stylesheets and reload failures in SPA!
    }, []);

    // 2. Fetch stats
    const fetchStats = async () => {
        if (!tenantId) return;
        try {
            const resp = await fetch('/api/v1/admin/couriers/stats', {
                headers: getAuthHeaders()
            });
            if (resp.status === 403) {
                setLocked(true);
                setCouriers([]);
                return;
            }
            setLocked(false);
            if (resp.ok) {
                const data = await resp.json();
                setCouriers(data);
            }
        } catch (err) {
            console.error('fetchStats error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleRequestLocation = (id: number) => {
        if (!socketRef.current || !tenantId) return;
        socketRef.current.emit('admin:request_courier_location', { tenantId });
        toast.success(t('admin.couriers.toast.locationRequested'), { icon: '📡' });
    };

    // 3. Socket connections
    useEffect(() => {
        if (!token || !tenantId) return;

        const socket = io(getSocketOrigin(), {
            path: '/socket.io',
            transports: ['polling', 'websocket'],
            auth: { token },
            query: { tenantId }
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('join:tenant', tenantId);
        });

        socket.on('presence:staff_update', (data: any) => {
            if (data.tenantId === tenantId) {
                setCouriers(prev => prev.map(c => {
                    const match = data.staff.find((s: any) => String(s.userId) === String(c.id));
                    if (match) {
                        return { ...c, location: match.location || null, isOnline: true };
                    }
                    return { ...c, isOnline: false };
                }));
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [token, tenantId]);

    const fetchDetail = async (id: number) => {
        try {
            const resp = await fetch(`/api/v1/admin/couriers/${id}/details`, {
                headers: getAuthHeaders()
            });
            if (resp.status === 403) {
                setLocked(true);
                setCourierDetail(null);
                return;
            }
            setLocked(false);
            if (resp.ok) {
                const data = await resp.json();
                setCourierDetail(data);
            }
        } catch (err) {
            toast.error(t('admin.couriers.toast.detailLoadError'));
        }
    };

    const handleReconcile = async () => {
        if (!selectedCourierId) return;
        try {
            const resp = await fetch(`/api/v1/admin/couriers/${selectedCourierId}/reconcile`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            if (resp.status === 403) {
                setLocked(true);
                return;
            }
            setLocked(false);
            if (resp.ok) {
                toast.success(t('admin.couriers.toast.reconcileSuccess'), { icon: '💰' });
                fetchStats();
                fetchDetail(selectedCourierId);
            } else {
                toast.error(t('admin.couriers.toast.reconcileError'));
            }
        } catch (err) {
            toast.error(t('admin.couriers.toast.connectionError'));
        }
    };

    // Toggle courier status overrides
    const handleStatusOverride = async (id: number, status: 'online' | 'offline') => {
        toast.success(
            t('admin.couriers.toast.statusChanged').replace(
                '{{status}}',
                status === 'online' ? t('admin.couriers.toast.statusOnline') : t('admin.couriers.toast.statusOffline')
            ),
            { icon: '⚙️' }
        );
        setCouriers(prev => prev.map(c => {
            if (c.id === id) {
                return { ...c, isOnline: status === 'online' };
            }
            return c;
        }));
    };

    useEffect(() => {
        fetchStats();
        const iv = setInterval(fetchStats, 10000); // 10s live update
        return () => clearInterval(iv);
    }, []);

    useEffect(() => {
        if (selectedCourierId) {
            fetchDetail(selectedCourierId);
            setDetailTab('overview');
        } else {
            setCourierDetail(null);
        }
    }, [selectedCourierId]);

    const filteredCouriers = useMemo(() => {
        return couriers.filter(c => 
            c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.username.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [couriers, searchTerm]);

    // 4. Map Leaflet Initializations
    useEffect(() => {
        if (!leafletLoaded) return;

        const mapContainer = document.getElementById('logistics-map');
        if (!mapContainer) return;

        const L = (window as any).L;
        if (!L) return;

        let map = mapInstance;
        const center = mapCenter ?? DEFAULT_MAP_CENTER;

        if (!map) {
            map = L.map('logistics-map', {
                zoomControl: false,
                attributionControl: false
            }).setView([center.lat, center.lng], mapCenter ? 13 : 11);

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 20
            }).addTo(map);

            L.control.zoom({
                position: 'bottomright'
            }).addTo(map);

            setMapInstance(map);
        }

        // Force Leaflet viewport size recalculation (crucial inside dynamic/animated layouts)
        map.invalidateSize();

        const restaurantName = settings?.registration?.name?.trim() || t('settings.labels.restaurant');
        if (mapCenter) {
            const restaurantIcon = L.divIcon({
                html: `
                    <div class="relative flex items-center justify-center">
                        <div class="w-9 h-9 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-sm shadow-[0_0_12px_rgba(16,185,129,0.45)]">
                            🏪
                        </div>
                        <div class="absolute top-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-950/90 border border-emerald-500/20 px-2 py-0.5 rounded-md text-[8px] font-black uppercase text-emerald-300 tracking-wider shadow-lg">
                            ${restaurantName}
                        </div>
                    </div>
                `,
                className: 'custom-restaurant-leaflet-icon',
                iconSize: [36, 36],
                iconAnchor: [18, 18],
            });

            if (restaurantMarkerRef.current) {
                restaurantMarkerRef.current.setLatLng([mapCenter.lat, mapCenter.lng]);
            } else {
                restaurantMarkerRef.current = L.marker([mapCenter.lat, mapCenter.lng], { icon: restaurantIcon })
                    .addTo(map)
                    .bindPopup(`
                        <div class="font-sans text-[11px] text-white p-1">
                            <strong class="text-xs text-emerald-400 block mb-1 uppercase font-black">${restaurantName}</strong>
                            <span class="text-slate-400 block font-bold">${settings?.registration?.address || ''}</span>
                        </div>
                    `, { closeButton: false });
            }
        } else if (restaurantMarkerRef.current) {
            restaurantMarkerRef.current.remove();
            restaurantMarkerRef.current = null;
        }

        const newMarkers = { ...markers };
        const markerGroup: any[] = [];

        Object.keys(newMarkers).forEach((id) => {
            const numId = Number(id);
            const exists = filteredCouriers.find(c => c.id === numId && c.isOnline && c.location);
            if (!exists) {
                newMarkers[numId].remove();
                delete newMarkers[numId];
            }
        });

        filteredCouriers.forEach((c) => {
            if (!c.location || !c.isOnline) return;

            const iconHTML = `
                <div class="relative flex items-center justify-center">
                    <div class="absolute w-10 h-10 rounded-full bg-blue-500/25 border-2 border-blue-500 animate-ping"></div>
                    <div class="w-8 h-8 rounded-full bg-[#0c121d] border-2 border-blue-500 flex items-center justify-center text-xs font-black shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                        🛵
                    </div>
                    <div class="absolute top-9 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-950/90 border border-white/10 px-2 py-0.5 rounded-md text-[8px] font-black uppercase text-blue-300 tracking-wider shadow-lg">
                        ${c.name}
                    </div>
                </div>
            `;

            const customIcon = L.divIcon({
                html: iconHTML,
                className: 'custom-courier-leaflet-icon',
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });

            if (newMarkers[c.id]) {
                newMarkers[c.id].setLatLng([c.location.lat, c.location.lng]);
            } else {
                const marker = L.marker([c.location.lat, c.location.lng], { icon: customIcon })
                    .addTo(map)
                    .bindPopup(`
                        <div class="font-sans text-[11px] text-white p-1">
                            <strong class="text-xs text-blue-400 block mb-1 uppercase font-black">${c.name}</strong>
                            <span class="text-slate-400 block font-bold mb-2">@${c.username}</span>
                            <div class="border-t border-white/10 pt-2 flex gap-3">
                                                                <span>📦 <strong>${c.today?.total_deliveries || 0} ${t('admin.couriers.map.popupDeliveries')}</strong></span>
                                <span>💰 <strong class="text-emerald-400">${currency}${c.today?.outstanding_cash || 0}</strong></span>
                            </div>
                        </div>
                    `, { closeButton: false });
                newMarkers[c.id] = marker;
            }
            markerGroup.push(newMarkers[c.id]);
        });

        setMarkers(newMarkers);

        const boundsMarkers = [...markerGroup];
        if (restaurantMarkerRef.current) {
            boundsMarkers.push(restaurantMarkerRef.current);
        }

        if (boundsMarkers.length > 1) {
            const group = L.featureGroup(boundsMarkers);
            map.fitBounds(group.getBounds().pad(0.3));
        } else if (boundsMarkers.length === 1) {
            const marker = boundsMarkers[0];
            const latLng = marker.getLatLng();
            map.setView([latLng.lat, latLng.lng], mapCenter ? 13 : 11);
        } else {
            map.setView([center.lat, center.lng], mapCenter ? 13 : 11);
        }

    }, [leafletLoaded, filteredCouriers, mapInstance, mapCenter, settings?.registration?.name, settings?.registration?.address, t, currency]);

    // Direct active order in-transit selector for direct socket chat
    const activeChatOrder = useMemo(() => {
        if (!courierDetail?.recentOrders) return null;
        // status is shipped or ready
        return courierDetail.recentOrders.find(o => o.status === 'shipped' || o.status === 'ready');
    }, [courierDetail]);

    const [chatOrderId, setChatOrderId] = useState<number | null>(null);

    useEffect(() => {
        if (activeChatOrder) {
            setChatOrderId(activeChatOrder.id);
        } else {
            setChatOrderId(null);
        }
    }, [activeChatOrder]);

    const { messages, sendMessage } = useCourierChat(chatOrderId, 'cashier');
    const [adminMessageText, setAdminMessageText] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendAdminMessage = (e: React.FormEvent) => {
        e.preventDefault();
        const text = adminMessageText.trim();
        if (!text) return;
        sendMessage(text);
        setAdminMessageText('');
    };

    const totalOutstandingToday = useMemo(() => 
        couriers.reduce((sum, c) => sum + (c.today?.outstanding_cash || 0), 0)
    , [couriers]);

    const totalDeliveriesToday = useMemo(() => 
        couriers.reduce((sum, c) => sum + (c.today?.total_deliveries || 0), 0)
    , [couriers]);

    const statsCards = useMemo(() => [
        { label: t('admin.couriers.metric.totalDeliveries'), value: totalDeliveriesToday, unit: t('admin.couriers.metric.unitPiece'), icon: <FiPackage className="text-blue-400" />, shadow: 'shadow-blue-500/5' },
        { label: t('admin.couriers.metric.outstandingCash'), value: `${currency}${totalOutstandingToday.toLocaleString()}`, unit: t('admin.couriers.metric.onHand'), icon: <FiDollarSign className="text-emerald-400" />, shadow: 'shadow-emerald-500/5' },
        { label: t('admin.couriers.metric.onlineCouriers'), value: couriers.filter(c => c.isOnline).length, unit: t('admin.couriers.metric.onlineOfTotal').replace('{{total}}', String(couriers.length)), icon: <FiActivity className="text-rose-400" />, shadow: 'shadow-rose-500/5' },
        { label: t('admin.couriers.metric.avgDeliveryTime'), value: '18', unit: t('admin.couriers.metric.minutes'), icon: <FiClock className="text-amber-400" />, shadow: 'shadow-amber-500/5' },
    ], [t, totalDeliveriesToday, currency, totalOutstandingToday, couriers]);

    const detailTabs = useMemo(() => [
        { id: 'overview', label: t('admin.couriers.tab.overview'), icon: <FiPieChart size={14} /> },
        { id: 'orders', label: t('admin.couriers.tab.orders'), icon: <FiPackage size={14} /> },
        { id: 'chat', label: t('admin.couriers.tab.chat'), icon: <FiMessageSquare size={14} />, badge: activeChatOrder ? t('admin.couriers.tab.activeBadge') : null },
        { id: 'settings', label: t('admin.couriers.tab.settings'), icon: <FiSliders size={14} /> },
    ], [t, activeChatOrder]);

    if (locked) {
        return (
            <div className="p-6">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <div className="mb-2 text-sm font-black text-white">{t('modules.locked.title')}</div>
                    <div className="mb-4 text-xs font-semibold text-slate-400">{t('modules.locked.courier.desc')}</div>
                    <button
                        type="button"
                        onClick={() => navigate('/admin/settings', { replace: true })}
                        className="rounded-xl border border-violet-500/40 bg-violet-600/30 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-violet-100 hover:bg-violet-600/50 transition-all"
                    >
                        {t('modules.locked.cta')}
                    </button>
                </div>
            </div>
        );
    }

    const safetyLimit = 100;

    return (
        <main className="flex-1 overflow-auto bg-[#020617] text-white p-4 md:p-8 relative">
            <style>{`
                .leaflet-container {
                    background: #020617 !important;
                }
                .custom-courier-leaflet-icon {
                    background: transparent !important;
                    border: none !important;
                }
                .leaflet-popup-content-wrapper {
                    background: #0c121d !important;
                    border: 1px solid rgba(255, 255, 255, 0.1) !important;
                    color: white !important;
                    border-radius: 20px !important;
                    padding: 8px !important;
                    box-shadow: 0 15px 30px rgba(0, 0, 0, 0.5) !important;
                }
                .leaflet-popup-tip {
                    background: #0c121d !important;
                    border: 1px solid rgba(255, 255, 255, 0.1) !important;
                }
            `}</style>

            {/* Ambient glows */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[20%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[150px]" />
            </div>

            <div className="relative z-10">
                <header className="mb-10">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                            <motion.h2 
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="text-4xl font-black italic tracking-tighter uppercase mb-2 flex items-center gap-3"
                            >
                                <span className="bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">{t('admin.couriers.titleAccent')}</span>
                                <span className="text-white">{t('admin.couriers.titleMain')}</span>
                            </motion.h2>
                            <p className="text-slate-500 font-bold uppercase text-[9px] tracking-[0.35em]">
                                {t('admin.couriers.subtitle')}
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="w-72">
                                <Input 
                                    placeholder={t('admin.couriers.searchPlaceholder')}
                                    value={searchTerm}
                                    onChange={(val) => setSearchTerm(val)}
                                    icon={<FiSearch />}
                                    className="bg-white/5 border border-white/10"
                                />
                            </div>
                            <div className="flex bg-[#0f172a]/65 rounded-2xl p-1 border border-white/5 backdrop-blur-md">
                                <button 
                                    type="button"
                                    onClick={() => setViewMode('grid')}
                                    className={`p-2.5 rounded-xl transition-all duration-300 cursor-pointer border ${viewMode === 'grid' ? 'bg-blue-600/10 border-blue-500/35 text-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.08)]' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-350'}`}
                                >
                                    <FiMap size={18} />
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setViewMode('table')}
                                    className={`p-2.5 rounded-xl transition-all duration-300 cursor-pointer border ${viewMode === 'table' ? 'bg-blue-600/10 border-blue-500/35 text-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.08)]' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-350'}`}
                                >
                                    <FiList size={18} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Stats Metrics Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-10">
                        {statsCards.map((stat, i) => (
                            <motion.div 
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.08 }}
                                className={`bg-white/[0.02] border border-white/5 rounded-[28px] p-6 relative overflow-hidden group hover:border-white/15 transition-all shadow-xl ${stat.shadow}`}
                            >
                                <div className="absolute top-4 right-4 p-3 bg-white/5 rounded-2xl opacity-80 group-hover:scale-110 transition-all text-xl">
                                    {stat.icon}
                                </div>
                                <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-2">{stat.label}</p>
                                <h4 className="text-3xl font-black tracking-tight tabular-nums flex items-baseline gap-1.5">
                                    {stat.value}
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">{stat.unit}</span>
                                </h4>
                            </motion.div>
                        ))}
                    </div>
                </header>

                {loading && couriers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-6">
                        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin shadow-2xl shadow-blue-500/20" />
                        <p className="text-slate-500 font-black uppercase tracking-widest text-xs animate-pulse">{t('admin.couriers.syncing')}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        {/* Courier Content Grid */}
                        <div className={`${selectedCourierId ? 'lg:col-span-8' : 'lg:col-span-12'} flex flex-col gap-6`}>
                            
                            {/* Live Map Split Screen */}
                            {viewMode === 'grid' && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="w-full h-80 rounded-[36px] overflow-hidden border border-white/10 bg-[#070a13] relative shadow-2xl"
                                >
                                    <div id="logistics-map" className="w-full h-full relative z-10" />
                                    
                                    {!leafletLoaded && (
                                        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center z-20 gap-3 px-6 text-center">
                                            {leafletError ? (
                                                <>
                                                    <div className="w-10 h-10 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center border border-rose-500/20 mx-auto">
                                                        <FiAlertCircle size={20} />
                                                    </div>
                                                    <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">{t('admin.couriers.map.loadError')}</p>
                                                    <button 
                                                        onClick={() => window.location.reload()}
                                                        className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase text-slate-300 hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                                                    >
                                                        {t('admin.couriers.map.reload')}
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('admin.couriers.map.loading')}</p>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {leafletLoaded && filteredCouriers.filter(c => c.isOnline && c.location).length === 0 && (
                                        <div className="absolute top-4 left-4 z-[1000] bg-slate-950/90 border border-white/10 rounded-2xl px-4 py-3 shadow-xl backdrop-blur-md pointer-events-none">
                                            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                                                <FiAlertCircle /> {t('admin.couriers.map.listenMode')}
                                            </p>
                                            <p className="text-[9px] text-white/50 font-bold mt-1">{t('admin.couriers.map.noActiveCouriers')}</p>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {viewMode === 'grid' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                    <AnimatePresence mode="popLayout">
                                        {filteredCouriers.map((courier) => {
                                            const riskPercentage = Math.min(100, (courier.today?.outstanding_cash / safetyLimit) * 100);
                                            const isOverLimit = courier.today?.outstanding_cash >= safetyLimit;

                                            return (
                                                <motion.div
                                                    layout
                                                    key={courier.id}
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.95 }}
                                                    whileHover={{ y: -4 }}
                                                    onClick={() => setSelectedCourierId(courier.id === selectedCourierId ? null : courier.id)}
                                                    className={`bg-white/[0.02] backdrop-blur-md rounded-[32px] p-6 cursor-pointer border-2 transition-all relative overflow-hidden group ${
                                                        selectedCourierId === courier.id 
                                                            ? 'border-blue-500 bg-blue-600/[0.03] shadow-2xl shadow-blue-500/10' 
                                                            : 'border-white/5 hover:border-white/15'
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-start mb-6">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center relative transition-transform group-hover:scale-105 duration-300 ${
                                                                courier.isOnline 
                                                                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                                                                    : 'bg-slate-800 text-slate-600 border border-slate-700/50'
                                                            }`}>
                                                                <FiUser size={24} />
                                                                {courier.isOnline && (
                                                                    <div className="absolute -top-1 -right-1 w-4.5 h-4.5 bg-emerald-500 rounded-full border-4 border-[#020617] animate-pulse" />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <h3 className="font-black text-md tracking-tight uppercase italic">{courier.name}</h3>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest ${
                                                                        courier.isOnline 
                                                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                                                            : 'bg-slate-800/80 text-slate-500 border border-slate-700/30'
                                                                    }`}>
                                                                        {courier.isOnline ? t('admin.couriers.status.active') : t('admin.couriers.status.offline')}
                                                                    </span>
                                                                    <span className="text-[9px] text-slate-500 font-bold">@{courier.username}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[8px] font-black uppercase text-slate-500 tracking-wider mb-0.5">{t('admin.couriers.cashOnHand')}</p>
                                                            <div className={`font-black text-lg italic tabular-nums ${isOverLimit ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                                {currency}{courier.today?.outstanding_cash.toLocaleString()}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Risk Limit Indicator */}
                                                    <div className="mb-6 space-y-1.5">
                                                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                                                            <span className="text-slate-500">{t('admin.couriers.safetyLimit').replace('{{percent}}', riskPercentage.toFixed(0))}</span>
                                                            <span className={isOverLimit ? 'text-rose-400 animate-pulse' : 'text-slate-400'}>
                                                                {isOverLimit ? t('admin.couriers.limitExceeded') : `${currency}${safetyLimit}`}
                                                            </span>
                                                        </div>
                                                        <div className="h-2 w-full bg-white/5 border border-white/5 rounded-full overflow-hidden">
                                                            <div 
                                                                className={`h-full rounded-full transition-all duration-500 ${
                                                                    isOverLimit 
                                                                        ? 'bg-gradient-to-r from-rose-600 to-rose-400 shadow-[0_0_8px_#f43f5e]' 
                                                                        : riskPercentage > 60 
                                                                            ? 'bg-gradient-to-r from-amber-500 to-amber-300'
                                                                            : 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                                                                }`}
                                                                style={{ width: `${riskPercentage}%` }}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="bg-white/[0.01] rounded-2xl p-4 border border-white/5 hover:bg-white/5 transition-all">
                                                            <div className="flex items-center gap-2 text-slate-500 mb-1">
                                                                <FiPackage size={12} className="text-blue-400" />
                                                                <span className="text-[9px] font-black uppercase tracking-wider">{t('admin.couriers.card.deliveries')}</span>
                                                            </div>
                                                            <p className="text-xl font-black tabular-nums">{courier.today?.total_deliveries} <span className="text-slate-600 text-[10px] font-bold uppercase italic ml-1">{t('admin.couriers.metric.unitPiece')}</span></p>
                                                        </div>
                                                        <div className="bg-white/[0.01] rounded-2xl p-4 border border-white/5 hover:bg-white/5 transition-all">
                                                            <div className="flex items-center gap-2 text-slate-500 mb-1">
                                                                <FiClock size={12} className="text-amber-400" />
                                                                <span className="text-[9px] font-black uppercase tracking-wider">{t('admin.couriers.card.avgSpeed')}</span>
                                                            </div>
                                                            <p className="text-xl font-black tabular-nums">
                                                                {courier.today?.avg_delivery_time > 0 ? Math.round(courier.today.avg_delivery_time) : '--'} 
                                                                <span className="text-slate-600 text-[10px] font-bold uppercase italic ml-1">{t('admin.couriers.card.minutes')}</span>
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {courier.location && (
                                                        <div className="mt-4 bg-blue-500/5 p-4 rounded-2xl border border-blue-500/10 space-y-3 z-10 relative">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2 text-[9px] text-slate-400 font-bold select-all">
                                                                    <FiMapPin className="text-blue-500 animate-bounce" size={14} />
                                                                    {courier.location.lat.toFixed(4)}, {courier.location.lng.toFixed(4)}
                                                                </div>
                                                                <button 
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); handleRequestLocation(courier.id); }}
                                                                    className="p-2 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-all"
                                                                    title={t('admin.couriers.requestLocationTitle')}
                                                                >
                                                                    <FiRefreshCw size={14} />
                                                                </button>
                                                            </div>
                                                            <a 
                                                                href={`https://www.google.com/maps?q=${courier.location.lat},${courier.location.lng}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] transition-all"
                                                            >
                                                                <FiNavigation size={14} /> {t('admin.couriers.trackOnMap')}
                                                            </a>
                                                        </div>
                                                    )}
                                                    {!courier.location && courier.isOnline && (
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); handleRequestLocation(courier.id); }}
                                                            className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-500/5 hover:bg-blue-500/15 text-blue-400 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest border border-blue-500/10 transition-all active:scale-[0.98]"
                                                        >
                                                            <FiMapPin size={14} /> {t('admin.couriers.requestLocation')}
                                                        </button>
                                                    )}
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
                                </div>
                            ) : (
                                // Table view
                                <motion.div 
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-white/[0.02] border border-white/5 rounded-[32px] overflow-hidden shadow-2xl backdrop-blur-md"
                                >
                                    <table className="w-full border-collapse text-left text-xs">
                                        <thead>
                                            <tr className="border-b border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-500">
                                                <th className="p-6">{t('admin.couriers.col.partner')}</th>
                                                <th className="p-6">{t('admin.couriers.col.onlineStatus')}</th>
                                                <th className="p-6">{t('admin.couriers.col.todayDeliveries')}</th>
                                                <th className="p-6">{t('admin.couriers.col.avgTime')}</th>
                                                <th className="p-6">{t('admin.couriers.col.cashOnHand')}</th>
                                                <th className="p-6">{t('admin.couriers.col.actions')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5 font-bold">
                                            {filteredCouriers.map((courier) => (
                                                <tr 
                                                    key={courier.id} 
                                                    onClick={() => setSelectedCourierId(courier.id === selectedCourierId ? null : courier.id)}
                                                    className={`hover:bg-white/[0.03] transition-all cursor-pointer ${selectedCourierId === courier.id ? 'bg-blue-600/10' : ''}`}
                                                >
                                                    <td className="p-6 flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-slate-300 font-bold shrink-0">
                                                            <FiUser size={16} />
                                                        </div>
                                                        <div>
                                                            <p className="text-white font-black text-sm uppercase italic">{courier.name}</p>
                                                            <p className="text-[10px] text-slate-500 font-medium">@{courier.username}</p>
                                                        </div>
                                                    </td>
                                                    <td className="p-6">
                                                        <span className={`inline-flex items-center gap-1.5 text-[8px] font-black uppercase px-2 py-0.5 rounded border ${
                                                            courier.isOnline 
                                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                                                : 'bg-slate-800 text-slate-500 border-slate-700/50'
                                                        }`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${courier.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                                                            {courier.isOnline ? t('admin.couriers.status.active') : t('admin.couriers.status.offline')}
                                                        </span>
                                                    </td>
                                                    <td className="p-6 font-mono text-sm">{courier.today?.total_deliveries} {t('admin.couriers.metric.unitPiece')}</td>
                                                    <td className="p-6 font-mono text-sm">{courier.today?.avg_delivery_time > 0 ? `${Math.round(courier.today.avg_delivery_time)} ${t('admin.couriers.card.minutes')}` : '--'}</td>
                                                    <td className="p-6 font-mono text-sm text-emerald-400">{currency}{courier.today?.outstanding_cash.toLocaleString()}</td>
                                                    <td className="p-6" onClick={(e) => e.stopPropagation()}>
                                                        <div className="flex gap-2">
                                                            {courier.isOnline && (
                                                                <button 
                                                                    onClick={() => handleRequestLocation(courier.id)}
                                                                    className="p-2 bg-blue-500/10 hover:bg-blue-500/25 border border-blue-500/20 text-blue-400 rounded-lg transition-all"
                                                                    title={t('admin.couriers.requestLocationShort')}
                                                                >
                                                                    <FiMapPin size={14} />
                                                                </button>
                                                            )}
                                                            <button 
                                                                onClick={() => setSelectedCourierId(courier.id)}
                                                                className="px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/15 text-white rounded-lg transition-all text-[9px] font-black uppercase tracking-wider"
                                                            >
                                                                {t('admin.couriers.details')}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </motion.div>
                            )}
                        </div>

                        {/* HIGH-END LOGISTICS DISPATCHER CONTROL PANEL (Detail view) */}
                        <AnimatePresence mode="wait">
                            {selectedCourierId && (
                                <motion.div 
                                    initial={{ opacity: 0, x: 50 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 50 }}
                                    className="lg:col-span-4 sticky top-8 h-[calc(100vh-120px)] bg-white/[0.01] border border-white/5 rounded-[40px] p-6 flex flex-col overflow-hidden backdrop-blur-xl shadow-2xl z-20"
                                >
                                    {courierDetail ? (
                                        <>
                                            {/* Header */}
                                            <div className="flex items-center justify-between mb-6 shrink-0">
                                                <div className="min-w-0">
                                                    <h3 className="text-md font-black italic tracking-tighter uppercase flex items-center gap-1.5 text-white">
                                                        <span>{t('admin.couriers.control.title1')}</span>
                                                        <span className="text-blue-500">{t('admin.couriers.control.title2')}</span>
                                                    </h3>
                                                    <p className="text-[9px] text-slate-500 font-bold uppercase truncate tracking-wide mt-0.5">{courierDetail.courier.name} (@{courierDetail.courier.username})</p>
                                                </div>
                                                <button 
                                                    onClick={() => setSelectedCourierId(null)} 
                                                    className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/50 hover:text-white transition-all shrink-0"
                                                >
                                                    <FiX size={16} />
                                                </button>
                                            </div>

                                            {/* Dispatch Tabs selector */}
                                            <div className="flex bg-[#0f172a]/65 border border-white/5 p-1 rounded-2xl mb-6 shrink-0 backdrop-blur-md relative select-none">
                                                {detailTabs.map(tabItem => {
                                                    const isActive = detailTab === tabItem.id;
                                                    return (
                                                        <button
                                                            key={tabItem.id}
                                                            onClick={() => setDetailTab(tabItem.id as any)}
                                                            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[9px] font-extrabold uppercase tracking-wider transition-all duration-300 relative border cursor-pointer group ${
                                                                isActive 
                                                                    ? 'bg-blue-600/10 border-blue-500/35 text-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.08)]' 
                                                                    : 'bg-white/[0.01] border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] hover:border-white/5'
                                                            }`}
                                                        >
                                                            {React.cloneElement(tabItem.icon, { className: `w-3.5 h-3.5 transition-all duration-300 ${isActive ? 'scale-110 text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}` })}
                                                            <span className="hidden sm:inline">{tabItem.label}</span>
                                                            {tabItem.badge && (
                                                                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-rose-500 text-white text-[7px] font-black rounded-md animate-pulse">
                                                                    {tabItem.badge}
                                                                </span>
                                                            )}
                                                            {isActive && (
                                                                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3.5 h-[2px] bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.9)] animate-pulse" />
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Tab Contents */}
                                            <div className="flex-1 overflow-y-auto pr-1 min-h-0 custom-scrollbar">
                                                
                                                {/* Tab 1: OVERVIEW */}
                                                {detailTab === 'overview' && (
                                                    <div className="space-y-6 animate-in fade-in duration-200">
                                                        
                                                        {/* Financial Box */}
                                                        <div className={`rounded-3xl p-6 relative overflow-hidden group border ${
                                                            courierDetail.totalCashToDeliver >= safetyLimit 
                                                                ? 'bg-rose-950/20 border-rose-500/35 shadow-rose-900/10 text-white' 
                                                                : 'bg-gradient-to-br from-blue-600 to-indigo-700 border-blue-500/20 shadow-blue-900/25 text-white'
                                                        }`}>
                                                            {courierDetail.totalCashToDeliver >= safetyLimit && (
                                                                <div className="absolute top-2 right-2 px-2.5 py-1 bg-rose-500 text-white rounded-lg text-[8px] font-black uppercase tracking-wider animate-pulse flex items-center gap-1">
                                                                    <FiAlertTriangle /> {t('admin.couriers.riskAlarm')}
                                                                </div>
                                                            )}
                                                            <p className="text-blue-100/60 text-[10px] font-black uppercase tracking-[0.2em] mb-1">{t('admin.couriers.cashToCollect')}</p>
                                                            <h4 className="text-4xl font-black italic tracking-tight tabular-nums">{currency}{courierDetail.totalCashToDeliver.toLocaleString()}</h4>
                                                            
                                                            {courierDetail.totalCashToDeliver >= safetyLimit && (
                                                                <p className="text-[10px] text-rose-300 font-bold mt-2 leading-relaxed">
                                                                    {t('admin.couriers.limitWarning').replace('{{currency}}', currency).replace('{{limit}}', String(safetyLimit))}
                                                                </p>
                                                            )}
                                                            
                                                            <button 
                                                                type="button"
                                                                onClick={handleReconcile}
                                                                disabled={courierDetail.totalCashToDeliver <= 0}
                                                                className={`mt-6 w-full py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 disabled:opacity-30 disabled:scale-100 disabled:cursor-not-allowed transition-all shadow-lg ${
                                                                    courierDetail.totalCashToDeliver >= safetyLimit 
                                                                        ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/30' 
                                                                        : 'bg-white hover:scale-[1.02] text-blue-600 shadow-blue-950/30'
                                                                }`}
                                                            >
                                                                {t('admin.couriers.resetCash')}
                                                            </button>
                                                        </div>

                                                        {/* Courier Metrics & Performance */}
                                                        <div className="bg-white/5 border border-white/5 rounded-3xl p-5 space-y-4">
                                                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('admin.couriers.performance')}</h4>
                                                            
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                                                                    <p className="text-[9px] text-slate-500 uppercase font-black tracking-wider">{t('admin.couriers.efficiency')}</p>
                                                                    <div className="flex items-center gap-1 text-amber-400 font-black mt-1">
                                                                        <FiStar className="fill-amber-400" />
                                                                        <span className="text-white text-md">4.8</span>
                                                                        <span className="text-[10px] text-slate-500">/5</span>
                                                                    </div>
                                                                </div>
                                                                <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                                                                    <p className="text-[9px] text-slate-500 uppercase font-black tracking-wider">{t('admin.couriers.activeDuration')}</p>
                                                                    <p className="text-white text-md font-black mt-1">
                                                                        {couriers.find(c => c.id === selectedCourierId)?.isOnline ? t('admin.couriers.activeDurationSample') : '--'}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="pt-2 border-t border-white/5 flex justify-between items-center text-[10px] font-bold text-slate-400">
                                                                <span>{t('admin.couriers.courierScore')}</span>
                                                                <span className="text-emerald-400">{t('admin.couriers.flawless')}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Tab 2: DELIVERIES/ORDERS */}
                                                {detailTab === 'orders' && (
                                                    <div className="space-y-4 animate-in fade-in duration-200">
                                                        <div className="flex items-center justify-between text-slate-500 font-black text-[10px] uppercase tracking-widest mb-2 px-1">
                                                            <span>{t('admin.couriers.deliveryHistory')}</span>
                                                            <span>{t('admin.couriers.ordersCount').replace('{{count}}', String(courierDetail.recentOrders.length))}</span>
                                                        </div>

                                                        {courierDetail.recentOrders.map((order, i) => (
                                                            <div key={i} className="bg-white/[0.01] hover:bg-white/[0.03] rounded-2xl p-4 border border-white/5 transition-all group relative overflow-hidden">
                                                                {order.status === 'shipped' && (
                                                                    <div className="absolute top-0 left-0 h-full w-1 bg-purple-500 shadow-[0_0_8px_#a855f7]" />
                                                                )}
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <div className="max-w-[170px]">
                                                                        <h5 className="font-black text-xs uppercase truncate text-white mb-0.5 flex items-center gap-1.5">
                                                                            {order.status === 'shipped' && (
                                                                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-ping shrink-0" />
                                                                            )}
                                                                            {order.customer_name || t('admin.couriers.guestCustomer')}
                                                                        </h5>
                                                                        <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold">
                                                                            <FiMapPin size={10} className="shrink-0" />
                                                                            <span className="truncate">{order.delivery_address}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <p className="text-xs font-black italic text-white">{currency}{order.total_amount}</p>
                                                                        <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded mt-1 inline-block ${
                                                                            order.payment_method_arrival === 'cash' 
                                                                                ? order.courier_settled ? 'bg-emerald-500/10 text-emerald-500/50' : 'bg-emerald-500/20 text-emerald-400'
                                                                                : 'bg-blue-500/15 text-blue-300'
                                                                        }`}>
                                                                            {order.payment_method_arrival === 'cash' ? t('admin.couriers.payment.cash') : t('admin.couriers.payment.card')} {order.courier_settled && '✓'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-2">
                                                                    <div className="flex items-center gap-1.5 text-slate-500 text-[9px] font-bold uppercase">
                                                                        <FiClock /> {t('admin.couriers.duration').replace('{{minutes}}', String(Math.round(order.duration_mins || 15)))}
                                                                    </div>
                                                                    <span className="text-[9px] font-black uppercase">
                                                                        {order.status === 'shipped' ? (
                                                                            <span className="text-purple-400 animate-pulse">{t('admin.couriers.orderStatus.shipped')}</span>
                                                                        ) : order.status === 'completed' ? (
                                                                            <span className="text-emerald-500">{t('admin.couriers.orderStatus.completed')}</span>
                                                                        ) : (
                                                                            <span className="text-rose-500">{t('admin.couriers.orderStatus.cancelled')}</span>
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}

                                                        {courierDetail.recentOrders.length === 0 && (
                                                            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-600 text-center">
                                                                <FiPackage size={40} opacity={0.15} />
                                                                <p className="text-[10px] font-black uppercase tracking-widest">{t('admin.couriers.noOrders')}</p>
                                                                <p className="text-[8px] text-slate-700 uppercase">{t('admin.couriers.noOrdersHint')}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Tab 3: DIRECT WEB-SOCKET CHAT */}
                                                {detailTab === 'chat' && (
                                                    <div className="h-full flex flex-col animate-in fade-in duration-200 min-h-[350px]">
                                                        <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-4 shrink-0">
                                                            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse shadow-[0_0_8px_rgba(168,85,247,0.7)]" />
                                                            <span className="text-[10px] font-black uppercase text-purple-300 tracking-wider">{t('admin.couriers.chatChannel')}</span>
                                                        </div>

                                                        {chatOrderId ? (
                                                            <div className="flex-1 flex flex-col min-h-0 bg-black/45 border border-white/5 rounded-3xl p-4 overflow-hidden relative shadow-inner">
                                                                {/* Messages Scrollbox */}
                                                                <div className="flex-1 overflow-y-auto space-y-2.5 mb-4 pr-1 min-h-0 text-xs custom-scrollbar">
                                                                    {messages.length > 0 ? (
                                                                        messages.map((msg, idx) => (
                                                                            <div key={idx} className={`flex flex-col ${msg.sender === 'cashier' ? 'items-end' : 'items-start'}`}>
                                                                                <div className={`p-3 rounded-2xl max-w-[85%] font-bold leading-relaxed ${
                                                                                    msg.sender === 'cashier' 
                                                                                        ? 'bg-purple-600 text-white rounded-tr-none shadow-[0_0_10px_rgba(168,85,247,0.2)]' 
                                                                                        : 'bg-white/10 text-white/90 rounded-tl-none border border-white/5'
                                                                                }`}>
                                                                                    {msg.text}
                                                                                </div>
                                                                                <span className="text-[9px] text-white/40 mt-1 px-1">{msg.time}</span>
                                                                            </div>
                                                                        ))
                                                                    ) : (
                                                                        <div className="h-full flex flex-col items-center justify-center text-center opacity-30 py-10">
                                                                            <FiMessageSquare className="text-slate-400 mb-2" size={28} />
                                                                            <p className="text-[9px] font-black uppercase tracking-widest">{t('admin.couriers.chatNotStarted')}</p>
                                                                            <p className="text-[8px] text-slate-500 mt-1 uppercase">{t('admin.couriers.chatStartHint')}</p>
                                                                        </div>
                                                                    )}
                                                                    <div ref={chatEndRef} />
                                                                </div>

                                                                {/* Form */}
                                                                <form onSubmit={handleSendAdminMessage} className="flex gap-2 shrink-0 border-t border-white/5 pt-2 z-10 relative flex-1 items-center">
                                                                    <div className="flex-1">
                                                                        <Input 
                                                                            placeholder={t('admin.couriers.chatPlaceholder')}
                                                                            value={adminMessageText}
                                                                            onChange={(val) => setAdminMessageText(val)}
                                                                            icon={<FiMessageSquare />}
                                                                            className="bg-white/5 border border-white/10"
                                                                        />
                                                                    </div>
                                                                    <button 
                                                                        type="submit"
                                                                        className="w-12 h-12 bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center rounded-2xl transition-all shadow-md active:scale-95 shrink-0 animate-in fade-in"
                                                                    >
                                                                        <FiSend size={16} />
                                                                    </button>
                                                                </form>
                                                            </div>
                                                        ) : (
                                                            <div className="bg-white/5 border border-white/5 p-6 rounded-3xl text-center space-y-4 shadow-xl">
                                                                <div className="w-12 h-12 bg-purple-500/10 text-purple-400 rounded-2xl flex items-center justify-center mx-auto">
                                                                    <FiMessageSquare size={24} />
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-black uppercase text-purple-300 tracking-wider">{t('admin.couriers.radioOff')}</p>
                                                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide leading-relaxed mt-2">
                                                                        {t('admin.couriers.radioOffHint')}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Tab 4: SETTINGS/OVERRIDE */}
                                                {detailTab === 'settings' && (
                                                    <div className="space-y-6 animate-in fade-in duration-200">
                                                        <div className="bg-white/5 border border-white/5 rounded-3xl p-5 space-y-4">
                                                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('admin.couriers.adminBypass')}</h4>
                                                            
                                                            <div className="space-y-3">
                                                                <div className="flex justify-between items-center bg-black/20 p-4 rounded-2xl border border-white/5">
                                                                    <div>
                                                                        <p className="text-xs font-bold text-white uppercase">{t('admin.couriers.onlineStatus')}</p>
                                                                        <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">{t('admin.couriers.forceConnection')}</p>
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleStatusOverride(courierDetail.courier.id, 'online')}
                                                                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black uppercase rounded-lg shadow-md transition-all active:scale-95"
                                                                        >
                                                                            ON
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleStatusOverride(courierDetail.courier.id, 'offline')}
                                                                            className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-[9px] font-black uppercase rounded-lg shadow-md transition-all active:scale-95"
                                                                        >
                                                                            OFF
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRequestLocation(courierDetail.courier.id)}
                                                                    className="w-full flex items-center justify-center gap-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 py-3.5 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
                                                                >
                                                                    <FiRefreshCw size={14} /> {t('admin.couriers.refreshGps')}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
                                            <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                            <p className="text-[10px] font-black uppercase tracking-widest italic animate-pulse">{t('admin.couriers.loadingDetails')}</p>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </main>
    );
};
