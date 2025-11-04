import React from 'react';
import { useTranslation } from 'react-i18next';
import ActiveDirectory from '../components/ActiveDirectory/ActiveDirectory';

const ActiveDirectoryPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t('activeDirectory.title')}</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              {t('activeDirectory.description')}
            </p>
          </div>
        </div>
        
        <ActiveDirectory />
      </div>
    </div>
  );
};

export default ActiveDirectoryPage;