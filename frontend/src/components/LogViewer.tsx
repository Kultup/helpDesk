import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: 'backend' | 'frontend';
  details?: any;
}

interface LogViewerProps {
  maxLogs?: number;
  autoScroll?: boolean;
}

const LogViewer: React.FC<LogViewerProps> = ({ 
  maxLogs = 1000, 
  autoScroll = true 
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [filter, setFilter] = useState<{
    level: string;
    source: string;
    search: string;
  }>({
    level: 'all',
    source: 'all',
    search: ''
  });
  const [isPaused, setIsPaused] = useState(false);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Підключення до WebSocket без дефолтних хардкодів
    const rawUrl = (process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || '') as string;
    const socketUrl = rawUrl.replace(/\/api\/?$/, ''); // Видаляємо /api для WebSocket
    const socket = io(socketUrl, {
      transports: ['websocket']
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to log stream');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from log stream');
    });

    socket.on('log', (logEntry: LogEntry) => {
      if (!isPaused) {
        setLogs(prevLogs => {
          const newLogs = [...prevLogs, logEntry];
          // Обмежуємо кількість логів
          if (newLogs.length > maxLogs) {
            return newLogs.slice(-maxLogs);
          }
          return newLogs;
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [maxLogs, isPaused]);

  useEffect(() => {
    if (autoScroll && !isPaused && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, isPaused]);

  const filteredLogs = logs.filter(log => {
    const levelMatch = filter.level === 'all' || log.level === filter.level;
    const sourceMatch = filter.source === 'all' || log.source === filter.source;
    const searchMatch = filter.search === '' || 
      log.message.toLowerCase().includes(filter.search.toLowerCase());
    
    return levelMatch && sourceMatch && searchMatch;
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-500';
      case 'warn': return 'text-yellow-500';
      case 'info': return 'text-blue-500';
      case 'debug': return 'text-gray-500';
      default: return 'text-gray-700';
    }
  };

  const getSourceBadge = (source: string) => {
    const baseClasses = 'px-2 py-1 text-xs rounded-full font-medium';
    if (source === 'backend') {
      return `${baseClasses} bg-green-100 text-green-800`;
    }
    return `${baseClasses} bg-blue-100 text-blue-800`;
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const exportLogs = () => {
    const logsText = filteredLogs.map(log => 
      `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`
    ).join('\n');
    
    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">
          Логи системи в реальному часі
        </h2>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-sm text-gray-600">
            {isConnected ? 'Підключено' : 'Відключено'}
          </span>
        </div>
      </div>

      {/* Фільтри та контроли */}
      <div className="flex flex-wrap gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700">Рівень:</label>
          <select
            value={filter.level}
            onChange={(e) => setFilter(prev => ({ ...prev, level: e.target.value }))}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm"
          >
            <option value="all">Всі</option>
            <option value="error">Error</option>
            <option value="warn">Warning</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700">Джерело:</label>
          <select
            value={filter.source}
            onChange={(e) => setFilter(prev => ({ ...prev, source: e.target.value }))}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm"
          >
            <option value="all">Всі</option>
            <option value="backend">Backend</option>
            <option value="frontend">Frontend</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700">Пошук:</label>
          <input
            type="text"
            value={filter.search}
            onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
            placeholder="Пошук в логах..."
            className="px-3 py-1 border border-gray-300 rounded-md text-sm w-48"
          />
        </div>

        <div className="flex items-center space-x-2 ml-auto">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-3 py-1 rounded-md text-sm font-medium ${
              isPaused 
                ? 'bg-green-500 text-white hover:bg-green-600' 
                : 'bg-yellow-500 text-white hover:bg-yellow-600'
            }`}
          >
            {isPaused ? 'Відновити' : 'Пауза'}
          </button>
          <button
            onClick={clearLogs}
            className="px-3 py-1 bg-red-500 text-white rounded-md text-sm font-medium hover:bg-red-600"
          >
            Очистити
          </button>
          <button
            onClick={exportLogs}
            className="px-3 py-1 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600"
          >
            Експорт
          </button>
        </div>
      </div>

      {/* Область логів */}
      <div className="bg-black text-green-400 font-mono text-sm p-4 rounded-lg h-96 overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            {logs.length === 0 ? 'Очікування логів...' : 'Немає логів, що відповідають фільтрам'}
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <div key={index} className="mb-1 hover:bg-gray-800 px-2 py-1 rounded">
              <div className="flex items-start space-x-2">
                <span className="text-gray-400 text-xs whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`${getLevelColor(log.level)} font-bold text-xs uppercase whitespace-nowrap`}>
                  {log.level}
                </span>
                <span className={`${getSourceBadge(log.source)} whitespace-nowrap`}>
                  {log.source}
                </span>
                <span className="text-green-400 break-all">
                  {log.message}
                </span>
              </div>
              {log.details && (
                <div className="ml-20 mt-1 text-gray-300 text-xs">
                  {JSON.stringify(log.details, null, 2)}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Статистика */}
      <div className="mt-4 flex justify-between text-sm text-gray-600">
        <span>Всього логів: {logs.length}</span>
        <span>Відфільтровано: {filteredLogs.length}</span>
        <span>Статус: {isPaused ? 'Призупинено' : 'Активно'}</span>
      </div>
    </div>
  );
};

export default LogViewer;