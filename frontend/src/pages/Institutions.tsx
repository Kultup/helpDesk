import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

const Institutions: React.FC = () => {
  const { t } = useTranslation();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingInstitution, setEditingInstitution] = useState<Institution | null>(null);
  const [selectedInstitutions, setSelectedInstitutions] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: ''
  });



  useEffect(() => {
    fetchInstitutions();
    fetchCities();
  }, []);

  const fetchInstitutions = async () => {
    try {
      setLoading(true);
      const response = await institutionService.getAll({
        sortBy: 'createdAt',
        sortOrder: 'desc',
        limit: 100
      });
      setInstitutions(response.institutions);
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
      
      // Відправляємо тільки назву закладу
      const submitData = {
        name: formData.name.trim()
      };

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
      name: ''
    });
    setEditingInstitution(null);
  };

  const filteredInstitutions = institutions.filter(institution =>
    institution.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(institution.type || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (institution.description && institution.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleEdit = (institution: Institution) => {
    setEditingInstitution(institution);
    setFormData({
      name: institution.name
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
    if (selectedInstitutions.length === filteredInstitutions.length) {
      setSelectedInstitutions([]);
    } else {
      setSelectedInstitutions(filteredInstitutions.map(institution => institution._id));
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
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <Building2 className="h-8 w-8 text-primary-600 mr-3" />
          <h1 className="text-3xl font-bold text-foreground">{t('institutions.title')}</h1>
        </div>
        <div className="flex space-x-3">
          {selectedInstitutions.length > 0 && (
            <Button
              onClick={handleBulkDelete}
              variant="danger"
              className="flex items-center"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('institutions.bulkDelete')} ({selectedInstitutions.length})
            </Button>
          )}
          <Button
            onClick={() => setShowAddForm(true)}
            className="flex items-center"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('institutions.add')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Add Institution Form */}
      {showAddForm && (
        <Card className="mb-6">
          <CardContent>
            <h3 className="text-lg font-medium text-foreground mb-4">
              {editingInstitution ? t('institutions.edit') : t('institutions.add')}
            </h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                {t('institutions.institution')} *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-foreground bg-surface"
                placeholder={t('institutions.institutionPlaceholder')}
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  resetForm();
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={loading}
                isLoading={loading}
              >
                {loading ? t('common.saving') : (editingInstitution ? t('common.update') : t('common.save'))}
              </Button>
            </div>
          </form>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardContent className="flex items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-secondary h-4 w-4" />
            <input
              type="text"
              placeholder={t('institutions.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-border rounded-lg w-full focus:ring-2 focus:ring-primary-500 focus:border-transparent text-foreground bg-surface"
            />
          </div>
          
          {filteredInstitutions.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="ml-4 text-primary-600 hover:text-primary-800 font-medium dark:text-primary-400 dark:hover:text-primary-300"
            >
              {selectedInstitutions.length === filteredInstitutions.length
                ? t('institutions.deselectAll')
                : t('institutions.selectAll')
              }
            </button>
          )}
        </CardContent>
      </Card>

      {filteredInstitutions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Building2 className="mx-auto h-12 w-12 text-text-secondary" />
            <h3 className="mt-2 text-sm font-medium text-foreground">{t('institutions.noInstitutions')}</h3>
            <p className="mt-1 text-sm text-text-secondary">{t('institutions.noInstitutionsDescription')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filteredInstitutions.map((institution) => (
                <div
                  key={institution._id}
                  className={`p-6 hover:bg-surface/50 transition-colors ${
                    selectedInstitutions.includes(institution._id)
                      ? 'bg-primary-50/50 dark:bg-primary-900/10'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Основна інформація */}
                    <div className="flex items-start space-x-4 flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={selectedInstitutions.includes(institution._id)}
                          onChange={() => handleSelectInstitution(institution._id)}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-border rounded"
                        />
                        <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400">
                          <Building2 className="h-5 w-5" />
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <h3 className="text-lg font-semibold text-foreground leading-tight">
                              {institution.name}
                            </h3>
                            <span className="inline-block bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-xs px-2 py-1 rounded-full mt-1">
                              {getTypeLabel(institution.type)}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2 text-sm text-text-secondary mb-3">
                          <div className="flex items-center">
                            <MapPin className="h-4 w-4 mr-2 flex-shrink-0" />
                            <span>{institution.address?.street || '—'}, {getCityName(institution.address?.city)}</span>
                          </div>
                          
                          {institution.contact?.phone && (
                            <div className="flex items-center">
                              <Phone className="h-4 w-4 mr-2 flex-shrink-0" />
                              <span>{institution.contact?.phone}</span>
                            </div>
                          )}
                          
                          {institution.contact?.email && (
                            <div className="flex items-center">
                              <Mail className="h-4 w-4 mr-2 flex-shrink-0" />
                              <span>{institution.contact?.email}</span>
                            </div>
                          )}
                          
                          {institution.contact?.website && (
                            <div className="flex items-center">
                              <Globe className="h-4 w-4 mr-2 flex-shrink-0" />
                              <a 
                                href={institution.contact?.website} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-primary-600 dark:text-primary-400 hover:underline"
                              >
                                {t('institutions.website')}
                              </a>
                            </div>
                          )}
                          
                          {institution.capacity && (
                            <div className="flex items-center">
                              <Users className="h-4 w-4 mr-2 flex-shrink-0" />
                              <span>{t('institutions.capacity')}: {institution.capacity}</span>
                            </div>
                          )}
                        </div>

                        {institution.description && (
                          <p className="text-sm text-text-secondary mb-3 line-clamp-2">
                            {institution.description}
                          </p>
                        )}

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                            institution.isActive 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
                              : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                          }`}>
                            {institution.isActive ? (
                              <>
                                <CheckCircle className="h-3 w-3 mr-1" />
                                {t('institutions.active')}
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3 w-3 mr-1" />
                                {t('institutions.inactive')}
                              </>
                            )}
                          </span>
                          
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                            institution.isPublic 
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' 
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                          }`}>
                            {institution.isPublic ? (
                              <>
                                <Eye className="h-3 w-3 mr-1" />
                                {t('institutions.public')}
                              </>
                            ) : (
                              <>
                                <EyeOff className="h-3 w-3 mr-1" />
                                {t('institutions.private')}
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Дії */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(institution)}
                        className="p-2"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingInstitution(institution);
                          setShowDeleteModal(true);
                        }}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}


      {/* Delete Confirmation Modal */}
      {showDeleteModal && editingInstitution && (
        <div className="fixed inset-0 bg-black/50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <Card className="w-96">
            <CardContent className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 mb-4">
                <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-medium text-foreground mt-2">
                {t('institutions.confirmDelete')}
              </h3>
              <p className="text-sm text-text-secondary mt-2">
                {t('institutions.confirmDeleteMessage', { name: editingInstitution.name })}
              </p>
              <div className="flex justify-center space-x-3 mt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteModal(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleDelete(editingInstitution._id)}
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