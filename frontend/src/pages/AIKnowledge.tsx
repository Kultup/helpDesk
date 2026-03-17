import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Brain,
  Ticket,
  FileText,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sparkles,
  BookOpen,
  Bot,
  Globe,
  ExternalLink,
  CheckCircle,
  Search,
} from 'lucide-react';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

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

type Tab = 'all' | 'resolution' | 'dialog';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (s?: string) =>
  s
    ? new Date(s).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

// ─── Component ────────────────────────────────────────────────────────────────

const AIKnowledge: React.FC = () => {
  const [data, setData] = useState<KnowledgeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [contextOpen, setContextOpen] = useState(false);
  const [limit, setLimit] = useState(30);
  const [searchQuery, setSearchQuery] = useState('');

  const load = async (lim = limit) => {
    setLoading(true);
    try {
      const res = await apiService.get<{ success: boolean; data: KnowledgeData }>('/ai/knowledge', {
        params: { limit: lim },
      });
      const r = res as unknown as { data: KnowledgeData };
      setData(r.data || null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadMore = () => {
    const newLimit = limit + 30;
    setLimit(newLimit);
    load(newLimit);
  };

  // ── Derived data ─────────────────────────────────────────────────────────────

  const tickets = data?.resolvedTickets ?? [];

  const withResolution = tickets.filter(t => t.resolutionSummary);
  const withDialog = tickets.filter(t => t.hasAiDialog);
  const withBoth = tickets.filter(t => t.resolutionSummary && t.hasAiDialog);

  const filtered = tickets.filter(t => {
    const matchTab =
      tab === 'all' ? true : tab === 'resolution' ? !!t.resolutionSummary : t.hasAiDialog;

    const q = searchQuery.trim().toLowerCase();
    const matchSearch =
      !q ||
      t.title.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.resolutionSummary || '').toLowerCase().includes(q);

    return matchTab && matchSearch;
  });

  // ──────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-100 rounded-xl">
              <Brain className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Чому навчився AI</h1>
              <p className="text-sm text-gray-400">
                База знань із закритих тікетів та діалогів бота
              </p>
            </div>
          </div>
          <button
            onClick={() => load()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-100 bg-white transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Оновити
          </button>
        </div>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-purple-800 mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Як AI навчається на реальних даних
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600">
            <div className="bg-white/70 rounded-xl p-3.5">
              <CheckCircle className="h-4 w-4 text-emerald-500 mb-1.5" />
              <p className="font-medium text-gray-800 mb-1">Закриті тікети з рішенням</p>
              <p className="text-xs text-gray-500">
                Коли адмін заповнює поле «Опис рішення» при закритті тікету — AI запам'ятовує
                проблему та її вирішення.
              </p>
            </div>
            <div className="bg-white/70 rounded-xl p-3.5">
              <MessageSquare className="h-4 w-4 text-blue-500 mb-1.5" />
              <p className="font-medium text-gray-800 mb-1">Діалоги з ботом</p>
              <p className="text-xs text-gray-500">
                Переписка користувача з AI-ботом у Telegram зберігається та використовується як
                приклад вирішення аналогічних задач.
              </p>
            </div>
            <div className="bg-white/70 rounded-xl p-3.5">
              <Bot className="h-4 w-4 text-purple-500 mb-1.5" />
              <p className="font-medium text-gray-800 mb-1">Семантичний пошук</p>
              <p className="text-xs text-gray-500">
                При новому зверненні AI шукає схожі тікети через векторні ембедінги та використовує
                лише релевантний контекст.
              </p>
            </div>
          </div>
        </div>

        {loading && !data ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : !data ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
            <Brain className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>Не вдалося завантажити дані</p>
          </div>
        ) : (
          <>
            {/* ── Stats ──────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: 'Всього тікетів',
                  value: data.count,
                  icon: Ticket,
                  color: 'text-blue-600',
                  bg: 'bg-blue-50',
                },
                {
                  label: 'З описом рішення',
                  value: withResolution.length,
                  icon: FileText,
                  color: 'text-emerald-600',
                  bg: 'bg-emerald-50',
                },
                {
                  label: 'З діалогом бота',
                  value: withDialog.length,
                  icon: MessageSquare,
                  color: 'text-purple-600',
                  bg: 'bg-purple-50',
                },
                {
                  label: 'З обома джерелами',
                  value: withBoth.length,
                  icon: Sparkles,
                  color: 'text-amber-600',
                  bg: 'bg-amber-50',
                },
              ].map(s => (
                <div
                  key={s.label}
                  className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3"
                >
                  <div className={`p-2 rounded-lg ${s.bg} flex-shrink-0`}>
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{s.label}</p>
                    <p className="text-xl font-bold text-gray-800">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Context preview ─────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <button
                onClick={() => setContextOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <BookOpen className="h-4 w-4 text-gray-400" />
                  <span className="font-semibold text-gray-800 text-sm">
                    Контекст, який AI отримує при новому зверненні
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                    5 тікетів
                  </span>
                </div>
                {contextOpen ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>
              {contextOpen && (
                <div className="border-t border-gray-100 p-4">
                  <p className="text-xs text-gray-400 mb-2">
                    Це точний текст, що вставляється в промпт AI при кожному зверненні (семантично
                    підібраний під поточний запит):
                  </p>
                  <pre className="text-xs bg-gray-50 border border-gray-100 p-4 rounded-lg whitespace-pre-wrap break-words max-h-80 overflow-y-auto font-mono text-gray-700 leading-relaxed">
                    {data.usedForContext || '(немає закритих тікетів з описом рішення)'}
                  </pre>
                </div>
              )}
            </div>

            {/* ── Ticket list ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {/* Toolbar */}
              <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
                  <Ticket className="h-4 w-4 text-gray-400" />
                  Тікети в базі знань
                </h2>
                <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Пошук..."
                      className="pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs w-44 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  {/* Tabs */}
                  {(
                    [
                      ['all', 'Всі', data.count],
                      ['resolution', 'З рішенням', withResolution.length],
                      ['dialog', 'З діалогом', withDialog.length],
                    ] as [Tab, string, number][]
                  ).map(([t, label, cnt]) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        tab === t
                          ? 'bg-purple-100 text-purple-700'
                          : 'text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {label} <span className="opacity-60">({cnt})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* List */}
              <div className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <div className="py-14 text-center text-gray-400">
                    <Ticket className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Тікетів не знайдено</p>
                  </div>
                ) : (
                  filtered.map(t => (
                    <div
                      key={t.id as string}
                      className="px-5 py-4 hover:bg-gray-50/60 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {/* Source icon */}
                        <div
                          className={`p-1.5 rounded-lg flex-shrink-0 mt-0.5 ${
                            t.source === 'telegram' ? 'bg-blue-50' : 'bg-gray-100'
                          }`}
                        >
                          {t.source === 'telegram' ? (
                            <Bot className="h-3.5 w-3.5 text-blue-500" />
                          ) : (
                            <Globe className="h-3.5 w-3.5 text-gray-400" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Title row */}
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Link
                              to={`/admin/tickets/${t.id}`}
                              className="text-sm font-medium text-gray-800 hover:text-purple-600 transition-colors flex items-center gap-1"
                            >
                              {t.ticketNumber ? `#${t.ticketNumber}` : ''} {t.title}
                              <ExternalLink className="h-3 w-3 opacity-40" />
                            </Link>
                            {t.subcategory && (
                              <span className="text-[11px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                                {t.subcategory}
                              </span>
                            )}
                            {t.hasAiDialog && (
                              <span className="text-[11px] px-2 py-0.5 bg-purple-50 text-purple-600 border border-purple-100 rounded-full flex items-center gap-1">
                                <MessageSquare className="h-2.5 w-2.5" />
                                {t.dialogLength} повід.
                              </span>
                            )}
                            {t.resolutionSummary && (
                              <span className="text-[11px] px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full flex items-center gap-1">
                                <CheckCircle className="h-2.5 w-2.5" />
                                Рішення
                              </span>
                            )}
                          </div>

                          {/* Description */}
                          {t.description && (
                            <p className="text-xs text-gray-500 line-clamp-1 mb-1.5">
                              {t.description}
                            </p>
                          )}

                          {/* Resolution */}
                          {t.resolutionSummary && (
                            <div className="flex items-start gap-1.5 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                              <FileText className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                              <p className="text-xs text-gray-700 line-clamp-2">
                                {t.resolutionSummary}
                              </p>
                            </div>
                          )}

                          {/* Meta */}
                          <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                            {t.createdBy?.name && <span>{t.createdBy.name}</span>}
                            <span>{fmtDate(t.resolvedAt || t.closedAt || t.createdAt)}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                t.status === 'closed'
                                  ? 'bg-gray-100 text-gray-500'
                                  : 'bg-emerald-50 text-emerald-600'
                              }`}
                            >
                              {t.status === 'closed' ? 'Закрито' : 'Вирішено'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Load more */}
              {data.count >= limit && (
                <div className="px-5 py-4 border-t border-gray-100 text-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="flex items-center gap-2 mx-auto px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 bg-white transition-colors disabled:opacity-50"
                  >
                    {loading ? <LoadingSpinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Завантажити ще
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AIKnowledge;
