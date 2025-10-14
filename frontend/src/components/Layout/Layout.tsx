import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import NotificationSystem from '../Notifications/NotificationSystem';
import { useWindowSize, useRouteHistory } from '../../hooks';
import { CalendarEvent } from '../../types';
import apiService from '../../services/api';

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const { width } = useWindowSize();
  const isMobile = width < 768;
  
  // Автоматично зберігаємо поточний маршрут
  useRouteHistory();

  // Завантаження подій для системи сповіщень
  useEffect(() => {
    const loadEvents = async () => {
      try {
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7); // Наступні 7 днів
        
        const response = await apiService.get('/events', {
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          }
        });
        
        setEvents(response.data || []);
      } catch (error) {
        console.error('Помилка завантаження подій для сповіщень:', error);
      }
    };

    loadEvents();
    
    // Оновлюємо події кожні 5 хвилин
    const interval = setInterval(loadEvents, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        isMobile={isMobile}
      />
      
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header 
          onMenuClick={() => setSidebarOpen(true)}
          isMobile={isMobile}
        />
        
        {/* Page content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
      
      {/* Mobile sidebar overlay */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black bg-opacity-50"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Система сповіщень */}
      <NotificationSystem events={events} />
    </div>
  );
};

export default Layout;