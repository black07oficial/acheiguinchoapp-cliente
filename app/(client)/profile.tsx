import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, Platform, ActivityIndicator, Alert, StatusBar as RNStatusBar } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { useDynamicTheme, THEME_COLORS } from '../../hooks/use-dynamic-theme';

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0][0]?.toUpperCase() || '?';
}

export default function Profile() {
  const { isDark, theme: dynamicTheme } = useDynamicTheme();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('User not authenticated in Profile');
        return;
      }

      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error querying clientes table:', error);
      }

      if (data) {
        setProfile(data);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handlePickAvatar() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Precisamos de acesso à galeria para alterar sua foto.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (result.canceled || !result.assets[0].base64) return;

      setUploadingAvatar(true);
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const fileName = `${profile.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, decode(asset.base64 || ''), {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('clientes')
        .update({ avatar_url: avatarUrl })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      setProfile({ ...profile, avatar_url: avatarUrl });
      Alert.alert('Foto atualizada!', 'Sua foto de perfil foi alterada com sucesso.');
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      Alert.alert('Erro', error.message || 'Não foi possível alterar a foto.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: dynamicTheme.background }]}>
        <ActivityIndicator size="large" color={THEME_COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: dynamicTheme.background }]}>
      <RNStatusBar barStyle={dynamicTheme.statusBar} />
      {/* Top App Bar */}
      <View style={[styles.header, { backgroundColor: dynamicTheme.card, borderBottomColor: dynamicTheme.border }]}>
        <Text style={[styles.headerTitle, { color: dynamicTheme.text }]}>Meu Perfil</Text>
        <TouchableOpacity style={styles.settingsButton}>
          <MaterialIcons name="settings" size={24} color={dynamicTheme.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Header Section */}
        <View style={styles.profileHeader}>
          <TouchableOpacity style={styles.avatarContainer} onPress={handlePickAvatar} disabled={uploadingAvatar}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.initialsAvatar, { backgroundColor: THEME_COLORS.primary, borderColor: dynamicTheme.border }]}>
                <Text style={styles.initialsText}>{getInitials(profile?.nome || '')}</Text>
              </View>
            )}
            <View style={[styles.cameraButton, { backgroundColor: THEME_COLORS.primary, borderColor: dynamicTheme.background }]}>
              {uploadingAvatar ? (
                <ActivityIndicator size={14} color={isDark ? '#0A0E12' : '#FFFFFF'} />
              ) : (
                <MaterialIcons name="photo-camera" size={14} color={isDark ? '#0A0E12' : '#FFFFFF'} />
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: dynamicTheme.text }]}>{profile?.nome || 'Utilizador'}</Text>
            <View style={[styles.badge, { backgroundColor: THEME_COLORS.primary + '20' }]}>
              <MaterialIcons name="verified" size={16} color={THEME_COLORS.primary} />
              <Text style={[styles.badgeText, { color: THEME_COLORS.primary }]}>Cliente Verificado</Text>
            </View>
          </View>
        </View>

        {/* Vehicle Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: dynamicTheme.text }]}>Veículo Actual</Text>
          </View>

          {/* Vehicle Card */}
          <View style={[styles.vehicleCard, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}>
            <View style={styles.vehicleHeader}>
              <View style={styles.vehicleInfoGroup}>
                <View style={[styles.vehicleIcon, { backgroundColor: THEME_COLORS.primary + '10' }]}>
                  <MaterialIcons name="directions-car" size={28} color={THEME_COLORS.primary} />
                </View>
                <View>
                  <Text style={[styles.vehicleLabel, { color: dynamicTheme.textSecondary }]}>Veículo Principal</Text>
                  <Text style={[styles.vehicleName, { color: dynamicTheme.text }]}>{profile?.tipo_veiculo || 'Sem Veículo'}</Text>
                </View>
              </View>
            </View>

            {/* License Plate */}
            <View style={[styles.licensePlateContainer, { backgroundColor: dynamicTheme.background, borderColor: dynamicTheme.border }]}>
              <View>
                <Text style={[styles.plateLabel, { color: dynamicTheme.textSecondary }]}>Matrícula</Text>
                <Text style={[styles.plateNumber, { color: dynamicTheme.text }]}>{profile?.placa || '---'}</Text>
              </View>
              <View style={[styles.flagPlaceholder, { backgroundColor: dynamicTheme.card }]}>
                <MaterialIcons name="flag" size={20} color={dynamicTheme.textSecondary} />
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: dynamicTheme.border }]} />

        {/* Account Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { marginBottom: 12, paddingHorizontal: 4, color: dynamicTheme.text }]}>Conta</Text>
          <View style={[styles.menuList, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}>
            <TouchableOpacity style={[styles.menuItem, { borderBottomColor: dynamicTheme.background }]}>
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                  <MaterialIcons name="credit-card" size={20} color="#3b82f6" />
                </View>
                <Text style={[styles.menuText, { color: dynamicTheme.text }]}>Métodos de Pagamento</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={dynamicTheme.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.menuItem, { borderBottomColor: dynamicTheme.background }]} onPress={() => router.push('/(client)/history')}>
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: 'rgba(168, 85, 247, 0.1)' }]}>
                  <MaterialIcons name="history" size={20} color="#a855f7" />
                </View>
                <Text style={[styles.menuText, { color: dynamicTheme.text }]}>Histórico de Serviços</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={dynamicTheme.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.menuItem, { borderBottomColor: 'transparent' }]}>
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: 'rgba(34, 197, 94, 0.1)' }]}>
                  <MaterialIcons name="support-agent" size={20} color="#22c55e" />
                </View>
                <Text style={[styles.menuText, { color: dynamicTheme.text }]}>Suporte</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={dynamicTheme.textSecondary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.logoutButton, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]} onPress={handleLogout}>
            <Text style={styles.logoutText}>Sair da Conta</Text>
          </TouchableOpacity>

          <Text style={[styles.versionText, { color: dynamicTheme.textSecondary }]}>Versão 1.0.0</Text>
        </View>
      </ScrollView>

      {/* Bottom Navigation Bar */}
      <View style={[styles.bottomNav, { backgroundColor: dynamicTheme.card, borderTopColor: dynamicTheme.border }]}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(client)/home')}>
          <MaterialIcons name="home" size={24} color={dynamicTheme.textSecondary} />
          <Text style={[styles.navLabel, { color: dynamicTheme.textSecondary }]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(client)/home')}>
          <View style={[styles.navFab, { backgroundColor: THEME_COLORS.primary, shadowColor: THEME_COLORS.primary }]}>
            <MaterialIcons name="toys" size={28} color={isDark ? '#0A0E12' : '#FFFFFF'} />
          </View>
          <Text style={[styles.navLabel, { color: THEME_COLORS.primary, marginTop: 4 }]}>Solicitar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <MaterialIcons name="person" size={24} color={THEME_COLORS.primary} />
          <Text style={[styles.navLabel, { color: THEME_COLORS.primary }]}>Perfil</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101922',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 12,
    backgroundColor: 'rgba(16, 25, 34, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    flex: 1,
    textAlign: 'center',
    paddingLeft: 40,
  },
  settingsButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#1e293b',
  },
  initialsAvatar: {
    backgroundColor: '#137fec',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#137fec',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#101922',
  },
  userInfo: {
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(19, 127, 236, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#137fec',
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  vehicleCard: {
    backgroundColor: '#1c2630',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  vehicleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  vehicleInfoGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  vehicleIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(19, 127, 236, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94a3b8',
  },
  vehicleName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  licensePlateContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#101922',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  plateLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  plateNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e2e8f0',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  flagPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: '#1c2630',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#1e293b',
    marginHorizontal: 24,
    marginVertical: 24,
  },
  menuList: {
    backgroundColor: '#1c2630',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#101922',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'white',
  },
  logoutButton: {
    marginTop: 24,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#64748b',
    marginTop: 16,
    marginBottom: 32,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 84,
    backgroundColor: 'rgba(16, 25, 34, 0.95)',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  navItem: {
    alignItems: 'center',
    width: 64,
  },
  navFab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#137fec',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
    shadowColor: '#137fec',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 6,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#64748b',
    marginTop: 4,
  },
});
