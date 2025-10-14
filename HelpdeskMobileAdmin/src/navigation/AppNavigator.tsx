import React, { useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { AuthContext, useAuth } from '../contexts/AuthContext';
import { RootStackParamList, TabParamList } from '../types';
import Icon from '../components/Icon';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import TicketsScreen from '../screens/TicketsScreen';
import TicketDetailsScreen from '../screens/TicketDetailsScreen';
import UsersScreen from '../screens/UsersScreen';
import UserDetailsScreen from '../screens/UserDetailsScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: string;
          let iconType: 'MaterialIcons' | 'Ionicons' | 'FontAwesome' = 'MaterialIcons';

          switch (route.name) {
            case 'Dashboard':
              iconName = 'dashboard';
              break;
            case 'Tickets':
              iconName = 'confirmation-number';
              break;
            case 'Users':
              iconName = 'people';
              break;
            case 'Analytics':
              iconName = 'analytics';
              break;
            default:
              iconName = 'help';
          }

          return <Icon name={iconName} family={iconType} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5E5EA',
          borderTopWidth: 1,
        },
        headerStyle: {
          backgroundColor: '#FFFFFF',
          borderBottomColor: '#E5E5EA',
          borderBottomWidth: 1,
        },
        headerTitleStyle: {
          color: '#1D1D1F',
          fontSize: 18,
          fontWeight: '600',
        },
      })}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen} 
        options={{ title: 'Дашборд' }}
      />
      <Tab.Screen 
        name="Tickets" 
        component={TicketsScreen} 
        options={{ title: 'Тікети' }}
      />
      <Tab.Screen 
        name="Users" 
        component={UsersScreen} 
        options={{ title: 'Користувачі' }}
      />
      <Tab.Screen 
        name="Analytics" 
        component={AnalyticsScreen} 
        options={{ title: 'Аналітика' }}
      />
    </Tab.Navigator>
  );
};

const AppNavigator = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#FFFFFF',
          borderBottomColor: '#E5E5EA',
          borderBottomWidth: 1,
        },
        headerTitleStyle: {
          color: '#1D1D1F',
          fontSize: 18,
          fontWeight: '600',
        },
        headerTintColor: '#007AFF',
      }}
    >
      {user ? (
        <>
          <Stack.Screen 
            name="Main" 
            component={TabNavigator} 
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="TicketDetails" 
            component={TicketDetailsScreen} 
            options={{ title: 'Деталі тікету' }}
          />
          <Stack.Screen 
            name="UserDetails" 
            component={UserDetailsScreen} 
            options={{ title: 'Деталі користувача' }}
          />
        </>
      ) : (
        <Stack.Screen 
          name="Login" 
          component={LoginScreen} 
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
});

export default AppNavigator;