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
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ticket, TicketStatus, TicketPriority, RootStackParamList } from '../types';
import ApiService from '../services/api';

type TicketDetailsRouteProp = RouteProp<RootStackParamList, 'TicketDetails'>;
type TicketDetailsNavigationProp = StackNavigationProp<RootStackParamList, 'TicketDetails'>;

const TicketDetailsScreen = () => {
  const route = useRoute<TicketDetailsRouteProp>();
  const navigation = useNavigation<TicketDetailsNavigationProp>();
  const { ticketId } = route.params;

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const loadTicketDetails = async () => {
    try {
      const ticketData = await ApiService.getTicketById(ticketId);
      setTicket(ticketData);
    } catch (error: any) {
      console.error('Помилка завантаження деталей тікету:', error);
      Alert.alert('Помилка', 'Не вдалося завантажити деталі тікету');
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  const updateTicketStatus = async (newStatus: TicketStatus) => {
    if (!ticket) return;

    try {
      setIsUpdating(true);
      const updatedTicket = await ApiService.updateTicketStatus(ticket.id, newStatus);
      setTicket(updatedTicket);
      Alert.alert('Успіх', 'Статус тікету оновлено');
    } catch (error: any) {
      console.error('Помилка оновлення статусу:', error);
      Alert.alert('Помилка', 'Не вдалося оновити статус тікету');
    } finally {
      setIsUpdating(false);
    }
  };

  const showStatusChangeDialog = () => {
    if (!ticket) return;

    const statusOptions = [
      { label: 'Відкритий', value: TicketStatus.OPEN },
      { label: 'В роботі', value: TicketStatus.IN_PROGRESS },
      { label: 'Вирішений', value: TicketStatus.RESOLVED },
      { label: 'Закритий', value: TicketStatus.CLOSED },
    ];

    const buttons = statusOptions
      .filter(option => option.value !== ticket.status)
      .map(option => ({
        text: option.label,
        onPress: () => updateTicketStatus(option.value),
      }));

    buttons.push({ text: 'Скасувати', onPress: async () => {} });

    Alert.alert('Змінити статус', 'Оберіть новий статус тікету:', buttons);
  };

  useEffect(() => {
    loadTicketDetails();
  }, [ticketId]);

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

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Завантаження...</Text>
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Тікет не знайдено</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{ticket.title}</Text>
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: getStatusColor(ticket.status) }]}>
            <Text style={styles.badgeText}>{getStatusText(ticket.status)}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: getPriorityColor(ticket.priority) }]}>
            <Text style={styles.badgeText}>{getPriorityText(ticket.priority)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Опис</Text>
        <Text style={styles.description}>{ticket.description}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Інформація</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Категорія:</Text>
          <Text style={styles.infoValue}>{ticket.category.name}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Автор:</Text>
          <Text style={styles.infoValue}>
            {ticket.createdBy.firstName} {ticket.createdBy.lastName}
          </Text>
        </View>
        {ticket.assignedTo && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Призначено:</Text>
            <Text style={styles.infoValue}>
              {ticket.assignedTo.firstName} {ticket.assignedTo.lastName}
            </Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Створено:</Text>
          <Text style={styles.infoValue}>
            {new Date(ticket.createdAt).toLocaleString('uk-UA')}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Оновлено:</Text>
          <Text style={styles.infoValue}>
            {new Date(ticket.updatedAt).toLocaleString('uk-UA')}
          </Text>
        </View>
      </View>

      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={[styles.actionButton, isUpdating && styles.actionButtonDisabled]}
          onPress={showStatusChangeDialog}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.actionButtonText}>Змінити статус</Text>
          )}
        </TouchableOpacity>
      </View>

      {ticket.comments && ticket.comments.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Коментарі ({ticket.comments.length})</Text>
          {ticket.comments.map((comment) => (
            <View key={comment.id} style={styles.commentCard}>
              <View style={styles.commentHeader}>
                <Text style={styles.commentAuthor}>
                  {comment.author.firstName} {comment.author.lastName}
                </Text>
                <Text style={styles.commentDate}>
                  {new Date(comment.createdAt).toLocaleString('uk-UA')}
                </Text>
              </View>
              <Text style={styles.commentContent}>{comment.content}</Text>
            </View>
          ))}
        </View>
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
    fontSize: 18,
    color: '#FF3B30',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1D1D1F',
    marginBottom: 12,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#1D1D1F',
    lineHeight: 24,
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
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#1D1D1F',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  actionsSection: {
    margin: 16,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  commentCard: {
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1D1D1F',
  },
  commentDate: {
    fontSize: 12,
    color: '#8E8E93',
  },
  commentContent: {
    fontSize: 14,
    color: '#1D1D1F',
    lineHeight: 20,
  },
});

export default TicketDetailsScreen;