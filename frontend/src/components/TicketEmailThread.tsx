import React, { useEffect, useState } from 'react';
import { Mail, Reply, Paperclip, User } from 'lucide-react';
import { apiService } from '../services/api';
import Card from './UI/Card';
import Button from './UI/Button';
import LoadingSpinner from './UI/LoadingSpinner';
import { formatDate } from '../utils';

interface TicketEmailThreadProps {
  ticketId: string;
}

interface EmailThread {
  _id: string;
  messageId: string;
  inReplyTo: string | null;
  threadId: string;
  from: {
    email: string;
    name?: string;
  };
  to: Array<{
    email: string;
    name?: string;
  }>;
  subject: string;
  body: {
    html: string;
    text: string;
  };
  attachments: Array<{
    filename: string;
    originalName: string;
    mimetype: string;
    size: number;
  }>;
  direction: 'inbound' | 'outbound';
  receivedAt: string;
  sentAt: string;
}

const TicketEmailThread: React.FC<TicketEmailThreadProps> = ({ ticketId }) => {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadThreads();
  }, [ticketId]);

  const loadThreads = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiService.getEmailThreads({ ticketId, limit: 50 });
      if (response.success && response.data) {
        setThreads(response.data.data || []);
      } else {
        setError(response.message || 'Помилка завантаження email листування');
      }
    } catch (err: any) {
      setError(err.message || 'Помилка завантаження email листування');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <div className="p-6 text-center">
          <LoadingSpinner />
          <p className="mt-2 text-sm text-gray-600">Завантаження email листування...</p>
        </div>
      </Card>
    );
  }

  if (error || threads.length === 0) {
    return null;
  }

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Email Листування</h3>
          <span className="text-sm text-gray-500">({threads.length})</span>
        </div>

        <div className="space-y-4">
          {threads.map((thread) => (
            <div
              key={thread._id}
              className={`p-4 rounded-lg border ${
                thread.direction === 'inbound'
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-green-50 border-green-200'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-semibold text-gray-900">
                      {thread.from.name || thread.from.email}
                    </span>
                    <span className="text-xs text-gray-500">
                      {thread.direction === 'inbound' ? 'Вхідний' : 'Вихідний'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-700 mb-2">
                    <span className="font-medium">Тема:</span> {thread.subject}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDate(thread.receivedAt || thread.sentAt)}
                  </div>
                </div>
                {thread.direction === 'inbound' && (
                  <Button variant="outline" size="sm">
                    <Reply className="w-4 h-4 mr-2" />
                    Відповісти
                  </Button>
                )}
              </div>

              <div className="mb-3">
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {thread.body.text || thread.body.html.replace(/<[^>]*>/g, '')}
                </div>
              </div>

              {thread.attachments && thread.attachments.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Paperclip className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">
                      Вкладення ({thread.attachments.length})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {thread.attachments.map((attachment, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 text-xs bg-gray-100 rounded text-gray-700"
                      >
                        {attachment.originalName} ({(attachment.size / 1024).toFixed(2)} KB)
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {thread.to && thread.to.length > 0 && (
                <div className="mt-2 text-xs text-gray-500">
                  <span className="font-medium">Кому:</span>{' '}
                  {thread.to.map((to, index) => (
                    <span key={index}>
                      {to.name || to.email}
                      {index < thread.to.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

export default TicketEmailThread;

