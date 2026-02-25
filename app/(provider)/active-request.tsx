import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Alert, Animated, PanResponder, ActivityIndicator, Platform, Linking } from 'react-native';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, AnimatedRegion } from 'react-native-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import { distanceMeters } from '../../lib/geo';

const { width, height } = Dimensions.get('window');

// Calculate bearing between two points for heading rotation
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function decodePolyline(encoded: string) {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

const STATUS_FLOW = {
  em_andamento: {
    next: 'no_local',
    label: 'DESLIZE PARA CHEGAR',
    statusText: 'A CAMINHO DO CLIENTE',
    showDestination: false,
    knobColor: '#137fec',
  },
  no_local: {
    next: 'em_viagem',
    label: 'INICIAR REBOQUE',
    statusText: 'EM LOCAL DE COLETA',
    showDestination: false,
    knobColor: '#eab308',
  },
  em_viagem: {
    next: 'finalizado',
    label: 'FINALIZAR SERVIÇO',
    statusText: 'A CAMINHO DO DESTINO',
    showDestination: true,
    knobColor: '#22c55e',
  },
} as const;

type StatusKey = keyof typeof STATUS_FLOW;

export default function ActiveRequest() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const requestId = useMemo(() => {
    const raw = (params as any)?.requestId;
    if (Array.isArray(raw)) return raw[0];
    return typeof raw === 'string' ? raw : null;
  }, [params]);

  const [requestData, setRequestData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentStatus, setCurrentStatus] = useState<StatusKey>('em_andamento');

  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const mapRef = useRef<MapView>(null);
  const providerIdRef = useRef<string | null>(null);
  const lastLocationSentRef = useRef<{ lat: number; lng: number; sentAt: number } | null>(null);

  // Animated marker for smooth movement
  const [providerCoord] = useState(new AnimatedRegion({
    latitude: 0,
    longitude: 0,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  }));
  const hasInitialLocationRef = useRef(false);
  const prevLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading] = useState(0);
  const userInteractingRef = useRef(false);
  const userInteractionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const navigatingAwayRef = useRef(false);
  const [remainingDistM, setRemainingDistM] = useState<number | null>(null);
  const [remainingTimeMin, setRemainingTimeMin] = useState<number | null>(null);
  const speedSamples = useRef<number[]>([]);
  const lastLocTime = useRef<number>(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const slideWidth = width - 40;
  const knobWidth = 60;
  const maxSlide = slideWidth - knobWidth;

  const resetSlider = () => {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: false }).start();
  };

  // Pulse animation loop for provider marker
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const fetchRequestData = async () => {
    if (!requestId || navigatingAwayRef.current) return;
    try {
      const { data, error } = await supabase
        .from('solicitacoes')
        .select(`*, cliente:clientes(*)`)
        .eq('id', requestId)
        .single();

      if (error) throw error;

      // Redirect away if already finalized or canceled
      if (data?.status === 'finalizado' && !navigatingAwayRef.current) {
        navigatingAwayRef.current = true;
        router.replace({ pathname: '/(provider)/completion-summary', params: { requestId: requestId as string } });
        return;
      }
      if (data?.status === 'cancelado' && !navigatingAwayRef.current) {
        navigatingAwayRef.current = true;
        router.replace('/(provider)/home');
        return;
      }

      setRequestData(data);

      const normalized: StatusKey =
        data?.status === 'direcionada' ? 'em_andamento' : (data?.status as StatusKey);
      if (normalized in STATUS_FLOW) setCurrentStatus(normalized);
      else setCurrentStatus('em_andamento');
    } catch (e) {
      console.error(e);
      Alert.alert('Erro', 'Não foi possível carregar os dados da solicitação.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequestData();
  }, [requestId]);

  // Subscribe to unread messages
  useEffect(() => {
    if (!requestId) return;
    let mounted = true;

    const fetchUnread = async () => {
      const { count } = await supabase
        .from('mensagens')
        .select('*', { count: 'exact', head: true })
        .eq('solicitacao_id', requestId)
        .eq('remetente_tipo', 'cliente')
        .eq('lido', false);
      if (mounted) setUnreadCount(count || 0);
    };
    fetchUnread();

    const channel = supabase
      .channel(`unread:provider:${requestId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensagens',
        filter: `solicitacao_id=eq.${requestId}`,
      }, (payload) => {
        if ((payload.new as any).remetente_tipo === 'cliente') {
          setUnreadCount((c) => c + 1);
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [requestId]);

  const updateProviderLocation = async (providerId: string, lat: number, lng: number) => {
    const updated_at = new Date().toISOString();
    await supabase
      .from('prestadores')
      .update({ latitude: lat, longitude: lng, lat, lng, updated_at })
      .eq('id', providerId);
  };

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let mounted = true;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!mounted || status !== 'granted') return;

      const { data: { user } } = await supabase.auth.getUser();
      providerIdRef.current = user?.id ?? null;
      if (!providerIdRef.current) return;

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,
          distanceInterval: 15,
        },
        async (loc) => {
          setLocation(loc);

          // Calculate heading from previous position
          const newLat = loc.coords.latitude;
          const newLng = loc.coords.longitude;
          const prev = prevLocationRef.current;
          const now = Date.now();
          if (prev) {
            const dist = distanceMeters(prev.lat, prev.lng, newLat, newLng);
            if (dist > 5) { // Only update heading if moved > 5m
              const newHeading = calculateBearing(prev.lat, prev.lng, newLat, newLng);
              setHeading(newHeading);

              // Calculate speed from movement (km/h)
              const elapsed = (now - lastLocTime.current) / 1000; // seconds
              if (elapsed > 0 && elapsed < 60) {
                const speedKmh = (dist / 1000) / (elapsed / 3600);
                if (speedKmh > 1 && speedKmh < 200) { // Reasonable driving speed
                  speedSamples.current.push(speedKmh);
                  if (speedSamples.current.length > 10) speedSamples.current.shift();
                }
              }
            }
          }
          prevLocationRef.current = { lat: newLat, lng: newLng };
          lastLocTime.current = now;

          // Dynamic ETA: calculate remaining distance to target
          let targetLat: number | null = null;
          let targetLng: number | null = null;
          if (currentStatus === 'em_viagem' && requestData?.destino_lat && requestData?.destino_lng) {
            targetLat = requestData.destino_lat;
            targetLng = requestData.destino_lng;
          } else if ((currentStatus === 'em_andamento' || currentStatus === 'no_local') && requestData?.origem_lat && requestData?.origem_lng) {
            targetLat = requestData.origem_lat;
            targetLng = requestData.origem_lng;
          }
          if (targetLat != null && targetLng != null) {
            const remDist = distanceMeters(newLat, newLng, targetLat, targetLng);
            setRemainingDistM(remDist);
            // Calculate ETA from average speed or fallback 40 km/h
            const avgSpeed = speedSamples.current.length >= 3
              ? speedSamples.current.reduce((a, b) => a + b, 0) / speedSamples.current.length
              : 40; // fallback 40 km/h
            const remTimeMin = ((remDist / 1000) / avgSpeed) * 60;
            setRemainingTimeMin(Math.max(1, Math.ceil(remTimeMin)));
          }

          // Animate provider marker smoothly (2s like client)
          if (hasInitialLocationRef.current) {
            providerCoord.timing({
              latitude: newLat,
              longitude: newLng,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
              duration: 2000,
              useNativeDriver: false,
            } as any).start();

            // Navigation-mode camera: heading rotates the map, pitch gives 3D effect
            if (!userInteractingRef.current && mapRef.current) {
              mapRef.current.animateCamera({
                center: { latitude: newLat, longitude: newLng },
                heading: heading,
                pitch: 45,
                zoom: 17,
              }, { duration: 2000 });
            }
          } else {
            providerCoord.setValue({
              latitude: newLat,
              longitude: newLng,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            });
            hasInitialLocationRef.current = true;
          }

          const providerId = providerIdRef.current;
          if (!providerId) return;

          const sendNow = Date.now();
          const last = lastLocationSentRef.current;
          const currentLat = loc.coords.latitude;
          const currentLng = loc.coords.longitude;

          const minIntervalMs = 15000;
          const maxIntervalMs = 60000;
          const minDistanceM = 25;

          let shouldSend = false;
          if (!last) {
            shouldSend = true;
          } else {
            const dt = sendNow - last.sentAt;
            const dist = distanceMeters(last.lat, last.lng, currentLat, currentLng);
            if (dt >= maxIntervalMs) shouldSend = true;
            else if (dt >= minIntervalMs && dist >= minDistanceM) shouldSend = true;
          }

          if (!shouldSend) return;

          lastLocationSentRef.current = { lat: currentLat, lng: currentLng, sentAt: sendNow };
          await updateProviderLocation(providerId, currentLat, currentLng);
        },
      );
    })();

    return () => {
      mounted = false;
      if (sub) sub.remove();
    };
  }, []);

  // Fit map to coordinates on status change (not every location update)
  const lastFitStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!location || !requestData || !mapRef.current) return;
    // Only auto-fit when status changes (or first load)
    if (lastFitStatusRef.current === currentStatus) return;
    lastFitStatusRef.current = currentStatus;

    const ui = STATUS_FLOW[currentStatus] ?? STATUS_FLOW.em_andamento;
    const targetLat = ui.showDestination ? requestData?.destino_lat : requestData?.origem_lat;
    const targetLng = ui.showDestination ? requestData?.destino_lng : requestData?.origem_lng;

    if (!targetLat || !targetLng) return;

    const coords = [
      { latitude: location.coords.latitude, longitude: location.coords.longitude },
      { latitude: targetLat, longitude: targetLng },
    ];

    // During em_viagem, also include origin if we have a polyline
    if (currentStatus === 'em_viagem' && requestData?.origem_lat && requestData?.origem_lng) {
      coords.push({ latitude: requestData.origem_lat, longitude: requestData.origem_lng });
    }

    setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 100, right: 50, bottom: 280, left: 50 },
        animated: true,
      });
    }, 500);
  }, [location, requestData, currentStatus]);

  // Handle user map interaction — pause auto-follow
  const onMapTouchStart = useCallback(() => {
    userInteractingRef.current = true;
    if (userInteractionTimer.current) clearTimeout(userInteractionTimer.current);
  }, []);

  const onMapTouchEnd = useCallback(() => {
    // Resume auto-follow after 8 seconds
    userInteractionTimer.current = setTimeout(() => {
      userInteractingRef.current = false;
    }, 8000);
  }, []);

  const recenterMap = useCallback(() => {
    userInteractingRef.current = false;
    if (userInteractionTimer.current) clearTimeout(userInteractionTimer.current);
    if (!location || !mapRef.current) return;

    const ui = STATUS_FLOW[currentStatus] ?? STATUS_FLOW.em_andamento;
    const targetLat = ui.showDestination ? requestData?.destino_lat : requestData?.origem_lat;
    const targetLng = ui.showDestination ? requestData?.destino_lng : requestData?.origem_lng;

    if (targetLat && targetLng) {
      mapRef.current.fitToCoordinates(
        [
          { latitude: location.coords.latitude, longitude: location.coords.longitude },
          { latitude: targetLat, longitude: targetLng },
        ],
        {
          edgePadding: { top: 100, right: 50, bottom: 280, left: 50 },
          animated: true,
        }
      );
    } else {
      mapRef.current.animateCamera({
        center: { latitude: location.coords.latitude, longitude: location.coords.longitude },
        zoom: 16,
      }, { duration: 600 });
    }
  }, [location, currentStatus, requestData]);

  const handleAdvanceStatus = async () => {
    if (!requestId) return;
    const config = STATUS_FLOW[currentStatus];
    if (!config) {
      resetSlider();
      return;
    }

    const nextStatus = config.next;

    // Redirect to checklist before starting tow (no_local → em_viagem)
    if (currentStatus === 'no_local' && nextStatus === 'em_viagem') {
      navigatingAwayRef.current = true;
      router.replace({
        pathname: '/(provider)/checklist',
        params: { requestId, tipo: 'inicio' },
      });
      resetSlider();
      return;
    }

    // Redirect to checklist before finalizing (em_viagem → finalizado)
    if (currentStatus === 'em_viagem' && nextStatus === 'finalizado') {
      navigatingAwayRef.current = true;
      router.replace({
        pathname: '/(provider)/checklist',
        params: { requestId, tipo: 'fim' },
      });
      resetSlider();
      return;
    }

    try {
      const { error } = await supabase.from('solicitacoes').update({ status: nextStatus }).eq('id', requestId);
      if (error) throw error;

      if (nextStatus === 'finalizado') {
        navigatingAwayRef.current = true;
        router.replace({ pathname: '/(provider)/completion-summary', params: { requestId } });
        return;
      }

      setCurrentStatus(nextStatus as StatusKey);
      resetSlider();
      fetchRequestData();
    } catch (e) {
      console.error(e);
      Alert.alert('Erro', 'Falha ao atualizar status');
      resetSlider();
    }
  };

  const handleAdvanceRef = useRef(handleAdvanceStatus);
  handleAdvanceRef.current = handleAdvanceStatus;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx > 0 && gestureState.dx <= maxSlide) {
            slideAnim.setValue(gestureState.dx);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx > maxSlide * 0.8) {
            Animated.timing(slideAnim, {
              toValue: maxSlide,
              duration: 200,
              useNativeDriver: false,
            }).start(() => {
              handleAdvanceRef.current();
            });
          } else {
            resetSlider();
          }
        },
      }),
    [currentStatus]
  );

  const ui = STATUS_FLOW[currentStatus] ?? STATUS_FLOW.em_andamento;

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#137fec" />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  if (!requestData) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Solicitação não encontrada.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const origin = requestData?.origem_lat && requestData?.origem_lng
    ? { latitude: requestData.origem_lat, longitude: requestData.origem_lng }
    : null;
  const destination = requestData?.destino_lat && requestData?.destino_lng
    ? { latitude: requestData.destino_lat, longitude: requestData.destino_lng }
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}
        onTouchStart={onMapTouchStart}
        onTouchEnd={onMapTouchEnd}
      >
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: origin?.latitude ?? -23.55052,
            longitude: origin?.longitude ?? -46.633308,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          }}
          showsCompass={false}
          showsMyLocationButton={false}
          rotateEnabled={true}
          pitchEnabled={false}
        >
          {location?.coords ? (
            <Marker.Animated
              coordinate={providerCoord as any}
              title="Você"
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={true}
              flat={true}
            >
              <View style={styles.providerMarkerOuter}>
                {/* Pulse ring animation */}
                <Animated.View style={[
                  styles.pulseRing,
                  { transform: [{ scale: pulseAnim }], opacity: Animated.subtract(new Animated.Value(1.5), pulseAnim) }
                ]} />
                <View style={styles.providerMarker}>
                  {currentStatus === 'em_viagem' ? (
                    <View style={styles.towingIcon}>
                      <MaterialIcons name="local-shipping" size={18} color="black" />
                      <MaterialIcons name="directions-car" size={12} color="black" style={{ marginLeft: -3 }} />
                    </View>
                  ) : (
                    <MaterialIcons name="local-shipping" size={20} color="black" />
                  )}
                </View>
                {/* Direction arrow */}
                <View style={styles.directionArrow}>
                  <MaterialIcons name="navigation" size={14} color="#facc15" />
                </View>
              </View>
            </Marker.Animated>
          ) : null}

          {origin ? (
            <Marker coordinate={origin} title="Origem" tracksViewChanges={true}>
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                <View style={styles.originMarker}>
                  <MaterialIcons name="my-location" size={18} color="white" />
                </View>
              </View>
            </Marker>
          ) : null}
          {destination ? (
            <Marker coordinate={destination} title="Destino" tracksViewChanges={true}>
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                <View style={styles.destMarker}>
                  <MaterialIcons name="location-on" size={18} color="white" />
                </View>
              </View>
            </Marker>
          ) : null}
          {/* Route polyline during em_viagem */}
          {currentStatus === 'em_viagem' && requestData?.route_polyline && (
            <Polyline
              coordinates={decodePolyline(requestData.route_polyline)}
              strokeColor="#22c55e"
              strokeWidth={5}
            />
          )}

          {/* Dashed line: provider → target during em_andamento/no_local */}
          {(currentStatus === 'em_andamento' || currentStatus === 'no_local') && location?.coords && origin && (
            <Polyline
              coordinates={[
                { latitude: location.coords.latitude, longitude: location.coords.longitude },
                origin,
              ]}
              strokeColor="#137fec"
              strokeWidth={3}
              lineDashPattern={[10, 6]}
            />
          )}
        </MapView>

        {/* ETA Info Overlay — Dynamic */}
        {(remainingDistM != null || requestData) && (
          <View style={styles.etaOverlay}>
            <View style={styles.etaCard}>
              <MaterialIcons name="schedule" size={16} color="#facc15" />
              <Text style={styles.etaText}>
                {remainingTimeMin != null
                  ? `${remainingTimeMin} min`
                  : requestData?.route_duration_s
                    ? `${Math.ceil(requestData.route_duration_s / 60)} min`
                    : '--'}
              </Text>
              <View style={styles.etaDivider} />
              <MaterialIcons name="straighten" size={16} color="#94a3b8" />
              <Text style={styles.etaText}>
                {remainingDistM != null
                  ? remainingDistM >= 1000
                    ? `${(remainingDistM / 1000).toFixed(1)} km`
                    : `${Math.round(remainingDistM)} m`
                  : requestData?.route_distance_m
                    ? `${(requestData.route_distance_m / 1000).toFixed(1)} km`
                    : '--'}
              </Text>
            </View>
          </View>
        )}

        {/* Re-center button */}
        <TouchableOpacity style={styles.recenterBtn} onPress={recenterMap}>
          <MaterialIcons name="my-location" size={22} color="white" />
        </TouchableOpacity>
      </View>

      <View style={styles.bottomSheet}>
        <View style={styles.headerRow}>
          <Text style={styles.statusText}>{ui.statusText}</Text>
          <TouchableOpacity style={styles.close} onPress={() => router.back()}>
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.addressBlock}>
          <Text style={styles.addressLabel}>Origem</Text>
          <Text style={styles.addressValue}>{requestData?.origem_endereco || '---'}</Text>
          <View style={styles.divider} />
          <Text style={styles.addressLabel}>Destino</Text>
          <Text style={styles.addressValue}>{requestData?.destino_endereco || '---'}</Text>
        </View>

        {/* Client Info Card */}
        {requestData?.cliente && (
          <View style={styles.clientCard}>
            <View style={styles.clientHeader}>
              <View style={styles.clientAvatar}>
                <MaterialIcons name="person" size={28} color="#94a3b8" />
              </View>
              <View style={styles.clientInfo}>
                <Text style={styles.clientName}>{requestData.cliente.nome || 'Cliente'}</Text>
                <View style={styles.vehicleRow}>
                  <MaterialIcons name="directions-car" size={14} color="#64748b" />
                  <Text style={styles.vehicleText}>
                    {requestData.cliente.placa || '---'} • {requestData.cliente.tipo_veiculo || 'Veículo'}
                  </Text>
                </View>
              </View>
              <View style={styles.clientActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => {
                  const phone = requestData.cliente.telefone;
                  if (phone) {
                    Linking.openURL(`tel:${phone}`);
                  } else {
                    Alert.alert('Sem telefone', 'O cliente não possui telefone cadastrado.');
                  }
                }}>
                  <MaterialIcons name="phone" size={20} color="white" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#137fec' }]} onPress={() => {
                  setUnreadCount(0);
                  // Mark messages as read
                  supabase.from('mensagens').update({ lido: true })
                    .eq('solicitacao_id', requestId)
                    .eq('remetente_tipo', 'cliente')
                    .eq('lido', false)
                    .then(() => { });
                  router.push({
                    pathname: '/chat',
                    params: { requestId, userType: 'prestador', otherName: requestData.cliente?.nome || 'Cliente' },
                  });
                }}>
                  <MaterialIcons name="chat" size={20} color="white" />
                  {unreadCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={styles.slider}>
          <View style={styles.sliderTrack}>
            <Text style={styles.sliderText}>{ui.label}</Text>
            <Animated.View
              {...panResponder.panHandlers}
              style={[
                styles.sliderKnob,
                { backgroundColor: ui.knobColor, transform: [{ translateX: slideAnim }] },
              ]}
            >
              <Text style={styles.knobArrow}>›</Text>
            </Animated.View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1220',
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 18,
    backgroundColor: 'rgba(17, 24, 39, 0.96)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusText: {
    color: '#e5e7eb',
    fontSize: 14,
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  closeText: {
    color: '#e5e7eb',
    fontSize: 22,
    marginTop: -2,
  },
  addressBlock: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  addressLabel: {
    color: 'rgba(229, 231, 235, 0.75)',
    fontSize: 12,
    fontWeight: '700',
  },
  addressValue: {
    color: '#f9fafb',
    fontSize: 14,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 12,
  },
  clientCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  clientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clientAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientInfo: {
    flex: 1,
    marginLeft: 12,
  },
  clientName: {
    color: '#f9fafb',
    fontSize: 15,
    fontWeight: '700',
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 4,
  },
  vehicleText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  clientActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slider: {
    marginTop: 16,
  },
  sliderTrack: {
    height: 58,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sliderText: {
    textAlign: 'center',
    color: 'rgba(229, 231, 235, 0.85)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  sliderKnob: {
    position: 'absolute',
    left: 6,
    top: 6,
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  knobArrow: {
    color: '#0b1220',
    fontSize: 22,
    fontWeight: '900',
    marginTop: -2,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0b1220',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#e5e7eb',
    fontSize: 14,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#137fec',
  },
  backButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  badge: {
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
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '800',
  },
  providerMarkerOuter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerMarker: {
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
  pulseRing: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(250, 204, 21, 0.3)',
  },
  directionArrow: {
    marginTop: -4,
  },
  originMarker: {
    backgroundColor: '#f97316',
    padding: 7,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  destMarker: {
    backgroundColor: '#22c55e',
    padding: 7,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  markerLabel: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  markerLabelText: {
    color: 'white',
    fontSize: 9,
    fontWeight: '700',
  },
  etaOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  etaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(11, 18, 32, 0.9)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  etaText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
  },
  etaDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 4,
  },
});
