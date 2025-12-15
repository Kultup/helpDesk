import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowSize } from '../hooks';
import { 
  Building2, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  MapPin, 
  Phone, 
  Mail, 
  Globe,
  Users,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { Institution, InstitutionType, City } from '../types';
import { institutionService } from '../services/institutionService';
import { cityService } from '../services/cityService';
import Card, { CardContent } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Pagination from '../components/UI/Pagination';

const Institutions: React.FC = () => {
  const { t } = useTranslation();
  const { width } = useWindowSize();
  const isMobile = width < 768;
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const itemsPerPage = 20;
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [pagination, setPagination] = useState<{
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  } | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingInstitution, setEditingInstitution] = useState<Institution | null>(null);
  const [selectedInstitutions, setSelectedInstitutions] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    city: ''
  });



  useEffect(() => {
    fetchCities();
  }, []);

  useEffect(() => {
    fetchInstitutions();
  }, [currentPage, searchTerm]);

  // Скидаємо сторінку на 1 при зміні пошуку
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const fetchInstitutions = async () => {
    try {
      setLoading(true);
      const response = await institutionService.getAll({
        page: currentPage,
        limit: itemsPerPage,
        search: searchTerm || undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });
      setInstitutions(response.institutions);
      if (response.pagination) {
        setPagination({
          currentPage: response.pagination.currentPage,
          totalPages: response.pagination.totalPages || Math.ceil((response.pagination.totalItems || 0) / itemsPerPage),
          totalItems: response.pagination.totalItems || 0,
          itemsPerPage: response.pagination.itemsPerPage || itemsPerPage,
          hasNextPage: response.pagination.hasNextPage || false,
          hasPrevPage: response.pagination.hasPrevPage || false
        });
      }
    } catch (err) {
      setError(t('institutions.errors.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const fetchCities = async () => {
    try {
      const response = await cityService.getAll();
      setCities(response.cities);
    } catch (err) {
      console.error('Failed to fetch cities:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError(t('institutions.errors.nameRequired'));
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      // Відправляємо дані закладу
      const submitData: any = {
        name: formData.name.trim()
      };
      
      // Додаємо місто, якщо воно вибрано
      if (formData.city) {
        submitData.address = {
          city: formData.city
        };
      }

      if (editingInstitution) {
        await institutionService.update(editingInstitution._id, submitData);
      } else {
        await institutionService.create(submitData);
      }
      
      await fetchInstitutions();
      resetForm();
      setShowAddForm(false);
    } catch (error: any) {
      setError(error.response?.data?.message || t('institutions.errors.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      city: ''
    });
    setEditingInstitution(null);
  };


  const handleEdit = (institution: Institution) => {
    setEditingInstitution(institution);
    setFormData({
      name: institution.name,
      city: typeof institution.address?.city === 'object' 
        ? institution.address.city._id 
        : institution.address?.city || ''
    });
    setShowAddForm(true);
  };

  const handleDelete = async (institutionId: string) => {
    try {
      await institutionService.delete(institutionId);
      await fetchInstitutions();
      setShowDeleteModal(false);
    } catch (err) {
      setError(t('institutions.errors.deleteFailed'));
    }
  };

  const handleSelectInstitution = (institutionId: string) => {
    setSelectedInstitutions(prev =>
      prev.includes(institutionId)
        ? prev.filter(id => id !== institutionId)
        : [...prev, institutionId]
    );
  };

  const handleSelectAll = () => {
    if (selectedInstitutions.length === institutions.length) {
      setSelectedInstitutions([]);
    } else {
      setSelectedInstitutions(institutions.map(institution => institution._id));
    }
  };

  const handleBulkDelete = async () => {
    try {
      await institutionService.bulkDelete(selectedInstitutions);
      await fetchInstitutions();
      setSelectedInstitutions([]);
    } catch (err) {
      setError(t('institutions.errors.bulkDeleteFailed'));
    }
  };

  const getTypeLabel = (type: InstitutionType) => {
    return type;
  };

  const getCityName = (city?: string | City) => {
    if (!city) return '—';
    if (typeof city === 'string') {
      const cityObj = cities.find(c => c._id === city);
      return cityObj ? cityObj.name : '—';
    }
    return city.name || '—';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0 mb-4 sm:mb-6">
        <div className="flex items-center">
          <Building2 className="h-5 w-5 sm:h-6 sm:w-6 lg:h-8 lg:w-8 text-primary-600 mr-2 sm:mr-3" />
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">{t('institutions.title')}</h1>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {selectedInstitutions.length > 0 && (
            <Button
              onClick={handleBulkDelete}
              variant="danger"
              className="flex items-center"
              size={isMobile ? "sm" : "md"}
            >
              <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              {t('institutions.bulkDelete')} ({selectedInstitutions.length})
            </Button>
          )}
          <Button
            onClick={() => setShowAddForm(true)}
            className="flex items-center"
            size={isMobile ? "sm" : "md"}
          >
            <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            {t('institutions.add')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2 sm:py-3 rounded mb-3 sm:mb-4 text-sm sm:text-base">
          {error}
        </div>
      )}

      {/* Add Institution Form */}
      {showAddForm && (
        <Card className="mb-4 sm:mb-6">
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <h3 className="text-base sm:text-lg font-medium text-foreground mb-3 sm:mb-4">
              {editingInstitution ? t('institutions.edit') : t('institutions.add')}
            </h3>
          
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-foreground mb-1">
                {t('institutions.institution')} *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-foreground bg-surface"
                placeholder={t('institutions.institutionPlaceholder')}
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-foreground mb-1">
                {t('institutions.city') || 'Місто'} *
              </label>
              <select
                required
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-foreground bg-surface"
              >
                <option value="">{t('institutions.selectCity') || 'Оберіть місто'}</option>
                {cities.map((city) => (
                  <option key={city._id} value={city._id}>
                    {city.name}{city.region ? ` (${city.region})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 sm:space-x-3 pt-3 sm:pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  resetForm();
                }}
                className="w-full sm:w-auto"
                size={isMobile ? "sm" : "md"}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={loading}
                isLoading={loading}
                className="w-full sm:w-auto"
                size={isMobile ? "sm" : "md"}
              >
                {loading ? t('common.saving') : (editingInstitution ? t('common.update') : t('common.save'))}
              </Button>
            </div>
          </form>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4 sm:mb-6">
        <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-text-secondary h-3 w-3 sm:h-4 sm:w-4" />
            <input
              type="text"
              placeholder={t('institutions.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 sm:pl-10 pr-3 sm:pr-4 py-1.5 sm:py-2 text-sm sm:text-base border border-border rounded-lg w-full focus:ring-2 focus:ring-primary-500 focus:border-transparent text-foreground bg-surface"
            />
          </div>
          
          {institutions.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="text-xs sm:text-sm text-primary-600 hover:text-primary-800 font-medium sm:ml-4"
            >
              {selectedInstitutions.length === institutions.length
                ? t('institutions.deselectAll')
                : t('institutions.selectAll')
              }
            </button>
          )}
        </CardContent>
      </Card>

      {institutions.length === 0 && !loading ? (
        <Card>
          <CardContent className="text-center py-8 sm:py-12">
            <Building2 className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-text-secondary" />
            <h3 className="mt-2 text-sm sm:text-base font-medium text-foreground">{t('institutions.noInstitutions')}</h3>
            <p className="mt-1 text-xs sm:text-sm text-text-secondary">{t('institutions.noInstitutionsDescription')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {institutions.map((institution) => (
                <div
                  key={institution._id}
                  className={`p-3 sm:p-4 lg:p-6 hover:bg-surface/50 transition-colors ${
                    selectedInstitutions.includes(institution._id)
                      ? 'bg-primary-50/50'
                      : ''
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
                    {/* Основна інформація */}
                    <div className="flex items-start space-x-2 sm:space-x-4 flex-1 min-w-0 w-full sm:w-auto">
                      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={selectedInstitutions.includes(institution._id)}
                          onChange={() => handleSelectInstitution(institution._id)}
                          className="h-3 w-3 sm:h-4 sm:w-4 text-primary-600 focus:ring-primary-500 border-border rounded"
                        />
                        <div className="p-1.5 sm:p-2 rounded-lg bg-primary-50 text-primary-600">
                          <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <h3 className="text-base sm:text-lg font-semibold text-foreground leading-tight">
                              {institution.name}
                            </h3>
                            <span className="inline-block bg-blue-100 text-blue-800 text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full mt-1">
                              {getTypeLabel(institution.type)}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm text-text-secondary mb-2 sm:mb-3">
                          <div className="flex items-center">
                            <MapPin className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 flex-shrink-0" />
                            <span className="break-words">{institution.address?.street || '—'}, {getCityName(institution.address?.city)}</span>
                          </div>
                          
                          {institution.contact?.phone && (
                            <div className="flex items-center">
                              <Phone className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 flex-shrink-0" />
                              <span className="break-words">{institution.contact?.phone}</span>
                            </div>
                          )}
                          
                          {institution.contact?.email && (
                            <div className="flex items-center">
                              <Mail className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 flex-shrink-0" />
                              <span className="break-words">{institution.contact?.email}</span>
                            </div>
                          )}
                          
                          {institution.contact?.website && (
                            <div className="flex items-center">
                              <Globe className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 flex-shrink-0" />
                              <a 
                                href={institution.contact?.website} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-primary-600 hover:underline break-words"
                              >
                                {t('institutions.website')}
                              </a>
                            </div>
                          )}
                          
                          {institution.capacity && (
                            <div className="flex items-center">
                              <Users className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 flex-shrink-0" />
                              <span>{t('institutions.capacity')}: {institution.capacity}</span>
                            </div>
                          )}
                        </div>

                        {institution.description && (
                          <p className="text-xs sm:text-sm text-text-secondary mb-2 sm:mb-3 line-clamp-2">
                            {institution.description}
                          </p>
                        )}

                        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                          <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs ${
                            institution.isActive 
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {institution.isActive ? (
                              <>
                                <CheckCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                                {t('institutions.active')}
                              </>
                            ) : (
                              <>
                                <XCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                                {t('institutions.inactive')}
                              </>
                            )}
                          </span>
                          
                          <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs ${
                            institution.isPublic 
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {institution.isPublic ? (
                              <>
                                <Eye className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                                {t('institutions.public')}
                              </>
                            ) : (
                              <>
                                <EyeOff className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                                {t('institutions.private')}
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Дії */}
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 w-full sm:w-auto justify-end sm:justify-start">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(institution)}
                        className="p-1.5 sm:p-2"
                      >
                        <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingInstitution(institution);
                          setShowDeleteModal(true);
                        }}
                        className="p-1.5 sm:p-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
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
      )}


      {/* Delete Confirmation Modal */}
      {showDeleteModal && editingInstitution && (
        <div className="fixed inset-0 bg-black/50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-3 sm:p-4">
          <Card className="w-full sm:w-96">
            <CardContent className="text-center p-4 sm:p-6">
              <div className="mx-auto flex items-center justify-center h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-red-100 mb-3 sm:mb-4">
                <Trash2 className="h-5 w-5 sm:h-6 sm:w-6 text-red-600" />
              </div>
              <h3 className="text-base sm:text-lg font-medium text-foreground mt-2">
                {t('institutions.confirmDelete')}
              </h3>
              <p className="text-xs sm:text-sm text-text-secondary mt-2">
                {t('institutions.confirmDeleteMessage', { name: editingInstitution.name })}
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-3 sm:space-x-3 mt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteModal(false)}
                  className="w-full sm:w-auto"
                  size={isMobile ? "sm" : "md"}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleDelete(editingInstitution._id)}
                  className="w-full sm:w-auto"
                  size={isMobile ? "sm" : "md"}
                >
                  {t('common.delete')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Institutions;