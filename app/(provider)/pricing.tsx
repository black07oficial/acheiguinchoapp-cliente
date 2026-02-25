import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Switch, Alert, ActivityIndicator, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function PricingScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Pricing fields
    const [precoBase, setPrecoBase] = useState('');
    const [valorKm, setValorKm] = useState('');
    const [valorMinuto, setValorMinuto] = useState('');
    const [retornoBase, setRetornoBase] = useState('');

    // Patins fields
    const [oferecePatins, setOferecePatins] = useState(false);
    const [valorPatins, setValorPatins] = useState('');

    useEffect(() => {
        loadPricing();
    }, []);

    async function loadPricing() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data } = await supabase
                .from('prestadores')
                .select('preco_base, valor_km, valor_minuto, retorno_base, oferece_patins, valor_patins')
                .eq('id', user.id)
                .single();

            if (data) {
                setPrecoBase(data.preco_base ? String(data.preco_base) : '');
                setValorKm(data.valor_km ? String(data.valor_km) : '');
                setValorMinuto(data.valor_minuto ? String(data.valor_minuto) : '');
                setRetornoBase(data.retorno_base ? String(data.retorno_base) : '');
                setOferecePatins(data.oferece_patins ?? false);
                setValorPatins(data.valor_patins ? String(data.valor_patins) : '');
            }
        } catch (error) {
            console.error('Error loading pricing:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        // Validate required fields
        if (!precoBase || !valorKm) {
            Alert.alert('Campos obrigatórios', 'Preencha pelo menos o Preço Base e o Valor por KM.');
            return;
        }

        if (oferecePatins && !valorPatins) {
            Alert.alert('Valor do Patins', 'Informe o valor unitário do patins ou desmarque a opção.');
            return;
        }

        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Usuário não autenticado');

            const { error } = await supabase
                .from('prestadores')
                .update({
                    preco_base: parseFloat(precoBase) || 0,
                    valor_km: parseFloat(valorKm) || 0,
                    valor_minuto: parseFloat(valorMinuto) || 0,
                    retorno_base: parseFloat(retornoBase) || 0,
                    oferece_patins: oferecePatins,
                    valor_patins: oferecePatins ? (parseFloat(valorPatins) || 0) : 0,
                })
                .eq('id', user.id);

            if (error) throw error;

            Alert.alert('Salvo!', 'Seus valores foram atualizados com sucesso.', [
                { text: 'OK', onPress: () => router.back() }
            ]);
        } catch (error: any) {
            console.error('Error saving pricing:', error);
            Alert.alert('Erro', error.message || 'Não foi possível salvar os valores.');
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#137fec" />
                <Text style={styles.loadingText}>Carregando valores...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialIcons name="arrow-back" size={24} color="#e5e7eb" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Configuração de Valores</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                {/* Info Banner */}
                <View style={styles.infoBanner}>
                    <MaterialIcons name="info-outline" size={20} color="#60a5fa" />
                    <Text style={styles.infoText}>
                        Configure seus valores de acordo com o que pratica na sua região. Esses valores serão usados para calcular o custo dos serviços.
                    </Text>
                </View>

                {/* Pricing Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Valores do Serviço</Text>

                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Preço Base (R$)</Text>
                        <Text style={styles.inputHint}>Valor fixo cobrado por cada acionamento</Text>
                        <View style={styles.inputWrapper}>
                            <Text style={styles.currencyPrefix}>R$</Text>
                            <TextInput
                                style={styles.input}
                                value={precoBase}
                                onChangeText={setPrecoBase}
                                placeholder="0,00"
                                placeholderTextColor="#475569"
                                keyboardType="decimal-pad"
                            />
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Valor por KM (R$)</Text>
                        <Text style={styles.inputHint}>Valor cobrado por quilômetro percorrido</Text>
                        <View style={styles.inputWrapper}>
                            <Text style={styles.currencyPrefix}>R$</Text>
                            <TextInput
                                style={styles.input}
                                value={valorKm}
                                onChangeText={setValorKm}
                                placeholder="0,00"
                                placeholderTextColor="#475569"
                                keyboardType="decimal-pad"
                            />
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Valor por Minuto (R$)</Text>
                        <Text style={styles.inputHint}>Valor cobrado por minuto de serviço</Text>
                        <View style={styles.inputWrapper}>
                            <Text style={styles.currencyPrefix}>R$</Text>
                            <TextInput
                                style={styles.input}
                                value={valorMinuto}
                                onChangeText={setValorMinuto}
                                placeholder="0,00"
                                placeholderTextColor="#475569"
                                keyboardType="decimal-pad"
                            />
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Retorno Base (R$)</Text>
                        <Text style={styles.inputHint}>Valor cobrado pelo retorno após o serviço</Text>
                        <View style={styles.inputWrapper}>
                            <Text style={styles.currencyPrefix}>R$</Text>
                            <TextInput
                                style={styles.input}
                                value={retornoBase}
                                onChangeText={setRetornoBase}
                                placeholder="0,00"
                                placeholderTextColor="#475569"
                                keyboardType="decimal-pad"
                            />
                        </View>
                    </View>
                </View>

                {/* Patins Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Patins (Roda Travada)</Text>
                    <Text style={styles.sectionHint}>
                        O patins é utilizado quando o veículo está com a roda travada. Cobrado por unidade (até 4 rodas).
                    </Text>

                    <View style={styles.switchRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.switchLabel}>Trabalho com Patins</Text>
                            <Text style={styles.switchHint}>
                                {oferecePatins ? 'Você oferece serviço de patins' : 'Não ofereço este serviço'}
                            </Text>
                        </View>
                        <Switch
                            value={oferecePatins}
                            onValueChange={setOferecePatins}
                            trackColor={{ false: '#334155', true: 'rgba(34, 197, 94, 0.4)' }}
                            thumbColor={oferecePatins ? '#22c55e' : '#64748b'}
                        />
                    </View>

                    {oferecePatins && (
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Valor Unitário do Patins (R$)</Text>
                            <Text style={styles.inputHint}>Valor cobrado por cada patins utilizado (geralmente R$ 100 a R$ 150)</Text>
                            <View style={styles.inputWrapper}>
                                <Text style={styles.currencyPrefix}>R$</Text>
                                <TextInput
                                    style={styles.input}
                                    value={valorPatins}
                                    onChangeText={setValorPatins}
                                    placeholder="100,00"
                                    placeholderTextColor="#475569"
                                    keyboardType="decimal-pad"
                                />
                            </View>
                        </View>
                    )}
                </View>

                {/* Preview Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Exemplo de Cálculo</Text>
                    <View style={styles.previewCard}>
                        <View style={styles.previewRow}>
                            <Text style={styles.previewLabel}>Preço Base</Text>
                            <Text style={styles.previewValue}>R$ {(parseFloat(precoBase) || 0).toFixed(2)}</Text>
                        </View>
                        <View style={styles.previewRow}>
                            <Text style={styles.previewLabel}>10 km × R$ {(parseFloat(valorKm) || 0).toFixed(2)}</Text>
                            <Text style={styles.previewValue}>R$ {((parseFloat(valorKm) || 0) * 10).toFixed(2)}</Text>
                        </View>
                        <View style={styles.previewRow}>
                            <Text style={styles.previewLabel}>30 min × R$ {(parseFloat(valorMinuto) || 0).toFixed(2)}</Text>
                            <Text style={styles.previewValue}>R$ {((parseFloat(valorMinuto) || 0) * 30).toFixed(2)}</Text>
                        </View>
                        <View style={styles.previewRow}>
                            <Text style={styles.previewLabel}>Retorno Base</Text>
                            <Text style={styles.previewValue}>R$ {(parseFloat(retornoBase) || 0).toFixed(2)}</Text>
                        </View>
                        {oferecePatins && (
                            <View style={styles.previewRow}>
                                <Text style={styles.previewLabel}>2 Patins × R$ {(parseFloat(valorPatins) || 0).toFixed(2)}</Text>
                                <Text style={styles.previewValue}>R$ {((parseFloat(valorPatins) || 0) * 2).toFixed(2)}</Text>
                            </View>
                        )}
                        <View style={styles.previewDivider} />
                        <View style={styles.previewRow}>
                            <Text style={styles.previewTotalLabel}>Total Estimado</Text>
                            <Text style={styles.previewTotalValue}>
                                R$ {(
                                    (parseFloat(precoBase) || 0) +
                                    ((parseFloat(valorKm) || 0) * 10) +
                                    ((parseFloat(valorMinuto) || 0) * 30) +
                                    (parseFloat(retornoBase) || 0) +
                                    (oferecePatins ? ((parseFloat(valorPatins) || 0) * 2) : 0)
                                ).toFixed(2)}
                            </Text>
                        </View>
                    </View>
                </View>
            </ScrollView>

            {/* Save Button */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={handleSave}
                    disabled={saving}
                    activeOpacity={0.8}
                >
                    {saving ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <MaterialIcons name="save" size={22} color="#fff" />
                            <Text style={styles.saveBtnText}>Salvar Valores</Text>
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
        backgroundColor: '#0b1220',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingBottom: 14,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(11, 18, 32, 0.98)',
        borderBottomWidth: 1,
        borderBottomColor: '#1e293b',
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: 'bold',
        color: '#e5e7eb',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 120,
    },
    infoBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        backgroundColor: 'rgba(96, 165, 250, 0.08)',
        borderColor: 'rgba(96, 165, 250, 0.2)',
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
        marginBottom: 20,
    },
    infoText: {
        flex: 1,
        fontSize: 13,
        color: '#93c5fd',
        lineHeight: 18,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#e5e7eb',
        marginBottom: 4,
        letterSpacing: 0.3,
    },
    sectionHint: {
        fontSize: 12,
        color: '#64748b',
        marginBottom: 16,
        lineHeight: 17,
    },
    inputGroup: {
        marginBottom: 16,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#cbd5e1',
        marginBottom: 2,
    },
    inputHint: {
        fontSize: 11,
        color: '#64748b',
        marginBottom: 8,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#1e293b',
        paddingHorizontal: 14,
    },
    currencyPrefix: {
        fontSize: 16,
        fontWeight: '700',
        color: '#64748b',
        marginRight: 8,
    },
    input: {
        flex: 1,
        height: 50,
        fontSize: 18,
        fontWeight: '600',
        color: '#e5e7eb',
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#1e293b',
        padding: 16,
        marginBottom: 16,
    },
    switchLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#e5e7eb',
    },
    switchHint: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 2,
    },
    previewCard: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#1e293b',
        padding: 16,
        marginTop: 8,
    },
    previewRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
    },
    previewLabel: {
        fontSize: 13,
        color: '#94a3b8',
    },
    previewValue: {
        fontSize: 13,
        fontWeight: '600',
        color: '#cbd5e1',
    },
    previewDivider: {
        height: 1,
        backgroundColor: '#1e293b',
        marginVertical: 8,
    },
    previewTotalLabel: {
        fontSize: 15,
        fontWeight: '700',
        color: '#e5e7eb',
    },
    previewTotalValue: {
        fontSize: 18,
        fontWeight: '800',
        color: '#22c55e',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16,
        paddingBottom: Platform.OS === 'ios' ? 34 : 16,
        backgroundColor: 'rgba(11, 18, 32, 0.98)',
        borderTopWidth: 1,
        borderTopColor: '#1e293b',
    },
    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#137fec',
        height: 54,
        borderRadius: 14,
    },
    saveBtnText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0b1220',
    },
    loadingText: {
        marginTop: 12,
        color: '#94a3b8',
        fontSize: 14,
    },
});
