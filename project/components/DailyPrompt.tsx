import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MessageSquarePlus } from 'lucide-react-native';
import { theme } from '@/constants/theme';

type DailyPromptProps = {
  prompt: string;
  onReflect: () => void;
};

export default function DailyPrompt({ prompt, onReflect }: DailyPromptProps) {
  return (
    <View style={styles.container}>
      <View style={styles.promptContainer}>
        <Text style={styles.promptLabel}>Today's Reflection</Text>
        <Text style={styles.promptText}>{prompt}</Text>
        
        <TouchableOpacity 
          style={styles.reflectButton}
          onPress={onReflect}
          activeOpacity={0.8}
        >
          <MessageSquarePlus size={18} color={theme.colors.white} />
          <Text style={styles.reflectButtonText}>Share Your Reflection</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
  },
  promptContainer: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  promptLabel: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    fontFamily: 'Inter-Medium',
    marginBottom: theme.spacing.xs,
  },
  promptText: {
    ...theme.typography.h5,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  reflectButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  reflectButtonText: {
    ...theme.typography.button,
    fontSize: 14,
    color: theme.colors.white,
    marginLeft: theme.spacing.xs,
  },
});