import React, { useState } from 'react';
import { FaCheckCircle, FaTimesCircle, FaSpinner, FaNetworkWired, FaExclamationTriangle } from 'react-icons/fa';
import { apiService as api } from '../../services/api';

const ADTest = () => {
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const testConnection = async () => {
    try {
      setLoading(true);
      setError(null);
      setTestResult(null);

      const response = await api.testADConnection();
      
      if (response.success) {
        setTestResult({
          success: true,
          message: response.message || 'Підключення до Active Directory успішне!',
          details: response.data
        });
      } else {
        setTestResult({
          success: false,
          message: response.message || 'Помилка підключення до Active Directory',
          details: response.error
        });
      }
    } catch (err) {
      console.error('Error testing AD connection:', err);
      
      let errorMessage = 'Помилка тестування підключення';
      let errorDetails = {};
      
      if (err.response) {
        const status = err.response.status;
        const message = err.response.data?.message;
        const details = err.response.data?.details;
        
        switch (status) {
          case 401:
            errorMessage = 'Помилка авторизації. Увійдіть в систему знову.';
            errorDetails.authRequired = true;
            break;
          case 403:
            errorMessage = 'Недостатньо прав для тестування Active Directory.';
            errorDetails.permissionDenied = true;
            break;
          case 500:
            if (message && message.includes('LDAP')) {
              errorMessage = 'Не вдається підключитися до Active Directory сервера';
              errorDetails.ldapError = true;
              errorDetails.suggestion = 'Перевірте налаштування мережі та доступність AD сервера';
            } else {
              errorMessage = message || 'Внутрішня помилка сервера';
            }
            break;
          case 503:
            errorMessage = 'Сервіс Active Directory тимчасово недоступний';
            errorDetails.serviceUnavailable = true;
            break;
          default:
            errorMessage = message || `Помилка сервера (${status})`;
        }
        
        if (details) {
          errorDetails = { ...errorDetails, ...details };
        }
      } else if (err.request) {
        errorMessage = 'Сервер не відповідає. Перевірте підключення до мережі.';
        errorDetails.networkError = true;
      }
      
      setError({ message: errorMessage, details: errorDetails });
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = () => {
    if (loading) {
      return <FaSpinner className="animate-spin text-blue-500" size={24} />;
    }
    
    if (testResult?.success) {
      return <FaCheckCircle className="text-green-500" size={24} />;
    }
    
    if (error || testResult?.success === false) {
      return <FaTimesCircle className="text-red-500" size={24} />;
    }
    
    return <FaNetworkWired className="text-gray-400" size={24} />;
  };

  const getStatusText = () => {
    if (loading) return 'Тестування підключення...';
    if (testResult?.success) return 'Підключення успішне';
    if (error || testResult?.success === false) return 'Помилка підключення';
    return 'Готовий до тестування';
  };

  const getStatusColor = () => {
    if (loading) return 'text-blue-600';
    if (testResult?.success) return 'text-green-600';
    if (error || testResult?.success === false) return 'text-red-600';
    return 'text-gray-600';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Тест підключення до Active Directory</h2>
        <button
          onClick={testConnection}
          disabled={loading}
          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <FaSpinner className="animate-spin" /> : <FaNetworkWired />}
          <span>{loading ? 'Тестування...' : 'Тестувати підключення'}</span>
        </button>
      </div>

      {/* Статус підключення */}
      <div className="flex items-center space-x-3 mb-4">
        {getStatusIcon()}
        <span className={`font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>

      {/* Результат тесту */}
      {testResult && (
        <div className={`p-4 rounded-lg border ${
          testResult.success 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <p className={`font-medium ${
            testResult.success ? 'text-green-800' : 'text-red-800'
          }`}>
            {testResult.message}
          </p>
          
          {testResult.details && Object.keys(testResult.details).length > 0 && (
            <div className="mt-3">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Деталі:</h4>
              <div className="text-sm text-gray-600 space-y-1">
                {Object.entries(testResult.details).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span>
                    <span className="font-mono">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Помилка */}
      {error && (
        <div className="p-4 rounded-lg border bg-red-50 border-red-200">
          <div className="flex items-start space-x-2">
            <FaExclamationTriangle className="text-red-500 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-800">{error.message}</p>
              
              {error.details && (
                <div className="mt-3">
                  {error.details.suggestion && (
                    <p className="text-sm text-red-700 mb-2">
                      <strong>Рекомендація:</strong> {error.details.suggestion}
                    </p>
                  )}
                  
                  {error.details.authRequired && (
                    <p className="text-sm text-red-700">
                      Спробуйте вийти з системи та увійти знову.
                    </p>
                  )}
                  
                  {error.details.permissionDenied && (
                    <p className="text-sm text-red-700">
                      Зверніться до адміністратора для отримання необхідних прав доступу.
                    </p>
                  )}
                  
                  {error.details.ldapError && (
                    <div className="text-sm text-red-700 space-y-1">
                      <p>Можливі причини:</p>
                      <ul className="list-disc list-inside ml-2 space-y-1">
                        <li>AD сервер недоступний</li>
                        <li>Неправильні налаштування мережі</li>
                        <li>Проблеми з DNS</li>
                        <li>Блокування фаєрволом</li>
                      </ul>
                    </div>
                  )}
                  
                  {error.details.networkError && (
                    <p className="text-sm text-red-700">
                      Перевірте підключення до інтернету та доступність сервера.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Інформація про тест */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Що перевіряє цей тест:</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Підключення до Active Directory сервера</li>
          <li>• Правильність налаштувань LDAP</li>
          <li>• Доступність служби каталогів</li>
          <li>• Мережеву зв'язність</li>
        </ul>
      </div>
    </div>
  );
};

export default ADTest;