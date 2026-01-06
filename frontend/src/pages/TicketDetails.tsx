import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, Ticket, TicketStatus, TicketPriority } from '../types';
import { apiService } from '../services/api';
import Card from '../components/UI/Card';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import TicketRating from '../components/UI/TicketRating';
import TicketHistory, { TicketHistoryRef } from '../components/TicketHistory';
import TicketComments from '../components/TicketComments';
import TicketRelatedArticles from '../components/TicketRelatedArticles';
import { Sparkles, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Lightbulb, Clock, Target } from 'lucide-react';

import { formatDate } from '../utils';

const TicketDetails: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState(false);
  const [editingPriority, setEditingPriority] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;
  const basePath = isAdmin ? '/admin' : '';
  const ticketHistoryRef = useRef<TicketHistoryRef>(null);

  const loadTicket = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiService.getTicketById(id!);
      if (response.success && response.data) {
        setTicket(response.data);
      } else {
        setError(response.message || t('tickets.errors.loadError'));
      }
    } catch (err: any) {
      setError(err.message || t('tickets.errors.loadError'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id && id !== 'new') {
      loadTicket();
    } else if (id === 'new') {
      // Якщо id = 'new', це не валідний ID тикету, перенаправляємо на створення
      navigate('/tickets/create');
    }
  }, [id, navigate]);

  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (!ticket || isUpdating) return;
    
    // Перевірка: тільки адміністратор може змінювати статус
    if (!isAdmin) {
      setError('Тільки адміністратор може змінювати статус тікету');
      setEditingStatus(false);
      return;
    }
    
    try {
      setIsUpdating(true);
      const response = await apiService.updateTicket(ticket._id, { status: newStatus });
      if (response.success && response.data) {
        setTicket(response.data);
        setEditingStatus(false);
        
        // Оновлюємо історію після зміни статусу
        if (ticketHistoryRef.current) {
          await ticketHistoryRef.current.refreshHistory();
        }
      } else {
        setError(response.message || t('tickets.errors.updateStatusError'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || t('tickets.errors.updateStatusError'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePriorityChange = async (newPriority: TicketPriority) => {
    if (!ticket || isUpdating) return;
    
    // Перевірка: тільки адміністратор може змінювати пріоритет
    if (!isAdmin) {
      setError('Тільки адміністратор може змінювати пріоритет тікету');
      setEditingPriority(false);
      return;
    }
    
    try {
      setIsUpdating(true);
      const response = await apiService.updateTicket(ticket._id, { priority: newPriority });
      if (response.success && response.data) {
        setTicket(response.data);
        setEditingPriority(false);
        // Оновлюємо історію після зміни пріоритету
        if (ticketHistoryRef.current) {
          await ticketHistoryRef.current.refreshHistory();
        }
      } else {
        setError(response.message || t('tickets.errors.updatePriorityError'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || t('tickets.errors.updatePriorityError'));
    } finally {
      setIsUpdating(false);
    }
  };

  const canEdit = isAdmin; // Тільки адміністратор може редагувати заявки
  const canChangeStatus = isAdmin; // Тільки адміністратор може змінювати статус
  const canChangePriority = isAdmin; // Тільки адміністратор може змінювати пріоритет

  const handleAnalyzeTicket = async () => {
    if (!ticket || isAnalyzing) return;

    try {
      setIsAnalyzing(true);
      setError(null);
      const response = await apiService.analyzeTicket(ticket._id);
      
      if (response.success && response.data) {
        setAiAnalysis(response.data);
        setShowAnalysis(true);
      } else {
        setError(response.message || 'Не вдалося проаналізувати тікет');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Помилка аналізу тікета');
    } finally {
      setIsAnalyzing(false);
    }
  };


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'text-red-600 bg-red-100';
      case 'in_progress': return 'text-yellow-600 bg-yellow-100';
      case 'resolved': return 'text-green-600 bg-green-100';
      case 'closed': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return t('common.statuses.open');
      case 'in_progress': return t('common.statuses.inProgress');
      case 'resolved': return t('common.statuses.resolved');
      case 'closed': return t('common.statuses.closed');
      default: return status;
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high': return t('common.priorities.high');
      case 'medium': return t('common.priorities.medium');
      case 'low': return t('common.priorities.low');
      default: return priority;
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-red-600 text-center">
          <p className="mb-4">{error}</p>
          <Button onClick={() => navigate(`${basePath}/tickets`)}>
            {t('tickets.backToTickets')}
          </Button>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-gray-600 text-center">
          <p className="mb-4">{t('tickets.notFound')}</p>
          <Button onClick={() => navigate(`${basePath}/tickets`)}>
            {t('tickets.backToTickets')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 text-gray-900">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <Link 
            to={`${basePath}/tickets`}
            className="text-blue-600 hover:text-blue-800 inline-block"
          >
            ← {t('tickets.backToTickets')}
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">{ticket.title}</h1>
      </div>

      {isAdmin ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">{t('common.description')}</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAnalyzeTicket}
                    isLoading={isAnalyzing}
                    disabled={isAnalyzing}
                    className="flex items-center space-x-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>{isAnalyzing ? 'Аналізуємо...' : 'Аналізувати через AI'}</span>
                  </Button>
                </div>
                <p className="text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
              </div>
            </Card>

            {/* AI Аналіз тікета */}
            {aiAnalysis && (
              <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
                <div className="p-6">
                  <div 
                    className="flex items-center justify-between cursor-pointer mb-4"
                    onClick={() => setShowAnalysis(!showAnalysis)}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="bg-purple-100 p-2 rounded-full">
                        <Sparkles className="h-5 w-5 text-purple-600" />
                      </div>
                      <h2 className="text-xl font-semibold text-gray-900">AI Аналіз заявки</h2>
                    </div>
                    {showAnalysis ? (
                      <ChevronUp className="h-5 w-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-500" />
                    )}
                  </div>

                  {showAnalysis && (
                    <div className="space-y-6 mt-4">
                      {/* Короткий опис */}
                      {aiAnalysis.summary && (
                        <div className="bg-white rounded-lg p-4 border border-purple-200">
                          <h3 className="font-semibold text-gray-900 mb-2 flex items-center">
                            <Target className="h-4 w-4 mr-2 text-purple-600" />
                            Короткий опис
                          </h3>
                          <p className="text-gray-700">{aiAnalysis.summary}</p>
                        </div>
                      )}

                      {/* Ймовірна причина */}
                      {aiAnalysis.rootCause && (
                        <div className="bg-white rounded-lg p-4 border border-purple-200">
                          <h3 className="font-semibold text-gray-900 mb-2 flex items-center">
                            <AlertCircle className="h-4 w-4 mr-2 text-orange-600" />
                            Ймовірна причина
                          </h3>
                          <p className="text-gray-700">{aiAnalysis.rootCause}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Кроки діагностики */}
                        {aiAnalysis.diagnosticSteps && aiAnalysis.diagnosticSteps.length > 0 && (
                          <div className="bg-white rounded-lg p-4 border border-blue-200">
                            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                              <Lightbulb className="h-4 w-4 mr-2 text-blue-600" />
                              Кроки діагностики
                            </h3>
                            <ol className="list-decimal list-inside space-y-2 text-gray-700">
                              {aiAnalysis.diagnosticSteps.map((step: string, index: number) => (
                                <li key={index}>{step}</li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {/* Кроки вирішення */}
                        {aiAnalysis.solutionSteps && aiAnalysis.solutionSteps.length > 0 && (
                          <div className="bg-white rounded-lg p-4 border border-green-200">
                            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                              <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                              Кроки вирішення
                            </h3>
                            <ol className="list-decimal list-inside space-y-2 text-gray-700">
                              {aiAnalysis.solutionSteps.map((step: string, index: number) => (
                                <li key={index}>{step}</li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>

                      {/* Потрібна інформація */}
                      {aiAnalysis.requiredInfo && aiAnalysis.requiredInfo.length > 0 && (
                        <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                          <h3 className="font-semibold text-gray-900 mb-2 flex items-center">
                            <AlertCircle className="h-4 w-4 mr-2 text-yellow-600" />
                            Потрібна додаткова інформація
                          </h3>
                          <ul className="list-disc list-inside space-y-1 text-gray-700">
                            {aiAnalysis.requiredInfo.map((info: string, index: number) => (
                              <li key={index}>{info}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Оцінка пріоритету */}
                      {aiAnalysis.priorityAssessment && (
                        <div className="bg-white rounded-lg p-4 border border-purple-200">
                          <h3 className="font-semibold text-gray-900 mb-2">Оцінка пріоритету</h3>
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-600">Поточний:</span>
                              <span className={`font-medium px-2 py-1 rounded ${
                                aiAnalysis.priorityAssessment.current === 'high' || aiAnalysis.priorityAssessment.current === 'urgent' 
                                  ? 'bg-red-100 text-red-700' 
                                  : aiAnalysis.priorityAssessment.current === 'medium'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-green-100 text-green-700'
                              }`}>
                                {aiAnalysis.priorityAssessment.current}
                              </span>
                            </div>
                            {aiAnalysis.priorityAssessment.recommended && (
                              <div className="flex items-center justify-between">
                                <span className="text-gray-600">Рекомендований:</span>
                                <span className={`font-medium px-2 py-1 rounded ${
                                  aiAnalysis.priorityAssessment.recommended === 'high' || aiAnalysis.priorityAssessment.recommended === 'urgent' 
                                    ? 'bg-red-100 text-red-700' 
                                    : aiAnalysis.priorityAssessment.recommended === 'medium'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-green-100 text-green-700'
                                }`}>
                                  {aiAnalysis.priorityAssessment.recommended}
                                </span>
                              </div>
                            )}
                            {aiAnalysis.priorityAssessment.reason && (
                              <p className="text-gray-600 text-xs mt-2 italic">{aiAnalysis.priorityAssessment.reason}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Рекомендація категорії */}
                      {aiAnalysis.categoryRecommendation && (
                        <div className="bg-white rounded-lg p-4 border border-purple-200">
                          <h3 className="font-semibold text-gray-900 mb-2">Рекомендація категорії</h3>
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-600">Категорія:</span>
                              <span className="font-medium text-gray-900">{aiAnalysis.categoryRecommendation.category}</span>
                            </div>
                            {aiAnalysis.categoryRecommendation.subcategory && (
                              <div className="flex items-center justify-between">
                                <span className="text-gray-600">Підкатегорія:</span>
                                <span className="font-medium text-gray-900">{aiAnalysis.categoryRecommendation.subcategory}</span>
                              </div>
                            )}
                            {aiAnalysis.categoryRecommendation.reason && (
                              <p className="text-gray-600 text-xs mt-2 italic">{aiAnalysis.categoryRecommendation.reason}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Оцінка складності та часу */}
                      {(aiAnalysis.estimatedComplexity || aiAnalysis.estimatedTime) && (
                        <div className="bg-white rounded-lg p-4 border border-purple-200">
                          <h3 className="font-semibold text-gray-900 mb-2 flex items-center">
                            <Clock className="h-4 w-4 mr-2 text-purple-600" />
                            Оцінка
                          </h3>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            {aiAnalysis.estimatedComplexity && (
                              <div>
                                <span className="text-gray-600">Складність:</span>
                                <span className={`ml-2 font-medium px-2 py-1 rounded ${
                                  aiAnalysis.estimatedComplexity === 'high' 
                                    ? 'bg-red-100 text-red-700' 
                                    : aiAnalysis.estimatedComplexity === 'medium'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-green-100 text-green-700'
                                }`}>
                                  {aiAnalysis.estimatedComplexity}
                                </span>
                              </div>
                            )}
                            {aiAnalysis.estimatedTime && (
                              <div>
                                <span className="text-gray-600">Час вирішення:</span>
                                <span className="ml-2 font-medium text-gray-900">{aiAnalysis.estimatedTime}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Запобіжні заходи */}
                      {aiAnalysis.preventiveMeasures && aiAnalysis.preventiveMeasures.length > 0 && (
                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                          <h3 className="font-semibold text-gray-900 mb-2">Запобіжні заходи</h3>
                          <ul className="list-disc list-inside space-y-1 text-gray-700">
                            {aiAnalysis.preventiveMeasures.map((measure: string, index: number) => (
                              <li key={index}>{measure}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Прикріплені файли */}
            {ticket.attachments && ticket.attachments.length > 0 && (
              <Card>
                <div className="p-6">
                  <h2 className="text-xl font-semibold mb-4 text-gray-900">{t('tickets.attachments')} ({ticket.attachments.length})</h2>
                  <div className="space-y-3">
                    {ticket.attachments.map((attachment) => (
                      <div key={attachment._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 shadow-sm text-gray-900">
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            {attachment.mimetype.startsWith('image/') ? (
                              <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            ) : attachment.mimetype === 'application/pdf' ? (
                              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                            ) : (
                              <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 break-words" title={attachment.originalName}>
                              {attachment.originalName || attachment.filename}
                            </p>
                            <p className="text-xs text-gray-500">
                              {(() => {
                                const sizeInMB = attachment.size / 1024 / 1024;
                                const sizeInKB = attachment.size / 1024;
                                let sizeText = '';
                                if (sizeInMB >= 1) {
                                  sizeText = `${sizeInMB.toFixed(2)} МБ`;
                                } else if (sizeInKB >= 1) {
                                  sizeText = `${sizeInKB.toFixed(2)} КБ`;
                                } else {
                                  sizeText = `${attachment.size} байт`;
                                }
                                return sizeText;
                              })()} • Завантажено {new Date(attachment.uploadedAt || attachment.createdAt || Date.now()).toLocaleDateString('uk-UA', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric'
                              })}
                              {attachment.uploadedBy && attachment.uploadedBy.firstName && (
                                <> • {attachment.uploadedBy.firstName} {attachment.uploadedBy.lastName || ''}</>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {attachment.mimetype.startsWith('image/') && (
                            <button
                              onClick={() => navigate(`/photo/${attachment.filename}`)}
                              className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              {t('common.view')}
                            </button>
                          )}
                          <a
                            href={`/api/files/${attachment.filename}`}
                            download={attachment.originalName}
                            className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-green-700 bg-green-100 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            {t('common.download')}
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}
            

            {/* Пов'язані статті KB */}
            {ticket && (
              <TicketRelatedArticles
                ticketId={ticket._id}
                categoryId={typeof ticket.category === 'object' && ticket.category !== null && '_id' in ticket.category 
                  ? ticket.category._id 
                  : String(ticket.category)}
                tags={ticket.tags?.map((tag: any) => typeof tag === 'object' ? tag._id || tag.name : tag) || []}
              />
            )}

            {/* Коментарі */}
            <TicketComments ticketId={ticket._id} />

            {/* Історія змін */}
            <TicketHistory ref={ticketHistoryRef} ticketId={ticket._id} />
          </div>

          <div className="space-y-6">
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">{t('tickets.details')}</h3>
                <div className="space-y-4">
                  {/* Status */}
                  <div>
                    <span className="text-sm font-medium text-gray-500 block mb-1">{t('common.status')}</span>
                    {editingStatus && canChangeStatus ? (
                      <div className="space-y-2">
                        <select
                          value={ticket.status}
                          onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                          className="w-full p-2 border border-gray-300 rounded-md bg-white text-gray-900"
                          disabled={isUpdating}
                        >
                          <option value="open">{t('common.statuses.open')}</option>
                          <option value="in_progress">{t('common.statuses.inProgress')}</option>
                          <option value="resolved">{t('common.statuses.resolved')}</option>
                          <option value="closed">{t('common.statuses.closed')}</option>
                        </select>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            onClick={() => setEditingStatus(false)}
                            disabled={isUpdating}
                          >
                            {t('common.cancel')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                          {getStatusLabel(ticket.status)}
                        </div>
                        {canChangeStatus && (
                          <button
                            onClick={() => setEditingStatus(true)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                            disabled={isUpdating}
                          >
                            {t('common.edit')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Priority */}
                  <div>
                    <span className="text-sm font-medium text-gray-500 block mb-1">{t('common.priority')}</span>
                    {editingPriority && canChangePriority ? (
                      <div className="space-y-2">
                        <select
                          value={ticket.priority}
                          onChange={(e) => handlePriorityChange(e.target.value as TicketPriority)}
                          className="w-full p-2 border border-gray-300 rounded-md bg-white text-gray-900"
                          disabled={isUpdating}
                        >
                          <option value="low">{t('common.priorities.low')}</option>
                          <option value="medium">{t('common.priorities.medium')}</option>
                          <option value="high">{t('common.priorities.high')}</option>
                        </select>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            onClick={() => setEditingPriority(false)}
                            disabled={isUpdating}
                          >
                            {t('common.cancel')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                          {getPriorityLabel(ticket.priority)}
                        </div>
                        {canChangePriority && (
                          <button
                            onClick={() => setEditingPriority(true)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                            disabled={isUpdating}
                          >
                            {t('common.edit')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="text-sm font-medium text-gray-500 block mb-1">{t('common.city')}</span>
                    <p className="text-gray-900">{ticket.city?.name || t('tickets.notSpecified')}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500 block mb-1">{t('tickets.createdBy')}</span>
                    <p className="text-gray-900">
                      {ticket.createdBy
                        ? `${ticket.createdBy.firstName} ${ticket.createdBy.lastName}${ticket.createdBy.position && typeof ticket.createdBy.position === 'object' && 'title' in ticket.createdBy.position ? ` (${ticket.createdBy.position.title})` : ''}${ticket.createdBy.city && typeof ticket.createdBy.city === 'object' && 'name' in ticket.createdBy.city ? `, ${ticket.createdBy.city.name}` : ''}`
                        : t('tickets.unknown')
                      }
                    </p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500 block mb-1">{t('tickets.createdAt')}</span>
                    <p className="text-gray-900">{formatDate(ticket.createdAt)}</p>
                  </div>
                  {ticket.resolvedAt && (
                    <div>
                      <span className="text-sm font-medium text-gray-500 block mb-1">{t('tickets.resolvedAt')}</span>
                      <p className="text-gray-900">{formatDate(ticket.resolvedAt)}</p>
                    </div>
                  )}

                  {/* Оцінка якості */}
                  {ticket.qualityRating?.hasRating && ticket.qualityRating?.rating && (
                    <div>
                      <span className="text-sm font-medium text-gray-500 block mb-2">{t('tickets.qualityRating')}</span>
                      <TicketRating 
                        rating={ticket.qualityRating.rating}
                        feedback={ticket.qualityRating.feedback}
                        ratedAt={ticket.qualityRating.ratedAt}
                        showFeedback={true}
                        size="md"
                      />
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {isUpdating && (
              <Card>
                <div className="p-6 text-center">
                  <LoadingSpinner />
                  <p className="mt-2 text-sm text-gray-600">{t('tickets.updating')}</p>
                </div>
              </Card>
            )}
          </div>
        </div>
        ) : (
          /* Мінімальна інформація для звичайних користувачів (як в боті) */
          <div className="space-y-4">
            <Card>
              <div className="p-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">{t('common.status')}</span>
                    <div className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                      {getStatusLabel(ticket.status)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">{t('common.priority')}</span>
                    <div className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                      {getPriorityLabel(ticket.priority)}
                    </div>
                  </div>
                  {ticket.city && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-500">Місто</span>
                      <span className="text-sm text-gray-900">{typeof ticket.city === 'object' ? ticket.city.name : ticket.city}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">Дата створення</span>
                    <span className="text-sm text-gray-900">{new Date(ticket.createdAt).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">ID тікету</span>
                    <span className="text-sm font-mono text-gray-900">{ticket._id}</span>
                  </div>
                </div>
              </div>
            </Card>
            
            {/* Коментарі - доступні для всіх */}
            <TicketComments ticketId={ticket._id} />
          </div>
        )}


    </div>
  );
};

export default TicketDetails;
