import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { DashboardStats } from '../types';
import ApiService from '../services/api';

const DashboardScreen = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboardData = async () => {
    try {
      const dashboardStats = await ApiService.getDashboardStats();
      setStats(dashboardStats);
    } catch (error: any) {
      console.error('Помилка завантаження даних дашборду:', error);
      Alert.alert('Помилка', 'Не вдалося завантажити дані дашборду');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const StatCard = ({ title, value, color = '#007AFF' }: { title: string; value: number; color?: string }) => (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );

  const QuickActionButton = ({ title, onPress, color = '#007AFF' }: { title: string; onPress: () => void; color?: string }) => (
    <TouchableOpacity style={[styles.actionButton, { backgroundColor: color }]} onPress={onPress}>
      <Text style={styles.actionButtonText}>{title}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.welcomeText}>Вітаємо, {user?.firstName || user?.username}!</Text>
        <Text style={styles.roleText}>Адміністратор системи</Text>
      </View>

      {stats && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Статистика тікетів</Text>
            <View style={styles.statsGrid}>
              <StatCard title="Всього тікетів" value={stats.totalTickets} color="#007AFF" />
              <StatCard title="Відкриті" value={stats.openTickets} color="#FF9500" />
              <StatCard title="В роботі" value={stats.inProgressTickets} color="#30D158" />
              <StatCard title="Вирішені" value={stats.resolvedTickets} color="#34C759" />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Користувачі</Text>
            <View style={styles.statsRow}>
              <StatCard title="Всього користувачів" value={stats.totalUsers} color="#5856D6" />
              <StatCard title="Активні" value={stats.activeUsers} color="#32D74B" />
            </View>
          </View>
        </>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Швидкі дії</Text>
        <View style={styles.actionsContainer}>
          <QuickActionButton
            title="Переглянути тікети"
            onPress={() => {/* Навігація до тікетів */}}
            color="#007AFF"
          />
          <QuickActionButton
            title="Управління користувачами"
            onPress={() => {/* Навігація до користувачів */}}
            color="#5856D6"
          />
          <QuickActionButton
            title="Аналітика"
            onPress={() => {/* Навігація до аналітики */}}
            color="#FF9500"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Системна інформація</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>Версія додатку: 1.0.0</Text>
          <Text style={styles.infoText}>Останнє оновлення: {new Date().toLocaleDateString('uk-UA')}</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D1D1F',
    marginBottom: 4,
  },
  roleText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  section: {
    margin: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    width: '48%',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1D1D1F',
    marginBottom: 4,
  },
  statTitle: {
    fontSize: 14,
    color: '#8E8E93',
  },
  actionsContainer: {
    gap: 12,
  },
  actionButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  infoText: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
});

export default DashboardScreen;