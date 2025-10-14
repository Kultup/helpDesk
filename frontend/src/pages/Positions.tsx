import React, { useState } from 'react';
import { Position, CreatePositionData } from '../types';
import { usePositions } from '../hooks/usePositions';
import { useConfirmation } from '../hooks/useConfirmation';
import { useTranslation } from 'react-i18next';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import Card from '../components/UI/Card';
import Modal from '../components/UI/Modal';
import ConfirmationModal from '../components/UI/ConfirmationModal';
import { Trash2, Edit, Plus, Search, Users, Building, CheckSquare, Square } from 'lucide-react';

// Використовуємо CreatePositionData як тип для форми
type PositionFormData = CreatePositionData;

const Positions: React.FC = () => {
  const { t } = useTranslation();
  const { positions, loading, error, createPosition, updatePosition, deletePosition, bulkDeletePositions } = usePositions();
  const { confirmationState, showConfirmation, hideConfirmation } = useConfirmation();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [formData, setFormData] = useState<PositionFormData>({
    title: '',
    description: '',
    department: '',
    permissions: [],
    responsibilities: [],
    requirements: [],
    skills: [],
    salary: {
      min: 0,
      max: 0,
      currency: 'UAH'
    },
    workSchedule: {
      type: 'full-time',
      hoursPerWeek: 40
    },
    reportingTo: '',
    isActive: true,
    isPublic: true
  });
  const [formLoading, setFormLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      console.log(t('positions.saveError'), formData);
      if (editingPosition) {
        await updatePosition(editingPosition._id, formData);
      } else {
        await createPosition(formData);
      }
      resetForm();
      setIsModalOpen(false);
    } catch (error) {
      console.error(t('positions.saveError'), error);
    } finally {
      setFormLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      department: '',
      permissions: [],
      responsibilities: [],
      requirements: [],
      skills: [],
      salary: {
        min: 0,
        max: 0,
        currency: 'UAH'
      },
      workSchedule: {
        type: 'full-time',
        hoursPerWeek: 40
      },
      reportingTo: '',
      isActive: true,
      isPublic: true
    });
    setEditingPosition(null);
  };

  const filteredPositions = positions?.filter(position =>
    position.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    position.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (position.description && position.description.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  const handleEdit = (position: Position) => {
    setFormData({
      title: position.title,
      description: position.description || '',
      department: position.department,
      permissions: position.permissions || [],
      responsibilities: position.responsibilities || [],
      requirements: position.requirements || [],
      skills: position.skills || [],
      salary: position.salary || {
        min: 0,
        max: 0,
        currency: 'UAH'
      },
      workSchedule: position.workSchedule || {
        type: 'full-time',
        hoursPerWeek: 40
      },
      reportingTo: position.reportingTo || '',
      isActive: position.isActive,
      isPublic: position.isPublic
    });
    setEditingPosition(position);
    setIsModalOpen(true);
  };

  const handleDelete = async (positionId: string, positionTitle: string) => {
    showConfirmation({
      title: t('positions.deletePosition'),
      message: t('positions.deleteConfirmation', { positionTitle }),
      type: 'danger',
      confirmText: t('positions.delete'),
      cancelText: t('positions.cancel'),
      onConfirm: async () => {
        try {
          await deletePosition(positionId);
          hideConfirmation();
        } catch (error) {
          console.error(t('positions.deleteError'), error);
        }
      },
      onCancel: hideConfirmation
    });
  };

  const handleSelectPosition = (positionId: string) => {
    setSelectedPositions(prev => 
      prev.includes(positionId) 
        ? prev.filter(id => id !== positionId)
        : [...prev, positionId]
    );
  };

  const handleSelectAll = () => {
    if (selectedPositions.length === filteredPositions.length) {
      setSelectedPositions([]);
    } else {
      setSelectedPositions(filteredPositions.map(position => position._id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPositions.length === 0) return;
    
    showConfirmation({
      title: t('positions.bulkDeletePositions'),
      message: t('positions.bulkDeleteConfirmation', { count: selectedPositions.length }),
      type: 'danger',
      confirmText: t('positions.deleteAll'),
      cancelText: t('positions.cancel'),
      onConfirm: async () => {
        setBulkDeleteLoading(true);
        try {
          await bulkDeletePositions(selectedPositions);
          setSelectedPositions([]);
          hideConfirmation();
        } catch (error) {
          console.error(t('positions.deleteError'), error);
        } finally {
          setBulkDeleteLoading(false);
        }
      },
      onCancel: hideConfirmation
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('positions.title')}</h1>
          <p className="text-gray-600 mt-1">
            {t('positions.description')} ({positions?.length || 0} {t('positions.positionsCount')})
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-2">
          {selectedPositions.length > 0 && (
            <Button
              onClick={handleBulkDelete}
              disabled={bulkDeleteLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {bulkDeleteLoading ? t('positions.deleting') : `${t('positions.bulkDelete')} (${selectedPositions.length})`}
            </Button>
          )}
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('positions.addPosition')}
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Search */}
      <Card>
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder={t('positions.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          {filteredPositions.length > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
              >
                {selectedPositions.length === filteredPositions.length ? (
                  <CheckSquare className="w-4 h-4" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                {selectedPositions.length === filteredPositions.length ? t('positions.deselectAll') : t('positions.selectAll')}
              </button>
              {selectedPositions.length > 0 && (
                <span className="text-sm text-gray-500">
                  {t('positions.selected', { count: selectedPositions.length, total: filteredPositions.length })}
                </span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Positions List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPositions.map((position) => (
            <Card key={position._id}>
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center">
                    <button
                      onClick={() => handleSelectPosition(position._id)}
                      className="mr-3 text-gray-400 hover:text-gray-600"
                    >
                      {selectedPositions.includes(position._id) ? (
                        <CheckSquare className="h-5 w-5 text-blue-600" />
                      ) : (
                        <Square className="h-5 w-5" />
                      )}
                    </button>
                  <Users className="h-5 w-5 text-blue-500 mr-2" />
                  <h3 className="font-semibold text-gray-900">{String(position.title || t('positions.noTitle'))}</h3>
                </div>
                <div className="flex space-x-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(position)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(position._id, position.title)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center text-sm text-gray-600">
                  <Building className="h-4 w-4 mr-2" />
                  <span>{String(position.department || t('positions.notSpecified'))}</span>
                </div>
                {position.description && (
                  <p className="text-sm text-gray-600 mt-2">
                    {String(position.description).length > 100 
                      ? `${String(position.description).substring(0, 100)}...` 
                      : String(position.description)
                    }
                  </p>
                )}
                
                {/* Skills Display */}
                {position.skills && position.skills.length > 0 && (
                  <div className="mt-3">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">{t('positions.skillsLabel')}</h4>
                    <div className="flex flex-wrap gap-1">
                      {position.skills.slice(0, 3).map((skill, index) => (
                        <span
                          key={`${position._id}-skill-${index}`}
                          className={`inline-block px-2 py-1 rounded-full text-xs ${
                            skill.level === 'expert' ? 'bg-purple-100 text-purple-800' :
                            skill.level === 'advanced' ? 'bg-blue-100 text-blue-800' :
                            skill.level === 'intermediate' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          } ${skill.required ? 'ring-2 ring-red-200' : ''}`}
                          title={`${String(skill.name || t('positions.skillName'))} (${
                            skill.level === 'expert' ? t('positions.expert') :
                            skill.level === 'advanced' ? t('positions.advanced') :
                            skill.level === 'intermediate' ? t('positions.intermediate') :
                            t('positions.basic')
                          })${skill.required ? ` - ${t('positions.required')}` : ''}`}
                        >
                          {String(skill.name || t('positions.skillName'))}
                          {skill.required && <span className="ml-1 text-red-500">*</span>}
                        </span>
                      ))}
                      {position.skills.length > 3 && (
                        <span className="inline-block px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-600">
                          +{position.skills.length - 3} {t('positions.moreSkills')}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="flex space-x-2 mt-2">
                  {position.isActive && (
                    <span className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                      {t('positions.active')}
                    </span>
                  )}
                  {position.isPublic && (
                    <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                      {t('positions.public')}
                    </span>
                  )}
                </div>
              </div>
              </div>
            </Card>
         ))}
      </div>

      {filteredPositions.length === 0 && !loading && (
        <Card>
          <div className="text-center py-8">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? t('positions.noPositionsFound') : t('positions.noPositions')}
            </h3>
            <p className="text-gray-600">
              {searchTerm 
                ? t('positions.changeSearchQuery')
                : t('positions.addFirstPosition')
              }
            </p>
          </div>
        </Card>
      )}

      {/* Modal Form */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        title={editingPosition ? t('positions.editPosition') : t('positions.addNewPosition')}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('positions.title_field')} *
            </label>
            <Input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              placeholder={t('positions.placeholderTitle')}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('positions.department')} *
            </label>
            <Input
              type="text"
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              required
              placeholder={t('positions.placeholderDepartment')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('positions.description_field')}
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t('positions.placeholderDescription')}
            />
          </div>

          {/* Skills Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('positions.skills')}
            </label>
            <div className="space-y-2">
              {formData.skills?.map((skill, index) => (
                <div key={`skill-form-${index}`} className="flex items-center gap-2 p-2 border border-gray-200 rounded-md">
                  <Input
                    type="text"
                    value={skill.name}
                    onChange={(e) => {
                      const newSkills = [...(formData.skills || [])];
                      newSkills[index] = { ...skill, name: e.target.value };
                      setFormData({ ...formData, skills: newSkills });
                    }}
                    placeholder={t('positions.skillName')}
                    className="flex-1"
                  />
                  <select
                    value={skill.level}
                    onChange={(e) => {
                      const newSkills = [...(formData.skills || [])];
                      newSkills[index] = { ...skill, level: e.target.value as 'basic' | 'intermediate' | 'advanced' | 'expert' };
                      setFormData({ ...formData, skills: newSkills });
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="basic">{t('positions.basic')}</option>
                    <option value="intermediate">{t('positions.intermediate')}</option>
                    <option value="advanced">{t('positions.advanced')}</option>
                    <option value="expert">{t('positions.expert')}</option>
                  </select>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={skill.required}
                      onChange={(e) => {
                        const newSkills = [...(formData.skills || [])];
                        newSkills[index] = { ...skill, required: e.target.checked };
                        setFormData({ ...formData, skills: newSkills });
                      }}
                      className="mr-1"
                    />
                    <span className="text-sm">{t('positions.required')}</span>
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newSkills = formData.skills?.filter((_, i) => i !== index) || [];
                      setFormData({ ...formData, skills: newSkills });
                    }}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const newSkills = [...(formData.skills || []), { name: '', level: 'basic' as const, required: false }];
                  setFormData({ ...formData, skills: newSkills });
                }}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('positions.addSkill')}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                {t('positions.activePosition')}
              </label>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isPublic"
                checked={formData.isPublic}
                onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="isPublic" className="ml-2 block text-sm text-gray-900">
                {t('positions.publicPosition')}
              </label>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
              disabled={formLoading}
            >
              {t('positions.cancel')}
            </Button>
            <Button type="submit" disabled={formLoading}>
              {formLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {t('positions.saving')}
                </>
              ) : (
                editingPosition ? t('positions.update') : t('positions.create')
              )}
            </Button>
          </div>
        </form>
      </Modal>

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

export default Positions;