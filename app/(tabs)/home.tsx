import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, Dimensions, ScrollView, Platform, Keyboard, KeyboardAvoidingView, Animated as RNAnimated, Modal, StatusBar as RNStatusBar } from 'react-native';
import { useEffect, useState, useRef, useCallback } from 'react';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { useNetworkStatus, useDynamicTheme } from '../../hooks';
import { useQuery } from '@tanstack/react-query';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { registerForPushNotificationsAsync, updateUserPushToken } from '../../lib/notifications';
import { invokeComputeQuote } from '../../lib/edge';
import { THEME_COLORS } from '../../hooks/use-dynamic-theme';
import { fetchAvailableServices } from '../../lib/services';
import { DARK_MAP_STYLE, GOOGLE_MAPS_MAP_ID, MAP_3D_CAMERA } from '../../lib/map-style';

import { ServicesList } from '../../components/services-list';
import { ServiceCardExpanded } from '../../components/service-card-expanded';
import type { ServicoDisponivel } from '../../types/service';

const { width } = Dimensions.get('window');
const GOOGLE_MAPS_APIKEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export default function Home() {
  const { isDark, theme: dynamicTheme } = useDynamicTheme();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const pulseAnim = useRef(new RNAnimated.Value(1)).current;
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { isConnected } = useNetworkStatus();
  const [showMenu, setShowMenu] = useState(false);
  const [userType, setUserType] = useState<'cliente' | 'associado'>('cliente');
  const [vehicleModel, setVehicleModel] = useState('Carregando veículo...');
  const [vehiclePlate, setVehiclePlate] = useState('---');
  const [guestName, setGuestName] = useState('');
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [priceEstimate, setPriceEstimate] = useState<string | null>(null);

  const [destinationCoords, setDestinationCoords] = useState<{ lat: number, lng: number } | null>(null);

  // Address Inputs
  const [pickupAddress, setPickupAddress] = useState('Locating...');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Services state
  const [availableServices, setAvailableServices] = useState<ServicoDisponivel[]>([]);
  const [selectedService, setSelectedService] = useState<ServicoDisponivel | null>(null);
  const [expandedService, setExpandedService] = useState<ServicoDisponivel | null>(null);
  const [loadingServices, setLoadingServices] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [showServicesModal, setShowServicesModal] = useState(false);

  // Pulse animation for user marker
  useEffect(() => {
    const pulse = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulseAnim, { toValue: 1.6, duration: 1200, useNativeDriver: true }),
        RNAnimated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Fetch initial location and user profile
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permissão de acesso à localização foi negada');
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      setLocation(location);

      // Reverse Geocode Pickup Address
      try {
        const reversed = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude
        });
        if (reversed.length > 0) {
          const addr = reversed[0];
          setPickupAddress(`${addr.street || ''} ${addr.streetNumber || ''}, ${addr.city || ''}`.trim() || 'Unknown Location');
        }
      } catch (e) {
        console.log('Reverse geocoding failed', e);
        setPickupAddress(`${location.coords.latitude.toFixed(4)}, ${location.coords.longitude.toFixed(4)}`);
      }

      // 2. Fetch User Profile to check Type
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setIsGuest(false);
        // Check for active request → redirect to tracking
        // Only consider requests from the last 24 hours to avoid orphaned/stale requests
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: activeReq } = await supabase
          .from('solicitacoes')
          .select('id, status')
          .eq('cliente_id', user.id)
          .not('status', 'in', '("finalizado","cancelado")')
          .gte('created_at', twentyFourHoursAgo)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeReq) {
          console.log('[CLIENT] Active request found, redirecting to tracking:', activeReq.id);
          router.replace({
            pathname: '/(tabs)/tracking',
            params: { requestId: activeReq.id },
          });
          return;
        }

        // Register for Push Notifications
        await updateUserPushToken(user.id, 'clientes');

        const { data: profile } = await supabase
          .from('clientes')
          .select('tipo, tipo_veiculo, placa')
          .eq('id', user.id)
          .single();

        if (profile) {
          if (profile.tipo) {
            setUserType(profile.tipo as 'cliente' | 'associado');
          }
          setVehicleModel(profile.tipo_veiculo || 'Nenhum Veículo Cadastrado');
          setVehiclePlate(profile.placa || '---');
        }
      } else {
        setIsGuest(true);
        setVehicleModel('Veículo não registrado');
        setVehiclePlate('---');
      }
    })();
  }, []);

  const handleDestinationChange = async (text: string) => {
    setDestinationAddress(text);
    if (text.length > 2) {
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${GOOGLE_MAPS_APIKEY}&language=pt-BR&components=country:br`
        );
        const json = await response.json();
        if (json.status === 'OK') {
          setSuggestions(json.predictions);
          setShowSuggestions(true);
        }
      } catch (error) {
        console.log('Error fetching suggestions:', error);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = async (item: any) => {
    Keyboard.dismiss();
    setDestinationAddress(item.description);
    setShowSuggestions(false);

    try {
      // Get details (coordinates) for the selected place
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${item.place_id}&fields=geometry&key=${GOOGLE_MAPS_APIKEY}`
      );
      const json = await response.json();

      if (json.status === 'OK' && json.result?.geometry?.location) {
        const { lat, lng } = json.result.geometry.location;
        setDestinationCoords({ lat, lng });
        handleDestinationSet(lat, lng);
      } else {
        // Fallback to geocoding if details fail
        const geocoded = await Location.geocodeAsync(item.description);
        if (geocoded.length > 0) {
          const { latitude, longitude } = geocoded[0];
          setDestinationCoords({ lat: latitude, lng: longitude });
          handleDestinationSet(latitude, longitude);
        }
      }
    } catch (error) {
      console.log('Error getting place details:', error);
      Alert.alert('Erro', 'Não foi possível obter a localização exata deste endereço.');
    }
  };

  const handleManualSearch = async () => {
    Keyboard.dismiss();
    if (!destinationAddress) return;

    try {
      const geocoded = await Location.geocodeAsync(destinationAddress);
      if (geocoded.length > 0) {
        const { latitude, longitude } = geocoded[0];
        setDestinationCoords({ lat: latitude, lng: longitude });
        handleDestinationSet(latitude, longitude);
        setShowSuggestions(false);
      } else {
        Alert.alert('Endereço não encontrado', 'Tente ser mais específico ou selecione uma sugestão.');
      }
    } catch (e) {
      Alert.alert('Erro', 'Falha ao buscar endereço.');
    }
  };

  // Buscar serviços disponíveis quando o destino é definido
  const handleDestinationSet = async (destLat: number, destLng: number) => {
    if (!location) return;

    // Animate map to show both pickup and destination
    if (mapRef.current) {
      mapRef.current.fitToCoordinates([
        { latitude: location.coords.latitude, longitude: location.coords.longitude },
        { latitude: destLat, longitude: destLng }
      ], {
        edgePadding: { top: 100, right: 50, bottom: 350, left: 50 },
        animated: true,
      });
    }
  };

  // Abrir modal de serviços e carregar
  const handleOpenServicesModal = async () => {
    if (!destinationCoords) {
      Alert.alert('Destino necessário', 'Por favor, insira um destino para solicitar o guincho.');
      return;
    }

    setShowServicesModal(true);
    await loadAvailableServices(destinationCoords.lat, destinationCoords.lng);
  };

  // Carregar serviços disponíveis
  const loadAvailableServices = useCallback(async (destLat?: number, destLng?: number) => {
    if (!location) return;

    setLoadingServices(true);
    setServicesError(null);
    setAvailableServices([]);

    try {
      const { data, error } = await fetchAvailableServices(
        location.coords.latitude,
        location.coords.longitude,
        destLat,
        destLng
      );

      if (error) {
        setServicesError(error.message);
      } else if (data) {
        setAvailableServices(data);
      }
    } catch (err: any) {
      console.error('[HOME] Error loading services:', err);
      setServicesError(err.message || 'Erro ao carregar serviços');
    } finally {
      setLoadingServices(false);
    }
  }, [location]);

  // Selecionar serviço
  const handleSelectService = (servico: ServicoDisponivel) => {
    setSelectedService(servico);
  };

  // Expandir serviço para ver detalhes
  const handleExpandService = (servico: ServicoDisponivel) => {
    setExpandedService(servico);
  };

  const [pendingService, setPendingService] = useState<ServicoDisponivel | null>(null);

  // Confirmar serviço selecionado
  const handleConfirmService = async (servico: ServicoDisponivel) => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      if (!guestName || guestName.trim().length < 3) {
        setPendingService(servico);
        setShowGuestModal(true);
        return;
      }
    }

    setExpandedService(null);
    setSelectedService(servico);
    // Prosseguir para checkout
    proceedToCheckout(servico);
  };

  // Ir para checkout com serviço selecionado
  const proceedToCheckout = (servico: ServicoDisponivel) => {
    if (!location?.coords || !destinationCoords) return;

    router.push({
      pathname: '/(tabs)/checkout',
      params: {
        pickup: pickupAddress,
        destination: destinationAddress,
        price: servico.preco_final.toString(),
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        destLat: destinationCoords.lat,
        destLng: destinationCoords.lng,
        prestadorId: servico.prestador_id,
        guestName: guestName || ''
      }
    });
  };

  function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
  }

  // Center map on user
  function handleCenterMap() {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  }

  async function handleRequestTowing() {
    if (!destinationAddress) {
      Alert.alert('Destino Obrigatório', 'Por favor, insira um destino para o guincho.');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        if (!guestName) {
          setShowGuestModal(true);
          return;
        }
      }

      // Geocode destination address
      let destLat = 0;
      let destLng = 0;

      try {
        const geocoded = await Location.geocodeAsync(destinationAddress);
        if (geocoded && geocoded.length > 0) {
          destLat = geocoded[0].latitude;
          destLng = geocoded[0].longitude;
        } else {
          // If not found in geocode, check suggestions
          const suggestion = suggestions.find(s => s.address === destinationAddress);
          if (suggestion) {
            destLat = suggestion.lat;
            destLng = suggestion.lng;
          } else {
            Alert.alert('Endereço Não Encontrado', 'Não foi possível localizar o endereço de destino.');
            return;
          }
        }
      } catch (geoError) {
        console.error('Geocoding error:', geoError);
        // Fallback to suggestion
        const suggestion = suggestions.find(s => s.address === destinationAddress);
        if (suggestion) {
          destLat = suggestion.lat;
          destLng = suggestion.lng;
        } else {
          Alert.alert('Error', 'Failed to locate destination address.');
          return;
        }
      }

      if (!location?.coords) {
        Alert.alert('Erro', 'Localização indisponível. Tente novamente.');
        return;
      }

      const quote = await invokeComputeQuote({
        origem_lat: location.coords.latitude,
        origem_lng: location.coords.longitude,
        destino_lat: destLat,
        destino_lng: destLng,
      });

      const estimatedPrice = Number((quote as any)?.amount) || 0;

      // Navigate to Checkout
      router.push({
        pathname: '/(tabs)/checkout',
        params: {
          pickup: pickupAddress,
          destination: destinationAddress,
          price: estimatedPrice.toString(),
          lat: location?.coords.latitude || 0,
          lng: location?.coords.longitude || 0,
          destLat: destLat,
          destLng: destLng,
          guestName: guestName || ''
        }
      });

    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: dynamicTheme.background }]}>
      <RNStatusBar barStyle={dynamicTheme.statusBar} />

      {/* Modal para Nome do Visitante */}
      <Modal
        visible={showGuestModal}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}>
            <Text style={[styles.modalTitle, { color: dynamicTheme.text }]}>Quase lá!</Text>
            <Text style={[styles.modalSubtitle, { color: dynamicTheme.textSecondary }]}>Informe seu nome para continuar com a solicitação.</Text>

            <TextInput
              style={[styles.modalInput, { backgroundColor: dynamicTheme.input, color: dynamicTheme.text, borderColor: dynamicTheme.border }]}
              placeholder="Seu nome"
              placeholderTextColor={dynamicTheme.textSecondary}
              value={guestName}
              onChangeText={setGuestName}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.requestButton, { marginTop: 10, backgroundColor: THEME_COLORS.primary }]}
              onPress={() => {
                if (guestName.trim().length < 3) {
                  Alert.alert('Atenção', 'Por favor, insira seu nome completo.');
                  return;
                }
                setShowGuestModal(false);
                if (pendingService) {
                  const serv = pendingService;
                  setPendingService(null);
                  setExpandedService(null);
                  setSelectedService(serv);
                  proceedToCheckout(serv);
                } else {
                  handleRequestTowing();
                }
              }}
            >
              <Text style={[styles.requestButtonText, { color: isDark ? '#0A0E12' : '#FFFFFF' }]}>Continuar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowGuestModal(false)}
            >
              <Text style={[styles.modalCancelText, { color: dynamicTheme.textSecondary }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Offline Banner */}
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>You are offline. Please check your connection.</Text>
        </View>
      )}

      {/* Map Background */}
      <View style={styles.mapContainer}>
        {location ? (
          <MapView
            ref={mapRef}
            style={[styles.map, isDark && { filter: dynamicTheme.mapFilter } as any]}
            provider={PROVIDER_GOOGLE}
            showsUserLocation={true}
            showsMyLocationButton={false}
            showsCompass={false}
            pitchEnabled={true}
            showsBuildings={true}
            camera={{
              center: {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              },
              pitch: MAP_3D_CAMERA.pitch,
              heading: MAP_3D_CAMERA.heading,
              altitude: 1000,
              zoom: MAP_3D_CAMERA.zoom,
            }}
            initialRegion={{
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
          >

            {destinationCoords && location && (
              <MapViewDirections
                origin={{
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                }}
                destination={{
                  latitude: destinationCoords.lat,
                  longitude: destinationCoords.lng,
                }}
                apikey={GOOGLE_MAPS_APIKEY}
                strokeWidth={4}
                strokeColor={THEME_COLORS.primary}
                onReady={(result) => {
                  mapRef.current?.fitToCoordinates(result.coordinates, {
                    edgePadding: {
                      right: width / 20,
                      bottom: 350,
                      left: width / 20,
                      top: 100,
                    },
                    animated: true,
                  });
                }}
              />
            )}

            {destinationCoords && (
              <Marker
                key={`dest-${destinationCoords.lat}-${destinationCoords.lng}`}
                coordinate={{
                  latitude: destinationCoords.lat,
                  longitude: destinationCoords.lng
                }}
                title="Destination"
                description={destinationAddress}
              >
                <MaterialIcons name="location-on" size={40} color="#ef4444" />
              </Marker>
            )}
          </MapView>
        ) : (
          <View style={[styles.loadingContainer, { backgroundColor: dynamicTheme.background }]}>
            <Text style={{ color: dynamicTheme.text }}>{errorMsg || 'Locating...'}</Text>
          </View>
        )}

        <LinearGradient
          colors={isDark ? ['rgba(10,14,18,0.8)', 'transparent'] : ['rgba(255,255,255,0.6)', 'transparent']}
          style={styles.topGradient}
        />
      </View>

      {/* Top Navigation */}
      <View style={styles.topNav}>
        <TouchableOpacity
          style={[styles.circleButton, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}
          onPress={() => setShowMenu(!showMenu)}
        >
          <MaterialIcons name="menu" size={24} color={dynamicTheme.text} />
        </TouchableOpacity>

        {showMenu && (
          <View style={[styles.menuDropdown, { backgroundColor: isDark ? '#1C2630' : '#FFFFFF' }]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                router.push('/(tabs)/profile');
              }}
            >
              <MaterialIcons name="person" size={20} color={isDark ? '#FFFFFF' : '#0f172a'} />
              <Text style={[styles.menuText, { color: isDark ? '#FFFFFF' : '#0f172a' }]}>Profile</Text>
            </TouchableOpacity>

            <View style={[styles.menuDivider, { backgroundColor: dynamicTheme.border }]} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                router.push('/(tabs)/history');
              }}
            >
              <MaterialIcons name="history" size={20} color={isDark ? '#FFFFFF' : '#0f172a'} />
              <Text style={[styles.menuText, { color: isDark ? '#FFFFFF' : '#0f172a' }]}>History</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={[styles.circleButton, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}>
          <MaterialIcons name="notifications" size={24} color={dynamicTheme.text} />
          <View style={[styles.notificationBadge, { borderColor: dynamicTheme.card }]} />
        </TouchableOpacity>
      </View>

      <View style={styles.fabContainer}>
        <TouchableOpacity style={[styles.fabButton, { backgroundColor: dynamicTheme.card }]} onPress={handleCenterMap}>
          <MaterialIcons name="my-location" size={24} color={THEME_COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet / Request Card */}
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={0}
        style={styles.bottomSheetContainer}
      >
        <View style={[styles.bottomSheet, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}>
          <View style={styles.dragHandleContainer}>
            <View style={[styles.dragHandle, { backgroundColor: isDark ? '#324d67' : '#E5E7EB' }]} />
          </View>

          <ScrollView
            style={styles.sheetContent}
            contentContainerStyle={styles.sheetContentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {/* Header & Vehicle Info */}
            <View style={styles.sheetHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.sheetTitle, { color: dynamicTheme.text }]}>Solicitar Guincho</Text>
                <TouchableOpacity style={[styles.changeButton, { backgroundColor: THEME_COLORS.primary + '20', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }]}>
                  <Text style={[styles.changeButtonText, { color: THEME_COLORS.primary }]}>Alterar</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.vehicleInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                  <MaterialIcons name="directions-car" size={14} color={dynamicTheme.textSecondary} />
                  <Text style={[styles.vehicleText, { color: dynamicTheme.textSecondary, fontSize: 12 }]}>{vehicleModel}</Text>
                </View>
                <Text style={{ color: dynamicTheme.textSecondary, fontSize: 12 }}>•</Text>
                <Text style={[styles.vehicleText, { color: dynamicTheme.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 }]}>{vehiclePlate}</Text>
              </View>
            </View>

            {/* Location Inputs (Timeline Style) */}
            <View style={styles.timelineContainer}>
              <View style={[styles.timelineLine, { backgroundColor: isDark ? '#324d67' : '#E5E7EB', borderColor: isDark ? '#324d67' : '#E5E7EB' }]} />

              {/* Pickup */}
              <View style={styles.inputRow}>
                <View style={styles.timelineIconContainer}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: THEME_COLORS.primary + '20', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: THEME_COLORS.primary + '40' }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: THEME_COLORS.primary }} />
                  </View>
                </View>
                <View style={[styles.inputWrapper, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : '#FFFFFF', borderColor: dynamicTheme.border }]}>
                  <View style={styles.inputTextContainer}>
                    <Text style={[styles.inputLabel, { color: dynamicTheme.textSecondary }]}>ORIGEM</Text>
                    <TextInput
                      style={[styles.inputField, { color: dynamicTheme.text }]}
                      value={pickupAddress}
                      onChangeText={setPickupAddress}
                      placeholderTextColor={dynamicTheme.textSecondary}
                      editable={false}
                    />
                  </View>
                  <MaterialIcons name="near-me" size={18} color={dynamicTheme.textSecondary} />
                </View>
              </View>

              {/* Destination */}
              <View style={styles.inputRow}>
                <View style={styles.timelineIconContainer}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dynamicTheme.border }}>
                    <View style={{ width: 10, height: 10, borderRadius: 2, borderWidth: 2, borderColor: dynamicTheme.textSecondary }} />
                  </View>
                </View>
                <View style={[styles.inputWrapper, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : '#FFFFFF', borderColor: dynamicTheme.border }]}>
                  <View style={styles.inputTextContainer}>
                    <Text style={[styles.inputLabel, { color: dynamicTheme.textSecondary }]}>DESTINO</Text>
                    <TextInput
                      style={[styles.inputField, { color: dynamicTheme.text }]}
                      value={destinationAddress}
                      onChangeText={handleDestinationChange}
                      onSubmitEditing={handleManualSearch}
                      placeholder="Para onde levamos?"
                      placeholderTextColor={dynamicTheme.textSecondary}
                    />
                  </View>
                  <TouchableOpacity onPress={handleManualSearch}>
                    <MaterialIcons name="search" size={20} color={dynamicTheme.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Autocomplete Suggestions */}
              {showSuggestions && (
                <View style={[styles.suggestionsContainer, { backgroundColor: isDark ? '#1C2630' : '#FFFFFF', borderColor: dynamicTheme.border }]}>
                  <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                    {suggestions.map((item) => (
                      <TouchableOpacity
                        key={item.place_id}
                        style={[styles.suggestionItem, { borderBottomColor: dynamicTheme.border }]}
                        onPress={() => handleSelectSuggestion(item)}
                      >
                        <MaterialIcons name="place" size={20} color={dynamicTheme.textSecondary} />
                        <Text style={[styles.suggestionText, { color: dynamicTheme.text }]} numberOfLines={1}>
                          {item.description}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Request Button - Show when destination is set */}
            {destinationCoords && (
              <TouchableOpacity
                style={[styles.requestButton, { backgroundColor: THEME_COLORS.primary, shadowColor: THEME_COLORS.primary }]}
                onPress={handleOpenServicesModal}
                activeOpacity={0.9}
              >
                <RNAnimated.View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.2)', transform: [{ translateX: -width }] }} />
                <MaterialIcons name="rv-hookup" size={24} color={isDark ? '#0A0E12' : '#FFFFFF'} />
                <Text style={[styles.requestButtonText, { color: isDark ? '#0A0E12' : '#FFFFFF' }]}>Ver Serviços Disponíveis</Text>
                <MaterialIcons name="arrow-forward-ios" size={14} color={isDark ? 'rgba(10,14,18,0.7)' : 'rgba(255,255,255,0.7)'} />
              </TouchableOpacity>
            )}

            {/* Request Button - Show when no destination set */}
            {!destinationCoords && (
              <TouchableOpacity
                style={[styles.requestButton, { backgroundColor: THEME_COLORS.primary, shadowColor: THEME_COLORS.primary }]}
                onPress={() => {
                  Alert.alert('Destino necessário', 'Por favor, insira um destino para solicitar o guincho.');
                }}
                activeOpacity={0.9}
              >
                <RNAnimated.View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.2)', transform: [{ translateX: -width }] }} />
                <MaterialIcons name="rv-hookup" size={24} color={isDark ? '#0A0E12' : '#FFFFFF'} />
                <Text style={[styles.requestButtonText, { color: isDark ? '#0A0E12' : '#FFFFFF' }]}>Solicitar Guincho</Text>
                <MaterialIcons name="arrow-forward-ios" size={14} color={isDark ? 'rgba(10,14,18,0.7)' : 'rgba(255,255,255,0.7)'} />
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {/* Services Modal */}
      <Modal
        visible={showServicesModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowServicesModal(false)}
      >
        <View style={styles.servicesModalOverlay}>
          <View style={[styles.servicesModalContent, { backgroundColor: dynamicTheme.card }]}>
            {/* Header */}
            <View style={styles.servicesModalHeader}>
              <Text style={[styles.servicesModalTitle, { color: dynamicTheme.text }]}>Serviços Disponíveis</Text>
              <TouchableOpacity onPress={() => setShowServicesModal(false)} style={styles.closeButton}>
                <MaterialIcons name="close" size={24} color={dynamicTheme.text} />
              </TouchableOpacity>
            </View>

            {/* Route Info */}
            <View style={[styles.routeInfo, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }]}>
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: THEME_COLORS.primary }]} />
                <Text style={[styles.routeText, { color: dynamicTheme.textSecondary }]} numberOfLines={1}>
                  {pickupAddress}
                </Text>
              </View>
              <View style={styles.routeDivider} />
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: '#ef4444' }]} />
                <Text style={[styles.routeText, { color: dynamicTheme.textSecondary }]} numberOfLines={1}>
                  {destinationAddress}
                </Text>
              </View>
            </View>

            {/* Loading State */}
            {loadingServices && (
              <View style={styles.servicesLoadingContainer}>
                <Text style={{ color: dynamicTheme.textSecondary, textAlign: 'center', paddingVertical: 40 }}>
                  Buscando serviços disponíveis...
                </Text>
              </View>
            )}

            {/* Error State */}
            {servicesError && !loadingServices && (
              <View style={styles.noServicesContainer}>
                <MaterialIcons name="error-outline" size={48} color="#ef4444" />
                <Text style={{ color: dynamicTheme.textSecondary, textAlign: 'center', marginTop: 12 }}>
                  {servicesError}
                </Text>
                <TouchableOpacity
                  style={[styles.retryButton, { backgroundColor: THEME_COLORS.primary, marginTop: 16 }]}
                  onPress={() => destinationCoords && loadAvailableServices(destinationCoords.lat, destinationCoords.lng)}
                >
                  <Text style={{ color: isDark ? '#0A0E12' : '#FFFFFF', fontWeight: '600' }}>Tentar Novamente</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Services List */}
            {!loadingServices && !servicesError && availableServices.length > 0 && (
              <View style={{ flex: 1, paddingHorizontal: 16 }}>
                <ServicesList
                  services={availableServices}
                  loading={loadingServices}
                  error={servicesError}
                  selectedServiceId={selectedService?.id ?? null}
                  onSelectService={(servico) => handleSelectService(servico)}
                  onExpandService={(servico) => handleExpandService(servico)}
                  isDark={isDark}
                />
              </View>
            )}

            {/* No Services Available */}
            {!loadingServices && !servicesError && availableServices.length === 0 && (
              <View style={styles.noServicesContainer}>
                <MaterialIcons name="info-outline" size={48} color={dynamicTheme.textSecondary} />
                <Text style={{ color: dynamicTheme.textSecondary, textAlign: 'center', marginTop: 12 }}>
                  Nenhum serviço disponível nesta região no momento.
                </Text>
                <TouchableOpacity
                  style={[styles.retryButton, { backgroundColor: THEME_COLORS.primary, marginTop: 16 }]}
                  onPress={() => destinationCoords && loadAvailableServices(destinationCoords.lat, destinationCoords.lng)}
                >
                  <Text style={{ color: isDark ? '#0A0E12' : '#FFFFFF', fontWeight: '600' }}>Tentar Novamente</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Confirm Button */}
            {selectedService && (
              <View style={styles.confirmButtonContainer}>
                <TouchableOpacity
                  style={[styles.confirmServiceButton, { backgroundColor: THEME_COLORS.primary }]}
                  onPress={() => {
                    setShowServicesModal(false);
                    proceedToCheckout(selectedService);
                  }}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="check-circle" size={22} color={isDark ? '#0A0E12' : '#FFFFFF'} />
                  <Text style={[styles.confirmButtonText, { color: isDark ? '#0A0E12' : '#FFFFFF' }]}>
                    Confirmar {selectedService.tipo_servico_nome}
                  </Text>
                  <Text style={[styles.confirmButtonPrice, { color: isDark ? '#0A0E12' : '#FFFFFF' }]}>
                    R$ {selectedService.preco_final.toFixed(2)}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Service Details Modal */}
      <ServiceCardExpanded
        visible={expandedService !== null}
        servico={expandedService}
        onClose={() => setExpandedService(null)}
        onConfirm={handleConfirmService}
        isDark={isDark}
      />
    </View>
  );
}



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101922',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#101922',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 120,
    pointerEvents: 'none',
  },
  topNav: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(25, 38, 51, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  menuDropdown: {
    position: 'absolute',
    top: 50,
    left: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    width: 160,
    zIndex: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  menuText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginHorizontal: 8,
  },
  notificationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    borderWidth: 1,
    borderColor: '#192633',
  },
  fabContainer: {
    position: 'absolute',
    right: 16,
    bottom: 340, // Adjust based on bottom sheet height
    zIndex: 10,
  },
  fabButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#192633',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  bottomSheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
  },
  bottomSheet: {
    backgroundColor: '#192633',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    maxHeight: Dimensions.get('window').height * 0.85,
  },
  dragHandleContainer: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  dragHandle: {
    width: 48,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#324d67',
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  sheetContentContainer: {
    paddingBottom: 24,
  },
  sheetHeader: {
    marginBottom: 24,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  vehicleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vehicleText: {
    color: '#92adc9',
    fontSize: 14,
  },
  changeButton: {
    marginLeft: 'auto',
  },
  changeButtonText: {
    color: '#137fec',
    fontSize: 12,
    fontWeight: '600',
  },
  timelineContainer: {
    position: 'relative',
    gap: 16,
    marginBottom: 24,
  },
  timelineLine: {
    position: 'absolute',
    left: 19,
    top: 40,
    bottom: 40,
    width: 2,
    backgroundColor: '#324d67',
    borderStyle: 'dashed',
    borderWidth: 1, // simulates border
    borderColor: '#324d67', // fallback
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 20,
  },
  timelineIconContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111a22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#324d67',
    padding: 12,
    height: 56,
  },
  activeInputWrapper: {
    // borderColor: '#137fec', // optional active state
  },
  inputTextContainer: {
    flex: 1,
  },
  inputLabel: {
    color: '#92adc9',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  inputField: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
    padding: 0,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 130, // Adjust based on input position
    left: 52, // Align with input text
    right: 0,
    backgroundColor: '#1c2630',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#324d67',
    zIndex: 100,
    maxHeight: 150,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#324d67',
  },
  suggestionText: {
    color: 'white',
    fontSize: 14,
  },
  estimatesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  estimateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  estimateText: {
    color: 'white',
    fontSize: 14,
  },
  highlightText: {
    color: '#137fec',
    fontWeight: 'bold',
  },
  requestButton: {
    width: '100%',
    height: 56,
    backgroundColor: '#137fec',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#137fec',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  servicesContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  confirmButton: {
    width: '100%',
    height: 56,
    backgroundColor: '#FF5722',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#FF5722',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    marginTop: 12,
  },
  servicesModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  servicesModalContent: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    width: '100%',
  },
  servicesModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  servicesModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    padding: 8,
  },
  routeInfo: {
    padding: 16,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  routeText: {
    flex: 1,
    fontSize: 14,
  },
  routeDivider: {
    height: 16,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0,0,0,0.1)',
    marginLeft: 3,
    marginVertical: 4,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  confirmButtonPrice: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 'auto',
  },
  requestButtonText: {
    color: 'white',
    fontSize: 18,
  },
  confirmButtonContainer: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    marginTop: 'auto',
  },
  confirmServiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  servicesLoadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  noServicesContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  serviceInfo: {
    flex: 1,
    marginLeft: 16,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
  },
  serviceProvider: {
    fontSize: 13,
    marginTop: 4,
  },
  serviceRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  distanceText: {
    fontSize: 13,
    marginLeft: 8,
  },
  servicePrice: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  priceLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  userMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(19, 127, 236, 0.3)',
  },
  userMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#137fec',
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#192633',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#324d67',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#92adc9',
    textAlign: 'center',
    marginBottom: 24,
  },
  modalInput: {
    width: '100%',
    height: 56,
    backgroundColor: '#111a22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#324d67',
    paddingHorizontal: 16,
    color: 'white',
    fontSize: 16,
    marginBottom: 16,
  },
  modalCancelButton: {
    marginTop: 16,
    padding: 8,
  },
  modalCancelText: {
    color: '#92adc9',
    fontSize: 14,
  },
  offlineBanner: {
    backgroundColor: '#ef4444',
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  offlineText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
