import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Platform, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');

export default function CompletionSummary() {
  const router = useRouter();
  const { requestId } = useLocalSearchParams();
  const [requestData, setRequestData] = useState<any>(null);

  useEffect(() => {
    if (requestId) {
      supabase
        .from('solicitacoes')
        .select(`
            *,
            cliente:clientes(*)
        `)
        .eq('id', requestId)
        .single()
        .then(({ data }) => setRequestData(data));
    }
  }, [requestId]);

  const handleClose = () => {
    router.replace('/(provider)/home');
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' • ' +
      date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  if (!requestData) {
    return <View style={styles.container} />;
  }

  // Dados financeiros reais da corrida
  const valorBase = Number(requestData.valor) || 0;
  const valorPedagio = Number(requestData.valor_pedagio) || 0;
  const patinsUsado = requestData.patins_usado || false;
  const patinsQtd = Number(requestData.patins_qtd) || 0;
  const patinsValor = Number(requestData.patins_valor) || 0;
  const total = Number(requestData.valor_final) || (valorBase + valorPedagio + patinsValor);
  const taxaComissao = Number(requestData.taxa_comissao) || 15;
  const valorComissao = Number(requestData.valor_comissao) || (total * taxaComissao / 100);
  const ganhoLiquido = total - valorComissao;
  const distanciaKm = requestData.distancia_km ||
    (requestData.route_distance_m ? (requestData.route_distance_m / 1000).toFixed(1) : '0');

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <MaterialIcons name="close" size={24} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Resumo</Text>
          <View style={{ width: 24 }} />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Success Animation / Header */}
        <View style={styles.successSection}>
          <View style={styles.iconContainer}>
            <View style={styles.glowEffect} />
            <View style={styles.checkCircle}>
              <MaterialIcons name="check-circle" size={48} color="#0d7ff2" />
            </View>
          </View>
          <Text style={styles.successTitle}>Serviço Concluído</Text>
          <Text style={styles.dateText}>{formatDate(requestData.created_at)}</Text>
        </View>

        {/* Receipt Card */}
        <View style={styles.card}>
          <View style={styles.lineItemRow}>
            <View style={styles.lineItemRowContent}>
              <Text style={styles.lineItemLabel}>Valor do Serviço</Text>
              <Text style={styles.lineItemValue}>R$ {valorBase.toFixed(2)}</Text>
            </View>
          </View>

          <View style={styles.lineItemRow}>
            <View style={styles.lineItemRowContent}>
              <View>
                <Text style={styles.lineItemLabel}>Distância Percorrida</Text>
                <Text style={styles.lineItemSubLabel}>{distanciaKm} km</Text>
              </View>
            </View>
          </View>

          {/* Pedágio */}
          {valorPedagio > 0 && (
            <View style={styles.lineItemRow}>
              <View style={styles.lineItemRowContent}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialIcons name="toll" size={16} color="#60a5fa" />
                  <Text style={styles.lineItemLabel}>Pedágio</Text>
                </View>
                <Text style={[styles.lineItemValue, { color: '#60a5fa' }]}>R$ {valorPedagio.toFixed(2)}</Text>
              </View>
            </View>
          )}

          {/* Patins */}
          {patinsUsado && patinsValor > 0 && (
            <View style={styles.lineItemRow}>
              <View style={styles.lineItemRowContent}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialIcons name="build" size={16} color="#f59e0b" />
                    <Text style={styles.lineItemLabel}>Patins</Text>
                  </View>
                  <Text style={styles.lineItemSubLabel}>{patinsQtd} unidade(s)</Text>
                </View>
                <Text style={[styles.lineItemValue, { color: '#f59e0b' }]}>R$ {patinsValor.toFixed(2)}</Text>
              </View>
            </View>
          )}

          {/* Total bruto */}
          {(valorPedagio > 0 || patinsValor > 0) && (
            <>
              <View style={styles.subtotalDivider} />
              <View style={styles.lineItemRow}>
                <View style={styles.lineItemRowContent}>
                  <Text style={[styles.lineItemLabel, { fontWeight: '600', color: '#e5e7eb' }]}>Total Bruto</Text>
                  <Text style={[styles.lineItemValue, { fontWeight: '700' }]}>R$ {total.toFixed(2)}</Text>
                </View>
              </View>
            </>
          )}

          <View style={styles.lineItemRow}>
            <View style={styles.lineItemRowContent}>
              <View>
                <Text style={[styles.lineItemLabel, { color: '#ef4444' }]}>Taxa da Plataforma</Text>
                <Text style={styles.lineItemSubLabel}>{taxaComissao}% de comissão</Text>
              </View>
              <Text style={[styles.lineItemValue, { color: '#ef4444' }]}>- R$ {valorComissao.toFixed(2)}</Text>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Ganho Líquido */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Ganho Líquido</Text>
            <Text style={styles.totalValue}>R$ {ganhoLiquido.toFixed(2)}</Text>
          </View>
        </View>

        {/* Commission Info */}
        <View style={styles.paymentCard}>
          <View style={styles.paymentInfo}>
            <View style={[styles.paymentIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
              <MaterialIcons name="account-balance-wallet" size={24} color="#f59e0b" />
            </View>
            <View>
              <Text style={styles.paymentTitle}>Comissão Registrada</Text>
              <Text style={[styles.paymentSubtitle, { color: '#f59e0b' }]}>R$ {valorComissao.toFixed(2)} adicionado ao saldo devedor</Text>
            </View>
          </View>
          <MaterialIcons name="info-outline" size={20} color="#64748b" />
        </View>

        {/* Route Details */}
        <View style={styles.routeSection}>
          <Text style={styles.routeHeader}>Detalhes da Rota</Text>
          <View style={styles.routeContainer}>
            <View style={styles.routeLine} />

            <View style={styles.routePoint}>
              <View style={[styles.dot, { backgroundColor: 'white', borderColor: '#101922' }]} />
              <View>
                <Text style={styles.pointLabel}>Origem</Text>
                <Text style={styles.pointAddress} numberOfLines={1}>{requestData.origem_endereco}</Text>
              </View>
            </View>

            <View style={styles.routePoint}>
              <View style={[styles.dot, { backgroundColor: '#0d7ff2', borderColor: '#101922' }]} />
              <View>
                <Text style={styles.pointLabel}>Destino</Text>
                <Text style={styles.pointAddress} numberOfLines={1}>{requestData.destino_endereco}</Text>
              </View>
            </View>
          </View>
        </View>

      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.confirmButton} onPress={handleClose}>
          <Text style={styles.confirmButtonText}>Confirmar e Fechar</Text>
          <MaterialIcons name="arrow-forward" size={20} color="white" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.reportButton}>
          <Text style={styles.reportButtonText}>Reportar um problema</Text>
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
  safeArea: {
    backgroundColor: '#101922',
    paddingTop: Platform.OS === 'android' ? 40 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  successSection: {
    alignItems: 'center',
    marginVertical: 24,
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  glowEffect: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(13, 127, 242, 0.2)',
  },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(13, 127, 242, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(13, 127, 242, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  dateText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#1c2530',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 16,
  },
  lineItemRow: {
    marginBottom: 16,
  },
  lineItemRowContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lineItemLabel: {
    color: '#9ca3af',
    fontSize: 14,
  },
  lineItemSubLabel: {
    color: '#4b5563',
    fontSize: 12,
    marginTop: 2,
  },
  lineItemValue: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 16,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  subtotalDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  totalLabel: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  totalValue: {
    color: '#0d7ff2',
    fontSize: 30,
    fontWeight: 'bold',
  },
  paymentCard: {
    backgroundColor: '#1c2530',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  paymentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentIconBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#2c3b4b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  paymentSubtitle: {
    color: '#4ade80',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  routeSection: {
    paddingHorizontal: 8,
  },
  routeHeader: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  routeContainer: {
    paddingLeft: 16,
    gap: 24,
    position: 'relative',
  },
  routeLine: {
    position: 'absolute',
    left: 20, // (16 padding + 4 dot radius)
    top: 6,
    bottom: 20,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  routePoint: {
    position: 'relative',
  },
  dot: {
    position: 'absolute',
    left: -21,
    top: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  pointLabel: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 2,
  },
  pointAddress: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#101922',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    gap: 12,
  },
  confirmButton: {
    backgroundColor: '#0d7ff2',
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  reportButton: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportButtonText: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '500',
  },
});
