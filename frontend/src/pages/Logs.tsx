import React from 'react';
import { useTranslation } from 'react-i18next';
import LogViewer from '../components/LogViewer';

const Logs: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('logs.title', 'Системні логи')}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          {t('logs.description', 'Перегляд логів бекенду та фронтенду в реальному часі')}
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <LogViewer />
      </div>
    </div>
  );
};

export default Logs;