import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Bell, User, LogOut, Settings, UserPlus, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
// Theme context is no longer used
import { useClickOutside, useNotifications, useRegistrationNotifications } from '../../hooks';
import { usePendingRegistrationsContext } from '../../contexts/PendingRegistrationsContext';
import Button from '../UI/Button';
import NotificationDropdown from '../UI/NotificationDropdown';
import RegistrationDropdown from './RegistrationDropdown';
import HeaderCalendar from './HeaderCalendar';

import LanguageSelector from '../UI/LanguageSelector';

interface HeaderProps {
  onMenuClick: () => void;
  isMobile: boolean;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, isMobile }) => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  // Theme context is no longer used, but kept for compatibility
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [registrationMenuOpen, setRegistrationMenuOpen] = useState(false);
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
  const [bellAnimation, setBellAnimation] = useState(false);
  const [registrationAnimation, setRegistrationAnimation] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [registrationCount, setRegistrationCount] = useState(0);
  const userMenuRef = useClickOutside(() => setUserMenuOpen(false));
  const notificationMenuRef = useClickOutside(() => setNotificationMenuOpen(false));
  const registrationMenuRef = useClickOutside(() => setRegistrationMenuOpen(false));
  const calendarMenuRef = useClickOutside(() => setCalendarMenuOpen(false));
  const { notifications } = useNotifications();
  const { registrations, newRegistrationCount, resetNewRegistrationCount } = useRegistrationNotifications();
  const { count: contextRegistrationCount } = usePendingRegistrationsContext();
  const previousNotificationCountRef = useRef<number>(0);
  const previousRegistrationCountRef = useRef<number>(0);

  // Відстеження нових сповіщень для анімації іконки
  useEffect(() => {
    console.log('🔔 Header: notifications changed:', notifications);
    if (Array.isArray(notifications)) {
      const currentCount = notifications.length;
      const previousCount = previousNotificationCountRef.current;
      
      console.log('🔔 Header: currentCount:', currentCount, 'previousCount:', previousCount);
      
      // Якщо з'явилось нове сповіщення (збільшилась кількість)
      if (currentCount > previousCount) {
        console.log('🔔 Header: Starting bell animation');
        setBellAnimation(true);
        
        // Зупиняємо анімацію через 2 секунди
        setTimeout(() => {
          setBellAnimation(false);
        }, 2000);
      }
      
      // Оновлюємо попередню кількість
      previousNotificationCountRef.current = currentCount;
      
      // Встановлюємо кількість непрочитаних (всі сповіщення - це активні тікети)
      setUnreadCount(currentCount);
      console.log('🔔 Header: unreadCount set to:', currentCount);
    } else {
      // Якщо notifications undefined або не масив, встановлюємо 0
      console.log('🔔 Header: notifications is not array, setting unreadCount to 0');
      setUnreadCount(0);
    }
  }, [notifications]);

  // Відстеження нових запитів на реєстрацію для анімації іконки
  useEffect(() => {
    // Використовуємо кількість з контексту як основну, оскільки вона оновлюється через WebSocket в реальному часі
    const currentRegistrationCount = contextRegistrationCount;
    const previousRegistrationCount = previousRegistrationCountRef.current;
    
    console.log('👤 Header: Registration counts - context:', contextRegistrationCount, 'new:', newRegistrationCount, 'total:', currentRegistrationCount, 'previous:', previousRegistrationCount);
    
    // Оновлюємо кількість реєстрацій
    setRegistrationCount(currentRegistrationCount);
    
    // Якщо з'явилась нова реєстрація (збільшилась кількість)
    if (currentRegistrationCount > previousRegistrationCount && previousRegistrationCount >= 0) {
      console.log('👤 Header: Starting registration animation');
      setRegistrationAnimation(true);
      
      // Зупиняємо анімацію через 2 секунди
      setTimeout(() => {
        setRegistrationAnimation(false);
      }, 2000);
    }
    
    // Оновлюємо попередню кількість
    previousRegistrationCountRef.current = currentRegistrationCount;
  }, [contextRegistrationCount, newRegistrationCount]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Помилка виходу:', error);
    }
  };

  const handleNotificationClick = () => {
    setNotificationMenuOpen(!notificationMenuOpen);
    // Закриваємо інші меню якщо вони відкриті
    if (userMenuOpen) {
      setUserMenuOpen(false);
    }
    if (registrationMenuOpen) {
      setRegistrationMenuOpen(false);
    }
    if (calendarMenuOpen) {
      setCalendarMenuOpen(false);
    }
  };

  const handleRegistrationClick = () => {
    setRegistrationMenuOpen(!registrationMenuOpen);
    // Скидаємо лічильник нових реєстрацій
    resetNewRegistrationCount();
    // Закриваємо інші меню якщо вони відкриті
    if (userMenuOpen) {
      setUserMenuOpen(false);
    }
    if (notificationMenuOpen) {
      setNotificationMenuOpen(false);
    }
    if (calendarMenuOpen) {
      setCalendarMenuOpen(false);
    }
  };

  const handleCalendarClick = () => {
    setCalendarMenuOpen(!calendarMenuOpen);
    // Закриваємо інші меню якщо вони відкриті
    if (userMenuOpen) {
      setUserMenuOpen(false);
    }
    if (notificationMenuOpen) {
      setNotificationMenuOpen(false);
    }
    if (registrationMenuOpen) {
      setRegistrationMenuOpen(false);
    }
  };

  const handleUserMenuClick = () => {
    setUserMenuOpen(!userMenuOpen);
    // Закриваємо інші меню якщо вони відкриті
    if (notificationMenuOpen) {
      setNotificationMenuOpen(false);
    }
    if (registrationMenuOpen) {
      setRegistrationMenuOpen(false);
    }
    if (calendarMenuOpen) {
      setCalendarMenuOpen(false);
    }
  };

  return (
    <header className="bg-surface shadow-sm border-b border-border">
      <div className="flex items-center justify-between h-14 sm:h-16 px-2 sm:px-4">
        {/* Left side */}
        <div className="flex items-center">
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMenuClick}
              className="mr-1 sm:mr-2 h-8 w-8 sm:h-10 sm:w-10 p-0"
            >
              <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          )}
          
          <div className="flex items-center">
            <Link to="/dashboard" className="text-lg sm:text-xl font-bold text-primary-500 hover:text-primary-600 transition-colors duration-200">
              {t('sidebar.appName')}
            </Link>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center space-x-1 sm:space-x-2 lg:space-x-4">
          {/* Language Selector */}
          <LanguageSelector />
          
          {/* Notifications */}
          <div className="relative" ref={notificationMenuRef}>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleNotificationClick}
              className={`relative p-2 rounded-full transition-all duration-200 ${
                notificationMenuOpen ? 'bg-primary-100 text-primary-600' : 'text-gray-500 hover:bg-gray-100'
              }`}
              title={t('header.notifications')}
            >
              <Bell className={`h-5 w-5 sm:h-6 sm:w-6 ${bellAnimation ? 'animate-bell-ring text-primary-500' : ''}`} />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-500 rounded-full min-w-[18px] h-[18px]">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Button>
            
            {/* Notification Dropdown */}
            <NotificationDropdown
              tickets={notifications || []}
              isOpen={notificationMenuOpen}
              onClose={() => setNotificationMenuOpen(false)}
            />
          </div>

          {/* Position Requests - Admin Only */}
          {user?.role === 'admin' && (
            <div className="relative" ref={positionRequestsMenuRef}>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handlePositionRequestsClick}
                className={`relative p-2 rounded-full transition-all duration-200 ${
                  positionRequestsMenuOpen ? 'bg-primary-100 text-primary-600' : 'text-gray-500 hover:bg-gray-100'
                }`}
                title={t('positionRequests.title', 'Запити на посади')}
              >
                <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
                {positionRequestsCount > 0 && (
                  <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-blue-500 rounded-full min-w-[18px] h-[18px]">
                    {positionRequestsCount > 99 ? '99+' : positionRequestsCount}
                  </span>
                )}
              </Button>
              
              {positionRequestsMenuOpen && (
                <PositionRequestsDropdown 
                  requests={positionRequests} 
                  isLoading={positionRequestsLoading}
                  onClose={() => setPositionRequestsMenuOpen(false)} 
                />
              )}
            </div>
          )}

          {/* Registration Requests - Admin Only */}
          {user?.role === 'admin' && (
            <div className="relative" ref={registrationMenuRef}>
              <Button 
                variant="ghost" 
                size="sm" 
                className="relative h-8 w-8 sm:h-10 sm:w-10 p-0"
                onClick={handleRegistrationClick}
              >
                <UserPlus 
                  className={`h-4 w-4 sm:h-5 sm:w-5 transition-transform duration-200 ${
                    registrationAnimation ? 'animate-bounce text-blue-500' : ''
                  }`} 
                />
                {registrationCount > 0 && (
                  <span className={`absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 h-4 w-4 sm:h-5 sm:w-5 bg-blue-500 rounded-full flex items-center justify-center text-[10px] sm:text-xs text-white font-medium ${
                    registrationAnimation ? 'animate-pulse' : ''
                  }`}>
                    {registrationCount > 99 ? '99+' : registrationCount}
                  </span>
                )}
              </Button>

              {/* Registration Dropdown */}
              {registrationMenuOpen && (
                <RegistrationDropdown
                  registrations={registrations || []}
                  isLoading={false}
                  onClose={() => setRegistrationMenuOpen(false)}
                />
              )}
            </div>
          )}

          {/* Calendar - Only for admins */}
          {user?.role === 'admin' && (
            <div className="relative" ref={calendarMenuRef}>
              <Button 
                variant="ghost" 
                size="sm" 
                className="relative h-8 w-8 sm:h-10 sm:w-10 p-0"
                onClick={handleCalendarClick}
              >
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600 hover:text-primary-600 transition-colors duration-200" />
              </Button>

              {/* Calendar Dropdown */}
              {calendarMenuOpen && (
                <div className="absolute right-0 mt-2 z-50">
                  <HeaderCalendar 
                    isOpen={calendarMenuOpen}
                    onClose={() => setCalendarMenuOpen(false)}
                  />
                </div>
              )}
            </div>
          )}

          {/* User menu */}
          <div className="relative" ref={userMenuRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUserMenuClick}
              className="flex items-center space-x-1 sm:space-x-2"
            >
              <div className="h-7 w-7 sm:h-8 sm:w-8 bg-primary-500 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
              </div>
              {!isMobile && (
                <div className="text-left hidden sm:block">
                  <p className="text-xs sm:text-sm font-medium text-foreground truncate max-w-[120px] lg:max-w-none">
                    {user?.email}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {user?.role === 'admin' ? t('header.administrator') : t('header.user')}
                  </p>
                </div>
              )}
            </Button>

            {/* Dropdown menu */}
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-40 sm:w-48 bg-surface rounded-lg shadow-lg border border-border py-1 z-50">
                <Link
                  to="/settings"
                  className="flex items-center px-3 sm:px-4 py-2 text-xs sm:text-sm text-foreground hover:bg-gray-100"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2 sm:mr-3" />
                  {t('header.settings')}
                </Link>
                
                <hr className="my-1" />
                
                <button
                  onClick={handleLogout}
                  className="flex items-center w-full px-3 sm:px-4 py-2 text-xs sm:text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2 sm:mr-3" />
                  {t('header.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;