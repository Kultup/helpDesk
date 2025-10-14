import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, Ticket, TicketStatus, TicketPriority } from '../types';
import { apiService } from '../services/api';
import Card from '../components/UI/Card';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import TicketHistory, { TicketHistoryRef } from '../components/TicketHistory';
import RatingModal from '../components/RatingModal';

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
  const [showRatingModal, setShowRatingModal] = useState(false);
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
        
        // Перевіряємо, чи потрібно показати форму рейтингу
        if (response.showRatingModal) {
          setShowRatingModal(true);
        }
        
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

      {/* Модальне вікно рейтингу */}
      {ticket && (
        <RatingModal
          show={showRatingModal}
          onHide={() => setShowRatingModal(false)}
          ticketId={ticket._id}
          onRatingSubmitted={() => {
            setShowRatingModal(false);
            // Можна додати повідомлення про успішне відправлення рейтингу
          }}
        />
      )}
    </div>
  );
};

export default TicketDetails;