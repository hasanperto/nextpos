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

import QueueDisplay from './pages/QueueDisplay';
import HandoverPanel from './pages/HandoverPanel';
import { Toaster } from 'react-hot-toast';

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

const KITCHEN_ROLES = new Set(['kitchen', 'admin', 'cashier']);
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

function SaaSAdminRedirect() {
    React.useEffect(() => {
        const target = (import.meta.env.VITE_SAAS_ADMIN_URL as string) || 'http://localhost:5176/saas-admin';
        window.location.replace(target);
    }, []);
    return null;
}

function App() {
    return (
        <Router>
            <PosLocaleProvider>
                <OfflineSyncHost />
                <Routes>
                    {/* Public Routes */}
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/saas-admin" element={<SaaSAdminRedirect />} />

                    {/* Protected Routes */}
                    <Route path="/" element={
                        <ProtectedRoute><Navigate to="/cashier" replace /></ProtectedRoute>
                    } />
                    <Route path="/cashier" element={
                        <ProtectedRoute><PosTerminal /></ProtectedRoute>
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
                        <Route path="customers" element={<AdminCustomers />} />
                        <Route path="campaigns" element={<AdminCampaigns />} />
                        <Route path="reservations" element={<AdminReservations />} />
                        <Route path="reports" element={<AdminReports />} />
                        <Route path="stock" element={<AdminStock />} />
                        <Route path="recipes" element={<AdminRecipes />} />
                        <Route path="delivery" element={<AdminDeliveryZones />} />
                        <Route path="couriers" element={<AdminCouriers />} />
                        <Route path="designer" element={<FloorPlanDesigner />} />
                        <Route path="settings" element={<AdminSettings />} />
                        <Route path="accounting" element={<AdminAccounting />} />
                    </Route>
                    <Route path="/waiter" element={<WaiterRoute><WaiterPanel /></WaiterRoute>} />
                    <Route path="/courier" element={
                        <CourierRoute><CourierPanel /></CourierRoute>
                    } />

                    <Route path="/queue" element={<QueueDisplay />} />
                    <Route path="/handover" element={<ProtectedRoute><HandoverPanel /></ProtectedRoute>} />

                    {/* Customer Menu / QR */}
                    <Route path="/qr/:tableId" element={<CustomerMenu />} />
                    <Route path="/qr" element={<CustomerMenu />} />
                    {/* Masa tableti — kiosk dijital menü */}
                    <Route path="/kiosk/:tableId" element={<KioskCustomerMenu />} />
                    <Route path="/kiosk" element={<KioskCustomerMenu />} />

                    {/* Fallback */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                <Toaster position="top-right" />
            </PosLocaleProvider>
        </Router>
    );
}

export default App;
