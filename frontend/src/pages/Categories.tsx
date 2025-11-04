import React, { useState, useEffect } from 'react';
import { Category, CreateCategoryForm, UpdateCategoryForm, CategoryStats } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { Plus, Edit2, Save, X, Trash2, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Categories: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editForm, setEditForm] = useState<CreateCategoryForm | UpdateCategoryForm>({
    name: '',
    description: '',
    color: '#3B82F6',
    icon: '',
    sortOrder: 0
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadCategories();
    loadCategoryStats();
  }, []);

  // Автоматичне приховування повідомлень
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const loadCategories = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getCategories(true); // Завантажуємо всі категорії, включно з неактивними
      if (response.data) {
        setCategories(response.data);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
      setError(t('categories.messages.loadError'));
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategoryStats = async () => {
    try {
      const response = await apiService.getCategoryStats();
      if (response.data) {
        setCategoryStats(response.data);
      }
    } catch (error) {
      console.error('Error loading category stats:', error);
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category._id);
    setEditForm({
      name: category.name,
      description: category.description,
      color: category.color,
      icon: category.icon,
      sortOrder: category.sortOrder
    });
  };

  const handleCreate = () => {
    setIsCreating(true);
    setEditForm({
      name: '',
      description: '',
      color: '#3B82F6',
      icon: '',
      sortOrder: categories.length
    });
  };

  const handleSave = async () => {
    try {
      setError(null);
      
      if (isCreating) {
        const response = await apiService.createCategory(editForm as CreateCategoryForm);
        if (response.data) {
          setCategories(prev => [...prev, response.data!]);
          setSuccess(t('categories.messages.createSuccess'));
        }
        setIsCreating(false);
      } else if (editingCategory) {
        const response = await apiService.updateCategory(editingCategory, editForm as UpdateCategoryForm);
        if (response.data) {
          setCategories(prev => prev.map(cat => 
            cat._id === editingCategory ? response.data! : cat
          ));
          setSuccess(t('categories.messages.updateSuccess'));
        }
        setEditingCategory(null);
      }
      
      await loadCategoryStats();
      resetForm();
    } catch (error) {
      console.error('Error saving category:', error);
      setError(t('categories.messages.saveError'));
    }
  };

  const handleDelete = async (categoryId: string) => {
    if (!window.confirm(t('categories.deleteConfirmation'))) {
      return;
    }

    try {
      await apiService.deleteCategory(categoryId);
      setCategories(prev => prev.filter(cat => cat._id !== categoryId));
      setSuccess(t('categories.messages.deleteSuccess'));
      await loadCategoryStats();
    } catch (error) {
      console.error('Error deleting category:', error);
      setError(t('categories.messages.deleteError'));
    }
  };

  const handleToggleActive = async (categoryId: string, isActive: boolean) => {
    try {
      let response: { data?: Category };
      if (isActive) {
        response = await apiService.deactivateCategory(categoryId);
        setSuccess(t('categories.messages.deactivateSuccess'));
      } else {
        response = await apiService.activateCategory(categoryId);
        setSuccess(t('categories.messages.activateSuccess'));
      }
      if (response.data) {
        setCategories(prev => prev.map(cat => 
          cat._id === categoryId ? response.data! : cat
        ));
      }
    } catch (error) {
      console.error('Error toggling category status:', error);
      setError(t('categories.messages.statusError'));
    }
  };

  const handleCancel = () => {
    resetForm();
  };

  const resetForm = () => {
    setEditingCategory(null);
    setIsCreating(false);
    setEditForm({
      name: '',
      description: '',
      color: '#3B82F6',
      icon: '',
      sortOrder: 0
    });
  };

  const getCategoryStats = (categoryId: string) => {
    return categoryStats.find(stat => stat.categoryId === categoryId) || {
      categoryId,
      totalTickets: 0,
      openTickets: 0,
      resolvedTickets: 0,
      avgResolutionTime: 0
    };
  };

  const filteredCategories = showInactive 
    ? categories 
    : categories.filter(cat => cat.isActive);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
      {/* Повідомлення */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2 sm:py-3 rounded-md text-sm sm:text-base">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-3 sm:px-4 py-2 sm:py-3 rounded-md text-sm sm:text-base">
          {success}
        </div>
      )}

      {/* Заголовок */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t('categories.title')}</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            {t('categories.subtitle')}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={() => setShowInactive(!showInactive)}
            className="flex items-center justify-center gap-2 text-xs sm:text-sm w-full sm:w-auto"
          >
            {showInactive ? <EyeOff className="h-3 w-3 sm:h-4 sm:w-4" /> : <Eye className="h-3 w-3 sm:h-4 sm:w-4" />}
            {showInactive ? t('categories.hideInactive') : t('categories.showInactive')}
          </Button>
          {user?.role === 'admin' && (
            <Button onClick={handleCreate} className="flex items-center justify-center gap-2 text-xs sm:text-sm w-full sm:w-auto">
              <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
              {t('categories.create')}
            </Button>
          )}
        </div>
      </div>

      {/* Статистика */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-center">
          <div>
            <p className="text-xl sm:text-2xl font-bold text-blue-600">{categories.length}</p>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">{t('categories.stats.total')}</p>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-bold text-green-600">
              {categoryStats.reduce((sum, stat) => sum + stat.totalTickets, 0)}
            </p>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">{t('categories.stats.totalTickets')}</p>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-bold text-orange-600">
              {categoryStats.reduce((sum, stat) => sum + stat.openTickets, 0)}
            </p>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">{t('categories.stats.openTickets')}</p>
          </div>
        </div>
      </div>

      {/* Форма створення категорії */}
      {isCreating && (
        <Card>
          <CardHeader>
            <h3 className="text-base sm:text-lg font-semibold">{t('categories.form.createTitle')}</h3>
          </CardHeader>
          <CardContent className="space-y-3 p-3 sm:p-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                {t('categories.form.name')}
              </label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('categories.form.namePlaceholder')}
                className="text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                {t('categories.form.description')}
              </label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('categories.form.descriptionPlaceholder')}
                className="text-sm sm:text-base"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  {t('categories.form.color')}
                </label>
                <input
                  type="color"
                  value={editForm.color}
                  onChange={(e) => setEditForm(prev => ({ ...prev, color: e.target.value }))}
                  className="w-full h-8 sm:h-10 border border-gray-300 rounded-md"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  {t('categories.form.icon')}
                </label>
                <Input
                  value={editForm.icon}
                  onChange={(e) => setEditForm(prev => ({ ...prev, icon: e.target.value }))}
                  placeholder={t('categories.form.iconPlaceholder')}
                  className="text-sm sm:text-base"
                />
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:space-x-2 pt-2">
              <Button variant="outline" onClick={handleCancel} className="w-full sm:w-auto text-xs sm:text-sm">
                {t('categories.form.cancel')}
              </Button>
              <Button onClick={handleSave} className="w-full sm:w-auto text-xs sm:text-sm">
                {t('categories.form.save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Список категорій */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="divide-y divide-gray-200">
          {filteredCategories.map((category) => {
            const stats = getCategoryStats(category._id);
            const isEditing = editingCategory === category._id;

            return (
              <div 
                key={category._id} 
                className={`p-3 sm:p-4 hover:bg-gray-50 transition-colors ${!category.isActive ? 'opacity-60' : ''}`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                  <div className="flex items-start sm:items-center space-x-3 sm:space-x-4 flex-1 min-w-0 w-full sm:w-auto">
                    <div 
                      className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-white text-base sm:text-lg flex-shrink-0"
                      style={{ backgroundColor: category.color }}
                    >
                      {category.icon}
                    </div>
                    
                    <div className="flex-1 min-w-0 w-full sm:w-auto">
                      {isEditing ? (
                        <div className="space-y-3 w-full">
                          <Input
                            value={editForm.name}
                            onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                            className="font-semibold text-sm sm:text-base"
                            placeholder={t('categories.form.namePlaceholder')}
                          />
                          <Input
                            value={editForm.description}
                            onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                            placeholder={t('categories.form.descriptionPlaceholder')}
                            className="text-sm sm:text-base"
                          />
                          <div className="flex flex-col sm:flex-row gap-3">
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                {t('categories.form.color')}
                              </label>
                              <input
                                type="color"
                                value={editForm.color}
                                onChange={(e) => setEditForm(prev => ({ ...prev, color: e.target.value }))}
                                className="w-full h-8 border border-gray-300 rounded-md"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                {t('categories.form.icon')}
                              </label>
                              <Input
                                value={editForm.icon}
                                onChange={(e) => setEditForm(prev => ({ ...prev, icon: e.target.value }))}
                                placeholder={t('categories.form.iconPlaceholder')}
                                className="text-sm sm:text-base"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm sm:text-base font-semibold text-gray-900">{category.name}</h3>
                            {!category.isActive && (
                              <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 sm:py-1 rounded-full">
                                {t('categories.status.inactive')}
                              </span>
                            )}
                          </div>
                          {category.description && (
                            <p className="text-xs sm:text-sm text-gray-600 mt-1 break-words">{category.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-2 text-xs sm:text-sm">
                            <span className="text-gray-500">
                              {t('categories.stats.totalTickets')}: <span className="font-medium text-blue-600">{stats.totalTickets}</span>
                            </span>
                            <span className="text-gray-500">
                              {t('categories.stats.openTickets')}: <span className="font-medium text-orange-600">{stats.openTickets}</span>
                            </span>
                            <span className="text-gray-500">
                              {t('categories.stats.resolvedTickets')}: <span className="font-medium text-green-600">{stats.resolvedTickets}</span>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {user?.role === 'admin' && (
                    <div className="flex items-center gap-2 flex-shrink-0 ml-0 sm:ml-4 w-full sm:w-auto justify-end sm:justify-start">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            onClick={handleSave}
                            className="p-1.5 sm:p-2 text-xs sm:text-sm"
                            title={t('categories.form.save')}
                          >
                            <Save className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancel}
                            className="p-1.5 sm:p-2 text-xs sm:text-sm"
                            title={t('categories.form.cancel')}
                          >
                            <X className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(category)}
                            className="p-1.5 sm:p-2"
                            title={t('categories.edit')}
                          >
                            <Edit2 className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleActive(category._id, category.isActive)}
                            className="p-1.5 sm:p-2"
                            title={category.isActive ? t('categories.deactivate') : t('categories.activate')}
                          >
                            {category.isActive ? <EyeOff className="h-3 w-3 sm:h-4 sm:w-4" /> : <Eye className="h-3 w-3 sm:h-4 sm:w-4" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(category._id)}
                            className="p-1.5 sm:p-2 text-red-600 hover:text-red-700"
                            title={t('categories.delete')}
                          >
                            <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Categories;