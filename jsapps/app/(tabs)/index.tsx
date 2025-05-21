import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Image as ImageIcon, CirclePlus as PlusCircle } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import ReflectionCard, { ReflectionType } from '@/components/ReflectionCard';
import DailyPrompt from '@/components/DailyPrompt';

// Mock data for reflections
const mockReflections: ReflectionType[] = [
  {
    id: '1',
    user: {
      id: 'u1',
      name: 'Sophia Chen',
      location: 'Toronto, Canada',
      avatar: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=800',
    },
    text: 'Today I noticed how the sunlight filtered through autumn leaves creates patterns that remind me we\'re all connected through the same natural world. How does nature speak to you?',
    image: 'https://images.pexels.com/photos/1661179/pexels-photo-1661179.jpeg?auto=compress&cs=tinysrgb&w=800',
    likes: 24,
    comments: 5,
    createdAt: '2025-06-10T09:24:00Z',
    theme: 'earth',
    mood: {
      name: 'Peaceful',
      color: theme.colors.emotion.hope,
    },
  },
  {
    id: '2',
    user: {
      id: 'u2',
      name: 'Miguel Reyes',
      location: 'Mexico City, Mexico',
      avatar: 'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=800',
    },
    text: 'My first thought this morning was about how small acts of kindness can ripple outward. Yesterday, a stranger helped me when my car broke down, and it has changed how I see humanity.',
    likes: 42,
    comments: 12,
    createdAt: '2025-06-09T18:30:00Z',
    theme: 'communication',
    mood: {
      name: 'Grateful',
      color: theme.colors.emotion.gratitude,
    },
  },
  {
    id: '3',
    user: {
      id: 'u3',
      name: 'Aisha Patel',
      location: 'Mumbai, India',
      avatar: 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=800',
    },
    text: 'I realized that we often put others in boxes based on our first impressions. Today I challenge myself to see beyond the surface of everyone I meet. How do you break free from your own biases?',
    likes: 18,
    comments: 7,
    createdAt: '2025-06-09T12:15:00Z',
    theme: 'sustainability',
    mood: {
      name: 'Curious',
      color: theme.colors.emotion.curiosity,
    },
  },
];

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [reflections, setReflections] = useState(mockReflections);
  const [showReflectionModal, setShowReflectionModal] = useState(false);
  const [newReflection, setNewReflection] = useState('');
  
  const dailyPrompt = "What small connection with a stranger made you feel part of something bigger?";

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Simulate fetching new data
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  }, []);

  const handleLike = (id: string) => {
    setReflections(prev => 
      prev.map(reflection => 
        reflection.id === id 
        ? { ...reflection, likes: reflection.likes + 1 } 
        : reflection
      )
    );
  };

  const handleOpenReflection = () => {
    setShowReflectionModal(true);
  };

  const handleCloseReflection = () => {
    setShowReflectionModal(false);
    setNewReflection('');
  };

  const handleSubmitReflection = () => {
    if (!newReflection.trim()) return;

    // Create a new reflection and add it to the list
    const newReflectionObj: ReflectionType = {
      id: `new-${Date.now()}`,
      user: {
        id: 'currentUser',
        name: 'You',
        location: 'Your Location',
        avatar: 'https://images.pexels.com/photos/1036623/pexels-photo-1036623.jpeg?auto=compress&cs=tinysrgb&w=800',
      },
      text: newReflection,
      likes: 0,
      comments: 0,
      createdAt: new Date().toISOString(),
      mood: {
        name: 'Thoughtful',
        color: theme.colors.emotion.curiosity,
      },
    };

    setReflections([newReflectionObj, ...reflections]);
    handleCloseReflection();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Global Reflections</Text>
          <TouchableOpacity 
            style={styles.newPostButton}
            onPress={handleOpenReflection}
          >
            <PlusCircle size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
        
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        >
          <DailyPrompt 
            prompt={dailyPrompt}
            onReflect={handleOpenReflection}
          />
          
          {reflections.map(reflection => (
            <ReflectionCard 
              key={reflection.id}
              reflection={reflection}
              onLike={handleLike}
              onComment={() => {}}
              onPress={() => {}}
            />
          ))}
        </ScrollView>
        
        {/* New Reflection Modal */}
        <Modal
          visible={showReflectionModal}
          animationType="slide"
          transparent={true}
          onRequestClose={handleCloseReflection}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Share Your Reflection</Text>
                <TouchableOpacity 
                  style={styles.closeButton}
                  onPress={handleCloseReflection}
                >
                  <X size={24} color={theme.colors.textLight} />
                </TouchableOpacity>
              </View>
              
              <Text style={styles.promptInModal}>{dailyPrompt}</Text>
              
              <TextInput
                style={styles.reflectionInput}
                value={newReflection}
                onChangeText={setNewReflection}
                placeholder="Share your thoughts..."
                placeholderTextColor={theme.colors.textLight}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                autoFocus
              />
              
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.addImageButton}>
                  <ImageIcon size={20} color={theme.colors.textLight} />
                  <Text style={styles.addImageText}>Add Image</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[
                    styles.submitButton,
                    !newReflection.trim() && styles.submitButtonDisabled
                  ]}
                  onPress={handleSubmitReflection}
                  disabled={!newReflection.trim()}
                >
                  <Text style={styles.submitButtonText}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    ...theme.typography.h4,
    color: theme.colors.text,
  },
  newPostButton: {
    padding: theme.spacing.xs,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: 100, // Extra space for tab bar
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  modalTitle: {
    ...theme.typography.h4,
    color: theme.colors.text,
  },
  closeButton: {
    padding: theme.spacing.xs,
  },
  promptInModal: {
    ...theme.typography.body1,
    color: theme.colors.primary,
    marginBottom: theme.spacing.md,
    fontFamily: 'Inter-Medium',
  },
  reflectionInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    ...theme.typography.body1,
    color: theme.colors.text,
    minHeight: 150,
    marginBottom: theme.spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.sm,
  },
  addImageText: {
    ...theme.typography.body2,
    color: theme.colors.textLight,
    marginLeft: theme.spacing.xs,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  submitButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  submitButtonText: {
    ...theme.typography.button,
    color: theme.colors.white,
  },
});