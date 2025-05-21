import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  TouchableOpacity, 
  ScrollView,
  Dimensions
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Settings, CreditCard as Edit, MapPin, Gift, LogOut } from 'lucide-react-native';
import { theme } from '@/constants/theme';

const { width } = Dimensions.get('window');

// Mock user data
const userData = {
  name: 'Alex Morgan',
  location: 'Berlin, Germany',
  avatar: 'https://images.pexels.com/photos/1036623/pexels-photo-1036623.jpeg?auto=compress&cs=tinysrgb&w=800',
  bio: 'Exploring connections between people and ideas. Finding meaning in small moments.',
  contributions: 24,
  connections: 18,
  values: ['Empathy', 'Kindness', 'Sustainability'],
  joinDate: 'June 2025',
};

// Mock mood history data
const moodHistory = [
  { date: 'Jun 10', mood: 'Hopeful', color: theme.colors.emotion.hope },
  { date: 'Jun 9', mood: 'Curious', color: theme.colors.emotion.curiosity },
  { date: 'Jun 8', mood: 'Grateful', color: theme.colors.emotion.gratitude },
  { date: 'Jun 7', mood: 'Joyful', color: theme.colors.emotion.joy },
  { date: 'Jun 6', mood: 'Peaceful', color: theme.colors.emotion.hope },
  { date: 'Jun 5', mood: 'Loving', color: theme.colors.emotion.love },
  { date: 'Jun 4', mood: 'Curious', color: theme.colors.emotion.curiosity },
];

// Mock connection requests
const connectionRequests = [
  {
    id: 'c1',
    name: 'Sophia Chen',
    location: 'Toronto, Canada',
    avatar: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=800',
    mutualValues: ['Empathy', 'Kindness'],
  },
  {
    id: 'c2',
    name: 'Miguel Reyes',
    location: 'Mexico City, Mexico',
    avatar: 'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=800',
    mutualValues: ['Sustainability'],
  },
];

// Mock badges
const badges = [
  { id: 'b1', name: 'Thoughtful Contributor', icon: '🌟', description: 'Shared 20+ reflections' },
  { id: 'b2', name: 'Connection Builder', icon: '🤝', description: 'Connected with 10+ people' },
  { id: 'b3', name: 'Global Perspective', icon: '🌍', description: 'Engaged with 5+ cultures' },
];

export default function ProfileScreen() {
  const [activeTab, setActiveTab] = useState('mood');

  // Render different content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'mood':
        return (
          <View style={styles.moodContainer}>
            <Text style={styles.sectionTitle}>Your Mood History</Text>
            <View style={styles.moodChart}>
              {moodHistory.map((item, index) => (
                <View key={index} style={styles.moodDay}>
                  <View 
                    style={[
                      styles.moodBar, 
                      { 
                        height: 80 + Math.random() * 60, 
                        backgroundColor: item.color 
                      }
                    ]} 
                  />
                  <Text style={styles.moodDate}>{item.date}</Text>
                </View>
              ))}
            </View>
            <View style={styles.moodLegend}>
              {moodHistory.slice(0, 4).map((item, index) => (
                <View key={index} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendText}>{item.mood}</Text>
                </View>
              ))}
            </View>
          </View>
        );
        
      case 'connections':
        return (
          <View style={styles.connectionsContainer}>
            <Text style={styles.sectionTitle}>Connection Requests</Text>
            
            {connectionRequests.map(request => (
              <View key={request.id} style={styles.connectionCard}>
                <Image 
                  source={{ uri: request.avatar }}
                  style={styles.connectionAvatar}
                />
                
                <View style={styles.connectionInfo}>
                  <Text style={styles.connectionName}>{request.name}</Text>
                  <View style={styles.locationRow}>
                    <MapPin size={12} color={theme.colors.textLight} />
                    <Text style={styles.connectionLocation}>{request.location}</Text>
                  </View>
                  
                  <View style={styles.mutualValues}>
                    {request.mutualValues.map((value, index) => (
                      <View key={index} style={styles.valueBadge}>
                        <Text style={styles.valueText}>{value}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                
                <View style={styles.connectionActions}>
                  <TouchableOpacity style={styles.acceptButton}>
                    <Text style={styles.acceptButtonText}>Connect</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            
            <Text style={styles.sectionTitle}>Your Badges</Text>
            
            <View style={styles.badgesContainer}>
              {badges.map(badge => (
                <View key={badge.id} style={styles.badgeItem}>
                  <Text style={styles.badgeIcon}>{badge.icon}</Text>
                  <Text style={styles.badgeName}>{badge.name}</Text>
                  <Text style={styles.badgeDescription}>{badge.description}</Text>
                </View>
              ))}
            </View>
          </View>
        );
        
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity style={styles.settingsButton}>
            <Settings size={24} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
        
        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileHeader}>
            <Image 
              source={{ uri: userData.avatar }}
              style={styles.avatar}
            />
            
            <View style={styles.profileInfo}>
              <Text style={styles.name}>{userData.name}</Text>
              
              <View style={styles.locationContainer}>
                <MapPin size={14} color={theme.colors.textLight} />
                <Text style={styles.location}>{userData.location}</Text>
              </View>
              
              <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{userData.contributions}</Text>
                  <Text style={styles.statLabel}>Reflections</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{userData.connections}</Text>
                  <Text style={styles.statLabel}>Connections</Text>
                </View>
              </View>
            </View>
            
            <TouchableOpacity style={styles.editButton}>
              <Edit size={20} color={theme.colors.white} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.bioContainer}>
            <Text style={styles.bioText}>{userData.bio}</Text>
          </View>
          
          <View style={styles.valuesContainer}>
            {userData.values.map((value, index) => (
              <View key={index} style={styles.valueTag}>
                <Text style={styles.valueTagText}>{value}</Text>
              </View>
            ))}
          </View>
          
          <View style={styles.joinDateContainer}>
            <Gift size={14} color={theme.colors.textLight} />
            <Text style={styles.joinDateText}>Joined {userData.joinDate}</Text>
          </View>
          
          <View style={styles.tabsContainer}>
            <TouchableOpacity 
              style={[
                styles.tabButton,
                activeTab === 'mood' && styles.activeTabButton
              ]}
              onPress={() => setActiveTab('mood')}
            >
              <Text 
                style={[
                  styles.tabButtonText,
                  activeTab === 'mood' && styles.activeTabButtonText
                ]}
              >
                Mood History
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.tabButton,
                activeTab === 'connections' && styles.activeTabButton
              ]}
              onPress={() => setActiveTab('connections')}
            >
              <Text 
                style={[
                  styles.tabButtonText,
                  activeTab === 'connections' && styles.activeTabButtonText
                ]}
              >
                Connections & Badges
              </Text>
            </TouchableOpacity>
          </View>
          
          {renderTabContent()}
          
          <TouchableOpacity style={styles.logoutButton}>
            <LogOut size={18} color={theme.colors.error} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerTitle: {
    ...theme.typography.h4,
    color: theme.colors.text,
  },
  settingsButton: {
    padding: theme.spacing.xs,
  },
  scrollView: {
    flex: 1,
  },
  profileHeader: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: theme.spacing.md,
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    ...theme.typography.h4,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  location: {
    ...theme.typography.body2,
    color: theme.colors.textLight,
    marginLeft: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    ...theme.typography.h5,
    color: theme.colors.text,
  },
  statLabel: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.md,
  },
  editButton: {
    position: 'absolute',
    top: 0,
    right: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bioContainer: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  bioText: {
    ...theme.typography.body1,
    color: theme.colors.text,
    lineHeight: 24,
  },
  valuesContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  valueTag: {
    backgroundColor: theme.colors.primary + '20',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: theme.spacing.sm,
  },
  valueTagText: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    fontFamily: 'Inter-Medium',
  },
  joinDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  joinDateText: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    marginLeft: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  tabButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  activeTabButton: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
  },
  tabButtonText: {
    ...theme.typography.body2,
    color: theme.colors.textLight,
  },
  activeTabButtonText: {
    fontFamily: 'Inter-Medium',
    color: theme.colors.primary,
  },
  moodContainer: {
    padding: theme.spacing.lg,
  },
  sectionTitle: {
    ...theme.typography.h5,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  moodChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 160,
    marginBottom: theme.spacing.md,
  },
  moodDay: {
    alignItems: 'center',
    width: (width - theme.spacing.lg * 2 - theme.spacing.sm * 6) / 7,
  },
  moodBar: {
    width: 8,
    borderRadius: 4,
    marginBottom: theme.spacing.xs,
  },
  moodDate: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
  },
  moodLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: theme.spacing.xs,
  },
  legendText: {
    ...theme.typography.caption,
    color: theme.colors.text,
  },
  connectionsContainer: {
    padding: theme.spacing.lg,
    paddingBottom: 100, // Extra space for tab bar
  },
  connectionCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  connectionAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: theme.spacing.md,
  },
  connectionInfo: {
    flex: 1,
  },
  connectionName: {
    ...theme.typography.body1,
    fontFamily: 'Inter-Medium',
    color: theme.colors.text,
    marginBottom: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  connectionLocation: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    marginLeft: 4,
  },
  mutualValues: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  valueBadge: {
    backgroundColor: theme.colors.primary + '15',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginRight: 4,
    marginTop: 4,
  },
  valueText: {
    ...theme.typography.caption,
    color: theme.colors.primary,
  },
  connectionActions: {
    justifyContent: 'center',
  },
  acceptButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.md,
  },
  acceptButtonText: {
    ...theme.typography.caption,
    color: theme.colors.white,
    fontFamily: 'Inter-Medium',
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  badgeItem: {
    width: '48%',
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  badgeIcon: {
    fontSize: 32,
    marginBottom: theme.spacing.xs,
  },
  badgeName: {
    ...theme.typography.body2,
    fontFamily: 'Inter-Medium',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  badgeDescription: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    textAlign: 'center',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    marginBottom: 100, // Extra space for tab bar
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  logoutText: {
    ...theme.typography.body2,
    color: theme.colors.error,
    marginLeft: theme.spacing.xs,
  },
});