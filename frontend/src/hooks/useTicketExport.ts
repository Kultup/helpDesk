import { useState } from 'react';
import { toast } from 'react-hot-toast';

interface ExportFilters {
  format: 'csv' | 'excel';
  status?: string;
  priority?: string;
  city?: string;
  assignedTo?: string;
  createdBy?: string;
  dateFrom?: string;
  dateTo?: string;
  includeComments: boolean;
  includeAttachments: boolean;
}

export const useTicketExport = () => {
  const [isExporting, setIsExporting] = useState(false);

  const exportTickets = async (filters: ExportFilters) => {
    console.log('🚀 Starting export with filters:', filters);
    setIsExporting(true);
    
    try {
      // Підготовка параметрів запиту
      const params = new URLSearchParams();
      
      // Додаємо формат
      params.append('format', filters.format);
      
      // Додаємо фільтри якщо вони є
      if (filters.status) params.append('status', filters.status);
      if (filters.priority) params.append('priority', filters.priority);
      if (filters.city) params.append('city', filters.city);
      if (filters.assignedTo) params.append('assignedTo', filters.assignedTo);
      if (filters.createdBy) params.append('createdBy', filters.createdBy);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      
      // Додаємо додаткові опції
      params.append('includeComments', filters.includeComments.toString());
      params.append('includeAttachments', filters.includeAttachments.toString());

      console.log('📋 Export URL params:', params.toString());

      // Отримуємо токен з localStorage
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен авторизації не знайдено');
      }

      console.log('🔑 Token found:', token ? 'Yes' : 'No');

      const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
      const apiUrl = `${API_BASE_URL}/tickets/export?${params.toString()}`;
      console.log('🌐 Making request to:', apiUrl);

      // Виконуємо запит
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log('📡 Response status:', response.status);
      console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Response error:', errorData);
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      // Отримуємо blob з відповіді
      const blob = await response.blob();
      console.log('📦 Blob size:', blob.size, 'bytes');
      console.log('📦 Blob type:', blob.type);
      
      // Визначаємо ім'я файлу з заголовків або створюємо власне
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `tickets_export_${new Date().toISOString().split('T')[0]}.${filters.format === 'excel' ? 'xlsx' : 'csv'}`;
      
      console.log('📄 Content-Disposition header:', contentDisposition);
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      console.log('📄 Final filename:', filename);

      // Створюємо URL для завантаження
      const url = window.URL.createObjectURL(blob);
      console.log('🔗 Created blob URL:', url);
      
      // Створюємо тимчасове посилання для завантаження
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      
      console.log('⬇️ Triggering download...');
      link.click();
      
      // Очищуємо ресурси
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      console.log('✅ Export completed successfully');
      toast.success('Файл успішно завантажено!');
      
    } catch (error) {
      console.error('Export error:', error);
      toast.error(error instanceof Error ? error.message : 'Помилка при експорті тікетів');
      throw error;
    } finally {
      setIsExporting(false);
    }
  };

  return {
    exportTickets,
    isExporting
  };
};