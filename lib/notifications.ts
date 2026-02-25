import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Configure how notifications behave when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    // If user is in the chat screen for this request, don't show the notification
    // (handled via context in the chat screen itself)
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

// Set up Android notification channels for production
export async function setupNotificationChannels() {
  if (Platform.OS === 'android') {
    // Default channel
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Geral',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
      sound: 'default',
    });

    // Chat messages channel — high priority with sound
    await Notifications.setNotificationChannelAsync('chat', {
      name: 'Mensagens do Chat',
      description: 'Notificações de novas mensagens no chat',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: '#137fec',
      sound: 'default',
      enableVibrate: true,
    });

    // Request updates channel
    await Notifications.setNotificationChannelAsync('requests', {
      name: 'Solicitações',
      description: 'Atualizações sobre solicitações de guincho',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#22c55e',
      sound: 'default',
    });
  }
}

// Set up notification categories (for actionable notifications in production builds)
export async function setupNotificationCategories() {
  await Notifications.setNotificationCategoryAsync('chat_message', [
    {
      identifier: 'reply',
      buttonTitle: 'Responder',
      textInput: {
        submitButtonTitle: 'Enviar',
        placeholder: 'Digite sua resposta...',
      },
      options: {
        opensAppToForeground: false,
      },
    },
    {
      identifier: 'open',
      buttonTitle: 'Abrir Chat',
      options: {
        opensAppToForeground: true,
      },
    },
  ]);
}

export async function registerForPushNotificationsAsync() {
  let token;

  // Set up channels
  await setupNotificationChannels();

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }

    // Get the token
    try {
      const projectId = (Constants.expoConfig as any)?.extra?.eas?.projectId;
      const isUuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
      token = isUuid(projectId)
        ? (await Notifications.getExpoPushTokenAsync({ projectId })).data
        : (await Notifications.getExpoPushTokenAsync()).data;
      console.log("Push Token:", token);
    } catch (e: any) {
      console.log('[PUSH] Token registration skipped (Expo Go / missing projectId):', e?.message);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

export async function updateUserPushToken(userId: string, table: 'clientes' | 'prestadores') {
  try {
    const token = await registerForPushNotificationsAsync();
    if (token) {
      const { error } = await supabase
        .from(table)
        .update({ push_token: token })
        .eq('id', userId);

      if (error) throw error;
      console.log(`Token updated for user ${userId} in ${table}`);
    }
  } catch (error) {
    console.error("Error updating push token:", error);
  }
}

// Handle quick reply from notification action
export async function handleNotificationReply(
  requestId: string,
  userType: 'cliente' | 'prestador',
  userId: string,
  replyText: string
) {
  try {
    const { error } = await supabase.from('mensagens').insert({
      solicitacao_id: requestId,
      remetente_id: userId,
      remetente_tipo: userType,
      conteudo: replyText,
    });
    if (error) throw error;
    console.log('[PUSH] Reply sent from notification');
  } catch (e) {
    console.error('[PUSH] Reply failed:', e);
  }
}
