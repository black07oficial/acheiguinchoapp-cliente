import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Alert, ActivityIndicator, Platform, TextInput, Switch } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';

interface ChecklistItem {
    nome: string;
    obrigatorio: boolean;
    checked: boolean;
}

interface StructuredPhotos {
    frente: string | null;
    traseira: string | null;
}

export default function ChecklistScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const requestId = Array.isArray(params.requestId) ? params.requestId[0] : params.requestId;
    const tipo = (Array.isArray(params.tipo) ? params.tipo[0] : params.tipo) || 'inicio';

    const [itens, setItens] = useState<ChecklistItem[]>([]);
    const [fotos, setFotos] = useState<string[]>([]);
    const [structuredPhotos, setStructuredPhotos] = useState<StructuredPhotos>({ frente: null, traseira: null });
    const [observacoes, setObservacoes] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [agencyId, setAgencyId] = useState<string | null>(null);

    // Toll and patins (only shown on finalization)
    const [valorPedagio, setValorPedagio] = useState('');
    const [usouPatins, setUsouPatins] = useState(false);
    const [patinsQtd, setPatinsQtd] = useState(1);
    const [providerOferecePatins, setProviderOferecePatins] = useState(false);
    const [providerValorPatins, setProviderValorPatins] = useState(0);

    useEffect(() => {
        loadChecklist();
    }, []);

    async function loadChecklist() {
        try {
            // Fetch the solicitation to get agency_id
            const { data: sol } = await supabase
                .from('solicitacoes')
                .select('agency_id')
                .eq('id', requestId)
                .single();

            if (sol) setAgencyId(sol.agency_id);

            // If finalization, load provider patins config
            if (tipo === 'fim') {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: prov } = await supabase
                        .from('prestadores')
                        .select('oferece_patins, valor_patins')
                        .eq('id', user.id)
                        .single();
                    if (prov) {
                        setProviderOferecePatins(prov.oferece_patins ?? false);
                        setProviderValorPatins(Number(prov.valor_patins) || 0);
                    }
                }
            }

            // Fetch configurable checklist items
            const chave = tipo === 'inicio' ? 'checklist_itens_inicio' : 'checklist_itens_fim';
            const { data: config } = await supabase
                .from('configuracoes')
                .select('valor')
                .eq('chave', chave)
                .maybeSingle();

            let defaultItems: ChecklistItem[] = [];
            if (config?.valor) {
                try {
                    const parsed = JSON.parse(config.valor);
                    defaultItems = parsed.map((item: { nome: string; obrigatorio?: boolean }) => ({
                        nome: item.nome,
                        obrigatorio: item.obrigatorio ?? false,
                        checked: false,
                    }));
                } catch { /* fallback */ }
            }

            if (defaultItems.length === 0) {
                defaultItems = tipo === 'inicio'
                    ? [
                        { nome: 'Veículo identificado corretamente', obrigatorio: true, checked: false },
                        { nome: 'Fotos do veículo registradas', obrigatorio: true, checked: false },
                        { nome: 'Danos pré-existentes documentados', obrigatorio: false, checked: false },
                        { nome: 'Cliente informado sobre o serviço', obrigatorio: true, checked: false },
                    ]
                    : [
                        { nome: 'Veículo entregue no destino', obrigatorio: true, checked: false },
                        { nome: 'Fotos de entrega registradas', obrigatorio: true, checked: false },
                        { nome: 'Cliente confirmou recebimento', obrigatorio: false, checked: false },
                        { nome: 'Sem danos durante transporte', obrigatorio: true, checked: false },
                    ];
            }

            setItens(defaultItems);
        } catch (error) {
            console.error('Error loading checklist:', error);
        } finally {
            setLoading(false);
        }
    }

    function toggleItem(index: number) {
        setItens(prev => prev.map((item, i) =>
            i === index ? { ...item, checked: !item.checked } : item
        ));
    }

    async function captureStructuredPhoto(slot: 'frente' | 'traseira') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera para registrar fotos.');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.7,
            allowsEditing: false,
        });

        if (!result.canceled && result.assets[0]) {
            setStructuredPhotos(prev => ({ ...prev, [slot]: result.assets[0].uri }));
        }
    }

    async function pickPhoto() {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera para registrar fotos.');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.7,
            allowsEditing: false,
        });

        if (!result.canceled && result.assets[0]) {
            setFotos(prev => [...prev, result.assets[0].uri]);
        }
    }

    async function pickFromGallery() {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permissão necessária', 'Precisamos de acesso à galeria.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.7,
            allowsMultipleSelection: true,
            selectionLimit: 5,
        });

        if (!result.canceled) {
            setFotos(prev => [...prev, ...result.assets.map(a => a.uri)]);
        }
    }

    function removePhoto(index: number) {
        setFotos(prev => prev.filter((_, i) => i !== index));
    }

    function canSubmit(): boolean {
        const requiredItems = itens.filter(i => i.obrigatorio);
        const itemsOk = requiredItems.every(i => i.checked);
        // Structured photos are required
        const photosOk = !!structuredPhotos.frente && !!structuredPhotos.traseira;
        return itemsOk && photosOk;
    }

    async function uploadSinglePhoto(uri: string, label: string): Promise<string | null> {
        try {
            const fileName = `${requestId}/${tipo}/${label}_${Date.now()}.jpg`;
            const response = await fetch(uri);
            const blob = await response.blob();

            const { data, error } = await supabase.storage
                .from('checklist-fotos')
                .upload(fileName, blob, { contentType: 'image/jpeg' });

            if (error) {
                console.error('Upload error:', error);
                return null;
            }

            const { data: publicUrl } = supabase.storage
                .from('checklist-fotos')
                .getPublicUrl(data.path);

            return publicUrl.publicUrl;
        } catch (error) {
            console.error('Error uploading photo:', error);
            return null;
        }
    }

    async function uploadPhotos(): Promise<string[]> {
        const uploadedUrls: string[] = [];

        for (const uri of fotos) {
            const url = await uploadSinglePhoto(uri, 'extra');
            if (url) uploadedUrls.push(url);
        }

        return uploadedUrls;
    }

    async function handleSubmit() {
        if (!canSubmit()) {
            Alert.alert('Itens obrigatórios', 'Marque todos os itens obrigatórios e registre as fotos de frente e traseira.');
            return;
        }

        setSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Utilizador não autenticado');

            // Upload structured photos (frente + traseira)
            let frenteUrl: string | null = null;
            let traseiraUrl: string | null = null;

            if (structuredPhotos.frente) {
                frenteUrl = await uploadSinglePhoto(structuredPhotos.frente, 'frente');
            }
            if (structuredPhotos.traseira) {
                traseiraUrl = await uploadSinglePhoto(structuredPhotos.traseira, 'traseira');
            }

            // Upload additional photos
            let uploadedUrls: string[] = [];
            if (fotos.length > 0) {
                uploadedUrls = await uploadPhotos();
            }

            // Combine all photo URLs
            const allPhotos = [
                ...(frenteUrl ? [frenteUrl] : []),
                ...(traseiraUrl ? [traseiraUrl] : []),
                ...uploadedUrls,
            ];

            // Save checklist with structured photo URLs
            const { error } = await supabase.from('solicitacao_checklist').insert({
                solicitacao_id: requestId,
                agency_id: agencyId,
                prestador_id: user.id,
                tipo,
                itens: itens.map(({ nome, obrigatorio, checked }) => ({ nome, obrigatorio, checked })),
                fotos: allPhotos,
                foto_frente_url: frenteUrl,
                foto_traseira_url: traseiraUrl,
                observacoes: observacoes.trim() || null,
            });

            if (error) throw error;

            // Now advance the ride status
            if (tipo === 'inicio') {
                // Advance to em_viagem
                const { error: statusError } = await supabase
                    .from('solicitacoes')
                    .update({ status: 'em_viagem' })
                    .eq('id', requestId);
                if (statusError) {
                    console.error('[CHECKLIST] Status update error:', statusError);
                    throw statusError;
                }
            } else {
                // tipo === 'fim' → finalize + save toll/patins
                const updateData: any = { status: 'finalizado' };

                // Save toll value
                const pedagio = parseFloat(valorPedagio) || 0;
                if (pedagio > 0) {
                    updateData.valor_pedagio = pedagio;
                }

                // Save patins
                if (usouPatins && patinsQtd > 0) {
                    updateData.patins_usado = true;
                    updateData.patins_qtd = patinsQtd;
                    updateData.patins_valor = providerValorPatins * patinsQtd;
                }

                const { error: statusError } = await supabase
                    .from('solicitacoes')
                    .update(updateData)
                    .eq('id', requestId);
                if (statusError) {
                    console.error('[CHECKLIST] Status update error:', statusError);
                    throw statusError;
                }
            }

            // Navigate back
            if (tipo === 'fim') {
                router.replace({ pathname: '/(provider)/completion-summary', params: { requestId: requestId! } });
            } else {
                router.replace({ pathname: '/(provider)/active-request', params: { requestId: requestId! } });
            }
        } catch (error) {
            console.error('Error saving checklist:', error);
            Alert.alert('Erro', 'Não foi possível salvar o checklist. Tente novamente.');
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#137fec" />
                <Text style={styles.loadingText}>Carregando checklist...</Text>
            </View>
        );
    }

    const requiredComplete = canSubmit();

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialIcons name="arrow-back" size={24} color="#e5e7eb" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {tipo === 'inicio' ? 'Checklist de Coleta' : 'Checklist de Entrega'}
                </Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                {/* Info Banner */}
                <View style={styles.infoBanner}>
                    <MaterialIcons name="info-outline" size={20} color="#60a5fa" />
                    <Text style={styles.infoText}>
                        {tipo === 'inicio'
                            ? 'Registre as fotos obrigatórias (frente e traseira) do veículo no momento da coleta.'
                            : 'Registre as fotos obrigatórias (frente e traseira) do veículo no momento da entrega.'}
                    </Text>
                </View>

                {/* Structured Photos - Frente & Traseira (OBRIGATÓRIO) */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        {tipo === 'inicio' ? 'Fotos da Coleta' : 'Fotos da Entrega'}
                        <Text style={styles.requiredLabel}> (Obrigatório)</Text>
                    </Text>

                    <View style={styles.structuredPhotoRow}>
                        {/* Foto da Frente */}
                        <TouchableOpacity
                            style={[styles.structuredPhotoSlot, structuredPhotos.frente && styles.structuredPhotoSlotFilled]}
                            onPress={() => captureStructuredPhoto('frente')}
                            activeOpacity={0.7}
                        >
                            {structuredPhotos.frente ? (
                                <Image source={{ uri: structuredPhotos.frente }} style={styles.structuredPhoto} />
                            ) : (
                                <View style={styles.structuredPhotoPlaceholder}>
                                    <MaterialIcons name="camera-alt" size={32} color="#475569" />
                                    <Text style={styles.structuredPhotoLabel}>Frente</Text>
                                </View>
                            )}
                            {structuredPhotos.frente && (
                                <View style={styles.structuredPhotoCheck}>
                                    <MaterialIcons name="check-circle" size={22} color="#22c55e" />
                                </View>
                            )}
                            <Text style={styles.structuredPhotoCaption}>Foto da Frente</Text>
                        </TouchableOpacity>

                        {/* Foto da Traseira */}
                        <TouchableOpacity
                            style={[styles.structuredPhotoSlot, structuredPhotos.traseira && styles.structuredPhotoSlotFilled]}
                            onPress={() => captureStructuredPhoto('traseira')}
                            activeOpacity={0.7}
                        >
                            {structuredPhotos.traseira ? (
                                <Image source={{ uri: structuredPhotos.traseira }} style={styles.structuredPhoto} />
                            ) : (
                                <View style={styles.structuredPhotoPlaceholder}>
                                    <MaterialIcons name="camera-alt" size={32} color="#475569" />
                                    <Text style={styles.structuredPhotoLabel}>Traseira</Text>
                                </View>
                            )}
                            {structuredPhotos.traseira && (
                                <View style={styles.structuredPhotoCheck}>
                                    <MaterialIcons name="check-circle" size={22} color="#22c55e" />
                                </View>
                            )}
                            <Text style={styles.structuredPhotoCaption}>Foto da Traseira</Text>
                        </TouchableOpacity>
                    </View>

                    {(!structuredPhotos.frente || !structuredPhotos.traseira) && (
                        <View style={styles.photoWarning}>
                            <MaterialIcons name="warning" size={16} color="#f59e0b" />
                            <Text style={styles.photoWarningText}>Ambas as fotos (frente e traseira) são obrigatórias</Text>
                        </View>
                    )}
                </View>

                {/* Checklist Items */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Itens do Checklist</Text>
                    {itens.map((item, index) => (
                        <TouchableOpacity
                            key={index}
                            style={[styles.checkItem, item.checked && styles.checkItemChecked]}
                            onPress={() => toggleItem(index)}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                                {item.checked && <MaterialIcons name="check" size={16} color="#fff" />}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.checkText, item.checked && styles.checkTextChecked]}>
                                    {item.nome}
                                </Text>
                                {item.obrigatorio && (
                                    <Text style={styles.requiredLabel}>Obrigatório</Text>
                                )}
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Additional Photos (optional) */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Fotos Adicionais (Opcional)</Text>
                    <View style={styles.photoGrid}>
                        {fotos.map((uri, index) => (
                            <View key={index} style={styles.photoWrapper}>
                                <Image source={{ uri }} style={styles.photo} />
                                <TouchableOpacity
                                    style={styles.removePhotoBtn}
                                    onPress={() => removePhoto(index)}
                                >
                                    <MaterialIcons name="close" size={16} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        ))}

                        <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPhoto}>
                            <MaterialIcons name="camera-alt" size={28} color="#64748b" />
                            <Text style={styles.addPhotoText}>Câmera</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.addPhotoBtn} onPress={pickFromGallery}>
                            <MaterialIcons name="photo-library" size={28} color="#64748b" />
                            <Text style={styles.addPhotoText}>Galeria</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.photoHint}>{fotos.length} foto(s) adicional(is)</Text>
                </View>

                {/* Toll & Patins - Only on finalization */}
                {tipo === 'fim' && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Custos Adicionais</Text>

                        {/* Pedágio */}
                        <View style={styles.additionalCostCard}>
                            <View style={styles.additionalCostHeader}>
                                <MaterialIcons name="toll" size={22} color="#60a5fa" />
                                <Text style={styles.additionalCostTitle}>Pedágio</Text>
                            </View>
                            <Text style={styles.additionalCostHint}>Informe o valor total do pedágio, se houver</Text>
                            <View style={styles.costInputWrapper}>
                                <Text style={styles.costCurrencyPrefix}>R$</Text>
                                <TextInput
                                    style={styles.costInput}
                                    value={valorPedagio}
                                    onChangeText={setValorPedagio}
                                    placeholder="0,00"
                                    placeholderTextColor="#475569"
                                    keyboardType="decimal-pad"
                                />
                            </View>
                        </View>

                        {/* Patins */}
                        {providerOferecePatins && (
                            <View style={styles.additionalCostCard}>
                                <View style={styles.additionalCostHeader}>
                                    <MaterialIcons name="build" size={22} color="#f59e0b" />
                                    <Text style={styles.additionalCostTitle}>Patins</Text>
                                </View>
                                <Text style={styles.additionalCostHint}>
                                    Valor unitário: R$ {providerValorPatins.toFixed(2)} (configurado no seu perfil)
                                </Text>

                                <View style={styles.patinsSwitchRow}>
                                    <Text style={styles.patinsSwitchLabel}>Utilizou patins neste serviço?</Text>
                                    <Switch
                                        value={usouPatins}
                                        onValueChange={setUsouPatins}
                                        trackColor={{ false: '#334155', true: 'rgba(245, 158, 11, 0.4)' }}
                                        thumbColor={usouPatins ? '#f59e0b' : '#64748b'}
                                    />
                                </View>

                                {usouPatins && (
                                    <View style={styles.patinsQtdRow}>
                                        <Text style={styles.patinsQtdLabel}>Quantidade de patins:</Text>
                                        <View style={styles.patinsQtdControls}>
                                            <TouchableOpacity
                                                style={styles.patinsQtdBtn}
                                                onPress={() => setPatinsQtd(Math.max(1, patinsQtd - 1))}
                                            >
                                                <MaterialIcons name="remove" size={20} color="#e5e7eb" />
                                            </TouchableOpacity>
                                            <Text style={styles.patinsQtdValue}>{patinsQtd}</Text>
                                            <TouchableOpacity
                                                style={styles.patinsQtdBtn}
                                                onPress={() => setPatinsQtd(Math.min(4, patinsQtd + 1))}
                                            >
                                                <MaterialIcons name="add" size={20} color="#e5e7eb" />
                                            </TouchableOpacity>
                                        </View>
                                        <Text style={styles.patinsTotalText}>
                                            Total: R$ {(providerValorPatins * patinsQtd).toFixed(2)}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                )}

                {/* Observations */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Observações</Text>
                    <TextInput
                        style={styles.textArea}
                        placeholder="Adicionar observações (opcional)..."
                        placeholderTextColor="#64748b"
                        multiline
                        numberOfLines={4}
                        value={observacoes}
                        onChangeText={setObservacoes}
                        textAlignVertical="top"
                    />
                </View>
            </ScrollView>

            {/* Submit Button */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.submitBtn, !requiredComplete && styles.submitBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={submitting || !requiredComplete}
                    activeOpacity={0.8}
                >
                    {submitting ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <MaterialIcons
                                name={tipo === 'fim' ? 'check-circle' : 'play-arrow'}
                                size={22}
                                color="#fff"
                            />
                            <Text style={styles.submitBtnText}>
                                {tipo === 'inicio' ? 'Confirmar e Iniciar Reboque' : 'Confirmar e Finalizar'}
                            </Text>
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
        marginBottom: 12,
        letterSpacing: 0.3,
    },
    checkItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.04)',
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    checkItemChecked: {
        backgroundColor: 'rgba(34, 197, 94, 0.08)',
        borderColor: 'rgba(34, 197, 94, 0.2)',
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#475569',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: '#22c55e',
        borderColor: '#22c55e',
    },
    checkText: {
        fontSize: 14,
        color: '#cbd5e1',
    },
    checkTextChecked: {
        color: '#e5e7eb',
        fontWeight: '500',
    },
    requiredLabel: {
        fontSize: 10,
        color: '#f59e0b',
        fontWeight: '700',
        marginTop: 2,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    photoGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    photoWrapper: {
        width: 90,
        height: 90,
        borderRadius: 12,
        overflow: 'hidden',
        position: 'relative',
    },
    photo: {
        width: '100%',
        height: '100%',
        borderRadius: 12,
    },
    removePhotoBtn: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(239, 68, 68, 0.9)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    addPhotoBtn: {
        width: 90,
        height: 90,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#1e293b',
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    addPhotoText: {
        fontSize: 10,
        color: '#64748b',
        marginTop: 4,
        fontWeight: '600',
    },
    photoHint: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 8,
    },
    structuredPhotoRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    structuredPhotoSlot: {
        flex: 1,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: '#1e293b',
        borderStyle: 'dashed',
        backgroundColor: 'rgba(255,255,255,0.02)',
        overflow: 'hidden',
        alignItems: 'center',
    },
    structuredPhotoSlotFilled: {
        borderColor: 'rgba(34, 197, 94, 0.4)',
        borderStyle: 'solid',
    },
    structuredPhotoPlaceholder: {
        height: 130,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    structuredPhotoLabel: {
        fontSize: 13,
        color: '#475569',
        fontWeight: '600',
    },
    structuredPhoto: {
        width: '100%',
        height: 130,
    },
    structuredPhotoCheck: {
        position: 'absolute',
        top: 6,
        right: 6,
    },
    structuredPhotoCaption: {
        fontSize: 11,
        color: '#94a3b8',
        fontWeight: '600',
        paddingVertical: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    photoWarning: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(245, 158, 11, 0.08)',
        borderColor: 'rgba(245, 158, 11, 0.2)',
        borderWidth: 1,
        borderRadius: 10,
        padding: 10,
    },
    photoWarningText: {
        fontSize: 12,
        color: '#f59e0b',
        fontWeight: '600',
    },
    additionalCostCard: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#1e293b',
        padding: 16,
        marginBottom: 12,
    },
    additionalCostHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 4,
    },
    additionalCostTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#e5e7eb',
    },
    additionalCostHint: {
        fontSize: 12,
        color: '#64748b',
        marginBottom: 12,
    },
    costInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#1e293b',
        paddingHorizontal: 14,
    },
    costCurrencyPrefix: {
        fontSize: 16,
        fontWeight: '700',
        color: '#64748b',
        marginRight: 8,
    },
    costInput: {
        flex: 1,
        height: 46,
        fontSize: 18,
        fontWeight: '600',
        color: '#e5e7eb',
    },
    patinsSwitchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    patinsSwitchLabel: {
        fontSize: 14,
        color: '#cbd5e1',
        fontWeight: '500',
    },
    patinsQtdRow: {
        backgroundColor: 'rgba(245, 158, 11, 0.06)',
        borderRadius: 10,
        padding: 14,
        alignItems: 'center',
        gap: 10,
    },
    patinsQtdLabel: {
        fontSize: 13,
        color: '#94a3b8',
        fontWeight: '600',
    },
    patinsQtdControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    patinsQtdBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#334155',
    },
    patinsQtdValue: {
        fontSize: 24,
        fontWeight: '800',
        color: '#f59e0b',
        minWidth: 30,
        textAlign: 'center',
    },
    patinsTotalText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#f59e0b',
    },
    textArea: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 12,
        padding: 14,
        color: '#e5e7eb',
        fontSize: 14,
        minHeight: 80,
        borderWidth: 1,
        borderColor: '#1e293b',
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
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#22c55e',
        height: 54,
        borderRadius: 14,
    },
    submitBtnDisabled: {
        backgroundColor: '#1e293b',
        opacity: 0.6,
    },
    submitBtnText: {
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
