import React, { useState, useEffect } from 'react';
import {
  Box,
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
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  Alert
} from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2';
import {
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  FilterList as FilterIcon,
  CheckCircle as SuccessIcon,
  Cancel as CancelIcon,
  HourglassEmpty as PendingIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import api from '../services/api';

interface AIDialog {
  _id: string;
  user: {
    username: string;
    fullName: string;
  };
  userName: string;
  location: {
    city?: string;
    institution?: string;
  };
  messages: Array<{
    role: 'user' | 'ai' | 'system';
    content: string;
    timestamp: string;
    metadata?: any;
  }>;
  createdTicket?: {
    ticketNumber: string;
    title: string;
    status: string;
  };
  status: 'active' | 'completed' | 'abandoned';
  outcome?: 'ticket_created' | 'consultation' | 'cancelled' | 'timeout';
  duration: number;
  userMessagesCount: number;
  aiQuestionsCount: number;
  startedAt: string;
  completedAt?: string;
}

const AIDialogHistory: React.FC = () => {
  const [dialogs, setDialogs] = useState<AIDialog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [total, setTotal] = useState(0);

  // Filters
  const [filters, setFilters] = useState({
    status: '',
    outcome: '',
    search: '',
    dateFrom: '',
    dateTo: ''
  });

  // Dialog detail view
  const [selectedDialog, setSelectedDialog] = useState<AIDialog | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    loadDialogs();
  }, [page, rowsPerPage, filters]);

  const loadDialogs = async () => {
    try {
      setLoading(true);
      const params = {
        page: page + 1,
        limit: rowsPerPage,
        ...filters
      };

      const response = await api.get('/ai-dialogs', { params }) as any;
      setDialogs(response.data.dialogs);
      setTotal(response.data.pagination.total);
    } catch (err: any) {
      console.error('Помилка завантаження діалогів:', err);
      setError('Помилка завантаження історії діалогів');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDialog = async (dialogId: string) => {
    try {
      const response = await api.get(`/ai-dialogs/${dialogId}`) as any;
      setSelectedDialog(response.data);
      setDetailOpen(true);
    } catch (err) {
      console.error('Помилка завантаження діалогу:', err);
    }
  };

  const handleDeleteDialog = async (dialogId: string) => {
    if (!window.confirm('Видалити цей AI діалог? Цю дію не можна скасувати.')) {
      return;
    }

    try {
      await api.delete(`/ai-dialogs/${dialogId}`) as any;
      loadDialogs();
    } catch (err) {
      console.error('Помилка видалення діалогу:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'active': return 'info';
      case 'abandoned': return 'warning';
      default: return 'default';
    }
  };

  const getOutcomeColor = (outcome?: string) => {
    switch (outcome) {
      case 'ticket_created': return 'success';
      case 'consultation': return 'info';
      case 'cancelled': return 'warning';
      case 'timeout': return 'error';
      default: return 'default';
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds} сек`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes} хв`;
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3, overflow: 'visible', position: 'relative' }}>
        <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          💬 Історія AI Діалогів
        </Typography>

        {/* Filters */}
        <Box sx={{ mb: 3, position: 'relative', zIndex: 100 }}>
        <Grid container spacing={2}>
          <Grid xs={12} md={3}>
            <TextField
              fullWidth
              label="Пошук"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Ім'я або текст повідомлення"
            />
          </Grid>
          <Grid xs={12} md={2}>
            <TextField
              select
              fullWidth
              label="Статус"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              InputLabelProps={{ shrink: true }}
              SelectProps={{
                displayEmpty: true,
                MenuProps: {
                  sx: { zIndex: 1400 }
                }
              }}
              sx={{
                '& .MuiSelect-select': {
                  minHeight: '1.4375em'
                }
              }}
            >
              <MenuItem value="">Всі</MenuItem>
              <MenuItem value="active">Активні</MenuItem>
              <MenuItem value="completed">Завершені</MenuItem>
              <MenuItem value="abandoned">Покинуті</MenuItem>
            </TextField>
          </Grid>
          <Grid xs={12} md={2}>
            <TextField
              select
              fullWidth
              label="Результат"
              value={filters.outcome}
              onChange={(e) => setFilters({ ...filters, outcome: e.target.value })}
              InputLabelProps={{ shrink: true }}
              SelectProps={{
                displayEmpty: true,
                MenuProps: {
                  sx: { zIndex: 1400 }
                }
              }}
              sx={{
                '& .MuiSelect-select': {
                  minHeight: '1.4375em'
                }
              }}
            >
              <MenuItem value="">Всі</MenuItem>
              <MenuItem value="ticket_created">Тікет створено</MenuItem>
              <MenuItem value="consultation">Консультація</MenuItem>
              <MenuItem value="cancelled">Скасовано</MenuItem>
              <MenuItem value="timeout">Таймаут</MenuItem>
            </TextField>
          </Grid>
          <Grid xs={12} md={2.5}>
            <TextField
              fullWidth
              type="date"
              label="Дата від"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              InputLabelProps={{ shrink: true }}
              inputProps={{
                style: { cursor: 'pointer' }
              }}
              sx={{ 
                '& .MuiInputBase-root': {
                  position: 'relative',
                  zIndex: 1
                },
                '& input[type="date"]': {
                  position: 'relative',
                  zIndex: 1
                },
                '& input[type="date"]::-webkit-calendar-picker-indicator': {
                  cursor: 'pointer',
                  position: 'relative',
                  zIndex: 2
                }
              }}
            />
          </Grid>
          <Grid xs={12} md={2.5}>
            <TextField
              fullWidth
              type="date"
              label="Дата до"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              InputLabelProps={{ shrink: true }}
              inputProps={{
                style: { cursor: 'pointer' }
              }}
              sx={{ 
                '& .MuiInputBase-root': {
                  position: 'relative',
                  zIndex: 1
                },
                '& input[type="date"]': {
                  position: 'relative',
                  zIndex: 1
                },
                '& input[type="date"]::-webkit-calendar-picker-indicator': {
                  cursor: 'pointer',
                  position: 'relative',
                  zIndex: 2
                }
              }}
            />
          </Grid>
        </Grid>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        )}

        {/* Table */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Дата</TableCell>
                    <TableCell>Користувач</TableCell>
                    <TableCell>Локація</TableCell>
                    <TableCell>Повідомлень</TableCell>
                    <TableCell>Тривалість</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell>Результат</TableCell>
                    <TableCell>Тікет</TableCell>
                    <TableCell align="right">Дії</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dialogs.map((dialog) => (
                    <TableRow key={dialog._id} hover>
                      <TableCell>
                        {format(new Date(dialog.startedAt), 'dd MMM yyyy HH:mm', { locale: uk })}
                      </TableCell>
                      <TableCell>{dialog.userName}</TableCell>
                      <TableCell>
                        {dialog.location.city && dialog.location.institution
                          ? `${dialog.location.city} / ${dialog.location.institution}`
                          : '-'}
                      </TableCell>
                      <TableCell>
                        👤 {dialog.userMessagesCount} | 🤖 {dialog.aiQuestionsCount}
                      </TableCell>
                      <TableCell>{formatDuration(dialog.duration)}</TableCell>
                      <TableCell>
                        <Chip
                          label={dialog.status}
                          color={getStatusColor(dialog.status) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {dialog.outcome && (
                          <Chip
                            label={dialog.outcome}
                            color={getOutcomeColor(dialog.outcome) as any}
                            size="small"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {dialog.createdTicket && (
                          <Chip
                            label={`#${dialog.createdTicket.ticketNumber}`}
                            color="primary"
                            size="small"
                          />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={() => handleViewDialog(dialog._id)}
                          title="Переглянути діалог"
                        >
                          <ViewIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteDialog(dialog._id)}
                          title="Видалити"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              labelRowsPerPage="Рядків на сторінці:"
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} з ${count}`}
            />
          </>
        )}
      </Paper>

      {/* Dialog Detail Modal */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          💬 Детальний перегляд AI діалогу
        </DialogTitle>
        <DialogContent dividers>
          {selectedDialog && (
            <Box>
              {/* Dialog Info */}
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid xs={6}>
                      <Typography variant="body2" color="text.secondary">Користувач:</Typography>
                      <Typography variant="body1">{selectedDialog.userName}</Typography>
                    </Grid>
                    <Grid xs={6}>
                      <Typography variant="body2" color="text.secondary">Дата:</Typography>
                      <Typography variant="body1">
                        {format(new Date(selectedDialog.startedAt), 'dd MMMM yyyy HH:mm', { locale: uk })}
                      </Typography>
                    </Grid>
                    <Grid xs={6}>
                      <Typography variant="body2" color="text.secondary">Тривалість:</Typography>
                      <Typography variant="body1">{formatDuration(selectedDialog.duration)}</Typography>
                    </Grid>
                    <Grid xs={6}>
                      <Typography variant="body2" color="text.secondary">Результат:</Typography>
                      {selectedDialog.outcome && (
                        <Chip
                          label={selectedDialog.outcome}
                          color={getOutcomeColor(selectedDialog.outcome) as any}
                          size="small"
                        />
                      )}
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              <Typography variant="h6" gutterBottom>
                📝 Історія повідомлень:
              </Typography>

              {/* Messages */}
              {selectedDialog.messages.map((message, index) => (
                <Box
                  key={index}
                  sx={{
                    mb: 2,
                    p: 2,
                    bgcolor: message.role === 'user' ? 'primary.50' : 'grey.100',
                    borderRadius: 1,
                    borderLeft: message.role === 'user' ? '4px solid' : 'none',
                    borderLeftColor: 'primary.main'
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {message.role === 'user' ? '👤 Користувач' : '🤖 AI'} •{' '}
                    {format(new Date(message.timestamp), 'HH:mm:ss', { locale: uk })}
                  </Typography>
                  <Typography variant="body1" sx={{ mt: 0.5 }}>
                    {message.content}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailOpen(false)}>Закрити</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default AIDialogHistory;
