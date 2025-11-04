import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Clock, AlertCircle, CheckCircle, User, X } from 'lucide-react';
import { Ticket, UserRole } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { useWindowSize } from '../../hooks';

interface NotificationDropdownProps {
  tickets: Ticket[];
  isOpen: boolean;
  onClose: () => void;
}

const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  tickets,
  isOpen,
  onClose
}) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { width } = useWindowSize();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isAdmin = user?.role === UserRole.ADMIN;
  const basePath = isAdmin ? '/admin' : '';
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Закриття по ESC
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Блокуємо скрол на фоні для мобільних
      if (isMobile) {
        document.body.style.overflow = 'hidden';
      }
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      if (isMobile) {
        document.body.style.overflow = '';
      }
    };
  }, [isOpen, isMobile, onClose]);
  
  if (!isOpen) return null;

  // Фільтруємо тікети для сповіщень (відкриті та в роботі)
  const notificationTickets = tickets.filter(ticket => 
    ticket.status === 'open' || ticket.status === 'in_progress'
  ).slice(0, 10); // Показуємо максимум 10 сповіщень

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 text-red-500" />;
      case 'in_progress':
        return <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-500" />;
      case 'resolved':
        return <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />;
      default:
        return <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'open':
        return t('notifications.status.open');
      case 'in_progress':
        return t('notifications.status.inProgress');
      case 'resolved':
        return t('notifications.status.resolved');
      case 'closed':
        return t('notifications.status.closed');
      default:
        return status;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-l-red-500';
      case 'medium':
        return 'border-l-yellow-500';
      case 'low':
        return 'border-l-green-500';
      default:
        return 'border-l-gray-500';
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <>
      {/* Backdrop для мобільних */}
      {isMobile && (
        <div 
          className="fixed inset-0 bg-black/30 dark:bg-black/50 z-40 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div 
        ref={dropdownRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('notifications.title')}
        className={`${isMobile ? 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 sm:absolute sm:left-auto sm:top-auto sm:translate-x-0 sm:translate-y-0 sm:right-0 sm:mt-2' : 'absolute right-0 mt-2'} ${isMobile ? 'w-[calc(100vw-1rem)] sm:w-80 max-w-sm' : isTablet ? 'w-96' : 'w-80'} bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 ${isMobile ? 'max-h-[calc(100vh-5rem)]' : 'max-h-96'} overflow-hidden touch-manipulation`}
      >
      {/* Header */}
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-50 flex-1">{t('notifications.title')}</h3>
          {isMobile && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors touch-manipulation"
              aria-label={t('common.close')}
              title={t('common.close')}
            >
              <X className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </button>
          )}
          <span className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
            {notificationTickets.length} {t('notifications.active')}
          </span>
        </div>
      </div>

      {/* Notifications list */}
      <div className={`${isMobile ? 'max-h-[calc(100vh-11rem)]' : 'max-h-80'} overflow-y-auto overscroll-contain touch-pan-y`}>
        {notificationTickets.length === 0 ? (
          <div className="px-3 sm:px-4 py-4 sm:py-6 text-center text-gray-600 dark:text-gray-300">
            <CheckCircle className="h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-2 text-gray-400 dark:text-gray-400" />
            <p className="text-sm text-gray-600 dark:text-gray-300">{t('notifications.noActive')}</p>
          </div>
        ) : (
          notificationTickets.map((ticket) => (
            <Link
              key={ticket._id}
              to={`${basePath}/tickets/${ticket._id}`}
              onClick={onClose}
              className={`block px-3 sm:px-4 py-3.5 sm:py-4 border-l-4 ${getPriorityColor(ticket.priority)} hover:bg-gray-50 dark:hover:bg-gray-700/70 active:bg-gray-100 dark:active:bg-gray-700 transition-colors touch-manipulation min-h-[70px] sm:min-h-0 bg-white dark:bg-gray-800`}
            >
              <div className="flex items-start space-x-2 sm:space-x-3">
                <div className="flex-shrink-0 mt-0.5 sm:mt-1">
                  {getStatusIcon(ticket.status)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0 mb-1.5">
                    <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-50 truncate">
                      {ticket.title}
                    </p>
                    <span className="text-sm text-gray-600 dark:text-gray-300 flex-shrink-0">
                      {formatDate(ticket.createdAt)}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-700 dark:text-gray-200 mb-2.5 line-clamp-2 break-words">
                    {ticket.description}
                  </p>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                    <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
                      <span className={`inline-flex items-center px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full text-sm font-medium ${
                        ticket.status === 'open' 
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200'
                      }`}>
                        {getStatusText(ticket.status)}
                      </span>
                      
                      <span className={`inline-flex items-center px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full text-sm font-medium ${
                        ticket.priority === 'high'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
                          : ticket.priority === 'medium'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200'
                          : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                      }`}>
                        {ticket.priority === 'high' ? t('notifications.priority.high') : 
                         ticket.priority === 'medium' ? t('notifications.priority.medium') : t('notifications.priority.low')}
                      </span>
                    </div>
                    
                    {ticket.assignedTo && (
                      <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                        <User className="h-4 w-4 mr-1.5 flex-shrink-0 text-gray-600 dark:text-gray-300" />
                        <span className="truncate max-w-[120px] sm:max-w-20 text-gray-600 dark:text-gray-300">
                          {typeof ticket.assignedTo === 'object' 
                            ? ticket.assignedTo.email 
                            : ticket.assignedTo}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Footer */}
      {notificationTickets.length > 0 && (
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <Link
            to={`${basePath}/tickets`}
            onClick={onClose}
            className="block text-sm text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 active:text-blue-900 dark:active:text-blue-100 font-medium py-1.5 touch-manipulation transition-colors"
          >
            {t('notifications.viewAll')} →
          </Link>
        </div>
      )}
      </div>
    </>
  );
};

export default NotificationDropdown;