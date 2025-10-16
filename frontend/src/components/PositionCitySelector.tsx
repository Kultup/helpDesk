import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';

interface Position {
  id: string;
  title: string;
  department: string;
}

interface City {
  id: string;
  name: string;
  region: string;
}

const PositionCitySelector: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const [positionsResponse, citiesResponse] = await Promise.all([
        apiService.getSimplePositions(),
        apiService.getSimpleCities()
      ]);

      if (positionsResponse.success && positionsResponse.data) {
        setPositions(positionsResponse.data);
      }

      if (citiesResponse.success && citiesResponse.data) {
        setCities(citiesResponse.data);
      }
    } catch (err: any) {
      setError(`Помилка завантаження даних: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const selectedPositionData = positions.find(p => p.id === selectedPosition);
    const selectedCityData = cities.find(c => c.id === selectedCity);
    
    alert(`Вибрано:\nПосада: ${selectedPositionData?.title} (${selectedPositionData?.department})\nМісто: ${selectedCityData?.name} (${selectedCityData?.region})`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Завантаження...</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">
        Тестування вибору посад та міст
      </h2>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Вибір посади */}
        <div>
          <label htmlFor="position" className="block text-sm font-medium text-gray-700 mb-2">
            Посада
          </label>
          <select
            id="position"
            value={selectedPosition}
            onChange={(e) => setSelectedPosition(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
            <option value="">Оберіть посаду...</option>
            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.title} ({position.department})
              </option>
            ))}
          </select>
          <p className="text-sm text-gray-500 mt-1">
            Доступно {positions.length} посад
          </p>
        </div>

        {/* Вибір міста */}
        <div>
          <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-2">
            Місто
          </label>
          <select
            id="city"
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
            <option value="">Оберіть місто...</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name} ({city.region})
              </option>
            ))}
          </select>
          <p className="text-sm text-gray-500 mt-1">
            Доступно {cities.length} міст
          </p>
        </div>

        {/* Кнопки */}
        <div className="flex space-x-4">
          <button
            type="submit"
            disabled={!selectedPosition || !selectedCity}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Підтвердити вибір
          </button>
          
          <button
            type="button"
            onClick={loadData}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Оновити дані
          </button>
        </div>
      </form>

      {/* Інформація про завантажені дані */}
      <div className="mt-8 p-4 bg-gray-50 rounded-md">
        <h3 className="text-lg font-medium text-gray-800 mb-2">Статистика</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Посади:</span> {positions.length}
          </div>
          <div>
            <span className="font-medium">Міста:</span> {cities.length}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PositionCitySelector;