import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import { DashboardStats } from '../types';
import ApiService from '../services/api';

const { width } = Dimensions.get('window');

const AnalyticsScreen = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAnalytics = async () => {
    try {
      const dashboardData = await ApiService.getDashboardStats();
      setStats(dashboardData);
    } catch (error: any) {
      console.error('Помилка завантаження аналітики:', error);
      Alert.alert('Помилка', 'Не вдалося завантажити дані аналітики');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadAnalytics();
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const StatCard = ({ title, value, subtitle, color }: {
    title: string;
    value: number;
    subtitle?: string;
    color: string;
  }) => (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
    </View>
  );

  const ProgressBar = ({ label, current, total, color }: {
    label: string;
    current: number;
    total: number;
    color: string;
  }) => {
    const percentage = total > 0 ? (current / total) * 100 : 0;
    
    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>{label}</Text>
          <Text style={styles.progressValue}>{current}/{total}</Text>
        </View>
        <View style={styles.progressBarBackground}>
          <View 
            style={[
              styles.progressBarFill, 
              { width: `${percentage}%`, backgroundColor: color }
            ]} 
          />
        </View>
        <Text style={styles.progressPercentage}>{percentage.toFixed(1)}%</Text>
      </View>
    );
  };

  if (isLoading && !stats) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Завантаження аналітики...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Аналітика</Text>
        <Text style={styles.headerSubtitle}>Статистика системи</Text>
      </View>

      {stats && (
        <>
          {/* Загальна статистика */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Загальна статистика</Text>
            <View style={styles.statsGrid}>
              <StatCard
                title="Всього тікетів"
                value={stats.totalTickets}
                color="#007AFF"
              />
              <StatCard
                title="Відкриті тікети"
                value={stats.openTickets}
                color="#FF9500"
              />
              <StatCard
                title="Закриті тікети"
                value={stats.closedTickets}
                color="#34C759"
              />
              <StatCard
                title="В роботі"
                value={stats.inProgressTickets}
                color="#5856D6"
              />
            </View>
          </View>

          {/* Статистика користувачів */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Користувачі</Text>
            <View style={styles.statsGrid}>
              <StatCard
                title="Всього користувачів"
                value={stats.totalUsers}
                color="#007AFF"
              />
              <StatCard
                title="Активні користувачі"
                value={stats.activeUsers}
                color="#34C759"
              />
              <StatCard
                title="Адміністратори"
                value={stats.adminUsers || 0}
                color="#FF3B30"
              />
              <StatCard
                title="Модератори"
                value={stats.moderatorUsers || 0}
                color="#FF9500"
              />
            </View>
          </View>

          {/* Прогрес-бари */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Розподіл тікетів</Text>
            
            <ProgressBar
              label="Відкриті тікети"
              current={stats.openTickets}
              total={stats.totalTickets}
              color="#FF9500"
            />
            
            <ProgressBar
              label="В роботі"
              current={stats.inProgressTickets}
              total={stats.totalTickets}
              color="#5856D6"
            />
            
            <ProgressBar
              label="Закриті тікети"
              current={stats.closedTickets}
              total={stats.totalTickets}
              color="#34C759"
            />
          </View>

          {/* Додаткова статистика */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ефективність</Text>
            
            <View style={styles.efficiencyContainer}>
              <View style={styles.efficiencyItem}>
                <Text style={styles.efficiencyLabel}>Швидкість вирішення</Text>
                <Text style={styles.efficiencyValue}>
                  {stats.closedTickets > 0 
                    ? `${((stats.closedTickets / stats.totalTickets) * 100).toFixed(1)}%`
                    : '0%'
                  }
                </Text>
              </View>
              
              <View style={styles.efficiencyItem}>
                <Text style={styles.efficiencyLabel}>Активність користувачів</Text>
                <Text style={styles.efficiencyValue}>
                  {stats.totalUsers > 0 
                    ? `${((stats.activeUsers / stats.totalUsers) * 100).toFixed(1)}%`
                    : '0%'
                  }
                </Text>
              </View>
            </View>
          </View>

          {/* Статус системи */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Статус системи</Text>
            
            <View style={styles.systemStatus}>
              <View style={styles.statusItem}>
                <View style={[styles.statusIndicator, { backgroundColor: '#34C759' }]} />
                <Text style={styles.statusText}>Система працює нормально</Text>
              </View>
              
              <View style={styles.statusItem}>
                <View style={[styles.statusIndicator, { backgroundColor: '#34C759' }]} />
                <Text style={styles.statusText}>API доступне</Text>
              </View>
              
              <View style={styles.statusItem}>
                <View style={[styles.statusIndicator, { backgroundColor: '#34C759' }]} />
                <Text style={styles.statusText}>База даних підключена</Text>
              </View>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1D1D1F',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#8E8E93',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 12,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: (width - 60) / 2,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  statTitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 16,
    color: '#1D1D1F',
    fontWeight: '500',
  },
  progressValue: {
    fontSize: 14,
    color: '#8E8E93',
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#E5E5EA',
    borderRadius: 4,
    marginBottom: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressPercentage: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'right',
  },
  efficiencyContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  efficiencyItem: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    marginHorizontal: 4,
  },
  efficiencyLabel: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 8,
  },
  efficiencyValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  systemStatus: {
    gap: 12,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusText: {
    fontSize: 16,
    color: '#1D1D1F',
  },
});

export default AnalyticsScreen;