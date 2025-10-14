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
    <div className="space-y-6">
      {/* Повідомлення */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
          {success}
        </div>
      )}

      {/* Заголовок */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('categories.title')}</h1>
          <p className="text-gray-600 mt-1">
            {t('categories.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setShowInactive(!showInactive)}
            className="flex items-center gap-2"
          >
            {showInactive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showInactive ? t('categories.hideInactive') : t('categories.showInactive')}
          </Button>
          {user?.role === 'admin' && (
            <Button onClick={handleCreate} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {t('categories.create')}
            </Button>
          )}
        </div>
      </div>

      {/* Статистика */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-3 gap-6 text-center">
          <div>
            <p className="text-2xl font-bold text-blue-600">{categories.length}</p>
            <p className="text-sm text-gray-600">{t('categories.stats.total')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">
              {categoryStats.reduce((sum, stat) => sum + stat.totalTickets, 0)}
            </p>
            <p className="text-sm text-gray-600">{t('categories.stats.totalTickets')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-orange-600">
              {categoryStats.reduce((sum, stat) => sum + stat.openTickets, 0)}
            </p>
            <p className="text-sm text-gray-600">{t('categories.stats.openTickets')}</p>
          </div>
        </div>
      </div>

      {/* Форма створення категорії */}
      {isCreating && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">{t('categories.form.createTitle')}</h3>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('categories.form.name')}
              </label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('categories.form.namePlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('categories.form.description')}
              </label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('categories.form.descriptionPlaceholder')}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('categories.form.color')}
                </label>
                <input
                  type="color"
                  value={editForm.color}
                  onChange={(e) => setEditForm(prev => ({ ...prev, color: e.target.value }))}
                  className="w-full h-10 border border-gray-300 rounded-md"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('categories.form.icon')}
                </label>
                <Input
                  value={editForm.icon}
                  onChange={(e) => setEditForm(prev => ({ ...prev, icon: e.target.value }))}
                  placeholder={t('categories.form.iconPlaceholder')}
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={handleCancel}>
                {t('categories.form.cancel')}
              </Button>
              <Button onClick={handleSave}>
                {t('categories.form.save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Список категорій */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredCategories.map((category) => {
          const stats = getCategoryStats(category._id);
          const isEditing = editingCategory === category._id;

          return (
            <Card key={category._id} className={`hover:shadow-lg transition-shadow ${!category.isActive ? 'opacity-60' : ''}`}>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg"
                      style={{ backgroundColor: category.color }}
                    >
                      {category.icon}
                    </div>
                    <div>
                      {isEditing ? (
                        <Input
                          value={editForm.name}
                          onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                          className="font-semibold"
                        />
                      ) : (
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{category.name}</h3>
                          {!category.isActive && (
                            <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                              {t('categories.status.inactive')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {user?.role === 'admin' && (
                    <div className="flex items-center space-x-2">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            onClick={handleSave}
                            className="p-2"
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancel}
                            className="p-2"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(category)}
                            className="p-2"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleActive(category._id, category.isActive)}
                            className="p-2"
                          >
                            {category.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(category._id)}
                            className="p-2 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('categories.form.description')}
                      </label>
                      <Input
                        value={editForm.description}
                        onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder={t('categories.form.descriptionPlaceholder')}
                      />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {t('categories.form.color')}
                        </label>
                        <input
                          type="color"
                          value={editForm.color}
                          onChange={(e) => setEditForm(prev => ({ ...prev, color: e.target.value }))}
                          className="w-full h-10 border border-gray-300 rounded-md"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {t('categories.form.icon')}
                        </label>
                        <Input
                          value={editForm.icon}
                          onChange={(e) => setEditForm(prev => ({ ...prev, icon: e.target.value }))}
                          placeholder={t('categories.form.iconPlaceholder')}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {category.description && (
                      <p className="text-gray-600 text-sm">{category.description}</p>
                    )}
                    
                    {/* Компактна статистика */}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t('categories.stats.totalTickets')}: <span className="font-medium text-blue-600">{stats.totalTickets}</span></span>
                <span className="text-gray-500">{t('categories.stats.openTickets')}: <span className="font-medium text-orange-600">{stats.openTickets}</span></span>
                <span className="text-gray-500">{t('categories.stats.resolvedTickets')}: <span className="font-medium text-green-600">{stats.resolvedTickets}</span></span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Categories;