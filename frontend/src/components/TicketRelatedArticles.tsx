import React, { useEffect, useState } from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import { apiService } from '../services/api';
import Card from './UI/Card';
import LoadingSpinner from './UI/LoadingSpinner';
import { Link } from 'react-router-dom';

interface TicketRelatedArticlesProps {
  ticketId: string;
  categoryId?: string;
  tags?: string[];
}

interface KBArticle {
  _id: string;
  title: string;
  content: string;
  category?: { _id: string; name: string; color: string };
  tags: string[];
  views: number;
  helpfulCount: number;
  status: string;
}

const TicketRelatedArticles: React.FC<TicketRelatedArticlesProps> = ({
  ticketId,
  categoryId,
  tags = []
}) => {
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRelatedArticles();
  }, [ticketId, categoryId, tags]);

  const loadRelatedArticles = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Пошук статей по категорії та тегах
      const searchParams: any = {
        status: 'published',
        page: 1,
        limit: 5,
        sortBy: 'relevance'
      };

      if (categoryId) {
        searchParams.category = categoryId;
      }

      if (tags && tags.length > 0) {
        searchParams.tags = tags.join(',');
      }

      const response = await apiService.searchKBArticles(searchParams);
      if (response.success && response.data) {
        setArticles((response.data as { data?: KBArticle[] }).data || []);
      } else {
        setError('Помилка завантаження пов\'язаних статей');
      }
    } catch (err: any) {
      setError(err.message || 'Помилка завантаження пов\'язаних статей');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <div className="p-6 text-center">
          <LoadingSpinner />
          <p className="mt-2 text-sm text-gray-600">Завантаження пов'язаних статей...</p>
        </div>
      </Card>
    );
  }

  if (error || articles.length === 0) {
    return null;
  }

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Пов'язані статті KB</h3>
        </div>

        <div className="space-y-3">
          {articles.map((article) => (
            <Link
              key={article._id}
              to={`/admin/knowledge-base/${article._id}`}
              className="block p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-gray-900 mb-1">{article.title}</h4>
                  <p className="text-xs text-gray-600 line-clamp-2 mb-2">
                    {article.content.substring(0, 150)}...
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {article.category && (
                      <span
                        className="px-2 py-0.5 rounded text-white text-xs"
                        style={{ backgroundColor: article.category.color }}
                      >
                        {article.category.name}
                      </span>
                    )}
                    <span>{article.views} переглядів</span>
                    <span className="text-green-600">✓ {article.helpfulCount}</span>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-gray-400 ml-2 flex-shrink-0" />
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200">
          <Link
            to="/admin/knowledge-base"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Переглянути всі статті KB →
          </Link>
        </div>
      </div>
    </Card>
  );
};

export default TicketRelatedArticles;

