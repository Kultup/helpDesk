import React, { useState } from 'react';
import { apiService } from '../services/api';

interface ApiTestResult {
  endpoint: string;
  status: 'success' | 'error' | 'loading';
  data?: any;
  error?: string;
  timestamp: string;
}

const ApiTest: React.FC = () => {
  const [results, setResults] = useState<ApiTestResult[]>([]);
  const [isTestingAll, setIsTestingAll] = useState(false);

  const addResult = (result: Omit<ApiTestResult, 'timestamp'>) => {
    setResults(prev => [...prev, { ...result, timestamp: new Date().toLocaleTimeString() }]);
  };

  const testEndpoint = async (endpoint: string, testFn: () => Promise<any>) => {
    addResult({ endpoint, status: 'loading' });
    
    try {
      const data = await testFn();
      addResult({ endpoint, status: 'success', data });
    } catch (error: any) {
      addResult({ 
        endpoint, 
        status: 'error', 
        error: error.response?.data?.message || error.message || 'Невідома помилка'
      });
    }
  };

  const testBasicConnection = () => {
    testEndpoint('GET /', async () => {
      const response = await fetch('http://localhost:5000/');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    });
  };

  const testHealthCheck = () => {
    testEndpoint('GET /health', async () => {
      const response = await fetch('http://localhost:5000/health');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    });
  };

  const testApiService = () => {
    testEndpoint('ApiService instance', async () => {
      // Тестуємо, чи правильно налаштований ApiService
      return {
        baseURL: (apiService as any).defaults?.baseURL || 'не налаштовано',
        timeout: (apiService as any).defaults?.timeout || 'не налаштовано'
      };
    });
  };

  const testTicketsAPI = () => {
    testEndpoint('GET /api/tickets', async () => {
      const response = await apiService.getTickets(
        {}, // filters
        { page: 1, limit: 10 }, // pagination
        { field: 'createdAt', direction: 'desc' } // sort
      );
      
      console.log('DEBUG: Tickets API response:', response);
      
      return {
        success: response.success,
        ticketsCount: response.data?.length || 0,
        totalItems: response.pagination?.totalItems,
        totalPages: response.pagination?.totalPages,
        currentPage: response.pagination?.currentPage,
        hasNext: response.pagination?.hasNext,
        hasPrev: response.pagination?.hasPrev,
        fullPagination: response.pagination
      };
    });
  };

  const runAllTests = async () => {
    setIsTestingAll(true);
    setResults([]);
    
    testBasicConnection();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    testHealthCheck();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    testApiService();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    testTicketsAPI();
    
    setIsTestingAll(false);
  };

  const clearResults = () => {
    setResults([]);
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Тестування API з'єднання</h2>
      
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={runAllTests}
          disabled={isTestingAll}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {isTestingAll ? 'Тестування...' : 'Запустити всі тести'}
        </button>
        
        <button
          onClick={testBasicConnection}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Тест базового з'єднання
        </button>
        
        <button
          onClick={testHealthCheck}
          className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
        >
          Тест Health Check
        </button>
        
        <button
          onClick={testApiService}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
        >
          Тест API Service
        </button>
        
        <button
          onClick={testTicketsAPI}
          className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600"
        >
          Тест Tickets API
        </button>
        
        <button
          onClick={clearResults}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Очистити результати
        </button>
      </div>

      <div className="space-y-2">
        {results.length === 0 ? (
          <p className="text-gray-500 italic">Результати тестів з'являться тут...</p>
        ) : (
          results.map((result, index) => (
            <div
              key={`${result.timestamp}-${result.endpoint}-${index}`}
              className={`p-3 rounded border-l-4 ${
                result.status === 'success' 
                  ? 'bg-green-50 border-green-500' 
                  : result.status === 'error'
                  ? 'bg-red-50 border-red-500'
                  : 'bg-blue-50 border-blue-500'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{result.endpoint}</span>
                    <span className="text-sm text-gray-500">{result.timestamp}</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      result.status === 'success' 
                        ? 'bg-green-100 text-green-800' 
                        : result.status === 'error'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {result.status === 'success' ? 'Успіх' : 
                       result.status === 'error' ? 'Помилка' : 'Завантаження...'}
                    </span>
                  </div>
                  
                  {result.error && (
                    <p className="text-red-600 text-sm mt-1">{result.error}</p>
                  )}
                  
                  {result.data && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                        Показати дані
                      </summary>
                      <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-32">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ApiTest;