import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Plus, 
  Search, 
  Filter, 
  Download,
  Eye,
  Edit,
  Trash2
} from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import ConfirmationModal from '../components/UI/ConfirmationModal';
import Pagination from '../components/UI/Pagination';
import CreateTicketModal from '../components/CreateTicketModal';
import ExportTicketsModal from '../components/ExportTicketsModal';
import { useTickets, useCities, useUsers } from '../hooks';
import { useConfirmation } from '../hooks/useConfirmation';
import { useTicketExport } from '../hooks/useTicketExport';
import { Ticket, TicketStatus, TicketPriority, TicketFilters, SortOptions, PaginationOptions } from '../types';
import { getStatusColor, getPriorityColor, formatDate, formatDaysAgo, getDueDateStatus, cn } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import DayIndicator from '../components/DayIndicator';

const Tickets: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;
  const basePath = isAdmin ? '/admin' : '';
  
  const {
    tickets,
    pagination,
    filters,
    sort,
    totalPages,
    total,
    isLoading,
    error,
    updateFilters,
    updatePagination,
    updateSort,
    createTicket,
    updateTicket,
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

  // Встановлюємо більший ліміт для адміністратора та завантажуємо тікети
  useEffect(() => {
    if (isAdmin) {
      updatePagination({ page: 1, limit: 50 });
    }
  }, [isAdmin]);

  useEffect(() => {
    refetch();
  }, [filters, pagination, sort]);

  useEffect(() => {
    const newFilters: Partial<TicketFilters> = {};
    if (searchTerm) newFilters.search = searchTerm;
    if (statusFilter !== 'all') newFilters.status = [statusFilter as TicketStatus];
    if (priorityFilter !== 'all') newFilters.priority = [priorityFilter as TicketPriority];
    
    updateFilters(newFilters);
    updatePagination({ page: 1 });
  }, [searchTerm, statusFilter, priorityFilter]);

  useEffect(() => {
    updateSort({ field: sortBy, direction: sortOrder });
  }, [sortBy, sortOrder]);

  const handleFilterChange = (newFilters: Partial<TicketFilters>) => {
    updateFilters(newFilters);
    updatePagination({ page: 1 });
  };

  const handleSortChange = (field: string) => {
    const newDirection = sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc';
    updateSort({ field, direction: newDirection });
  };

  const handlePageChange = (page: number) => {
    updatePagination({ page });
  };

  const handleDeleteTicket = async (id: string) => {
    if (window.confirm(t('tickets.deleteConfirmation.message', { title: '' }))) {
      try {
        await deleteTicket(id);
        refetch();
      } catch (error) {
        console.error('Error deleting ticket:', error);
      }
    }
  };

  const handleCreateTicketSuccess = () => {
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

  const handleDelete = async (ticketId: string, ticketTitle: string) => {
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
          console.error('Помилка видалення тикету:', error);
        }
      },
      onCancel: hideConfirmation
    });
  };

  const handleExportClick = () => {
    setIsExportModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('tickets.title')}</h1>
          <p className="text-gray-600 mt-1">
            {t('tickets.foundTickets', { count: total })}
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <Button variant="outline" onClick={handleExportClick}>
            <Download className="h-4 w-4 mr-2" />
            {t('common.export')}
          </Button>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('tickets.createTicket')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <Input
                type="text"
                placeholder={t('tickets.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
            
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TicketStatus | 'all')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">{t('tickets.filters.allStatuses')}</option>
              <option value={TicketStatus.OPEN}>{t('common.statuses.open')}</option>
              <option value={TicketStatus.IN_PROGRESS}>{t('common.statuses.inProgress')}</option>
              <option value={TicketStatus.RESOLVED}>{t('common.statuses.resolved')}</option>
              <option value={TicketStatus.CLOSED}>{t('common.statuses.closed')}</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as TicketPriority | 'all')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">{t('tickets.filters.allPriorities')}</option>
              <option value={TicketPriority.LOW}>{t('common.priorities.low')}</option>
              <option value={TicketPriority.MEDIUM}>{t('common.priorities.medium')}</option>
              <option value={TicketPriority.HIGH}>{t('common.priorities.high')}</option>
            </select>

            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortBy(field as 'createdAt' | 'title' | 'status');
                setSortOrder(order as 'asc' | 'desc');
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
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
              <Filter className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {t('tickets.noTicketsFound')}
              </h3>
              <p className="text-gray-500">
                {t('tickets.noTicketsFoundDescription')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('tickets.table.ticket')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('tickets.table.status')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('tickets.table.priority')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('tickets.table.createdDate')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('tickets.table.dateStatus')}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('tickets.table.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayTickets.map((ticket) => (
                    <tr key={ticket._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {ticket.title}
                          </div>
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {ticket.description}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                            getStatusColor(ticket.status)
                          )}
                        >
                          {ticket.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                            getPriorityColor(ticket.priority)
                          )}
                        >
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div className="space-y-1">
                          <div>{formatDate(ticket.createdAt)}</div>
                          <div className="text-xs text-gray-400">
                            {formatDaysAgo(ticket.createdAt)}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
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
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <Link to={`${basePath}/tickets/${ticket._id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Link to={`${basePath}/tickets/${ticket._id}/edit`}>
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(ticket._id, ticket.title)}
                            className="text-red-600 hover:text-red-700"
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
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateTicketSuccess}
      />

      {/* Modal для експорту тікетів */}
      <ExportTicketsModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
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