import React, { useEffect, useState } from 'react';
import { Plus, Search, Edit, Trash2, MapPin } from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import ConfirmationModal from '../components/UI/ConfirmationModal';
import { useCities } from '../hooks';
import { useConfirmation } from '../hooks/useConfirmation';
import { useTranslation } from 'react-i18next';
import { City } from '../types';

interface CityFormData {
  name: string;
  region: string;
}

const Cities: React.FC = () => {
  const { t } = useTranslation();
  const { cities, isLoading, error, createCity, updateCity, deleteCity, refetch } = useCities();
  const { confirmationState, showConfirmation, hideConfirmation } = useConfirmation();
  const [searchTerm, setSearchTerm] = useState('');
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

  const filteredCities = cities.filter(city =>
    city.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    city.region.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        } catch (error) {
          console.error(t('cities.deleteError'), error);
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('cities.title')}</h1>
          <p className="text-gray-600 mt-1">
            {t('cities.description')} ({cities?.length || 0} {t('cities.citiesCount')})
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('cities.addCity')}
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-6">
          <Input
            type="text"
            placeholder={t('cities.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
            className="max-w-md"
          />
        </CardContent>
      </Card>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <h3 className="text-lg font-semibold">
                {editingCity ? t('cities.editCity') : t('cities.addNewCity')}
              </h3>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
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

                <div className="flex space-x-3">
                  <Button
                    type="submit"
                    isLoading={formLoading}
                    disabled={formLoading}
                    className="flex-1"
                  >
                    {editingCity ? t('cities.update') : t('cities.create')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={formLoading}
                    className="flex-1"
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
          {filteredCities.length === 0 ? (
            <div className="text-center py-12">
              <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {t('cities.noCitiesFound')}
              </h3>
              <p className="text-gray-500">
                {searchTerm ? t('cities.changeSearchQuery') : t('cities.addFirstCity')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface border-b border-border">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      {t('cities.name')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      {t('cities.region')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      {t('cities.createdDate')}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider">
                      {t('cities.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-surface divide-y divide-border">
                  {filteredCities.map((city) => (
                    <tr key={city._id} className="hover:bg-surface/50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <MapPin className="h-5 w-5 text-text-secondary mr-3" />
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {city.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                        {city.region}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                         {city.createdAt ? new Date(city.createdAt).toLocaleDateString() : '-'}
                       </td>
                      <td className="px-6 py-4 text-right text-sm font-medium">
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