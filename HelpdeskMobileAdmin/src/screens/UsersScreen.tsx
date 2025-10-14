import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { User, UserRole, RootStackParamList } from '../types';
import ApiService from '../services/api';

type UsersScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Users'>;

const UsersScreen = () => {
  const navigation = useNavigation<UsersScreenNavigationProp>();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);

  const loadUsers = async () => {
    try {
      const response = await ApiService.getUsers();
      setUsers(response.users);
      setFilteredUsers(response.users);
    } catch (error: any) {
      console.error('Помилка завантаження користувачів:', error);
      Alert.alert('Помилка', 'Не вдалося завантажити користувачів');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadUsers();
  };

  const filterUsers = (query: string) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter(user =>
        user.username.toLowerCase().includes(query.toLowerCase()) ||
        user.email.toLowerCase().includes(query.toLowerCase()) ||
        `${user.firstName} ${user.lastName}`.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredUsers(filtered);
    }
  };

  const toggleUserStatus = async (user: User) => {
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
              setUsers(prevUsers =>
                prevUsers.map(u => u.id === user.id ? updatedUser : u)
              );
              setFilteredUsers(prevUsers =>
                prevUsers.map(u => u.id === user.id ? updatedUser : u)
              );
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
    loadUsers();
  }, []);

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

  const renderUserItem = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={[styles.userCard, !item.isActive && styles.inactiveUserCard]}
      onPress={() => navigation.navigate('UserDetails', { userId: item.id })}
    >
      <View style={styles.userHeader}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>
            {item.firstName} {item.lastName}
          </Text>
          <Text style={styles.userEmail}>{item.email}</Text>
          <Text style={styles.userUsername}>@{item.username}</Text>
        </View>
        <View style={styles.userBadges}>
          <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.role) }]}>
            <Text style={styles.roleBadgeText}>{getRoleText(item.role)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: item.isActive ? '#34C759' : '#FF3B30' }]}>
            <Text style={styles.statusBadgeText}>
              {item.isActive ? 'Активний' : 'Неактивний'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.userFooter}>
        <Text style={styles.userDate}>
          Створено: {new Date(item.createdAt).toLocaleDateString('uk-UA')}
        </Text>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: item.isActive ? '#FF3B30' : '#34C759' }]}
          onPress={() => toggleUserStatus(item)}
        >
          <Text style={styles.actionButtonText}>
            {item.isActive ? 'Деактивувати' : 'Активувати'}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Користувачі</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Пошук користувачів..."
          value={searchQuery}
          onChangeText={filterUsers}
        />
      </View>

      <FlatList
        data={filteredUsers}
        renderItem={renderUserItem}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D1D1F',
    marginBottom: 12,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#D1D1D6',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#F2F2F7',
  },
  listContainer: {
    padding: 16,
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  inactiveUserCard: {
    opacity: 0.7,
    backgroundColor: '#F8F9FA',
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 2,
  },
  userUsername: {
    fontSize: 14,
    color: '#007AFF',
  },
  userBadges: {
    alignItems: 'flex-end',
    gap: 4,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  userFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userDate: {
    fontSize: 12,
    color: '#8E8E93',
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default UsersScreen;