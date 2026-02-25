import { View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl, Platform } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { distanceMeters } from '../../lib/geo';

interface SolicitacaoJob {
    id: string;
    status: string;
    origem_endereco: string;
    destino_endereco?: string;
    origem_lat?: number;
    origem_lng?: number;
    valor?: number;
    created_at: string;
    prestador_id?: string;
    cliente?: { nome: string } | null;
}

export default function JobsPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [directedJobs, setDirectedJobs] = useState<SolicitacaoJob[]>([]);
    const [nearbyJobs, setNearbyJobs] = useState<SolicitacaoJob[]>([]);
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const initialLoadDone = useRef(false);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setUser(user);

            try {
                const loc = await Location.getCurrentPositionAsync({});
                setLocation(loc);
            } catch { }
        })();
    }, []);

    useEffect(() => {
        if (user) fetchJobs();
    }, [user]);

    // Realtime subscription
    useEffect(() => {
        if (!user) return;
        const channel = supabase
            .channel('rt-jobs')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'solicitacoes' },
                () => { fetchJobs(); }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user]);

    const fetchJobs = async () => {
        if (!user) return;
        if (!initialLoadDone.current) setLoading(true);
        try {
            // 1. Directed jobs (call center dispatched to me)
            const { data: directed, error: directedError } = await supabase
                .from('solicitacoes')
                .select(`id, status, origem_endereco, destino_endereco, origem_lat, origem_lng, valor, created_at, prestador_id,
                 cliente:clientes(nome)`)
                .eq('prestador_id', user.id)
                .eq('status', 'direcionada')
                .order('created_at', { ascending: false });

            if (directedError) {
                console.error('[JOBS] Erro direcionadas:', directedError.message, directedError.code);
            }
            console.log('[JOBS] Direcionadas:', directed?.length || 0);
            setDirectedJobs((directed as unknown as SolicitacaoJob[]) || []);

            // 2. Nearby pending jobs (not assigned to anyone)
            const { data: pending, error: pendingError } = await supabase
                .from('solicitacoes')
                .select(`id, status, origem_endereco, destino_endereco, origem_lat, origem_lng, valor, created_at, prestador_id,
                 cliente:clientes(nome)`)
                .eq('status', 'pendente')
                .is('prestador_id', null)
                .order('created_at', { ascending: false })
                .limit(20);

            if (pendingError) {
                console.error('[JOBS] Erro pendentes:', pendingError.message, pendingError.code);
            }
            console.log('[JOBS] Pendentes:', pending?.length || 0);
            setNearbyJobs((pending as unknown as SolicitacaoJob[]) || []);
        } catch (e) {
            console.error('Erro ao buscar jobs:', e);
        } finally {
            setLoading(false);
            initialLoadDone.current = true;
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        // Also refresh location
        try {
            const loc = await Location.getCurrentPositionAsync({});
            setLocation(loc);
        } catch { }
        await fetchJobs();
        setRefreshing(false);
    };

    const getDistanceText = (job: SolicitacaoJob) => {
        if (!location?.coords || !job.origem_lat || !job.origem_lng) return null;
        const dist = distanceMeters(
            location.coords.latitude, location.coords.longitude,
            job.origem_lat, job.origem_lng
        );
        if (dist < 1000) return `${Math.round(dist)}m`;
        return `${(dist / 1000).toFixed(1)}km`;
    };

    const timeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'agora';
        if (mins < 60) return `${mins}min`;
        const hrs = Math.floor(mins / 60);
        return `${hrs}h`;
    };

    const renderJob = ({ item, isDirected }: { item: SolicitacaoJob; isDirected: boolean }) => {
        const distance = getDistanceText(item);
        return (
            <TouchableOpacity
                style={styles.jobCard}
                activeOpacity={0.7}
                onPress={() => router.push({
                    pathname: '/(provider)/new-request',
                    params: { requestId: item.id }
                })}
            >
                <View style={styles.jobHeader}>
                    <View style={styles.jobTypeRow}>
                        <View style={[styles.jobTypeBadge, { backgroundColor: isDirected ? 'rgba(19, 127, 236, 0.15)' : 'rgba(34, 197, 94, 0.15)' }]}>
                            <MaterialIcons
                                name={isDirected ? 'phone-forwarded' : 'location-on'}
                                size={14}
                                color={isDirected ? '#137fec' : '#22c55e'}
                            />
                            <Text style={[styles.jobTypeText, { color: isDirected ? '#137fec' : '#22c55e' }]}>
                                {isDirected ? 'Call Center' : 'Plataforma'}
                            </Text>
                        </View>
                        <Text style={styles.timeText}>{timeAgo(item.created_at)}</Text>
                    </View>
                    {item.valor && (
                        <Text style={styles.valorText}>R$ {Number(item.valor).toFixed(2)}</Text>
                    )}
                </View>

                <View style={styles.addressRow}>
                    <View style={styles.dotGreen} />
                    <Text style={styles.addressText} numberOfLines={1}>{item.origem_endereco}</Text>
                </View>
                {item.destino_endereco && (
                    <View style={styles.addressRow}>
                        <View style={styles.dotRed} />
                        <Text style={styles.addressText} numberOfLines={1}>{item.destino_endereco}</Text>
                    </View>
                )}

                <View style={styles.jobFooter}>
                    {item.cliente?.nome && (
                        <View style={styles.clientRow}>
                            <MaterialIcons name="person" size={14} color="#94a3b8" />
                            <Text style={styles.clientText}>{item.cliente.nome}</Text>
                        </View>
                    )}
                    {distance && (
                        <View style={styles.distanceRow}>
                            <MaterialIcons name="near-me" size={14} color="#137fec" />
                            <Text style={styles.distanceText}>{distance}</Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    const allJobs = [
        ...directedJobs.map(j => ({ ...j, _isDirected: true as const })),
        ...nearbyJobs.map(j => ({ ...j, _isDirected: false as const })),
    ];

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <MaterialIcons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Jobs Disponíveis</Text>
                <View style={styles.countBadge}>
                    <Text style={styles.countText}>{allJobs.length}</Text>
                </View>
            </View>

            {loading ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>Carregando...</Text>
                </View>
            ) : allJobs.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <MaterialIcons name="inbox" size={64} color="#334155" />
                    <Text style={styles.emptyTitle}>Nenhum job disponível</Text>
                    <Text style={styles.emptySubtitle}>Fique online para receber novas solicitações</Text>
                </View>
            ) : (
                <FlatList
                    data={allJobs}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => renderJob({ item, isDirected: item._isDirected })}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="#137fec"
                            colors={['#137fec']}
                        />
                    }
                    ListHeaderComponent={
                        directedJobs.length > 0 ? (
                            <View style={styles.sectionHeader}>
                                <MaterialIcons name="priority-high" size={18} color="#f59e0b" />
                                <Text style={styles.sectionTitle}>
                                    {directedJobs.length} direcionada{directedJobs.length > 1 ? 's' : ''} para você
                                </Text>
                            </View>
                        ) : null
                    }
                    ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                />
            )}

            {/* Bottom Nav */}
            <View style={styles.navBar}>
                <View style={styles.navContainer}>
                    <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(provider)/home')}>
                        <MaterialIcons name="map" size={26} color="#64748b" />
                        <Text style={styles.navText}>Home</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.navItem}>
                        <MaterialIcons name="assignment" size={26} color="#137fec" />
                        <Text style={[styles.navText, { color: '#137fec' }]}>Jobs</Text>
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

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#101922',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 56 : 44,
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: '#101922',
        borderBottomWidth: 1,
        borderBottomColor: '#1e293b',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#1C2630',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        flex: 1,
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
        marginLeft: 12,
    },
    countBadge: {
        backgroundColor: '#137fec',
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
        minWidth: 28,
        alignItems: 'center',
    },
    countText: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
    },
    listContent: {
        padding: 16,
        paddingBottom: 100,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.2)',
    },
    sectionTitle: {
        color: '#f59e0b',
        fontSize: 14,
        fontWeight: '600',
    },
    jobCard: {
        backgroundColor: '#1C2630',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#334155',
    },
    jobHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    jobTypeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    jobTypeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    jobTypeText: {
        fontSize: 12,
        fontWeight: '600',
    },
    timeText: {
        color: '#64748b',
        fontSize: 12,
    },
    valorText: {
        color: '#22c55e',
        fontSize: 18,
        fontWeight: 'bold',
    },
    addressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    dotGreen: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#22c55e',
    },
    dotRed: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#ef4444',
    },
    addressText: {
        flex: 1,
        color: '#cbd5e1',
        fontSize: 14,
    },
    jobFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
    },
    clientRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    clientText: {
        color: '#94a3b8',
        fontSize: 13,
    },
    distanceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    distanceText: {
        color: '#137fec',
        fontSize: 13,
        fontWeight: '600',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    emptyTitle: {
        color: '#94a3b8',
        fontSize: 18,
        fontWeight: '600',
    },
    emptySubtitle: {
        color: '#64748b',
        fontSize: 14,
    },
    emptyText: {
        color: '#94a3b8',
        fontSize: 16,
    },
    // Bottom Nav
    navBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#101922',
        paddingTop: 10,
        paddingBottom: Platform.OS === 'ios' ? 28 : 12,
        paddingHorizontal: 24,
        borderTopWidth: 1,
        borderTopColor: '#1e293b',
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
