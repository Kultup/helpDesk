import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, Eye, EyeOff, Tag, Plus, X } from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Category } from '../types';

interface KBArticleForm {
  title: string;
  content: string;
  category: string;
  subcategory: string;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  isPublic: boolean;
}

const CreateKnowledgeArticle: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isEditMode = !!id;

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [newTag, setNewTag] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);

  const [formData, setFormData] = useState<KBArticleForm>({
    title: '',
    content: '',
    category: '',
    subcategory: '',
    tags: [],
    status: 'draft',
    isPublic: true
  });

  useEffect(() => {
    loadCategories();
    if (isEditMode && id) {
      loadArticle(id);
    }
  }, [id, isEditMode]);

  const loadCategories = async () => {
    try {
      const response = await apiService.getCategories(true);
      setCategories(response.data || []);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadArticle = async (articleId: string) => {
    try {
      setInitialLoading(true);
      const response = await apiService.getKBArticle(articleId);
      if (response.success && response.data) {
        const article = response.data;
        setFormData({
          title: article.title || '',
          content: article.content || '',
          category: article.category?._id || '',
          subcategory: article.subcategory || '',
          tags: article.tags || [],
          status: article.status || 'draft',
          isPublic: article.isPublic !== undefined ? article.isPublic : true
        });
      }
    } catch (error: any) {
      setError(error.message || 'Помилка завантаження статті');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleGenerateFromTicket = async () => {
    if (!ticketId) {
      setError('Введіть ID тикету');
      return;
    }

    try {
      setLoading(true);
      const response = await apiService.generateKBArticleFromTicket(ticketId);
      if (response.success && response.data) {
        const article = response.data;
        setFormData({
          ...formData,
          title: article.title || formData.title,
          content: article.content || formData.content,
          category: article.category || formData.category,
          tags: article.tags || formData.tags
        });
        setSuccess('Статтю згенеровано з тикету');
        setTicketId(null);
      } else {
        setError(response.message || 'Помилка генерації статті');
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Помилка генерації статті');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, newTag.trim()]
      });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter(tag => tag !== tagToRemove)
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      if (isEditMode && id) {
        const response = await apiService.updateKBArticle(id, formData);
        if (response.success) {
          setSuccess('Статтю успішно оновлено');
          setTimeout(() => navigate('/admin/knowledge-base'), 2000);
        } else {
          setError(response.message || 'Помилка оновлення статті');
        }
      } else {
        const response = await apiService.createKBArticle(formData);
        if (response.success) {
          setSuccess('Статтю успішно створено');
          setTimeout(() => navigate('/admin/knowledge-base'), 2000);
        } else {
          setError(response.message || 'Помилка створення статті');
        }
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Помилка збереження статті');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <Button
          variant="outline"
          onClick={() => navigate('/admin/knowledge-base')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад до статей
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditMode ? 'Редагувати статтю' : 'Створити статтю KB'}
        </h1>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader
            title="Основна інформація"
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? (
                  <>
                    <EyeOff className="w-4 h-4 mr-2" />
                    Приховати preview
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 mr-2" />
                    Показати preview
                  </>
                )}
              </Button>
            }
          />
          <CardContent>
            <div className="space-y-4">
              <Input
                label="Заголовок"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Введіть заголовок статті"
                required
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Контент (Markdown)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <textarea
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                      rows={20}
                      placeholder="Введіть контент статті у форматі Markdown..."
                      required
                    />
                  </div>
                  {showPreview && (
                    <div className="p-4 border border-gray-300 rounded-lg bg-gray-50">
                      <div className="prose max-w-none">
                        <pre className="whitespace-pre-wrap text-sm text-gray-700">
                          {formData.content || 'Попередній перегляд...'}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Категорія
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Виберіть категорію</option>
                    {categories.map((cat) => (
                      <option key={cat._id} value={cat._id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Підкатегорія
                  </label>
                  <Input
                    value={formData.subcategory}
                    onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                    placeholder="Введіть підкатегорію (опціонально)"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Теги
                </label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="Додати тег"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddTag}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                      >
                        <Tag className="w-3 h-3" />
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Статус
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="draft">Чернетка</option>
                    <option value="published">Опубліковано</option>
                    <option value="archived">Архів</option>
                  </select>
                </div>

                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isPublic}
                      onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Публічна стаття</span>
                  </label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Генерація з тикету */}
        <Card className="mb-6">
          <CardHeader title="Генерація з тикету (AI)" />
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={ticketId || ''}
                  onChange={(e) => setTicketId(e.target.value)}
                  placeholder="Введіть ID вирішеного тикету"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerateFromTicket}
                  disabled={loading || !ticketId}
                >
                  Згенерувати
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                Введіть ID вирішеного тикету для автоматичної генерації статті KB
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/admin/knowledge-base')}
          >
            Скасувати
          </Button>
          <Button type="submit" disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? 'Збереження...' : isEditMode ? 'Оновити' : 'Створити'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CreateKnowledgeArticle;

