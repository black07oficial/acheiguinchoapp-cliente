import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, Dimensions, StatusBar as RNStatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useDynamicTheme, THEME_COLORS } from '../hooks/use-dynamic-theme';
import { StatusBar } from 'expo-status-bar';

export default function Welcome() {
  const { isDark, theme: dynamicTheme } = useDynamicTheme();
  const router = useRouter();
  const [userType, setUserType] = useState<'client' | 'provider' | null>(null);

  if (!userType) {
    return (
      <View style={[styles.container, { backgroundColor: dynamicTheme.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <LinearGradient
          colors={isDark ? ['#0A0E12', '#1C2630'] : ['#F3F4F6', '#FFFFFF']}
          style={styles.container}
        >
          <View style={styles.content}>
            <View style={[styles.logoContainer, { backgroundColor: THEME_COLORS.primary + '20', width: 120, height: 120, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }]}>
              <MaterialIcons name="local-shipping" size={60} color={THEME_COLORS.primary} />
            </View>
            
            <Text style={[styles.title, { color: dynamicTheme.text }]}>Guincho App</Text>
            <Text style={[styles.subtitle, { color: dynamicTheme.textSecondary }]}>Sua solução rápida para guinchos e assistência 24h</Text>
            
            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={[styles.button, styles.primaryButton, { backgroundColor: THEME_COLORS.primary }]}
                onPress={() => setUserType('client')}
              >
                <Text style={[styles.buttonText, { color: isDark ? '#0A0E12' : '#FFFFFF' }]}>Fazer uma Solicitação</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.button, styles.secondaryButton, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}
                onPress={() => setUserType('provider')}
              >
                <Text style={[styles.buttonText, styles.secondaryButtonText, { color: dynamicTheme.text }]}>Sou Prestador (Motorista)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: dynamicTheme.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.content}>
        <Text style={[styles.title, { color: dynamicTheme.text }]}>{userType === 'client' ? 'Cliente' : 'Prestador'}</Text>
        <Text style={[styles.subtitle, { color: dynamicTheme.textSecondary }]}>
          {userType === 'client' 
            ? 'Peça seu guincho agora mesmo, sem complicações.' 
            : 'Acesse sua conta para começar a atender chamados.'}
        </Text>
        
        <View style={styles.buttonContainer}>
          {userType === 'client' ? (
            <>
              <TouchableOpacity 
                style={[styles.button, styles.primaryButton, { backgroundColor: THEME_COLORS.primary }]}
                onPress={() => router.push('/(client)/home')}
              >
                <Text style={[styles.buttonText, { color: isDark ? '#0A0E12' : '#FFFFFF' }]}>Entrar como Visitante</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.button, styles.secondaryButton, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}
                onPress={() => router.push('/auth/login')}
              >
                <Text style={[styles.buttonText, styles.secondaryButtonText, { color: dynamicTheme.text }]}>Já tenho uma conta</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity 
                style={[styles.button, styles.primaryButton, { backgroundColor: THEME_COLORS.primary }]}
                onPress={() => router.push('/auth/provider-login')}
              >
                <Text style={[styles.buttonText, { color: isDark ? '#0A0E12' : '#FFFFFF' }]}>Entrar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.button, styles.secondaryButton, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}
                onPress={() => router.push('/auth/provider-register')}
              >
                <Text style={[styles.buttonText, styles.secondaryButtonText, { color: dynamicTheme.text }]}>Quero ser parceiro</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => setUserType(null)}
          >
            <Text style={[styles.backButtonText, { color: dynamicTheme.textSecondary }]}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101922',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    padding: 24,
    alignItems: 'center',
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#92adc9',
    marginBottom: 48,
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
  },
  button: {
    width: '100%',
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#137fec',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#324d67',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButtonText: {
    color: '#92adc9',
  },
  backButton: {
    marginTop: 16,
    padding: 8,
  },
  backButtonText: {
    color: '#92adc9',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
