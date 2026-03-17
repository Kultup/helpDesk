import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { MessageSquare, Send, User as UserIcon } from 'lucide-react';
import Card from '../components/UI/Card';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';
import { User, TelegramMessage } from '../types';

const DirectMessages: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load users with Telegram
  useEffect(() => {
    apiService
      .getTelegramUsers()
      .then(res => {
        if (res.success && Array.isArray(res.data)) setUsers(res.data);
      })
      .catch(() => undefined)
      .finally(() => setLoadingUsers(false));
  }, []);

  // Load messages when user selected
  useEffect(() => {
    if (!selectedUser) return;
    setLoadingMessages(true);
    setMessages([]);
    apiService
      .getDirectMessages(selectedUser._id)
      .then(res => {
        if (res.success && Array.isArray(res.data)) setMessages(res.data);
      })
      .catch(() => undefined)
      .finally(() => setLoadingMessages(false));
  }, [selectedUser]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Real-time socket
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

    socket.on('telegram-dm', (payload: any) => {
      const msg = payload?.data as TelegramMessage;
      if (!msg) return;
      // Append to current conversation if the user matches
      setSelectedUser(current => {
        if (current && String(payload?.userId) === String(current._id)) {
          setMessages(prev => {
            if (prev.find(m => m._id === msg._id)) return prev;
            return [...prev, msg];
          });
        }
        return current;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleSend = async () => {
    if (!selectedUser || !messageText.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await apiService.sendDirectMessage(selectedUser._id, messageText.trim());
      if (res.success) {
        setMessageText('');
        // Refresh messages to show sent message
        const hist = await apiService.getDirectMessages(selectedUser._id);
        if (hist.success && Array.isArray(hist.data)) setMessages(hist.data);
      } else {
        setSendError((res as any).message || 'Помилка відправки');
      }
    } catch (err: any) {
      setSendError(err.message || 'Помилка відправки');
    } finally {
      setSending(false);
    }
  };

  const getUserName = (user: User) =>
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  const getSenderName = (msg: TelegramMessage) => {
    if (typeof msg.senderId === 'object' && msg.senderId !== null) {
      const u = msg.senderId as any;
      return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '?';
    }
    return '?';
  };

  return (
    <div className="p-6 h-[calc(100vh-80px)] flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-900">Прямі повідомлення</h1>
      </div>

      <div className="flex flex-1 gap-4 min-h-0">
        {/* User list */}
        <Card className="w-72 flex-shrink-0 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-gray-100 font-semibold text-sm text-gray-700">
            Користувачі з Telegram
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingUsers ? (
              <div className="flex justify-center p-6">
                <LoadingSpinner />
              </div>
            ) : users.length === 0 ? (
              <p className="text-sm text-gray-400 p-4 text-center">
                Немає підключених користувачів
              </p>
            ) : (
              users.map(user => (
                <button
                  key={user._id}
                  onClick={() => setSelectedUser(user)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 ${
                    selectedUser?._id === user._id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                  }`}
                >
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <UserIcon className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {getUserName(user)}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Chat area */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          {!selectedUser ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Виберіть користувача для початку розмови</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <UserIcon className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{getUserName(selectedUser)}</p>
                  <p className="text-xs text-gray-400">{selectedUser.email}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMessages ? (
                  <div className="flex justify-center py-6">
                    <LoadingSpinner />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-6">Немає повідомлень</p>
                ) : (
                  messages.map(msg => (
                    <div
                      key={msg._id}
                      className={`flex flex-col ${msg.direction === 'admin_to_user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
                          msg.direction === 'admin_to_user'
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-gray-100 text-gray-800 rounded-bl-none'
                        }`}
                      >
                        {msg.content}
                      </div>
                      <span className="text-xs text-gray-400 mt-0.5 px-1">
                        {getSenderName(msg)} ·{' '}
                        {new Date(msg.sentAt).toLocaleString('uk-UA', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: '2-digit',
                        })}
                      </span>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t border-gray-100">
                {sendError && <p className="text-xs text-red-600 mb-2">{sendError}</p>}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Введіть повідомлення..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={sending}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={sending || !messageText.trim()}
                    variant="primary"
                    size="sm"
                  >
                    {sending ? <LoadingSpinner size="sm" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default DirectMessages;
