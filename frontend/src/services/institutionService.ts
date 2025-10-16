import { apiService } from './api';
import { Institution, CreateInstitutionData, InstitutionType, ApiResponse, InstitutionsResponse } from '../types';

class InstitutionService {
  async getAll(params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: InstitutionType;
    city?: string;
    isActive?: boolean;
    isPublic?: boolean;
    isVerified?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ institutions: Institution[]; pagination?: any }> {
    try {
      const response: InstitutionsResponse = await apiService.getInstitutions(params);
      return {
        institutions: response.data || [],
        pagination: response.pagination
      };
    } catch (error) {
      console.error('Error fetching institutions:', error);
      throw error;
    }
  }

  async getById(id: string): Promise<Institution> {
    try {
      const response: ApiResponse<Institution> = await apiService.getInstitutionById(id);
      if (!response.data) {
        throw new Error(`Institution with id ${id} not found`);
      }
      return response.data;
    } catch (error) {
      console.error('Error fetching institution by id:', error);
      throw error;
    }
  }

  async create(institutionData: CreateInstitutionData): Promise<Institution> {
    try {
      const response: ApiResponse<Institution> = await apiService.createInstitution(institutionData);
      if (!response.data) {
        throw new Error('Failed to create institution: no data returned');
      }
      return response.data;
    } catch (error) {
      console.error('Error creating institution:', error);
      throw error;
    }
  }

  async update(id: string, updates: Partial<Institution>): Promise<Institution> {
    try {
      const response: ApiResponse<Institution> = await apiService.updateInstitution(id, updates);
      if (!response.data) {
        throw new Error('Failed to update institution: no data returned');
      }
      return response.data;
    } catch (error) {
      console.error('Error updating institution:', error);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await apiService.deleteInstitution(id);
    } catch (error) {
      console.error('Error deleting institution:', error);
      throw error;
    }
  }

  async bulkDelete(institutionIds: string[]): Promise<{ deletedCount: number }> {
    try {
      const response: ApiResponse<{ deletedCount: number }> = await apiService.bulkDeleteInstitutions(institutionIds);
      return response.data || { deletedCount: 0 };
    } catch (error) {
      console.error('Error bulk deleting institutions:', error);
      throw error;
    }
  }

  async toggleActive(id: string): Promise<Institution> {
    try {
      const response: ApiResponse<Institution> = await apiService.toggleInstitutionActive(id);
      if (!response.data) {
        throw new Error('Failed to toggle institution status: no data returned');
      }
      return response.data;
    } catch (error) {
      console.error('Error toggling institution status:', error);
      throw error;
    }
  }

  async getTypes(): Promise<Array<{ value: InstitutionType; label: string; labelEn: string }>> {
    try {
      const response: ApiResponse<Array<{ value: InstitutionType; label: string; labelEn: string }>> = await apiService.getInstitutionTypes();
      return response.data || [];
    } catch (error) {
      console.error('Error fetching institution types:', error);
      throw error;
    }
  }

  async search(params: {
    query: string;
    type?: InstitutionType;
    city?: string;
    limit?: number;
  }): Promise<Institution[]> {
    try {
      const response: ApiResponse<Institution[]> = await apiService.searchInstitutions(params);
      return response.data || [];
    } catch (error) {
      console.error('Error searching institutions:', error);
      throw error;
    }
  }

  async getNearby(params: {
    lat: number;
    lng: number;
    radius?: number;
    type?: InstitutionType;
    limit?: number;
  }): Promise<Institution[]> {
    try {
      const response: ApiResponse<Institution[]> = await apiService.getNearbyInstitutions(params);
      return response.data || [];
    } catch (error) {
      console.error('Error fetching nearby institutions:', error);
      throw error;
    }
  }
}

export const institutionService = new InstitutionService();
export default institutionService;