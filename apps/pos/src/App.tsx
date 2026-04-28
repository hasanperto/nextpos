import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import LoginPage from './pages/LoginPage';
import PosTerminal from './pages/PosTerminal';
import KitchenMonitor from './pages/KitchenMonitor';
import { WaiterPanel } from './pages/WaiterPanel';
import { CourierPanel } from './pages/CourierPanel';
import { CustomerMenu } from './pages/CustomerMenu';
import { KioskCustomerMenu } from './pages/KioskCustomerMenu';
import { AdminMenu } from './pages/AdminMenu';
import { AdminShell } from './pages/AdminShell';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminFloor } from './pages/AdminFloor';
import { AdminStaff } from './pages/AdminStaff';
import { AdminStaffPerformance } from './pages/AdminStaffPerformance';
import { AdminReports } from './pages/AdminReports';
import { AdminCustomers } from './pages/AdminCustomers';
import { AdminStock } from './pages/AdminStock';
import { AdminRecipes } from './pages/AdminRecipes';
import { AdminDeliveryZones } from './pages/AdminDeliveryZones';
import { AdminCouriers } from './pages/AdminCouriers';
import { AdminSettings } from './pages/AdminSettings';
import { AdminAccounting } from './pages/AdminAccounting';
import { AdminCampaigns } from './pages/AdminCampaigns';
import { AdminReservations } from './pages/AdminReservations';
import FloorPlanDesigner from './pages/FloorPlanDesigner';
import SaaSAdmin from './pages/SaaSAdmin';

import QueueDisplay from './pages/QueueDisplay';
import HandoverPanel from './pages/HandoverPanel';
import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineBanner } from './components/OfflineBanner';

// Auth-protected route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated } = useAuthStore();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    return <>{children}</>;
};

function getEntitlementEnabled(
    billingWorkspace: { entitlements?: { code: string; enabled: boolean }[] } | null | undefined,
    code: string
): boolean {
    const list = billingWorkspace?.entitlements;
    if (!Array.isArray(list)) return true;
    const hit = list.find((e) => String(e?.code) === code);
    if (!hit) return true;
    return Boolean(hit.enabled);
}

const COURIER_ROLES = new Set(['courier', 'admin', 'cashier']);

const CourierRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, user, billingWorkspace } = useAuthStore();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (!user?.role || !COURIER_ROLES.has(user.role)) {
        return <Navigate to="/cashier" replace />;
    }
    if (!getEntitlementEnabled(billingWorkspace, 'courier_module')) {
        return <Navigate to="/cashier" replace />;
    }
    return <>{children}</>;
};

// KDS (Kitchen Display System) erişimi: cashier rolünün yetkisi güvenlik gereği kaldırıldı. (Sadece kitchen ve admin)
const KITCHEN_ROLES = new Set(['kitchen', 'admin']);
const KitchenRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, user, billingWorkspace } = useAuthStore();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (!user?.role || !KITCHEN_ROLES.has(user.role)) {
        return <Navigate to="/cashier" replace />;
    }
    if (!getEntitlementEnabled(billingWorkspace, 'kitchen_display')) {
        return <Navigate to="/cashier" replace />;
    }
    return <>{children}</>;
};

const WAITER_ROLES = new Set(['waiter', 'admin', 'cashier']);
const WaiterRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, user, billingWorkspace } = useAuthStore();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (!user?.role || !WAITER_ROLES.has(user.role)) {
        return <Navigate to="/cashier" replace />;
    }
    if (!getEntitlementEnabled(billingWorkspace, 'waiter_tablet')) {
        return <Navigate to="/cashier" replace />;
    }
    return <>{children}</>;
};

// Handover (Teslim Merkezi) erişimi: Sadece admin ve cashier erişebilir.
const HANDOVER_ROLES = new Set(['admin', 'cashier']);
const HandoverRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, user } = useAuthStore();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (!user?.role || !HANDOVER_ROLES.has(user.role)) {
        return <Navigate to="/" replace />;
    }
    return <>{children}</>;
};

const CASHIER_ROLES = new Set(['admin', 'cashier']);
const CashierRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, user } = useAuthStore();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (!user?.role || !CASHIER_ROLES.has(user.role)) {
        // Redirect to their default path if they try to access cashier
        const fallback = user?.role === 'waiter' ? '/waiter' : 
                         user?.role === 'kitchen' ? '/kitchen' : 
                         user?.role === 'courier' ? '/courier' : '/login';
        return <Navigate to={fallback} replace />;
    }
    return <>{children}</>;
};

const EntitlementRoute: React.FC<{ code: string; children: React.ReactNode }> = ({ code, children }) => {
    const { billingWorkspace } = useAuthStore();
    if (!getEntitlementEnabled(billingWorkspace, code)) {
        return <Navigate to="/admin" replace />;
    }
    return <>{children}</>;
};

const KitchenRedirect: React.FC = () => {
    const { user } = useAuthStore();
    let st = 'all';
    if (user?.role === 'kitchen' && user.kitchen_station) {
        st = user.kitchen_station;
    } else {
        st = localStorage.getItem('kitchen_default_station') || 'all';
    }
    return <Navigate to={`/kitchen/${st}`} replace />;
};

import { PosLocaleProvider } from './contexts/PosLocaleContext';
import { useOfflineSyncBootstrap } from './hooks/useOfflineSyncBootstrap';

function OfflineSyncHost() {
    useOfflineSyncBootstrap();
    return null;
}

function App() {
    return (
        <Router>
            <ErrorBoundary>
                <PosLocaleProvider>
                    <OfflineSyncHost />
                    <OfflineBanner />
                    <Routes>
                        {/* Public Routes */}
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/saas-admin" element={<SaaSAdmin />} />

                        {/* Protected Routes */}
                        <Route path="/" element={
                            <CashierRoute><Navigate to="/cashier" replace /></CashierRoute>
                        } />
                        <Route path="/cashier" element={
                            <CashierRoute><PosTerminal /></CashierRoute>
                        } />
                        <Route path="/kitchen" element={<KitchenRoute><KitchenRedirect /></KitchenRoute>} />
                        <Route
                            path="/kitchen/:station"
                            element={
                                <KitchenRoute>
                                    <KitchenMonitor />
                                </KitchenRoute>
                            }
                        />
                        <Route
                            path="/admin"
                            element={
                                <ProtectedRoute>
                                    <AdminShell />
                                </ProtectedRoute>
                            }
                        >
                            <Route index element={<AdminDashboard />} />
                            <Route path="menu" element={<AdminMenu />} />
                            <Route path="floor" element={<AdminFloor />} />
                            <Route path="staff" element={<AdminStaff />} />
                            <Route path="staff-performance" element={<AdminStaffPerformance />} />
                            <Route path="customers" element={<EntitlementRoute code="customer_crm"><AdminCustomers /></EntitlementRoute>} />
                            <Route path="campaigns" element={<AdminCampaigns />} />
                            <Route path="reservations" element={<EntitlementRoute code="table_reservation"><AdminReservations /></EntitlementRoute>} />
                            <Route path="reports" element={<AdminReports />} />
                            <Route path="stock" element={<EntitlementRoute code="inventory"><AdminStock /></EntitlementRoute>} />
                            <Route path="recipes" element={<EntitlementRoute code="inventory"><AdminRecipes /></EntitlementRoute>} />
                            <Route path="delivery" element={<EntitlementRoute code="courier_module"><AdminDeliveryZones /></EntitlementRoute>} />
                            <Route path="couriers" element={<EntitlementRoute code="courier_module"><AdminCouriers /></EntitlementRoute>} />
                            <Route path="designer" element={<FloorPlanDesigner />} />
                            <Route path="settings" element={<AdminSettings />} />
                            <Route path="accounting" element={<AdminAccounting />} />
                        </Route>
                        <Route path="/waiter" element={<WaiterRoute><WaiterPanel /></WaiterRoute>} />
                        <Route path="/courier" element={
                            <CourierRoute><CourierPanel /></CourierRoute>
                        } />

                        <Route path="/queue" element={<QueueDisplay />} />
                        {/* Handover paneline HandoverRoute koruması eklendi */}
                        <Route path="/handover" element={<HandoverRoute><HandoverPanel /></HandoverRoute>} />

                        {/* Customer Menu / QR */}
                        <Route path="/qr/:tableId" element={<CustomerMenu />} />
                        <Route path="/qr" element={<CustomerMenu />} />
                        <Route path="/kiosk/:tableId" element={<KioskCustomerMenu />} />
                        <Route path="/kiosk" element={<KioskCustomerMenu />} />

                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                    <Toaster position="top-right" />
                </PosLocaleProvider>
            </ErrorBoundary>
        </Router>
    );
}

export default App;
