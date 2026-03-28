import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import LoginPage from './pages/LoginPage';
import PosTerminal from './pages/PosTerminal';
import KitchenMonitor from './pages/KitchenMonitor';
import { WaiterPanel } from './pages/WaiterPanel';
import { CourierPanel } from './pages/CourierPanel';
import { CustomerMenu } from './pages/CustomerMenu';
import { SaaSAdmin } from './pages/SaaSAdmin';
import { AdminMenu } from './pages/AdminMenu';

// Auth-protected route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated } = useAuthStore();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    return <>{children}</>;
};

function App() {
    return (
        <Router>
            <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/saas-admin" element={<SaaSAdmin />} />

                {/* Protected Routes */}
                <Route path="/" element={
                    <ProtectedRoute><Navigate to="/cashier" replace /></ProtectedRoute>
                } />
                <Route path="/cashier" element={
                    <ProtectedRoute><PosTerminal /></ProtectedRoute>
                } />
                <Route path="/kitchen" element={
                    <ProtectedRoute><KitchenMonitor /></ProtectedRoute>
                } />
                <Route path="/admin" element={
                    <ProtectedRoute><AdminMenu /></ProtectedRoute>
                } />
                <Route path="/waiter" element={
                    <ProtectedRoute><WaiterPanel /></ProtectedRoute>
                } />
                <Route path="/courier" element={
                    <ProtectedRoute><CourierPanel /></ProtectedRoute>
                } />

                {/* Customer Menu / QR */}
                <Route path="/qr/:tableId" element={<CustomerMenu />} />
                <Route path="/qr" element={<CustomerMenu />} />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Router>
    );
}

export default App;
