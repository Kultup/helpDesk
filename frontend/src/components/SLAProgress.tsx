import React from 'react';
import { Box, LinearProgress, Typography, Chip, Tooltip } from '@mui/material';
import { Schedule, Warning, CheckCircle, Error } from '@mui/icons-material';

interface SLAProgressProps {
  sla: {
    hours: number;
    startTime?: string;
    deadline?: string;
    status: 'not_started' | 'on_time' | 'at_risk' | 'breached';
    remainingHours?: number;
  };
  compact?: boolean;
}

const SLAProgress: React.FC<SLAProgressProps> = ({ sla, compact = false }) => {
  const { status, hours, startTime, deadline, remainingHours } = sla;

  // Якщо SLA не почався
  if (status === 'not_started' || !startTime || !deadline) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Schedule color="disabled" fontSize="small" />
        <Typography variant="body2" color="text.secondary">
          SLA: {hours} {hours === 1 ? 'година' : hours < 5 ? 'години' : 'годин'}
        </Typography>
      </Box>
    );
  }

  // Розраховуємо прогрес
  const now = new Date();
  const start = new Date(startTime);
  const end = new Date(deadline);
  const totalMs = end.getTime() - start.getTime();
  const elapsedMs = now.getTime() - start.getTime();
  const progress = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));

  // Визначаємо колір та іконку на основі статусу
  const getStatusConfig = () => {
    switch (status) {
      case 'on_time':
        return {
          color: 'success' as const,
          icon: <CheckCircle />,
          label: 'В межах SLA',
          progressColor: 'success'
        };
      case 'at_risk':
        return {
          color: 'warning' as const,
          icon: <Warning />,
          label: 'Ризик порушення',
          progressColor: 'warning'
        };
      case 'breached':
        return {
          color: 'error' as const,
          icon: <Error />,
          label: 'SLA порушено',
          progressColor: 'error'
        };
      default:
        return {
          color: 'default' as const,
          icon: <Schedule />,
          label: 'SLA',
          progressColor: 'primary'
        };
    }
  };

  const statusConfig = getStatusConfig();

  // Форматуємо залишковий час
  const formatRemainingTime = () => {
    if (!remainingHours || remainingHours <= 0) {
      return 'Прострочено';
    }

    if (remainingHours < 1) {
      return `${Math.round(remainingHours * 60)} хв`;
    } else if (remainingHours < 24) {
      const h = Math.floor(remainingHours);
      const m = Math.round((remainingHours - h) * 60);
      return m > 0 ? `${h}г ${m}хв` : `${h}год`;
    } else {
      const days = Math.floor(remainingHours / 24);
      const hours = Math.floor(remainingHours % 24);
      return hours > 0 ? `${days}д ${hours}г` : `${days}д`;
    }
  };

  // Форматуємо дедлайн
  const formatDeadline = () => {
    const deadlineDate = new Date(deadline);
    return deadlineDate.toLocaleString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (compact) {
    return (
      <Tooltip title={`${statusConfig.label} • Дедлайн: ${formatDeadline()}`}>
        <Chip
          size="small"
          icon={React.cloneElement(statusConfig.icon, { fontSize: 'small' })}
          label={formatRemainingTime()}
          color={statusConfig.color}
          variant="outlined"
        />
      </Tooltip>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {React.cloneElement(statusConfig.icon, { 
            fontSize: 'small' as any,
            color: statusConfig.color
          })}
          <Typography variant="body2" fontWeight="medium">
            {statusConfig.label}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Залишилось: <strong>{formatRemainingTime()}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Дедлайн: <strong>{formatDeadline()}</strong>
          </Typography>
        </Box>
      </Box>
      
      <LinearProgress
        variant="determinate"
        value={progress}
        color={statusConfig.progressColor as any}
        sx={{
          height: 8,
          borderRadius: 4,
          backgroundColor: (theme: any) =>
            theme.palette.mode === 'light'
              ? theme.palette.grey[200]
              : theme.palette.grey[800]
        }}
      />
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          Початок: {new Date(startTime).toLocaleString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {Math.round(progress)}%
        </Typography>
      </Box>
    </Box>
  );
};

export default SLAProgress;
