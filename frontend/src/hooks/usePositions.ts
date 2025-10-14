import { useState, useEffect } from 'react';
import { Position, CreatePositionData } from '../types';
import { apiService } from '../services/api';

export const usePositions = (isActive?: boolean | 'all') => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = async (activeFilter?: boolean | 'all') => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getPositions(activeFilter ?? isActive);
      
      if (response.success && response.data) {
        // Правильно отримуємо масив позицій з response.data.positions
        setPositions(response.data.positions);
      } else {
        setError(response.message || 'Помилка завантаження позицій');
      }
    } catch (err: any) {
      setError(err.message || 'Помилка завантаження позицій');
    } finally {
      setLoading(false);
    }
  };

  const createPosition = async (positionData: CreatePositionData) => {
    try {
      const response = await apiService.createPosition(positionData);
      if (response.success && response.data) {
        setPositions(prev => [...prev, response.data!]);
        return response.data;
      } else {
        throw new Error(response.message || 'Помилка створення позиції');
      }
    } catch (err: any) {
      throw new Error(err.message || 'Помилка створення позиції');
    }
  };

  const updatePosition = async (id: string, updates: Partial<Position>) => {
    try {
      const response = await apiService.updatePosition(id, updates);
      if (response.success && response.data) {
        setPositions(prev => 
          prev.map(position => 
            position._id === id ? response.data! : position
          )
        );
        return response.data;
      } else {
        throw new Error(response.message || 'Помилка оновлення позиції');
      }
    } catch (err: any) {
      throw new Error(err.message || 'Помилка оновлення позиції');
    }
  };

  const deletePosition = async (id: string) => {
    try {
      const response = await apiService.deletePosition(id);
      if (response.success) {
        setPositions(prev => prev.filter(position => position._id !== id));
      } else {
        throw new Error(response.message || 'Помилка видалення позиції');
      }
    } catch (err: any) {
      throw new Error(err.message || 'Помилка видалення позиції');
    }
  };

  const bulkDeletePositions = async (positionIds: string[]) => {
    try {
      const response = await apiService.bulkDeletePositions(positionIds);
      if (response.success) {
        setPositions(prev => prev.filter(position => !positionIds.includes(position._id)));
        return response.data;
      } else {
        throw new Error(response.message || 'Помилка масового видалення позицій');
      }
    } catch (err: any) {
      throw new Error(err.message || 'Помилка масового видалення позицій');
    }
  };

  useEffect(() => {
    fetchPositions();
  }, [isActive]);

  return {
    positions,
    loading,
    error,
    fetchPositions,
    createPosition,
    updatePosition,
    deletePosition,
    bulkDeletePositions
  };
};