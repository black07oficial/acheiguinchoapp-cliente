import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, Platform, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0][0]?.toUpperCase() || '?';
}

export default function ProviderProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saldoDevedor, setSaldoDevedor] = useState(0);
  const [totalComissoes, setTotalComissoes] = useState(0);
  const [totalPagamentos, setTotalPagamentos] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('prestadores')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data) {
        setProfile(data);

        // Fetch rating count
        const { count } = await supabase
          .from('avaliacoes')
          .select('*', { count: 'exact', head: true })
          .eq('prestador_id', user.id);
        setRatingCount(count || 0);

        // Fetch saldo devedor
        const { data: saldoData } = await supabase
          .from('prestador_saldo')
          .select('*')
          .eq('prestador_id', user.id)
          .maybeSingle();
        if (saldoData) {
          setSaldoDevedor(Number(saldoData.saldo_devedor) || 0);
          setTotalComissoes(Number(saldoData.total_comissoes) || 0);
          setTotalPagamentos(Number(saldoData.total_pagamentos) || 0);
        }
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
        .upload(fileName, decode(asset.base64), {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('prestadores')
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
    router.replace('/auth/provider-login');
  }

  async function handleToggleStatus() {
    if (!profile) return;
    const newStatus = profile.status === 'online' ? 'offline' : 'online';

    const { error } = await supabase
      .from('prestadores')
      .update({ status: newStatus })
      .eq('id', profile.id);

    if (!error) {
      setProfile({ ...profile, status: newStatus });
      Alert.alert("Status Atualizado", `Você agora está ${newStatus.toUpperCase()}`);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#137fec" />
      </View>
    );
  }

  const rating = Number(profile?.avaliacao) || 5.0;

  return (
    <View style={styles.container}>
      {/* Top App Bar */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Perfil do Motorista</Text>
        <TouchableOpacity style={styles.settingsButton}>
          <MaterialIcons name="settings" size={24} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Header Section */}
        <View style={styles.profileHeader}>
          <TouchableOpacity style={styles.avatarContainer} onPress={handlePickAvatar} disabled={uploadingAvatar}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.initialsAvatar]}>
                <Text style={styles.initialsText}>{getInitials(profile?.nome)}</Text>
              </View>
            )}
            <View style={[styles.statusDot, { backgroundColor: profile?.status === 'online' ? '#22c55e' : '#64748b' }]} />
            <View style={styles.cameraButton}>
              {uploadingAvatar ? (
                <ActivityIndicator size={14} color="white" />
              ) : (
                <MaterialIcons name="photo-camera" size={14} color="white" />
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.userInfo}>
            <Text style={styles.userName}>{profile?.nome || 'Motorista'}</Text>
            <View style={styles.ratingRow}>
              <View style={styles.ratingBadge}>
                <MaterialIcons name="star" size={16} color="#eab308" />
                <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
              </View>
              <Text style={styles.ratingCount}>({ratingCount} avaliações)</Text>
            </View>
            {/* Stars display */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <MaterialIcons
                  key={star}
                  name={star <= Math.round(rating) ? 'star' : star - 0.5 <= rating ? 'star-half' : 'star-border'}
                  size={22}
                  color="#eab308"
                />
              ))}
            </View>
          </View>

          <TouchableOpacity style={styles.statusButton} onPress={handleToggleStatus}>
            <Text style={[styles.statusButtonText, { color: profile?.status === 'online' ? '#22c55e' : '#64748b' }]}>
              {profile?.status === 'online' ? 'VOCÊ ESTÁ ONLINE' : 'VOCÊ ESTÁ OFFLINE'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Vehicle Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Veículo Cadastrado</Text>

          <View style={styles.vehicleCard}>
            <View style={styles.vehicleHeader}>
              <View style={styles.vehicleInfoGroup}>
                <View style={styles.vehicleIcon}>
                  <MaterialIcons name="local-shipping" size={28} color="#137fec" />
                </View>
                <View>
                  <Text style={styles.vehicleLabel}>Modelo</Text>
                  <Text style={styles.vehicleName}>{profile?.modelo_veiculo || 'Guincho Padrão'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.licensePlateContainer}>
              <View>
                <Text style={styles.plateLabel}>Placa</Text>
                <Text style={styles.plateNumber}>{profile?.placa || 'ABC-1234'}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Financeiro Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financeiro</Text>

          <TouchableOpacity
            style={styles.financeCard}
            onPress={() => router.push('/(provider)/financial')}
            activeOpacity={0.7}
          >
            <View style={styles.financeCardHeader}>
              <View style={styles.financeIconBox}>
                <MaterialIcons name="account-balance-wallet" size={24} color="#f59e0b" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.financeLabel}>Saldo Devedor</Text>
                <Text style={[styles.financeValue, { color: saldoDevedor > 0 ? '#f59e0b' : '#22c55e' }]}>
                  R$ {saldoDevedor.toFixed(2)}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#64748b" />
            </View>

            <View style={styles.financeRow}>
              <View style={styles.financeColumn}>
                <Text style={styles.financeSmallLabel}>Comissões</Text>
                <Text style={[styles.financeSmallValue, { color: '#ef4444' }]}>R$ {totalComissoes.toFixed(2)}</Text>
              </View>
              <View style={styles.financeColumn}>
                <Text style={styles.financeSmallLabel}>Pagamentos</Text>
                <Text style={[styles.financeSmallValue, { color: '#22c55e' }]}>R$ {totalPagamentos.toFixed(2)}</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Account Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Conta</Text>
          <View style={styles.menuList}>
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(provider)/pricing')}>
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: 'rgba(19, 127, 236, 0.1)' }]}>
                  <MaterialIcons name="attach-money" size={20} color="#137fec" />
                </View>
                <Text style={styles.menuText}>Configuração de Valores</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#64748b" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(provider)/jobs')}>
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: 'rgba(168, 85, 247, 0.1)' }]}>
                  <MaterialIcons name="history" size={20} color="#a855f7" />
                </View>
                <Text style={styles.menuText}>Histórico de Serviços</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#64748b" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(provider)/financial')}>
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: 'rgba(34, 197, 94, 0.1)' }]}>
                  <MaterialIcons name="payments" size={20} color="#22c55e" />
                </View>
                <Text style={styles.menuText}>Ganhos e Extratos</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Sair da Conta</Text>
          </TouchableOpacity>

          <Text style={styles.versionText}>Versão Motorista 1.0.0</Text>
        </View>
      </ScrollView>

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(provider)/home')}>
          <MaterialIcons name="map" size={24} color="#64748b" />
          <Text style={styles.navLabel}>Mapa</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(provider)/jobs')}>
          <MaterialIcons name="assignment" size={24} color="#64748b" />
          <Text style={styles.navLabel}>Serviços</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(provider)/financial')}>
          <MaterialIcons name="attach-money" size={24} color="#64748b" />
          <Text style={styles.navLabel}>Ganhos</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <MaterialIcons name="person" size={24} color="#137fec" />
          <Text style={[styles.navLabel, { color: '#137fec' }]}>Perfil</Text>
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
    left: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#137fec',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#101922',
  },
  statusDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#101922',
  },
  userInfo: {
    alignItems: 'center',
    gap: 4,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#eab308',
  },
  ratingCount: {
    fontSize: 12,
    color: '#94a3b8',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 4,
  },
  statusButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 8,
    backgroundColor: '#1c2630',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 16,
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
  financeCard: {
    backgroundColor: '#1c2630',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  financeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  financeIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  financeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94a3b8',
  },
  financeValue: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  financeRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#101922',
    paddingTop: 12,
  },
  financeColumn: {
    flex: 1,
    alignItems: 'center',
  },
  financeSmallLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 2,
  },
  financeSmallValue: {
    fontSize: 14,
    fontWeight: '600',
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
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 12,
  },
  navItem: {
    alignItems: 'center',
    width: 64,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#64748b',
    marginTop: 4,
  },
});