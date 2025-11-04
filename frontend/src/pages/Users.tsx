import React, { useEffect, useState } from 'react';
import { Plus, Search, Edit, Trash2, User, Shield, Mail, UserX, UserCheck, Building, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import UserForm, { UserFormData } from '../components/UserForm';
import UserDetailsModal from '../components/UserDetailsModal';
import ConfirmationModal from '../components/UI/ConfirmationModal';
import { useUsers, useCities, useDeactivatedUsers, useWindowSize } from '../hooks';
import { usePositions } from '../hooks/usePositions';
import { useConfirmation } from '../hooks/useConfirmation';
import { User as UserType, UserRole, City } from '../types';
import { apiService } from '../services/api';
import { cn } from '../utils';

const Users: React.FC = () => {
  const { t } = useTranslation();
  const { width } = useWindowSize();
  const isMobile = width < 768;
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined);
  const { users, isLoading, error, refetch: refetchUsers, forceDeleteUser } = useUsers(activeFilter);
  const { cities, isLoading: citiesLoading, error: citiesError, refetch: refetchCities } = useCities();
  const { positions, loading: positionsLoading } = usePositions();
  const { confirmationState, showConfirmation, hideConfirmation } = useConfirmation();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  
  // Стани для деталей користувача
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [selectedUserForDetails, setSelectedUserForDetails] = useState<UserType | null>(null);
  
  // Стани для масових операцій
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);



  // Стани для деактивованих користувачів
  const [showDeactivatedUsers, setShowDeactivatedUsers] = useState(false);
  const { 
    deactivatedUsers, 
    isLoading: deactivatedUsersLoading, 
    error: deactivatedUsersError,
    activateUser,
    refetch: refetchDeactivatedUsers 
  } = useDeactivatedUsers();

  useEffect(() => {
    refetchUsers();
    refetchCities();
  }, []);

  const filteredUsers = (users || []).filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (user.firstName && user.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (user.lastName && user.lastName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  const handleUserSubmit = async (userData: UserFormData) => {
    setFormLoading(true);
    try {
      if (editingUser) {
        // Оновлення користувача
        await apiService.updateUser(editingUser._id, userData);
      } else {
        // Створення нового користувача
        await apiService.createUser(userData);
      }
      
      // Оновлюємо список користувачів
      await refetchUsers(activeFilter);
      
      // Закриваємо форму
      setShowForm(false);
      setEditingUser(null);
    } catch (error: any) {
      console.error(t('users.errors.saveError'), error);
      
      // Отримуємо конкретне повідомлення про помилку з API
      let errorMessage = t('users.errors.saveErrorMessage');
      
      if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      alert(errorMessage);
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (user: UserType) => {
    setEditingUser(user);
    setShowForm(true);
  };

  const handleViewDetails = async (user: UserType) => {
    try {
      // Відкриваємо модал одразу з наявними даними для швидкої відповіді UI
      setSelectedUserForDetails(user);
      setShowUserDetails(true);
      // Підвантажуємо повні дані користувача (включаючи devices)
      const res = await apiService.getUserById(user._id);
      if (res?.data) {
        setSelectedUserForDetails(res.data);
      }
    } catch (e) {
      console.error(t('users.errors.loadDetailsError'), e);
    }
  };

  const handleCloseDetails = () => {
    setShowUserDetails(false);
    setSelectedUserForDetails(null);
  };

  const handleToggleActive = async (userId: string, userEmail: string, isActive: boolean) => {
    showConfirmation({
      title: isActive ? t('users.deactivateUserTitle') : t('users.activateUserTitle'),
      message: isActive ? t('users.deactivateUserConfirmation', { email: userEmail }) : t('users.activateUserConfirmation', { email: userEmail }),
      type: isActive ? 'danger' : 'warning',
      confirmText: isActive ? t('users.deactivate') : t('users.activate'),
      cancelText: t('common.cancel'),
      onConfirm: async () => {
        try {
          const response = await apiService.toggleUserActive(userId);
          await refetchUsers(activeFilter);
          hideConfirmation();
          alert(isActive ? t('users.deactivateUserSuccess', { email: userEmail }) : t('users.activateUserSuccess', { email: userEmail }));
        } catch (error: any) {
          console.error(`Помилка ${isActive ? 'деактивації' : 'активації'} користувача:`, error);
          const errorMessage = error?.response?.data?.message || error?.message || t('users.unknownError');
          alert(`${isActive ? t('users.deactivateUserError') : t('users.activateUserError')}: ${errorMessage}`);
          hideConfirmation();
        }
      },
      onCancel: hideConfirmation
    });
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    showConfirmation({
      title: t('users.deleteUser'),
      message: t('users.deleteConfirmation', { email: userEmail }),
      type: 'danger',
      confirmText: t('users.delete'),
      cancelText: t('common.cancel'),
      onConfirm: async () => {
        try {
          const response = await apiService.deleteUser(userId);
          await refetchUsers(activeFilter);
          hideConfirmation();
          alert(t('users.deleteSuccess', { email: userEmail }));
        } catch (error: any) {
          console.error('Помилка видалення користувача:', error);
          const errorMessage = error?.response?.data?.message || error?.message || t('users.unknownError');
          alert(`${t('users.deleteError')}: ${errorMessage}`);
          hideConfirmation();
        }
      },
      onCancel: hideConfirmation
    });
  };

  const handleForceDelete = async (userId: string, userEmail: string) => {
    showConfirmation({
      title: t('users.forceDeleteTitle'),
      message: t('users.forceDeleteMessage', { email: userEmail }).replace(/\\n/g, '\n'),
      type: 'danger',
      confirmText: t('users.forceDeleteConfirm'),
      cancelText: t('common.cancel'),
      onConfirm: async () => {
         try {
           const response = await forceDeleteUser(userId);
           hideConfirmation();
           alert(t('users.forceDeleteSuccess', { email: userEmail }));
         } catch (error: any) {
           console.error('Помилка повного видалення користувача:', error);
           const errorMessage = error?.response?.data?.message || error?.message || t('users.unknownError');
           alert(`${t('users.forceDeleteError')}: ${errorMessage}`);
           hideConfirmation();
         }
       },
      onCancel: hideConfirmation
    });
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setShowForm(true);
  };

  const handleActivateUser = async (userId: string, userEmail: string) => {
    showConfirmation({
      title: t('users.activateUserTitle'),
      message: t('users.activateUserConfirmation', { email: userEmail }),
      type: 'warning',
      confirmText: t('users.activate'),
      cancelText: t('common.cancel'),
      onConfirm: async () => {
        try {
          await activateUser(userId);
          await refetchUsers(activeFilter); // Оновлюємо основний список
          hideConfirmation();
          alert(t('users.activateUserSuccess', { email: userEmail }));
        } catch (error: any) {
          console.error(t('users.activateUserError'), error);
          const errorMessage = error?.response?.data?.message || error?.message || t('users.unknownError');
          alert(`${t('users.activateUserError')}: ${errorMessage}`);
          hideConfirmation();
        }
      },
      onCancel: hideConfirmation
    });
  };

  const getCityName = (cityData: string | City) => {
    if (!cityData) {
      return t('users.notSpecified');
    }
    
    if (typeof cityData === 'string') {
      // Перевіряємо чи масив міст завантажений
      if (!cities || cities.length === 0) {
        return t('users.loading');
      }
      const city = cities.find(c => c._id === cityData);
      return city ? city.name : t('users.unknownCity');
    }
    
    // Якщо cityData є об'єктом, перевіряємо чи він має властивість name
    return cityData && cityData.name ? cityData.name : t('users.unknownCity');
  };

  // Функції для масових операцій
  const handleSelectUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map(user => user._id)));
    }
  };

  const handleBulkAction = async (action: 'activate' | 'deactivate') => {
    if (selectedUsers.size === 0) {
      alert(t('users.selectUsers'));
      return;
    }

    const actionText = action === 'activate' ? t('users.activate') : t('users.deactivate');
    const actionPastText = action === 'activate' ? t('users.successActivated', { count: selectedUsers.size }) : t('users.successDeactivated', { count: selectedUsers.size });
    
    showConfirmation({
      title: action === 'activate' ? t('users.activateUsers') : t('users.deactivateUsers'),
      message: action === 'activate' ? t('users.activateConfirmation', { count: selectedUsers.size }) : t('users.deactivateConfirmation', { count: selectedUsers.size }),
      type: action === 'deactivate' ? 'danger' : 'warning',
      confirmText: action === 'activate' ? t('users.activateButton') : t('users.deactivateButton'),
      cancelText: t('users.cancel'),
      onConfirm: async () => {
        setBulkLoading(true);
        try {
          const userIds = Array.from(selectedUsers);
          await apiService.bulkToggleUsers(userIds, action);
          await refetchUsers(activeFilter);
          setSelectedUsers(new Set());
          hideConfirmation();
          alert(actionPastText);
        } catch (error: any) {
          const errorMessage = error?.response?.data?.message || error?.message || t('users.unknownError');
          alert(`${action === 'activate' ? t('users.errorBulkActivation') : t('users.errorBulkDeactivation')} ${errorMessage}`);
          hideConfirmation();
        } finally {
          setBulkLoading(false);
        }
      },
      onCancel: hideConfirmation
    });
  };

  const handleActiveFilterChange = (value: string) => {
    let newFilter: boolean | undefined;
    if (value === 'active') newFilter = true;
    else if (value === 'inactive') newFilter = false;
    else newFilter = undefined;
    
    setActiveFilter(newFilter);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t('users.title')}</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            {t('users.description', { count: users?.length || 0 })}
            {selectedUsers.size > 0 && (
              <span className="ml-2 text-primary font-medium">
                {t('users.selected', { count: selectedUsers.size })}
              </span>
            )}
          </p>
        </div>
        <div className="mt-2 sm:mt-0 flex flex-col sm:flex-row gap-2">
          {selectedUsers.size > 0 && (
            <>
              <Button
                variant="outline"
                onClick={() => handleBulkAction('activate')}
                disabled={bulkLoading}
                className="text-green-600 border-green-600 hover:bg-green-50"
              >
                <UserCheck className="h-4 w-4 mr-2" />
                {t('users.bulkActivate', { count: selectedUsers.size })}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleBulkAction('deactivate')}
                disabled={bulkLoading}
                className="text-red-600 border-red-600 hover:bg-red-50"
              >
                <UserX className="h-4 w-4 mr-2" />
                {t('users.bulkDeactivate', { count: selectedUsers.size })}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => setShowDeactivatedUsers(!showDeactivatedUsers)}
            className="flex items-center gap-2"
          >
            {showDeactivatedUsers ? (
              <>
                <EyeOff className="h-4 w-4" />
                {t('users.hideDeactivated')}
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                {t('users.showDeactivated', { count: deactivatedUsers.length })}
              </>
            )}
          </Button>
          <Button onClick={handleAddUser}>
            <Plus className="h-4 w-4 mr-2" />
            {t('users.addUser')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <Input
              type="text"
              placeholder={t('users.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
            
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
              className="px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base rounded-lg border border-border bg-surface text-foreground shadow-sm focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="all">{t('users.allRoles')}</option>
              <option value={UserRole.ADMIN}>{t('users.administrator')}</option>
              <option value={UserRole.USER}>{t('users.user')}</option>
            </select>

            <select
              value={activeFilter === undefined ? 'all' : activeFilter ? 'active' : 'inactive'}
              onChange={(e) => handleActiveFilterChange(e.target.value)}
              className="px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base rounded-lg border border-border bg-surface text-foreground shadow-sm focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="all">{t('users.allUsers')}</option>
              <option value="active">{t('users.active')}</option>
              <option value="inactive">{t('users.inactive')}</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* User Form Modal */}
      {showForm && (
        <UserForm
          user={editingUser}
          cities={cities}
          positions={positions}
          isOpen={showForm}
          onClose={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
          isLoading={formLoading}
          onSubmit={handleUserSubmit}
        />
      )}

      {/* Деактивовані користувачі */}
      {showDeactivatedUsers && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <UserX className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />
                <h2 className="text-lg sm:text-xl font-semibold text-gray-800">
                  {t('users.deactivatedUsers')}
                </h2>
                <span className="bg-red-100 text-red-800 text-xs sm:text-sm px-2 py-1 rounded-full">
                  {deactivatedUsers.length}
                </span>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-4 sm:p-6">
            {deactivatedUsersLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : deactivatedUsersError ? (
              <div className="text-center py-8 text-red-500">
                <UserX className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-4 text-red-300" />
                <p className="text-sm sm:text-base">{t('users.errorLoadingDeactivated')}</p>
                <p className="text-xs sm:text-sm mt-2">{deactivatedUsersError}</p>
              </div>
            ) : deactivatedUsers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <UserCheck className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-sm sm:text-base">{t('users.noDeactivatedUsers')}</p>
              </div>
            ) : isMobile ? (
              // Mobile Card View
              <div className="space-y-3 sm:space-y-4">
                {deactivatedUsers.map((user) => (
                  <Card key={user._id} className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-3 sm:p-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center flex-1 min-w-0">
                            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-gray-400 flex items-center justify-center mr-3 flex-shrink-0">
                              <User className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm sm:text-base font-medium text-gray-900 truncate">
                                {user.firstName && user.lastName 
                                  ? `${user.firstName} ${user.lastName}` 
                                  : user.email}
                              </div>
                              <div className="text-xs sm:text-sm text-gray-500 truncate">{user.email}</div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                          <span className={cn(
                            "inline-flex items-center px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium",
                            user.role === UserRole.ADMIN 
                              ? "bg-purple-100 text-purple-800" 
                              : "bg-blue-100 text-blue-800"
                          )}>
                            {user.role === UserRole.ADMIN ? (
                              <>
                                <Shield className="h-3 w-3 mr-1" />
                                {t('users.administrator')}
                              </>
                            ) : (
                              <>
                                <User className="h-3 w-3 mr-1" />
                                {t('users.user')}
                              </>
                            )}
                          </span>
                        </div>
                        
                        <div className="space-y-1 text-xs sm:text-sm text-gray-600">
                          <div>
                            <span className="font-medium">{t('users.position')}:</span>{' '}
                            {user.position && typeof user.position === 'object' && user.position.title
                              ? user.position.title
                              : t('users.notSpecified')}
                          </div>
                          <div>
                            <span className="font-medium">{t('users.city')}:</span>{' '}
                            {getCityName(user.city)}
                          </div>
                          <div>
                            <span className="font-medium">{t('users.deactivatedDate')}:</span>{' '}
                            {user.updatedAt 
                              ? new Date(user.updatedAt).toLocaleDateString('uk-UA')
                              : t('users.notSpecified')}
                          </div>
                        </div>
                        
                        <div className="pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleActivateUser(user._id, user.email)}
                            className="w-full sm:w-auto text-green-600 border-green-600 hover:bg-green-50"
                          >
                            <UserCheck className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                            {t('users.activate')}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              // Desktop Table View
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-medium text-gray-700">{t('users.userColumn')}</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700">{t('users.roleColumn')}</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700">{t('users.positionColumn')}</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700">{t('users.cityColumn')}</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700">{t('users.deactivationDate')}</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-700">{t('users.actionsColumn')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deactivatedUsers.map((user) => (
                      <tr key={user._id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="flex items-center">
                            <div className="h-10 w-10 rounded-full bg-gray-400 flex items-center justify-center mr-4">
                              <User className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {user.firstName && user.lastName 
                                  ? `${user.firstName} ${user.lastName}` 
                                  : user.email}
                              </div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                            user.role === UserRole.ADMIN 
                              ? "bg-purple-100 text-purple-800" 
                              : "bg-blue-100 text-blue-800"
                          )}>
                            {user.role === UserRole.ADMIN ? (
                              <>
                                <Shield className="h-3 w-3 mr-1" />
                                {t('users.administrator')}
                              </>
                            ) : (
                              <>
                                <User className="h-3 w-3 mr-1" />
                                {t('users.user')}
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-gray-700">
                            {user.position && typeof user.position === 'object' && user.position.title
                              ? user.position.title
                              : t('users.notSpecified')}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-gray-700">
                            {getCityName(user.city)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-gray-500">
                            {user.updatedAt 
                              ? new Date(user.updatedAt).toLocaleDateString('uk-UA')
                              : t('users.notSpecified')
                            }
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleActivateUser(user._id, user.email)}
                            className="text-green-600 border-green-600 hover:bg-green-50"
                          >
                            <UserCheck className="h-4 w-4 mr-1" />
                            {t('users.activate')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Users List */}
      <Card>
        <CardContent className="p-0">
          {filteredUsers.length === 0 ? (
            <div className="text-center py-8 sm:py-12 px-4">
              <User className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
                {t('users.noUsersFound')}
              </h3>
              <p className="text-sm sm:text-base text-gray-500">
                {searchTerm ? t('users.tryDifferentSearch') : t('users.addFirstUser')}
              </p>
            </div>
          ) : isMobile ? (
            // Mobile Card View
            <div className="space-y-3 sm:space-y-4 p-3 sm:p-4">
              {/* Select All Checkbox for Mobile */}
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <input
                  type="checkbox"
                  checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                  onChange={handleSelectAll}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                />
                <span className="text-sm font-medium text-gray-700">
                  {t('users.selectAll')}
                </span>
                {selectedUsers.size > 0 && (
                  <span className="text-xs text-primary font-medium">
                    ({selectedUsers.size} {t('users.selected')})
                  </span>
                )}
              </div>
              
              {filteredUsers.map((user) => (
                <Card key={user._id} className={cn("hover:shadow-lg transition-shadow", !user.isActive && "opacity-75")}>
                  <CardContent className="p-3 sm:p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedUsers.has(user._id)}
                            onChange={() => handleSelectUser(user._id)}
                            className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded mr-3 flex-shrink-0"
                          />
                          <div className={cn(
                            "h-10 w-10 sm:h-12 sm:w-12 rounded-full flex items-center justify-center mr-3 flex-shrink-0",
                            user.isActive ? "bg-primary" : "bg-gray-400"
                          )}>
                            <User className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm sm:text-base font-medium text-gray-900 truncate">
                              {user.firstName && user.lastName 
                                ? `${user.firstName} ${user.lastName}` 
                                : user.email}
                            </div>
                            <div className="text-xs sm:text-sm text-gray-500 truncate">
                              {user.email}
                            </div>
                            {user.telegramId && (
                              <div className="text-xs text-blue-600 mt-1">
                                {t('users.telegramConnected')}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(user)}
                            title={t('users.viewDetails')}
                            className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                          >
                            <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(user)}
                            className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                          >
                            <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium',
                            user.role === UserRole.ADMIN
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-gray-100 text-gray-800'
                          )}
                        >
                          {user.role === UserRole.ADMIN ? (
                            <>
                              <Shield className="h-3 w-3 mr-1" />
                              {t('users.administrator')}
                            </>
                          ) : (
                            <>
                              <User className="h-3 w-3 mr-1" />
                              {t('users.user')}
                            </>
                          )}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium',
                            user.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          )}
                        >
                          {user.isActive ? (
                            <>
                              <UserCheck className="h-3 w-3 mr-1" />
                              {t('users.active')}
                            </>
                          ) : (
                            <>
                              <UserX className="h-3 w-3 mr-1" />
                              {t('users.inactive')}
                            </>
                          )}
                        </span>
                      </div>
                      
                      <div className="space-y-1 text-xs sm:text-sm text-gray-600">
                        <div>
                          <span className="font-medium">{t('users.position')}:</span>{' '}
                          {typeof user.position === 'object' && user.position && user.position.title 
                            ? user.position.title 
                            : (typeof user.position === 'string' ? user.position : t('users.notSpecified'))}
                        </div>
                        <div>
                          <span className="font-medium">{t('users.city')}:</span>{' '}
                          {getCityName(user.city)}
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(user._id, user.email, user.isActive)}
                          className={cn(
                            "flex-1 sm:flex-none text-xs sm:text-sm",
                            user.isActive 
                              ? "text-red-600 hover:text-red-700" 
                              : "text-green-600 hover:text-green-700"
                          )}
                        >
                          {user.isActive ? (
                            <>
                              <UserX className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                              {t('users.deactivate')}
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                              {t('users.activate')}
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleForceDelete(user._id, user.email)}
                          className="flex-1 sm:flex-none text-xs sm:text-sm text-red-800 hover:text-red-900 hover:bg-red-50"
                          title={t('users.forceDeleteUser')}
                        >
                          <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                          {t('users.delete')}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            // Desktop Table View
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                        onChange={handleSelectAll}
                        className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                      />
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('users.user')}
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('users.role')}
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('users.position')}
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('users.city')}
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('users.status')}
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('users.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUsers.map((user) => (
                    <tr key={user._id} className={cn("hover:bg-gray-50", !user.isActive && "bg-gray-50 opacity-75")}>
                      <td className="px-4 sm:px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedUsers.has(user._id)}
                          onChange={() => handleSelectUser(user._id)}
                          className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center">
                          <div className={cn(
                            "h-10 w-10 rounded-full flex items-center justify-center mr-4",
                            user.isActive ? "bg-primary" : "bg-gray-400"
                          )}>
                            <User className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {user.firstName && user.lastName 
                                ? `${user.firstName} ${user.lastName}` 
                                : user.email}
                            </div>
                            <div className="text-xs text-gray-500">
                              {user.email}
                            </div>
                            {user.telegramId && (
                              <div className="text-xs text-blue-600">
                                {t('users.telegramConnected')}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <span
                          className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                            user.role === UserRole.ADMIN
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-gray-100 text-gray-800'
                          )}
                        >
                          {user.role === UserRole.ADMIN ? (
                            <>
                              <Shield className="h-3 w-3 mr-1" />
                              {t('users.administrator')}
                            </>
                          ) : (
                            <>
                              <User className="h-3 w-3 mr-1" />
                              {t('users.user')}
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-500">
                        {typeof user.position === 'object' && user.position && user.position.title 
                          ? user.position.title 
                          : (typeof user.position === 'string' ? user.position : t('users.notSpecified'))}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-500">
                        {getCityName(user.city)}
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <span
                          className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                            user.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          )}
                        >
                          {user.isActive ? (
                            <>
                              <UserCheck className="h-3 w-3 mr-1" />
                              {t('users.active')}
                            </>
                          ) : (
                            <>
                              <UserX className="h-3 w-3 mr-1" />
                              {t('users.inactive')}
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(user)}
                            title={t('users.viewDetails')}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(user)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(user._id, user.email, user.isActive)}
                            className={cn(
                              user.isActive 
                                ? "text-red-600 hover:text-red-700" 
                                : "text-green-600 hover:text-green-700"
                            )}
                          >
                            {user.isActive ? (
                              <UserX className="h-4 w-4" />
                            ) : (
                              <UserCheck className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleForceDelete(user._id, user.email)}
                            className="text-red-800 hover:text-red-900 hover:bg-red-50"
                            title={t('users.forceDeleteUser')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>



      {/* User Details Modal */}
      <UserDetailsModal
        isOpen={showUserDetails}
        onClose={handleCloseDetails}
        user={selectedUserForDetails}
      />

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmationState.isOpen}
        title={confirmationState.title}
        message={confirmationState.message}
        type={confirmationState.type}
        confirmText={confirmationState.confirmText}
        cancelText={confirmationState.cancelText}
        onConfirm={confirmationState.onConfirm}
        onCancel={confirmationState.onCancel}
      />
    </div>
  );
};

export default Users;