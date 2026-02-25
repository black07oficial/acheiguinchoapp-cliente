import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform, Alert, ActivityIndicator, Image, Share, Linking, StatusBar as RNStatusBar } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useRef, useCallback } from 'react';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, AnimatedRegion } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import * as Location from 'expo-location';
import { useDynamicTheme, THEME_COLORS } from '../../hooks/use-dynamic-theme';

const { width } = Dimensions.get('window');

// Dark Mode Map Style
const darkMapStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#212121" }] },
  { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#212121" }] },
  { "featureType": "administrative", "elementType": "geometry", "stylers": [{ "color": "#757575" }] },
  { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "featureType": "road", "elementType": "geometry.fill", "stylers": [{ "color": "#2c2c2c" }] },
  { "featureType": "road.arterial", "elementType": "geometry", "stylers": [{ "color": "#373737" }] },
  { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#3c3c3c" }] },
  { "featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#000000" }] },
];

// Calculate bearing between two GPS points for heading rotation
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

export default function Tracking() {
  const { isDark, theme: dynamicTheme } = useDynamicTheme();
  const router = useRouter();
  const { requestId } = useLocalSearchParams();
  const mapRef = useRef<MapView>(null);

  const [request, setRequest] = useState<any>(null);
  const [driver, setDriver] = useState<any>(null);
  const [status, setStatus] = useState<string>('pendente');
  const [loading, setLoading] = useState(true);

  // Animated Region for Driver
  const [driverLocation] = useState(new AnimatedRegion({
    latitude: 0,
    longitude: 0,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }));
  const [hasDriverLocation, setHasDriverLocation] = useState(false);
  const [driverLatLng, setDriverLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);

  // Track driver ID for polling
  const driverIdRef = useRef<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevDriverLatLng = useRef<{ lat: number; lng: number } | null>(null);
  const [driverHeading, setDriverHeading] = useState(0);
  const userInteractingRef = useRef(false);
  const userInteractionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigatingAwayRef = useRef(false);

  // Load initial request data
  useEffect(() => {
    if (!requestId) return;

    fetchRequestData();

    // Polling for request updates (safety net for realtime)
    const requestPoll = setInterval(() => {
      fetchRequestData();
    }, 8000);

    // Subscribe to Request changes (for instant updates)
    const requestSub = supabase
      .channel(`tracking:request:${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'solicitacoes',
          filter: `id=eq.${requestId}`
        },
        (payload) => {
          console.log('[TRACKING] Request update:', payload.new?.status);
          const updated = payload.new as any;
          setRequest(updated);
          setStatus(updated.status);

          if (updated.route_polyline) {
            setRouteCoords(decodePolyline(updated.route_polyline));
          }

          // Always fetch driver data when prestador_id is present
          if (updated.prestador_id) {
            fetchDriverData(updated.prestador_id);
          }

          // Navigate to rating when ride is finalized
          if (updated.status === 'finalizado' && !navigatingAwayRef.current) {
            navigatingAwayRef.current = true;
            router.replace({
              pathname: '/(client)/rating',
              params: { requestId: requestId as string },
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('[TRACKING] Request subscription:', status);
      });

    return () => {
      supabase.removeChannel(requestSub);
      clearInterval(requestPoll);
    };
  }, [requestId]);

  // Subscribe to unread messages
  useEffect(() => {
    if (!requestId) return;
    let mounted = true;

    const fetchUnread = async () => {
      const { count } = await supabase
        .from('mensagens')
        .select('*', { count: 'exact', head: true })
        .eq('solicitacao_id', requestId as string)
        .eq('remetente_tipo', 'prestador')
        .eq('lido', false);
      if (mounted) setUnreadCount(count || 0);
    };
    fetchUnread();

    const channel = supabase
      .channel(`unread:client:${requestId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensagens',
        filter: `solicitacao_id=eq.${requestId}`,
      }, (payload) => {
        if ((payload.new as any).remetente_tipo === 'prestador') {
          setUnreadCount((c) => c + 1);
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [requestId]);

  // Subscribe to Driver Location changes + polling fallback
  useEffect(() => {
    const driverId = driverIdRef.current;
    if (!driverId) return;

    // Poll driver location every 10s as backup
    const driverPoll = setInterval(async () => {
      const { data } = await supabase
        .from('prestadores')
        .select('latitude, longitude, lat, lng')
        .eq('id', driverId)
        .single();
      if (data) {
        const dLat = (data as any).latitude ?? (data as any).lat;
        const dLng = (data as any).longitude ?? (data as any).lng;
        if (dLat && dLng) animateDriverMovement(dLat, dLng);
      }
    }, 10000);

    // Realtime for instant location updates
    const driverSub = supabase
      .channel(`tracking:driver:${driverId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'prestadores',
          filter: `id=eq.${driverId}`
        },
        (payload) => {
          const d = payload.new as any;
          const dLat = d.latitude ?? d.lat;
          const dLng = d.longitude ?? d.lng;
          if (dLat && dLng) {
            animateDriverMovement(dLat, dLng);
          }
        }
      )
      .subscribe((status) => {
        console.log('[TRACKING] Driver subscription:', status);
      });

    return () => {
      supabase.removeChannel(driverSub);
      clearInterval(driverPoll);
    };
  }, [driver?.id]);

  // Auto Zoom for Client
  useEffect(() => {
    if (!mapRef.current || !request || !hasDriverLocation || !driverLatLng) return;

    // Coordinates to include in view
    const coords = [];

    // Add Driver
    coords.push({ latitude: driverLatLng.lat, longitude: driverLatLng.lng });

    // Add Target (Pickup or Destination)
    const isTowing = status === 'em_viagem';
    const targetLat = isTowing ? request.destino_lat : request.origem_lat;
    const targetLng = isTowing ? request.destino_lng : request.origem_lng;

    if (targetLat && targetLng) {
      coords.push({ latitude: targetLat, longitude: targetLng });
    }

    if (coords.length > 0 && !userInteractingRef.current) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 100, right: 50, bottom: 350, left: 50 },
        animated: true
      });
    }

  }, [driverLatLng, request, status, hasDriverLocation]);

  // Handle user map interaction — pause auto-zoom
  const onMapTouchStart = useCallback(() => {
    userInteractingRef.current = true;
    if (userInteractionTimer.current) clearTimeout(userInteractionTimer.current);
  }, []);

  const onMapTouchEnd = useCallback(() => {
    userInteractionTimer.current = setTimeout(() => {
      userInteractingRef.current = false;
    }, 8000);
  }, []);

  const recenterMap = useCallback(() => {
    userInteractingRef.current = false;
    if (userInteractionTimer.current) clearTimeout(userInteractionTimer.current);
    if (!mapRef.current || !driverLatLng || !request) return;

    const isTow = status === 'em_viagem';
    const targetLat = isTow ? request.destino_lat : request.origem_lat;
    const targetLng = isTow ? request.destino_lng : request.origem_lng;
    const coords = [{ latitude: driverLatLng.lat, longitude: driverLatLng.lng }];
    if (targetLat && targetLng) coords.push({ latitude: targetLat, longitude: targetLng });

    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 100, right: 50, bottom: 350, left: 50 },
      animated: true,
    });
  }, [driverLatLng, request, status]);

  const animateDriverMovement = (lat: number, lng: number) => {
    // Calculate heading from previous position
    const prev = prevDriverLatLng.current;
    if (prev) {
      const dx = lat - prev.lat;
      const dy = lng - prev.lng;
      if (Math.abs(dx) > 0.00001 || Math.abs(dy) > 0.00001) {
        const newHeading = calculateBearing(prev.lat, prev.lng, lat, lng);
        setDriverHeading(newHeading);
      }
    }
    prevDriverLatLng.current = { lat, lng };
    setDriverLatLng({ lat, lng });

    if (!hasDriverLocation) {
      // First update, jump to location
      driverLocation.setValue({ latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 });
      setHasDriverLocation(true);
    } else {
      // Subsequent updates, animate smoothly
      driverLocation.timing({
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
        duration: 2000,
        useNativeDriver: false,
        toValue: { latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }
      } as any).start();
    }
  };

  async function fetchRequestData() {
    if (navigatingAwayRef.current) return;
    try {
      const { data, error } = await supabase
        .from('solicitacoes')
        .select('*')
        .eq('id', requestId)
        .single();

      if (error) throw error;

      // Redirect to rating if already finalized
      if (data.status === 'finalizado' && !navigatingAwayRef.current) {
        navigatingAwayRef.current = true;
        router.replace({
          pathname: '/(client)/rating',
          params: { requestId: requestId as string },
        });
        return;
      }

      setRequest(data);
      setStatus(data.status);

      if ((data as any)?.route_polyline) {
        setRouteCoords(decodePolyline((data as any).route_polyline));
      }

      if (data.prestador_id) {
        fetchDriverData(data.prestador_id);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.error('[TRACKING] Error fetching request:', error);
    } finally {
      setLoading(false);
    }
  }

  function decodePolyline(encoded: string) {
    if (!encoded) return [];
    let index = 0;
    let lat = 0;
    let lng = 0;
    const coordinates: { latitude: number; longitude: number }[] = [];

    while (index < encoded.length) {
      let b;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += dlng;

      coordinates.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }

    return coordinates;
  }

  async function fetchDriverData(driverId: string) {
    try {
      console.log('[TRACKING] Fetching driver data for:', driverId);
      const { data, error } = await supabase
        .from('prestadores')
        .select('*')
        .eq('id', driverId)
        .single();

      if (error) {
        console.error('[TRACKING] Error fetching driver:', error.message, error.code);
        return;
      }

      if (data) {
        setDriver(data);
        driverIdRef.current = data.id;
        const dLat = (data as any).latitude ?? (data as any).lat;
        const dLng = (data as any).longitude ?? (data as any).lng;
        if (dLat && dLng) {
          animateDriverMovement(dLat, dLng);
        }
      }
    } catch (err) {
      console.error('[TRACKING] Exception fetching driver:', err);
    }
  }

  const handleCancelRequest = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('cancel_my_solicitacao', {
        request_id: requestId
      });

      if (error) throw error;

      Alert.alert("Sucesso", "Solicitação cancelada com sucesso.");
      router.replace('/(client)/home');
    } catch (e: any) {
      Alert.alert("Erro", "Falha ao cancelar: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleShareLink = async () => {
    try {
      const token = request?.tracking_token;
      if (!token) {
        Alert.alert('Erro', 'Token de rastreamento não disponível.');
        return;
      }
      // Construct the public tracking URL using the call center panel domain
      const trackingUrl = `${process.env.EXPO_PUBLIC_PANEL_URL || 'https://painel.guincho.app'}/tracking/${token}`;
      await Share.share({
        message: `Acompanhe meu guincho em tempo real: ${trackingUrl}`,
        url: trackingUrl,
        title: 'Acompanhamento de Guincho',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'pendente': return 'Processando sua solicitação no call center...';
      case 'direcionada': return 'Solicitação direcionada. Aguardando confirmação do prestador...';
      case 'em_andamento': return `ACEITA POR ${driver?.nome?.toUpperCase() || 'PRESTADOR'}`;
      case 'no_local': return 'O guincho chegou no local de coleta!';
      case 'em_viagem': return 'Rebocando para o destino...';
      case 'finalizado': return 'Serviço finalizado!';
      case 'cancelado': return 'Solicitação cancelada';
      default: return 'Processando...';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'pendente': return '#eab308'; // Yellow
      case 'direcionada': return '#6366f1'; // Indigo
      case 'em_andamento': return '#137fec'; // Blue
      case 'no_local': return '#22c55e'; // Green
      case 'em_viagem': return '#22c55e'; // Green
      case 'finalizado': return '#94a3b8'; // Gray
      case 'cancelado': return '#ef4444'; // Red
      default: return '#137fec';
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: dynamicTheme.background }]}>
        <ActivityIndicator size="large" color={THEME_COLORS.primary} />
        <Text style={[styles.loadingText, { color: dynamicTheme.text }]}>Carregando informações...</Text>
      </View>
    );
  }

  // Visualization Logic
  const isTowing = status === 'em_viagem';
  const showPickupMarker = status === 'pendente' || status === 'direcionada' || status === 'em_andamento' || status === 'no_local';
  const showDriver = status !== 'pendente' && status !== 'cancelado' && hasDriverLocation;

  return (
    <View style={[styles.container, { backgroundColor: dynamicTheme.background }]}>
      <RNStatusBar barStyle={dynamicTheme.statusBar} />
      {/* Map Background */}
      <View style={{ flex: 1 }}
        onTouchStart={onMapTouchStart}
        onTouchEnd={onMapTouchEnd}
      >
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          customMapStyle={isDark ? darkMapStyle : []}
          initialRegion={{
            latitude: request?.origem_lat || 0,
            longitude: request?.origem_lng || 0,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
          showsCompass={false}
          showsMyLocationButton={false}
          rotateEnabled={true}
          pitchEnabled={false}
        >
          {/* Route line: Provider → Pickup when approaching, Origin → Dest when towing */}
          {isTowing && routeCoords.length > 1 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor={isDark ? THEME_COLORS.primary : "#22c55e"}
              strokeWidth={4}
            />
          )}
          {!isTowing && showDriver && driverLatLng && request?.origem_lat && request?.origem_lng && (
            <Polyline
              coordinates={[
                { latitude: driverLatLng.lat, longitude: driverLatLng.lng },
                { latitude: request.origem_lat, longitude: request.origem_lng },
              ]}
              strokeColor={THEME_COLORS.primary}
              strokeWidth={4}
              lineDashPattern={[10, 6]}
            />
          )}

          {/* Pickup Marker (Hide when towing) */}
          {request && showPickupMarker && (
            <Marker
              coordinate={{ latitude: request.origem_lat, longitude: request.origem_lng }}
            >
              <View style={styles.markerContainer}>
                <View style={[styles.markerIconBg, { backgroundColor: dynamicTheme.card }]}>
                  <MaterialIcons name="my-location" size={20} color={THEME_COLORS.primary} />
                </View>
              </View>
            </Marker>
          )}

          {/* Destination Marker */}
          {request && request.destino_lat != null && request.destino_lng != null && (
            <Marker
              coordinate={{ latitude: request.destino_lat, longitude: request.destino_lng }}
            >
              <View style={styles.markerContainer}>
                <View style={[styles.markerIconBg, { backgroundColor: '#ef4444' }]}>
                  <MaterialIcons name="location-on" size={20} color="white" />
                </View>
              </View>
            </Marker>
          )}

          {/* Driver Marker (Animated) */}
          {showDriver && (
            <Marker.Animated
              coordinate={driverLocation as any}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={true}
              flat={true}
              rotation={driverHeading}
            >
              <View style={[styles.driverMarker, { backgroundColor: isDark ? THEME_COLORS.primary : '#facc15', borderColor: isDark ? '#0A0E12' : 'black' }]}>
                {isTowing ? (
                  <View style={styles.towingIcon}>
                    <MaterialIcons name="local-shipping" size={20} color={isDark ? '#0A0E12' : 'black'} />
                    <MaterialIcons name="directions-car" size={14} color={isDark ? '#0A0E12' : 'black'} style={{ marginLeft: -4 }} />
                  </View>
                ) : (
                  <MaterialIcons name="local-shipping" size={20} color={isDark ? '#0A0E12' : 'black'} />
                )}
              </View>
            </Marker.Animated>
          )}
        </MapView>

        {/* Re-center button */}
        <TouchableOpacity style={[styles.recenterBtn, { backgroundColor: dynamicTheme.card }]} onPress={recenterMap}>
          <MaterialIcons name="my-location" size={22} color={THEME_COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Top Bar: Back Button + Share */}
      <View style={styles.topBar}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: dynamicTheme.card }]} onPress={() => router.push('/(client)/home')}>
          <MaterialIcons name="arrow-back" size={24} color={dynamicTheme.text} />
        </TouchableOpacity>
      </View>
      <View style={styles.topBarRight}>
        <TouchableOpacity style={[styles.shareButton, { backgroundColor: THEME_COLORS.primary }]} onPress={handleShareLink}>
          <MaterialIcons name="share" size={22} color={isDark ? '#0A0E12' : 'white'} />
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet */}
      <View style={[styles.bottomSheet, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}>
        {/* Status Bar */}
        <View style={[styles.statusBar, { backgroundColor: dynamicTheme.background, borderColor: dynamicTheme.border }]}>
          <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} />
          <Text style={[styles.statusText, { color: dynamicTheme.text }]}>{getStatusMessage()}</Text>
        </View>

        {/* Driver Info (if assigned) */}
        {status !== 'pendente' && (
          <View style={styles.driverCard}>
            <View style={styles.driverHeader}>
              <View style={[styles.driverAvatar, { backgroundColor: dynamicTheme.background }]}>
                <MaterialIcons name="person" size={32} color={dynamicTheme.textSecondary} />
              </View>
              <View style={styles.driverInfo}>
                <Text style={[styles.driverName, { color: dynamicTheme.text }]}>{driver?.nome || 'Provider'}</Text>
                <View style={styles.ratingRow}>
                  <MaterialIcons name="star" size={14} color="#eab308" />
                  <Text style={styles.ratingText}>{driver?.avaliacao || '5.0'}</Text>
                  <Text style={[styles.vehicleText, { color: dynamicTheme.textSecondary }]}>• {driver?.modelo_veiculo || 'Tow Truck'}</Text>
                </View>
              </View>
              <View style={styles.driverActions}>
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: dynamicTheme.background }]} onPress={() => {
                  const phone = driver?.telefone;
                  if (phone) {
                    Linking.openURL(`tel:${phone}`);
                  } else {
                    Alert.alert('Sem telefone', 'O prestador não possui telefone cadastrado.');
                  }
                }}>
                  <MaterialIcons name="phone" size={20} color={dynamicTheme.text} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: THEME_COLORS.primary }]} onPress={() => {
                  setUnreadCount(0);
                  supabase.from('mensagens').update({ lido: true })
                    .eq('solicitacao_id', requestId as string)
                    .eq('remetente_tipo', 'prestador')
                    .eq('lido', false)
                    .then(() => { });
                  router.push({
                    pathname: '/chat',
                    params: { requestId: requestId as string, userType: 'cliente', otherName: driver?.nome || 'Prestador' },
                  });
                }}>
                  <MaterialIcons name="chat" size={20} color={isDark ? '#0A0E12' : 'white'} />
                  {unreadCount > 0 && (
                    <View style={[styles.unreadBadge, { borderColor: dynamicTheme.card }]}>
                      <Text style={styles.unreadBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: dynamicTheme.border }]} />

            <View style={styles.etaRow}>
              <View style={styles.etaItem}>
                <Text style={[styles.etaLabel, { color: dynamicTheme.textSecondary }]}>TEMPO ESTIMADO</Text>
                <Text style={[styles.etaValue, { color: dynamicTheme.text }]}>{request?.route_duration_s ? `${Math.round(request.route_duration_s / 60)} min` : '--'}</Text>
              </View>
              <View style={styles.etaItem}>
                <Text style={[styles.etaLabel, { color: dynamicTheme.textSecondary }]}>DISTÂNCIA</Text>
                <Text style={[styles.etaValue, { color: dynamicTheme.text }]}>{request?.distancia_km ? `${Number(request.distancia_km).toFixed(1)} km` : (request?.route_distance_m ? `${(request.route_distance_m / 1000).toFixed(1)} km` : '--')}</Text>
              </View>
              <View style={styles.etaItem}>
                <Text style={[styles.etaLabel, { color: dynamicTheme.textSecondary }]}>PREÇO</Text>
                <Text style={[styles.etaValue, { color: dynamicTheme.text }]}>
                  {request?.valor > 0 ? `R$ ${request.valor}` : 'Coberto'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Loading State for Pending */}
        {status === 'pendente' && (
          <View style={styles.pendingContainer}>
            <ActivityIndicator size="large" color={THEME_COLORS.primary} style={{ marginBottom: 16 }} />
            <Text style={[styles.pendingText, { color: dynamicTheme.textSecondary }]}>Aguardando um prestador aceitar...</Text>
            <TouchableOpacity style={[styles.cancelButton, { borderColor: '#ef4444' }]} onPress={handleCancelRequest}>
              <Text style={styles.cancelText}>Cancelar Solicitação</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101922',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: 'white',
    marginTop: 12,
  },
  map: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    top: 50,
    left: 16,
    zIndex: 10,
  },
  topBarRight: {
    position: 'absolute',
    top: 50,
    right: 16,
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(19, 127, 236, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#192633',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    backgroundColor: '#101922',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  driverCard: {
    gap: 16,
  },
  driverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  driverAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ratingText: {
    color: '#eab308',
    fontSize: 12,
    fontWeight: 'bold',
  },
  vehicleText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  driverActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    opacity: 0.5,
  },
  etaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  etaItem: {
    alignItems: 'center',
  },
  etaLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  etaValue: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  pendingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  pendingText: {
    color: '#94a3b8',
    marginBottom: 24,
  },
  cancelButton: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ef4444',
    alignItems: 'center',
  },
  cancelText: {
    color: '#ef4444',
    fontWeight: 'bold',
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  driverMarker: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#facc15',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'black',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  towingIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  unreadBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#0b1220',
  },
  unreadBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '800',
  },
});
