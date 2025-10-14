import React from 'react';
import { Text, StyleSheet } from 'react-native';

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  family?: 'MaterialIcons' | 'Ionicons' | 'FontAwesome';
}

const Icon: React.FC<IconProps> = ({ name, size = 24, color = '#000', family = 'MaterialIcons' }) => {
  // Простий текстовий замінник іконок
  const getIconText = (iconName: string) => {
    const iconMap: { [key: string]: string } = {
      'dashboard': '📊',
      'assignment': '📋',
      'people': '👥',
      'analytics': '📈',
      'menu': '☰',
      'search': '🔍',
      'add': '➕',
      'edit': '✏️',
      'delete': '🗑️',
      'check': '✓',
      'close': '✕',
      'arrow-back': '←',
      'arrow-forward': '→',
      'refresh': '🔄',
      'settings': '⚙️',
      'logout': '🚪',
      'person': '👤',
      'email': '📧',
      'phone': '📞',
      'location': '📍',
      'calendar': '📅',
      'time': '⏰',
      'priority-high': '🔴',
      'priority-medium': '🟡',
      'priority-low': '🟢',
      'status-open': '🔵',
      'status-in-progress': '🟠',
      'status-closed': '⚫',
    };
    
    return iconMap[iconName] || '•';
  };

  return (
    <Text style={[styles.icon, { fontSize: size, color }]}>
      {getIconText(name)}
    </Text>
  );
};

const styles = StyleSheet.create({
  icon: {
    textAlign: 'center',
  },
});

export default Icon;