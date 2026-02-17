import React, { useState, useEffect } from 'react';
import { X, Download, FileText, FileSpreadsheet, Calendar, Filter } from 'lucide-react';
import Button from './UI/Button';
import Modal from './UI/Modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './UI/Select';
import Input from './UI/Input';
import LoadingSpinner from './UI/LoadingSpinner';

interface ExportTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (filters: ExportFilters) => Promise<void>;
  cities: Array<{ _id: string; name: string }>;
  users: Array<{ _id: string; firstName: string; lastName: string; email: string }>;
}

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

const ExportTicketsModal: React.FC<ExportTicketsModalProps> = ({
  isOpen,
  onClose,
  onExport,
  cities,
  users,
}) => {
  const [filters, setFilters] = useState<ExportFilters>({
    format: 'excel',
    includeComments: false,
    includeAttachments: false,
    aiAnalysis: false,
  });
  const [isExporting, setIsExporting] = useState(false);

  const statusOptions = [
    { value: '', label: 'Всі статуси' },
    { value: 'open', label: 'Відкритий' },
    { value: 'in_progress', label: 'В роботі' },
    { value: 'resolved', label: 'Вирішений' },
    { value: 'closed', label: 'Закритий' },
    { value: 'cancelled', label: 'Скасований' },
  ];

  const priorityOptions = [
    { value: '', label: 'Всі пріоритети' },
    { value: 'low', label: 'Низький' },
    { value: 'medium', label: 'Середній' },
    { value: 'high', label: 'Високий' },
    { value: 'urgent', label: 'Терміновий' },
  ];

  const cityOptions = [
    { value: '', label: 'Всі міста' },
    ...cities.map(city => ({ value: city._id, label: city.name })),
  ];

  const userOptions = [
    { value: '', label: 'Всі користувачі' },
    ...users.map(user => ({
      value: user._id,
      label: `${user.firstName} ${user.lastName} (${user.email})`,
    })),
  ];

  const handleFilterChange = (key: keyof ExportFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await onExport(filters);
      onClose();
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const resetFilters = () => {
    setFilters({
      format: 'excel',
      includeComments: false,
      includeAttachments: false,
      aiAnalysis: false,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Download className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Експорт тікетів</h2>
              <p className="text-sm text-gray-500">Налаштуйте параметри експорту</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Format Selection */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Формат файлу</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleFilterChange('format', 'excel')}
                className={`p-4 border-2 rounded-lg flex items-center space-x-3 transition-colors ${
                  filters.format === 'excel'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <FileSpreadsheet className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-medium">Excel (.xlsx)</div>
                  <div className="text-xs text-gray-500">Рекомендовано</div>
                </div>
              </button>
              <button
                onClick={() => handleFilterChange('format', 'csv')}
                className={`p-4 border-2 rounded-lg flex items-center space-x-3 transition-colors ${
                  filters.format === 'csv'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <FileText className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-medium">CSV (.csv)</div>
                  <div className="text-xs text-gray-500">Універсальний</div>
                </div>
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-medium text-gray-700">Фільтри</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
                <Select
                  value={filters.status || ''}
                  onValueChange={value => handleFilterChange('status', value || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Всі статуси" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Всі статуси</SelectItem>
                    {statusOptions
                      .filter(option => option.value !== '')
                      .map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Пріоритет</label>
                <Select
                  value={filters.priority || ''}
                  onValueChange={value => handleFilterChange('priority', value || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Всі пріоритети" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Всі пріоритети</SelectItem>
                    {priorityOptions
                      .filter(option => option.value !== '')
                      .map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Місто</label>
                <Select
                  value={filters.city || ''}
                  onValueChange={value => handleFilterChange('city', value || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Всі міста" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Всі міста</SelectItem>
                    {cities.map(city => (
                      <SelectItem key={city._id} value={city._id}>
                        {city.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Призначено</label>
                <Select
                  value={filters.assignedTo || ''}
                  onValueChange={value => handleFilterChange('assignedTo', value || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Всі користувачі" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Всі користувачі</SelectItem>
                    {users.map(user => (
                      <SelectItem key={user._id} value={user._id}>
                        {`${user.firstName} ${user.lastName} (${user.email})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date Range */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Період</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  type="date"
                  label="Від"
                  value={filters.dateFrom || ''}
                  onChange={e => handleFilterChange('dateFrom', e.target.value || undefined)}
                />
                <Input
                  type="date"
                  label="До"
                  value={filters.dateTo || ''}
                  onChange={e => handleFilterChange('dateTo', e.target.value || undefined)}
                />
              </div>
            </div>
          </div>

          {/* Additional Options */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Додаткові опції</h3>
            <div className="space-y-2">
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={filters.includeComments}
                  onChange={e => handleFilterChange('includeComments', e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Включити коментарі</span>
              </label>
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={filters.includeAttachments}
                  onChange={e => handleFilterChange('includeAttachments', e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-text-secondary">Включити список вкладень</span>
              </label>
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={filters.aiAnalysis}
                  onChange={e => handleFilterChange('aiAnalysis', e.target.checked)}
                  className="w-4 h-4 text-primary border-border rounded focus:ring-primary"
                />
                <span className="text-sm text-text-secondary">
                  Включити AI аналіз (може зайняти більше часу)
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={resetFilters}
            className="text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Скинути фільтри
          </button>
          <div className="flex space-x-3">
            <Button variant="secondary" onClick={onClose} disabled={isExporting}>
              Скасувати
            </Button>
            <Button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center space-x-2"
            >
              {isExporting ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Експорт...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Експортувати</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ExportTicketsModal;
