import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
// @ts-ignore - rehype-raw не має типів
import rehypeRaw from 'rehype-raw';
import { ArrowLeft, ThumbsUp, ThumbsDown, Edit2, Eye, Calendar, Tag, User, Share2, Copy, Check } from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { formatDate } from '../utils';
import { useClipboard } from '../hooks';
import toast from 'react-hot-toast';

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
  versionHistory?: Array<{
    version: number;
    title: string;
    content: string;
    updatedBy: any;
    updatedAt: string;
    reason?: string;
  }>;
}

const KnowledgeArticleView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [article, setArticle] = useState<KBArticle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMarkingHelpful, setIsMarkingHelpful] = useState(false);
  const [isMarkingNotHelpful, setIsMarkingNotHelpful] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const { copied, copy } = useClipboard();

  useEffect(() => {
    if (id) {
      loadArticle(id);
    }
  }, [id]);

  const loadArticle = async (articleId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiService.getKBArticle(articleId);
      if (response.success && response.data) {
        setArticle(response.data as unknown as KBArticle);
      } else {
        setError(response.message || 'Помилка завантаження статті');
      }
    } catch (err: any) {
      setError(err.message || 'Помилка завантаження статті');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkHelpful = async () => {
    if (!id) return;
    try {
      setIsMarkingHelpful(true);
      const response = await apiService.markKBArticleHelpful(id);
      if (response.success && article) {
        setArticle({
          ...article,
          helpfulCount: article.helpfulCount + 1
        });
      }
    } catch (error) {
      console.error('Error marking article as helpful:', error);
    } finally {
      setIsMarkingHelpful(false);
    }
  };

  const handleMarkNotHelpful = async () => {
    if (!id) return;
    try {
      setIsMarkingNotHelpful(true);
      const response = await apiService.markKBArticleNotHelpful(id);
      if (response.success && article) {
        setArticle({
          ...article,
          notHelpfulCount: article.notHelpfulCount + 1
        });
      }
    } catch (error) {
      console.error('Error marking article as not helpful:', error);
    } finally {
      setIsMarkingNotHelpful(false);
    }
  };

  const handleShare = async () => {
    if (!id) return;
    
    try {
      setIsGeneratingToken(true);
      const response = await apiService.generateKBShareToken(id);
      if (response.success && response.data) {
        setShareUrl(response.data.shareUrl);
        setShowShareModal(true);
      } else {
        toast.error(response.message || 'Не вдалося створити посилання для поділу');
      }
    } catch (error: any) {
      toast.error(error.message || 'Не вдалося створити посилання для поділу');
    } finally {
      setIsGeneratingToken(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) {
      await handleShare();
      return;
    }
    const success = await copy(shareUrl);
    if (success) {
      toast.success('Публічне посилання скопійовано в буфер обміну');
    } else {
      toast.error('Не вдалося скопіювати посилання');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-red-600 mb-4">{error || 'Статтю не знайдено'}</p>
            <Button variant="outline" onClick={() => navigate('/admin/knowledge-base')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Назад до статей
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const helpfulRate = article.helpfulCount + article.notHelpfulCount > 0
    ? Math.round((article.helpfulCount / (article.helpfulCount + article.notHelpfulCount)) * 100)
    : 0;

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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Основна стаття */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="mb-6">
                <div className="flex items-start justify-between mb-4">
                  <h1 className="text-3xl font-bold text-gray-900 flex-1">{article.title}</h1>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleShare}
                    className="ml-4"
                    disabled={isGeneratingToken}
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    {isGeneratingToken ? 'Генерація...' : 'Поділитися'}
                  </Button>
                </div>
                
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-4">
                  {article.category && (
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2 py-1 rounded text-white text-xs font-medium"
                        style={{ backgroundColor: article.category.color }}
                      >
                        {article.category.name}
                      </span>
                    </div>
                  )}
                  {article.subcategory && (
                    <span className="text-gray-500">{article.subcategory}</span>
                  )}
                  <div className="flex items-center gap-1">
                    <Eye className="w-4 h-4" />
                    <span>{article.views} переглядів</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>Оновлено {formatDate(article.updatedAt)}</span>
                  </div>
                </div>

                {article.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {article.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs"
                      >
                        <Tag className="w-3 h-3" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Контент статті */}
              <div className="prose max-w-none mb-6">
                <div className="text-gray-700 leading-relaxed">
                  <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                    {article.content}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Рейтинг корисності */}
              <div className="border-t pt-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Ця стаття була корисною?</h3>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleMarkHelpful}
                      disabled={isMarkingHelpful || isMarkingNotHelpful}
                      className="text-green-600 hover:bg-green-50"
                    >
                      <ThumbsUp className="w-4 h-4 mr-2" />
                      Так ({article.helpfulCount})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleMarkNotHelpful}
                      disabled={isMarkingHelpful || isMarkingNotHelpful}
                      className="text-red-600 hover:bg-red-50"
                    >
                      <ThumbsDown className="w-4 h-4 mr-2" />
                      Ні ({article.notHelpfulCount})
                    </Button>
                  </div>
                </div>
                {helpfulRate > 0 && (
                  <div className="text-sm text-gray-600">
                    Рейтинг корисності: {helpfulRate}% ({article.helpfulCount} з {article.helpfulCount + article.notHelpfulCount})
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Історія версій */}
          {isAdmin && article.versionHistory && article.versionHistory.length > 0 && (
            <Card>
              <CardHeader title="Історія версій" />
              <CardContent>
                <div className="space-y-3">
                  {article.versionHistory.map((version, index) => (
                    <div
                      key={index}
                      className="p-3 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-900">
                          Версія {version.version}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDate(version.updatedAt)}
                        </span>
                      </div>
                      {version.reason && (
                        <p className="text-xs text-gray-600 mb-1">{version.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Бічна панель */}
        <div className="space-y-6">
          {/* Інформація про статтю */}
          <Card>
            <CardHeader title="Інформація" />
            <CardContent>
              <div className="space-y-4">
                <div>
                  <span className="text-sm font-medium text-gray-700 block mb-1">Автор</span>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-900">
                      {article.author.email}
                    </span>
                  </div>
                  {article.author.position && (
                    <p className="text-xs text-gray-500 mt-1">{article.author.position}</p>
                  )}
                </div>

                {article.lastUpdatedBy && (
                  <div>
                    <span className="text-sm font-medium text-gray-700 block mb-1">Останнє оновлення</span>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-900">
                        {article.lastUpdatedBy.email}
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <span className="text-sm font-medium text-gray-700 block mb-1">Статус</span>
                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                    article.status === 'published' ? 'bg-green-100 text-green-800' :
                    article.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {article.status === 'published' ? 'Опубліковано' :
                     article.status === 'draft' ? 'Чернетка' :
                     'Архів'}
                  </span>
                </div>

                <div>
                  <span className="text-sm font-medium text-gray-700 block mb-1">Дата створення</span>
                  <span className="text-sm text-gray-900">{formatDate(article.createdAt)}</span>
                </div>

                <div className="pt-4 border-t space-y-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleShare}
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Поділитися статтею
                  </Button>
                  {isAdmin && (
                    <Link to={`/admin/knowledge-base/${id}/edit`}>
                      <Button variant="outline" className="w-full">
                        <Edit2 className="w-4 h-4 mr-2" />
                        Редагувати
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Пов'язані статті */}
          {article.relatedArticles && article.relatedArticles.length > 0 && (
            <Card>
              <CardHeader title="Пов'язані статті" />
              <CardContent>
                <div className="space-y-2">
                  {article.relatedArticles.map((related) => (
                    <Link
                      key={related._id}
                      to={`/admin/knowledge-base/${related._id}`}
                      className="block p-3 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900">{related.title}</p>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Модальне вікно поділу */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowShareModal(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Поділитися статтею</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Публічне посилання на статтю
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={shareUrl}
                    readOnly
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                  />
                  <Button
                    variant="outline"
                    onClick={handleCopyLink}
                    disabled={copied || !shareUrl}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Скопійовано
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Копіювати
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-gray-600 mb-3">
                  Це публічне посилання. Будь-хто з цим посиланням зможе переглянути статтю без входу в систему.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowShareModal(false)}
                  >
                    Закрити
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeArticleView;

