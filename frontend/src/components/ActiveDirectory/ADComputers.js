import React, { useState, useEffect } from 'react';
import { FaDesktop, FaSearch, FaSync, FaCheckCircle, FaTimesCircle, FaWindows, FaLinux, FaApple } from 'react-icons/fa';
import { apiService as api } from '../../services/api';
import LoadingSpinner from '../UI/LoadingSpinner';
import { useTranslation } from 'react-i18next';

const ADComputers = () => {
  const { t } = useTranslation();
  const [computers, setComputers] = useState([]);
  const [filteredComputers, setFilteredComputers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all, enabled, disabled
  const [filterOS, setFilterOS] = useState('all'); // all, windows, linux, mac

  useEffect(() => {
    fetchComputers();
  }, []);

  useEffect(() => {
    filterComputers();
  }, [computers, searchTerm, filterStatus, filterOS]);

  const fetchComputers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getADComputers();
      
      if (response.success) {
        setComputers(response.data);
      } else {
        setError(t('activeDirectory.computers.errorGetting'));
      }
    } catch (err) {
      console.error('Error fetching AD computers:', err);
      setError(err.response?.data?.message || t('activeDirectory.computers.errorConnection'));
    } finally {
      setLoading(false);
    }
  };

  const filterComputers = () => {
    let filtered = computers;

    // Фільтр за статусом
    if (filterStatus === 'enabled') {
      filtered = filtered.filter(computer => computer.enabled);
    } else if (filterStatus === 'disabled') {
      filtered = filtered.filter(computer => !computer.enabled);
    }

    // Фільтр за ОС
    if (filterOS !== 'all') {
      filtered = filtered.filter(computer => {
        const os = computer.operatingSystem?.toLowerCase() || '';
        switch (filterOS) {
          case 'windows':
            return os.includes('windows');
          case 'linux':
            return os.includes('linux') || os.includes('ubuntu') || os.includes('centos');
          case 'mac':
            return os.includes('mac') || os.includes('darwin');
          default:
            return true;
        }
      });
    }

    // Пошук за назвою
    if (searchTerm) {
      filtered = filtered.filter(computer =>
        computer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        computer.dNSHostName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        computer.operatingSystem?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredComputers(filtered);
  };

  const getOSIcon = (operatingSystem) => {
    const os = operatingSystem?.toLowerCase() || '';
    if (os.includes('windows')) {
      return <FaWindows className="text-blue-600" />;
    } else if (os.includes('linux') || os.includes('ubuntu') || os.includes('centos')) {
      return <FaLinux className="text-orange-600" />;
    } else if (os.includes('mac') || os.includes('darwin')) {
      return <FaApple className="text-gray-600" />;
    }
    return <FaDesktop className="text-gray-600" />;
  };

  const handleRefresh = () => {
    fetchComputers();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <div className="text-red-600 mr-3">
            <FaTimesCircle size={20} />
          </div>
          <div>
            <h3 className="text-red-800 font-medium">{t('activeDirectory.computers.errorLoading')}</h3>
            <p className="text-red-600 text-sm mt-1">{error}</p>
            <button
              onClick={handleRefresh}
              className="mt-2 text-red-600 hover:text-red-800 text-sm underline"
            >
              {t('activeDirectory.computers.tryAgain')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок та кнопка оновлення */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <FaDesktop className="text-green-600" size={24} />
          <h2 className="text-2xl font-bold text-gray-800">{t('activeDirectory.computers.title')}</h2>
          <span className="bg-green-100 text-green-800 text-sm font-medium px-2.5 py-0.5 rounded">
            {filteredComputers.length} з {computers.length}
          </span>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          <FaSync />
          <span>{t('activeDirectory.computers.refresh')}</span>
        </button>
      </div>

      {/* Фільтри та пошук */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Пошук */}
          <div className="flex-1">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={t('activeDirectory.computers.search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Фільтр за статусом */}
          <div className="lg:w-48">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="all">{t('activeDirectory.computers.allComputers')}</option>
              <option value="enabled">{t('activeDirectory.computers.activeComputers')}</option>
              <option value="disabled">{t('activeDirectory.computers.inactiveComputers')}</option>
            </select>
          </div>

          {/* Фільтр за ОС */}
          <div className="lg:w-48">
            <select
              value={filterOS}
              onChange={(e) => setFilterOS(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="all">{t('activeDirectory.computers.allOS')}</option>
              <option value="windows">{t('activeDirectory.computers.windows')}</option>
              <option value="linux">{t('activeDirectory.computers.linux')}</option>
              <option value="mac">{t('activeDirectory.computers.macOS')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Список комп'ютерів */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {filteredComputers.length === 0 ? (
          <div className="text-center py-12">
            <FaDesktop className="mx-auto text-gray-400 mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('activeDirectory.computers.noComputersFound')}</h3>
            <p className="text-gray-500">
              {searchTerm || filterStatus !== 'all' || filterOS !== 'all'
                ? t('activeDirectory.computers.changeSearchCriteria')
                : t('activeDirectory.computers.noAvailableComputers')
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('activeDirectory.computers.computer')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('activeDirectory.computers.dnsName')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('activeDirectory.computers.operatingSystem')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('activeDirectory.computers.osVersion')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('activeDirectory.computers.status')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('activeDirectory.computers.lastLogin')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredComputers.map((computer, index) => (
                  <tr key={`computer-${index}-${computer.name}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                            {getOSIcon(computer.operatingSystem)}
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {computer.name || t('activeDirectory.computers.unknown')}
                          </div>
                          <div className="text-sm text-gray-500">
                            {computer.description || t('activeDirectory.computers.noDescription')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {computer.dNSHostName || t('activeDirectory.computers.notSpecified')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {computer.operatingSystem || t('activeDirectory.computers.unknown')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {computer.operatingSystemVersion || t('activeDirectory.computers.notSpecified')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        computer.enabled 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {computer.enabled ? (
                          <>
                            <FaCheckCircle className="mr-1" />
                            {t('activeDirectory.computers.active')}
                          </>
                        ) : (
                          <>
                            <FaTimesCircle className="mr-1" />
                            {t('activeDirectory.computers.inactive')}
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {computer.lastLogon 
                        ? new Date(computer.lastLogon).toLocaleDateString('uk-UA')
                        : t('activeDirectory.computers.unknown')
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ADComputers;