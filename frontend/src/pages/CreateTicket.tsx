import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CreateTicketForm, TicketPriority, City, ApiResponse, UserRole, TicketStatus, Ticket } from '../types';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import LoadingSpinner from '../components/UI/LoadingSpinner';

const CreateTicket: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;
  const { id } = useParams<{ id?: string }>();
  const isEditMode = !!id;
  const [isLoading, setIsLoading] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [loadingCities, setLoadingCities] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<CreateTicketForm & { status?: TicketStatus }>({
    title: '',
    description: '',
    priority: TicketPriority.MEDIUM,
    cityId: '',
    status: TicketStatus.OPEN
  });

  // Завантаження списку міст
  useEffect(() => {
    const fetchCities = async () => {
      try {
        setLoadingCities(true);
        const response = await apiService.getCities();
        if (response.success && response.data) {
          setCities(response.data);
        }
      } catch (error) {
        console.error('Помилка завантаження міст:', error);
        setError(t('createTicketPage.messages.loadCitiesError'));
      } finally {
        setLoadingCities(false);
      }
    };

    fetchCities();
  }, []);

  // Автоматично встановлюємо місто з профілю користувача для не-адмінів
  useEffect(() => {
    if (!isEditMode && !isAdmin && user?.city) {
      const userCityId = typeof user.city === 'string' ? user.city : user.city._id;
      setFormData(prev => ({
        ...prev,
        cityId: userCityId || prev.cityId
      }));
    }
  }, [isAdmin, user?.city, isEditMode]);

  // Перевірка доступу до редагування - тільки для адміністраторів
  useEffect(() => {
    if (isEditMode && !isAdmin) {
      // Якщо звичайний користувач намагається редагувати тікет, перенаправляємо на деталі
      navigate(`/tickets/${id}`);
    }
  }, [isEditMode, isAdmin, id, navigate]);

  // Завантаження даних тикету для редагування
  useEffect(() => {
    if (isEditMode && id && isAdmin) {
      const fetchTicket = async () => {
        try {
          setIsLoading(true);
          const response = await apiService.getTicketById(id); // Fixed method name
          if (response.success && response.data) {
            const ticket: Ticket = response.data;

            setFormData({
              title: ticket.title,
              description: ticket.description,
              priority: ticket.priority,
              cityId: ticket.city?._id || '',
              status: ticket.status
            });
          } else {
            setError(t('createTicketPage.messages.loadTicketError'));
          }
        } catch (error) {
          console.error('Помилка завантаження тикету:', error);
          setError(t('createTicketPage.messages.loadDataError'));
        } finally {
          setIsLoading(false);
        }
      };
      fetchTicket();
    }
  }, [id, isEditMode, isAdmin]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Очищаємо помилку при зміні даних
    if (error) setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Валідація
    if (!formData.title.trim()) {
      setError(t('createTicketPage.messages.titleRequired'));
      return;
    }
    if (!formData.description.trim()) {
      setError(t('createTicketPage.messages.descriptionRequired'));
      return;
    }
    // Для адмінів місто обов'язкове, для звичайних користувачів воно встановлюється автоматично
    if (isAdmin && !formData.cityId) {
      setError(t('createTicketPage.messages.cityRequired'));
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      
      // Для не-адмінів встановлюємо місто з профілю, якщо воно не встановлено
      let ticketData = { ...formData };
      if (!isAdmin && !ticketData.cityId && user?.city) {
        ticketData.cityId = typeof user.city === 'string' ? user.city : user.city._id;
      }
      
      // Перевірка: тільки адміністратор може редагувати тікети
      if (isEditMode && !isAdmin) {
        setError('Тільки адміністратор може редагувати заявки');
        return;
      }
      
      let response;
      if (isEditMode && id) {
        response = await apiService.updateTicket(id, ticketData);
      } else {
        response = await apiService.createTicket(ticketData);
      }
      
      if (response.success) {
        // Перенаправляємо залежно від ролі користувача
        const basePath = user?.role === UserRole.ADMIN ? '/admin' : '';
        navigate(`${basePath}/tickets`, { 
          state: { 
            message: isEditMode ? t('createTicketPage.messages.updated') : t('createTicketPage.messages.created'),
            type: 'success'
          }
        });
      } else {
        setError(response.message || (isEditMode ? t('createTicketPage.messages.updateError') : t('createTicketPage.messages.createError')));
      }
    } catch (error: any) {
      console.error('Помилка створення тикету:', error);
      const errorMessage = error.response?.data?.message || 
                          error.message || 
                          error.response?.data?.error ||
                          t('createTicketPage.messages.requestError');
      setError(errorMessage);
      
      // Логуємо деталі помилки для діагностики
      if (error.response?.data) {
        console.error('Деталі помилки від сервера:', error.response.data);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    const basePath = user?.role === UserRole.ADMIN ? '/admin' : '';
    navigate(`${basePath}/tickets`);
  };

  if (loadingCities) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditMode ? t('createTicketPage.editTitle') : t('createTicketPage.title')}
          </h1>
          <p className="text-gray-600 mt-1">
            {isEditMode ? t('createTicketPage.editSubtitle') : t('createTicketPage.subtitle')}
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
          >
            {t('createTicketPage.backToTickets')}
          </Button>
        </div>
      </div>

      {/* Main Form */}
      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Form Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-6">
                {/* Заголовок */}
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('createTicketPage.form.titleLabel')}
                  </label>
                  <Input
                    id="title"
                    name="title"
                    type="text"
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder={t('createTicketPage.form.titlePlaceholder')}
                    required
                    maxLength={200}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('createTicketPage.form.titleCounter', { count: formData.title.length })}
                  </p>
                </div>

                {/* Пріоритет */}
                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('createTicketPage.form.priorityLabel')}
                  </label>
                  <select
                    id="priority"
                    name="priority"
                    value={formData.priority}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value={TicketPriority.LOW}>{t('createTicketPage.priorities.low')}</option>
                    <option value={TicketPriority.MEDIUM}>{t('createTicketPage.priorities.medium')}</option>
                    <option value={TicketPriority.HIGH}>{t('createTicketPage.priorities.high')}</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {t('createTicketPage.form.priorityHint')}
                  </p>
                </div>

                {/* Місто */}
                <div>
                  <label htmlFor="cityId" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('createTicketPage.form.cityLabel')}
                  </label>
                  {isAdmin ? (
                    <select
                      id="cityId"
                      name="cityId"
                      value={formData.cityId}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                      <option value="">{t('createTicketPage.form.cityPlaceholder')}</option>
                      {cities.map((city) => (
                        <option key={city._id} value={city._id}>
                          {city.name} ({city.region})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id="cityId"
                      name="cityId"
                      value={user?.city && typeof user.city === 'object' 
                        ? `${user.city.name}${user.city.region ? ` (${user.city.region})` : ''}`
                        : cities.find(city => city._id === formData.cityId)?.name || 'Місто не вказано'}
                      readOnly
                      disabled
                      className="bg-gray-100 cursor-not-allowed"
                      fullWidth
                    />
                  )}
                </div>

                {/* Статус (тільки для редагування) */}
                {isEditMode && (
                  <div>
                    <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
                      {t('createTicketPage.form.statusLabel')}
                    </label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                      <option value={TicketStatus.OPEN}>{t('createTicketPage.statuses.open')}</option>
                      <option value={TicketStatus.IN_PROGRESS}>{t('createTicketPage.statuses.inProgress')}</option>
                      <option value={TicketStatus.RESOLVED}>{t('createTicketPage.statuses.resolved')}</option>
                      <option value={TicketStatus.CLOSED}>{t('createTicketPage.statuses.closed')}</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                {/* Опис */}
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text mb-2">
                    {t('createTicketPage.form.descriptionLabel')}
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder={t('createTicketPage.form.descriptionPlaceholder')}
                    required
                    rows={12}
                    maxLength={2000}
                    className="w-full px-3 py-2 border border-border rounded-lg shadow-sm bg-surface text placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-vertical"
                  />
                  <p className="text-xs text-text-secondary mt-1">
                    {t('createTicketPage.form.descriptionCounter', { count: formData.description.length })}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200">
              <Button
                type="submit"
                disabled={isLoading}
                className="flex-1 sm:flex-none sm:px-8"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    {isEditMode ? t('createTicketPage.buttons.updating') : t('createTicketPage.buttons.creating')}
                  </>
                ) : (
                  isEditMode ? t('createTicketPage.buttons.save') : t('createTicketPage.buttons.create')
                )}
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isLoading}
                className="flex-1 sm:flex-none sm:px-8"
              >
                {t('createTicketPage.buttons.cancel')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateTicket;