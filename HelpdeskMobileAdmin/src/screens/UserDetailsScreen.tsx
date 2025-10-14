import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { User, UserRole, RootStackParamList } from '../types';
import ApiService from '../services/api';

type UserDetailsRouteProp = RouteProp<RootStackParamList, 'UserDetails'>;
type UserDetailsNavigationProp = StackNavigationProp<RootStackParamList, 'UserDetails'>;

const UserDetailsScreen = () => {
  const route = useRoute<UserDetailsRouteProp>();
  const navigation = useNavigation<UserDetailsNavigationProp>();
  const { userId } = route.params;

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUserDetails = async () => {
    try {
      const userData = await ApiService.getUserById(userId);
      setUser(userData);
    } catch (error: any) {
      console.error('Помилка завантаження деталей користувача:', error);
      Alert.alert('Помилка', 'Не вдалося завантажити дані користувача');
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  const toggleUserStatus = async () => {
    if (!user) return;

    const action = user.isActive ? 'деактивувати' : 'активувати';
    
    Alert.alert(
      'Підтвердження',
      `Ви впевнені, що хочете ${action} користувача ${user.firstName} ${user.lastName}?`,
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Підтвердити',
          onPress: async () => {
            try {
              const updatedUser = await ApiService.updateUserStatus(user.id, !user.isActive);
              setUser(updatedUser);
              Alert.alert('Успіх', `Користувача ${action}овано`);
            } catch (error: any) {
              console.error('Помилка оновлення статусу користувача:', error);
              Alert.alert('Помилка', `Не вдалося ${action} користувача`);
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    loadUserDetails();
  }, [userId]);

  const getRoleColor = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return '#FF3B30';
      case UserRole.MODERATOR:
        return '#FF9500';
      case UserRole.USER:
        return '#007AFF';
      default:
        return '#8E8E93';
    }
  };

  const getRoleText = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return 'Адміністратор';
      case UserRole.MODERATOR:
        return 'Модератор';
      case UserRole.USER:
        return 'Користувач';
      default:
        return role;
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Завантаження...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Користувача не знайдено</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>
            {user.firstName} {user.lastName}
          </Text>
          <Text style={styles.userEmail}>{user.email}</Text>
          <Text style={styles.userUsername}>@{user.username}</Text>
        </View>
        
        <View style={styles.badges}>
          <View style={[styles.roleBadge, { backgroundColor: getRoleColor(user.role) }]}>
            <Text style={styles.roleBadgeText}>{getRoleText(user.role)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: user.isActive ? '#34C759' : '#FF3B30' }]}>
            <Text style={styles.statusBadgeText}>
              {user.isActive ? 'Активний' : 'Неактивний'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Основна інформація</Text>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Ім'я:</Text>
          <Text style={styles.infoValue}>{user.firstName}</Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Прізвище:</Text>
          <Text style={styles.infoValue}>{user.lastName}</Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email:</Text>
          <Text style={styles.infoValue}>{user.email}</Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Логін:</Text>
          <Text style={styles.infoValue}>{user.username}</Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Роль:</Text>
          <Text style={styles.infoValue}>{getRoleText(user.role)}</Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Статус:</Text>
          <Text style={[styles.infoValue, { color: user.isActive ? '#34C759' : '#FF3B30' }]}>
            {user.isActive ? 'Активний' : 'Неактивний'}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Дати</Text>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Створено:</Text>
          <Text style={styles.infoValue}>
            {new Date(user.createdAt).toLocaleDateString('uk-UA', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Оновлено:</Text>
          <Text style={styles.infoValue}>
            {new Date(user.updatedAt).toLocaleDateString('uk-UA', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: user.isActive ? '#FF3B30' : '#34C759' }]}
          onPress={toggleUserStatus}
        >
          <Text style={styles.actionButtonText}>
            {user.isActive ? 'Деактивувати користувача' : 'Активувати користувача'}
          </Text>
        </TouchableOpacity>
      </View>
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
    marginTop: 12,
    fontSize: 16,
    color: '#8E8E93',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  userInfo: {
    marginBottom: 16,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D1D1F',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 2,
  },
  userUsername: {
    fontSize: 16,
    color: '#007AFF',
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 12,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  infoLabel: {
    fontSize: 16,
    color: '#8E8E93',
    flex: 1,
  },
  infoValue: {
    fontSize: 16,
    color: '#1D1D1F',
    flex: 2,
    textAlign: 'right',
  },
  actions: {
    padding: 20,
    marginTop: 12,
  },
  actionButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default UserDetailsScreen;