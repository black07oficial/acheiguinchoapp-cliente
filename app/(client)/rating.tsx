import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, ScrollView, Platform, StatusBar as RNStatusBar } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useDynamicTheme, THEME_COLORS } from '../../hooks/use-dynamic-theme';

type ServiceStatus = 'pending' | 'confirmed' | 'problem';

export default function RatingScreen() {
    const { isDark, theme: dynamicTheme } = useDynamicTheme();
    const router = useRouter();
    const params = useLocalSearchParams();
    const requestId = Array.isArray(params.requestId) ? params.requestId[0] : params.requestId;

    const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('pending');
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [problemDescription, setProblemDescription] = useState('');
    const [selectedProblem, setSelectedProblem] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [driverName, setDriverName] = useState('Prestador');
    const [alreadyRated, setAlreadyRated] = useState(false);

    const problemOptions = [
        { id: 'not_completed', label: 'Serviço não foi concluído', icon: 'cancel' as const },
        { id: 'wrong_location', label: 'Deixou no local errado', icon: 'wrong-location' as const },
        { id: 'vehicle_damage', label: 'Dano ao veículo', icon: 'car-crash' as const },
        { id: 'bad_behavior', label: 'Comportamento inadequado', icon: 'report' as const },
        { id: 'overcharge', label: 'Cobrança indevida', icon: 'money-off' as const },
        { id: 'other', label: 'Outro problema', icon: 'help-outline' as const },
    ];

    useEffect(() => {
        loadRequestInfo();
    }, []);

    async function loadRequestInfo() {
        try {
            const { data: sol } = await supabase
                .from('solicitacoes')
                .select('prestador:prestadores(nome)')
                .eq('id', requestId)
                .single();

            if (sol?.prestador) {
                // @ts-expect-error: relation type
                setDriverName(sol.prestador.nome || 'Prestador');
            }

            // Check if already rated
            const { data: existing } = await supabase
                .from('avaliacoes')
                .select('id')
                .eq('solicitacao_id', requestId)
                .maybeSingle();

            if (existing) {
                setAlreadyRated(true);
            }
        } catch (error) {
            console.error('Error:', error);
        }
    }

    async function handleSubmitRating() {
        if (rating === 0) {
            Alert.alert('Avaliação', 'Selecione uma nota antes de enviar.');
            return;
        }

        setSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Não autenticado');

            const { data: sol } = await supabase
                .from('solicitacoes')
                .select('agency_id, prestador_id')
                .eq('id', requestId)
                .single();

            if (!sol) throw new Error('Solicitação não encontrada');

            const { error } = await supabase.from('avaliacoes').insert({
                solicitacao_id: requestId,
                agency_id: sol.agency_id,
                cliente_id: user.id,
                prestador_id: sol.prestador_id,
                nota: rating,
                comentario: comment.trim() || null,
            });

            if (error) throw error;

            Alert.alert('Obrigado!', 'Sua avaliação foi registrada com sucesso.', [
                { text: 'OK', onPress: () => router.replace('/(client)/home') },
            ]);
        } catch (error: any) {
            console.error('Error submitting rating:', error);
            Alert.alert('Erro', error.message || 'Não foi possível enviar a avaliação.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleReportProblem() {
        if (!selectedProblem) {
            Alert.alert('Selecione', 'Escolha o tipo de problema antes de enviar.');
            return;
        }

        setSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Não autenticado');

            const { data: sol } = await supabase
                .from('solicitacoes')
                .select('agency_id, prestador_id')
                .eq('id', requestId)
                .single();

            if (!sol) throw new Error('Solicitação não encontrada');

            // Update solicitation status to indicate a problem was reported
            await supabase.from('solicitacoes').update({
                problema_reportado: true,
                tipo_problema: selectedProblem,
                descricao_problema: problemDescription.trim() || null,
            }).eq('id', requestId);

            // Also submit a low rating if desired
            if (rating > 0) {
                await supabase.from('avaliacoes').insert({
                    solicitacao_id: requestId,
                    agency_id: sol.agency_id,
                    cliente_id: user.id,
                    prestador_id: sol.prestador_id,
                    nota: rating,
                    comentario: `[PROBLEMA: ${selectedProblem}] ${problemDescription.trim() || comment.trim() || ''}`.trim(),
                });
            }

            Alert.alert(
                'Problema Reportado',
                'Recebemos seu relato e nossa equipe irá analisar. Obrigado pelo feedback.',
                [{ text: 'OK', onPress: () => router.replace('/(client)/home') }]
            );
        } catch (error: any) {
            console.error('Error reporting problem:', error);
            Alert.alert('Erro', error.message || 'Não foi possível enviar o relatório.');
        } finally {
            setSubmitting(false);
        }
    }

    function handleSkip() {
        router.replace('/(client)/home');
    }

    const starLabels = ['Péssimo', 'Ruim', 'Regular', 'Bom', 'Excelente'];

    if (alreadyRated) {
        return (
            <View style={[styles.container, { backgroundColor: dynamicTheme.background }]}>
                <RNStatusBar barStyle={dynamicTheme.statusBar} />
                <View style={styles.content}>
                    <View style={[styles.iconCircle, { backgroundColor: 'rgba(34, 197, 94, 0.1)' }]}>
                        <MaterialIcons name="check-circle" size={64} color="#22c55e" />
                    </View>
                    <Text style={[styles.title, { color: dynamicTheme.text }]}>Avaliação já enviada!</Text>
                    <Text style={[styles.subtitle, { color: dynamicTheme.textSecondary }]}>Obrigado pelo seu feedback.</Text>
                    <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
                        <Text style={[styles.skipText, { color: THEME_COLORS.primary }]}>Voltar ao Início</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // Step 1: Service Confirmation
    if (serviceStatus === 'pending') {
        return (
            <View style={[styles.container, { backgroundColor: dynamicTheme.background }]}>
                <RNStatusBar barStyle={dynamicTheme.statusBar} />
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={[styles.iconCircle, { backgroundColor: THEME_COLORS.primary + '15' }]}>
                        <MaterialIcons name="local-shipping" size={48} color={THEME_COLORS.primary} />
                    </View>

                    <Text style={[styles.title, { color: dynamicTheme.text }]}>Serviço Finalizado</Text>
                    <Text style={[styles.subtitle, { color: dynamicTheme.textSecondary }]}>
                        O prestador <Text style={[styles.driverHighlight, { color: dynamicTheme.text }]}>{driverName}</Text> marcou o serviço como concluído.{'\n'}Confirme abaixo:
                    </Text>

                    <TouchableOpacity
                        style={[styles.confirmBtn, { backgroundColor: '#22c55e' }]}
                        onPress={() => setServiceStatus('confirmed')}
                        activeOpacity={0.8}
                    >
                        <MaterialIcons name="check-circle" size={24} color="white" />
                        <Text style={styles.confirmBtnText}>Sim, foi concluído</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.problemBtn, { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.3)' }]}
                        onPress={() => setServiceStatus('problem')}
                        activeOpacity={0.8}
                    >
                        <MaterialIcons name="report-problem" size={24} color="#f59e0b" />
                        <Text style={styles.problemBtnText}>Reportar Problema</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
                        <Text style={[styles.skipText, { color: dynamicTheme.textSecondary }]}>Pular por agora</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        );
    }

    // Step 2b: Report Problem
    if (serviceStatus === 'problem') {
        return (
            <View style={[styles.container, { backgroundColor: dynamicTheme.background }]}>
                <RNStatusBar barStyle={dynamicTheme.statusBar} />
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => setServiceStatus('pending')}>
                        <MaterialIcons name="arrow-back" size={24} color={dynamicTheme.text} />
                    </TouchableOpacity>

                    <View style={[styles.iconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                        <MaterialIcons name="report-problem" size={48} color="#ef4444" />
                    </View>

                    <Text style={[styles.title, { color: dynamicTheme.text }]}>Reportar Problema</Text>
                    <Text style={[styles.subtitle, { color: dynamicTheme.textSecondary }]}>Selecione o tipo de problema:</Text>

                    <View style={styles.problemOptionsContainer}>
                        {problemOptions.map((option) => (
                            <TouchableOpacity
                                key={option.id}
                                style={[
                                    styles.problemOption,
                                    { backgroundColor: dynamicTheme.card, borderColor: dynamicTheme.border },
                                    selectedProblem === option.id && { borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.08)' },
                                ]}
                                onPress={() => setSelectedProblem(option.id)}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons
                                    name={option.icon}
                                    size={20}
                                    color={selectedProblem === option.id ? '#ef4444' : dynamicTheme.textSecondary}
                                />
                                <Text style={[
                                    styles.problemOptionText,
                                    { color: dynamicTheme.textSecondary },
                                    selectedProblem === option.id && { color: dynamicTheme.text, fontWeight: '600' },
                                ]}>
                                    {option.label}
                                </Text>
                                {selectedProblem === option.id && (
                                    <MaterialIcons name="check-circle" size={18} color="#ef4444" />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TextInput
                        style={[styles.commentInput, { backgroundColor: dynamicTheme.card, color: dynamicTheme.text, borderColor: dynamicTheme.border }]}
                        placeholder="Descreva o problema (opcional)..."
                        placeholderTextColor={dynamicTheme.textSecondary}
                        multiline
                        numberOfLines={3}
                        value={problemDescription}
                        onChangeText={setProblemDescription}
                        textAlignVertical="top"
                    />

                    {/* Optional rating even for problems */}
                    <Text style={[styles.subtitle, { marginBottom: 12, color: dynamicTheme.textSecondary }]}>Avalie o atendimento (opcional):</Text>
                    <View style={styles.starsContainer}>
                        {[1, 2, 3, 4, 5].map((star) => (
                            <TouchableOpacity
                                key={star}
                                onPress={() => setRating(star)}
                                activeOpacity={0.7}
                                style={styles.starTouch}
                            >
                                <MaterialIcons
                                    name={star <= rating ? 'star' : 'star-border'}
                                    size={40}
                                    color={star <= rating ? '#f59e0b' : dynamicTheme.border}
                                />
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity
                        style={[styles.reportSubmitBtn, { backgroundColor: '#ef4444' }, !selectedProblem && styles.submitBtnDisabled]}
                        onPress={handleReportProblem}
                        disabled={submitting || !selectedProblem}
                        activeOpacity={0.8}
                    >
                        {submitting ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.submitText}>Enviar Relatório</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.skipBtn} onPress={() => setServiceStatus('pending')}>
                        <Text style={[styles.skipText, { color: dynamicTheme.textSecondary }]}>Voltar</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        );
    }

    // Step 2a: Rating (service confirmed)
    return (
        <View style={[styles.container, { backgroundColor: dynamicTheme.background }]}>
            <RNStatusBar barStyle={dynamicTheme.statusBar} />
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Icon */}
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                    <MaterialIcons name="emoji-events" size={48} color="#f59e0b" />
                </View>

                {/* Title */}
                <Text style={[styles.title, { color: dynamicTheme.text }]}>Avalie o Serviço</Text>
                <Text style={[styles.subtitle, { color: dynamicTheme.textSecondary }]}>
                    Como foi o atendimento com{'\n'}
                    <Text style={[styles.driverHighlight, { color: dynamicTheme.text }]}>{driverName}</Text>?
                </Text>

                {/* Stars */}
                <View style={styles.starsContainer}>
                    {[1, 2, 3, 4, 5].map((star) => (
                        <TouchableOpacity
                            key={star}
                            onPress={() => setRating(star)}
                            activeOpacity={0.7}
                            style={styles.starTouch}
                        >
                            <MaterialIcons
                                name={star <= rating ? 'star' : 'star-border'}
                                size={48}
                                color={star <= rating ? '#f59e0b' : dynamicTheme.border}
                            />
                        </TouchableOpacity>
                    ))}
                </View>
                {rating > 0 && (
                    <Text style={[styles.ratingLabel, { color: rating >= 4 ? '#22c55e' : rating >= 3 ? '#f59e0b' : '#ef4444' }]}>
                        {starLabels[rating - 1]}
                    </Text>
                )}

                {/* Comment */}
                <TextInput
                    style={[styles.commentInput, { backgroundColor: dynamicTheme.card, color: dynamicTheme.text, borderColor: dynamicTheme.border }]}
                    placeholder="Deixe um comentário (opcional)..."
                    placeholderTextColor={dynamicTheme.textSecondary}
                    multiline
                    numberOfLines={3}
                    value={comment}
                    onChangeText={setComment}
                    textAlignVertical="top"
                />

                {/* Submit */}
                <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: THEME_COLORS.primary }, rating === 0 && styles.submitBtnDisabled]}
                    onPress={handleSubmitRating}
                    disabled={submitting || rating === 0}
                    activeOpacity={0.8}
                >
                    {submitting ? (
                        <ActivityIndicator color={isDark ? '#0A0E12' : '#fff'} />
                    ) : (
                        <Text style={[styles.submitText, { color: isDark ? '#0A0E12' : '#fff' }]}>Enviar Avaliação</Text>
                    )}
                </TouchableOpacity>

                {/* Skip */}
                <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
                    <Text style={[styles.skipText, { color: dynamicTheme.textSecondary }]}>Pular</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0b1220',
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingVertical: 40,
    },
    content: {
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    backBtn: {
        alignSelf: 'flex-start',
        marginBottom: 20,
        padding: 4,
    },
    iconCircle: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        color: '#e5e7eb',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 15,
        color: '#94a3b8',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    driverHighlight: {
        fontWeight: '700',
        color: '#e5e7eb',
    },
    confirmBtn: {
        width: '100%',
        height: 56,
        borderRadius: 14,
        backgroundColor: '#22c55e',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 12,
    },
    confirmBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '800',
    },
    problemBtn: {
        width: '100%',
        height: 56,
        borderRadius: 14,
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 12,
    },
    problemBtnText: {
        color: '#f59e0b',
        fontSize: 16,
        fontWeight: '700',
    },
    problemOptionsContainer: {
        width: '100%',
        marginBottom: 16,
    },
    problemOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#1e293b',
        marginBottom: 8,
    },
    problemOptionSelected: {
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
    },
    problemOptionText: {
        flex: 1,
        color: '#94a3b8',
        fontSize: 14,
        fontWeight: '500',
    },
    problemOptionTextSelected: {
        color: '#e5e7eb',
        fontWeight: '600',
    },
    starsContainer: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
    },
    starTouch: {
        padding: 4,
    },
    ratingLabel: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 24,
        letterSpacing: 0.5,
    },
    commentInput: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 14,
        padding: 16,
        color: '#e5e7eb',
        fontSize: 14,
        minHeight: 80,
        borderWidth: 1,
        borderColor: '#1e293b',
        marginBottom: 20,
    },
    submitBtn: {
        width: '100%',
        height: 54,
        borderRadius: 14,
        backgroundColor: '#137fec',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    reportSubmitBtn: {
        width: '100%',
        height: 54,
        borderRadius: 14,
        backgroundColor: '#ef4444',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    submitBtnDisabled: {
        backgroundColor: '#1e293b',
        opacity: 0.5,
    },
    submitText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '800',
    },
    skipBtn: {
        paddingVertical: 12,
    },
    skipText: {
        color: '#64748b',
        fontSize: 14,
        fontWeight: '500',
    },
});
