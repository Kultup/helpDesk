import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, ProtectedRoute, useAuth } from './contexts/AuthContext';
import { PendingRegistrationsProvider } from './contexts/PendingRegistrationsContext';
import { ThemeProvider } from './contexts/ThemeContext';
import RoleBasedRedirect from './components/RoleBasedRedirect';
import { Layout } from './components/Layout';
import { UserRole } from './types';
import './i18n'; // Ініціалізація i18n
import logService from './services/logService'; // Ініціалізація логів

// Імпорт компонентів
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tickets from './pages/Tickets';
import TicketDetails from './pages/TicketDetails';
import CreateTicket from './pages/CreateTicket';
import Cities from './pages/Cities';
import Positions from './pages/Positions';
import Institutions from './pages/Institutions';
import Users from './pages/Users';
import Analytics from './pages/Analytics';
import ActiveDirectoryPage from './pages/ActiveDirectory';
import Categories from './pages/Categories';
import Templates from './pages/Templates';
import CreateTemplate from './pages/CreateTemplate';
import QuickNotifications from './pages/QuickNotifications';
import Logs from './pages/Logs';

import TelegramTest from './pages/TelegramTest';
import PendingRegistrations from './pages/PendingRegistrations';
import Settings from './pages/Settings';
import PhotoViewer from './components/PhotoViewer';


// Компонент для розумного перенаправлення
const SmartRedirect: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (isAuthenticated && user) {
    if (user.role === UserRole.ADMIN) {
      return <Navigate to="/admin/dashboard" replace />;
    } else {
      return <Navigate to="/dashboard" replace />;
    }
  }
  
  return <Navigate to="/login" replace />;
};

// Компонент 404
const NotFound: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
        <p className="text-gray-600">Сторінка не знайдена</p>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  useEffect(() => {
    // Ініціалізуємо логи при запуску додатку
    logService.initialize();
    
    // Очищення при розмонтуванні
    return () => {
      logService.disconnect();
    };
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <PendingRegistrationsProvider>
          <Router>
            <RoleBasedRedirect />
            <Routes>
          {/* Публічні маршрути */}
          <Route path="/login" element={<Login />} />
          <Route path="/telegram-test" element={<TelegramTest />} />
          <Route path="/photo/:filename" element={<PhotoViewer />} />
          
          {/* Кореневий маршрут */}
          <Route path="/" element={<SmartRedirect />} />
          
          {/* Захищені маршрути з Layout */}
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            {/* Користувацькі маршрути */}
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="tickets" element={<Tickets />} />
            <Route path="tickets/create" element={<CreateTicket />} />
            <Route path="tickets/:id" element={<TicketDetails />} />
            <Route path="categories" element={<Categories />} />
            <Route path="templates" element={<Templates />} />
            <Route path="templates/new" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <CreateTemplate />
              </ProtectedRoute>
            } />
            <Route path="settings" element={<Settings />} />

            
            {/* Адміністративні маршрути */}
            <Route path="admin/dashboard" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="admin/tickets" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <Tickets />
              </ProtectedRoute>
            } />
            <Route path="admin/tickets/create" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <CreateTicket />
              </ProtectedRoute>
            } />
            <Route path="admin/tickets/:id" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <TicketDetails />
              </ProtectedRoute>
            } />
            <Route path="admin/users" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <Users />
              </ProtectedRoute>
            } />
            <Route path="admin/pending-registrations" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <PendingRegistrations />
              </ProtectedRoute>
            } />
            <Route path="admin/cities" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <Cities />
              </ProtectedRoute>
            } />
            <Route path="admin/positions" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <Positions />
              </ProtectedRoute>
            } />
            <Route path="admin/institutions" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <Institutions />
              </ProtectedRoute>
            } />
            <Route path="admin/categories" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <Categories />
              </ProtectedRoute>
            } />
            <Route path="admin/templates" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <Templates />
              </ProtectedRoute>
            } />
            <Route path="admin/templates/new" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <CreateTemplate />
              </ProtectedRoute>
            } />
            <Route path="admin/quick-notifications" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <QuickNotifications />
              </ProtectedRoute>
            } />
            <Route path="admin/analytics" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <Analytics />
              </ProtectedRoute>
            } />

            <Route path="admin/active-directory" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <ActiveDirectoryPage />
              </ProtectedRoute>
            } />
            <Route path="admin/logs" element={
              <ProtectedRoute requiredRole={UserRole.ADMIN}>
                <Logs />
              </ProtectedRoute>
            } />
          </Route>
          
          {/* 404 сторінка */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
      </PendingRegistrationsProvider>
    </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
