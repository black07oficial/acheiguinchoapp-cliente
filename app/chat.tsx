import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Message {
    id: string;
    solicitacao_id: string;
    remetente_id: string;
    remetente_tipo: 'cliente' | 'prestador';
    conteudo: string;
    lido: boolean;
    created_at: string;
}

export default function Chat() {
    const router = useRouter();
    const { requestId, userType, otherName: otherNameParam } = useLocalSearchParams<{
        requestId: string;
        userType: 'cliente' | 'prestador';
        otherName: string;
    }>();

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [userName, setUserName] = useState<string>('Eu');
    const [contactName, setContactName] = useState<string>(otherNameParam || '');
    const flatListRef = useRef<FlatList>(null);

    // Get current user and fetch the other person's name if not passed
    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setUserId(user.id);

            // Fetch own name
            const myTable = userType === 'prestador' ? 'prestadores' : 'clientes';
            const { data: myData } = await supabase.from(myTable).select('nome').eq('id', user.id).single();
            if (myData?.nome) setUserName(myData.nome);

            // If other name not passed, fetch it from the solicitacao
            if (!otherNameParam && requestId) {
                const { data: sol } = await supabase
                    .from('solicitacoes')
                    .select('cliente_id, prestador_id')
                    .eq('id', requestId)
                    .single();

                if (sol) {
                    const otherId = userType === 'prestador' ? sol.cliente_id : sol.prestador_id;
                    const otherTable = userType === 'prestador' ? 'clientes' : 'prestadores';
                    if (otherId) {
                        const { data: otherData } = await supabase.from(otherTable).select('nome').eq('id', otherId).single();
                        setContactName(otherData?.nome || (userType === 'prestador' ? 'Cliente' : 'Prestador'));
                    }
                }
            }
        })();
    }, []);

    const displayContactName = contactName || (userType === 'prestador' ? 'Cliente' : 'Prestador');

    // Load existing messages
    useEffect(() => {
        if (!requestId) return;

        const loadMessages = async () => {
            const { data, error } = await supabase
                .from('mensagens')
                .select('*')
                .eq('solicitacao_id', requestId)
                .order('created_at', { ascending: true });

            if (!error && data) {
                setMessages(data);
            }
            setLoading(false);
        };

        loadMessages();

        // Subscribe to new messages via Realtime
        const channel = supabase
            .channel(`chat:${requestId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'mensagens',
                    filter: `solicitacao_id=eq.${requestId}`,
                },
                (payload) => {
                    const newMsg = payload.new as Message;
                    setMessages((prev) => {
                        if (prev.find((m) => m.id === newMsg.id)) return prev;
                        return [...prev, newMsg];
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [requestId]);

    // Auto-scroll when new messages arrive
    useEffect(() => {
        if (messages.length > 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages.length]);

    const sendMessage = async () => {
        if (!input.trim() || !requestId || !userId || sending) return;

        const text = input.trim();
        setInput('');
        setSending(true);

        const { error } = await supabase.from('mensagens').insert({
            solicitacao_id: requestId,
            remetente_id: userId,
            remetente_tipo: userType || 'cliente',
            conteudo: text,
        });

        if (error) {
            console.error('[CHAT] Send error:', error);
            setInput(text);
        }

        setSending(false);
    };

    const isMyMessage = (msg: Message) => msg.remetente_id === userId;

    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    const getSenderName = (msg: Message) => {
        if (isMyMessage(msg)) return userName;
        return displayContactName;
    };

    const getSenderIcon = (msg: Message): keyof typeof MaterialIcons.glyphMap => {
        if (msg.remetente_tipo === 'prestador') return 'local-shipping';
        return 'person';
    };

    const getSenderColor = (msg: Message) => {
        if (msg.remetente_tipo === 'prestador') return '#137fec';
        return '#22c55e';
    };

    const renderMessage = ({ item, index }: { item: Message; index: number }) => {
        const mine = isMyMessage(item);
        const showSender = index === 0 || messages[index - 1]?.remetente_id !== item.remetente_id;

        return (
            <View style={[styles.bubbleRow, mine ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
                {!mine && showSender ? (
                    <View style={[styles.avatarSmall, { backgroundColor: getSenderColor(item) }]}>
                        <MaterialIcons name={getSenderIcon(item)} size={14} color="white" />
                    </View>
                ) : !mine ? (
                    <View style={styles.avatarSpacer} />
                ) : null}

                <View style={{ maxWidth: '78%' }}>
                    {showSender && (
                        <Text style={[styles.senderName, mine ? styles.senderNameRight : styles.senderNameLeft]}>
                            {getSenderName(item)}
                        </Text>
                    )}
                    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                        <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
                            {item.conteudo}
                        </Text>
                        <Text style={[styles.bubbleTime, mine ? styles.timeRight : styles.timeLeft]}>
                            {formatTime(item.created_at)}
                        </Text>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <MaterialIcons name="arrow-back" size={24} color="white" />
                    </TouchableOpacity>
                    <View style={[styles.headerAvatar, { backgroundColor: userType === 'prestador' ? '#22c55e' : '#137fec' }]}>
                        <MaterialIcons
                            name={userType === 'prestador' ? 'person' : 'local-shipping'}
                            size={22}
                            color="white"
                        />
                    </View>
                    <View style={styles.headerInfo}>
                        <Text style={styles.headerTitle}>{displayContactName}</Text>
                        <Text style={styles.headerSubtitle}>
                            {userType === 'prestador' ? 'Cliente' : 'Prestador'}
                        </Text>
                    </View>
                </View>

                {/* Messages */}
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#137fec" />
                    </View>
                ) : messages.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <MaterialIcons name="chat-bubble-outline" size={48} color="#4a5568" />
                        <Text style={styles.emptyText}>Nenhuma mensagem ainda</Text>
                        <Text style={styles.emptySubtext}>Envie a primeira mensagem para {displayContactName}!</Text>
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        keyExtractor={(item) => item.id}
                        renderItem={renderMessage}
                        contentContainerStyle={styles.messageList}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                        keyboardDismissMode="interactive"
                        keyboardShouldPersistTaps="handled"
                    />
                )}

                {/* Input */}
                <View style={styles.inputRow}>
                    <TextInput
                        style={styles.textInput}
                        placeholder={`Mensagem para ${displayContactName}...`}
                        placeholderTextColor="#64748b"
                        value={input}
                        onChangeText={setInput}
                        multiline
                        maxLength={1000}
                        onSubmitEditing={sendMessage}
                    />
                    <TouchableOpacity
                        style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
                        onPress={sendMessage}
                        disabled={!input.trim() || sending}
                    >
                        <MaterialIcons name="send" size={22} color="white" />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
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
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: '#111b2d',
        borderBottomWidth: 1,
        borderBottomColor: '#1e293b',
    },
    backBtn: {
        marginRight: 12,
        padding: 4,
    },
    headerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    headerInfo: {
        flex: 1,
    },
    headerTitle: {
        color: 'white',
        fontSize: 17,
        fontWeight: '700',
    },
    headerSubtitle: {
        color: '#94a3b8',
        fontSize: 12,
        marginTop: 1,
    },
    chatArea: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 60,
    },
    emptyText: {
        color: '#64748b',
        fontSize: 16,
        marginTop: 12,
        fontWeight: '600',
    },
    emptySubtext: {
        color: '#4a5568',
        fontSize: 13,
        marginTop: 4,
    },
    messageList: {
        paddingHorizontal: 12,
        paddingVertical: 12,
    },
    bubbleRow: {
        marginBottom: 4,
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    bubbleRowRight: {
        justifyContent: 'flex-end',
    },
    bubbleRowLeft: {
        justifyContent: 'flex-start',
    },
    avatarSmall: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 6,
        marginBottom: 2,
    },
    avatarSpacer: {
        width: 34,
    },
    senderName: {
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 2,
        marginHorizontal: 4,
    },
    senderNameLeft: {
        color: '#94a3b8',
        textAlign: 'left',
    },
    senderNameRight: {
        color: '#94a3b8',
        textAlign: 'right',
    },
    bubble: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 18,
    },
    bubbleMine: {
        backgroundColor: '#137fec',
        borderBottomRightRadius: 4,
    },
    bubbleTheirs: {
        backgroundColor: '#1e293b',
        borderBottomLeftRadius: 4,
    },
    bubbleText: {
        fontSize: 15,
        lineHeight: 20,
    },
    bubbleTextMine: {
        color: 'white',
    },
    bubbleTextTheirs: {
        color: '#e2e8f0',
    },
    bubbleTime: {
        fontSize: 11,
        marginTop: 4,
    },
    timeRight: {
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'right',
    },
    timeLeft: {
        color: '#64748b',
        textAlign: 'left',
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#111b2d',
        borderTopWidth: 1,
        borderTopColor: '#1e293b',
    },
    textInput: {
        flex: 1,
        backgroundColor: '#1e293b',
        color: 'white',
        borderRadius: 22,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 15,
        maxHeight: 100,
        marginRight: 8,
    },
    sendBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#137fec',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendBtnDisabled: {
        opacity: 0.4,
    },
});
