import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PosLocaleProvider } from '@pos/contexts/PosLocaleContext';
import { useAuthStore } from '@pos/store/useAuthStore';
import { AdminMenu } from '@pos/pages/AdminMenu';
import { AdminShell } from '@pos/pages/AdminShell';
import { AdminDashboard } from '@pos/pages/AdminDashboard';
import { AdminFloor } from '@pos/pages/AdminFloor';
import { AdminStaff } from '@pos/pages/AdminStaff';
import { AdminReports } from '@pos/pages/AdminReports';
import { AdminStock } from '@pos/pages/AdminStock';
import { AdminRecipes } from '@pos/pages/AdminRecipes';
import { AdminDeliveryZones } from '@pos/pages/AdminDeliveryZones';
import { AdminCustomers } from '@pos/pages/AdminCustomers';
import { AdminSettings } from '@pos/pages/AdminSettings';
import { AdminReservations } from '@pos/pages/AdminReservations';
import { AdminCampaigns } from '@pos/pages/AdminCampaigns';
import { AdminCouriers } from '@pos/pages/AdminCouriers';
import { AdminAccounting } from '@pos/pages/AdminAccounting';
import { AdminStaffPerformance } from '@pos/pages/AdminStaffPerformance';
import { SaaSAdmin } from '@pos/pages/SaaSAdmin';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, user } = useAuthStore();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    const role = String(user?.role || '').toLowerCase();
    const allowed = new Set(['admin', 'owner', 'manager', 'super_admin']);
    if (!allowed.has(role)) return <Navigate to="/login" replace />;
    return <>{children}</>;
};

export default function App() {
    return (
        <BrowserRouter>
            <PosLocaleProvider>
            <Routes>
                <Route path="/login" element={<SaaSAdmin />} />
                <Route path="/saas-admin" element={<SaaSAdmin />} />
                <Route path="/" element={<Navigate to="/admin" replace />} />
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
                    <Route path="reports" element={<AdminReports />} />
                    <Route path="stock" element={<AdminStock />} />
                    <Route path="recipes" element={<AdminRecipes />} />
                    <Route path="delivery" element={<AdminDeliveryZones />} />
                    <Route path="settings" element={<AdminSettings />} />
                    <Route path="reservations" element={<AdminReservations />} />
                    <Route path="campaigns" element={<AdminCampaigns />} />
                    <Route path="couriers" element={<AdminCouriers />} />
                    <Route path="accounting" element={<AdminAccounting />} />
                </Route>
                <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
            </PosLocaleProvider>
        </BrowserRouter>
    );
}
