import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import NotificationSystem from '../Notifications/NotificationSystem';
import { useWindowSize, useRouteHistory } from '../../hooks';
import { CalendarEvent, isAdminRole, UserRole } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import apiService from '../../services/api';

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const { width } = useWindowSize();
  const { user } = useAuth();
  const isMobile = width < 768;
  const isAdmin = user ? isAdminRole(user.role as UserRole) : false;

  // Автоматично зберігаємо поточний маршрут
  useRouteHistory();

  // Завантаження подій тільки для адмінів (календар/події — адмін-функція)
  useEffect(() => {
    if (!isAdmin) return;

    const loadEvents = async (): Promise<void> => {
      try {
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);

        const response = await apiService.get<{ data: unknown[] }>('/events', {
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          }
        });

        setEvents((response as unknown as { data?: CalendarEvent[] }).data || []);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Помилка завантаження подій для сповіщень:', error);
      }
    };

    loadEvents();
    const interval = setInterval(loadEvents, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={(): void => setSidebarOpen(false)}
        isMobile={isMobile}
      />
      
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header 
          onMenuClick={(): void => setSidebarOpen(true)}
          isMobile={isMobile}
        />
        
        {/* Page content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-background p-2 sm:p-4 md:p-6">
          <div className="max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
      
      {/* Mobile sidebar overlay */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black bg-opacity-50"
          onClick={(): void => setSidebarOpen(false)}
          onKeyDown={(e): void => {
            if (e.key === 'Escape') {
              setSidebarOpen(false);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Закрити меню"
        />
      )}
      
      {/* Система сповіщень */}
      <NotificationSystem events={events} />
    </div>
  );
};

export default Layout;