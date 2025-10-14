import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, AlertCircle, CheckCircle, User } from 'lucide-react';
import { Ticket, UserRole } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

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
  const isAdmin = user?.role === UserRole.ADMIN;
  const basePath = isAdmin ? '/admin' : '';
  
  if (!isOpen) return null;

  // Фільтруємо тікети для сповіщень (відкриті та в роботі)
  const notificationTickets = tickets.filter(ticket => 
    ticket.status === 'open' || ticket.status === 'in_progress'
  ).slice(0, 10); // Показуємо максимум 10 сповіщень

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'resolved':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
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
    <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{t('notifications.title')}</h3>
          <span className="text-xs text-gray-500">
            {notificationTickets.length} {t('notifications.active')}
          </span>
        </div>
      </div>

      {/* Notifications list */}
      <div className="max-h-80 overflow-y-auto">
        {notificationTickets.length === 0 ? (
          <div className="px-4 py-6 text-center text-gray-500">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm">{t('notifications.noActive')}</p>
          </div>
        ) : (
          notificationTickets.map((ticket) => (
            <Link
              key={ticket._id}
              to={`${basePath}/tickets/${ticket._id}`}
              onClick={onClose}
              className={`block px-4 py-3 border-l-4 ${getPriorityColor(ticket.priority)} hover:bg-gray-50 transition-colors`}
            >
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-1">
                  {getStatusIcon(ticket.status)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {ticket.title}
                    </p>
                    <span className="text-xs text-gray-500">
                      {formatDate(ticket.createdAt)}
                    </span>
                  </div>
                  
                  <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                    {ticket.description}
                  </p>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        ticket.status === 'open' 
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {getStatusText(ticket.status)}
                      </span>
                      
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        ticket.priority === 'high'
                          ? 'bg-red-100 text-red-800'
                          : ticket.priority === 'medium'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {ticket.priority === 'high' ? t('notifications.priority.high') : 
                         ticket.priority === 'medium' ? t('notifications.priority.medium') : t('notifications.priority.low')}
                      </span>
                    </div>
                    
                    {ticket.assignedTo && (
                      <div className="flex items-center text-xs text-gray-500">
                        <User className="h-3 w-3 mr-1" />
                        <span className="truncate max-w-20">
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
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
          <Link
            to={`${basePath}/tickets`}
            onClick={onClose}
            className="text-sm text-primary-600 hover:text-primary-800 font-medium"
          >
{t('notifications.viewAll')} →
          </Link>
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;