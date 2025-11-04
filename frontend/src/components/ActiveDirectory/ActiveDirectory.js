import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FaNetworkWired, FaUsers, FaDesktop, FaChartPie, FaExclamationTriangle } from 'react-icons/fa';
import ADUsers from './ADUsers';
import ADComputers from './ADComputers';
import ADStatistics from './ADStatistics';
import { apiService as api } from '../../services/api';
import { useWindowSize } from '../../hooks';

const ActiveDirectory = () => {
  const { t } = useTranslation();
  const { width } = useWindowSize();
  const isMobile = width < 640;
  const [activeTab, setActiveTab] = useState('statistics');
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const location = useLocation();

  useEffect(() => {
    testConnection();
  }, []);

  // Синхронізація активної вкладки з параметром URL `view`
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const view = params.get('view');
    if (view && ['statistics', 'users', 'computers'].includes(view)) {
      setActiveTab(view);
    }
  }, [location.search]);

  const testConnection = async () => {
    try {
      setTestingConnection(true);
      const response = await api.testADConnection();
      setConnectionStatus({
        success: response.success,
        message: response.message || (response.success ? t('activeDirectory.connection.connected') : t('activeDirectory.connection.error'))
      });
    } catch (err) {
      console.error('Error testing AD connection:', err);
      setConnectionStatus({
        success: false,
        message: err.response?.data?.message || t('activeDirectory.connection.disconnected')
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const tabs = [
    {
      id: 'statistics',
      name: t('activeDirectory.tabs.statistics'),
      icon: FaChartPie,
      component: ADStatistics
    },
    {
      id: 'users',
      name: t('activeDirectory.tabs.users'),
      icon: FaUsers,
      component: ADUsers
    },
    {
      id: 'computers',
      name: t('activeDirectory.tabs.computers'),
      icon: FaDesktop,
      component: ADComputers
    }
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8">
        {/* Заголовок */}
        <div className="mb-4 sm:mb-6 lg:mb-8">
          <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
            <FaNetworkWired className="text-blue-600" size={isMobile ? 24 : 32} />
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">{t('activeDirectory.title')}</h1>
          </div>
          
          {/* Статус підключення */}
          <div className="mb-4 sm:mb-6">
            {testingConnection ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4">
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-yellow-600 mr-2 sm:mr-3"></div>
                  <span className="text-xs sm:text-sm text-yellow-800">{t('activeDirectory.connection.testing')}</span>
                </div>
              </div>
            ) : connectionStatus ? (
              <div className={`border rounded-lg p-3 sm:p-4 ${
                connectionStatus.success 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                  <div className="flex items-center">
                    <div className={`mr-2 sm:mr-3 ${
                      connectionStatus.success ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {connectionStatus.success ? (
                        <FaNetworkWired size={isMobile ? 16 : 20} />
                      ) : (
                        <FaExclamationTriangle size={isMobile ? 16 : 20} />
                      )}
                    </div>
                    <div>
                      <h3 className={`text-sm sm:text-base font-medium ${
                        connectionStatus.success ? 'text-green-800' : 'text-red-800'
                      }`}>
                        {connectionStatus.success ? t('activeDirectory.connection.connected') : t('activeDirectory.connection.error')}
                      </h3>
                      <p className={`text-xs sm:text-sm mt-1 ${
                        connectionStatus.success ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {connectionStatus.message}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={testConnection}
                    className={`text-xs sm:text-sm px-2 sm:px-3 py-1 rounded ${
                      connectionStatus.success 
                        ? 'text-green-600 hover:text-green-800' 
                        : 'text-red-600 hover:text-red-800'
                    } underline`}
                  >
                    {t('activeDirectory.testConnection')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Навігаційні таби */}
          <div className="border-b border-gray-200 overflow-x-auto">
            <nav className="-mb-px flex space-x-4 sm:space-x-8">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-1 sm:space-x-2 py-2 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon size={isMobile ? 14 : 16} />
                    <span>{tab.name}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Контент активного табу */}
        <div className="mt-4 sm:mt-6">
          {connectionStatus?.success ? (
            ActiveComponent ? <ActiveComponent /> : null
          ) : (
            <div className="bg-white rounded-lg shadow-md border p-4 sm:p-6 lg:p-8 text-center">
              <FaExclamationTriangle className="mx-auto text-gray-400 mb-3 sm:mb-4" size={isMobile ? 36 : 48} />
              <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
                {t('activeDirectory.connection.disconnected')}
              </h3>
              <p className="text-sm sm:text-base text-gray-500 mb-3 sm:mb-4">
                {t('activeDirectory.description')}
              </p>
              <button
                onClick={testConnection}
                disabled={testingConnection}
                className="bg-blue-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm sm:text-base"
              >
                {testingConnection ? t('activeDirectory.connection.testing') : t('activeDirectory.testConnection')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActiveDirectory;