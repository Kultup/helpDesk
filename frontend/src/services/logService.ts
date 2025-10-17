import { io, Socket } from 'socket.io-client';
import React from 'react';

interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  details?: any;
}

class LogService {
  private socket: Socket | null = null;
  private originalConsole: any = {};
  private isInitialized = false;

  initialize() {
    if (this.isInitialized) return;

    // Підключення до WebSocket (без хардкодів)
    const rawUrl = (process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || '') as string;
    const socketUrl = rawUrl.replace(/\/api\/?$/, ''); // Видаляємо /api для WebSocket
    this.socket = io(socketUrl, {
      transports: ['websocket']
    });

    this.setupConsoleInterception();
    this.setupErrorHandling();
    this.isInitialized = true;

    console.log('LogService initialized');
  }

  private setupConsoleInterception() {
    // Зберігаємо оригінальні методи console
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug
    };

    // Перехоплюємо console методи
    console.log = (...args: any[]) => {
      this.originalConsole.log(...args);
      this.sendLog('info', args.join(' '));
    };

    console.error = (...args: any[]) => {
      this.originalConsole.error(...args);
      this.sendLog('error', args.join(' '));
    };

    console.warn = (...args: any[]) => {
      this.originalConsole.warn(...args);
      this.sendLog('warn', args.join(' '));
    };

    console.info = (...args: any[]) => {
      this.originalConsole.info(...args);
      this.sendLog('info', args.join(' '));
    };

    console.debug = (...args: any[]) => {
      this.originalConsole.debug(...args);
      this.sendLog('debug', args.join(' '));
    };
  }

  private setupErrorHandling() {
    // Глобальний обробник помилок
    window.addEventListener('error', (event) => {
      this.sendLog('error', `Uncaught Error: ${event.message}`, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
      });
    });

    // Обробник для Promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.sendLog('error', `Unhandled Promise Rejection: ${event.reason}`, {
        reason: event.reason,
        stack: event.reason?.stack
      });
    });

    // React Error Boundary helper
    this.setupReactErrorBoundary();
  }

  private setupReactErrorBoundary() {
    // Перехоплюємо React помилки через monkey patching
    const originalComponentDidCatch = React.Component.prototype.componentDidCatch;
    
    React.Component.prototype.componentDidCatch = function(error: Error, errorInfo: any) {
      logService.sendLog('error', `React Error: ${error.message}`, {
        error: error.toString(),
        stack: error.stack,
        componentStack: errorInfo.componentStack
      });
      
      if (originalComponentDidCatch) {
        originalComponentDidCatch.call(this, error, errorInfo);
      }
    };
  }

  private sendLog(level: LogEntry['level'], message: string, details?: any) {
    if (!this.socket || !this.socket.connected) return;

    const logEntry: LogEntry = {
      level,
      message,
      details
    };

    this.socket.emit('frontend-log', logEntry);
  }

  // Публічні методи для ручного логування
  public log(message: string, details?: any) {
    this.sendLog('info', message, details);
  }

  public info(message: string, details?: any) {
    this.sendLog('info', message, details);
  }

  public warn(message: string, details?: any) {
    this.sendLog('warn', message, details);
  }

  public error(message: string, details?: any) {
    this.sendLog('error', message, details);
  }

  public debug(message: string, details?: any) {
    this.sendLog('debug', message, details);
  }

  // Метод для відновлення оригінальних console методів
  public restoreConsole() {
    Object.keys(this.originalConsole).forEach(method => {
      (console as any)[method] = this.originalConsole[method];
    });
  }

  // Метод для відключення сервісу
  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.restoreConsole();
    this.isInitialized = false;
  }

  // Геттер для статусу підключення
  public get isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// Створюємо singleton instance
const logService = new LogService();

export default logService;