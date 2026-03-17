import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { apiService } from '../services/api';
import { TelegramMessage } from '../types';
import Card from './UI/Card';
import Button from './UI/Button';
import { Send, Paperclip, Pin, X, MessageCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import LoadingSpinner from './UI/LoadingSpinner';

interface TelegramUserMessageProps {
  ticketId: string;
  userTelegramId?: string;
  onMessageSent?: () => void;
}

const TelegramUserMessage: React.FC<TelegramUserMessageProps> = ({
  ticketId,
  userTelegramId,
  onMessageSent,
}) => {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [pin, setPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history
  useEffect(() => {
    if (!ticketId) return;
    setLoadingHistory(true);
    apiService
      .getTelegramMessages(ticketId)
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          setMessages(res.data);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoadingHistory(false));
  }, [ticketId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Real-time Socket.IO updates
  useEffect(() => {
    const rawUrl = (process.env.REACT_APP_SOCKET_URL ||
      process.env.REACT_APP_API_URL ||
      window.location.origin) as string;
    const socketUrl = rawUrl.replace(/\/api\/?$/, '');
    const token = localStorage.getItem('token');
    const socket = io(socketUrl, {
      auth: token ? { token } : undefined,
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('join-admin-room');
    });

    socket.on('telegram-message', (payload: any) => {
      if (String(payload?.ticketId) === String(ticketId)) {
        const msg = payload?.data as TelegramMessage;
        if (msg) {
          setMessages(prev => {
            if (prev.find(m => m._id === msg._id)) return prev;
            return [...prev, msg];
          });
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [ticketId]);

  const handleSend = async () => {
    if (!message.trim() && !attachment) return;
    try {
      setIsLoading(true);
      setResult(null);
      const response = await apiService.sendTelegramMessageToUser(
        ticketId,
        message.trim(),
        attachment || undefined,
        pin
      );
      if (response.success) {
        setResult({ success: true, message: 'Повідомлення надіслано в Telegram' });
        setMessage('');
        setAttachment(null);
        setPin(false);
        if (onMessageSent) onMessageSent();
        // Refresh history to show sent message
        apiService.getTelegramMessages(ticketId).then(res => {
          if (res.success && Array.isArray(res.data)) setMessages(res.data);
        });
        setTimeout(() => setResult(null), 3000);
      } else {
        setResult({ success: false, message: response.message || 'Помилка надсилання' });
      }
    } catch (error: any) {
      setResult({ success: false, message: error.message || 'Помилка надсилання' });
    } finally {
      setIsLoading(false);
    }
  };

  const getSenderName = (msg: TelegramMessage) => {
    if (typeof msg.senderId === 'object' && msg.senderId !== null) {
      const u = msg.senderId as any;
      return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '?';
    }
    return '?';
  };

  if (!userTelegramId) {
    return (
      <Card className="bg-gray-50 border-gray-200">
        <div className="p-4 text-center">
          <p className="text-gray-500 text-sm">
            Користувач не прив'язав Telegram для отримання сповіщень.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={showForm ? 'border-blue-200' : 'border-gray-200'}>
      <div className="p-4 space-y-3">
        {/* Chat history */}
        {messages.length > 0 && (
          <div className="max-h-64 overflow-y-auto space-y-2 bg-gray-50 rounded-lg p-3">
            {loadingHistory && (
              <div className="flex justify-center py-2">
                <LoadingSpinner size="sm" />
              </div>
            )}
            {messages.map(msg => (
              <div
                key={msg._id}
                className={`flex flex-col ${msg.direction === 'admin_to_user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                    msg.direction === 'admin_to_user'
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
                  }`}
                >
                  {msg.content}
                </div>
                <span className="text-xs text-gray-400 mt-0.5 px-1">
                  {getSenderName(msg)} ·{' '}
                  {new Date(msg.sentAt).toLocaleTimeString('uk-UA', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Toggle / form */}
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-2 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium border border-blue-100"
          >
            <MessageCircle className="h-5 w-5" />
            Надіслати повідомлення в Telegram
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-blue-600" />
                Нове повідомлення користувачу
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Введіть текст повідомлення..."
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm min-h-[100px] resize-none"
              disabled={isLoading}
            />

            <div className="flex flex-wrap items-center gap-4 py-2 border-t border-b border-gray-100">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  id="ticket-tg-upload"
                  className="hidden"
                  onChange={e => setAttachment(e.target.files ? e.target.files[0] : null)}
                />
                <label
                  htmlFor="ticket-tg-upload"
                  className="cursor-pointer p-1.5 hover:bg-gray-100 rounded-md text-gray-600 flex items-center gap-1 text-xs font-medium border border-gray-200"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {attachment ? 'Змінити файл' : 'Додати файл'}
                </label>
                {attachment && (
                  <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded truncate max-w-[120px]">
                    {attachment.name}
                  </span>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-600">
                <input
                  type="checkbox"
                  checked={pin}
                  onChange={e => setPin(e.target.checked)}
                  className="h-3.5 w-3.5 text-blue-600 border-gray-300 rounded"
                />
                <Pin
                  className={`h-3.5 w-3.5 ${pin ? 'text-blue-600 fill-blue-600' : 'text-gray-400'}`}
                />
                Закріпити
              </label>
            </div>

            {result && (
              <div
                className={`p-2 rounded text-xs flex items-center gap-2 ${
                  result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}
              >
                {result.success ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5" />
                )}
                {result.message}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={handleSend}
                disabled={isLoading || (!message.trim() && !attachment)}
                className="flex-1"
                variant="primary"
                size="sm"
              >
                {isLoading ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Надіслати
                  </>
                )}
              </Button>
              <Button
                onClick={() => setShowForm(false)}
                disabled={isLoading}
                variant="outline"
                size="sm"
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default TelegramUserMessage;
