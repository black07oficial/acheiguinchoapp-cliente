
import { View, Text, StyleSheet, TouchableOpacity, Alert, Dimensions, Image, Platform, Animated as RNAnimated } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur'; // For glassmorphism if available, otherwise fallback
import { registerForPushNotificationsAsync, updateUserPushToken } from '../../lib/notifications';
import { distanceMeters } from '../../lib/geo';

const { width, height } = Dimensions.get('window');

export default function ProviderHome() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [providerData, setProviderData] = useState<any>(null);
  const [saldoDevedor, setSaldoDevedor] = useState<number>(0);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeReadyRef = useRef(false);
  const lastRoutedRequestIdRef = useRef<string | null>(null);
  const lastLocationSentRef = useRef<{ lat: number; lng: number; sentAt: number } | null>(null);
  const pulseAnim = useRef(new RNAnimated.Value(1)).current;

  // Pulse animation for online marker
  useEffect(() => {
    if (!isOnline) return;
    const pulse = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulseAnim, { toValue: 1.8, duration: 1500, useNativeDriver: true }),
        RNAnimated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isOnline]);

  // 1. Inicialização: Pegar Localização e Usuário
  useEffect(() => {
    (async () => {
      // Usuário Logado
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);

        // Check for active request → redirect to active-request
        // Only consider requests from the last 24 hours to avoid orphaned/stale requests
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: activeReq } = await supabase
          .from('solicitacoes')
          .select('id, status')
          .eq('prestador_id', user.id)
          .not('status', 'in', '("finalizado","cancelado","pendente")')
          .gte('created_at', twentyFourHoursAgo)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeReq) {
          console.log('[PROVIDER] Active request found, redirecting:', activeReq.id, activeReq.status);
          router.replace({
            pathname: '/(provider)/active-request',
            params: { requestId: activeReq.id },
          });
          return;
        }

        // Carregar dados do prestador
        const { data: prestador } = await supabase
          .from('prestadores')
          .select('*')
          .eq('id', user.id)
          .single();

        if (prestador) {
          setProviderData(prestador);
          setIsOnline(prestador.status === 'online');
        }

        // Buscar saldo devedor do prestador
        const { data: saldo } = await supabase
          .from('prestador_saldo')
          .select('saldo_devedor')
          .eq('prestador_id', user.id)
          .maybeSingle();
        if (saldo) setSaldoDevedor(Number(saldo.saldo_devedor) || 0);

        // Register for Push Notifications
        await updateUserPushToken(user.id, 'prestadores');
      }

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permissão necessária', 'Ative a localização para ficar online e receber despachos.');
          return;
        }

        const loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
      } catch {
        Alert.alert('Erro', 'Não foi possível acessar a localização. Verifique as permissões do app.');
      }
    })();
  }, []);

  // Função para verificar novas solicitações (Polling + Realtime)
  // Busca corridas direcionadas (call center) E pendentes da plataforma (auto-dispatch)
  const checkForNewRequests = async () => {
    if (!user) return;

    try {
      // 1. Verificar corridas direcionadas para mim (call center)
      const { data: directed, error: directedError } = await supabase
        .from('solicitacoes')
        .select('id, status, prestador_id')
        .eq('status', 'direcionada')
        .eq('prestador_id', user.id)
        .maybeSingle();

      if (directedError) {
        console.error('[DISPATCH] Erro ao buscar direcionadas:', directedError.message, directedError.code);
      }

      console.log('[DISPATCH] Direcionadas para mim:', directed ? directed.id : 'nenhuma');

      if (directed) {
        if (lastRoutedRequestIdRef.current === directed.id) return;
        lastRoutedRequestIdRef.current = directed.id;
        console.log("Solicitação direcionada encontrada:", directed);
        router.push({
          pathname: '/(provider)/new-request',
          params: { requestId: directed.id }
        });
        return;
      }

      // 2. Verificar corridas pendentes da plataforma (auto-dispatch)
      //    Mostradas para todos os prestadores online próximos
      if (isOnline && location?.coords) {
        const { data: platformRequests, error: platformError } = await supabase
          .from('solicitacoes')
          .select('id, status, origem_lat, origem_lng')
          .eq('status', 'pendente')
          .is('prestador_id', null)
          .limit(1)
          .maybeSingle();

        if (platformError) {
          console.error('[DISPATCH] Erro ao buscar pendentes:', platformError.message, platformError.code);
        }

        console.log('[DISPATCH] Pendentes plataforma:', platformRequests ? platformRequests.id : 'nenhuma');

        if (platformRequests) {
          if (lastRoutedRequestIdRef.current === platformRequests.id) return;
          lastRoutedRequestIdRef.current = platformRequests.id;
          console.log("Solicitação da plataforma encontrada:", platformRequests);
          router.push({
            pathname: '/(provider)/new-request',
            params: { requestId: platformRequests.id }
          });
        }
      }
    } catch (e) {
      console.error("Erro ao verificar solicitações:", e);
    }
  };

  // 2. Listener de Novas Solicitações (Realtime + Polling)
  useEffect(() => {
    if (!user) return;

    console.log("[DISPATCH] Iniciando listener para prestador:", user.id);

    // Initial check
    checkForNewRequests();

    // Polling ALWAYS runs — it's our safety net for directed requests
    // even when realtime is connected (realtime can miss events due to RLS timing)
    const pollingInterval = setInterval(() => {
      checkForNewRequests();
    }, 10000); // Check every 10 seconds

    // Realtime for faster detection
    const subscription = supabase
      .channel('provider-dispatch')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'solicitacoes',
        },
        (payload) => {
          console.log("[DISPATCH] Realtime event:", payload.eventType, (payload.new as any)?.status);
          // Always re-check on any change to solicitacoes
          checkForNewRequests();
        }
      )
      .subscribe((status) => {
        console.log("[DISPATCH] Realtime status:", status);
      });

    return () => {
      supabase.removeChannel(subscription);
      clearInterval(pollingInterval);
    };
  }, [user]);

  // 3. Função para Ficar Online/Offline
  const toggleOnline = async () => {
    if (!user) return;

    if (!location?.coords) {
      Alert.alert('Localização necessária', 'Ative a localização para ficar online.');
      return;
    }

    const newStatus = !isOnline;
    setIsOnline(newStatus); // Optimistic update

    // Atualizar no banco
    const { error } = await supabase
      .from('prestadores')
      .update({
        status: newStatus ? 'online' : 'offline',
        latitude: location?.coords.latitude,
        longitude: location?.coords.longitude,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (error) {
      Alert.alert("Erro", "Falha ao atualizar status");
      setIsOnline(!newStatus); // Reverter
    }
  };

  // 4. Background Location Watcher
  useEffect(() => {
    if (!isOnline || !user) return;

    let locationSubscription: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 15000,
          distanceInterval: 25,
        },
        async (newLoc) => {
          setLocation(newLoc);

          const now = Date.now();
          const last = lastLocationSentRef.current;
          const currentLat = newLoc.coords.latitude;
          const currentLng = newLoc.coords.longitude;

          const minIntervalMs = 15000;
          const maxIntervalMs = 60000;
          const minDistanceM = 25;

          let shouldSend = false;
          if (!last) {
            shouldSend = true;
          } else {
            const dt = now - last.sentAt;
            const dist = distanceMeters(last.lat, last.lng, currentLat, currentLng);
            if (dt >= maxIntervalMs) shouldSend = true;
            else if (dt >= minIntervalMs && dist >= minDistanceM) shouldSend = true;
          }

          if (!shouldSend) return;
          lastLocationSentRef.current = { lat: currentLat, lng: currentLng, sentAt: now };

          const { error } = await supabase
            .from('prestadores')
            .update({
              latitude: currentLat,
              longitude: currentLng,
              lat: currentLat,
              lng: currentLng,
              location_updated_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);

          if (error) console.error("Error updating location:", error);
        }
      );
    })();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [isOnline, user]);

  const handleCenterMap = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  };

  return (
    <View style={styles.container}>
      {/* Map Background */}
      <View style={styles.mapContainer}>
        {location ? (
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={{
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            showsUserLocation={false}
          >
            {/* Provider Marker (Center) */}
            <Marker coordinate={{
              latitude: location.coords.latitude,
              longitude: location.coords.longitude
            }}>
              <View style={styles.markerContainer}>
                {isOnline && <RNAnimated.View style={[
                  styles.pulseRing,
                  {
                    transform: [{ scale: pulseAnim }],
                    opacity: pulseAnim.interpolate({ inputRange: [1, 1.8], outputRange: [0.3, 0] }),
                  },
                ]} />}
                {isOnline && <View style={styles.pulseCore} />}
                <View style={styles.markerIconBg}>
                  <MaterialIcons name="local-shipping" size={20} color="white" />
                </View>
              </View>
            </Marker>
          </MapView>
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={{ color: 'white' }}>Localizando...</Text>
          </View>
        )}
      </View>

      {/* Top Header (Floating) */}
      <View style={styles.topHeader}>
        <View style={styles.headerContent}>
          <View style={styles.profileSection}>
            <View style={styles.avatarContainer}>
              <Image
                source={{ uri: "https://i.pravatar.cc/150?u=a042581f4e29026704d" }}
                style={styles.avatar}
              />
              <View style={styles.statusDotWrapper}>
                <View style={[styles.statusDot, { backgroundColor: isOnline ? '#22c55e' : '#64748b' }]} />
              </View>
            </View>
            <View>
              <Text style={styles.providerName}>{providerData?.nome || 'Prestador'}</Text>
              <Text style={styles.providerId}>ID: #{user?.id.substring(0, 4) || '....'}</Text>
            </View>
          </View>
          <View style={styles.ratingBadge}>
            <MaterialIcons name="star" size={16} color="#fbbf24" />
            <Text style={styles.ratingText}>4.9</Text>
          </View>
        </View>
        {/* Saldo Devedor */}
        {saldoDevedor > 0 && (
          <TouchableOpacity
            style={styles.saldoDevedorBadge}
            onPress={() => router.push('/(provider)/financial')}
          >
            <MaterialIcons name="account-balance-wallet" size={14} color="#f59e0b" />
            <Text style={styles.saldoDevedorText}>Saldo: R$ {saldoDevedor.toFixed(2)}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Map Controls */}
      <View style={styles.mapControls}>
        <View style={styles.zoomControls}>
          <TouchableOpacity style={styles.zoomButtonBorder} onPress={() => {
            if (mapRef.current && location) {
              const camera = { center: { latitude: location.coords.latitude, longitude: location.coords.longitude }, zoom: 16 };
              mapRef.current.animateCamera(camera, { duration: 300 });
            }
          }}>
            <MaterialIcons name="add" size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomButton} onPress={() => {
            if (mapRef.current && location) {
              const camera = { center: { latitude: location.coords.latitude, longitude: location.coords.longitude }, zoom: 12 };
              mapRef.current.animateCamera(camera, { duration: 300 });
            }
          }}>
            <MaterialIcons name="remove" size={24} color="white" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.recenterButton} onPress={handleCenterMap}>
          <MaterialIcons name="my-location" size={24} color="#137fec" />
        </TouchableOpacity>
        {/* Debug/Manual Refresh Button */}
        <TouchableOpacity
          style={[styles.recenterButton, { marginTop: 12, backgroundColor: '#0f172a' }]}
          onPress={checkForNewRequests}
        >
          <MaterialIcons name="refresh" size={24} color="#fbbf24" />
        </TouchableOpacity>
      </View>

      {/* Bottom Action Panel */}
      <View style={styles.bottomPanelContainer}>
        <View style={styles.bottomPanel}>
          <View style={styles.statusHeader}>
            <View style={styles.statusLabelRow}>
              <View style={styles.statusIndicator}>
                {isOnline ? (
                  <View style={[styles.statusPing, { backgroundColor: '#22c55e' }]} />
                ) : (
                  <View style={[styles.statusPing, { backgroundColor: '#64748b' }]} />
                )}
              </View>
              <Text style={styles.statusLabelText}>STATUS: {isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
            </View>
            <Text style={styles.statusTitle}>
              {isOnline ? 'Aguardando chamadas...' : 'Você está Offline'}
            </Text>
            <Text style={styles.statusSubtitle}>
              {isOnline
                ? 'Fique atento, novas solicitações aparecerão aqui.'
                : 'Fique online para receber solicitações na sua região.'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: isOnline ? '#ef4444' : '#137fec' }]}
            onPress={toggleOnline}
            activeOpacity={0.9}
          >
            <MaterialIcons name="power-settings-new" size={24} color="white" style={{ marginRight: 8 }} />
            <Text style={styles.actionButtonText}>
              {isOnline ? 'FICAR OFFLINE' : 'FICAR ONLINE'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Navigation Bar */}
      <View style={styles.navBar}>
        <View style={styles.navContainer}>
          <TouchableOpacity style={styles.navItem}>
            <MaterialIcons name="map" size={26} color="#137fec" />
            <Text style={[styles.navText, { color: '#137fec' }]}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(provider)/jobs')}>
            <MaterialIcons name="assignment" size={26} color="#64748b" />
            <Text style={styles.navText}>Jobs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(provider)/financial')}>
            <MaterialIcons name="payments" size={26} color="#64748b" />
            <Text style={styles.navText}>Financeiro</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(provider)/profile')}>
            <MaterialIcons name="person" size={26} color="#64748b" />
            <Text style={styles.navText}>Profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// Styles
const darkMapStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#212121" }] },
  { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#212121" }] },
  { "featureType": "administrative", "elementType": "geometry", "stylers": [{ "color": "#757575" }] },
  { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "featureType": "road", "elementType": "geometry.fill", "stylers": [{ "color": "#2c2c2c" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#000000" }] }
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101922',
  },
  mapContainer: {
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0, // Fill entire screen
  },
  map: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101922',
  },
  // Marker Styles
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    height: 100,
  },
  pulseRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(19, 127, 236, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(19, 127, 236, 0.2)',
  },
  pulseCore: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(19, 127, 236, 0.3)',
  },
  markerIconBg: {
    backgroundColor: '#137fec',
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  // Top Header
  topHeader: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(16, 25, 34, 0.85)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statusDotWrapper: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#101922',
    borderRadius: 6,
    padding: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  providerName: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  providerId: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 4,
  },
  ratingText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  saldoDevedorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    gap: 6,
    marginTop: 8,
  },
  saldoDevedorText: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '700',
  },
  // Map Controls
  mapControls: {
    position: 'absolute',
    right: 16,
    bottom: 280, // Adjusted to sit above bottom panel
    gap: 12,
    zIndex: 10,
  },
  zoomControls: {
    backgroundColor: 'rgba(16, 25, 34, 0.9)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  zoomButtonBorder: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomButton: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(16, 25, 34, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#137fec',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  // Bottom Action Panel
  bottomPanelContainer: {
    position: 'absolute',
    bottom: 80, // Above navbar
    left: 16,
    right: 16,
    zIndex: 10,
  },
  bottomPanel: {
    backgroundColor: '#101922',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
    gap: 20,
  },
  statusHeader: {
    gap: 4,
  },
  statusLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusPing: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusLabelText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
  },
  actionButton: {
    height: 48,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#137fec',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  actionButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  // Bottom Navbar
  navBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#101922',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    paddingTop: 12,
    paddingHorizontal: 24,
    zIndex: 20,
  },
  navContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navItem: {
    alignItems: 'center',
    gap: 4,
  },
  navText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
  },
});
