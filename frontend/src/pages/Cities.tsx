import React, { useEffect, useState } from 'react';
import { Plus, Search, Edit, Trash2, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import ConfirmationModal from '../components/UI/ConfirmationModal';
import Pagination from '../components/UI/Pagination';
import { useCities, useWindowSize } from '../hooks';
import { useConfirmation } from '../hooks/useConfirmation';
import { useTranslation } from 'react-i18next';
import { City } from '../types';

interface CityFormData {
  name: string;
  region: string;
}

const Cities: React.FC = () => {
  const { t } = useTranslation();
  const { width } = useWindowSize();
  const isMobile = width < 768;
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const itemsPerPage = 20;
  
  const { cities, pagination, isLoading, error, createCity, updateCity, deleteCity, refetch } = useCities(currentPage, itemsPerPage, searchTerm);
  const { confirmationState, showConfirmation, hideConfirmation } = useConfirmation();
  const [showForm, setShowForm] = useState(false);
  const [editingCity, setEditingCity] = useState<City | null>(null);
  const [formData, setFormData] = useState<CityFormData>({
    name: '',
    region: ''
  });
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Скидаємо сторінку на 1 при зміні пошуку
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // WebSocket підписки для синхронізації міст
  useEffect(() => {
    let socket: any = null;
    
    const connectWebSocket = async () => {
      try {
        const { io } = await import('socket.io-client');
        const rawUrl = (process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || '') as string;
        const socketUrl = rawUrl.replace(/\/api\/?$/, '');
        socket = io(socketUrl);
        
        socket.on('connect', () => {
          console.log('Connected to WebSocket for cities updates');
          socket.emit('join-admin-room');
        });

        socket.on('city:created', () => {
          console.log('City created - refreshing list');
          refetch();
        });

        socket.on('city:updated', () => {
          console.log('City updated - refreshing list');
          refetch();
        });

        socket.on('city:deleted', () => {
          console.log('City deleted - refreshing list');
          refetch();
        });

        socket.on('disconnect', () => {
          console.log('Disconnected from WebSocket');
        });
      } catch (error) {
        console.error('Error connecting to WebSocket:', error);
      }
    };

    connectWebSocket();

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [refetch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      const cityData = {
        ...formData,
        coordinates: { lat: 50.4501, lng: 30.5234 } // Default coordinates (Kyiv), can be updated later
      };
      
      if (editingCity) {
        await updateCity(editingCity._id, cityData);
      } else {
        await createCity(cityData);
      }
      
      setShowForm(false);
      setEditingCity(null);
      setFormData({ name: '', region: '' });
    } catch (error) {
      console.error(t('cities.saveError'), error);
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (city: City) => {
    setEditingCity(city);
    setFormData({
      name: city.name,
      region: city.region
    });
    setShowForm(true);
  };

  const handleDelete = async (cityId: string, cityName: string) => {
    showConfirmation({
      title: t('cities.deleteCity'),
      message: t('cities.deleteConfirmation', { cityName }),
      type: 'danger',
      confirmText: t('cities.delete'),
      cancelText: t('cities.cancel'),
      onConfirm: async () => {
        try {
          await deleteCity(cityId);
          hideConfirmation();
          // Показуємо успішне повідомлення
          const successMessage = t('cities.deleteSuccess') || t('messages.deleteSuccess') || 'Місто успішно видалено';
          toast.success(successMessage);
        } catch (error: any) {
          console.error(t('cities.deleteError'), error);
          // Показуємо помилку користувачу
          const errorMessage = error?.response?.data?.message || 
                              error?.message || 
                              t('cities.deleteError') || 
                              t('errors.general') ||
                              'Помилка видалення міста';
          toast.error(errorMessage);
        }
      },
      onCancel: hideConfirmation
    });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingCity(null);
    setFormData({ name: '', region: '' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t('cities.title')}</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            {t('cities.description')} ({pagination?.totalItems || 0} {t('cities.citiesCount')})
          </p>
        </div>
        <div className="mt-2 sm:mt-0">
          <Button onClick={() => setShowForm(true)} size={isMobile ? "sm" : "md"}>
            <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            {t('cities.addCity')}
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-3 sm:p-4 lg:p-6">
          <Input
            type="text"
            placeholder={t('cities.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search className="w-3 h-3 sm:w-4 sm:h-4" />}
            className="w-full sm:max-w-md"
          />
        </CardContent>
      </Card>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader className="p-3 sm:p-4 lg:p-6">
              <h3 className="text-base sm:text-lg font-semibold">
                {editingCity ? t('cities.editCity') : t('cities.addNewCity')}
              </h3>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                <Input
                  type="text"
                  placeholder={t('cities.cityName')}
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                  disabled={formLoading}
                />
                
                <Input
                  type="text"
                  placeholder={t('cities.regionArea')}
                  value={formData.region}
                  onChange={(e) => setFormData(prev => ({ ...prev, region: e.target.value }))}
                  required
                  disabled={formLoading}
                />

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:space-x-3">
                  <Button
                    type="submit"
                    isLoading={formLoading}
                    disabled={formLoading}
                    className="flex-1 w-full sm:w-auto"
                    size={isMobile ? "sm" : "md"}
                  >
                    {editingCity ? t('cities.update') : t('cities.create')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={formLoading}
                    className="flex-1 w-full sm:w-auto"
                    size={isMobile ? "sm" : "md"}
                  >
                    {t('cities.cancel')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cities List */}
      <Card>
        <CardContent className="p-0">
          {cities.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <MapPin className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
                {t('cities.noCitiesFound')}
              </h3>
              <p className="text-sm sm:text-base text-gray-500">
                {searchTerm ? t('cities.changeSearchQuery') : t('cities.addFirstCity')}
              </p>
            </div>
          ) : isMobile ? (
            // Мобільний вигляд з картками
            <div className="divide-y divide-border">
              {cities.map((city) => (
                <div key={city._id} className="p-3 sm:p-4 hover:bg-surface/50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1 min-w-0">
                      <MapPin className="h-5 w-5 text-text-secondary flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground mb-1">
                          {city.name}
                        </div>
                        <div className="text-xs sm:text-sm text-text-secondary mb-1">
                          <span className="font-medium">{t('cities.region')}:</span> {city.region}
                        </div>
                        <div className="text-xs text-text-secondary">
                          <span className="font-medium">{t('cities.createdDate')}:</span> {city.createdAt ? new Date(city.createdAt).toLocaleDateString() : '-'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 sm:space-x-2 ml-2 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(city)}
                        className="p-1.5 sm:p-2"
                      >
                        <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(city._id, city.name)}
                        className="text-red-600 hover:text-red-700 p-1.5 sm:p-2"
                      >
                        <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Десктопний вигляд з таблицею
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface border-b border-border">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      {t('cities.name')}
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      {t('cities.region')}
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      {t('cities.createdDate')}
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider">
                      {t('cities.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-surface divide-y divide-border">
                  {cities.map((city) => (
                    <tr key={city._id} className="hover:bg-surface/50">
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center">
                          <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-text-secondary mr-2 sm:mr-3" />
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {city.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-text-secondary">
                        {city.region}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-text-secondary">
                         {city.createdAt ? new Date(city.createdAt).toLocaleDateString() : '-'}
                       </td>
                      <td className="px-4 sm:px-6 py-4 text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(city)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(city._id, city.name)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <Pagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={(page) => {
                setCurrentPage(page);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}
        </CardContent>
      </Card>

      <ConfirmationModal
        isOpen={confirmationState.isOpen}
        title={confirmationState.title}
        message={confirmationState.message}
        type={confirmationState.type}
        confirmText={confirmationState.confirmText}
        cancelText={confirmationState.cancelText}
        onConfirm={confirmationState.onConfirm}
        onCancel={confirmationState.onCancel}
      />
    </div>
  );
};

export default Cities;