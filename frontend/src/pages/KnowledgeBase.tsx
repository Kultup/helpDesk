import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { Plus, Search, Edit2, Trash2, Eye, BookOpen, Tag, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDate } from '../utils';

interface KBArticle {
  _id: string;
  title: string;
  content: string;
  category?: { _id: string; name: string; color: string };
  tags: string[];
  status: string;
  views: number;
  helpfulCount: number;
  notHelpfulCount: number;
  author: { email: string; position?: string };
  createdAt: string;
  updatedAt: string;
}

const KnowledgeBase: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('published');
  const [sortBy, setSortBy] = useState<'relevance' | 'popularity' | 'date' | 'helpful'>('relevance');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0
  });
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadArticles();
  }, [searchQuery, selectedCategory, selectedStatus, sortBy, pagination.page]);

  const loadArticles = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiService.getKBArticles({
        q: searchQuery,
        category: selectedCategory || undefined,
        status: selectedStatus,
        page: pagination.page,
        limit: pagination.limit,
        sortBy
      });
      if (response.success && response.data) {
        const data = response.data as unknown as { data?: KBArticle[]; pagination?: typeof pagination };
        setArticles(data.data || []);
        setPagination(data.pagination || pagination);
      } else {
        setError(response.message || 'Помилка завантаження статей');
      }
    } catch (err: any) {
      setError(err.message || 'Помилка завантаження статей');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await apiService.getKBCategories();
      if (response.success && response.data) {
        setCategories(response.data);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const handleDelete = async (articleId: string) => {
    if (!window.confirm('Ви впевнені, що хочете видалити цю статтю?')) {
      return;
    }

    try {
      const response = await apiService.deleteKBArticle(articleId);
      if (response.success) {
        await loadArticles();
      } else {
        setError(response.message || 'Помилка видалення статті');
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Помилка видалення статті');
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination({ ...pagination, page: 1 });
    loadArticles();
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6" />
            База знань
          </h1>
          <p className="text-gray-600 mt-2">Статті та довідники для підтримки</p>
        </div>
        {isAdmin && (
          <Link to="/admin/knowledge-base/create">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Створити статтю
            </Button>
          </Link>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Пошук та фільтри */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Пошук статей..."
                    className="pl-10"
                  />
                </div>
              </div>
              <Button type="submit">
                <Search className="w-4 h-4 mr-2" />
                Пошук
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Категорія
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setPagination({ ...pagination, page: 1 });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Всі категорії</option>
                  {categories.map((cat) => (
                    <option key={cat._id} value={cat._id}>
                      {cat.name} ({cat.articleCount || 0})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Статус
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setPagination({ ...pagination, page: 1 });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="published">Опубліковано</option>
                  {isAdmin && (
                    <>
                      <option value="draft">Чернетка</option>
                      <option value="archived">Архів</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Сортування
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as any);
                    setPagination({ ...pagination, page: 1 });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="relevance">Релевантність</option>
                  <option value="popularity">Популярність</option>
                  <option value="date">Дата</option>
                  <option value="helpful">Корисність</option>
                </select>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Список статей */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : articles.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-500 text-lg mb-2">Немає статей</p>
            <p className="text-gray-400 text-sm">Спробуйте змінити фільтри або створити нову статтю</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4 mb-6">
            {articles.map((article) => (
              <Card key={article._id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-xl font-semibold text-gray-900">
                          <Link
                            to={`/admin/knowledge-base/${article._id}`}
                            className="hover:text-blue-600 transition-colors"
                          >
                            {article.title}
                          </Link>
                        </h3>
                        {article.status === 'draft' && (
                          <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                            Чернетка
                          </span>
                        )}
                        {article.status === 'archived' && (
                          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                            Архів
                          </span>
                        )}
                      </div>

                      {article.category && (
                        <div className="mb-2">
                          <span
                            className="inline-block px-2 py-1 text-xs font-medium rounded text-white"
                            style={{ backgroundColor: article.category.color }}
                          >
                            {article.category.name}
                          </span>
                        </div>
                      )}

                      <p className="text-gray-600 mb-3 line-clamp-2">
                        {article.content.substring(0, 200)}...
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <Eye className="w-4 h-4" />
                          <span>{article.views} переглядів</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-green-600">✓ {article.helpfulCount}</span>
                          <span className="text-red-600">✗ {article.notHelpfulCount}</span>
                        </div>
                        {article.tags.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Tag className="w-4 h-4" />
                            <span>{article.tags.slice(0, 3).join(', ')}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(article.updatedAt)}</span>
                        </div>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-2 ml-4">
                        <Link to={`/admin/knowledge-base/${article._id}/edit`}>
                          <Button variant="outline" size="sm">
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(article._id)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Пагінація */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                disabled={pagination.page === 1}
              >
                Попередня
              </Button>
              <span className="text-sm text-gray-600">
                Сторінка {pagination.page} з {pagination.pages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                disabled={pagination.page === pagination.pages}
              >
                Наступна
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default KnowledgeBase;

