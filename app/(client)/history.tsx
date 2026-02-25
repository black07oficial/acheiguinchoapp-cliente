import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image, Alert, StatusBar as RNStatusBar } from 'react-native';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDynamicTheme, THEME_COLORS } from '../../hooks/use-dynamic-theme';

export default function History() {
  const { isDark, theme: dynamicTheme } = useDynamicTheme();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data, error } = await supabase
        .from('solicitacoes')
        .select(`
            *,
            prestador:prestadores(nome, modelo_veiculo),
            cliente:clientes(nome)
        `)
        .eq('cliente_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (requestId: string) => {
    Alert.alert(
      'Cancelar solicitação',
      'Tem certeza que deseja cancelar esta solicitação pendente?',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Sim, cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.rpc('cancel_my_solicitacao', { p_solicitacao_id: requestId });
              if (error) throw error;
              await fetchHistory();
            } catch (e: any) {
              Alert.alert('Erro', e?.message || 'Não foi possível cancelar.');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: any }) => {
    const isCompleted = item.status === 'finalizado';
    const isPending = item.status === 'pendente';
    const date = new Date(item.created_at).toLocaleDateString('pt-BR');
    const time = new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.card, { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border }]}>
        <View style={styles.cardHeader}>
            <View style={styles.dateContainer}>
                <Text style={[styles.dateText, { color: dynamicTheme.text }]}>{date}</Text>
                <Text style={[styles.timeText, { color: dynamicTheme.textSecondary }]}>{time}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: isCompleted ? 'rgba(34, 197, 94, 0.1)' : (item.status === 'cancelado' ? 'rgba(239, 68, 68, 0.1)' : THEME_COLORS.primary + '20') }]}>
                <Text style={[styles.statusText, { color: isCompleted ? '#22c55e' : (item.status === 'cancelado' ? '#ef4444' : THEME_COLORS.primary) }]}>
                    {item.status.toUpperCase()}
                </Text>
            </View>
        </View>

        <View style={styles.routeContainer}>
            <View style={styles.routeRow}>
                <View style={[styles.dot, { backgroundColor: dynamicTheme.textSecondary }]} />
                <Text style={[styles.addressText, { color: dynamicTheme.text }]} numberOfLines={1}>{item.origem_endereco}</Text>
            </View>
            <View style={[styles.line, { backgroundColor: dynamicTheme.border }]} />
            <View style={styles.routeRow}>
                <View style={[styles.dot, { backgroundColor: THEME_COLORS.primary }]} />
                <Text style={[styles.addressText, { color: dynamicTheme.text }]} numberOfLines={1}>{item.destino_endereco}</Text>
            </View>
        </View>

        <View style={[styles.footer, { borderTopColor: dynamicTheme.border }]}>
            <View style={styles.priceContainer}>
                <Text style={[styles.priceLabel, { color: dynamicTheme.textSecondary }]}>Valor Total</Text>
                <Text style={[styles.priceValue, { color: dynamicTheme.text }]}>
                  {item.valor > 0 ? `R$ ${item.valor?.toFixed(2)}` : 'Coberto'}
                </Text>
            </View>
            {isPending && userId && item.cliente_id === userId && (
                <TouchableOpacity style={[styles.cancelButton, { borderColor: 'rgba(239, 68, 68, 0.35)' }]} onPress={() => handleCancel(item.id)}>
                    <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>
            )}
            {isCompleted && (
                <TouchableOpacity style={styles.receiptButton}>
                    <Text style={[styles.receiptText, { color: THEME_COLORS.primary }]}>Recibo</Text>
                    <MaterialIcons name="chevron-right" size={20} color={THEME_COLORS.primary} />
                </TouchableOpacity>
            )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: dynamicTheme.background }]}>
      <RNStatusBar barStyle={dynamicTheme.statusBar} />
      <View style={[styles.header, { backgroundColor: dynamicTheme.card, borderBottomColor: dynamicTheme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={dynamicTheme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: dynamicTheme.text }]}>Histórico de Viagens</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
            <ActivityIndicator color={THEME_COLORS.primary} size="large" />
        </View>
      ) : (
        <FlatList
            data={requests}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
                <View style={styles.emptyState}>
                    <MaterialIcons name="history" size={64} color={dynamicTheme.border} />
                    <Text style={[styles.emptyText, { color: dynamicTheme.textSecondary }]}>Nenhuma viagem realizada ainda.</Text>
                </View>
            }
        />
      )}
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
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#101922',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 20,
  },
  card: {
    backgroundColor: '#1c2530',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  dateContainer: {
    gap: 4,
  },
  dateText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  timeText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  routeContainer: {
    gap: 12,
    marginBottom: 16,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  line: {
    position: 'absolute',
    left: 3.5,
    top: 8,
    bottom: 8,
    width: 1,
    backgroundColor: '#334155',
    zIndex: -1,
  },
  addressText: {
    color: '#cbd5e1',
    fontSize: 14,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  priceContainer: {
    gap: 2,
  },
  priceLabel: {
    color: '#94a3b8',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  priceValue: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  receiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  receiptText: {
    color: '#137fec',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  cancelText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    gap: 16,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 16,
  },
});
