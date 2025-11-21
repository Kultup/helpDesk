import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import Card, { CardContent, CardHeader, CardTitle } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/UI/Select';
import Badge from '../components/UI/Badge';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Category } from '../types';

interface TemplateField {
  name: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'number';
  required: boolean;
  options?: string[];
}

interface CreateTemplateForm {
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  estimatedResolutionTime: number;
  tags: string[];
  fields: TemplateField[];
  instructions: string;
  isActive: boolean;
}

const CreateTemplate: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isEditMode = !!id;
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string>('');
  const [newTag, setNewTag] = useState('');
  
  const [formData, setFormData] = useState<CreateTemplateForm>({
    title: '',
    description: '',
    category: '',
    priority: 'medium',
    estimatedResolutionTime: 24,
    tags: [],
    fields: [],
    instructions: '',
    isActive: true
  });

  useEffect(() => {
    const loadData = async () => {
      await loadCategories();
      if (isEditMode && id) {
        // Завантажуємо шаблон після того, як категорії завантажені
        await loadTemplate(id);
      }
    };
    loadData();
  }, [id, isEditMode]);

  const loadCategories = async () => {
    try {
      const response = await apiService.getCategories(true); // Завантажуємо всі категорії, включно з неактивними
      setCategories(response.data || []);
    } catch (error) {
      console.error(t('templates.errors.loadCategoriesError'), error);
    }
  };

  const loadTemplate = async (templateId: string) => {
    try {
      setInitialLoading(true);
      const response = await apiService.getTicketTemplateById(templateId);
      // API повертає { success: true, data: template }
      const template = (response.data || response) as {
        category?: { _id?: string } | string;
        title?: string;
        description?: string;
        priority?: string;
        estimatedResolutionTime?: number;
        tags?: string[];
        fields?: unknown[];
        instructions?: string;
        isActive?: boolean;
      };
      console.log('Loaded template:', template);
      if (template) {
        const categoryId = typeof template.category === 'object' ? template.category?._id : template.category || '';
        console.log('Category ID:', categoryId, 'Category object:', template.category);
        setFormData({
          title: template.title || '',
          description: template.description || '',
          category: categoryId || '',
          priority: template.priority || 'medium',
          estimatedResolutionTime: template.estimatedResolutionTime || 24,
          tags: template.tags || [],
          fields: template.fields || [],
          instructions: template.instructions || '',
          isActive: template.isActive !== undefined ? template.isActive : true
        });
        console.log('Form data set:', {
          title: template.title || '',
          description: template.description || '',
          category: categoryId
        });
      }
    } catch (error: any) {
      console.error('Error loading template:', error);
      setError(error.response?.data?.message || t('templates.errors.loadTemplateError'));
      navigate('/templates');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const addField = () => {
    setFormData(prev => ({
      ...prev,
      fields: [...prev.fields, {
        name: '',
        type: 'text',
        required: false,
        options: []
      }]
    }));
  };

  const updateField = (index: number, field: Partial<TemplateField>) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => i === index ? { ...f, ...field } : f)
    }));
  };

  const removeField = (index: number) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isEditMode && id) {
        await apiService.updateTicketTemplate(id, formData as unknown as Record<string, unknown>);
      } else {
        await apiService.createTicketTemplate(formData as unknown as Record<string, unknown>);
      }
      navigate('/templates');
    } catch (error: any) {
      setError(error.response?.data?.message || (isEditMode ? t('templates.errors.updateFailed') : t('templates.errors.createFailed')));
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityLabel = (priority: string) => {
    return t(`templates.priority.${priority}`, { defaultValue: t('templates.priority.medium') });
  };

  if (initialLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center space-x-4 mb-4">
          <Button
            variant="outline"
            onClick={() => navigate('/templates')}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('createTemplate.backToTemplates')}</span>
          </Button>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditMode ? t('createTemplate.editTitle') : t('createTemplate.title')}
        </h1>
        <p className="text-gray-600 mt-1">
          {isEditMode ? t('createTemplate.editSubtitle') : t('createTemplate.subtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Основна інформація */}
        <Card>
          <CardHeader>
            <CardTitle>{t('createTemplate.basicInfo.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('createTemplate.basicInfo.templateName')} *
                </label>
                <Input
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder={t('createTemplate.basicInfo.templateNamePlaceholder')}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('createTemplate.basicInfo.category')} *
                </label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => handleSelectChange('category', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('createTemplate.basicInfo.categoryPlaceholder')}>
                      {formData.category && categories.length > 0 ? (
                        (() => {
                          const selectedCategory = categories.find(cat => cat._id === formData.category);
                          return selectedCategory ? (
                            <div className="flex items-center space-x-2">
                              <div 
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: selectedCategory.color }}
                              />
                              <span>{selectedCategory.name}</span>
                            </div>
                          ) : null;
                        })()
                      ) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category._id} value={category._id}>
                        <div className="flex items-center space-x-2">
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                          <span>{category.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('createTemplate.basicInfo.description')} *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder={t('createTemplate.basicInfo.descriptionPlaceholder')}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('createTemplate.basicInfo.priority')}
                </label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => handleSelectChange('priority', value as 'low' | 'medium' | 'high')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">
                      <Badge className={getPriorityColor('low')}>{getPriorityLabel('low')}</Badge>
                    </SelectItem>
                    <SelectItem value="medium">
                      <Badge className={getPriorityColor('medium')}>{getPriorityLabel('medium')}</Badge>
                    </SelectItem>
                    <SelectItem value="high">
                      <Badge className={getPriorityColor('high')}>{getPriorityLabel('high')}</Badge>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('createTemplate.basicInfo.estimatedTime')}
                </label>
                <Input
                  name="estimatedResolutionTime"
                  type="number"
                  value={formData.estimatedResolutionTime}
                  onChange={handleInputChange}
                  min="1"
                  max="720"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Теги */}
        <Card>
          <CardHeader>
            <CardTitle>{t('createTemplate.tags.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex space-x-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder={t('createTemplate.tags.placeholder')}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" onClick={addTag} variant="outline">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag, index) => (
                  <Badge key={`tag-${index}-${tag}`} variant="secondary" className="flex items-center space-x-1">
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-1 hover:text-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Інструкції */}
        <Card>
          <CardHeader>
            <CardTitle>{t('createTemplate.instructions.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              name="instructions"
              value={formData.instructions}
              onChange={handleInputChange}
              placeholder={t('createTemplate.instructions.placeholder')}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </CardContent>
        </Card>

        {/* Додаткові поля */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t('createTemplate.additionalFields.title')}</span>
              <Button type="button" onClick={addField} variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                {t('createTemplate.additionalFields.addField')}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {formData.fields.map((field, index) => (
                <div key={`field-${index}`} className="border border-gray-200 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('createTemplate.additionalFields.fieldName')}
                      </label>
                      <Input
                        value={field.name}
                        onChange={(e) => updateField(index, { name: e.target.value })}
                        placeholder={t('createTemplate.additionalFields.fieldNamePlaceholder')}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('createTemplate.additionalFields.fieldType')}
                      </label>
                      <Select
                        value={field.type}
                        onValueChange={(value) => updateField(index, { type: value as any })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">{t('createTemplate.fieldTypes.text')}</SelectItem>
                          <SelectItem value="textarea">{t('createTemplate.fieldTypes.textarea')}</SelectItem>
                          <SelectItem value="select">{t('createTemplate.fieldTypes.select')}</SelectItem>
                          <SelectItem value="checkbox">{t('createTemplate.fieldTypes.checkbox')}</SelectItem>
                          <SelectItem value="number">{t('createTemplate.fieldTypes.number')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end space-x-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => updateField(index, { required: e.target.checked })}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">{t('createTemplate.additionalFields.required')}</span>
                      </label>
                      <Button
                        type="button"
                        onClick={() => removeField(index)}
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  {field.type === 'select' && (
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('createTemplate.additionalFields.options')}
                      </label>
                      <Input
                        value={field.options?.join(', ') || ''}
                        onChange={(e) => updateField(index, { 
                          options: e.target.value.split(',').map(opt => opt.trim()).filter(Boolean)
                        })}
                        placeholder={t('createTemplate.additionalFields.optionsPlaceholder')}
                      />
                    </div>
                  )}
                </div>
              ))}
              {formData.fields.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>{t('createTemplate.additionalFields.noFields')}</p>
                  <p className="text-sm">{t('createTemplate.additionalFields.noFieldsDescription')}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Кнопки */}
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/templates')}
            disabled={loading}
          >
            {t('createTemplate.buttons.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={loading || !formData.title || !formData.description || !formData.category}
            className="flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>
              {loading 
                ? (isEditMode ? t('createTemplate.buttons.updating') : t('createTemplate.buttons.creating'))
                : (isEditMode ? t('createTemplate.buttons.update') : t('createTemplate.buttons.create'))
              }
            </span>
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CreateTemplate;