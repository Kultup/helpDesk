import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Plus, 
  Search, 
  Filter, 
  Download,
  Eye,
  Edit,
  Trash2,
  CheckSquare,
  Square
} from 'lucide-react';
import Card, { CardContent } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import ConfirmationModal from '../components/UI/ConfirmationModal';
import Pagination from '../components/UI/Pagination';
import { TicketRating } from '../components/UI';
import CreateTicketModal from '../components/CreateTicketModal';
import ExportTicketsModal from '../components/ExportTicketsModal';
import { useTickets, useCities, useUsers, useWindowSize } from '../hooks';
import { useConfirmation } from '../hooks/useConfirmation';
import { useTicketExport } from '../hooks/useTicketExport';
import { TicketStatus, TicketPriority, TicketFilters } from '../types';
import { getStatusColor, getPriorityColor, formatDate, formatDaysAgo, cn } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, isAdminRole } from '../types';
import DayIndicator from '../components/DayIndicator';
import { apiService } from '../services/api';

const Tickets: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { width } = useWindowSize();
  const [searchParams] = useSearchParams();
  const isMobile = width < 768;
  const isAdmin = user ? isAdminRole(user.role as UserRole) : false;
  const basePath = isAdmin ? '/admin' : '';
  
  const {
    tickets,
    pagination,
    filters,
    sort,
    totalPages,
    total,
    isLoading,
    updateFilters,
    updatePagination,
    updateSort,
    deleteTicket,
    refetch
  } = useTickets();
  const { confirmationState, showConfirmation, hideConfirmation } = useConfirmation();
  const { cities } = useCities();
  const { users } = useUsers();
  const { exportTickets } = useTicketExport();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | 'all'>('all');
  const [sortBy, setSortBy] = useState<'createdAt' | 'title' | 'status'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set());

  // Обробка URL параметрів при завантаженні сторінки
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam) {
      // Використовуємо enum значення для перевірки
      const validStatuses: string[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED, TicketStatus.CLOSED];
      if (validStatuses.includes(statusParam)) {
        // Встановлюємо фільтр з URL параметра
        setStatusFilter(statusParam as TicketStatus);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Запускається тільки при першому завантаженні сторінки

  // Встановлюємо більший ліміт для адміністратора та завантажуємо тікети
  useEffect(() => {
    if (isAdmin) {
      updatePagination({ page: 1, limit: 50 });
    }
  }, [isAdmin, updatePagination]);

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, pagination, sort]);

  useEffect(() => {
    const newFilters: Partial<TicketFilters> = {};
    if (searchTerm) newFilters.search = searchTerm;
    if (statusFilter !== 'all') newFilters.status = [statusFilter as TicketStatus];
    if (priorityFilter !== 'all') newFilters.priority = [priorityFilter as TicketPriority];
    
    updateFilters(newFilters);
    updatePagination({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, statusFilter, priorityFilter]);

  useEffect(() => {
    updateSort({ field: sortBy, direction: sortOrder });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortOrder]);


  const handlePageChange = (page: number): void => {
    updatePagination({ page });
  };

  const handleCreateTicketSuccess = (): void => {
    refetch(); // Оновлюємо список тікетів
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Використовуємо тікети безпосередньо з API, оскільки фільтрація та сортування відбувається на backend
  const displayTickets = tickets || [];

  const handleDelete = async (ticketId: string, ticketTitle: string): Promise<void> => {
    showConfirmation({
      title: t('tickets.deleteConfirmation.title'),
      message: t('tickets.deleteConfirmation.message', { title: ticketTitle }),
      type: 'danger',
      confirmText: t('tickets.deleteConfirmation.confirm'),
      cancelText: t('tickets.deleteConfirmation.cancel'),
      onConfirm: async () => {
        try {
          await deleteTicket(ticketId);
          hideConfirmation();
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(t('tickets.errors.deleteError'), error);
        }
      },
      onCancel: hideConfirmation
    });
  };

  const handleExportClick = (): void => {
    setIsExportModalOpen(true);
  };

  // Обробка вибору/зняття вибору заявки
  const handleToggleSelect = (ticketId: string): void => {
    setSelectedTickets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(ticketId)) {
        newSet.delete(ticketId);
      } else {
        newSet.add(ticketId);
      }
      return newSet;
    });
  };

  // Обробка вибору всіх заявок на поточній сторінці
  const handleSelectAll = (): void => {
    if (selectedTickets.size === displayTickets.length && 
        displayTickets.every(t => selectedTickets.has(t._id))) {
      // Зняти вибір з усіх
      setSelectedTickets(new Set());
    } else {
      // Вибрати всі на поточній сторінці
      setSelectedTickets(new Set(displayTickets.map(t => t._id)));
    }
  };

  // Масове видалення заявок
  const handleBulkDelete = async (): Promise<void> => {
    if (selectedTickets.size === 0) return;

    const selectedTicketsArray = Array.from(selectedTickets);
    const selectedTicketsData = displayTickets.filter(t => selectedTicketsArray.includes(t._id));
    
    showConfirmation({
      title: 'Видалити вибрані заявки?',
      message: `Ви впевнені, що хочете видалити ${selectedTickets.size} заявок? Цю дію неможливо скасувати.`,
      type: 'danger',
      confirmText: 'Видалити',
      cancelText: 'Скасувати',
      onConfirm: async () => {
        try {
          const response = await apiService.bulkDeleteTickets(selectedTicketsArray);
          if (response.success) {
            setSelectedTickets(new Set());
            await refetch();
            hideConfirmation();
          } else {
            throw new Error(response.message || 'Помилка видалення заявок');
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Помилка масового видалення заявок:', error);
          hideConfirmation();
        }
      },
      onCancel: hideConfirmation
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('tickets.title')}</h1>
          <p className="text-text-secondary mt-1">
            {t('tickets.foundTickets', { count: total })}
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          {isAdmin && selectedTickets.size > 0 && (
            <Button 
              variant="danger" 
              onClick={handleBulkDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Видалити вибрані ({selectedTickets.size})
            </Button>
          )}
          <Button variant="outline" onClick={handleExportClick}>
            <Download className="h-4 w-4 mr-2" />
            {t('common.export')}
          </Button>
          <Button onClick={(): void => setIsCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('tickets.createTicket')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="lg:col-span-2">
              <Input
                type="text"
                placeholder={t('tickets.searchPlaceholder')}
                value={searchTerm}
                onChange={(e): void => setSearchTerm(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
            
            <select
              value={statusFilter}
              onChange={(e): void => setStatusFilter(e.target.value as TicketStatus | 'all')}
              className="px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent border border-border bg-surface text-foreground"
            >
              <option value="all">{t('tickets.filters.allStatuses')}</option>
              <option value={TicketStatus.OPEN}>{t('common.statuses.open')}</option>
              <option value={TicketStatus.IN_PROGRESS}>{t('common.statuses.inProgress')}</option>
              <option value={TicketStatus.RESOLVED}>{t('common.statuses.resolved')}</option>
              <option value={TicketStatus.CLOSED}>{t('common.statuses.closed')}</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e): void => setPriorityFilter(e.target.value as TicketPriority | 'all')}
              className="px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent border border-border bg-surface text-foreground"
            >
              <option value="all">{t('tickets.filters.allPriorities')}</option>
              <option value={TicketPriority.LOW}>{t('common.priorities.low')}</option>
              <option value={TicketPriority.MEDIUM}>{t('common.priorities.medium')}</option>
              <option value={TicketPriority.HIGH}>{t('common.priorities.high')}</option>
            </select>

            <select
              value={`${sortBy}-${sortOrder}`}
                onChange={(e): void => {
                const [field, order] = e.target.value.split('-');
                setSortBy(field as 'createdAt' | 'title' | 'status');
                setSortOrder(order as 'asc' | 'desc');
              }}
              className="px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent border border-border bg-surface text-foreground"
            >
              <option value="createdAt-desc">{t('tickets.filters.newestFirst')}</option>
              <option value="createdAt-asc">{t('tickets.filters.oldestFirst')}</option>
              <option value="title-asc">{t('tickets.filters.titleAZ')}</option>
              <option value="title-desc">{t('tickets.filters.titleZA')}</option>
              <option value="status-asc">{t('tickets.filters.byStatus')}</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Tickets List */}
      <Card>
        <CardContent className="p-0">
          {displayTickets.length === 0 ? (
            <div className="text-center py-12">
              <Filter className="h-12 w-12 text-text-secondary mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {t('tickets.noTicketsFound')}
              </h3>
              <p className="text-text-secondary">
                {t('tickets.noTicketsFoundDescription')}
              </p>
            </div>
          ) : isMobile ? (
            // Mobile Card View
            <div className="space-y-3 sm:space-y-4">
              {isAdmin && displayTickets.length > 0 && (
                <div className="px-3 sm:px-4 py-2 border-b border-border flex items-center justify-between">
                  <button
                    onClick={handleSelectAll}
                    className="flex items-center gap-2 text-sm text-foreground hover:text-primary"
                  >
                    {selectedTickets.size === displayTickets.length && 
                     displayTickets.every(t => selectedTickets.has(t._id)) ? (
                      <CheckSquare className="h-5 w-5 text-primary" />
                    ) : (
                      <Square className="h-5 w-5" />
                    )}
                    <span>Вибрати всі</span>
                  </button>
                </div>
              )}
              {displayTickets.map((ticket) => (
                <Card key={ticket._id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-3 sm:p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        {isAdmin && (
                          <button
                            onClick={() => handleToggleSelect(ticket._id)}
                            className="mr-2 mt-1 flex-shrink-0"
                          >
                            {selectedTickets.has(ticket._id) ? (
                              <CheckSquare className="h-5 w-5 text-primary" />
                            ) : (
                              <Square className="h-5 w-5 text-text-secondary" />
                            )}
                          </button>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm sm:text-base font-semibold text-foreground mb-1 line-clamp-2">
                            {ticket.title}
                          </h3>
                          <p className="text-xs sm:text-sm text-text-secondary line-clamp-2">
                            {ticket.description}
                          </p>
                        </div>
                        <div className="flex items-center space-x-1 sm:space-x-2 ml-2 flex-shrink-0">
                          <Link to={`${basePath}/tickets/${ticket._id}`}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                              <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                            </Button>
                          </Link>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                              onClick={(): void => { void handleDelete(ticket._id, ticket.title); }}
                            >
                              <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 text-error" />
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium',
                            getStatusColor(ticket.status)
                          )}
                        >
                          {ticket.status}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium',
                            getPriorityColor(ticket.priority)
                          )}
                        >
                          {ticket.priority}
                        </span>
                        {ticket.qualityRating?.hasRating && ticket.qualityRating?.rating && (
                          <TicketRating 
                            rating={ticket.qualityRating.rating}
                            ratedAt={ticket.qualityRating.ratedAt}
                            size="sm"
                          />
                        )}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-text-secondary">
                        <div className="flex items-center gap-1">
                          <span>{formatDate(ticket.createdAt)}</span>
                          <span className="text-text-secondary/70">
                            ({formatDaysAgo(ticket.createdAt)})
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <DayIndicator 
                            date={ticket.createdAt} 
                            className="text-xs"
                          />
                          {ticket.resolvedAt && (
                            <DayIndicator 
                              date={ticket.resolvedAt} 
                              className="text-xs"
                            />
                          )}
                        </div>
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
                <thead className="bg-surface border-b border-border">
                  <tr>
                    {isAdmin && (
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-12">
                        <button
                          onClick={handleSelectAll}
                          className="flex items-center"
                          title="Вибрати всі"
                        >
                          {selectedTickets.size === displayTickets.length && 
                           displayTickets.every(t => selectedTickets.has(t._id)) ? (
                            <CheckSquare className="h-5 w-5 text-primary" />
                          ) : (
                            <Square className="h-5 w-5 text-text-secondary" />
                          )}
                        </button>
                      </th>
                    )}
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      {t('tickets.table.ticket')}
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      {t('tickets.table.status')}
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      {t('tickets.table.priority')}
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      {t('tickets.table.createdDate')}
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      {t('tickets.table.dateStatus')}
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Оцінка
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider">
                      {t('tickets.table.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-surface divide-y divide-border">
                  {displayTickets.map((ticket) => (
                    <tr key={ticket._id} className="hover:bg-surface/50">
                      {isAdmin && (
                        <td className="px-4 sm:px-6 py-4">
                          <button
                            onClick={() => handleToggleSelect(ticket._id)}
                            className="flex items-center"
                          >
                            {selectedTickets.has(ticket._id) ? (
                              <CheckSquare className="h-5 w-5 text-primary" />
                            ) : (
                              <Square className="h-5 w-5 text-text-secondary" />
                            )}
                          </button>
                        </td>
                      )}
                      <td className="px-4 sm:px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {ticket.title}
                          </div>
                          <div className="text-sm text-text-secondary truncate max-w-xs">
                            {ticket.description}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <span
                          className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                            getStatusColor(ticket.status)
                          )}
                        >
                          {ticket.status}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <span
                          className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                            getPriorityColor(ticket.priority)
                          )}
                        >
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-text-secondary">
                        <div className="space-y-1">
                          <div>{formatDate(ticket.createdAt)}</div>
                          <div className="text-xs text-text-secondary/70">
                            {formatDaysAgo(ticket.createdAt)}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          <DayIndicator 
                            date={ticket.createdAt} 
                            className="text-xs"
                          />
                          {ticket.resolvedAt && (
                            <DayIndicator 
                              date={ticket.resolvedAt} 
                              className="text-xs"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        {ticket.qualityRating?.hasRating && ticket.qualityRating?.rating ? (
                          <TicketRating 
                            rating={ticket.qualityRating.rating}
                            ratedAt={ticket.qualityRating.ratedAt}
                            size="sm"
                          />
                        ) : (
                          <span className="text-gray-400 text-sm">Не оцінено</span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <Link to={`${basePath}/tickets/${ticket._id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          {isAdmin && (
                            <Link to={`${basePath}/tickets/${ticket._id}/edit`}>
                              <Button variant="ghost" size="sm">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </Link>
                          )}
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(): void => { void handleDelete(ticket._id, ticket.title); }}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={pagination.page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          totalItems={total}
          itemsPerPage={pagination.limit}
        />
      )}

      {/* Modal для створення тікету */}
      <CreateTicketModal
        isOpen={isCreateModalOpen}
        onClose={(): void => setIsCreateModalOpen(false)}
        onSuccess={handleCreateTicketSuccess}
      />

      {/* Modal для експорту тікетів */}
      <ExportTicketsModal
        isOpen={isExportModalOpen}
        onClose={(): void => setIsExportModalOpen(false)}
        onExport={exportTickets}
        cities={cities || []}
        users={users || []}
      />

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

export default Tickets;