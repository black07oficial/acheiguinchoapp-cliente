import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import { AGENCY_CONFIG } from '../../lib/agency';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const router = useRouter();

  async function signInWithEmail() {
    setLoading(true);
    try {
      const emailNormalized = email.trim().toLowerCase();

      const { data: { user }, error } = await supabase.auth.signInWithPassword({
        email: emailNormalized,
        password,
      });

      if (error) {
        Alert.alert('Erro no Login', 'Credenciais inválidas.');
        return;
      }

      if (!user) {
        Alert.alert('Erro no Login', 'Credenciais inválidas.');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('agency_id, role, status')
        .eq('id', user.id)
        .maybeSingle();

      const sameAgency = profile?.agency_id === AGENCY_CONFIG.ID;
      const isClient = (profile?.role || 'client') === 'client';
      const isActive = (profile?.status || 'active') === 'active';

      if (!profile || !sameAgency || !isClient || !isActive) {
        await supabase.auth.signOut();
        Alert.alert('Acesso negado', 'Este usuário não está habilitado para esta agência.');
        return;
      }

      router.replace('/(client)/home');
    } catch {
      Alert.alert('Erro no Login', 'Não foi possível autenticar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
          </TouchableOpacity>
        </View>

        {/* Header Section */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <MaterialIcons name="local-shipping" size={32} color="#137fec" />
          </View>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to request a tow or roadside assistance.</Text>
        </View>

        {/* Form Section */}
        <View style={styles.form}>
          {/* Email Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email or Phone Number</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                onChangeText={setEmail}
                value={email}
                placeholder="Enter email or phone"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
              />
              <MaterialIcons name="mail" size={20} color="#94a3b8" style={styles.inputIcon} />
            </View>
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                onChangeText={setPassword}
                value={password}
                secureTextEntry={secureTextEntry}
                placeholder="Enter your password"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setSecureTextEntry(!secureTextEntry)}>
                <MaterialIcons 
                  name={secureTextEntry ? "visibility" : "visibility-off"} 
                  size={20} 
                  color="#94a3b8" 
                  style={styles.inputIcon} 
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Forgot Password */}
          <View style={styles.forgotPasswordContainer}>
            <TouchableOpacity>
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>

          {/* Login Button */}
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={signInWithEmail}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Login as Client</Text>
                <MaterialIcons name="arrow-forward" size={20} color="white" />
              </>
            )}
          </TouchableOpacity>

          <View style={styles.registerContainer}>
             <Text style={styles.registerText}>{"Don't have an account? "}</Text>
             <TouchableOpacity onPress={() => router.push('/auth/register')}>
                 <Text style={styles.registerLink}>Sign up</Text>
             </TouchableOpacity>
          </View>
        </View>

        {/* Social Login Section */}
        <View style={styles.socialSection}>
          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>Or continue with</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.socialGrid}>
            <TouchableOpacity style={styles.socialButton}>
              {/* Placeholder for Google Logo */}
              <View style={styles.socialIconPlaceholder}>
                <Text style={{color: '#EA4335', fontWeight: 'bold'}}>G</Text>
              </View>
              <Text style={styles.socialButtonText}>Google</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.socialButton}>
              <MaterialIcons name="stars" size={22} color="#0f172a" />
              <Text style={styles.socialButtonText}>Apple</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.spacer} />

        {/* Provider Portal Card */}
        <View style={styles.providerCardContainer}>
          <View style={styles.providerCard}>
            {/* Decorative Element */}
            <View style={styles.decorativeCircle} />
            
            <View style={styles.providerCardContent}>
              <View>
                <Text style={styles.providerTitle}>Service Provider?</Text>
                <Text style={styles.providerSubtitle}>Access your driver dashboard here.</Text>
              </View>
              
              <TouchableOpacity style={styles.providerButton} onPress={() => router.push('/auth/provider-login')}>
                <Text style={styles.providerButtonText}>Login to Provider Portal</Text>
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
    backgroundColor: '#f6f7f8',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 8,
  },
  topBar: {
    paddingVertical: 16,
    marginLeft: -8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    // backgroundColor: '#e2e8f0', // Hover effect in web, maybe static in mobile
  },
  header: {
    marginBottom: 32,
  },
  iconContainer: {
    width: 56,
    height: 56,
    backgroundColor: 'rgba(19, 127, 236, 0.2)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    lineHeight: 24,
  },
  form: {
    gap: 20,
  },
  inputContainer: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    height: 56,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#0f172a',
    height: '100%',
  },
  inputIcon: {
    marginLeft: 8,
  },
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginTop: -4,
  },
  forgotPasswordText: {
    color: '#137fec',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#137fec',
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#137fec',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 8,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  socialSection: {
    marginTop: 32,
    marginBottom: 24,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  socialGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  socialButton: {
    flex: 1,
    height: 48,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  socialIconPlaceholder: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  spacer: {
    flex: 1,
  },
  providerCardContainer: {
    marginTop: 16,
    paddingBottom: 8,
  },
  providerCard: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    position: 'relative',
  },
  decorativeCircle: {
    position: 'absolute',
    right: -24,
    top: -24,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(19, 127, 236, 0.1)',
  },
  providerCardContent: {
    alignItems: 'center',
    gap: 12,
  },
  providerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'center',
  },
  providerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  providerButton: {
    width: '100%',
    backgroundColor: 'white',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    marginTop: 8,
  },
  providerButtonText: {
    color: '#137fec',
    fontWeight: 'bold',
    fontSize: 14,
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  registerText: {
    color: '#64748b',
    fontSize: 14,
  },
  registerLink: {
    color: '#137fec',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
