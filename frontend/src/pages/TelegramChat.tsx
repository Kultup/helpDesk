import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { TelegramMessage, User, UserRole } from '../types';
import { apiService } from '../services/api';
import Card from '../components/UI/Card';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { Send, ArrowLeft, User as UserIcon } from 'lucide-react';
import { formatDate } from '../utils';

const TelegramChat: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [ticket, setTicket] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
  // Визначаємо basePath на основі поточного шляху
  const basePath = location.pathname.includes('/admin/') ? '/admin' : '';

  // Прокрутка до останнього повідомлення
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Завантаження повідомлень
  useEffect(() => {
    const loadMessages = async () => {
      if (!id) return;
      
      try {
        setIsLoading(true);
        const response = await apiService.getTelegramMessages(id);
        
        if (response.success && response.data) {
          setMessages(response.data);
          
          // Завантажуємо інформацію про тікет
          const ticketResponse = await apiService.getTicketById(id);
          if (ticketResponse.success && ticketResponse.data) {
            setTicket(ticketResponse.data);
          }
        }
      } catch (error) {
        console.error('Помилка завантаження повідомлень:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();

    // Оновлення повідомлень кожні 3 секунди
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [id]);

  // Обробка відправки повідомлення
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || isSending || !id) return;

    try {
      setIsSending(true);
      const response = await apiService.sendTelegramMessageToUser(id, newMessage.trim());
      
      if (response.success) {
        setNewMessage('');
        // Оновлюємо список повідомлень
        const messagesResponse = await apiService.getTelegramMessages(id);
        if (messagesResponse.success && messagesResponse.data) {
          setMessages(messagesResponse.data);
        }
      }
    } catch (error) {
      console.error('Помилка відправки повідомлення:', error);
    } finally {
      setIsSending(false);
    }
  };

  // Визначення, чи повідомлення від поточного користувача
  const isMyMessage = (message: TelegramMessage) => {
    if (typeof message.senderId === 'object') {
      return message.senderId._id === user?._id;
    }
    return message.senderId === user?._id;
  };

  // Отримання імені відправника
  const getSenderName = (message: TelegramMessage) => {
    if (typeof message.senderId === 'object') {
      return `${message.senderId.firstName} ${message.senderId.lastName}`;
    }
    return 'Невідомий';
  };

  // Отримання аватара відправника
  const getSenderAvatar = (message: TelegramMessage) => {
    if (typeof message.senderId === 'object' && '_id' in message.senderId) {
      const sender = message.senderId as User;
      return sender.avatar || null;
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Заголовок */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to={`${basePath}/tickets/${id}`}
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {ticket?.title || `Тікет #${id}`}
              </h1>
              <p className="text-sm text-gray-500">
                Telegram чат
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Область повідомлень */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <p className="text-lg mb-2">Немає повідомлень</p>
            <p className="text-sm">Почніть розмову, відправивши перше повідомлення</p>
          </div>
        ) : (
          messages.map((message) => {
            const isMine = isMyMessage(message);
            const senderName = getSenderName(message);
            const senderAvatar = getSenderAvatar(message);

            return (
              <div
                key={message._id}
                className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-2 ${
                    isMine
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-900 border border-gray-200'
                  }`}
                >
                  {!isMine && (
                    <div className="flex items-center gap-2 mb-1">
                      {senderAvatar ? (
                        <img
                          src={senderAvatar}
                          alt={senderName}
                          className="w-6 h-6 rounded-full"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center">
                          <UserIcon className="w-4 h-4 text-gray-600" />
                        </div>
                      )}
                      <span className="text-xs font-medium">{senderName}</span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {message.content}
                  </p>
                  <p
                    className={`text-xs mt-1 ${
                      isMine ? 'text-blue-100' : 'text-gray-500'
                    }`}
                  >
                    {formatDate(message.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Форма відправки повідомлення (тільки для адмінів) */}
      {isAdmin && (
        <div className="bg-white border-t border-gray-200 px-4 py-3">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Введіть повідомлення..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-gray-900"
              rows={2}
              maxLength={1000}
              disabled={isSending}
            />
            <Button
              type="submit"
              disabled={!newMessage.trim() || isSending}
              variant="primary"
              className="flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {isSending ? 'Відправка...' : 'Відправити'}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
};

export default TelegramChat;

