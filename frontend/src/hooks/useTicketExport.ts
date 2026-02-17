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
  aiAnalysis: boolean;
}

export const useTicketExport = () => {
  const [isExporting, setIsExporting] = useState(false);

  const exportTickets = async (filters: ExportFilters) => {
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
      params.append('aiAnalysis', filters.aiAnalysis.toString());

      // Отримуємо токен з localStorage
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен авторизації не знайдено');
      }

      const API_BASE_URL = process.env.REACT_APP_API_URL;
      if (!API_BASE_URL) {
        console.warn('REACT_APP_API_URL не налаштовано у середовищі');
        throw new Error('Базовий URL API не налаштовано. Встановіть REACT_APP_API_URL');
      }
      const apiUrl = `${API_BASE_URL}/tickets/export?${params.toString()}`;

      // Виконуємо запит
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Response error:', errorData);
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      // Отримуємо blob з відповіді
      const blob = await response.blob();

      // Визначаємо ім'я файлу з заголовків або створюємо власне
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `tickets_export_${new Date().toISOString().split('T')[0]}.${filters.format === 'excel' ? 'xlsx' : 'csv'}`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Створюємо URL для завантаження
      const url = window.URL.createObjectURL(blob);

      // Створюємо тимчасове посилання для завантаження
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);

      link.click();

      // Очищуємо ресурси
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

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
    isExporting,
  };
};
