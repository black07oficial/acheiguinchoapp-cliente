import { View, Text, StyleSheet, TouchableOpacity, FlatList, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

type Transaction = {
    id: string;
    tipo: 'comissao' | 'pagamento' | 'ajuste';
    valor: number;
    descricao: string | null;
    created_at: string;
    solicitacao_id: string | null;
};

type Period = 'hoje' | 'semana' | 'mes' | 'ano';

function getDateRange(period: Period): Date {
    const now = new Date();
    switch (period) {
        case 'hoje':
            return new Date(now.getFullYear(), now.getMonth(), now.getDate());
        case 'semana':
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());
            weekStart.setHours(0, 0, 0, 0);
            return weekStart;
        case 'mes':
            return new Date(now.getFullYear(), now.getMonth(), 1);
        case 'ano':
            return new Date(now.getFullYear(), 0, 1);
    }
}

export default function FinancialScreen() {
    const router = useRouter();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
    const [saldoDevedor, setSaldoDevedor] = useState(0);
    const [totalComissoes, setTotalComissoes] = useState(0);
    const [totalPagamentos, setTotalPagamentos] = useState(0);
    const [periodComissoes, setPeriodComissoes] = useState(0);
    const [periodGanhos, setPeriodGanhos] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedPeriod, setSelectedPeriod] = useState<Period>('mes');
    const [comissaoTaxa, setComissaoTaxa] = useState(15);

    useEffect(() => {
        fetchFinancialData();
    }, []);

    useEffect(() => {
        filterByPeriod(selectedPeriod);
    }, [selectedPeriod, allTransactions]);

    const fetchFinancialData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Fetch commission rate from config
            const { data: configData } = await supabase
                .from('configuracoes')
                .select('valor')
                .eq('chave', 'comissao_plataforma')
                .maybeSingle();
            if (configData) {
                setComissaoTaxa(Number(configData.valor) || 15);
            }

            // Fetch saldo from view
            const { data: saldo } = await supabase
                .from('prestador_saldo')
                .select('*')
                .eq('prestador_id', user.id)
                .maybeSingle();

            if (saldo) {
                setSaldoDevedor(Number(saldo.saldo_devedor) || 0);
                setTotalComissoes(Number(saldo.total_comissoes) || 0);
                setTotalPagamentos(Number(saldo.total_pagamentos) || 0);
            }

            // Fetch all transactions
            const { data: txns } = await supabase
                .from('prestador_transacoes')
                .select('*')
                .eq('prestador_id', user.id)
                .order('created_at', { ascending: false })
                .limit(200);

            if (txns) {
                setAllTransactions(txns);
            }
        } catch (error) {
            console.error('Erro ao buscar dados financeiros:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const filterByPeriod = (period: Period) => {
        const startDate = getDateRange(period);
        const filtered = allTransactions.filter(t => new Date(t.created_at) >= startDate);
        setTransactions(filtered);

        // Calculate period totals
        const pComissoes = filtered
            .filter(t => t.tipo === 'comissao')
            .reduce((sum, t) => sum + t.valor, 0);
        const pPagamentos = filtered
            .filter(t => t.tipo === 'pagamento')
            .reduce((sum, t) => sum + t.valor, 0);

        setPeriodComissoes(pComissoes);
        // Ganhos = valor total dos serviços (comissão / taxa * 100)
        setPeriodGanhos(comissaoTaxa > 0 ? (pComissoes / comissaoTaxa * 100) : 0);
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchFinancialData();
    }, []);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) +
            ' • ' +
            date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };

    const getTypeIcon = (tipo: string) => {
        switch (tipo) {
            case 'comissao': return 'trending-up';
            case 'pagamento': return 'check-circle';
            case 'ajuste': return 'tune';
            default: return 'receipt';
        }
    };

    const getTypeColor = (tipo: string) => {
        switch (tipo) {
            case 'comissao': return '#ef4444';
            case 'pagamento': return '#22c55e';
            case 'ajuste': return '#3b82f6';
            default: return '#94a3b8';
        }
    };

    const getTypeLabel = (tipo: string) => {
        switch (tipo) {
            case 'comissao': return 'Comissão';
            case 'pagamento': return 'Pagamento';
            case 'ajuste': return 'Ajuste';
            default: return tipo;
        }
    };

    const getPeriodLabel = (period: Period) => {
        switch (period) {
            case 'hoje': return 'Hoje';
            case 'semana': return 'Semana';
            case 'mes': return 'Mês';
            case 'ano': return 'Ano';
        }
    };

    const renderTransaction = ({ item }: { item: Transaction }) => (
        <View style={styles.transactionItem}>
            <View style={[styles.transactionIcon, { backgroundColor: `${getTypeColor(item.tipo)}20` }]}>
                <MaterialIcons name={getTypeIcon(item.tipo) as any} size={20} color={getTypeColor(item.tipo)} />
            </View>
            <View style={styles.transactionInfo}>
                <Text style={styles.transactionType}>{getTypeLabel(item.tipo)}</Text>
                <Text style={styles.transactionDesc} numberOfLines={1}>
                    {item.descricao || 'Sem descrição'}
                </Text>
                <Text style={styles.transactionDate}>{formatDate(item.created_at)}</Text>
            </View>
            <Text style={[styles.transactionAmount, { color: item.tipo === 'comissao' ? '#ef4444' : '#22c55e' }]}>
                {item.tipo === 'comissao' ? '-' : '+'}R$ {item.valor.toFixed(2)}
            </Text>
        </View>
    );

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#137fec" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <MaterialIcons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Financeiro</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Period Tabs */}
            <View style={styles.periodTabs}>
                {(['hoje', 'semana', 'mes', 'ano'] as Period[]).map((period) => (
                    <TouchableOpacity
                        key={period}
                        style={[styles.periodTab, selectedPeriod === period && styles.periodTabActive]}
                        onPress={() => setSelectedPeriod(period)}
                    >
                        <Text style={[styles.periodTabText, selectedPeriod === period && styles.periodTabTextActive]}>
                            {getPeriodLabel(period)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Saldo Card */}
            <View style={styles.saldoCard}>
                <View style={styles.saldoRow}>
                    <View style={styles.saldoMainCol}>
                        <Text style={styles.saldoLabel}>SALDO DEVEDOR</Text>
                        <Text style={[styles.saldoValue, { color: saldoDevedor > 0 ? '#f59e0b' : '#22c55e' }]}>
                            R$ {saldoDevedor.toFixed(2)}
                        </Text>
                    </View>
                    <View style={styles.saldoTaxBadge}>
                        <Text style={styles.saldoTaxLabel}>Taxa</Text>
                        <Text style={styles.saldoTaxValue}>{comissaoTaxa}%</Text>
                    </View>
                </View>

                <View style={styles.saldoDetails}>
                    <View style={styles.saldoDetailItem}>
                        <View style={[styles.detailDot, { backgroundColor: '#3b82f6' }]} />
                        <Text style={styles.detailLabel}>Ganhos ({getPeriodLabel(selectedPeriod)})</Text>
                        <Text style={[styles.detailValue, { color: '#3b82f6' }]}>R$ {periodGanhos.toFixed(2)}</Text>
                    </View>
                    <View style={styles.saldoDivider} />
                    <View style={styles.saldoDetailItem}>
                        <View style={[styles.detailDot, { backgroundColor: '#ef4444' }]} />
                        <Text style={styles.detailLabel}>Comissão ({getPeriodLabel(selectedPeriod)})</Text>
                        <Text style={[styles.detailValue, { color: '#ef4444' }]}>R$ {periodComissoes.toFixed(2)}</Text>
                    </View>
                </View>

                <View style={styles.totalBar}>
                    <View style={styles.totalBarItem}>
                        <MaterialIcons name="trending-up" size={14} color="#ef4444" />
                        <Text style={styles.totalBarLabel}>Total Comissões</Text>
                        <Text style={[styles.totalBarValue, { color: '#ef4444' }]}>R$ {totalComissoes.toFixed(2)}</Text>
                    </View>
                    <View style={styles.totalBarDivider} />
                    <View style={styles.totalBarItem}>
                        <MaterialIcons name="check-circle" size={14} color="#22c55e" />
                        <Text style={styles.totalBarLabel}>Total Pagamentos</Text>
                        <Text style={[styles.totalBarValue, { color: '#22c55e' }]}>R$ {totalPagamentos.toFixed(2)}</Text>
                    </View>
                </View>
            </View>

            {/* Transactions */}
            <View style={styles.transactionsSection}>
                <Text style={styles.sectionTitle}>
                    TRANSAÇÕES ({getPeriodLabel(selectedPeriod).toUpperCase()})
                    <Text style={styles.transactionCount}> • {transactions.length}</Text>
                </Text>
                {transactions.length === 0 ? (
                    <View style={styles.emptyState}>
                        <MaterialIcons name="receipt-long" size={48} color="#324d67" />
                        <Text style={styles.emptyText}>Nenhuma transação</Text>
                        <Text style={styles.emptySubtext}>
                            Não há transações para o período selecionado.
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={transactions}
                        keyExtractor={(item) => item.id}
                        renderItem={renderTransaction}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 100 }}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#137fec" />
                        }
                    />
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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? 48 : 56,
        paddingBottom: 16,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    periodTabs: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 16,
        backgroundColor: '#1c2530',
        borderRadius: 12,
        padding: 4,
    },
    periodTab: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 10,
    },
    periodTabActive: {
        backgroundColor: '#137fec',
    },
    periodTabText: {
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: '600',
    },
    periodTabTextActive: {
        color: 'white',
    },
    saldoCard: {
        backgroundColor: '#1c2530',
        borderRadius: 16,
        padding: 20,
        marginHorizontal: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    saldoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    saldoMainCol: {},
    saldoLabel: {
        color: '#94a3b8',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1,
        marginBottom: 4,
    },
    saldoValue: {
        fontSize: 32,
        fontWeight: 'bold',
    },
    saldoTaxBadge: {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        alignItems: 'center',
    },
    saldoTaxLabel: {
        color: '#94a3b8',
        fontSize: 10,
        fontWeight: '600',
    },
    saldoTaxValue: {
        color: '#f59e0b',
        fontSize: 18,
        fontWeight: 'bold',
    },
    saldoDetails: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    saldoDetailItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    detailDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    detailLabel: {
        color: '#94a3b8',
        fontSize: 11,
        flex: 1,
    },
    detailValue: {
        fontSize: 13,
        fontWeight: '600',
    },
    saldoDivider: {
        width: 1,
        height: 24,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginHorizontal: 12,
    },
    totalBar: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
        paddingTop: 12,
    },
    totalBarItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    totalBarDivider: {
        width: 1,
        height: 18,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginHorizontal: 8,
    },
    totalBarLabel: {
        color: '#64748b',
        fontSize: 10,
        flex: 1,
    },
    totalBarValue: {
        fontSize: 12,
        fontWeight: '600',
    },
    transactionsSection: {
        flex: 1,
        paddingHorizontal: 16,
    },
    sectionTitle: {
        color: '#94a3b8',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
        marginBottom: 12,
    },
    transactionCount: {
        color: '#64748b',
        fontWeight: '400',
    },
    transactionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1c2530',
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    transactionIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    transactionInfo: {
        flex: 1,
    },
    transactionType: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
    transactionDesc: {
        color: '#94a3b8',
        fontSize: 12,
        marginTop: 2,
    },
    transactionDate: {
        color: '#64748b',
        fontSize: 11,
        marginTop: 4,
    },
    transactionAmount: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
        gap: 12,
    },
    emptyText: {
        color: '#94a3b8',
        fontSize: 16,
        fontWeight: '600',
    },
    emptySubtext: {
        color: '#64748b',
        fontSize: 14,
        textAlign: 'center',
        maxWidth: 250,
    },
});
