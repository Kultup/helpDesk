import React from 'react';
import PositionCitySelector from '../components/PositionCitySelector';

const TelegramTest: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Тестування Telegram Bot функціональності
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Цей компонент імітує функціональність вибору позицій та міст, 
            яка використовується в Telegram боті для реєстрації користувачів.
          </p>
        </div>

        <PositionCitySelector />

        <div className="mt-12 max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              Інструкції для тестування
            </h2>
            
            <div className="space-y-4 text-gray-700">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-blue-800 mb-2">
                  🤖 Тестування через Telegram Bot
                </h3>
                <p>
                  Для тестування реєстрації через Telegram бота:
                </p>
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>Знайдіть бота в Telegram</li>
                  <li>Надішліть команду <code className="bg-gray-200 px-1 rounded">/start</code></li>
                  <li>Слідуйте інструкціям для реєстрації</li>
                  <li>Оберіть посаду з інлайн клавіатури</li>
                  <li>Оберіть місто з інлайн клавіатури</li>
                </ol>
              </div>

              <div className="p-4 bg-green-50 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-2">
                  🌐 Тестування через веб-інтерфейс
                </h3>
                <p>
                  Використовуйте форму вище для тестування API endpoints:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li><code className="bg-gray-200 px-1 rounded">GET /api/positions/simple/list</code></li>
                  <li><code className="bg-gray-200 px-1 rounded">GET /api/cities/simple/list</code></li>
                </ul>
              </div>

              <div className="p-4 bg-yellow-50 rounded-lg">
                <h3 className="font-semibold text-yellow-800 mb-2">
                  ⚙️ Технічні деталі
                </h3>
                <p>
                  Компонент використовує ті ж API endpoints, що й Telegram бот:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Завантаження спрощених списків позицій та міст</li>
                  <li>Обробка помилок та станів завантаження</li>
                  <li>Валідація вибору користувача</li>
                  <li>Відображення статистики завантажених даних</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TelegramTest;