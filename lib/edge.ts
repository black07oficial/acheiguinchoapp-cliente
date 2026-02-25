import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

function isJwt(v: unknown) {
  return typeof v === 'string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);
}

async function getAccessToken(forceRefresh = false) {
  try {
    if (forceRefresh) {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (error) console.log('Error refreshing session:', error);
      if (!error && isJwt(refreshed.session?.access_token)) {
        return refreshed.session?.access_token;
      }
    }

    const { data: sessionData } = await supabase.auth.getSession();
    let token = sessionData.session?.access_token;
    
    // Check if token is present and looks like a JWT
    if (isJwt(token)) return token;

    // If not, try to refresh
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (!error && isJwt(refreshed.session?.access_token)) {
      return refreshed.session?.access_token;
    }
  } catch (e) {
    console.error('Error getting access token:', e);
  }

  return null;
}

export async function invokeComputeQuote(params: {
  origem_lat: number;
  origem_lng: number;
  destino_lat: number;
  destino_lng: number;
}) {
  let accessToken = await getAccessToken();
  
  if (!accessToken) {
    throw new Error('Sessão inválida. Faça login novamente.');
  }

  const url = `${supabaseUrl}/functions/v1/compute-quote`;

  const makeRequest = async (token: string) => {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        origem_lat: params.origem_lat,
        origem_lng: params.origem_lng,
        destino_lat: params.destino_lat,
        destino_lng: params.destino_lng,
      }),
    });
  };

  let res = await makeRequest(accessToken);

  // If 401, try to refresh token and retry once
  if (res.status === 401) {
    console.log('Got 401 from Edge Function, attempting to refresh token...');
    const newToken = await getAccessToken(true);
    if (newToken) {
      console.log('Token refreshed, retrying request...');
      res = await makeRequest(newToken);
    } else {
      console.log('Failed to refresh token');
    }
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = json?.error || json?.message || `Edge function error (${res.status})`;
    console.error('Edge Function Error Body:', text);
    throw new Error(msg);
  }

  return json;
}
