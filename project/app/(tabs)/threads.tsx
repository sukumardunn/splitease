import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TextInput,
  TouchableOpacity,
  Image
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send, Mic, ArrowDown, Heart, MessageCircle } from 'lucide-react-native';
import { theme } from '@/constants/theme';

// Mock data for the global thought thread
const globalQuestion = "How has connecting with someone from a different background changed your perspective?";

const threadMessages = [
  {
    id: 'm1',
    user: {
      id: 'u1',
      name: 'Elena Kowalski',
      avatar: 'https://images.pexels.com/photos/1239288/pexels-photo-1239288.jpeg?auto=compress&cs=tinysrgb&w=800',
      location: 'Warsaw, Poland',
    },
    text: 'Working with my colleague from Nigeria helped me understand how privileged I am to have clean water. It made me more conscious about conservation.',
    likes: 34,
    replies: 5,
    createdAt: '2025-06-10T08:30:00Z',
  },
  {
    id: 'm2',
    user: {
      id: 'u2',
      name: 'James Thompson',
      avatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=800',
      location: 'Sydney, Australia',
    },
    text: 'My neighbor is from Japan and taught me about the concept of "ikigai" - finding purpose where your passions, talents, and what the world needs intersect. Changed how I think about my career.',
    likes: 29,
    replies: 3,
    createdAt: '2025-06-10T05:45:00Z',
  },
  {
    id: 'm3',
    user: {
      id: 'u3',
      name: 'Mei Lin',
      avatar: 'https://images.pexels.com/photos/1382731/pexels-photo-1382731.jpeg?auto=compress&cs=tinysrgb&w=800',
      location: 'Singapore',
    },
    text: 'Meeting indigenous people in New Zealand helped me see how our relationship with land can be spiritual, not just extractive. It\'s changed how I view environmental issues.',
    image: 'https://images.pexels.com/photos/4220967/pexels-photo-4220967.jpeg?auto=compress&cs=tinysrgb&w=800',
    likes: 41,
    replies: 7,
    createdAt: '2025-06-09T22:15:00Z',
  },
];

export default function ThreadsScreen() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState(threadMessages);
  const scrollViewRef = useRef<ScrollView>(null);
  
  const handleSend = () => {
    if (!message.trim()) return;
    
    const newMessage = {
      id: `new-${Date.now()}`,
      user: {
        id: 'currentUser',
        name: 'You',
        avatar: 'https://images.pexels.com/photos/1036623/pexels-photo-1036623.jpeg?auto=compress&cs=tinysrgb&w=800',
        location: 'Your Location',
      },
      text: message,
      likes: 0,
      replies: 0,
      createdAt: new Date().toISOString(),
    };
    
    setMessages([...messages, newMessage]);
    setMessage('');
    
    // Scroll to bottom after sending
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };
  
  const handleLike = (id: string) => {
    setMessages(prev => 
      prev.map(msg => 
        msg.id === id 
        ? { ...msg, likes: msg.likes + 1 } 
        : msg
      )
    );
  };
  
  const scrollToBottom = () => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Global Thought Threads</Text>
        </View>
        
        <View style={styles.questionContainer}>
          <Text style={styles.questionLabel}>Today's Question</Text>
          <Text style={styles.questionText}>{globalQuestion}</Text>
        </View>
        
        <View style={styles.threadContainer}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((msg) => (
              <View key={msg.id} style={styles.messageWrapper}>
                <Image 
                  source={{ uri: msg.user.avatar }}
                  style={styles.avatar}
                />
                
                <View style={styles.messageContent}>
                  <View style={styles.messageHeader}>
                    <Text style={styles.userName}>{msg.user.name}</Text>
                    <Text style={styles.userLocation}>{msg.user.location}</Text>
                  </View>
                  
                  <Text style={styles.messageText}>{msg.text}</Text>
                  
                  {msg.image && (
                    <Image 
                      source={{ uri: msg.image }}
                      style={styles.messageImage}
                      resizeMode="cover"
                    />
                  )}
                  
                  <View style={styles.messageActions}>
                    <TouchableOpacity 
                      style={styles.actionButton}
                      onPress={() => handleLike(msg.id)}
                    >
                      <Heart size={16} color={theme.colors.textLight} />
                      <Text style={styles.actionText}>{msg.likes}</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.actionButton}>
                      <MessageCircle size={16} color={theme.colors.textLight} />
                      <Text style={styles.actionText}>{msg.replies}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
          
          <TouchableOpacity 
            style={styles.scrollButton}
            onPress={scrollToBottom}
          >
            <ArrowDown size={20} color={theme.colors.white} />
          </TouchableOpacity>
          
          <View style={styles.inputContainer}>
            <TextInput 
              style={styles.input}
              value={message}
              onChangeText={setMessage}
              placeholder="Share your thoughts..."
              placeholderTextColor={theme.colors.textLight}
              multiline
            />
            
            <View style={styles.inputActions}>
              <TouchableOpacity style={styles.inputButton}>
                <Mic size={20} color={theme.colors.textLight} />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.sendButton,
                  !message.trim() && styles.sendButtonDisabled
                ]}
                onPress={handleSend}
                disabled={!message.trim()}
              >
                <Send size={20} color={message.trim() ? theme.colors.white : theme.colors.grey[400]} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  questionContainer: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.accent,
  },
  questionLabel: {
    ...theme.typography.caption,
    color: theme.colors.accent,
    fontFamily: 'Inter-Medium',
    marginBottom: theme.spacing.xs,
  },
  questionText: {
    ...theme.typography.h5,
    color: theme.colors.text,
  },
  threadContainer: {
    flex: 1,
    position: 'relative',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: theme.spacing.md,
    paddingBottom: 80,
  },
  messageWrapper: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: theme.spacing.sm,
  },
  messageContent: {
    flex: 1,
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  messageHeader: {
    marginBottom: theme.spacing.xs,
  },
  userName: {
    ...theme.typography.body2,
    fontFamily: 'Inter-Medium',
    color: theme.colors.text,
  },
  userLocation: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
  },
  messageText: {
    ...theme.typography.body2,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  messageImage: {
    width: '100%',
    height: 150,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
  },
  messageActions: {
    flexDirection: 'row',
    marginTop: theme.spacing.xs,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  actionText: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    marginLeft: 4,
  },
  scrollButton: {
    position: 'absolute',
    right: theme.spacing.md,
    bottom: 80,
    backgroundColor: theme.colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.md,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    maxHeight: 100,
    ...theme.typography.body2,
    color: theme.colors.text,
  },
  inputActions: {
    flexDirection: 'row',
    marginLeft: theme.spacing.sm,
  },
  inputButton: {
    padding: theme.spacing.xs,
    marginRight: theme.spacing.xs,
  },
  sendButton: {
    backgroundColor: theme.colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
});