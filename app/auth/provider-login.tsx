import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform, StatusBar as RNStatusBar, Dimensions, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import { useDynamicTheme, THEME_COLORS } from '../../hooks/use-dynamic-theme';
import { AGENCY_CONFIG } from '../../lib/agency';

const { width, height } = Dimensions.get('window');

export default function ProviderLogin() {
  const { isDark, theme: dynamicTheme } = useDynamicTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [secureTextEntry, setSecureTextEntry] = useState(true);

  async function signInProvider() {
    setLoading(true);
    try {
      const emailNormalized = email.trim().toLowerCase();

      // 1. Authenticate user
      const { data: { user }, error } = await supabase.auth.signInWithPassword({
        email: emailNormalized,
        password,
      });

      if (error) throw error;

      if (!user) throw new Error('No user found');

      const { data: profile } = await supabase
        .from('profiles')
        .select('agency_id, role')
        .eq('id', user.id)
        .maybeSingle();

      const sameAgency = profile?.agency_id === AGENCY_CONFIG.ID;
      const isProvider = profile?.role === 'provider';

      if (!profile || !sameAgency || !isProvider) {
        await supabase.auth.signOut();
        Alert.alert(
          'Usuário não registrado',
          `Esta conta não está cadastrada como prestador nesta agência/app (${AGENCY_CONFIG.SLUG}). Se você foi cadastrado pelo call center, confirme que o call center está na mesma agência deste app.`
        );
        return;
      }

      const { data: provider, error: providerError } = await supabase
        .from('prestadores')
        .select('id')
        .eq('id', user.id)
        .eq('agency_id', AGENCY_CONFIG.ID)
        .maybeSingle();

      if (providerError || !provider) {
        router.replace({
          pathname: '/auth/provider-register',
          params: { mode: 'complete' },
        });
        return;
      }

      router.replace('/(provider)/home');

    } catch (err: any) {
      Alert.alert('Login Failed', err.message);
    } finally {
      setLoading(false);
    }
  }

  const loginStyles = StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: 24,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    content: {
      flex: 1,
    }
  });

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: dynamicTheme.background }]}
    >
      <RNStatusBar barStyle={dynamicTheme.statusBar} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={loginStyles.header}>
          <TouchableOpacity 
            style={[loginStyles.backButton, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]} 
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back-ios" size={20} color={dynamicTheme.text} />
          </TouchableOpacity>
        </View>

        <View style={loginStyles.content}>
          <View style={[styles.logoContainer, { backgroundColor: THEME_COLORS.primary + '20' }]}>
            <MaterialIcons name="local-shipping" size={40} color={THEME_COLORS.primary} />
          </View>
          
          <Text style={[styles.title, { color: dynamicTheme.text }]}>Bem-vindo, Prestador</Text>
          <Text style={[styles.subtitle, { color: dynamicTheme.textSecondary }]}>Faça login para começar a receber solicitações</Text>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: dynamicTheme.text }]}>E-mail</Text>
              <View style={[styles.inputWrapper, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}>
                <MaterialIcons name="email" size={20} color={dynamicTheme.textSecondary} style={styles.inputIcon} />
                <TextInput 
                  style={[styles.input, { color: dynamicTheme.text, backgroundColor: 'transparent' }]}
                  placeholder="seu@email.com"
                  placeholderTextColor={dynamicTheme.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: dynamicTheme.text }]}>Senha</Text>
              <View style={[styles.inputWrapper, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}>
                <MaterialIcons name="lock" size={20} color={dynamicTheme.textSecondary} style={styles.inputIcon} />
                <TextInput 
                  style={[styles.input, { color: dynamicTheme.text, backgroundColor: 'transparent' }]}
                  placeholder="Sua senha"
                  placeholderTextColor={dynamicTheme.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={secureTextEntry}
                />
                <TouchableOpacity 
                  onPress={() => setSecureTextEntry(!secureTextEntry)}
                  style={styles.eyeIcon}
                >
                  <MaterialIcons 
                    name={secureTextEntry ? "visibility-off" : "visibility"} 
                    size={20} 
                    color={dynamicTheme.textSecondary} 
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.loginButton, { backgroundColor: THEME_COLORS.primary }]} 
              onPress={signInProvider}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={isDark ? '#0A0E12' : '#FFFFFF'} />
              ) : (
                <Text style={[styles.loginButtonText, { color: isDark ? '#0A0E12' : '#FFFFFF' }]}>Entrar</Text>
              )}
            </TouchableOpacity>

            <View style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={[styles.footerText, { color: dynamicTheme.textSecondary }]}>Ainda não tem conta de prestador?</Text>
              <TouchableOpacity
                style={[styles.backLink, { marginTop: 10 }]}
                onPress={() => router.push('/auth/provider-register')}
              >
                <Text style={[styles.backLinkText, { color: THEME_COLORS.primary }]}>Cadastrar como Prestador</Text>
                <MaterialIcons name="arrow-forward" size={16} color={THEME_COLORS.primary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101922', // background-dark
    position: 'relative',
  },
  bgGlowTop: {
    position: 'absolute',
    top: -height * 0.1,
    left: -width * 0.1,
    width: width * 0.5,
    height: height * 0.4,
    borderRadius: 999,
    backgroundColor: 'rgba(19, 127, 236, 0.1)', // primary/10
    transform: [{ scale: 1.5 }],
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: -height * 0.1,
    right: -width * 0.1,
    width: width * 0.5,
    height: height * 0.4,
    borderRadius: 999,
    backgroundColor: 'rgba(19, 127, 236, 0.05)', // primary/5
    transform: [{ scale: 1.5 }],
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: 60,
  },
  brandingSection: {
    alignItems: 'center',
    marginBottom: 40,
    gap: 24,
  },
  logoContainer: {
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#137fec',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  titleContainer: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: 'white',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#92adc9',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '500',
  },
  form: {
    width: '100%',
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#cbd5e1',
    marginLeft: 4,
  },
  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
  },
  input: {
    flex: 1,
    height: 56,
    backgroundColor: '#233648', // input-dark
    borderRadius: 12,
    paddingLeft: 48, // space for icon
    paddingRight: 16,
    color: 'white',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  eyeIcon: {
    position: 'absolute',
    right: 0,
    height: '100%',
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotPassword: {
    alignItems: 'flex-end',
    marginTop: -4,
  },
  forgotPasswordText: {
    color: '#137fec', // primary
    fontSize: 14,
    fontWeight: '600',
  },
  loginButton: {
    height: 56,
    backgroundColor: '#137fec',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#137fec',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
    marginTop: 8,
  },
  loginButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  biometricText: {
    color: '#92adc9',
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    marginTop: 40,
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    color: '#92adc9',
    fontSize: 14,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backLinkText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
});
