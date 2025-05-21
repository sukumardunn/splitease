import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Image, 
  TouchableOpacity,
  Dimensions
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Filter, Users } from 'lucide-react-native';
import { theme } from '@/constants/theme';

const { width } = Dimensions.get('window');

// Categories for filter
const categories = [
  { id: 'all', name: 'All', count: 246 },
  { id: 'kindness', name: 'Kindness', count: 84 },
  { id: 'love', name: 'Love', count: 67 },
  { id: 'struggle', name: 'Struggle', count: 48 },
  { id: 'hope', name: 'Hope', count: 52 },
];

// Mock regions data
const regions = [
  {
    id: 'r1',
    name: 'Ocean of Empathy',
    description: 'Region where thoughts of compassion and understanding flow',
    color: theme.colors.primary,
    users: 148,
    image: 'https://images.pexels.com/photos/1298684/pexels-photo-1298684.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
  {
    id: 'r2',
    name: 'Forest of Kindness',
    description: 'A place where small acts of kindness flourish into great connections',
    color: theme.colors.secondary,
    users: 97,
    image: 'https://images.pexels.com/photos/1271620/pexels-photo-1271620.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
  {
    id: 'r3',
    name: 'Mountains of Resilience',
    description: 'Where people share stories of overcoming challenges',
    color: theme.colors.accent,
    users: 124,
    image: 'https://images.pexels.com/photos/2098427/pexels-photo-2098427.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
];

export default function MapScreen() {
  const [selectedCategory, setSelectedCategory] = useState('all');

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>No Boundaries Map</Text>
        </View>
        
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Search size={20} color={theme.colors.textLight} />
            <Text style={styles.searchPlaceholder}>Search regions or emotions...</Text>
          </View>
          <TouchableOpacity style={styles.filterButton}>
            <Filter size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
        
        <View style={styles.categoriesContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesContent}
          >
            {categories.map(category => (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.categoryItem,
                  selectedCategory === category.id && styles.categoryItemSelected
                ]}
                onPress={() => setSelectedCategory(category.id)}
              >
                <Text 
                  style={[
                    styles.categoryName,
                    selectedCategory === category.id && styles.categoryNameSelected
                  ]}
                >
                  {category.name}
                </Text>
                <Text 
                  style={[
                    styles.categoryCount,
                    selectedCategory === category.id && styles.categoryCountSelected
                  ]}
                >
                  {category.count}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        
        <View style={styles.mapContainer}>
          <Image
            source={{ uri: 'https://images.pexels.com/photos/697662/pexels-photo-697662.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2' }}
            style={styles.mapImage}
            resizeMode="cover"
          />
          <View style={styles.mapOverlay}>
            {/* Emotion regions would be rendered here as interactive SVG in a complete app */}
            <Text style={styles.mapPlaceholder}>Interactive map visualization</Text>
          </View>
        </View>
        
        <View style={styles.regionsHeader}>
          <Text style={styles.regionsTitle}>Emotional Regions</Text>
        </View>
        
        <ScrollView
          style={styles.regionsScrollView}
          contentContainerStyle={styles.regionsContent}
          showsVerticalScrollIndicator={false}
        >
          {regions.map(region => (
            <TouchableOpacity 
              key={region.id}
              style={styles.regionCard}
              activeOpacity={0.9}
            >
              <Image 
                source={{ uri: region.image }}
                style={styles.regionImage}
                resizeMode="cover"
              />
              <View 
                style={[
                  styles.regionOverlay,
                  { backgroundColor: region.color + '40' } // 40% opacity
                ]}
              />
              <View style={styles.regionInfo}>
                <Text style={styles.regionName}>{region.name}</Text>
                <Text style={styles.regionDescription}>{region.description}</Text>
                <View style={styles.regionUsers}>
                  <Users size={16} color={theme.colors.white} />
                  <Text style={styles.regionUsersText}>{region.users} reflective souls</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
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
  title: {
    ...theme.typography.h4,
    color: theme.colors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginRight: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  searchPlaceholder: {
    ...theme.typography.body2,
    color: theme.colors.textLight,
    marginLeft: theme.spacing.sm,
  },
  filterButton: {
    backgroundColor: theme.colors.white,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    ...theme.shadows.sm,
  },
  categoriesContainer: {
    paddingBottom: theme.spacing.md,
  },
  categoriesContent: {
    paddingHorizontal: theme.spacing.md,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    marginRight: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  categoryItemSelected: {
    backgroundColor: theme.colors.primary,
  },
  categoryName: {
    ...theme.typography.body2,
    color: theme.colors.text,
    marginRight: theme.spacing.xs,
  },
  categoryNameSelected: {
    color: theme.colors.white,
    fontFamily: 'Inter-Medium',
  },
  categoryCount: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    backgroundColor: theme.colors.grey[200],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  categoryCountSelected: {
    color: theme.colors.primary,
    backgroundColor: theme.colors.white,
  },
  mapContainer: {
    height: 200,
    position: 'relative',
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.md,
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPlaceholder: {
    ...theme.typography.body1,
    color: theme.colors.white,
    fontFamily: 'Inter-Medium',
  },
  regionsHeader: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  regionsTitle: {
    ...theme.typography.h5,
    color: theme.colors.text,
  },
  regionsScrollView: {
    flex: 1,
  },
  regionsContent: {
    padding: theme.spacing.md,
    paddingBottom: 100, // Extra space for tab bar
  },
  regionCard: {
    height: 160,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
    ...theme.shadows.md,
  },
  regionImage: {
    width: '100%',
    height: '100%',
  },
  regionOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  regionInfo: {
    ...StyleSheet.absoluteFillObject,
    padding: theme.spacing.md,
    justifyContent: 'flex-end',
  },
  regionName: {
    ...theme.typography.h4,
    color: theme.colors.white,
    marginBottom: theme.spacing.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  regionDescription: {
    ...theme.typography.body2,
    color: theme.colors.white,
    marginBottom: theme.spacing.sm,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  regionUsers: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  regionUsersText: {
    ...theme.typography.caption,
    color: theme.colors.white,
    marginLeft: theme.spacing.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});