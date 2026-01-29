import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Save as SaveIcon,
  RestartAlt as ResetIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { api } from '../services/api';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`ai-prompt-tabpanel-${index}`}
      aria-labelledby={`ai-prompt-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

const AIPromptsSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const [prompts, setPrompts] = useState({
    intentAnalysis: '',
    questionGeneration: '',
    ticketAnalysis: ''
  });

  useEffect(() => {
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/settings/ai-prompts');
      setPrompts(response.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Помилка завантаження промптів');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      await api.put('/settings/ai-prompts', prompts);
      
      setSuccess('✅ AI промпти успішно збережено!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Помилка збереження промптів');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (promptType: string) => {
    if (!window.confirm(`Скинути промпт "${promptType}" до дефолтного?`)) {
      return;
    }

    try {
      setError('');
      setSuccess('');

      await api.post(`/settings/ai-prompts/${promptType}/reset`);
      
      // Перезавантажуємо промпти
      await loadPrompts();
      
      setSuccess(`✅ Промпт "${promptType}" скинуто до дефолтного!`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Помилка скидання промпта');
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" component="h1">
            🤖 Налаштування AI Промптів
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Збереження...' : 'Зберегти всі'}
          </Button>
        </Box>

        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
            {success}
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            <strong>💡 Підказка:</strong> Якщо поле порожнє, використовується дефолтний промпт з коду.
            Ви можете перевизначити промпти для кожного сценарію окремо.
          </Typography>
        </Alert>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
            <Tab label="🧠 Аналіз наміру" />
            <Tab label="❓ Генерація питань" />
            <Tab label="📊 Аналіз тікета" />
          </Tabs>
        </Box>

        {/* Intent Analysis Prompt */}
        <TabPanel value={activeTab} index={0}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              🧠 Промпт для аналізу наміру користувача
            </Typography>
            <Tooltip title="Скинути до дефолтного">
              <IconButton
                color="warning"
                onClick={() => handleReset('intentAnalysis')}
              >
                <ResetIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 2 }}>
            Цей промпт використовується для розпізнавання чи користувач хоче створити тікет, 
            чи це звичайна розмова. AI аналізує повідомлення та визначає намір.
          </Alert>

          <TextField
            fullWidth
            multiline
            rows={20}
            variant="outlined"
            placeholder="Порожнє поле = дефолтний промпт з коду"
            value={prompts.intentAnalysis}
            onChange={(e) => setPrompts({ ...prompts, intentAnalysis: e.target.value })}
            sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
          />
        </TabPanel>

        {/* Question Generation Prompt */}
        <TabPanel value={activeTab} index={1}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              ❓ Промпт для генерації уточнюючих питань
            </Typography>
            <Tooltip title="Скинути до дефолтного">
              <IconButton
                color="warning"
                onClick={() => handleReset('questionGeneration')}
              >
                <ResetIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 2 }}>
            Цей промпт використовується для створення природних, покрокових питань 
            для збору інформації про проблему користувача.
          </Alert>

          <TextField
            fullWidth
            multiline
            rows={20}
            variant="outlined"
            placeholder="Порожнє поле = дефолтний промпт з коду"
            value={prompts.questionGeneration}
            onChange={(e) => setPrompts({ ...prompts, questionGeneration: e.target.value })}
            sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
          />
        </TabPanel>

        {/* Ticket Analysis Prompt */}
        <TabPanel value={activeTab} index={2}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              📊 Промпт для аналізу тікета та SLA
            </Typography>
            <Tooltip title="Скинути до дефолтного">
              <IconButton
                color="warning"
                onClick={() => handleReset('ticketAnalysis')}
              >
                <ResetIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 2 }}>
            Цей промпт використовується для аналізу складності тікета, 
            визначення SLA (часу на виконання) та надання рекомендацій.
          </Alert>

          <TextField
            fullWidth
            multiline
            rows={20}
            variant="outlined"
            placeholder="Порожнє поле = дефолтний промпт з коду"
            value={prompts.ticketAnalysis}
            onChange={(e) => setPrompts({ ...prompts, ticketAnalysis: e.target.value })}
            sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
          />
        </TabPanel>

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button
            variant="outlined"
            onClick={loadPrompts}
          >
            Скасувати зміни
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Збереження...' : 'Зберегти'}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default AIPromptsSettings;
