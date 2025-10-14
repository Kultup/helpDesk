import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Bell, User, LogOut, Settings, UserPlus, Calendar, Sun, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useClickOutside, useNotifications, useRegistrationNotifications } from '../../hooks';
import Button from '../UI/Button';
import NotificationDropdown from '../UI/NotificationDropdown';
import RegistrationDropdown from './RegistrationDropdown';
import HeaderCalendar from './HeaderCalendar';
import { WeatherWidget } from '../UI';
import LanguageSelector from '../UI/LanguageSelector';

interface HeaderProps {
  onMenuClick: () => void;
  isMobile: boolean;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, isMobile }) => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
  const previousNotificationCountRef = useRef<number>(0);
  const previousRegistrationCountRef = useRef<number>(0);

  // Відстеження нових тікетів для анімації дзвіночка
  useEffect(() => {
    if (notifications && Array.isArray(notifications)) {
      const currentCount = notifications.length;
      const previousCount = previousNotificationCountRef.current;
      
      // Якщо з'явився новий тікет (збільшилась кількість)
      if (previousCount > 0 && currentCount > previousCount) {
        setBellAnimation(true);
        
        // Зупиняємо анімацію через 2 секунди
        setTimeout(() => {
          setBellAnimation(false);
        }, 2000);
      }
      
      // Оновлюємо попередню кількість
      previousNotificationCountRef.current = currentCount;
      
      // Встановлюємо кількість непрочитаних (всі сповіщення - це активні тікети)
      setUnreadCount(notifications.length);
    }
  }, [notifications]);

  // Відстеження нових запитів на реєстрацію для анімації іконки
  useEffect(() => {
    if (registrations && Array.isArray(registrations)) {
      // Встановлюємо кількість запитів на реєстрацію
      setRegistrationCount(registrations.length);
    }
  }, [registrations]);

  // Анімація при отриманні нових реєстрацій через WebSocket
  useEffect(() => {
    if (newRegistrationCount > 0) {
      setRegistrationAnimation(true);
      
      // Зупиняємо анімацію через 2 секунди
      setTimeout(() => {
        setRegistrationAnimation(false);
      }, 2000);
    }
  }, [newRegistrationCount]);

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
      <div className="flex items-center justify-between h-16 px-4">
        {/* Left side */}
        <div className="flex items-center">
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMenuClick}
              className="mr-2"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-primary-500">Help Desk</h1>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center space-x-4">
          {/* Language Selector */}
          <LanguageSelector />
          
          {/* Weather Widget */}
          <WeatherWidget />
          
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="relative"
            title={theme === 'dark' ? t('header.lightMode') : t('header.darkMode')}
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5 text-yellow-500" />
            ) : (
              <Moon className="h-5 w-5 text-gray-600" />
            )}
          </Button>
          
          {/* Notifications */}
          <div className="relative" ref={notificationMenuRef}>
            <Button 
              variant="ghost" 
              size="sm" 
              className="relative"
              onClick={handleNotificationClick}
            >
              <Bell 
                className={`h-5 w-5 transition-transform duration-200 ${
                  bellAnimation ? 'animate-bounce text-red-500' : ''
                }`} 
              />
              {unreadCount > 0 && (
                <span className={`absolute -top-1 -right-1 h-5 w-5 bg-red-500 rounded-full flex items-center justify-center text-xs text-white font-medium ${
                  bellAnimation ? 'animate-pulse' : ''
                }`}>
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

          {/* Registration Requests - Only for admins */}
          {user?.role === 'admin' && (
            <div className="relative" ref={registrationMenuRef}>
              <Button 
                variant="ghost" 
                size="sm" 
                className="relative"
                onClick={handleRegistrationClick}
              >
                <UserPlus 
                  className={`h-5 w-5 transition-transform duration-200 ${
                    registrationAnimation ? 'animate-bounce text-blue-500' : ''
                  }`} 
                />
                {registrationCount > 0 && (
                  <span className={`absolute -top-1 -right-1 h-5 w-5 bg-blue-500 rounded-full flex items-center justify-center text-xs text-white font-medium ${
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
                className="relative"
                onClick={handleCalendarClick}
              >
                <Calendar className="h-5 w-5 text-gray-600 hover:text-primary-600 transition-colors duration-200" />
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
              className="flex items-center space-x-2"
            >
              <div className="h-8 w-8 bg-primary-500 rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-white" />
              </div>
              {!isMobile && (
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">
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
              <div className="absolute right-0 mt-2 w-48 bg-surface rounded-lg shadow-lg border border-border py-1 z-50">
                <Link
                  to="/settings"
                  className="flex items-center px-4 py-2 text-sm text-foreground hover:bg-gray-100"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Settings className="h-4 w-4 mr-3" />
                  {t('header.settings')}
                </Link>
                
                <hr className="my-1" />
                
                <button
                  onClick={handleLogout}
                  className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4 mr-3" />
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