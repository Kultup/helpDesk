import React from 'react';
import ApiTest from '../components/ApiTest';

const ApiTestPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Тестування API з'єднання
          </h1>
          <p className="text-gray-600">
            Ця сторінка дозволяє протестувати з'єднання між фронтендом та бекендом
          </p>
        </div>
        
        <ApiTest />
        
        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">Інформація про з'єднання:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Фронтенд: http://localhost:3000</li>
            <li>• Бекенд: http://localhost:5000</li>
            <li>• API Base URL: http://localhost:5000/api</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ApiTestPage;