import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, StatusBar as RNStatusBar } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import { invokeComputeQuote } from '../../lib/edge';
import { useDynamicTheme, THEME_COLORS } from '../../hooks/use-dynamic-theme';

export default function Checkout() {
  const { isDark, theme: dynamicTheme } = useDynamicTheme();
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useLocalSearchParams();

  const {
    pickup, destination, price,
    lat, lng, destLat, destLng,
    guestName
  } = params;

  const amount = Number.isFinite(Number(price)) ? Number(price) : 0;

  const handleConfirmRequest = async () => {
    if (!pickup || !destination) {
      Alert.alert('Dados incompletos', 'Origem e destino são obrigatórios.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let userAgencyId = null;

      if (user) {
        // Buscar agência do cliente logado
        const { data: profile } = await supabase
          .from('clientes')
          .select('agency_id')
          .eq('id', user.id)
          .maybeSingle();
        
        userAgencyId = profile?.agency_id || null;
      }


      const origemLat = Number(lat);
      const origemLng = Number(lng);
      const destinoLat = Number(destLat);
      const destinoLng = Number(destLng);

      if (!Number.isFinite(origemLat) || !Number.isFinite(origemLng) || (origemLat === 0 && origemLng === 0)) {
        Alert.alert('Erro', 'Localização de origem inválida. Tente novamente.');
        return;
      }

      const quote = await invokeComputeQuote({
        origem_lat: origemLat,
        origem_lng: origemLng,
        destino_lat: Number.isFinite(destinoLat) ? destinoLat : 0,
        destino_lng: Number.isFinite(destinoLng) ? destinoLng : 0,
      });

      // Prioriza a agência do usuário (se ele tiver uma via Call Center), 
      // caso contrário usa a agência retornada pelo cálculo de rota (se houver), 
      // ou mantém null para autônomos.
      const agencyId = userAgencyId || (quote as any)?.agency_id || null;
      
  const distanceKm = Number((quote as any)?.distance_km);
  const durationSeconds = Number((quote as any)?.duration_seconds);
  const etaMin = Number((quote as any)?.eta_min);
  const amountQuoted = Number((quote as any)?.amount);
  const polyline = (quote as any)?.polyline ?? null;

  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    Alert.alert('Erro', 'Não foi possível calcular a distância.');
    return;
  }

  // Se o usuário pertence a uma agência (cadastrado via Call Center), o serviço é gratuito (coberto)
  const finalAmount = agencyId ? 0 : (Number.isFinite(amountQuoted) ? amountQuoted : amount);

      const { data, error } = await supabase
        .from('solicitacoes')
        .insert([
          {
            agency_id: agencyId,
            cliente_id: user?.id || null,
            nome_visitante: guestName || null,
            origem_endereco: pickup,
            origem_lat: origemLat,
            origem_lng: origemLng,
            destino_endereco: destination,
            destino_lat: Number.isFinite(destinoLat) ? destinoLat : null,
            destino_lng: Number.isFinite(destinoLng) ? destinoLng : null,
            status: 'pendente',
            valor: finalAmount,
            distancia_km: Number(distanceKm.toFixed(2)),
            tempo_estimado_min: Number.isFinite(etaMin) && etaMin > 0 ? etaMin : Math.max(1, Math.round(durationSeconds / 60)),
            route_polyline: polyline,
            route_distance_m: Math.round(distanceKm * 1000),
            route_duration_s: Number.isFinite(durationSeconds) ? Math.round(durationSeconds) : null,
          }
        ])
        .select()
        .single();

      if (error) throw error;

      // Chamar auto-dispatch para notificar prestadores próximos
      try {
        await supabase.functions.invoke('auto-dispatch', {
          body: { solicitacao_id: data.id },
        });
      } catch (dispatchErr) {
        console.warn('Auto-dispatch failed (will fallback to manual):', dispatchErr);
      }

      Alert.alert('Sucesso', 'Solicitação de guincho criada!');

      router.replace({
        pathname: '/(client)/tracking',
        params: { requestId: data.id }
      });
    } catch (err: any) {
      Alert.alert('Erro', 'Não foi possível criar a solicitação: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: dynamicTheme.background }]}>
      <RNStatusBar barStyle={dynamicTheme.statusBar} />
      <View style={[styles.card, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}>
        <Text style={[styles.title, { color: dynamicTheme.text }]}>Resumo do Pedido</Text>

        <View style={styles.row}>
          <Text style={[styles.label, { color: dynamicTheme.textSecondary }]}>Origem:</Text>
          <Text style={[styles.value, { color: dynamicTheme.text }]} numberOfLines={1}>{pickup}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: dynamicTheme.textSecondary }]}>Destino:</Text>
          <Text style={[styles.value, { color: dynamicTheme.text }]} numberOfLines={1}>{destination}</Text>
        </View>

        <View style={[styles.divider, { backgroundColor: dynamicTheme.border }]} />

        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: dynamicTheme.text }]}>Total</Text>
          <Text style={[styles.totalValue, { color: THEME_COLORS.primary }]}>
            {amount > 0 ? `R$ ${amount.toFixed(2)}` : 'Coberto'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.payButton, { backgroundColor: THEME_COLORS.primary }]}
          onPress={handleConfirmRequest}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={isDark ? '#0A0E12' : '#FFFFFF'} />
          ) : (
            <>
              <MaterialIcons name="check-circle" size={24} color={isDark ? '#0A0E12' : '#FFFFFF'} />
              <Text style={[styles.payButtonText, { color: isDark ? '#0A0E12' : '#FFFFFF' }]}>Confirmar Solicitação</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101922',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#1c2630',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155',
  },
  title: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  label: {
    color: '#94a3b8',
    fontSize: 14,
    width: 80,
  },
  value: {
    color: 'white',
    fontSize: 14,
    flex: 1,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 32,
  },
  totalLabel: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  totalValue: {
    color: '#22c55e',
    fontSize: 32,
    fontWeight: 'bold',
  },
  payButton: {
    backgroundColor: '#137fec',
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  payButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
