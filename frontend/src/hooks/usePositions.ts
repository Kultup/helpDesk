import { useState, useEffect, useCallback } from 'react';
import { Position, CreatePositionData } from '../types';
import { apiService } from '../services/api';

export const usePositions = (
  page = 1,
  limit = 20,
  search?: string,
  isActive?: boolean | 'all'
) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    hasNext: false,
    hasPrev: false
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getPositions({
        isActive,
        page,
        limit,
        search
      });
      
      if (response.success && response.data) {
        // Правильно отримуємо масив позицій з response.data.positions
        setPositions(response.data.positions || []);
        // Оновлюємо пагінацію з відповіді
        if (response.data.pagination) {
          const pag = response.data.pagination as { page: number; pages: number; total: number; hasNextPage?: boolean; hasPrevPage?: boolean };
          setPagination({
            currentPage: pag.page,
            totalPages: pag.pages,
            totalItems: pag.total,
            hasNext: pag.hasNextPage ?? false,
            hasPrev: pag.hasPrevPage ?? false
          });
        }
      } else {
        setError(response.message || 'Помилка завантаження позицій');
      }
    } catch (err: any) {
      setError(err.message || 'Помилка завантаження позицій');
    } finally {
      setLoading(false);
    }
  }, [isActive, page, limit, search]);

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
  }, [fetchPositions]);

  return {
    positions,
    pagination,
    loading,
    error,
    fetchPositions,
    createPosition,
    updatePosition,
    deletePosition,
    bulkDeletePositions
  };
};