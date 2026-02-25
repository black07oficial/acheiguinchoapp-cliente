import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/react-query';
import { usePushNotifications } from '../hooks/use-push-notifications';
import '../lib/location-task'; // Register background tasks
import { AGENCY_CONFIG } from '../lib/agency';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [session, setSession] = useState<any | null | undefined>(undefined);
  const [role, setRole] = useState<'client' | 'provider' | null>(null);
  
  // Initialize Push Notifications
  usePushNotifications();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (session === undefined) return;
      if (!session) {
        if (!cancelled) setRole('client'); // Visitantes são tratados como clientes
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setRole('client');
        return;
      }

      if (!profile || profile.status === 'blocked') {
        await supabase.auth.signOut();
        setRole(null);
        return;
      }

      setRole(profile.role === 'provider' ? 'provider' : 'client');
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (session === undefined) return;

    const root = segments[0];
    const inAuth = root === 'auth';
    const inClient = root === '(client)';
    const inProvider = root === '(provider)';
    const inWelcome = root === undefined;

    if (!session) {
      if (inProvider) {
        router.replace('/');
      }
      // Se estiver na home do cliente ou em rotas de cliente, permitimos continuar sem sessão
      return;
    }

    if (!role) return;

    if (inAuth || inWelcome) {
      router.replace(role === 'provider' ? '/(provider)/home' : '/(client)/home');
      return;
    }

    if (role === 'provider' && inClient) {
      router.replace('/(provider)/home');
      return;
    }

    if (role === 'client' && inProvider) {
      router.replace('/(client)/home');
    }
  }, [session, role, segments]);

  return (
    <QueryClientProvider client={queryClient}>
      <Slot />
    </QueryClientProvider>
  );
}
