import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, KeyboardAvoidingView, Alert, ActivityIndicator, Image, Modal, Switch, StatusBar as RNStatusBar } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { useDynamicTheme, THEME_COLORS } from '../../hooks/use-dynamic-theme';
import { AGENCY_CONFIG } from '../../lib/agency';

export default function ProviderRegister() {
  const { isDark, theme: dynamicTheme } = useDynamicTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const isCompleteMode = String(params?.mode ?? '') === 'complete';
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappSameAsPhone, setWhatsappSameAsPhone] = useState(true);
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Vehicle Data
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleColor, setVehicleColor] = useState('White');
  const [vehicleCategory, setVehicleCategory] = useState('Leve');
  const [serviceTypes, setServiceTypes] = useState<string[]>(['Towing']);

  // Docs
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [vehicleDoc, setVehicleDoc] = useState<any>(null);

  // Dropdown States
  const [showColorDropdown, setShowColorDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  const colors = ['White', 'Black', 'Red', 'Silver', 'Blue', 'Other'];
  const categories = ['Leve', 'Médio', 'Pesado'];
  const availableServices = ['Towing', 'Tire Change', 'Jump Start', 'Fuel Delivery', 'Lockout'];

  const mapVehicleCategoryToEnum = (label: string) => {
    const v = label.trim().toLowerCase();
    if (v.startsWith('pes')) return 'pesado';
    if (v.startsWith('m')) return 'medio';
    return 'leve';
  };

  const toggleService = (service: string) => {
    if (serviceTypes.includes(service)) {
      setServiceTypes(serviceTypes.filter(s => s !== service));
    } else {
      setServiceTypes([...serviceTypes, service]);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      setProfilePhoto(result.assets[0].uri);
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      
      if (result.assets && result.assets[0]) {
        setVehicleDoc(result.assets[0]);
      }
    } catch (err) {
      console.log('Error picking document:', err);
    }
  };

  useEffect(() => {
    if (!isCompleteMode) return;
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) return;

      const meta = (user.user_metadata || {}) as any;
      setEmail(String(user.email || ''));
      setFullName(String(meta.full_name || meta.name || ''));
      setPhone(String(meta.phone || ''));

      const { data: provider } = await supabase
        .from('prestadores')
        .select('telefone, whatsapp, placa_veiculo, placa, modelo_veiculo, cor_veiculo, ano_veiculo, categoria_veiculo, categoria, regiao')
        .eq('id', user.id)
        .maybeSingle();

      if (provider) {
        setPhone(String((provider as any).telefone || meta.phone || ''));
        setWhatsapp(String((provider as any).whatsapp || ''));
        setVehiclePlate(String((provider as any).placa_veiculo || (provider as any).placa || ''));
        setVehicleYear(String((provider as any).ano_veiculo || ''));
        setVehicleColor(String((provider as any).cor_veiculo || 'White'));
      }
    });
  }, [isCompleteMode]);

  const uploadFile = async (uri: string, path: string) => {
      try {
          const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
          const { error } = await supabase.storage.from('documents').upload(path, decode(base64), {
              contentType: 'image/jpeg', // Simplification, ideally detect mime type
              upsert: true
          });
          if (error) throw error;
          return true;
      } catch (error) {
          console.error('Upload failed:', error);
          return false;
      }
  };

  const upsertPrestador = async (userId: string, emailNormalized: string) => {
    let profileUrl: string | null = null;
    if (profilePhoto) {
      const path = `${userId}/profile_photo.jpg`;
      await uploadFile(profilePhoto, path);
      profileUrl = path;
    }

    let docUrl: string | null = null;
    if (vehicleDoc) {
      const path = `${userId}/vehicle_doc_${Date.now()}.jpg`;
      await uploadFile(vehicleDoc.uri, path);
      docUrl = path;
    }

    const categoriaEnum = mapVehicleCategoryToEnum(vehicleCategory);

    const { error: dbError } = await supabase
      .from('prestadores')
      .upsert(
        {
          id: userId,
          nome: fullName,
          email: emailNormalized,
          telefone: phone,
          whatsapp: whatsappSameAsPhone ? phone : whatsapp,
          placa_veiculo: vehiclePlate,
          ano_veiculo: Number(vehicleYear),
          cor_veiculo: vehicleColor,
          categoria_veiculo: categoriaEnum,
          servicos: serviceTypes,
          online: false,
          status: 'offline',
          agency_id: null, // Prestadores que se cadastram pelo App são autônomos (sem agência)
        } as any,
        { onConflict: 'id' },
      );

    if (dbError) throw dbError;
  };

  async function handleRegister() {
    if (!fullName || !email || !phone || !vehiclePlate || !vehicleYear) {
        Alert.alert('Missing Fields', 'Please fill in all required fields.');
        return;
    }

    if (!isCompleteMode) {
      if (!password || password.length < 10) {
          Alert.alert('Weak Password', 'Use a password with at least 10 characters.');
          return;
      }

      if (password !== confirmPassword) {
          Alert.alert('Password Mismatch', 'Password and confirmation do not match.');
          return;
      }
    }

    setLoading(true);
    try {
      const emailNormalized = email.trim().toLowerCase();

      if (isCompleteMode) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          Alert.alert('Sessão necessária', 'Faça login como prestador e complete o cadastro.');
          router.replace('/auth/provider-login');
          return;
        }

        await upsertPrestador(user.id, emailNormalized);
        Alert.alert('Cadastro finalizado', 'Seu perfil de prestador foi concluído.', [
          { text: 'OK', onPress: () => router.replace('/(provider)/home') },
        ]);
        return;
      }

      // 1. Sign Up Auth User
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: emailNormalized,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: phone,
            role: 'provider', 
            agency_id: null, // Autônomo
          },
        },
      });

      if (authError) throw authError;

      if (authData.session) {
        const userId = authData.user?.id;
        if (!userId) throw new Error('User ID not found');

        await upsertPrestador(userId, emailNormalized);

        Alert.alert(
          'Registration Complete', 
          'Your account has been created and documents uploaded.',
          [{ text: 'OK', onPress: () => router.replace('/(provider)/home') }]
        );
      } else {
        Alert.alert(
          'Check your Email',
          'We sent a confirmation link. After confirming, log in and finish the provider profile.',
          [{ text: 'OK', onPress: () => router.replace('/auth/provider-login') }]
        );
      }

    } catch (error: any) {
      const msg = String(error?.message ?? 'Unknown error');
      if (msg.toLowerCase().includes('already registered')) {
        Alert.alert('Email already registered', 'This email already has an account. Please sign in or reset your password.');
        return;
      }
      Alert.alert('Registration Error', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: dynamicTheme.background }]} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <RNStatusBar barStyle={dynamicTheme.statusBar} />
      {/* Header */}
      <View style={[styles.header, { backgroundColor: dynamicTheme.card, borderBottomColor: dynamicTheme.border }]}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: dynamicTheme.background }]} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back-ios" size={20} color={dynamicTheme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: dynamicTheme.text }]}>Cadastro de Prestador</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress Bar */}
      <View style={[styles.progressSection, { backgroundColor: dynamicTheme.background }]}>
        <View style={styles.progressLabels}>
           <Text style={[styles.progressStep, { color: dynamicTheme.textSecondary }]}>{isCompleteMode ? 'Passo 2 de 2' : 'Passo 1 de 2'}</Text>
           <Text style={[styles.progressPercent, { color: THEME_COLORS.primary }]}>{isCompleteMode ? '100% Completo' : '50% Completo'}</Text>
        </View>
        <View style={[styles.progressBarBg, { backgroundColor: dynamicTheme.border }]}>
            <View style={[styles.progressBarFill, { width: isCompleteMode ? '100%' : '50%', backgroundColor: THEME_COLORS.primary }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Section 1: Personal Information */}
        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                <View style={[styles.sectionBadge, { backgroundColor: THEME_COLORS.primary + '20' }]}>
                    <Text style={[styles.sectionBadgeText, { color: THEME_COLORS.primary }]}>1</Text>
                </View>
                <Text style={[styles.sectionTitle, { color: dynamicTheme.text }]}>Informações Pessoais</Text>
            </View>

            <View style={styles.formGroup}>
                <Text style={[styles.label, { color: dynamicTheme.text }]}>Nome Completo</Text>
                <TextInput 
                    style={[styles.input, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border, color: dynamicTheme.text }]} 
                    placeholder="Ex: João Silva"
                    placeholderTextColor={dynamicTheme.textSecondary}
                    value={fullName}
                    onChangeText={setFullName}
                />
            </View>

            <View style={styles.formGroup}>
                <Text style={[styles.label, { color: dynamicTheme.text }]}>E-mail</Text>
                <TextInput 
                    style={[styles.input, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border, color: dynamicTheme.text }]} 
                    placeholder="nome@exemplo.com"
                    placeholderTextColor={dynamicTheme.textSecondary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                />
            </View>

            <View style={styles.formGroup}>
                <Text style={[styles.label, { color: dynamicTheme.text }]}>Telefone</Text>
                <View style={styles.inputIconWrapper}>
                    <MaterialIcons name="call" size={20} color={dynamicTheme.textSecondary} style={styles.inputIcon} />
                    <TextInput 
                        style={[styles.input, { paddingLeft: 40, backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border, color: dynamicTheme.text }]} 
                        placeholder="(00) 00000-0000"
                        placeholderTextColor={dynamicTheme.textSecondary}
                        keyboardType="phone-pad"
                        value={phone}
                        onChangeText={setPhone}
                    />
                </View>
            </View>

            <View style={styles.switchRow}>
                <View style={styles.switchLabelContainer}>
                    <MaterialIcons name="chat" size={20} color="#25D366" />
                    <Text style={[styles.switchLabel, { color: dynamicTheme.textSecondary }]}>Mesmo que WhatsApp?</Text>
                </View>
                <Switch 
                    value={whatsappSameAsPhone}
                    onValueChange={setWhatsappSameAsPhone}
                    trackColor={{ false: dynamicTheme.border, true: THEME_COLORS.primary }}
                    thumbColor={"white"}
                />
            </View>

            {!whatsappSameAsPhone && (
                <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: dynamicTheme.text }]}>Número do WhatsApp</Text>
                    <TextInput 
                        style={[styles.input, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border, color: dynamicTheme.text }]} 
                        placeholder="(00) 00000-0000"
                        placeholderTextColor={dynamicTheme.textSecondary}
                        keyboardType="phone-pad"
                        value={whatsapp}
                        onChangeText={setWhatsapp}
                    />
                </View>
            )}
             
             {!isCompleteMode && (
                <>
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: dynamicTheme.text }]}>Senha</Text>
                        <TextInput 
                            style={[styles.input, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border, color: dynamicTheme.text }]} 
                            placeholder="Crie uma senha"
                            placeholderTextColor={dynamicTheme.textSecondary}
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                        />
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: dynamicTheme.text }]}>Confirmar Senha</Text>
                        <TextInput 
                            style={[styles.input, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border, color: dynamicTheme.text }]} 
                            placeholder="Repita sua senha"
                            placeholderTextColor={dynamicTheme.textSecondary}
                            secureTextEntry
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                        />
                    </View>
                </>
            )}
        </View>

        <View style={[styles.divider, { backgroundColor: dynamicTheme.border }]} />

        {/* Section 2: Vehicle Details */}
        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                <View style={[styles.sectionBadge, { backgroundColor: THEME_COLORS.primary + '20' }]}>
                    <Text style={[styles.sectionBadgeText, { color: THEME_COLORS.primary }]}>2</Text>
                </View>
                <Text style={[styles.sectionTitle, { color: dynamicTheme.text }]}>Detalhes do Veículo</Text>
            </View>

            <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 2, marginRight: 12 }]}>
                    <Text style={[styles.label, { color: dynamicTheme.text }]}>Placa</Text>
                    <TextInput 
                        style={[styles.input, { textTransform: 'uppercase', backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border, color: dynamicTheme.text }]} 
                        placeholder="ABC-1234"
                        placeholderTextColor={dynamicTheme.textSecondary}
                        value={vehiclePlate}
                        onChangeText={setVehiclePlate}
                        autoCapitalize="characters"
                    />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={[styles.label, { color: dynamicTheme.text }]}>Ano</Text>
                    <TextInput 
                        style={[styles.input, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border, color: dynamicTheme.text }]} 
                        placeholder="2020"
                        placeholderTextColor={dynamicTheme.textSecondary}
                        keyboardType="numeric"
                        value={vehicleYear}
                        onChangeText={setVehicleYear}
                    />
                </View>
            </View>

            <View style={styles.row}>
                {/* Color Dropdown */}
                <View style={[styles.formGroup, { flex: 1, marginRight: 12 }]}>
                    <Text style={[styles.label, { color: dynamicTheme.text }]}>Cor</Text>
                    <TouchableOpacity 
                        style={[styles.selectInput, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}
                        onPress={() => setShowColorDropdown(!showColorDropdown)}
                    >
                        <Text style={[styles.selectInputText, { color: dynamicTheme.text }]}>{vehicleColor}</Text>
                        <MaterialIcons name="expand-more" size={20} color={dynamicTheme.textSecondary} />
                    </TouchableOpacity>
                    {showColorDropdown && (
                        <View style={[styles.dropdown, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}>
                            {colors.map(c => (
                                <TouchableOpacity 
                                    key={c} 
                                    style={[styles.dropdownItem, { borderBottomColor: dynamicTheme.border }]}
                                    onPress={() => {
                                        setVehicleColor(c);
                                        setShowColorDropdown(false);
                                    }}
                                >
                                    <Text style={[styles.dropdownItemText, { color: dynamicTheme.text }]}>{c}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                {/* Category Dropdown */}
                <View style={[styles.formGroup, { flex: 1.5 }]}>
                    <Text style={[styles.label, { color: dynamicTheme.text }]}>Categoria</Text>
                    <TouchableOpacity 
                        style={[styles.selectInput, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}
                        onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
                    >
                        <Text style={[styles.selectInputText, { color: dynamicTheme.text }]} numberOfLines={1}>{vehicleCategory}</Text>
                        <MaterialIcons name="expand-more" size={20} color={dynamicTheme.textSecondary} />
                    </TouchableOpacity>
                     {showCategoryDropdown && (
                        <View style={[styles.dropdown, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}>
                            {categories.map(c => (
                                <TouchableOpacity 
                                    key={c} 
                                    style={[styles.dropdownItem, { borderBottomColor: dynamicTheme.border }]}
                                    onPress={() => {
                                        setVehicleCategory(c);
                                        setShowCategoryDropdown(false);
                                    }}
                                >
                                    <Text style={[styles.dropdownItemText, { color: dynamicTheme.text }]}>{c}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>
            </View>

            <View style={styles.formGroup}>
                <Text style={[styles.label, { color: dynamicTheme.text }]}>Tipos de Serviço</Text>
                <View style={styles.pillsContainer}>
                    {availableServices.map(service => {
                        const isSelected = serviceTypes.includes(service);
                        return (
                            <TouchableOpacity 
                                key={service}
                                style={[styles.pill, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }, isSelected && { backgroundColor: THEME_COLORS.primary + '20', borderColor: THEME_COLORS.primary }]}
                                onPress={() => toggleService(service)}
                            >
                                <Text style={[styles.pillText, { color: dynamicTheme.textSecondary }, isSelected && { color: THEME_COLORS.primary }]}>
                                    {service}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        </View>

        <View style={[styles.divider, { backgroundColor: dynamicTheme.border }]} />

        {/* Section 3: Documents */}
        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                <View style={[styles.sectionBadge, { backgroundColor: THEME_COLORS.primary + '20' }]}>
                    <Text style={[styles.sectionBadgeText, { color: THEME_COLORS.primary }]}>3</Text>
                </View>
                <Text style={[styles.sectionTitle, { color: dynamicTheme.text }]}>Documentos</Text>
            </View>

            <View style={styles.docsGrid}>
                {/* Profile Photo */}
                <View style={styles.docItem}>
                    <Text style={[styles.label, { color: dynamicTheme.text }]}>Foto de Perfil</Text>
                    <TouchableOpacity style={[styles.uploadCard, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]} onPress={pickImage}>
                        {profilePhoto ? (
                             <Image source={{ uri: profilePhoto }} style={styles.uploadedImage} />
                        ) : (
                            <View style={[styles.uploadIconCircle, { backgroundColor: THEME_COLORS.primary + '10' }]}>
                                <MaterialIcons name="person-add" size={24} color={THEME_COLORS.primary} />
                            </View>
                        )}
                        <Text style={[styles.uploadText, { color: dynamicTheme.textSecondary }]}>
                            {profilePhoto ? 'Alterar Foto' : 'Adicionar Foto'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Vehicle Doc */}
                <View style={styles.docItem}>
                    <Text style={[styles.label, { color: dynamicTheme.text }]}>Doc. do Veículo</Text>
                    <TouchableOpacity style={[styles.uploadCard, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]} onPress={pickDocument}>
                        <View style={[styles.uploadIconCircle, { backgroundColor: THEME_COLORS.primary + '10' }]}>
                            <MaterialIcons name={vehicleDoc ? "check" : "upload-file"} size={24} color={THEME_COLORS.primary} />
                        </View>
                        <Text style={[styles.uploadText, { color: dynamicTheme.textSecondary }]} numberOfLines={1}>
                             {vehicleDoc ? vehicleDoc.name : 'Upload PDF/Img'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={[styles.infoBox, { backgroundColor: THEME_COLORS.primary + '10' }]}>
                <MaterialIcons name="info" size={18} color={THEME_COLORS.primary} style={{ marginTop: 2 }} />
                <Text style={[styles.infoText, { color: dynamicTheme.textSecondary }]}>
                    Certifique-se de que todas as fotos estejam nítidas e o texto legível. Os documentos são verificados manualmente em até 24 horas.
                </Text>
            </View>
        </View>

        <View style={{ height: 100 }} /> 
      </ScrollView>

      {/* Sticky Footer */}
      <View style={[styles.footer, { backgroundColor: dynamicTheme.background }]}>
          <TouchableOpacity style={[styles.submitButton, { backgroundColor: THEME_COLORS.primary }]} onPress={handleRegister} disabled={loading}>
              {loading ? (
                  <ActivityIndicator color={isDark ? '#0A0E12' : '#FFFFFF'} />
              ) : (
                  <>
                    <Text style={[styles.submitButtonText, { color: isDark ? '#0A0E12' : '#FFFFFF' }]}>Concluir Cadastro</Text>
                    <MaterialIcons name="check-circle" size={20} color={isDark ? '#0A0E12' : '#FFFFFF'} />
                  </>
              )}
          </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f7f8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    backgroundColor: 'rgba(255,255,255,0.95)',
    zIndex: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  progressSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f6f7f8',
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    alignItems: 'flex-end',
  },
  progressStep: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '500',
    color: '#137fec',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#137fec',
    borderRadius: 3,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sectionBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(19, 127, 236, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#137fec',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f8fafc', // gray-50
    borderWidth: 1,
    borderColor: '#e2e8f0', // gray-200
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
  },
  inputIconWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 4,
  },
  switchLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchLabel: {
    fontSize: 14,
    color: '#475569',
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 16,
    marginVertical: 8,
  },
  row: {
    flexDirection: 'row',
  },
  selectInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectInputText: {
    fontSize: 16,
    color: '#0f172a',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    zIndex: 50,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#334155',
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pillSelected: {
    backgroundColor: 'rgba(19, 127, 236, 0.2)',
    borderColor: '#137fec',
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
  },
  pillTextSelected: {
    color: '#137fec',
  },
  docsGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  docItem: {
    flex: 1,
  },
  uploadCard: {
    aspectRatio: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  uploadIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(19, 127, 236, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  uploadedImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    position: 'absolute',
  },
  uploadText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(59, 130, 246, 0.1)', // blue-500/10
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    backgroundColor: 'transparent', 
  },
  submitButton: {
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
    shadowRadius: 10,
    elevation: 4,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
