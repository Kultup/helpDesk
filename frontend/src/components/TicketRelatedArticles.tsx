import React, { useEffect, useState, useCallback } from 'react';
import { Sparkles, ExternalLink } from 'lucide-react';
import { apiService } from '../services/api';
import Card from './UI/Card';
import LoadingSpinner from './UI/LoadingSpinner';
import { Link } from 'react-router-dom';

interface TicketRelatedArticlesProps {
  ticketId: string;
  categoryId?: string;
  tags?: string[];
}

interface AIArticle {
  _id: string;
  title: string;
  content: string;
  tags: string[];
}

const TicketRelatedArticles: React.FC<TicketRelatedArticlesProps> = ({
  ticketId,
  categoryId,
  tags = []
}) => {
  const [articles, setArticles] = useState<AIArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRelatedArticles = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const q = tags && tags.length > 0 ? tags.join(' ') : '';
      const response = await apiService.getAIKnowledge({ q, tags: tags.join(','), page: 1, limit: 5 });
      if ((response as any).success && (response as any).data) {
        setArticles(((response as any).data as AIArticle[]) || []);
      } else {
        setError('Помилка завантаження пов’язаних знань');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Помилка завантаження пов’язаних знань';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [categoryId, tags]);

  useEffect(() => {
    loadRelatedArticles();
  }, [loadRelatedArticles]);

  if (isLoading) {
    return (
      <Card>
        <div className="p-6 text-center">
          <LoadingSpinner />
          <p className="mt-2 text-sm text-gray-600">Завантаження пов’язаних знань...</p>
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
          <Sparkles className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Пов’язані знання AI</h3>
        </div>

        <div className="space-y-3">
          {articles.map((article) => (
            <Link
              key={article._id}
              to={`/admin/ai-knowledge/${article._id}`}
              className="block p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-gray-900 mb-1">{article.title}</h4>
                  <p className="text-xs text-gray-600 line-clamp-2 mb-2">
                    {article.content.substring(0, 150)}...
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {article.tags && article.tags.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                        {article.tags.slice(0, 2).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-gray-400 ml-2 flex-shrink-0" />
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200">
          <Link
            to="/admin/ai-knowledge"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Переглянути всі знання AI →
          </Link>
        </div>
      </div>
    </Card>
  );
};

export default TicketRelatedArticles;

