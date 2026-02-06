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
  Grid,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  Divider,
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon
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
  city: {
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
  purchaseDate?: string;
  warrantyExpiry?: string;
  createdAt: string;
}

const equipmentTypes = [
  { value: 'computer', label: 'Комп\'ютер' },
  { value: 'printer', label: 'Принтер' },
  { value: 'phone', label: 'Телефон' },
  { value: 'monitor', label: 'Монітор' },
  { value: 'router', label: 'Роутер' },
  { value: 'switch', label: 'Свіч' },
  { value: 'ups', label: 'ДБЖ' },
  { value: 'other', label: 'Інше' }
];

const statusTypes = [
  { value: 'active', label: 'Активне', color: 'success' as const },
  { value: 'inactive', label: 'Неактивне', color: 'default' as const },
  { value: 'repair', label: 'В ремонті', color: 'warning' as const },
  { value: 'disposed', label: 'Списано', color: 'error' as const },
  { value: 'storage', label: 'На складі', color: 'info' as const }
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
    status: 'active',
    assignedTo: '',
    purchaseDate: '',
    warrantyExpiry: '',
    location: '',
    notes: ''
  });

  // Список міст для фільтра
  const [cities, setCities] = useState<Array<{ _id: string; name: string }>>([]);
  const [users, setUsers] = useState<Array<{ _id: string; firstName: string; lastName: string }>>([]);

  useEffect(() => {
    loadEquipment();
    loadCities();
    loadUsers();
  }, [page, rowsPerPage, searchQuery, typeFilter, statusFilter, cityFilter]);

  const loadEquipment = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: page + 1,
        limit: rowsPerPage
      };

      if (searchQuery) params.search = searchQuery;
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      if (cityFilter) params.city = cityFilter;

      const response = await api.get('/equipment', { params }) as any;
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
      const response = await api.get('/cities') as any;
      setCities(response.data);
    } catch (error) {
      console.error('Помилка завантаження міст:', error);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await api.get('/users') as any;
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
        status: equipment.status || 'active',
        assignedTo: equipment.assignedTo?._id || '',
        purchaseDate: equipment.purchaseDate ? equipment.purchaseDate.split('T')[0] : '',
        warrantyExpiry: equipment.warrantyExpiry ? equipment.warrantyExpiry.split('T')[0] : '',
        location: '',
        notes: ''
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
        status: 'active',
        assignedTo: '',
        purchaseDate: '',
        warrantyExpiry: '',
        location: '',
        notes: ''
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
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Додати обладнання
          </Button>
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
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Назва, модель, серійний номер..."
              InputProps={{
                endAdornment: <SearchIcon />
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
              onChange={(e) => setTypeFilter(e.target.value)}
              InputLabelProps={{ shrink: true }}
              SelectProps={{
                displayEmpty: true
              }}
            >
              <MenuItem value="">Всі типи</MenuItem>
              {equipmentTypes.map((type) => (
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
              onChange={(e) => setStatusFilter(e.target.value)}
              InputLabelProps={{ shrink: true }}
              SelectProps={{
                displayEmpty: true
              }}
            >
              <MenuItem value="">Всі статуси</MenuItem>
              {statusTypes.map((status) => (
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
              onChange={(e) => setCityFilter(e.target.value)}
              InputLabelProps={{ shrink: true }}
              SelectProps={{
                displayEmpty: true
              }}
            >
              <MenuItem value="">Всі міста</MenuItem>
              {cities.map((city) => (
                <MenuItem key={city._id} value={city._id}>
                  {city.name}
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
                <TableCell>Статус</TableCell>
                <TableCell>Призначено</TableCell>
                <TableCell>Дії</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {equipment.map((item) => (
                <TableRow key={item._id}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{getTypeLabel(item.type)}</TableCell>
                  <TableCell>
                    {item.brand && item.model ? `${item.brand} ${item.model}` : item.brand || item.model || '-'}
                  </TableCell>
                  <TableCell>{item.inventoryNumber || '-'}</TableCell>
                  <TableCell>{item.city?.name || '-'}</TableCell>
                  <TableCell>{getStatusChip(item.status)}</TableCell>
                  <TableCell>
                    {item.assignedTo
                      ? `${item.assignedTo.firstName} ${item.assignedTo.lastName}`
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => handleOpenDialog(item)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDelete(item._id)}
                    >
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
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} з ${count}`}
        />
      </Paper>

      {/* Діалог створення/редагування */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingEquipment ? 'Редагувати' : 'Додати обладнання'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Grid container spacing={2.5}>

            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                label="Назва"
                value={formData.name}
                onChange={(e: any) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Dell Latitude E7450"
              />
            </Grid>

            <Grid item xs={6}>
              <TextField
                select
                fullWidth
                required
                label="Тип"
                value={formData.type}
                onChange={(e: any) => setFormData({ ...formData, type: e.target.value })}
              >
                {equipmentTypes.map((type) => (
                  <MenuItem key={type.value} value={type.value}>
                    {type.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={6}>
              <TextField
                select
                fullWidth
                required
                label="Місто"
                value={formData.city}
                onChange={(e: any) => setFormData({ ...formData, city: e.target.value })}
              >
                {cities.map((city) => (
                  <MenuItem key={city._id} value={city._id}>
                    {city.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Бренд"
                value={formData.brand}
                onChange={(e: any) => setFormData({ ...formData, brand: e.target.value })}
                placeholder="HP, Dell"
              />
            </Grid>

            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Модель"
                value={formData.model}
                onChange={(e: any) => setFormData({ ...formData, model: e.target.value })}
                placeholder="LaserJet Pro"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Де знаходиться"
                value={formData.location}
                onChange={(e: any) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Кабінет 201"
              />
            </Grid>

            <Grid item xs={6}>
              <TextField
                select
                fullWidth
                label="Статус"
                value={formData.status}
                onChange={(e: any) => setFormData({ ...formData, status: e.target.value })}
              >
                {statusTypes.map((status) => (
                  <MenuItem key={status.value} value={status.value}>
                    {status.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={6}>
              <TextField
                select
                fullWidth
                label="Закріплено за"
                value={formData.assignedTo}
                onChange={(e: any) => setFormData({ ...formData, assignedTo: e.target.value })}
              >
                <MenuItem value="">Не призначено</MenuItem>
                {users.map((user) => (
                  <MenuItem key={user._id} value={user._id}>
                    {user.firstName} {user.lastName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Серійний номер"
                value={formData.serialNumber}
                onChange={(e: any) => setFormData({ ...formData, serialNumber: e.target.value })}
                placeholder="S/N з корпусу"
              />
            </Grid>

            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Інвентарний №"
                value={formData.inventoryNumber}
                onChange={(e: any) => setFormData({ ...formData, inventoryNumber: e.target.value })}
                placeholder="INV-001"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Примітки"
                value={formData.notes}
                onChange={(e: any) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Додаткова інформація..."
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Скасувати</Button>
          <Button onClick={handleSave} variant="contained" disabled={!formData.name || !formData.city}>
            {editingEquipment ? 'Зберегти' : 'Додати'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Equipment;
