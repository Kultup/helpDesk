import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, ProtectedRoute, useAuth } from './contexts/AuthContext';
import { PendingRegistrationsProvider } from './contexts/PendingRegistrationsContext';
import { ThemeProvider } from './contexts/ThemeContext';
import RoleBasedRedirect from './components/RoleBasedRedirect';
import { Layout } from './components/Layout';
import { UserRole, isAdminRole } from './types';
import './i18n'; // Ініціалізація i18n
import logService from './services/logService'; // Ініціалізація логів
import { Toaster } from 'react-hot-toast';
import SocketNotifications from './components/SocketNotifications';

// Імпорт компонентів
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tickets from './pages/Tickets';
import TicketDetails from './pages/TicketDetails';
import CreateTicket from './pages/CreateTicket';
import Cities from './pages/Cities';
import Positions from './pages/Positions';
import PositionRequests from './pages/PositionRequests';
import Institutions from './pages/Institutions';
import Users from './pages/Users';
import Analytics from './pages/Analytics';
import ActiveDirectoryPage from './pages/ActiveDirectory';
import QuickNotifications from './pages/QuickNotifications';
import Logs from './pages/Logs';
import TelegramSettings from './pages/TelegramSettings';
import AISettings from './pages/AISettings';
import BotSettings from './pages/BotSettings';
import ActiveDirectorySettings from './pages/ActiveDirectorySettings';
import ZabbixSettings from './pages/ZabbixSettings';
import TelegramTest from './pages/TelegramTest';
import PendingRegistrations from './pages/PendingRegistrations';
import Settings from './pages/Settings';
import PhotoViewer from './components/PhotoViewer';
import ErrorNotifications from './components/ErrorNotifications';
import Equipment from './pages/Equipment';
import Conversations from './pages/Conversations';
import AIKnowledge from './pages/AIKnowledge';

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
    return (
      <Navigate
        to={isAdminRole(user.role as UserRole) ? '/admin/dashboard' : '/dashboard'}
        replace
      />
    );
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
          <Toaster position="top-right" />
          <ErrorNotifications />
          <SocketNotifications />
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
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                {/* Користувацькі маршрути */}
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="tickets" element={<Tickets />} />
                <Route path="tickets/create" element={<CreateTicket />} />
                <Route path="tickets/:id" element={<TicketDetails />} />
                <Route path="settings" element={<Settings />} />

                {/* Адміністративні маршрути */}
                <Route
                  path="admin/dashboard"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/tickets"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <Tickets />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/tickets/create"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <CreateTicket />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/tickets/:id"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <TicketDetails />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/users"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <Users />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/pending-registrations"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <PendingRegistrations />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/cities"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <Cities />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/positions"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <Positions />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/position-requests"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <PositionRequests />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/institutions"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <Institutions />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/equipment"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <Equipment />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/quick-notifications"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <QuickNotifications />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/analytics"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <Analytics />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/active-directory"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <ActiveDirectoryPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/logs"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <Logs />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/settings/telegram"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <TelegramSettings />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/settings/bot"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <BotSettings />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/settings/ai"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <AISettings />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/conversations"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <Conversations />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/ai-knowledge"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <AIKnowledge />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/settings/active-directory"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <ActiveDirectorySettings />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/settings/zabbix"
                  element={
                    <ProtectedRoute requiredRole={UserRole.ADMIN}>
                      <ZabbixSettings />
                    </ProtectedRoute>
                  }
                />
              </Route>

              {/* Публічні роути (без авторизації) */}

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
