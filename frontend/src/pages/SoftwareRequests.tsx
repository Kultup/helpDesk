import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Calendar,
  AlertCircle,
  Eye,
  Check,
} from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';
import { apiService, ApiResponse } from '../services/api';
import { SoftwareRequest, SoftwareRequestsApiResponse, SoftwareRequestStats } from '../types';

const SoftwareRequests: React.FC = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<SoftwareRequest[]>([]);
  const [stats, setStats] = useState<SoftwareRequestStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedRequest, setSelectedRequest] = useState<SoftwareRequest | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);

  const loadRequests = async (pageNum = 1) => {
    setLoading(true);
    try {
      const params: { page: number; limit: number; status?: string } = {
        page: pageNum,
        limit: 20,
      };
      if (statusFilter) params.status = statusFilter;

      const res = await apiService.getSoftwareRequests(params);
      if (res.success) {
        setRequests(res.data || []);
        setTotalPages(res.pagination?.pages || 0);
      }
    } catch {
      toast.error('Не вдалося завантажити запити');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await apiService.getSoftwareRequestStats();
      if (res.success && res.data) {
        setStats(res.data);
      }
    } catch {
      // ignore stats errors silently
    }
  };

  useEffect(() => {
    loadRequests(page);
    loadStats();
  }, [page, statusFilter]);

  const handleApprove = async () => {
    if (!selectedRequest) return;

    try {
      const res = await apiService.approveSoftwareRequest(selectedRequest._id, adminNote);
      if (res.success) {
        toast.success('Запит схвалено! Тестового користувача створено.');
        setShowModal(false);
        setAdminNote('');
        loadRequests(page);
        loadStats();

        // Show credentials
        if (res.data.credentials) {
          const { username, password, expiresAt } = res.data.credentials;
          const expires = new Date(expiresAt).toLocaleString('uk-UA');
          toast(
            `Тестовий користувач створено:\nЛогін: ${username}\nПароль: ${password}\nДійсний до: ${expires}`,
            { duration: 10000 }
          );
        }
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Не вдалося схвалити запит');
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;

    try {
      const res = await apiService.rejectSoftwareRequest(selectedRequest._id, adminNote);
      if (res.success) {
        toast.success('Запит відхилено');
        setShowModal(false);
        setAdminNote('');
        loadRequests(page);
        loadStats();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Не вдалося відхилити запит');
    }
  };

  const handleMarkInstalled = async (id: string) => {
    try {
      const res = await apiService.markSoftwareAsInstalled(id);
      if (res.success) {
        toast.success('Позначено як встановлено');
        loadRequests(page);
        loadStats();
      }
    } catch {
      toast.error('Не вдалося позначити як встановлено');
    }
  };

  const openModal = (request: SoftwareRequest, type: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setActionType(type);
    setAdminNote('');
    setShowModal(true);
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { color: string; icon: any; label: string }> = {
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, label: 'Очікує' },
      approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Схвалено' },
      rejected: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Відхилено' },
      installed: { color: 'bg-blue-100 text-blue-800', icon: Check, label: 'Встановлено' },
      expired: { color: 'bg-gray-100 text-gray-800', icon: AlertCircle, label: 'Протерміновано' },
    };
    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}
      >
        <Icon className="h-3 w-3" />
        {badge.label}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('uk-UA', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-primary-100 rounded-lg flex items-center justify-center">
            <Download className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Запити на встановлення ПЗ</h1>
            <p className="text-sm text-gray-500">Моніторинг запитів на встановлення програм</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-600">Всього</div>
              <div className="text-2xl font-bold">{stats.summary.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-yellow-600">Очікують</div>
              <div className="text-2xl font-bold text-yellow-600">{stats.summary.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-green-600">Схвалено</div>
              <div className="text-2xl font-bold text-green-600">{stats.summary.approved}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-red-600">Відхилено</div>
              <div className="text-2xl font-bold text-red-600">{stats.summary.rejected}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-blue-600">Встановлено</div>
              <div className="text-2xl font-bold text-blue-600">{stats.summary.installed}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top Software */}
      {stats && stats.bySoftware.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Найпопулярніші програми</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.bySoftware.slice(0, 6).map(software => (
                <div key={software._id} className="p-4 bg-gray-50 rounded-lg">
                  <div className="font-semibold text-gray-900">{software._id}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Всього: {software.count} | Очікують: {software.pending} | Схвалено:{' '}
                    {software.approved}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <select
          value={statusFilter}
          onChange={e => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Всі статуси</option>
          <option value="pending">Очікують</option>
          <option value="approved">Схвалено</option>
          <option value="rejected">Відхилено</option>
          <option value="installed">Встановлено</option>
        </select>
      </div>

      {/* Requests List */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Запити</h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : requests.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Запитів не знайдено</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b">
                  <tr className="text-left text-sm text-gray-600">
                    <th className="pb-3 pr-4">Користувач</th>
                    <th className="pb-3 pr-4">Програма</th>
                    <th className="pb-3 pr-4">Причина</th>
                    <th className="pb-3 pr-4">Статус</th>
                    <th className="pb-3 pr-4">Дата</th>
                    <th className="pb-3">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(request => (
                    <tr key={request._id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400" />
                          <div>
                            <div className="font-medium text-sm">
                              {[request.user?.firstName, request.user?.lastName]
                                .filter(Boolean)
                                .join(' ') || '—'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {request.user?.email || '—'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-sm">{request.softwareName}</div>
                        {request.aiAnalysis && (
                          <div className="text-xs text-gray-500">
                            {request.aiAnalysis.category || '—'}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <div
                          className="text-sm text-gray-600 max-w-xs truncate"
                          title={request.reason}
                        >
                          {request.reason || '—'}
                        </div>
                      </td>
                      <td className="py-3 pr-4">{getStatusBadge(request.status)}</td>
                      <td className="py-3 pr-4">
                        <div className="text-sm text-gray-600">
                          {formatDate(request.requestedAt)}
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          {request.status === 'pending' && (
                            <>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => openModal(request, 'approve')}
                              >
                                Схвалити
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openModal(request, 'reject')}
                              >
                                Відхилити
                              </Button>
                            </>
                          )}
                          {request.status === 'approved' && !request.testUserCreated && (
                            <Button variant="secondary" size="sm" disabled>
                              <Clock className="h-4 w-4" />
                            </Button>
                          )}
                          {request.status === 'approved' && request.testUserCreated && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleMarkInstalled(request._id)}
                            >
                              Встановлено
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedRequest(request);
                              setActionType(null);
                              setAdminNote('');
                              setShowModal(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-6">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Назад
              </Button>
              <span className="text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Далі
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      {showModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">
                  {actionType === 'approve'
                    ? 'Схвалити запит'
                    : actionType === 'reject'
                      ? 'Відхилити запит'
                      : 'Деталі запиту'}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setShowModal(false)}>
                  <XCircle className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Користувач</label>
                  <div className="mt-1 text-sm">
                    {[selectedRequest.user?.firstName, selectedRequest.user?.lastName]
                      .filter(Boolean)
                      .join(' ') || '—'}
                  </div>
                  <div className="text-xs text-gray-500">{selectedRequest.user?.email || '—'}</div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Програма</label>
                  <div className="mt-1 text-sm font-medium">{selectedRequest.softwareName}</div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Причина</label>
                  <div className="mt-1 text-sm">{selectedRequest.reason || '—'}</div>
                </div>

                {selectedRequest.softwarePhoto && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Фото програми</label>
                    <div className="mt-1">
                      <img
                        src={selectedRequest.softwarePhoto}
                        alt="Software screenshot"
                        className="max-h-48 rounded-lg border"
                      />
                    </div>
                  </div>
                )}

                {selectedRequest.aiAnalysis && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">AI Аналіз</label>
                    <div className="mt-1 text-sm space-y-1">
                      <div>Безпечна: {selectedRequest.aiAnalysis.isSafe ? '✅' : '❌'}</div>
                      <div>Категорія: {selectedRequest.aiAnalysis.category || '—'}</div>
                      <div>
                        Потребує ліцензії:{' '}
                        {selectedRequest.aiAnalysis.requiresLicense ? 'Так' : 'Ні'}
                      </div>
                      {selectedRequest.aiAnalysis.notes && (
                        <div>Нотатки: {selectedRequest.aiAnalysis.notes}</div>
                      )}
                    </div>
                  </div>
                )}

                {selectedRequest.testUserCredentials && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <label className="text-sm font-medium text-green-800">
                      Тестовий користувач
                    </label>
                    <div className="mt-2 space-y-1 text-sm">
                      <div>
                        <span className="font-medium">Логін:</span>{' '}
                        {selectedRequest.testUserCredentials.username}
                      </div>
                      <div>
                        <span className="font-medium">Пароль:</span>{' '}
                        {selectedRequest.testUserCredentials.password}
                      </div>
                      <div>
                        <span className="font-medium">Дійсний до:</span>{' '}
                        {formatDate(selectedRequest.testUserCredentials.expiresAt)}
                      </div>
                    </div>
                  </div>
                )}

                {(actionType || !selectedRequest.testUserCreated) && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Коментар адміна {actionType && "(обов'язково)"}
                    </label>
                    <Input
                      value={adminNote}
                      onChange={e => setAdminNote(e.target.value)}
                      placeholder="Введіть коментар..."
                      className="mt-1"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end mt-6">
                <Button variant="secondary" onClick={() => setShowModal(false)}>
                  Закрити
                </Button>
                {actionType === 'approve' && (
                  <Button variant="primary" onClick={handleApprove} disabled={!adminNote.trim()}>
                    Схвалити і створити користувача
                  </Button>
                )}
                {actionType === 'reject' && (
                  <Button variant="danger" onClick={handleReject} disabled={!adminNote.trim()}>
                    Відхилити
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SoftwareRequests;
