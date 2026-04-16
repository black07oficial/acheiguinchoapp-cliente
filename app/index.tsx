import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, Dimensions, StatusBar as RNStatusBar, ImageBackground } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useDynamicTheme, THEME_COLORS } from '../hooks/use-dynamic-theme';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

export default function Welcome() {
  const { isDark, theme: dynamicTheme } = useDynamicTheme();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Background Image Layer with Deep Blur */}
      <View style={StyleSheet.absoluteFillObject}>
        <ImageBackground
          source={require('../assets/images/splash-icon.png')}
          style={[StyleSheet.absoluteFillObject, { transform: [{ scale: 1.1 }] }]}
          blurRadius={Platform.OS === 'ios' ? 8 : 4}
        />
        {/* Dynamic Overlays */}
        <LinearGradient
          colors={['rgba(10, 15, 20, 0.4)', 'rgba(10, 15, 20, 0.6)', '#0a0f14']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0, 0, 0, 0.2)' }]} />
      </View>

      {/* Content Layout */}
      <View style={styles.content}>

        {/* Logo Section */}
        <View style={styles.logoSection}>
          <Image
            source={require('../assets/images/guincho.png')}
            style={styles.logo}
            tintColor="#FFFFFF"
            resizeMode="contain"
          />
          <Text style={styles.brandName}>ACHEI GUINCHO</Text>
        </View>

        {/* Bottom Content (Glassmorphism card feel) */}
        <View style={styles.bottomContent}>

          {/* Headline */}
          <View style={styles.headlineContainer}>
            <Text style={styles.headline}>
              Socorro rápido{'\n'}na palma da{'\n'}sua mão
            </Text>
            <View style={[styles.separator, { backgroundColor: THEME_COLORS.primary }]} />
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>

            {/* Primary Action (Brand Teal) */}
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: THEME_COLORS.primary, shadowColor: THEME_COLORS.primary, elevation: 8 }]}
              activeOpacity={0.8}
              onPress={() => router.push('/auth/login')}
            >
              <Text style={[styles.primaryButtonText, { color: '#0a0f14' }]}>Entrar / Cadastro</Text>
              <MaterialIcons name="arrow-forward" size={22} color="#0a0f14" style={{ marginLeft: 8 }} />
            </TouchableOpacity>

            {/* Secondary Action (Glassmorphism) */}
            <TouchableOpacity
              style={styles.glassButton}
              activeOpacity={0.8}
              onPress={async () => {
                const { error } = await supabase.auth.signInAnonymously();
                if (error) {
                  console.error('Erro ao entrar como visitante:', error);
                }
                router.push('/(tabs)/home');
              }}
            >
              <Text style={styles.secondaryButtonText}>Entrar sem login</Text>
            </TouchableOpacity>
          </View>

          {/* Footer Legal */}
          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>
              Ao continuar, você concorda com nossos{'\n'}
              <Text style={styles.footerLink}>Termos de Uso</Text> & <Text style={styles.footerLink}>Privacidade</Text>
            </Text>
          </View>

        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f14',
  },
  content: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 48,
    justifyContent: 'space-between',
    zIndex: 10,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 'auto',
  },
  logo: {
    width: 128,
    height: 128,
    marginBottom: 16,
  },
  brandName: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 24,
    letterSpacing: -1,
    textTransform: 'uppercase',
  },
  bottomContent: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    alignItems: 'center',
  },
  headlineContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 32,
  },
  headline: {
    color: '#FFFFFF',
    letterSpacing: -0.5,
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 44,
    textAlign: 'center',
    marginBottom: 16,
  },
  separator: {
    width: 48,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
  },
  primaryButton: {
    width: '100%',
    height: 64,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  glassButton: {
    width: '100%',
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  footerContainer: {
    marginTop: 40,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  footerLink: {
    color: '#FFFFFF',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(255, 255, 255, 0.2)',
  },
});
