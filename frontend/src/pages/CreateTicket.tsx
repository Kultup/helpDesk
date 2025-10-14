import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CreateTicketForm, TicketPriority, TicketCategory, City, ApiResponse, UserRole, TicketStatus, Ticket } from '../types';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import LoadingSpinner from '../components/UI/LoadingSpinner';

const CreateTicket: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
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
    category: TicketCategory.GENERAL,
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
        setError('Не вдалося завантажити список міст');
      } finally {
        setLoadingCities(false);
      }
    };

    fetchCities();
  }, []);

  // Завантаження даних тикету для редагування
  useEffect(() => {
    if (isEditMode && id) {
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
              category: ticket.category || TicketCategory.GENERAL,
              cityId: ticket.city?._id || '',
              status: ticket.status
            });
          } else {
            setError('Не вдалося завантажити дані тикету');
          }
        } catch (error) {
          console.error('Помилка завантаження тикету:', error);
          setError('Помилка завантаження даних');
        } finally {
          setIsLoading(false);
        }
      };
      fetchTicket();
    }
  }, [id, isEditMode]);

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
      setError('Заголовок є обов\'язковим');
      return;
    }
    if (!formData.description.trim()) {
      setError('Опис є обов\'язковим');
      return;
    }
    if (!formData.cityId) {
      setError('Оберіть місто');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      
      let response;
      if (isEditMode && id) {
        response = await apiService.updateTicket(id, formData);
      } else {
        response = await apiService.createTicket(formData);
      }
      
      if (response.success) {
        // Перенаправляємо залежно від ролі користувача
        const basePath = user?.role === UserRole.ADMIN ? '/admin' : '';
        navigate(`${basePath}/tickets`, { 
          state: { 
            message: isEditMode ? 'Тикет успішно оновлено!' : 'Тикет успішно створено!',
            type: 'success'
          }
        });
      } else {
        setError(response.message || (isEditMode ? 'Помилка при оновленні тикету' : 'Помилка при створенні тикету'));
      }
    } catch (error: any) {
      console.error('Помилка:', error);
      setError(error.response?.data?.message || 'Помилка при обробці запиту');
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
            {isEditMode ? 'Редагувати тикет' : 'Створити новий тікет'}
          </h1>
          <p className="text-gray-600 mt-1">
            {isEditMode ? 'Внесіть зміни до тикету' : 'Заповніть форму нижче для створення нового запиту підтримки'}
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
          >
            Повернутися до тікетів
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
                    Заголовок тикету *
                  </label>
                  <Input
                    id="title"
                    name="title"
                    type="text"
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder="Коротко опишіть проблему"
                    required
                    maxLength={200}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.title.length}/200 символів
                  </p>
                </div>

                {/* Пріоритет */}
                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-2">
                    Пріоритет
                  </label>
                  <select
                    id="priority"
                    name="priority"
                    value={formData.priority}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value={TicketPriority.LOW}>Низький</option>
                    <option value={TicketPriority.MEDIUM}>Середній</option>
                    <option value={TicketPriority.HIGH}>Високий</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Оберіть пріоритет відповідно до терміновості проблеми
                  </p>
                </div>

                {/* Категорія */}
                <div>
                  <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                    Категорія
                  </label>
                  <select
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value={TicketCategory.TECHNICAL}>Технічна</option>
                    <option value={TicketCategory.ACCOUNT}>Обліковий запис</option>
                    <option value={TicketCategory.BILLING}>Оплата</option>
                    <option value={TicketCategory.GENERAL}>Загальне</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Оберіть категорію, що найкраще описує тип проблеми
                  </p>
                </div>

                {/* Місто */}
                <div>
                  <label htmlFor="cityId" className="block text-sm font-medium text-gray-700 mb-2">
                    Місто *
                  </label>
                  <select
                    id="cityId"
                    name="cityId"
                    value={formData.cityId}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="">Оберіть місто</option>
                    {cities.map((city) => (
                      <option key={city._id} value={city._id}>
                        {city.name} ({city.region})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Статус (тільки для редагування) */}
                {isEditMode && (
                  <div>
                    <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
                      Статус
                    </label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                      <option value={TicketStatus.OPEN}>Відкритий</option>
                      <option value={TicketStatus.IN_PROGRESS}>В роботі</option>
                      <option value={TicketStatus.RESOLVED}>Вирішений</option>
                      <option value={TicketStatus.CLOSED}>Закритий</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                {/* Опис */}
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text mb-2">
                    Детальний опис *
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Детально опишіть проблему, кроки для відтворення, очікуваний результат..."
                    required
                    rows={12}
                    maxLength={2000}
                    className="w-full px-3 py-2 border border-border rounded-lg shadow-sm bg-surface text placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-vertical"
                  />
                  <p className="text-xs text-text-secondary mt-1">
                    {formData.description.length}/2000 символів
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
                    {isEditMode ? 'Оновлення...' : 'Створення...'}
                  </>
                ) : (
                  isEditMode ? 'Зберегти зміни' : 'Створити тикет'
                )}
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isLoading}
                className="flex-1 sm:flex-none sm:px-8"
              >
                Скасувати
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateTicket;