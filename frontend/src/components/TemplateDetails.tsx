import React from 'react';
import { Clock, AlertTriangle, Tag } from 'lucide-react';

interface TicketTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  icon: React.ReactNode;
  estimatedTime: string;
  tags: string[];
}

interface TemplateDetailsProps {
  template: TicketTemplate | null;
}

const TemplateDetails: React.FC<TemplateDetailsProps> = ({ template }) => {
  if (!template) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
        <div className="text-center text-gray-500">
          <div className="w-12 h-12 mx-auto mb-3 bg-gray-200 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <p className="text-sm">Оберіть шаблон для перегляду деталей</p>
        </div>
      </div>
    );
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityText = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'Високий';
      case 'medium':
        return 'Середній';
      case 'low':
        return 'Низький';
      default:
        return 'Невідомий';
    }
  };

  return (
    <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
      <div className="flex items-start space-x-3 mb-4">
        <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
          {template.icon}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {template.title}
          </h3>
          <p className="text-sm text-gray-600">
            {template.description}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Пріоритет */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Пріоритет:</span>
          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(template.priority)}`}>
            {getPriorityText(template.priority)}
          </span>
        </div>

        {/* Час виконання */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Час виконання:</span>
          <div className="flex items-center text-sm text-gray-600">
            <Clock className="w-4 h-4 mr-1" />
            {template.estimatedTime}
          </div>
        </div>

        {/* Теги */}
        {template.tags.length > 0 && (
          <div>
            <div className="flex items-center mb-2">
              <Tag className="w-4 h-4 mr-1 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Теги:</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {template.tags.map((tag, index) => (
                <span
                  key={`${template.id}-tag-${index}`}
                  className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 p-3 bg-blue-100 rounded-md">
        <p className="text-xs text-blue-800">
          💡 Цей шаблон автоматично заповнить форму відповідними даними
        </p>
      </div>
    </div>
  );
};

export default TemplateDetails;