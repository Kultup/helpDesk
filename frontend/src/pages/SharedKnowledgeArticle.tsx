import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Calendar, Tag, User, BookOpen, Eye } from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';
import { formatDate } from '../utils';

interface KBArticle {
  _id: string;
  title: string;
  content: string;
  category?: { _id: string; name: string; color: string };
  subcategory?: string;
  tags: string[];
  status: string;
  views: number;
  helpfulCount: number;
  notHelpfulCount: number;
  author: { email: string; position?: string };
  lastUpdatedBy?: { email: string; position?: string };
  createdAt: string;
  updatedAt: string;
  relatedArticles?: Array<{
    _id: string;
    title: string;
    status: string;
  }>;
}

const SharedKnowledgeArticle: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [article, setArticle] = useState<KBArticle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      loadArticle(token);
    }
  }, [token]);

  const loadArticle = async (shareToken: string): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiService.getSharedKBArticle(shareToken);
      if (response.success && response.data) {
        setArticle(response.data as unknown as KBArticle);
      } else {
        setError(response.message || 'Помилка завантаження статті');
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError(error.message || 'Помилка завантаження статті');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="max-w-2xl w-full">
          <CardContent className="p-6 text-center">
            <p className="text-red-600 mb-4 text-lg">{error || 'Статтю не знайдено'}</p>
            <p className="text-gray-600">Стаття може бути видалена або недоступна для перегляду.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <Card className="shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-6 h-6" />
              <h1 className="text-3xl font-bold">{article.title}</h1>
            </div>
            
            {article.category && (
              <div className="mt-3">
                <span
                  className="inline-block px-3 py-1 text-sm font-medium rounded-full text-white"
                  style={{ backgroundColor: article.category.color || '#6B7280' }}
                >
                  {article.category.name}
                </span>
              </div>
            )}
          </CardHeader>

          <CardContent className="p-6">
            {/* Метадані */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-6 pb-6 border-b">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                <span>{article.author?.email || 'Невідомий автор'}</span>
                {article.author?.position && (
                  <span className="text-gray-400">• {article.author.position}</span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>Оновлено: {formatDate(article.updatedAt)}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                <span>{article.views} переглядів</span>
              </div>
            </div>

            {/* Теги */}
            {article.tags && article.tags.length > 0 && (
              <div className="mb-6">
                <div className="flex flex-wrap gap-2">
                  {article.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded"
                    >
                      <Tag className="w-3 h-3" />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Контент */}
            <div 
              className="prose prose-lg max-w-none mb-6"
              dangerouslySetInnerHTML={{ __html: article.content }}
            />

            {/* Статистика */}
            <div className="mt-8 pt-6 border-t flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>
                  <strong className="text-green-600">{article.helpfulCount}</strong> корисно
                </span>
                {article.notHelpfulCount > 0 && (
                  <span>
                    <strong className="text-red-600">{article.notHelpfulCount}</strong> не корисно
                  </span>
                )}
              </div>
            </div>

            {/* Пов'язані статті */}
            {article.relatedArticles && article.relatedArticles.length > 0 && (
              <div className="mt-8 pt-6 border-t">
                <h3 className="text-lg font-semibold mb-4">Пов&apos;язані статті</h3>
                <div className="space-y-2">
                  {article.relatedArticles.map((related) => (
                    <div
                      key={related._id}
                      className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <p className="font-medium text-gray-900">{related.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SharedKnowledgeArticle;

