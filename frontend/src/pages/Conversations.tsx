import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, User, Ticket, ChevronRight, Calendar } from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';

interface ConversationUser {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

interface ConversationTicket {
  _id: string;
  ticketNumber?: string;
  title?: string;
  status?: string;
}

interface Conversation {
  _id: string;
  user: ConversationUser;
  telegramChatId: string;
  ticket: ConversationTicket | null;
  subject: string;
  messageCount: number;
  startedAt: string;
  lastMessageAt: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

const Conversations: React.FC = () => {
  const [list, setList] = useState<Conversation[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Conversation & { messages: ConversationMessage[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = async (page = 1) => {
    setLoading(true);
    try {
      const res = await apiService.get<{ success: boolean; data: Conversation[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
        '/conversations',
        { params: { page, limit: 20 } }
      );
      const data = res as unknown as { data: Conversation[]; pagination: { page: number; limit: number; total: number; pages: number } };
      setList(data.data || []);
      setPagination(data.pagination || { page: 1, limit: 20, total: 0, pages: 0 });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList(pagination.page);
  }, [pagination.page]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await apiService.get<{ success: boolean; data: Conversation & { messages: ConversationMessage[] } }>(`/conversations/${id}`);
      const data = res as unknown as { data: Conversation & { messages: ConversationMessage[] } };
      setDetail(data.data || null);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  };

  const formatDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' });
  };

  const userName = (u: ConversationUser) => [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '—';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <MessageCircle className="h-7 w-7" />
          Історія спілкувань з ботом
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-2">
              <h2 className="text-lg font-semibold">Розмови</h2>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : list.length === 0 ? (
                <p className="text-muted-foreground text-sm">Поки немає розмов</p>
              ) : (
                <ul className="space-y-1">
                  {list.map((c) => (
                    <li key={c._id}>
                      <button
                        type="button"
                        onClick={() => openDetail(c._id)}
                        className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 ${selectedId === c._id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                      >
                        <User className="h-4 w-4 shrink-0" />
                        <span className="truncate flex-1">{userName(c.user)}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{c.messageCount}</span>
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      </button>
                      <p className="text-xs text-muted-foreground truncate pl-6 pr-2">{c.subject || '(без теми)'}</p>
                    </li>
                  ))}
                </ul>
              )}
              {pagination.pages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page <= 1}
                    onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                  >
                    Назад
                  </Button>
                  <span className="text-sm text-muted-foreground self-center">
                    {pagination.page} / {pagination.pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page >= pagination.pages}
                    onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                  >
                    Далі
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Повідомлення</h2>
              {detail?.ticket && (
                <Link to={`/admin/tickets/${detail.ticket._id}`}>
                  <Button variant="outline" size="sm">
                    <Ticket className="h-4 w-4 mr-1" />
                    Тікет {detail.ticket.ticketNumber || detail.ticket._id}
                  </Button>
                </Link>
              )}
            </CardHeader>
            <CardContent>
              {!selectedId ? (
                <p className="text-muted-foreground text-sm">Оберіть розмову зліва</p>
              ) : detailLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : !detail ? (
                <p className="text-muted-foreground text-sm">Не вдалося завантажити</p>
              ) : (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                  {detail.messages?.map((m, i) => (
                    <div
                      key={i}
                      className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 ${
                          m.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground'
                        }`}
                      >
                        <p className="text-xs opacity-80 mb-0.5">
                          {m.role === 'user' ? 'Користувач' : 'Бот'} · {formatDate(m.createdAt)}
                        </p>
                        <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Conversations;
