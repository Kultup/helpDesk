import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, Ticket, TicketStatus, TicketPriority } from '../types';
import { apiService } from '../services/api';
import Card from '../components/UI/Card';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import TicketRating from '../components/UI/TicketRating';
import TicketHistory, { TicketHistoryRef } from '../components/TicketHistory';

import { formatDate } from '../utils';

const TicketDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState(false);
  const [editingPriority, setEditingPriority] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;
  const basePath = isAdmin ? '/admin' : '';
  const ticketHistoryRef = useRef<TicketHistoryRef>(null);

  const loadTicket = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiService.getTicketById(id!);
      if (response.success && response.data) {
        setTicket(response.data);
      } else {
        setError(response.message || 'Помилка завантаження тікету');
      }
    } catch (err: any) {
      setError(err.message || 'Помилка завантаження тікету');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadTicket();
    }
  }, [id]);

  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (!ticket || isUpdating) return;
    
    try {
      setIsUpdating(true);
      const response = await apiService.updateTicket(ticket._id, { status: newStatus });
      if (response.success && response.data) {
        setTicket(response.data);
        setEditingStatus(false);
        
        // Оновлюємо історію після зміни статусу
        if (ticketHistoryRef.current) {
          await ticketHistoryRef.current.refreshHistory();
        }
      } else {
        setError(response.message || 'Помилка оновлення статусу');
      }
    } catch (err: any) {
      setError(err.message || 'Помилка оновлення статусу');
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePriorityChange = async (newPriority: TicketPriority) => {
    if (!ticket || isUpdating) return;
    
    try {
      setIsUpdating(true);
      const response = await apiService.updateTicket(ticket._id, { priority: newPriority });
      if (response.success && response.data) {
        setTicket(response.data);
        setEditingPriority(false);
        // Оновлюємо історію після зміни пріоритету
        if (ticketHistoryRef.current) {
          await ticketHistoryRef.current.refreshHistory();
        }
      } else {
        setError(response.message || 'Помилка оновлення пріоритету');
      }
    } catch (err: any) {
      setError(err.message || 'Помилка оновлення пріоритету');
    } finally {
      setIsUpdating(false);
    }
  };

  const canEdit = isAdmin || ticket?.createdBy?._id === user?._id || ticket?.assignedTo?._id === user?._id;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'text-red-600 bg-red-100';
      case 'in_progress': return 'text-yellow-600 bg-yellow-100';
      case 'resolved': return 'text-green-600 bg-green-100';
      case 'closed': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return 'Відкритий';
      case 'in_progress': return 'В роботі';
      case 'resolved': return 'Вирішений';
      case 'closed': return 'Закритий';
      default: return status;
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high': return 'Високий';
      case 'medium': return 'Середній';
      case 'low': return 'Низький';
      default: return priority;
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-red-600 text-center">
          <p className="mb-4">{error}</p>
          <Button onClick={() => navigate(`${basePath}/tickets`)}>
            Повернутися до тікетів
          </Button>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-gray-600 text-center">
          <p className="mb-4">Тікет не знайдено</p>
          <Button onClick={() => navigate(`${basePath}/tickets`)}>
            Повернутися до тікетів
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <Link 
          to={`${basePath}/tickets`}
          className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
        >
          ← Повернутися до тікетів
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">{ticket.title}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">Опис</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
            </div>
          </Card>

          {/* Прикріплені файли */}
          {ticket.attachments && ticket.attachments.length > 0 && (
            <Card>
              <div className="p-6">
                <h2 className="text-xl font-semibold mb-4">Прикріплені файли ({ticket.attachments.length})</h2>
                <div className="space-y-3">
                  {ticket.attachments.map((attachment) => (
                    <div key={attachment._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                          {attachment.mimetype.startsWith('image/') ? (
                            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          ) : attachment.mimetype === 'application/pdf' ? (
                            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                          ) : (
                            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {attachment.originalName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {(attachment.size / 1024 / 1024).toFixed(2)} MB • 
                            Завантажено {attachment.uploadedBy.firstName} {attachment.uploadedBy.lastName} • 
                            {new Date(attachment.uploadedAt).toLocaleDateString('uk-UA')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {attachment.mimetype.startsWith('image/') && (
                          <button
                            onClick={() => navigate(`/photo/${attachment.filename}`)}
                            className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Переглянути
                          </button>
                        )}
                        <a
                          href={`/api/files/${attachment.filename}`}
                          download={attachment.originalName}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-green-700 bg-green-100 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Завантажити
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
          
          {/* Історія змін */}
          <TicketHistory ref={ticketHistoryRef} ticketId={ticket._id} />

        </div>

        <div className="space-y-6">
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Деталі тікету</h3>
              <div className="space-y-4">
                {/* Status */}
                <div>
                  <span className="text-sm font-medium text-gray-500 block mb-1">Статус</span>
                  {editingStatus && canEdit ? (
                    <div className="space-y-2">
                      <select
                        value={ticket.status}
                        onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                        className="w-full p-2 border border-gray-300 rounded-md"
                        disabled={isUpdating}
                      >
                        <option value="open">Відкритий</option>
                        <option value="in_progress">В роботі</option>
                        <option value="resolved">Вирішений</option>
                        <option value="closed">Закритий</option>
                      </select>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          onClick={() => setEditingStatus(false)}
                          disabled={isUpdating}
                        >
                          Скасувати
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                        {getStatusLabel(ticket.status)}
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => setEditingStatus(true)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                          disabled={isUpdating}
                        >
                          Змінити
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Priority */}
                <div>
                  <span className="text-sm font-medium text-gray-500 block mb-1">Пріоритет</span>
                  {editingPriority && canEdit ? (
                    <div className="space-y-2">
                      <select
                        value={ticket.priority}
                        onChange={(e) => handlePriorityChange(e.target.value as TicketPriority)}
                        className="w-full p-2 border border-gray-300 rounded-md"
                        disabled={isUpdating}
                      >
                        <option value="low">Низький</option>
                        <option value="medium">Середній</option>
                        <option value="high">Високий</option>
                      </select>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          onClick={() => setEditingPriority(false)}
                          disabled={isUpdating}
                        >
                          Скасувати
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                        {getPriorityLabel(ticket.priority)}
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => setEditingPriority(true)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                          disabled={isUpdating}
                        >
                          Змінити
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-sm font-medium text-gray-500 block mb-1">Місто</span>
                  <p className="text-gray-900">{ticket.city?.name || 'Не вказано'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500 block mb-1">Призначено</span>
                  <p className="text-gray-900">{ticket.assignedTo?.email || 'Не призначено'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500 block mb-1">Створено</span>
                  <p className="text-gray-900">{ticket.createdBy?.email || 'Невідомо'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500 block mb-1">Дата створення</span>
                  <p className="text-gray-900">{formatDate(ticket.createdAt)}</p>
                </div>
                {ticket.resolvedAt && (
                  <div>
                    <span className="text-sm font-medium text-gray-500 block mb-1">Дата вирішення</span>
                    <p className="text-gray-900">{formatDate(ticket.resolvedAt)}</p>
                  </div>
                )}

                {/* Оцінка якості */}
                {ticket.qualityRating?.hasRating && ticket.qualityRating?.rating && (
                  <div>
                    <span className="text-sm font-medium text-gray-500 block mb-2">Оцінка якості</span>
                    <TicketRating 
                      rating={ticket.qualityRating.rating}
                      feedback={ticket.qualityRating.feedback}
                      ratedAt={ticket.qualityRating.ratedAt}
                      showFeedback={true}
                      size="md"
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>

          {isUpdating && (
            <Card>
              <div className="p-6 text-center">
                <LoadingSpinner />
                <p className="mt-2 text-sm text-gray-600">Оновлення тікету...</p>
              </div>
            </Card>
          )}
        </div>
      </div>

    </div>
  );
};

export default TicketDetails;