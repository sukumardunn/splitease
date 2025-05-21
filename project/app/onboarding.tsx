import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight, Check, Globe, Heart, Leaf, MessageCircle } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

// List of values/interests for selection
const valuesList = [
  { id: 1, name: 'Empathy', icon: <Heart size={24} color={theme.colors.accent} /> },
  { id: 2, name: 'Kindness', icon: <Heart size={24} color={theme.colors.primary} /> },
  { id: 3, name: 'Sustainability', icon: <Leaf size={24} color={theme.colors.secondary} /> },
  { id: 4, name: 'Connection', icon: <Globe size={24} color={theme.colors.primary} /> },
  { id: 5, name: 'Mindfulness', icon: <MessageCircle size={24} color={theme.colors.accent} /> },
];

// List of emotions for mood check-in
const moodsList = [
  { id: 1, name: 'Joyful', color: theme.colors.emotion.joy },
  { id: 2, name: 'Sad', color: theme.colors.emotion.sadness },
  { id: 3, name: 'Angry', color: theme.colors.emotion.anger },
  { id: 4, name: 'Fearful', color: theme.colors.emotion.fear },
  { id: 5, name: 'Loving', color: theme.colors.emotion.love },
  { id: 6, name: 'Hopeful', color: theme.colors.emotion.hope },
  { id: 7, name: 'Grateful', color: theme.colors.emotion.gratitude },
  { id: 8, name: 'Curious', color: theme.colors.emotion.curiosity },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  
  // User data state
  const [userData, setUserData] = useState({
    name: '',
    age: '',
    location: '',
    selectedValues: [] as number[],
    currentMood: null as number | null,
    firstThought: '',
  });

  // Handle selecting/deselecting values
  const toggleValue = (valueId: number) => {
    setUserData((prev) => {
      if (prev.selectedValues.includes(valueId)) {
        return {
          ...prev,
          selectedValues: prev.selectedValues.filter((id) => id !== valueId),
        };
      } else {
        return {
          ...prev,
          selectedValues: [...prev.selectedValues, valueId],
        };
      }
    });
  };

  // Handle mood selection
  const selectMood = (moodId: number) => {
    setUserData((prev) => ({
      ...prev,
      currentMood: moodId,
    }));
  };

  // Handle text input changes
  const handleInputChange = (field: string, value: string) => {
    setUserData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Move to next step or finish onboarding
  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      // Save user data and navigate to main app
      // In a real app, this would involve API calls
      router.replace('/(tabs)');
    }
  };

  // Go back to previous step or welcome screen
  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      router.back();
    }
  };

  // Check if current step is complete
  const isStepComplete = () => {
    switch (step) {
      case 1:
        return userData.name.trim() !== '' && 
               userData.location.trim() !== '' && 
               userData.selectedValues.length > 0;
      case 2:
        return userData.currentMood !== null;
      case 3:
        return userData.firstThought.trim() !== '';
      default:
        return false;
    }
  };

  // Render different content based on current step
  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Tell us about yourself</Text>
            <Text style={styles.stepDescription}>
              Create your profile to connect with others around the world
            </Text>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={userData.name}
                onChangeText={(text) => handleInputChange('name', text)}
                placeholder="Your name"
                placeholderTextColor={theme.colors.textLight}
              />
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Age (Optional)</Text>
              <TextInput
                style={styles.input}
                value={userData.age}
                onChangeText={(text) => handleInputChange('age', text)}
                placeholder="Your age"
                keyboardType="number-pad"
                placeholderTextColor={theme.colors.textLight}
              />
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Location</Text>
              <TextInput
                style={styles.input}
                value={userData.location}
                onChangeText={(text) => handleInputChange('location', text)}
                placeholder="City, Country"
                placeholderTextColor={theme.colors.textLight}
              />
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>What values are important to you?</Text>
              <Text style={styles.hint}>Select at least one</Text>
              <View style={styles.valuesContainer}>
                {valuesList.map((value) => (
                  <TouchableOpacity
                    key={value.id}
                    style={[
                      styles.valueItem,
                      userData.selectedValues.includes(value.id) && styles.valueItemSelected,
                    ]}
                    onPress={() => toggleValue(value.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.valueIcon}>{value.icon}</View>
                    <Text style={[
                      styles.valueText,
                      userData.selectedValues.includes(value.id) && styles.valueTextSelected,
                    ]}>
                      {value.name}
                    </Text>
                    {userData.selectedValues.includes(value.id) && (
                      <View style={styles.checkmark}>
                        <Check size={16} color={theme.colors.white} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        );
        
      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>How do you feel today?</Text>
            <Text style={styles.stepDescription}>
              Your emotional state helps us connect you with like-minded people
            </Text>
            
            <View style={styles.moodsContainer}>
              {moodsList.map((mood) => (
                <TouchableOpacity
                  key={mood.id}
                  style={[
                    styles.moodItem,
                    userData.currentMood === mood.id && styles.moodItemSelected,
                    { borderColor: mood.color },
                  ]}
                  onPress={() => selectMood(mood.id)}
                  activeOpacity={0.8}
                >
                  <View 
                    style={[
                      styles.moodDot, 
                      { backgroundColor: mood.color },
                      userData.currentMood === mood.id && styles.moodDotSelected,
                    ]} 
                  />
                  <Text 
                    style={[
                      styles.moodText,
                      userData.currentMood === mood.id && { color: mood.color },
                    ]}
                  >
                    {mood.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
        
      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Share your first thought</Text>
            <Text style={styles.stepDescription}>
              What was your first thought when you woke up today?
            </Text>
            
            <View style={styles.formGroup}>
              <TextInput
                style={styles.thoughtInput}
                value={userData.firstThought}
                onChangeText={(text) => handleInputChange('firstThought', text)}
                placeholder="Type your thought here..."
                placeholderTextColor={theme.colors.textLight}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            </View>
            
            <Text style={styles.hint}>
              This will be your first reflection shared with the community.
            </Text>
          </View>
        );
        
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={handleBack}
          >
            <ArrowLeft size={24} color={theme.colors.text} />
          </TouchableOpacity>
          
          <View style={styles.progressContainer}>
            {[1, 2, 3].map((s) => (
              <View 
                key={s}
                style={[
                  styles.progressStep, 
                  s <= step && styles.progressStepActive,
                ]}
              />
            ))}
          </View>
        </View>
        
        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {renderStepContent()}
        </ScrollView>
        
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.nextButton,
              !isStepComplete() && styles.nextButtonDisabled,
            ]}
            onPress={handleNext}
            disabled={!isStepComplete()}
            activeOpacity={0.8}
          >
            <Text style={styles.nextButtonText}>
              {step < 3 ? 'Continue' : 'Finish'}
            </Text>
            <ArrowRight size={20} color={theme.colors.white} />
          </TouchableOpacity>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.round,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  progressStep: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: theme.borderRadius.round,
  },
  progressStepActive: {
    backgroundColor: theme.colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: theme.spacing.lg,
  },
  stepContent: {
    padding: theme.spacing.md,
  },
  stepTitle: {
    ...theme.typography.h2,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  stepDescription: {
    ...theme.typography.body1,
    color: theme.colors.textLight,
    marginBottom: theme.spacing.lg,
  },
  formGroup: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    ...theme.typography.body2,
    fontFamily: 'Inter-Medium',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  hint: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    ...theme.typography.body1,
    color: theme.colors.text,
    backgroundColor: theme.colors.white,
  },
  thoughtInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    ...theme.typography.body1,
    color: theme.colors.text,
    backgroundColor: theme.colors.white,
    minHeight: 120,
  },
  valuesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  valueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.white,
    minWidth: '45%',
    position: 'relative',
  },
  valueItemSelected: {
    backgroundColor: theme.colors.primary + '10', // 10% opacity
    borderColor: theme.colors.primary,
  },
  valueIcon: {
    marginRight: theme.spacing.sm,
  },
  valueText: {
    ...theme.typography.body2,
    color: theme.colors.text,
  },
  valueTextSelected: {
    color: theme.colors.primary,
    fontFamily: 'Inter-Medium',
  },
  checkmark: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.round,
    padding: 2,
  },
  moodsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    justifyContent: 'space-between',
  },
  moodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.white,
    width: '48%',
    marginBottom: theme.spacing.sm,
  },
  moodItemSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  moodDot: {
    width: 16,
    height: 16,
    borderRadius: theme.borderRadius.round,
    marginRight: theme.spacing.sm,
  },
  moodDotSelected: {
    width: 20,
    height: 20,
  },
  moodText: {
    ...theme.typography.body2,
    color: theme.colors.text,
  },
  footer: {
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  nextButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  nextButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  nextButtonText: {
    ...theme.typography.button,
    color: theme.colors.white,
  },
});