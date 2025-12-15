import React, { useState, useEffect } from 'react';
import { FaUser, FaSearch, FaSync, FaUserCheck, FaUserTimes } from 'react-icons/fa';
import { apiService as api } from '../../services/api';
import LoadingSpinner from '../UI/LoadingSpinner';
import Pagination from '../UI/Pagination';
import { useTranslation } from 'react-i18next';
import { useWindowSize } from '../../hooks';
import Card, { CardContent } from '../UI/Card';

const ADUsers = () => {
  const { t } = useTranslation();
  const { width } = useWindowSize();
  const isMobile = width < 768;
  const [currentPage, setCurrentPage] = useState(1);
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all, enabled, disabled
  const itemsPerPage = 20;

  useEffect(() => {
    fetchUsers();
  }, [currentPage, searchTerm, filterStatus]);

  // Скидаємо сторінку на 1 при зміні пошуку або фільтрів
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getADUsers({
        page: currentPage,
        limit: itemsPerPage,
        search: searchTerm || undefined,
        filterStatus: filterStatus !== 'all' ? filterStatus : undefined
      });
      
      if (response.success) {
        setUsers(response.data || []);
        // Оновлюємо пагінацію з відповіді
        if (response.pagination) {
          setPagination(response.pagination);
        } else {
          setPagination(null);
        }
      } else {
        setError('Помилка отримання користувачів');
        setUsers([]);
        setPagination(null);
      }
    } catch (err) {
      console.error('Error fetching AD users:', err);
      
      let errorMessage = 'Помилка підключення до сервера';
      
      if (err.response) {
        // Сервер відповів з помилкою
        const status = err.response.status;
        const message = err.response.data?.message;
        
        switch (status) {
          case 401:
            errorMessage = 'Помилка авторизації. Увійдіть в систему знову.';
            break;
          case 403:
            errorMessage = 'Недостатньо прав для доступу до Active Directory.';
            break;
          case 500:
            if (message && message.includes('LDAP')) {
              errorMessage = 'Помилка підключення до Active Directory сервера. Перевірте налаштування мережі.';
            } else {
              errorMessage = message || 'Внутрішня помилка сервера.';
            }
            break;
          case 503:
            errorMessage = 'Сервіс Active Directory тимчасово недоступний.';
            break;
          default:
            errorMessage = message || `Помилка сервера (${status})`;
        }
      } else if (err.request) {
        // Запит був відправлений, але відповіді не отримано
        errorMessage = 'Сервер не відповідає. Перевірте підключення до мережі.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchUsers();
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
            <FaUserTimes size={20} />
          </div>
          <div>
            <h3 className="text-red-800 font-medium">{t('activeDirectory.users.errorTitle')}</h3>
            <p className="text-red-600 text-sm mt-1">{error}</p>
            <button
              onClick={handleRefresh}
              className="mt-2 text-red-600 hover:text-red-800 text-sm underline"
            >
              {t('activeDirectory.users.tryAgain')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Заголовок та кнопка оновлення */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
        <div className="flex items-center space-x-2 flex-wrap">
          <FaUser className="text-blue-600" size={isMobile ? 20 : 24} />
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-800">{t('activeDirectory.users.title')}</h2>
          <span className="bg-blue-100 text-blue-800 text-xs sm:text-sm font-medium px-2 sm:px-2.5 py-0.5 rounded">
            {pagination?.totalItems || users.length} {t('activeDirectory.users.total')}
          </span>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center space-x-2 bg-blue-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base"
        >
          <FaSync size={isMobile ? 14 : 16} />
          <span>{t('activeDirectory.refresh')}</span>
        </button>
      </div>

      {/* Фільтри та пошук */}
      <div className="bg-white p-3 sm:p-4 rounded-lg shadow-md border">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          {/* Пошук */}
          <div className="flex-1">
            <div className="relative">
              <FaSearch className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={isMobile ? 14 : 16} />
              <input
                type="text"
                placeholder={t('activeDirectory.users.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-1.5 sm:py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Фільтр за статусом */}
          <div className="w-full sm:w-48">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-1.5 sm:py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">{t('activeDirectory.users.allUsers')}</option>
              <option value="enabled">{t('activeDirectory.users.activeUsers')}</option>
              <option value="disabled">{t('activeDirectory.users.inactiveUsers')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Список користувачів */}
      <div className="bg-white rounded-lg shadow-md border overflow-hidden">
        {users.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <FaUser className="mx-auto text-gray-400 mb-3 sm:mb-4" size={isMobile ? 36 : 48} />
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">{t('activeDirectory.users.noUsersFound')}</h3>
            <p className="text-sm sm:text-base text-gray-500">
              {searchTerm || filterStatus !== 'all' 
                ? t('activeDirectory.users.changeSearchCriteria')
                : t('activeDirectory.users.noAvailableUsers')
              }
            </p>
          </div>
        ) : isMobile ? (
          // Мобільний вигляд з картками
          <div className="divide-y divide-gray-200">
                {users.map((user, index) => (
              <Card key={`user-${index}-${user.sAMAccountName || user.username}`} className="border-0 rounded-none shadow-none">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 h-10 w-10">
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <FaUser className="text-blue-600" size={16} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {user.displayName || user.cn || t('activeDirectory.users.unknown')}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {user.title || t('activeDirectory.users.positionNotSpecified')}
                          </div>
                        </div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ml-2 flex-shrink-0 ${
                          user.enabled 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {user.enabled ? (
                            <>
                              <FaUserCheck className="mr-1" size={10} />
                              {t('activeDirectory.users.active')}
                            </>
                          ) : (
                            <>
                              <FaUserTimes className="mr-1" size={10} />
                              {t('activeDirectory.users.inactive')}
                            </>
                          )}
                        </span>
                      </div>
                      <div className="space-y-1 text-xs sm:text-sm">
                        <div className="flex items-center text-gray-600">
                          <span className="font-medium mr-2">{t('activeDirectory.users.loginColumn')}:</span>
                          <span className="text-gray-900 truncate">{user.username || user.sAMAccountName || t('activeDirectory.users.unknown')}</span>
                        </div>
                        <div className="flex items-center text-gray-600">
                          <span className="font-medium mr-2">{t('activeDirectory.users.emailColumn')}:</span>
                          <span className="text-gray-900 truncate">{user.email || user.mail || t('activeDirectory.users.notSpecified')}</span>
                        </div>
                        <div className="flex items-center text-gray-600">
                          <span className="font-medium mr-2">{t('activeDirectory.users.departmentColumn')}:</span>
                          <span className="text-gray-900">{user.department || t('activeDirectory.users.notSpecified')}</span>
                        </div>
                        <div className="flex items-center text-gray-600">
                          <span className="font-medium mr-2">{t('activeDirectory.users.lastLoginColumn')}:</span>
                          <span className="text-gray-900">
                            {user.lastLogon 
                              ? new Date(user.lastLogon).toLocaleDateString('uk-UA')
                              : t('activeDirectory.users.unknown')
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          // Десктопний вигляд з таблицею
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('activeDirectory.users.userColumn')}
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('activeDirectory.users.loginColumn')}
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('activeDirectory.users.emailColumn')}
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('activeDirectory.users.departmentColumn')}
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('activeDirectory.users.statusColumn')}
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('activeDirectory.users.lastLoginColumn')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user, index) => (
                  <tr key={`user-${index}-${user.sAMAccountName || user.username}`} className="hover:bg-gray-50">
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <FaUser className="text-blue-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.displayName || user.cn || t('activeDirectory.users.unknown')}
                          </div>
                          <div className="text-sm text-gray-500">
                            {user.title || t('activeDirectory.users.positionNotSpecified')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.username || user.sAMAccountName || t('activeDirectory.users.unknown')}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.email || user.mail || t('activeDirectory.users.notSpecified')}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.department || t('activeDirectory.users.notSpecified')}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.enabled 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {user.enabled ? (
                          <>
                            <FaUserCheck className="mr-1" />
                            {t('activeDirectory.users.active')}
                          </>
                        ) : (
                          <>
                            <FaUserTimes className="mr-1" />
                            {t('activeDirectory.users.inactive')}
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.lastLogon 
                        ? new Date(user.lastLogon).toLocaleDateString('uk-UA')
                        : t('activeDirectory.users.unknown')
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="p-4 border-t border-gray-200">
            <Pagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={(page) => {
                setCurrentPage(page);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ADUsers;