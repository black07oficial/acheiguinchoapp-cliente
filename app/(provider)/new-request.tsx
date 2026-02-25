import { View, Text, StyleSheet, TouchableOpacity, Alert, Dimensions, ScrollView, Image, Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');

export default function NewRequest() {
  const router = useRouter();
  const { requestId } = useLocalSearchParams();
  const [timeLeft, setTimeLeft] = useState(30);
  const [requestData, setRequestData] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });

    // Fetch request data
    if (requestId) {
      supabase
        .from('solicitacoes')
        .select(`
                *,
                cliente:clientes(nome, tipo_veiculo)
            `)
        .eq('id', requestId)
        .single()
        .then(({ data, error }) => {
          if (!error) setRequestData(data);
        });
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleDecline(); // Auto-reject
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [requestId]);

  const handleAccept = async () => {
    try {
      if (!userId) throw new Error('Sessão expirada');

      // Try directed first (already assigned to me)
      const { data: directed, error: err1 } = await supabase
        .from('solicitacoes')
        .update({ status: 'em_andamento' })
        .eq('id', requestId)
        .eq('prestador_id', userId)
        .eq('status', 'direcionada')
        .select('id')
        .maybeSingle();

      if (err1) throw err1;

      // If not directed, try to claim a pending request
      if (!directed) {
        const { data: claimed, error: err2 } = await supabase
          .from('solicitacoes')
          .update({ status: 'em_andamento', prestador_id: userId })
          .eq('id', requestId)
          .is('prestador_id', null)
          .eq('status', 'pendente')
          .select('id')
          .maybeSingle();

        if (err2) throw err2;
        if (!claimed) {
          Alert.alert("Indisponível", "Este job já foi aceito por outro prestador.");
          router.back();
          return;
        }
      }

      // Go to navigation/map screen
      Alert.alert("Job Aceito", "Navegando até o local de recolha...");
      router.replace({
        pathname: '/(provider)/active-request',
        params: { requestId }
      });

    } catch (err: any) {
      Alert.alert("Erro", "Não foi possível aceitar o job: " + err.message);
    }
  };

  const handleDecline = async () => {
    try {
      if (!userId) {
        router.back();
        return;
      }

      // Check the current request status
      const currentStatus = requestData?.status;

      if (currentStatus === 'direcionada') {
        // Unassign provider so it goes back to pool
        const { error } = await supabase
          .from('solicitacoes')
          .update({ prestador_id: null, status: 'pendente' })
          .eq('id', requestId)
          .eq('prestador_id', userId)
          .eq('status', 'direcionada');

        if (error) throw error;
      }
      // For 'pendente' status: just go back, no DB change needed

      router.back();
    } catch (err) {
      console.error(err);
      router.back();
    }
  };

  if (!requestData) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: 'white' }}>Loading Request...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Urgency Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconContainer}>
            <View style={styles.pulseBg} />
            <MaterialIcons name="notifications-active" size={24} color="#ef4444" />
          </View>
          <Text style={styles.headerTitle}>New Tow Request</Text>
        </View>
        <View style={styles.timerContainer}>
          <MaterialIcons name="timer" size={16} color="#137fec" />
          <Text style={styles.timerText}>00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Map Preview */}
        <View style={styles.mapPreviewContainer}>
          <View style={styles.mapWrapper}>
            {/* Static Map Image Placeholder (In real app, use Lite Mode MapView) */}
            <MapView
              style={styles.miniMap}
              provider={PROVIDER_GOOGLE}
              initialRegion={{
                latitude: requestData.origem_lat || 0,
                longitude: requestData.origem_lng || 0,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              liteMode={true}
              scrollEnabled={false}
              zoomEnabled={false}
            >
              <Marker coordinate={{ latitude: requestData.origem_lat, longitude: requestData.origem_lng }} pinColor="green" />
              <Marker coordinate={{ latitude: requestData.destino_lat, longitude: requestData.destino_lng }} pinColor="red" />
            </MapView>

            {/* Distance Tag */}
            <View style={styles.distanceTag}>
              <MaterialIcons name="near-me" size={16} color="white" />
              <Text style={styles.distanceTagText}>{requestData.distancia_km} km total</Text>
            </View>
          </View>
        </View>

        {/* Timer Bar */}
        <View style={styles.timerBarContainer}>
          <View style={styles.timerTrack}>
            <View style={[styles.timerFill, { width: `${(timeLeft / 30) * 100}%` }]} />
          </View>
          <Text style={styles.autoRejectText}>Auto-rejects in {timeLeft}s</Text>
        </View>

        {/* Key Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <MaterialIcons name="place" size={24} color="#94a3b8" style={{ marginBottom: 4 }} />
            <Text style={styles.statValue}>{requestData.distancia_km} km</Text>
            <Text style={styles.statLabel}>Distance</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialIcons name="schedule" size={24} color="#94a3b8" style={{ marginBottom: 4 }} />
            <Text style={styles.statValue}>{requestData.tempo_estimado_min} min</Text>
            <Text style={styles.statLabel}>Est. Time</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialIcons name="payments" size={24} color="#94a3b8" style={{ marginBottom: 4 }} />
            <Text style={styles.statValue}>R$ {requestData.valor}</Text>
            <Text style={styles.statLabel}>Earning</Text>
          </View>
        </View>

        {/* Job Details */}
        <View style={styles.detailsContainer}>
          <Text style={styles.sectionTitle}>JOB DETAILS</Text>
          <View style={styles.detailsCard}>
            {/* Vehicle */}
            <View style={styles.detailRow}>
              <View style={styles.detailIconBg}>
                <MaterialIcons name="directions-car" size={20} color="#64748b" />
              </View>
              <View>
                <Text style={styles.detailLabel}>Vehicle Type</Text>
                <Text style={styles.detailValue}>{requestData.cliente?.tipo_veiculo || 'Unknown'}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Pickup Address */}
            <View style={styles.detailRow}>
              <View style={[styles.detailIconBg, { backgroundColor: 'rgba(34, 197, 94, 0.1)' }]}>
                <MaterialIcons name="my-location" size={20} color="#22c55e" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Pickup Location</Text>
                <Text style={styles.detailValue} numberOfLines={2}>{requestData.origem_endereco}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Destination */}
            <View style={styles.detailRow}>
              <View style={[styles.detailIconBg, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                <MaterialIcons name="location-on" size={20} color="#ef4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Destination</Text>
                <Text style={styles.detailValue} numberOfLines={2}>{requestData.destino_endereco}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Customer */}
            <View style={styles.detailRow}>
              <View style={styles.detailIconBg}>
                <MaterialIcons name="person" size={20} color="#64748b" />
              </View>
              <View>
                <Text style={styles.detailLabel}>Customer</Text>
                <View style={styles.customerRow}>
                  <Text style={styles.detailValue}>{requestData.cliente?.nome || 'Customer'}</Text>
                  <View style={styles.ratingTag}>
                    <MaterialIcons name="star" size={10} color="#ca8a04" />
                    <Text style={styles.ratingTagText}>5.0</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Fixed Action Bar */}
      <View style={styles.actionBar}>
        <View style={styles.actionGrid}>
          <TouchableOpacity style={styles.declineButton} onPress={handleDecline}>
            <MaterialIcons name="close" size={24} color="#334155" />
            <Text style={styles.declineText}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.acceptButton} onPress={handleAccept}>
            <MaterialIcons name="check-circle" size={24} color="white" />
            <Text style={styles.acceptText}>Accept Job</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// Reusing dark map style
const darkMapStyle = [
  {
    "elementType": "geometry",
    "stylers": [{ "color": "#212121" }]
  },
  {
    "elementType": "labels.icon",
    "stylers": [{ "visibility": "off" }]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#757575" }]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [{ "color": "#212121" }]
  },
  {
    "featureType": "administrative",
    "elementType": "geometry",
    "stylers": [{ "color": "#757575" }]
  },
  {
    "featureType": "administrative.country",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#9e9e9e" }]
  },
  {
    "featureType": "administrative.land_parcel",
    "stylers": [{ "visibility": "off" }]
  },
  {
    "featureType": "administrative.locality",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#bdbdbd" }]
  },
  {
    "featureType": "poi",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#757575" }]
  },
  {
    "featureType": "poi.park",
    "elementType": "geometry",
    "stylers": [{ "color": "#181818" }]
  },
  {
    "featureType": "poi.park",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#616161" }]
  },
  {
    "featureType": "poi.park",
    "elementType": "labels.text.stroke",
    "stylers": [{ "color": "#1b1b1b" }]
  },
  {
    "featureType": "road",
    "elementType": "geometry.fill",
    "stylers": [{ "color": "#2c2c2c" }]
  },
  {
    "featureType": "road",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#8a8a8a" }]
  },
  {
    "featureType": "road.arterial",
    "elementType": "geometry",
    "stylers": [{ "color": "#373737" }]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [{ "color": "#3c3c3c" }]
  },
  {
    "featureType": "road.highway.controlled_access",
    "elementType": "geometry",
    "stylers": [{ "color": "#4e4e4e" }]
  },
  {
    "featureType": "road.local",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#616161" }]
  },
  {
    "featureType": "transit",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#757575" }]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [{ "color": "#000000" }]
  },
  {
    "featureType": "water",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#3d3d3d" }]
  }
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101922',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50, // Safe area
    paddingBottom: 16,
    backgroundColor: '#101922',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pulseBg: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  headerTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1C2630',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  timerText: {
    color: '#137fec',
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  scrollContent: {
    paddingBottom: 100, // Space for action bar
  },
  mapPreviewContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  mapWrapper: {
    height: 192,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
    position: 'relative',
  },
  miniMap: {
    width: '100%',
    height: '100%',
  },
  distanceTag: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(28, 38, 48, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  distanceTagText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  timerBarContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  timerTrack: {
    height: 4,
    backgroundColor: '#1e293b',
    borderRadius: 2,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  timerFill: {
    height: '100%',
    backgroundColor: '#137fec',
    borderRadius: 2,
  },
  autoRejectText: {
    textAlign: 'right',
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1C2630',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  statValue: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#64748b',
    fontSize: 12,
  },
  detailsContainer: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 12,
    letterSpacing: 1,
  },
  detailsCard: {
    backgroundColor: '#1C2630',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 16,
  },
  detailIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  detailValue: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(234, 179, 8, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 2,
  },
  ratingTagText: {
    color: '#eab308',
    fontSize: 10,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    opacity: 0.5,
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: '#101922',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  declineButton: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#475569',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  declineText: {
    color: '#cbd5e1',
    fontSize: 16,
    fontWeight: '600',
  },
  acceptButton: {
    flex: 2,
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
  acceptText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
