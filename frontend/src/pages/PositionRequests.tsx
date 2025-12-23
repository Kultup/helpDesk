import React, { useEffect, useState, useRef, useCallback } from 'react';
import { CheckCircle, XCircle, User, Briefcase, Clock, AlertCircle, RefreshCw, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Card, { CardContent } from '../components/UI/Card';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import ConfirmationModal from '../components/UI/ConfirmationModal';
import { useConfirmation } from '../hooks/useConfirmation';
import { apiService } from '../services/api';

interface PositionRequest {
  _id: string;
  title: string;
  telegramId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  requestedBy?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  pendingRegistrationId?: {
    telegramId: string;
    telegramChatId: string;
  };
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

const PositionRequests: React.FC = () => {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<PositionRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [requestToReject, setRequestToReject] = useState<PositionRequest | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const { confirmationState, showConfirmation, hideConfirmation } = useConfirmation();

  const fetchRequests = useCallback(async (page = 1): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await apiService.getPositionRequests({
        status: 'pending',
        page,
        limit: 10
      });
      
      if (response.success) {
        const requestsData = Array.isArray(response.data) ? response.data : [];
        setRequests(requestsData);
        
        // Use type assertion to handle the missing property in ApiResponse definition
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const apiResponse = response as any;
        
        if (apiResponse.pagination) {
          const pag = apiResponse.pagination;
          setPagination({
            currentPage: pag.page || pag.currentPage,
            totalPages: pag.pages || pag.totalPages,
            totalItems: pag.total || pag.totalItems,
            hasNextPage: pag.page < pag.pages,
            hasPrevPage: pag.page > 1
          });
        }
        setLastUpdated(new Date());
      } else {
        setError(response.message || 'Помилка завантаження запитів');
      }
    } catch (err: any) {
      console.error('Error fetching position requests:', err);
      setError(err.message || 'Помилка завантаження запитів');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Auto-refresh effect
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      fetchRequests(pagination.currentPage);
    }, 60000); // 1 хвилина

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchRequests, pagination.currentPage]);

  const handleApprove = (request: PositionRequest): void => {
    showConfirmation({
      title: 'Підтвердження запиту',
      message: `Ви впевнені, що хочете створити посаду "${request.title}"?`,
      onConfirm: () => approveRequest(request._id),
      onCancel: hideConfirmation
    });
  };

  const approveRequest = async (id: string): Promise<void> => {
    try {
      setProcessingId(id);
      
      const response = await apiService.approvePositionRequest(id);
      
      if (response.success) {
        setRequests(prev => prev.filter(r => r._id !== id));
        setPagination(prev => ({
          ...prev,
          totalItems: prev.totalItems - 1
        }));
      } else {
        setError(response.message || 'Помилка підтвердження запиту');
      }
    } catch (err: any) {
      console.error('Error approving request:', err);
      setError(err.message || 'Помилка підтвердження запиту');
    } finally {
      setProcessingId(null);
      hideConfirmation();
    }
  };

  const handleReject = (request: PositionRequest): void => {
    setRequestToReject(request);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const rejectRequest = async (): Promise<void> => {
    if (!requestToReject) return;

    try {
      setProcessingId(requestToReject._id);
      
      const response = await apiService.rejectPositionRequest(requestToReject._id, rejectionReason);
      
      if (response.success) {
        setRequests(prev => prev.filter(r => r._id !== requestToReject._id));
        setPagination(prev => ({
          ...prev,
          totalItems: prev.totalItems - 1
        }));
        setShowRejectModal(false);
        setRequestToReject(null);
        setRejectionReason('');
      } else {
        setError(response.message || 'Помилка відхилення запиту');
      }
    } catch (err: any) {
      console.error('Error rejecting request:', err);
      setError(err.message || 'Помилка відхилення запиту');
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('uk-UA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading && requests.length === 0) {
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
          <h1 className="text-2xl font-bold text-gray-900">Запити на посади</h1>
          <p className="text-gray-600 mt-1">
            Керування запитами користувачів на додавання нових посад
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="bg-blue-50 px-3 py-2 rounded-lg">
            <span className="text-blue-700 font-medium">
              Всього запитів: {pagination.totalItems}
            </span>
          </div>
          <div className="text-sm text-gray-500">
            Оновлено: {lastUpdated.toLocaleTimeString('uk-UA')}
          </div>
          <Button
            variant="outline"
            onClick={() => fetchRequests(pagination.currentPage)}
            disabled={isLoading}
            className="flex items-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Оновити</span>
          </Button>
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

      {requests.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Briefcase className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Немає нових запитів
            </h3>
            <p className="text-gray-500">
              Всі запити на додавання посад оброблено
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <Card key={request._id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="bg-blue-100 p-2 rounded-full">
                        <Briefcase className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {request.title}
                        </h3>
                        <div className="flex items-center text-sm text-gray-500 mt-1">
                          <Clock className="h-4 w-4 mr-1" />
                          Створено: {formatDate(request.createdAt)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {request.requestedBy && (
                        <div className="flex items-center space-x-2">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-600">
                            Запитав: {request.requestedBy.firstName} {request.requestedBy.lastName}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600">
                          Telegram ID: {request.telegramId}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex space-x-2 ml-4">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleApprove(request)}
                      disabled={processingId === request._id}
                      className="bg-green-600 hover:bg-green-700 focus:ring-green-500 flex items-center space-x-1"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>Підтвердити</span>
                    </Button>
                    
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleReject(request)}
                      disabled={processingId === request._id}
                      className="flex items-center space-x-1"
                    >
                      <XCircle className="h-4 w-4" />
                      <span>Відхилити</span>
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
            onClick={() => fetchRequests(pagination.currentPage - 1)}
            disabled={!pagination.hasPrevPage || isLoading}
          >
            Назад
          </Button>
          
          <span className="text-sm text-gray-600">
            Сторінка {pagination.currentPage} з {pagination.totalPages}
          </span>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchRequests(pagination.currentPage + 1)}
            disabled={!pagination.hasNextPage || isLoading}
          >
            Далі
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
        confirmText="Так, підтвердити"
        cancelText="Скасувати"
      />

      {/* Модальне вікно відхилення */}
      {showRejectModal && requestToReject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-md p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Відхилення запиту
            </h3>
            <p className="text-gray-600 mb-4">
              Ви впевнені, що хочете відхилити запит на посаду "{requestToReject.title}"?
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Причина відхилення
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Вкажіть причину..."
                maxLength={500}
              />
              <p className="text-xs text-gray-500 mt-1">
                {rejectionReason.length} / 500
              </p>
            </div>
            
            <div className="flex space-x-3">
              <Button
                variant="danger"
                onClick={rejectRequest}
                disabled={processingId === requestToReject._id}
                className="flex-1"
              >
                {processingId === requestToReject._id ? 'Обробка...' : 'Відхилити'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowRejectModal(false);
                  setRequestToReject(null);
                  setRejectionReason('');
                }}
                disabled={processingId === requestToReject._id}
                className="flex-1"
              >
                Скасувати
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PositionRequests;
