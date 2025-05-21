import React from 'react';
import { Tabs } from 'expo-router';
import { Chrome as Home, Globe, MessageCircle, User } from 'lucide-react-native';
import { Platform } from 'react-native';
import { theme } from '@/constants/theme';
import { BlurView } from 'expo-blur';

export default function TabLayout() {
  const isWeb = Platform.OS === 'web';
  
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textLight,
        tabBarLabelStyle: {
          fontFamily: 'Inter-Medium',
          fontSize: 12,
          marginBottom: theme.spacing.xs,
        },
        tabBarStyle: {
          backgroundColor: isWeb ? theme.colors.white : 'transparent',
          borderTopColor: theme.colors.border,
          paddingTop: theme.spacing.xs,
          height: 65,
          ...(!isWeb && { 
            position: 'absolute',
            borderTopWidth: 0,
          }),
        },
        tabBarBackground: () => {
          if (isWeb) return null;
          return <BlurView intensity={90} tint="light" style={{ flex: 1 }} />;
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Home size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => (
            <Globe size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="threads"
        options={{
          title: 'Threads',
          tabBarIcon: ({ color, size }) => (
            <MessageCircle size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <User size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}