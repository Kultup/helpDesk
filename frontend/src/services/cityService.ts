import { apiService } from './api';
import { City, ApiResponse } from '../types';

class CityService {
  async getAll(): Promise<{ cities: City[] }> {
    try {
      const response: ApiResponse<City[]> = await apiService.getCities();
      return { cities: response.data || [] };
    } catch (error) {
      console.error('Error fetching cities:', error);
      throw error;
    }
  }

  async getById(id: string): Promise<City> {
    try {
      const cities = await this.getAll();
      const city = cities.cities.find(c => c._id === id);
      if (!city) {
        throw new Error(`City with id ${id} not found`);
      }
      return city;
    } catch (error) {
      console.error('Error fetching city by id:', error);
      throw error;
    }
  }

  async create(cityData: Omit<City, '_id'>): Promise<City> {
    try {
      const response: ApiResponse<City> = await apiService.createCity(cityData);
      if (!response.data) {
        throw new Error('Failed to create city: no data returned');
      }
      return response.data;
    } catch (error) {
      console.error('Error creating city:', error);
      throw error;
    }
  }

  async update(id: string, updates: Partial<City>): Promise<City> {
    try {
      const response: ApiResponse<City> = await apiService.updateCity(id, updates);
      if (!response.data) {
        throw new Error('Failed to update city: no data returned');
      }
      return response.data;
    } catch (error) {
      console.error('Error updating city:', error);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await apiService.deleteCity(id);
    } catch (error) {
      console.error('Error deleting city:', error);
      throw error;
    }
  }
}

export const cityService = new CityService();
export default cityService;