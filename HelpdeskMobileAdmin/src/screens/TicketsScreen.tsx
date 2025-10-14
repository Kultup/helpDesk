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
import { Ticket, TicketStatus, TicketPriority, RootStackParamList } from '../types';
import ApiService from '../services/api';

type TicketsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Tickets'>;

const TicketsScreen = () => {
  const navigation = useNavigation<TicketsScreenNavigationProp>();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);

  const loadTickets = async () => {
    try {
      const response = await ApiService.getTickets();
      setTickets(response.tickets);
      setFilteredTickets(response.tickets);
    } catch (error: any) {
      console.error('Помилка завантаження тікетів:', error);
      Alert.alert('Помилка', 'Не вдалося завантажити тікети');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadTickets();
  };

  const filterTickets = (query: string) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      setFilteredTickets(tickets);
    } else {
      const filtered = tickets.filter(ticket =>
        ticket.title.toLowerCase().includes(query.toLowerCase()) ||
        ticket.description.toLowerCase().includes(query.toLowerCase()) ||
        ticket.createdBy.username.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredTickets(filtered);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const getStatusColor = (status: TicketStatus) => {
    switch (status) {
      case TicketStatus.OPEN:
        return '#FF9500';
      case TicketStatus.IN_PROGRESS:
        return '#007AFF';
      case TicketStatus.RESOLVED:
        return '#34C759';
      case TicketStatus.CLOSED:
        return '#8E8E93';
      default:
        return '#8E8E93';
    }
  };

  const getPriorityColor = (priority: TicketPriority) => {
    switch (priority) {
      case TicketPriority.LOW:
        return '#34C759';
      case TicketPriority.MEDIUM:
        return '#FF9500';
      case TicketPriority.HIGH:
        return '#FF3B30';
      case TicketPriority.URGENT:
        return '#FF2D92';
      default:
        return '#8E8E93';
    }
  };

  const getStatusText = (status: TicketStatus) => {
    switch (status) {
      case TicketStatus.OPEN:
        return 'Відкритий';
      case TicketStatus.IN_PROGRESS:
        return 'В роботі';
      case TicketStatus.RESOLVED:
        return 'Вирішений';
      case TicketStatus.CLOSED:
        return 'Закритий';
      default:
        return status;
    }
  };

  const getPriorityText = (priority: TicketPriority) => {
    switch (priority) {
      case TicketPriority.LOW:
        return 'Низький';
      case TicketPriority.MEDIUM:
        return 'Середній';
      case TicketPriority.HIGH:
        return 'Високий';
      case TicketPriority.URGENT:
        return 'Терміновий';
      default:
        return priority;
    }
  };

  const renderTicketItem = ({ item }: { item: Ticket }) => (
    <TouchableOpacity
      style={styles.ticketCard}
      onPress={() => navigation.navigate('TicketDetails', { ticketId: item.id })}
    >
      <View style={styles.ticketHeader}>
        <Text style={styles.ticketTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.ticketBadges}>
          <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.badgeText}>{getStatusText(item.status)}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: getPriorityColor(item.priority) }]}>
            <Text style={styles.badgeText}>{getPriorityText(item.priority)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.ticketDescription} numberOfLines={3}>
        {item.description}
      </Text>

      <View style={styles.ticketFooter}>
        <Text style={styles.ticketAuthor}>
          Автор: {item.createdBy.firstName} {item.createdBy.lastName}
        </Text>
        <Text style={styles.ticketDate}>
          {new Date(item.createdAt).toLocaleDateString('uk-UA')}
        </Text>
      </View>

      {item.assignedTo && (
        <Text style={styles.assignedTo}>
          Призначено: {item.assignedTo.firstName} {item.assignedTo.lastName}
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Тікети</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Пошук тікетів..."
          value={searchQuery}
          onChangeText={filterTickets}
        />
      </View>

      <FlatList
        data={filteredTickets}
        renderItem={renderTicketItem}
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
  ticketCard: {
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
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  ticketTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
    flex: 1,
    marginRight: 8,
  },
  ticketBadges: {
    flexDirection: 'column',
    gap: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  ticketDescription: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
    marginBottom: 12,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketAuthor: {
    fontSize: 12,
    color: '#8E8E93',
  },
  ticketDate: {
    fontSize: 12,
    color: '#8E8E93',
  },
  assignedTo: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: 4,
    fontWeight: '500',
  },
});

export default TicketsScreen;