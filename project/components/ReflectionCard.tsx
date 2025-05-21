import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { MessageCircle, Heart, MoveHorizontal as MoreHorizontal, Globe, Leaf } from 'lucide-react-native';
import { theme } from '@/constants/theme';

export type ReflectionType = {
  id: string;
  user: {
    id: string;
    name: string;
    location: string;
    avatar: string;
  };
  text: string;
  image?: string;
  likes: number;
  comments: number;
  createdAt: string;
  theme?: 'earth' | 'sustainability' | 'communication';
  mood?: {
    name: string;
    color: string;
  };
};

interface ReflectionCardProps {
  reflection: ReflectionType;
  onLike?: (id: string) => void;
  onComment?: (id: string) => void;
  onPress?: (id: string) => void;
}

export default function ReflectionCard({ 
  reflection, 
  onLike, 
  onComment,
  onPress
}: ReflectionCardProps) {
  // Theme icons
  const getThemeIcon = () => {
    switch (reflection.theme) {
      case 'earth':
        return <Globe size={16} color={theme.colors.primary} />;
      case 'sustainability':
        return <Leaf size={16} color={theme.colors.secondary} />;
      case 'communication':
        return <MessageCircle size={16} color={theme.colors.accent} />;
      default:
        return null;
    }
  };

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) {
      return 'just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d ago`;
    }
  };

  return (
    <TouchableOpacity 
      style={styles.container}
      onPress={() => onPress?.(reflection.id)}
      activeOpacity={0.95}
    >
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <Image 
            source={{ uri: reflection.user.avatar }} 
            style={styles.avatar}
          />
          <View>
            <Text style={styles.userName}>{reflection.user.name}</Text>
            <View style={styles.locationRow}>
              <Text style={styles.location}>{reflection.user.location}</Text>
              <Text style={styles.dot}>•</Text>
              <Text style={styles.time}>{formatRelativeTime(reflection.createdAt)}</Text>
            </View>
          </View>
        </View>
        
        <View style={styles.headerRight}>
          {reflection.mood && (
            <View style={[styles.moodBadge, { backgroundColor: reflection.mood.color + '20' }]}>
              <View style={[styles.moodDot, { backgroundColor: reflection.mood.color }]} />
              <Text style={[styles.moodText, { color: reflection.mood.color }]}>
                {reflection.mood.name}
              </Text>
            </View>
          )}
          {getThemeIcon() && (
            <View style={styles.themeIcon}>
              {getThemeIcon()}
            </View>
          )}
          <TouchableOpacity style={styles.moreButton}>
            <MoreHorizontal size={20} color={theme.colors.textLight} />
          </TouchableOpacity>
        </View>
      </View>
      
      <Text style={styles.reflectionText}>{reflection.text}</Text>
      
      {reflection.image && (
        <Image 
          source={{ uri: reflection.image }} 
          style={styles.reflectionImage}
          resizeMode="cover"
        />
      )}
      
      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => onLike?.(reflection.id)}
        >
          <Heart size={20} color={theme.colors.textLight} />
          <Text style={styles.actionText}>{reflection.likes}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => onComment?.(reflection.id)}
        >
          <MessageCircle size={20} color={theme.colors.textLight} />
          <Text style={styles.actionText}>{reflection.comments}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: theme.spacing.sm,
  },
  userName: {
    ...theme.typography.body1,
    fontFamily: 'Inter-Medium',
    color: theme.colors.text,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  location: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
  },
  dot: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    marginHorizontal: 4,
  },
  time: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.borderRadius.md,
    marginRight: theme.spacing.sm,
  },
  moodDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  moodText: {
    ...theme.typography.caption,
    fontFamily: 'Inter-Medium',
  },
  themeIcon: {
    marginRight: theme.spacing.sm,
  },
  moreButton: {
    padding: 4,
  },
  reflectionText: {
    ...theme.typography.body1,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    lineHeight: 24,
  },
  reflectionImage: {
    width: '100%',
    height: 200,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
  },
  footer: {
    flexDirection: 'row',
    marginTop: theme.spacing.xs,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing.lg,
  },
  actionText: {
    ...theme.typography.body2,
    color: theme.colors.textLight,
    marginLeft: theme.spacing.xs,
  },
});