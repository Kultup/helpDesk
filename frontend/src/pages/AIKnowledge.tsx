import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Brain, Ticket, FileText, BookOpen } from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';

interface ResolvedTicketItem {
  id: string;
  ticketNumber?: string;
  title: string;
  description: string;
  resolutionSummary: string | null;
  subcategory?: string;
  status: string;
  resolvedAt?: string;
  closedAt?: string;
  createdAt: string;
  source?: string;
  hasAiDialog: boolean;
  dialogLength: number;
  createdBy?: { name: string; email?: string };
}

interface KnowledgeData {
  usedForContext: string;
  resolvedTickets: ResolvedTicketItem[];
  count: number;
}

const AIKnowledge: React.FC = () => {
  const [data, setData] = useState<KnowledgeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiService.get<{ success: boolean; data: KnowledgeData }>('/ai/knowledge', {
          params: { limit: 30 }
        });
        const r = res as unknown as { data: KnowledgeData };
        setData(r.data || null);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const formatDate = (s: string) => (s ? new Date(s).toLocaleString('uk-UA', { dateStyle: 'short' }) : '—');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Brain className="h-8 w-8 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Що навчився AI</h1>
      </div>
      <p className="text-muted-foreground">
        Тут показано закриті тікети з описом рішень та діалоги з ботом, які використовуються як контекст для відповідей AI.
      </p>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Не вдалося завантажити дані
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Текст, який передається AI як контекст (приклади з тікетів)</h2>
            </CardHeader>
            <CardContent>
              <pre className="text-sm bg-muted p-4 rounded-lg whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto font-sans">
                {data.usedForContext || '(немає закритих тікетів з описом рішення)'}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Закриті тікети з рішеннями або діалогом ({data.count})</h2>
            </CardHeader>
            <CardContent>
              {data.resolvedTickets.length === 0 ? (
                <p className="text-muted-foreground text-sm">Поки немає тікетів з заповненим рішенням або діалогом з ботом.</p>
              ) : (
                <div className="space-y-4">
                  {data.resolvedTickets.map((t) => (
                    <div
                      key={t.id}
                      className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link to={`/admin/tickets/${t.id}`} className="font-medium text-primary hover:underline">
                              {t.ticketNumber || t.id} · {t.title}
                            </Link>
                            {t.hasAiDialog && (
                              <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
                                Діалог: {t.dialogLength} повідомлень
                              </span>
                            )}
                          </div>
                          {t.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                          )}
                          {t.resolutionSummary && (
                            <div className="mt-2 flex items-start gap-2">
                              <FileText className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                              <p className="text-sm text-foreground">{t.resolutionSummary}</p>
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0">
                          {formatDate(t.resolvedAt || t.closedAt || t.createdAt)} · {t.subcategory || '—'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default AIKnowledge;
