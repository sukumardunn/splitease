import React, { useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  Platform
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Globe } from 'lucide-react-native';
import { theme } from '@/constants/theme';

// Mock function to check if user is already logged in
const checkIfLoggedIn = () => {
  // In a real app, check AsyncStorage or similar for auth token
  return false;
};

export default function WelcomeScreen() {
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      // Check if user is already logged in
      if (checkIfLoggedIn()) {
        router.replace('/(tabs)');
      }
    }, [router])
  );

  const handleSignUp = () => {
    router.push('/onboarding');
  };

  const handleLogin = () => {
    router.push('/(auth)/login');
  };

  return (
    <ImageBackground
      source={{ uri: 'https://images.pexels.com/photos/1261728/pexels-photo-1261728.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2' }}
      style={styles.background}
    >
      <StatusBar style="light" />
      <LinearGradient
        colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.7)']}
        style={styles.overlay}
      >
        <View style={styles.container}>
          <View style={styles.logoContainer}>
            <Globe color={theme.colors.white} size={80} strokeWidth={1.5} />
            <Text style={styles.appName}>ONE WORLD</Text>
          </View>

          <View style={styles.contentContainer}>
            <Text style={styles.tagline}>
              We are all connected. Let's reflect together.
            </Text>
            
            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={[styles.button, styles.primaryButton]} 
                onPress={handleSignUp}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>Get Started</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.button, styles.secondaryButton]} 
                onPress={handleLogin}
                activeOpacity={0.8}
              >
                <Text style={styles.secondaryButtonText}>I Already Have an Account</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </LinearGradient>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
    paddingVertical: 80,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  appName: {
    fontFamily: 'Playfair-Bold',
    fontSize: 36,
    color: theme.colors.white,
    marginTop: 16,
    letterSpacing: 2,
  },
  contentContainer: {
    width: '100%',
    alignItems: 'center',
  },
  tagline: {
    fontFamily: 'Inter-Regular',
    fontSize: 18,
    color: theme.colors.white,
    textAlign: 'center',
    marginBottom: 48,
    lineHeight: 28,
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: theme.colors.white,
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: theme.colors.white,
  },
  secondaryButtonText: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    color: theme.colors.white,
  },
});