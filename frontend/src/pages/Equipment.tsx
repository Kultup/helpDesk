import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  MenuItem,
  Button,
  IconButton,
  Chip,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  Divider,
  Alert,
  Grid,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  InfoOutlined as InfoIcon,
  PlaceOutlined as PlaceIcon,
  TagOutlined as TagIcon,
  NotesOutlined as NotesIcon,
  Download as DownloadIcon,
  UploadFile as UploadFileIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface Equipment {
  _id: string;
  name: string;
  type: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  inventoryNumber?: string;
  city?: {
    _id: string;
    name: string;
  };
  institution?: {
    _id: string;
    name: string;
  };
  status: string;
  assignedTo?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  location?: string;
  notes?: string;
  purchaseDate?: string;
  warrantyExpiry?: string;
  createdAt: string;
}

const equipmentTypes = [
  { value: 'computer', label: "Комп'ютер" },
  { value: 'printer', label: 'Принтер' },
  { value: 'phone', label: 'Телефон' },
  { value: 'monitor', label: 'Монітор' },
  { value: 'router', label: 'Роутер' },
  { value: 'switch', label: 'Свіч' },
  { value: 'ups', label: 'ДБЖ' },
  { value: 'other', label: 'Інше' },
];

const statusTypes = [
  { value: 'working', label: 'В роботі', color: 'success' as const },
  { value: 'not_working', label: 'Не працює', color: 'error' as const },
  { value: 'new', label: 'Новий', color: 'info' as const },
  { value: 'used', label: 'Б/У', color: 'default' as const },
];

const Equipment: React.FC = () => {
  const { t } = useTranslation();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [total, setTotal] = useState(0);

  // Фільтри
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState('');

  // Діалог створення/редагування
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [formData, setFormData] = useState({
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
  });

  // Список міст та закладів для форми та фільтрів
  const [cities, setCities] = useState<Array<{ _id: string; name: string }>>([]);
  const [institutions, setInstitutions] = useState<
    Array<{ _id: string; name: string; address?: { city?: string } }>
  >([]);
  const [users, setUsers] = useState<Array<{ _id: string; firstName: string; lastName: string }>>(
    []
  );
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = async () => {
    try {
      const blob = (await api.get('/equipment/template', { responseType: 'blob' })) as any;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'equipment_import_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Помилка завантаження шаблону:', error);
      alert('Помилка завантаження шаблону');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setLoading(true);
      const response: any = await api.post('/equipment/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('Import response:', response);
      alert(response.data?.message || 'Імпорт завершено');
      loadEquipment();
    } catch (error: any) {
      console.error('Помилка імпорту:', error);
      alert(error.response?.data?.message || 'Помилка імпорту');
    } finally {
      setLoading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    loadEquipment();
    loadCities();
    loadInstitutions();
    loadUsers();
  }, [page, rowsPerPage, searchQuery, typeFilter, statusFilter, cityFilter, institutionFilter]);

  // Завантаження закладів при зміні міста у формі
  useEffect(() => {
    console.log('🔄 useEffect - formData.city змінилось:', formData.city);
    if (formData.city) {
      console.log('✅ Місто вибране, завантажуємо заклади...');
      loadInstitutionsByCity(formData.city);
    } else {
      console.log('⚠️ Місто не вибране, скидаємо заклади');
      setInstitutions([]);
    }
  }, [formData.city]);

  const loadEquipment = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: page + 1,
        limit: rowsPerPage,
      };

      if (searchQuery) params.search = searchQuery;
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      if (cityFilter) params.city = cityFilter;
      if (institutionFilter) params.institution = institutionFilter;

      const response = (await api.get('/equipment', { params })) as any;
      setEquipment(response.data.equipment);
      setTotal(response.data.pagination.total);
    } catch (error) {
      console.error('Помилка завантаження обладнання:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCities = async () => {
    try {
      const response = (await api.get('/cities')) as any;
      console.log('🌍 Cities API response:', response.data);
      const citiesList = response.data || [];
      console.log(
        `📍 Завантажено ${citiesList.length} міст:`,
        citiesList.map((c: any) => ({ id: c._id, name: c.name }))
      );
      setCities(citiesList);
    } catch (error) {
      console.error('❌ Помилка завантаження міст:', error);
    }
  };

  const loadInstitutions = async () => {
    try {
      // Використовуємо публічний endpoint який не вимагає автентифікації
      const response = (await api.get('/institutions/public', { params: { limit: 500 } })) as any;
      console.log('🏢 All Institutions API response:', response);
      console.log('🏢 response.data:', response.data);

      // Перевіряємо різні можливі структури відповіді
      let list = [];
      if (Array.isArray(response.data)) {
        list = response.data;
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        list = response.data.data;
      } else if (response.data?.success && Array.isArray(response.data?.institutions)) {
        list = response.data.institutions;
      }

      console.log('🏢 All Institutions list:', list);
      setInstitutions(list);
    } catch (error) {
      console.error('❌ Помилка завантаження закладів:', error);
    }
  };

  const loadInstitutionsByCity = async (cityId: string) => {
    try {
      console.log('🔍 Завантаження закладів для міста ID:', cityId);
      // Завантажуємо заклади для конкретного міста
      const response = (await api.get('/institutions/public', {
        params: {
          city: cityId,
          limit: 500,
        },
      })) as any;
      console.log('📦 Institutions API response (full):', response);
      console.log(
        '📦 response.data type:',
        typeof response.data,
        Array.isArray(response.data) ? 'Array' : 'Object'
      );
      console.log('📦 response.data:', response.data);
      console.log('📦 response.data.data:', response.data?.data);
      console.log('📦 response.data.success:', response.data?.success);

      // Визначаємо структуру відповіді
      let list = [];

      // Варіант 1: response.data.data є масивом (стандартна структура API)
      if (response.data?.data && Array.isArray(response.data.data)) {
        list = response.data.data;
        console.log('✅ Використовуємо response.data.data');
      }
      // Варіант 2: response.data вже є масивом
      else if (Array.isArray(response.data)) {
        list = response.data;
        console.log('✅ Використовуємо response.data (масив)');
      }
      // Варіант 3: response.data.institutions
      else if (response.data?.institutions && Array.isArray(response.data.institutions)) {
        list = response.data.institutions;
        console.log('✅ Використовуємо response.data.institutions');
      } else {
        console.warn('⚠️ Невідома структура відповіді:', response.data);
      }

      console.log('✅ Filtered institutions list:', list);
      console.log(`📊 Знайдено ${list.length} закладів для міста`);

      if (list.length === 0) {
        console.warn('⚠️ Заклади не знайдені для міста:', cityId);
      }

      setInstitutions(list);
    } catch (error) {
      console.error('❌ Помилка завантаження закладів для міста:', error);
      setInstitutions([]);
    }
  };

  const loadUsers = async () => {
    try {
      const response = (await api.get('/users')) as any;
      setUsers(response.data.users || response.data);
    } catch (error) {
      console.error('Помилка завантаження користувачів:', error);
    }
  };

  const handleOpenDialog = (equipment: Equipment | null = null) => {
    if (equipment) {
      setEditingEquipment(equipment);
      setFormData({
        name: equipment.name || '',
        type: equipment.type || 'computer',
        brand: equipment.brand || '',
        model: equipment.model || '',
        serialNumber: equipment.serialNumber || '',
        inventoryNumber: equipment.inventoryNumber || '',
        city: equipment.city?._id || '',
        institution: equipment.institution?._id || '',
        status: equipment.status || 'working',
        assignedTo: equipment.assignedTo?._id || '',
        purchaseDate: equipment.purchaseDate ? equipment.purchaseDate.split('T')[0] : '',
        warrantyExpiry: equipment.warrantyExpiry ? equipment.warrantyExpiry.split('T')[0] : '',
        location: equipment.location || '',
        notes: equipment.notes || '',
      });
    } else {
      setEditingEquipment(null);
      setFormData({
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
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingEquipment(null);
  };

  const handleSave = async () => {
    try {
      console.log('Saving equipment with data:', formData);
      console.log('Institutions available:', institutions);

      if (editingEquipment) {
        await api.put(`/equipment/${editingEquipment._id}`, formData);
      } else {
        await api.post('/equipment', formData);
      }
      handleCloseDialog();
      loadEquipment();
    } catch (error) {
      console.error('Помилка збереження обладнання:', error);
      alert('Помилка збереження обладнання');
    }
  };

  const handleChangePage = (_event: unknown, newPage: number): void => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Ви впевнені, що хочете видалити це обладнання?')) {
      return;
    }

    try {
      await api.delete(`/equipment/${id}`);
      loadEquipment();
    } catch (error) {
      console.error('Помилка видалення обладнання:', error);
      alert('Помилка видалення обладнання');
    }
  };

  const getStatusChip = (status: string) => {
    const statusType = statusTypes.find(s => s.value === status);
    return (
      <Chip
        label={statusType?.label || status}
        color={statusType?.color || 'default'}
        size="small"
      />
    );
  };

  const getTypeLabel = (type: string) => {
    const typeObj = equipmentTypes.find(t => t.value === type);
    return typeObj?.label || type;
  };

  const formatDate = (date?: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('uk-UA');
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" component="h1">
            Інвентарне обладнання
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleDownloadTemplate}
            >
              Шаблон
            </Button>
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={handleImportClick}>
              Імпорт
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
            />
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
              Додати обладнання
            </Button>
          </Box>
        </Box>

        {/* Фільтри */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              label="Пошук"
              variant="outlined"
              size="small"
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              placeholder="Назва, модель, серійний номер..."
              InputProps={{
                endAdornment: <SearchIcon />,
              }}
            />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField
              select
              fullWidth
              size="small"
              label="Тип"
              value={typeFilter}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTypeFilter(e.target.value)}
              InputLabelProps={{ shrink: true }}
              SelectProps={{
                displayEmpty: true,
              }}
            >
              <MenuItem value="">Всі типи</MenuItem>
              {equipmentTypes.map(type => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField
              select
              fullWidth
              size="small"
              label="Статус"
              value={statusFilter}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStatusFilter(e.target.value)}
              InputLabelProps={{ shrink: true }}
              SelectProps={{
                displayEmpty: true,
              }}
            >
              <MenuItem value="">Всі статуси</MenuItem>
              {statusTypes.map(status => (
                <MenuItem key={status.value} value={status.value}>
                  {status.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField
              select
              fullWidth
              size="small"
              label="Місто"
              value={cityFilter}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCityFilter(e.target.value)}
              InputLabelProps={{ shrink: true }}
              SelectProps={{
                displayEmpty: true,
              }}
            >
              <MenuItem value="">Всі міста</MenuItem>
              {cities.map(city => (
                <MenuItem key={city._id} value={city._id}>
                  {city.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField
              select
              fullWidth
              size="small"
              label="Заклад"
              value={institutionFilter}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setInstitutionFilter(e.target.value)
              }
              InputLabelProps={{ shrink: true }}
              SelectProps={{
                displayEmpty: true,
              }}
            >
              <MenuItem value="">Всі заклади</MenuItem>
              {institutions.map(inst => (
                <MenuItem key={inst._id} value={inst._id}>
                  {inst.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            <Button
              fullWidth
              variant="outlined"
              onClick={loadEquipment}
              startIcon={<RefreshIcon />}
            >
              Оновити
            </Button>
          </Grid>
        </Grid>

        {/* Таблиця */}
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Назва</TableCell>
                <TableCell>Тип</TableCell>
                <TableCell>Модель</TableCell>
                <TableCell>Інв. №</TableCell>
                <TableCell>Місто</TableCell>
                <TableCell>Заклад</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Призначено</TableCell>
                <TableCell>Дії</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {equipment.map(item => (
                <TableRow key={item._id}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{getTypeLabel(item.type)}</TableCell>
                  <TableCell>
                    {item.brand && item.model
                      ? `${item.brand} ${item.model}`
                      : item.brand || item.model || '-'}
                  </TableCell>
                  <TableCell>{item.inventoryNumber || '-'}</TableCell>
                  <TableCell>{item.city?.name || '-'}</TableCell>
                  <TableCell>{item.institution?.name || '-'}</TableCell>
                  <TableCell>{getStatusChip(item.status)}</TableCell>
                  <TableCell>
                    {item.assignedTo
                      ? `${item.assignedTo.firstName} ${item.assignedTo.lastName}`
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => handleOpenDialog(item)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(item._id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {equipment.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    Немає даних
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          rowsPerPageOptions={[25, 50, 100]}
          component="div"
          count={total}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          labelRowsPerPage="Рядків на сторінці:"
          labelDisplayedRows={({ from, to, count }: { from: number; to: number; count: number }) =>
            `${from}-${to} з ${count}`
          }
        />
      </Paper>

      {/* Діалог створення/редагування */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          },
        }}
      >
        <DialogTitle sx={{ pb: 1, fontSize: '1.25rem', fontWeight: 600 }}>
          {editingEquipment ? 'Редагувати обладнання' : 'Додати обладнання'}
        </DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* ОСНОВНА ІНФОРМАЦІЯ */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, bgcolor: 'grey.50' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <InfoIcon color="primary" fontSize="small" />
                <Typography variant="subtitle1" fontWeight={600} color="text.primary">
                  Основна інформація
                </Typography>
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    required
                    label="Назва обладнання"
                    value={formData.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Dell Latitude E7450"
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    select
                    fullWidth
                    required
                    label="Тип обладнання"
                    value={formData.type}
                    onChange={(e: any) => setFormData({ ...formData, type: e.target.value })}
                    size="small"
                    InputLabelProps={{ shrink: true }}
                  >
                    {equipmentTypes.map(type => (
                      <MenuItem key={type.value} value={type.value}>
                        {type.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="Виробник (Бренд)"
                    value={formData.brand}
                    onChange={(e: any) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="HP, Dell, Lenovo"
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="Модель"
                    value={formData.model}
                    onChange={(e: any) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="LaserJet Pro M404dn"
                    size="small"
                  />
                </Grid>
              </Grid>
            </Paper>

            {/* МІСЦЕЗНАХОДЖЕННЯ */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, bgcolor: 'grey.50' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <PlaceIcon color="primary" fontSize="small" />
                <Typography variant="subtitle1" fontWeight={600} color="text.primary">
                  Місцезнаходження
                </Typography>
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      component="label"
                      sx={{ display: 'block', mb: 0.5 }}
                    >
                      Місто
                    </Typography>
                    <TextField
                      select
                      fullWidth
                      value={formData.city}
                      onChange={(e: any) => {
                        const selectedCityId = e.target.value;
                        const selectedCity = cities.find(c => c._id === selectedCityId);
                        console.log('🏙️ Вибране місто:', selectedCity?.name, 'ID:', selectedCityId);
                        // При зміні міста скидаємо заклад
                        setFormData({
                          ...formData,
                          city: selectedCityId,
                          institution: '',
                        });
                      }}
                      size="small"
                      variant="outlined"
                      SelectProps={{ displayEmpty: true }}
                    >
                      <MenuItem value="">Оберіть місто</MenuItem>
                      {cities.map(city => (
                        <MenuItem key={city._id} value={city._id}>
                          {city.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      component="label"
                      sx={{ display: 'block', mb: 0.5 }}
                    >
                      Заклад *
                    </Typography>
                    <TextField
                      select
                      fullWidth
                      required
                      value={formData.institution}
                      onChange={(e: any) =>
                        setFormData({ ...formData, institution: e.target.value })
                      }
                      size="small"
                      variant="outlined"
                      disabled={!formData.city}
                      SelectProps={{ displayEmpty: true }}
                      helperText={!formData.city ? 'Спочатку оберіть місто' : ''}
                    >
                      <MenuItem value="">
                        {!formData.city ? 'Спочатку оберіть місто' : 'Оберіть заклад'}
                      </MenuItem>
                      {institutions.map(inst => (
                        <MenuItem key={inst._id} value={inst._id}>
                          {inst.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Локація (кабінет, відділ)"
                    value={formData.location}
                    onChange={(e: any) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Кабінет 201, IT відділ"
                    size="small"
                  />
                </Grid>
              </Grid>
            </Paper>

            {/* ОБЛІК ТА ІДЕНТИФІКАЦІЯ */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, bgcolor: 'grey.50' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <TagIcon color="primary" fontSize="small" />
                <Typography variant="subtitle1" fontWeight={600} color="text.primary">
                  Облік та ідентифікація
                </Typography>
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="Серійний номер"
                    value={formData.serialNumber}
                    onChange={(e: any) =>
                      setFormData({ ...formData, serialNumber: e.target.value })
                    }
                    placeholder="S/N з корпусу"
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    disabled
                    label="Інвентарний номер"
                    value={formData.inventoryNumber || '—'}
                    helperText="Генерується автоматично"
                    size="small"
                    sx={{ '& .MuiInputBase-input': { color: 'text.secondary' } }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      component="label"
                      sx={{ display: 'block', mb: 0.5 }}
                    >
                      Статус обладнання
                    </Typography>
                    <TextField
                      select
                      fullWidth
                      value={formData.status}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
                        setFormData({ ...formData, status: e.target.value })
                      }
                      size="small"
                      variant="outlined"
                      SelectProps={{ displayEmpty: true }}
                    >
                      <MenuItem value="">Оберіть статус</MenuItem>
                      {statusTypes.map(status => (
                        <MenuItem key={status.value} value={status.value}>
                          {status.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                </Grid>
              </Grid>
            </Paper>

            {/* ДОДАТКОВА ІНФОРМАЦІЯ */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, bgcolor: 'grey.50' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <NotesIcon color="primary" fontSize="small" />
                <Typography variant="subtitle1" fontWeight={600} color="text.primary">
                  Додаткова інформація
                </Typography>
              </Box>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Примітки та опис"
                value={formData.notes}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Технічні характеристики, історія ремонтів тощо..."
                size="small"
              />
            </Paper>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button onClick={handleCloseDialog} variant="outlined">
            Скасувати
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={!formData.name || !formData.institution}
            startIcon={editingEquipment ? <EditIcon /> : <AddIcon />}
          >
            {editingEquipment ? 'Зберегти' : 'Додати'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Equipment;
