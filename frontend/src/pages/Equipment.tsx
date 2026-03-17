import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Monitor,
  Printer,
  Phone,
  Wifi,
  Battery,
  Package,
  Server,
  Tv,
  Plus,
  Pencil,
  Trash2,
  Search,
  RefreshCw,
  Download,
  Upload,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Info,
  Tag,
  MapPin,
  StickyNote,
} from 'lucide-react';
import { Equipment as EquipmentType } from '../types';
import api from '../services/api';
import LoadingSpinner from '../components/UI/LoadingSpinner';

// ─── Lookups ──────────────────────────────────────────────────────────────────

const equipmentTypes = [
  { value: 'computer', label: "Комп'ютер", Icon: Monitor },
  { value: 'printer', label: 'Принтер', Icon: Printer },
  { value: 'phone', label: 'Телефон', Icon: Phone },
  { value: 'monitor', label: 'Монітор', Icon: Tv },
  { value: 'router', label: 'Роутер', Icon: Wifi },
  { value: 'switch', label: 'Свіч', Icon: Server },
  { value: 'ups', label: 'ДБЖ', Icon: Battery },
  { value: 'other', label: 'Інше', Icon: Package },
];

const statusTypes = [
  { value: 'working', label: 'В роботі', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'not_working', label: 'Не працює', cls: 'bg-red-50 text-red-600 border-red-200' },
  { value: 'new', label: 'Новий', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'used', label: 'Б/У', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
];

function getTypeInfo(value: string) {
  return equipmentTypes.find(t => t.value === value) ?? equipmentTypes[equipmentTypes.length - 1];
}
function getStatusInfo(value: string) {
  return statusTypes.find(s => s.value === value) ?? statusTypes[0];
}

const emptyForm = {
  name: '',
  type: 'computer',
  brand: '',
  model: '',
  serialNumber: '',
  inventoryNumber: '',
  city: '',
  institution: '',
  status: 'working',
  assignedTo: '',
  purchaseDate: '',
  warrantyExpiry: '',
  location: '',
  notes: '',
};

// ─── Small components ─────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = getStatusInfo(status);
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${s.cls}`}
    >
      {s.label}
    </span>
  );
};

// ─── Select & Input helpers (native, Tailwind-styled) ────────────────────────

const inputCls =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white disabled:bg-gray-50 disabled:text-gray-400';
const labelCls = 'block text-xs font-medium text-gray-500 mb-1';

// ─── Main component ───────────────────────────────────────────────────────────

const Equipment: React.FC = () => {
  const [equipment, setEquipment] = useState<EquipmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [instFilter, setInstFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Reference data
  const [cities, setCities] = useState<Array<{ _id: string; name: string }>>([]);
  const [allInstitutions, setAllInstitutions] = useState<Array<{ _id: string; name: string }>>([]);
  const [formInstitutions, setFormInstitutions] = useState<Array<{ _id: string; name: string }>>(
    []
  );
  const [users, setUsers] = useState<Array<{ _id: string; firstName: string; lastName: string }>>(
    []
  );

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EquipmentType | null>(null);
  const [formData, setFormData] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data loaders ────────────────────────────────────────────────────────────

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadEquipment = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page: page + 1, limit };
      if (search) params.search = search;
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      if (cityFilter) params.city = cityFilter;
      if (instFilter) params.institution = instFilter;
      const res = (await api.get('/equipment', { params })) as any;
      setEquipment(res.data.equipment);
      setTotal(res.data.pagination.total);
    } catch {
      showToast('Помилка завантаження обладнання', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, typeFilter, statusFilter, cityFilter, instFilter]);

  const loadCities = async () => {
    try {
      const res = (await api.get('/cities')) as any;
      setCities(res.data || []);
    } catch {
      /* ignore */
    }
  };

  const loadAllInstitutions = async () => {
    try {
      const res = (await api.get('/institutions/public', { params: { limit: 500 } })) as any;
      const list = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.data)
          ? res.data.data
          : Array.isArray(res.data?.institutions)
            ? res.data.institutions
            : [];
      setAllInstitutions(list);
    } catch {
      /* ignore */
    }
  };

  const loadInstitutionsByCity = async (cityId: string) => {
    if (!cityId) {
      setFormInstitutions([]);
      return;
    }
    try {
      const res = (await api.get('/institutions/public', {
        params: { city: cityId, limit: 500 },
      })) as any;
      const list = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.institutions)
            ? res.data.institutions
            : [];
      setFormInstitutions(list);
    } catch {
      setFormInstitutions([]);
    }
  };

  const loadUsers = async () => {
    try {
      const res = (await api.get('/users')) as any;
      setUsers(res.data.users || res.data || []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadEquipment();
  }, [loadEquipment]);
  useEffect(() => {
    loadCities();
    loadAllInstitutions();
    loadUsers();
  }, []);
  useEffect(() => {
    loadInstitutionsByCity(formData.city);
  }, [formData.city]);

  // ── Modal helpers ────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null);
    setFormData({ ...emptyForm });
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (item: EquipmentType) => {
    setEditing(item);
    setFormData({
      name: item.name || '',
      type: item.type || 'computer',
      brand: item.brand || '',
      model: item.model || '',
      serialNumber: item.serialNumber || '',
      inventoryNumber: item.inventoryNumber || '',
      city: item.city?._id || '',
      institution: item.institution?._id || '',
      status: item.status || 'working',
      assignedTo: item.assignedTo?._id || '',
      purchaseDate: item.purchaseDate ? item.purchaseDate.split('T')[0] : '',
      warrantyExpiry: item.warrantyExpiry ? item.warrantyExpiry.split('T')[0] : '',
      location: item.location || '',
      notes: item.notes || '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setFormError("Назва обладнання є обов'язковою");
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await api.put(`/equipment/${editing._id}`, formData);
        showToast('Обладнання оновлено');
      } else {
        await api.post('/equipment', formData);
        showToast('Обладнання додано');
      }
      closeModal();
      loadEquipment();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: EquipmentType) => {
    if (!window.confirm(`Видалити «${item.name}»?`)) return;
    try {
      await api.delete(`/equipment/${item._id}`);
      showToast('Обладнання видалено');
      loadEquipment();
    } catch {
      showToast('Помилка видалення', 'error');
    }
  };

  // ── Import / export ──────────────────────────────────────────────────────────

  const handleDownloadTemplate = async () => {
    try {
      const blob = (await api.get('/equipment/template', { responseType: 'blob' })) as any;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'equipment_import_template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      showToast('Помилка завантаження шаблону', 'error');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setLoading(true);
    try {
      const res: any = await api.post('/equipment/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showToast(res.data?.message || 'Імпорт завершено');
      loadEquipment();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Помилка імпорту', 'error');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Pagination ───────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / limit);
  const from = page * limit + 1;
  const to = Math.min(page * limit + limit, total);

  // ── Status summary ──────────────────────────────────────────────────────────

  const statusCounts = statusTypes.map(s => ({
    ...s,
    count: equipment.filter(e => e.status === s.value).length,
  }));

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {toast.msg}
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-5">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Інвентарне обладнання</h1>
            <p className="text-sm text-gray-400 mt-0.5">Всього: {total.toLocaleString()} одиниць</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 bg-white transition-colors"
            >
              <Download className="h-4 w-4" /> Шаблон
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 bg-white transition-colors"
            >
              <Upload className="h-4 w-4" /> Імпорт
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
            />
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
            >
              <Plus className="h-4 w-4" /> Додати
            </button>
          </div>
        </div>

        {/* ── Status summary pills ────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {statusCounts.map(s => (
            <button
              key={s.value}
              onClick={() => {
                setStatusFilter(statusFilter === s.value ? '' : s.value);
                setPage(0);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                statusFilter === s.value
                  ? s.cls + ' shadow-sm'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {s.label}
              <span
                className={`inline-flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-bold ${
                  statusFilter === s.value ? 'bg-white/40' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {s.count}
              </span>
            </button>
          ))}
          {(statusFilter || typeFilter || cityFilter || instFilter || search) && (
            <button
              onClick={() => {
                setStatusFilter('');
                setTypeFilter('');
                setCityFilter('');
                setInstFilter('');
                setSearch('');
                setSearchInput('');
                setPage(0);
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-500 hover:text-red-500 hover:border-red-200 transition-colors"
            >
              <X className="h-3 w-3" /> Скинути фільтри
            </button>
          )}
        </div>

        {/* ── Filters ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    setSearch(searchInput.trim());
                    setPage(0);
                  }
                }}
                placeholder="Назва, модель, серійний номер... (Enter)"
                className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {/* Type */}
            <select
              value={typeFilter}
              onChange={e => {
                setTypeFilter(e.target.value);
                setPage(0);
              }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white min-w-32"
            >
              <option value="">Всі типи</option>
              {equipmentTypes.map(t => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {/* City */}
            <select
              value={cityFilter}
              onChange={e => {
                setCityFilter(e.target.value);
                setInstFilter('');
                setPage(0);
              }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white min-w-32"
            >
              <option value="">Всі міста</option>
              {cities.map(c => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
            {/* Institution */}
            <select
              value={instFilter}
              onChange={e => {
                setInstFilter(e.target.value);
                setPage(0);
              }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white min-w-40"
            >
              <option value="">Всі заклади</option>
              {allInstitutions.map(i => (
                <option key={i._id} value={i._id}>
                  {i.name}
                </option>
              ))}
            </select>
            {/* Refresh */}
            <button
              onClick={() => loadEquipment()}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 bg-white transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Table ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/70">
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        Обладнання
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        Бренд / Модель
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        Інв. №
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        Місто / Заклад
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        Статус
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        Призначено
                      </th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {equipment.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-16 text-gray-400">
                          <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                          <p>Обладнання не знайдено</p>
                        </td>
                      </tr>
                    ) : (
                      equipment.map(item => {
                        const tInfo = getTypeInfo(item.type);
                        return (
                          <tr key={item._id} className="hover:bg-gray-50/60 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-blue-50 rounded-lg flex-shrink-0">
                                  <tInfo.Icon className="h-3.5 w-3.5 text-blue-600" />
                                </div>
                                <div>
                                  <p className="font-medium text-gray-800">{item.name}</p>
                                  <p className="text-xs text-gray-400">{tInfo.label}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {item.brand || item.model ? (
                                <>
                                  {item.brand && <span className="font-medium">{item.brand}</span>}
                                  {item.brand && item.model && ' '}
                                  {item.model}
                                </>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {item.inventoryNumber ? (
                                <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                                  {item.inventoryNumber}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-gray-700">{item.city?.name || '—'}</p>
                              <p className="text-xs text-gray-400 truncate max-w-40">
                                {item.institution?.name || ''}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={item.status} />
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {item.assignedTo ? (
                                `${item.assignedTo.firstName} ${item.assignedTo.lastName}`
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openEdit(item)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(item)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {total > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>Рядків:</span>
                    <select
                      value={limit}
                      onChange={e => {
                        setLimit(+e.target.value);
                        setPage(0);
                      }}
                      className="px-2 py-1 border border-gray-200 rounded text-sm bg-white"
                    >
                      {[25, 50, 100].map(n => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <span className="text-gray-400">
                      {from}–{to} з {total}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={page === 0}
                      onClick={() => setPage(p => p - 1)}
                      className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4 text-gray-600" />
                    </button>
                    <span className="px-3 text-sm text-gray-600">
                      {page + 1} / {totalPages}
                    </span>
                    <button
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage(p => p + 1)}
                      className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                    >
                      <ChevronRight className="h-4 w-4 text-gray-600" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={e => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editing ? 'Редагувати обладнання' : 'Додати обладнання'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {formError && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {formError}
                </div>
              )}

              {/* Основна інформація */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Info className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-gray-700">Основна інформація</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-gray-50 rounded-xl">
                  <div className="sm:col-span-3">
                    <label className={labelCls}>Назва обладнання *</label>
                    <input
                      className={inputCls}
                      placeholder="Dell Latitude E7450"
                      value={formData.name}
                      onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Тип</label>
                    <select
                      className={inputCls}
                      value={formData.type}
                      onChange={e => setFormData(f => ({ ...f, type: e.target.value }))}
                    >
                      {equipmentTypes.map(t => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Виробник</label>
                    <input
                      className={inputCls}
                      placeholder="HP, Dell, Lenovo"
                      value={formData.brand}
                      onChange={e => setFormData(f => ({ ...f, brand: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Модель</label>
                    <input
                      className={inputCls}
                      placeholder="LaserJet Pro M404dn"
                      value={formData.model}
                      onChange={e => setFormData(f => ({ ...f, model: e.target.value }))}
                    />
                  </div>
                </div>
              </section>

              {/* Місцезнаходження */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-gray-700">Місцезнаходження</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-gray-50 rounded-xl">
                  <div>
                    <label className={labelCls}>Місто</label>
                    <select
                      className={inputCls}
                      value={formData.city}
                      onChange={e =>
                        setFormData(f => ({ ...f, city: e.target.value, institution: '' }))
                      }
                    >
                      <option value="">Оберіть місто</option>
                      {cities.map(c => (
                        <option key={c._id} value={c._id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Заклад</label>
                    <select
                      className={inputCls}
                      value={formData.institution}
                      disabled={!formData.city}
                      onChange={e => setFormData(f => ({ ...f, institution: e.target.value }))}
                    >
                      <option value="">
                        {!formData.city ? 'Спочатку оберіть місто' : 'Оберіть заклад'}
                      </option>
                      {formInstitutions.map(i => (
                        <option key={i._id} value={i._id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Кабінет / Локація</label>
                    <input
                      className={inputCls}
                      placeholder="Кабінет 201, IT відділ"
                      value={formData.location}
                      onChange={e => setFormData(f => ({ ...f, location: e.target.value }))}
                    />
                  </div>
                </div>
              </section>

              {/* Облік та ідентифікація */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-gray-700">Облік та ідентифікація</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-gray-50 rounded-xl">
                  <div>
                    <label className={labelCls}>Серійний номер</label>
                    <input
                      className={inputCls}
                      placeholder="S/N з корпусу"
                      value={formData.serialNumber}
                      onChange={e => setFormData(f => ({ ...f, serialNumber: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Інвентарний номер</label>
                    <input
                      className={inputCls + ' bg-gray-100 cursor-not-allowed'}
                      disabled
                      value={formData.inventoryNumber || '(авто)'}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Статус</label>
                    <select
                      className={inputCls}
                      value={formData.status}
                      onChange={e => setFormData(f => ({ ...f, status: e.target.value }))}
                    >
                      {statusTypes.map(s => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Призначено</label>
                    <select
                      className={inputCls}
                      value={formData.assignedTo}
                      onChange={e => setFormData(f => ({ ...f, assignedTo: e.target.value }))}
                    >
                      <option value="">Не призначено</option>
                      {users.map(u => (
                        <option key={u._id} value={u._id}>
                          {u.firstName} {u.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Дата придбання</label>
                    <input
                      type="date"
                      className={inputCls}
                      value={formData.purchaseDate}
                      onChange={e => setFormData(f => ({ ...f, purchaseDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Гарантія до</label>
                    <input
                      type="date"
                      className={inputCls}
                      value={formData.warrantyExpiry}
                      onChange={e => setFormData(f => ({ ...f, warrantyExpiry: e.target.value }))}
                    />
                  </div>
                </div>
              </section>

              {/* Примітки */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <StickyNote className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-gray-700">Примітки</h3>
                </div>
                <textarea
                  className={inputCls + ' resize-none'}
                  rows={3}
                  placeholder="Технічні характеристики, історія ремонтів тощо..."
                  value={formData.notes}
                  onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                />
              </section>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={closeModal}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Скасувати
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors"
              >
                {saving ? (
                  <LoadingSpinner size="sm" />
                ) : editing ? (
                  <Pencil className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editing ? 'Зберегти' : 'Додати'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Equipment;
