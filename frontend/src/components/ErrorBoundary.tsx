import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Button from './UI/Button';
import Card, { CardContent } from './UI/Card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Ігноруємо "Script error" - це зазвичай CORS проблема
    if (error.message === 'Script error.' || error.message === 'Script error') {
      console.warn('Script error detected (likely CORS issue), ignoring...');
      return;
    }

    // Логуємо помилку
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Відправляємо помилку на сервер (якщо потрібно)
    if (process.env.NODE_ENV === 'production') {
      try {
        // Можна відправити в сервіс моніторингу
        if (window.navigator.sendBeacon) {
          const errorData = {
            message: error.message,
            stack: error.stack,
            componentStack: errorInfo.componentStack,
            userAgent: navigator.userAgent,
            url: window.location.href,
            timestamp: new Date().toISOString()
          };
          
          // Спробуємо відправити, але не блокуємо UI якщо не вдалося
          try {
            window.navigator.sendBeacon(
              '/api/errors',
              JSON.stringify(errorData)
            );
          } catch (e) {
            // Ігноруємо помилки при відправці логів
          }
        }
      } catch (e) {
        // Ігноруємо помилки при відправці логів
      }
    }

    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
          <Card className="max-w-2xl w-full">
            <CardContent className="p-6">
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <AlertTriangle className="w-16 h-16 text-red-500" />
                </div>
                
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  Щось пішло не так
                </h1>
                
                <p className="text-gray-600 mb-6">
                  Вибачте за незручності. Сталася неочікувана помилка.
                </p>

                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-left">
                    <p className="text-sm font-semibold text-red-800 mb-2">
                      Деталі помилки (тільки в development):
                    </p>
                    <p className="text-xs text-red-700 font-mono mb-2">
                      {this.state.error.toString()}
                    </p>
                    {this.state.error.stack && (
                      <details className="mt-2">
                        <summary className="text-xs text-red-600 cursor-pointer mb-2">
                          Stack trace
                        </summary>
                        <pre className="text-xs text-red-600 overflow-auto max-h-40 bg-red-100 p-2 rounded">
                          {this.state.error.stack}
                        </pre>
                      </details>
                    )}
                    {this.state.errorInfo?.componentStack && (
                      <details className="mt-2">
                        <summary className="text-xs text-red-600 cursor-pointer mb-2">
                          Component stack
                        </summary>
                        <pre className="text-xs text-red-600 overflow-auto max-h-40 bg-red-100 p-2 rounded">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </details>
                    )}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    onClick={this.handleReset}
                    variant="outline"
                    className="flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Спробувати знову
                  </Button>
                  
                  <Button
                    onClick={this.handleReload}
                    variant="outline"
                    className="flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Перезавантажити сторінку
                  </Button>
                  
                  <Button
                    onClick={this.handleGoHome}
                    variant="primary"
                    className="flex items-center justify-center gap-2"
                  >
                    <Home className="w-4 h-4" />
                    На головну
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

