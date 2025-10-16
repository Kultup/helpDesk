import React, { useEffect, useState, useRef, useCallback } from 'react';
import { CheckCircle, XCircle, User, Mail, MapPin, Briefcase, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import ConfirmationModal from '../components/UI/ConfirmationModal';
import { useConfirmation } from '../hooks/useConfirmation';
import { apiService } from '../services/api';
import { cn } from '../utils';

interface PendingUser {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  department: string;
  position: {
    _id: string;
    title: string;
    department: string;
  };
  city: {
    _id: string;
    name: string;
    region: string;
  };
  registrationStatus: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  telegramId?: string;
  telegramUsername?: string;
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

const PendingRegistrations: React.FC = () => {
  const { t } = useTranslation();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [userToReject, setUserToReject] = useState<PendingUser | null>(null);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const { confirmationState, showConfirmation, hideConfirmation } = useConfirmation();

  const refreshData = useCallback(async () => {
    try {
      const response = await apiService.get(`/users/pending-registrations?page=${pagination.currentPage}&limit=10`);
      if (response.success) {
        const uniqueUsers = removeDuplicateUsers(response.data);
        setPendingUsers(uniqueUsers);
        setPagination(response.pagination);
        setLastUpdated(new Date());
        setError(null);
      }
    } catch (err) {
      console.error('Error refreshing data:', err);
      // Don't show error for background refresh
    }
  }, [pagination.currentPage]);

  // Функція для видалення дублікатів користувачів
  const removeDuplicateUsers = (users: PendingUser[]): PendingUser[] => {
    const seen = new Set<string>();
    return users.filter(user => {
      const key = `${user._id}-${user.email}`;
      if (seen.has(key)) {
        console.warn('Знайдено дублікат користувача:', user.email);
        return false;
      }
      seen.add(key);
      return true;
    });
  };

  const fetchPendingRegistrations = async (page = 1) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await apiService.get(`/users/pending-registrations?page=${page}&limit=10`);
      
      if (response.success) {
        // Видаляємо можливі дублікати
        const uniqueUsers = removeDuplicateUsers(response.data);
        setPendingUsers(uniqueUsers);
        setPagination(response.pagination);
      } else {
        setError(response.message || t('pendingRegistrations.errorLoading'));
      }
    } catch (err: any) {
      console.error('Error fetching pending registrations:', err);
      setError(err.message || t('pendingRegistrations.errorLoading'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingRegistrations();
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    // Set up interval for auto-refresh every 4 hours
    intervalRef.current = setInterval(() => {
      refreshData();
    }, 14400000); // 4 години (4 * 60 * 60 * 1000)

    // Cleanup interval on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refreshData]);

  const handleApprove = async (user: PendingUser) => {
    showConfirmation({
      title: t('pendingRegistrations.confirmRegistration'),
      message: t('pendingRegistrations.confirmRegistrationMessage', { 
        firstName: user.firstName, 
        lastName: user.lastName 
      }),
      onConfirm: () => approveRegistration(user._id),
      onCancel: hideConfirmation
    });
  };

  const approveRegistration = async (userId: string) => {
    try {
      setProcessingUserId(userId);
      
      const response = await apiService.patch(`/users/${userId}/approve-registration`);
      
      if (response.success) {
        // Видаляємо користувача зі списку pending
        const userToRemove = pendingUsers.find(user => user._id === userId);
        
        setPendingUsers(prev => {
          const filtered = prev.filter(user => user._id !== userId);
          return filtered;
        });
        
        setPagination(prev => {
          const updated = {
            ...prev,
            totalItems: prev.totalItems - 1
          };
          return updated;
        });
      } else {
        console.error('❌ Помилка від сервера:', response.message);
        setError(response.message || t('pendingRegistrations.errorApproving'));
      }
    } catch (err: any) {
      console.error('❌ Помилка при підтвердженні реєстрації:', err);
      setError(err.message || t('pendingRegistrations.errorApproving'));
    } finally {
      setProcessingUserId(null);
      hideConfirmation();
    }
  };

  const handleReject = (user: PendingUser) => {
    setUserToReject(user);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const rejectRegistration = async () => {
    if (!userToReject) return;

    try {
      setProcessingUserId(userToReject._id);
      
      const response = await apiService.patch(`/users/${userToReject._id}/reject-registration`, {
        reason: rejectionReason.trim() || 'Не вказано'
      });
      
      if (response.success) {
        // Видаляємо користувача зі списку pending
        const userToRemove = pendingUsers.find(user => user._id === userToReject._id);
        
        setPendingUsers(prev => {
          const filtered = prev.filter(user => user._id !== userToReject._id);
          return filtered;
        });
        
        setPagination(prev => {
          const updated = {
            ...prev,
            totalItems: prev.totalItems - 1
          };
          return updated;
        });
        
        setShowRejectModal(false);
        setUserToReject(null);
        setRejectionReason('');
      } else {
        console.error('❌ Помилка від сервера (reject):', response.message);
        setError(response.message || t('pendingRegistrations.errorRejecting'));
      }
    } catch (err: any) {
      console.error('❌ Помилка при відхиленні реєстрації:', err);
      setError(err.message || t('pendingRegistrations.errorRejecting'));
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleApproveAll = () => {
    if (pendingUsers.length === 0) return;
    
    showConfirmation({
      title: t('pendingRegistrations.confirmAllRegistrations'),
      message: t('pendingRegistrations.confirmAllRegistrationsMessage', { count: pendingUsers.length }),
      onConfirm: approveAllRegistrations,
      onCancel: hideConfirmation
    });
  };

  const approveAllRegistrations = async () => {
    try {
      setIsApprovingAll(true);
      
      // Підтверджуємо всіх користувачів послідовно
      const approvalPromises = pendingUsers.map(user => 
        apiService.patch(`/users/${user._id}/approve-registration`)
      );
      
      const results = await Promise.allSettled(approvalPromises);
      
      // Підраховуємо успішні та неуспішні операції
      const successful = results.filter(result => 
        result.status === 'fulfilled' && result.value.success
      ).length;
      
      const failed = results.length - successful;
      
      if (successful > 0) {
        // Очищаємо список pending користувачів
        setPendingUsers([]);
        setPagination(prev => ({
          ...prev,
          totalItems: 0,
          currentPage: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        }));
      }
      
      if (failed > 0) {
        setError(t('pendingRegistrations.bulkApprovalResult', { 
          successful, 
          total: results.length, 
          failed 
        }));
      }
      
    } catch (err: any) {
      console.error('❌ Помилка при масовому підтвердженні:', err);
      setError(err.message || t('pendingRegistrations.errorBulkApproval'));
    } finally {
      setIsApprovingAll(false);
      hideConfirmation();
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('uk-UA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('pendingRegistrations.title')}</h1>
          <p className="text-gray-600 mt-1">
            {t('pendingRegistrations.description')}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="bg-blue-50 px-3 py-2 rounded-lg">
            <span className="text-blue-700 font-medium">
              {t('pendingRegistrations.totalApplications', { count: pagination.totalItems })}
            </span>
          </div>
          <div className="text-sm text-gray-500">
            {t('pendingRegistrations.lastUpdated')}: {lastUpdated.toLocaleTimeString('uk-UA')}
          </div>
          <Button
            variant="outline"
            onClick={refreshData}
            disabled={isLoading}
            className="flex items-center space-x-2"
            title={t('pendingRegistrations.refreshData')}
          >
            <RefreshCw className="h-4 w-4" />
            <span>{t('pendingRegistrations.refresh')}</span>
          </Button>
          {pendingUsers.length > 0 && (
            <Button
              variant="primary"
              onClick={handleApproveAll}
              disabled={isLoading || isApprovingAll}
              className="bg-green-600 hover:bg-green-700 focus:ring-green-500 flex items-center space-x-2"
            >
              <CheckCircle className="h-4 w-4" />
              <span>{isApprovingAll ? t('pendingRegistrations.approving') : t('pendingRegistrations.approveAll')}</span>
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
            <span className="text-red-700">{error}</span>
          </div>
        </div>
      )}

      {pendingUsers.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {t('pendingRegistrations.noApplications')}
            </h3>
            <p className="text-gray-500">
              {t('pendingRegistrations.allProcessed')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pendingUsers.map((user) => (
            <Card key={user._id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="bg-blue-100 p-2 rounded-full">
                        <User className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {user.firstName} {user.lastName}
                        </h3>
                        <div className="flex items-center text-sm text-gray-500 mt-1">
                          <Clock className="h-4 w-4 mr-1" />
                          {t('pendingRegistrations.submitted')}: {formatDate(user.createdAt)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                      <div className="flex items-center space-x-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600">{user.email}</span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Briefcase className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600">
                          {typeof user.position === 'object' && user.position && user.position.title 
                            ? user.position.title 
                            : (typeof user.position === 'string' ? user.position : t('pendingRegistrations.notSpecified'))
                          }
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600">
                          {typeof user.city === 'object' && user.city && user.city.name 
                            ? user.city.name 
                            : (typeof user.city === 'string' ? user.city : t('pendingRegistrations.notSpecified'))
                          }
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500">{t('pendingRegistrations.department')}:</span>
                        <span className="text-sm text-gray-600">{user.department}</span>
                      </div>
                    </div>

                    {user.telegramUsername && (
                      <div className="bg-blue-50 p-3 rounded-lg mb-4">
                        <p className="text-sm text-blue-700">
                          <strong>Telegram:</strong> @{user.telegramUsername}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex space-x-2 ml-4">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleApprove(user)}
                      disabled={processingUserId === user._id}
                      className="bg-green-600 hover:bg-green-700 focus:ring-green-500 flex items-center space-x-1"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>{t('pendingRegistrations.approve')}</span>
                    </Button>
                    
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleReject(user)}
                      disabled={processingUserId === user._id}
                      className="flex items-center space-x-1"
                    >
                      <XCircle className="h-4 w-4" />
                      <span>{t('pendingRegistrations.reject')}</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Пагінація */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchPendingRegistrations(pagination.currentPage - 1)}
            disabled={!pagination.hasPrevPage || isLoading}
          >
            {t('pendingRegistrations.previous')}
          </Button>
          
          <span className="text-sm text-gray-600">
            {t('pendingRegistrations.pageInfo', { 
              current: pagination.currentPage, 
              total: pagination.totalPages 
            })}
          </span>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchPendingRegistrations(pagination.currentPage + 1)}
            disabled={!pagination.hasNextPage || isLoading}
          >
            {t('pendingRegistrations.next')}
          </Button>
        </div>
      )}

      {/* Модальне вікно підтвердження */}
      <ConfirmationModal
        isOpen={confirmationState.isOpen}
        title={confirmationState.title}
        message={confirmationState.message}
        onConfirm={confirmationState.onConfirm}
        onCancel={confirmationState.onCancel}
        confirmText={t('pendingRegistrations.confirm')}
        cancelText={t('pendingRegistrations.cancel')}
      />

      {/* Модальне вікно відхилення */}
      {showRejectModal && userToReject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {t('pendingRegistrations.rejectRegistration')}
            </h3>
            <p className="text-gray-600 mb-4">
              {t('pendingRegistrations.rejectConfirmMessage', {
                firstName: userToReject.firstName,
                lastName: userToReject.lastName
              })}
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('pendingRegistrations.rejectionReason')}
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder={t('pendingRegistrations.rejectionPlaceholder')}
                maxLength={500}
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('pendingRegistrations.charactersCount', { 
                  current: rejectionReason.length, 
                  max: 500 
                })}
              </p>
            </div>
            
            <div className="flex space-x-3">
              <Button
                variant="danger"
                onClick={rejectRegistration}
                disabled={processingUserId === userToReject._id}
                className="flex-1"
              >
                {processingUserId === userToReject._id ? t('pendingRegistrations.processing') : t('pendingRegistrations.reject')}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowRejectModal(false);
                  setUserToReject(null);
                  setRejectionReason('');
                }}
                disabled={processingUserId === userToReject._id}
                className="flex-1"
              >
                {t('pendingRegistrations.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PendingRegistrations;