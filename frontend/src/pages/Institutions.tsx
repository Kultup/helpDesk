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
      setError('Назва закладу є обов\'язковою');
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
      setError(error.response?.data?.message || 'Помилка при створенні закладу');
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
          <Building2 className="h-8 w-8 text-blue-600 mr-3" />
          <h1 className="text-3xl font-bold text-gray-900">{t('institutions.title')}</h1>
        </div>
        <div className="flex space-x-3">
          {selectedInstitutions.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('institutions.bulkDelete')} ({selectedInstitutions.length})
            </button>
          )}
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('institutions.add')}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Add Institution Form */}
      {showAddForm && (
        <div className="mb-6 bg-white p-6 rounded-lg shadow-md border">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {editingInstitution ? t('institutions.edit') : t('institutions.add')}
          </h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
                {t('institutions.institution')} *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-[var(--color-text)] bg-surface"
                placeholder={t('institutions.institutionPlaceholder')}
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  resetForm();
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? t('common.saving') : (editingInstitution ? t('common.update') : t('common.save'))}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder={t('institutions.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent text-[var(--color-text)] bg-surface"
          />
        </div>
        
        {filteredInstitutions.length > 0 && (
          <button
            onClick={handleSelectAll}
            className="ml-4 text-blue-600 hover:text-blue-800 font-medium"
          >
            {selectedInstitutions.length === filteredInstitutions.length
              ? t('institutions.deselectAll')
              : t('institutions.selectAll')
            }
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredInstitutions.map((institution) => (
          <div
            key={institution._id}
            className={`bg-white rounded-lg shadow-md p-6 border-l-4 ${
              selectedInstitutions.includes(institution._id)
                ? 'border-l-blue-500 bg-blue-50'
                : 'border-l-gray-300'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedInstitutions.includes(institution._id)}
                  onChange={() => handleSelectInstitution(institution._id)}
                  className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{institution.name}</h3>
                  <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                    {getTypeLabel(institution.type)}
                  </span>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEdit(institution)}
                  className="text-blue-600 hover:text-blue-800"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setEditingInstitution(institution);
                    setShowDeleteModal(true);
                  }}
                  className="text-red-600 hover:text-red-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center">
                <MapPin className="h-4 w-4 mr-2" />
                <span>{institution.address?.street || '—'}, {getCityName(institution.address?.city)}</span>
              </div>
              
              {institution.contact?.phone && (
                <div className="flex items-center">
                  <Phone className="h-4 w-4 mr-2" />
                  <span>{institution.contact?.phone}</span>
                </div>
              )}
              
              {institution.contact?.email && (
                <div className="flex items-center">
                  <Mail className="h-4 w-4 mr-2" />
                  <span>{institution.contact?.email}</span>
                </div>
              )}
              
              {institution.contact?.website && (
                <div className="flex items-center">
                  <Globe className="h-4 w-4 mr-2" />
                  <a href={institution.contact?.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {t('institutions.website')}
                  </a>
                </div>
              )}
              
              {institution.capacity && (
                <div className="flex items-center">
                  <Users className="h-4 w-4 mr-2" />
                  <span>{t('institutions.capacity')}: {institution.capacity}</span>
                </div>
              )}
            </div>

            {institution.description && (
              <p className="mt-3 text-sm text-gray-700 line-clamp-2">{institution.description}</p>
            )}

            <div className="mt-4 flex items-center justify-between">
              <div className="flex space-x-2">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                  institution.isActive 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
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
                    ? 'bg-blue-100 text-blue-800' 
                    : 'bg-gray-100 text-gray-800'
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
        ))}
      </div>

      {filteredInstitutions.length === 0 && (
        <div className="text-center py-12">
          <Building2 className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">{t('institutions.noInstitutions')}</h3>
          <p className="mt-1 text-sm text-gray-500">{t('institutions.noInstitutionsDescription')}</p>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && editingInstitution && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mt-2">
                {t('institutions.confirmDelete')}
              </h3>
              <p className="text-sm text-gray-500 mt-2">
                {t('institutions.confirmDeleteMessage', { name: editingInstitution.name })}
              </p>
              <div className="flex justify-center space-x-3 mt-4">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => handleDelete(editingInstitution._id)}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Institutions;