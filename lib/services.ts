// ============================================================
// Lib: Serviços de Guincho
// Description: Funções para buscar e gerenciar serviços disponíveis
// ============================================================

import { supabase } from './supabase';
import type { ServicoDisponivel, TipoServico, PrestadorServicoInput } from '../types/service';

/**
 * Busca serviços disponíveis próximos à localização do cliente
 */
export async function fetchAvailableServices(
  origemLat: number,
  origemLng: number,
  destinoLat?: number,
  destinoLng?: number,
  raioKm: number = 50
): Promise<{ data: ServicoDisponivel[] | null; error: Error | null }> {
  try {
    const params = {
      p_origem_lat: origemLat,
      p_origem_lng: origemLng,
      p_destino_lat: destinoLat ?? null,
      p_destino_lng: destinoLng ?? null,
      p_raio_km: raioKm,
      p_limite: 20,
    };
    console.log('[SERVICES] Buscando serviços com params:', JSON.stringify(params));

    const { data, error } = await supabase.rpc('buscar_servicos_disponiveis', params);

    if (error) {
      console.error('[SERVICES] RPC error:', error.message, error.code, error.details, error.hint);
      return { data: null, error: new Error(error.message) };
    }

    console.log('[SERVICES] Resultado:', data?.length ?? 0, 'serviços encontrados');
    if (data && data.length > 0) {
      console.log('[SERVICES] Primeiro resultado:', JSON.stringify(data[0]));
    }

    // DEBUG: Se 0 resultados, investigar por quê
    if (!data || data.length === 0) {
      console.log('[SERVICES] === DIAGNÓSTICO ===');

      // 1. Verificar prestadores online
      const { data: onlineProviders } = await supabase
        .from('prestadores')
        .select('id, nome, status, latitude, longitude')
        .eq('status', 'online');
      console.log('[SERVICES] Prestadores online:', JSON.stringify(onlineProviders));

      // 2. Verificar serviços ativos
      if (onlineProviders && onlineProviders.length > 0) {
        for (const p of onlineProviders) {
          const { data: servicos } = await supabase
            .from('prestador_servicos')
            .select('id, tipo_servico_id, preco_base, ativo')
            .eq('prestador_id', p.id);
          console.log(`[SERVICES] Serviços do prestador ${p.nome} (${p.id}):`, JSON.stringify(servicos));
        }
      }

      // 3. Verificar tipos_servico ativos
      const { data: tiposAtivos } = await supabase
        .from('tipos_servico')
        .select('id, nome, ativo');
      console.log('[SERVICES] Tipos de serviço:', JSON.stringify(tiposAtivos));
    }

    return { data: data as ServicoDisponivel[], error: null };
  } catch (err) {
    console.error('[SERVICES] Exception fetching available services:', err);
    return { data: null, error: err as Error };
  }
}

/**
 * Busca todos os tipos de serviço cadastrados
 */
export async function fetchTiposServico(): Promise<{ data: TipoServico[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('tipos_servico')
      .select('*')
      .eq('ativo', true)
      .order('ordem', { ascending: true });

    if (error) {
      console.error('[SERVICES] Error fetching service types:', error);
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as TipoServico[], error: null };
  } catch (err) {
    console.error('[SERVICES] Exception fetching service types:', err);
    return { data: null, error: err as Error };
  }
}

/**
 * Formata preço para exibição em Reais
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(price);
}

/**
 * Formata distância para exibição
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)} km`;
}

/**
 * Formata tempo estimado para exibição
 */
export function formatTime(minutes: number): string {
  if (minutes < 60) {
    return `~${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `~${hours}h ${mins}min`;
}

/**
 * Retorna o nome do ícone MaterialIcons baseado no tipo de serviço
 */
export function getServiceIcon(tipoServicoId: string): string {
  const iconMap: Record<string, string> = {
    'carro_leve': 'directions-car',
    'carro_pesado': 'local-shipping',
    'moto': 'two-wheeler',
    'plataforma': 'local-shipping',
    'reboque': 'rv-hookup',
  };
  return iconMap[tipoServicoId] || 'help-outline';
}

/**
 * Calcula o preço final baseado na distância
 */
export function calculateFinalPrice(
  precoBase: number,
  precoPorKm: number,
  distanciaKm: number
): number {
  return precoBase + (precoPorKm * distanciaKm);
}

/**
 * Estima o tempo de chegada baseado na distância
 * (Média de 30km/h em área urbana)
 */
export function estimateArrivalTime(distanciaKm: number): number {
  // 2 minutos por km + 5 minutos base
  return Math.ceil(distanciaKm * 2 + 5);
}

// ============================================================
// Funções para o App Prestador
// ============================================================

/**
 * Busca serviços cadastrados pelo prestador logado
 */
export async function fetchPrestadorServicos(prestadorId: string): Promise<{ data: any[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('prestador_servicos')
      .select(`
        *,
        tipos_servico (
          id,
          nome,
          descricao,
          icone
        )
      `)
      .eq('prestador_id', prestadorId);

    if (error) {
      console.error('[SERVICES] Error fetching provider services:', error);
      return { data: null, error: new Error(error.message) };
    }

    return { data, error: null };
  } catch (err) {
    console.error('[SERVICES] Exception fetching provider services:', err);
    return { data: null, error: err as Error };
  }
}

/**
 * Cria ou atualiza um serviço do prestador
 */
export async function upsertPrestadorServico(
  prestadorId: string,
  input: PrestadorServicoInput
): Promise<{ data: any | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('prestador_servicos')
      .upsert({
        prestador_id: prestadorId,
        tipo_servico_id: input.tipo_servico_id,
        preco_base: input.preco_base,
        preco_por_km: input.preco_por_km,
        tempo_estimado_chegada: input.tempo_estimado_chegada ?? 15,
        ativo: input.ativo ?? true,
      }, {
        onConflict: 'prestador_id,tipo_servico_id',
      })
      .select()
      .single();

    if (error) {
      console.error('[SERVICES] Error upserting provider service:', error);
      return { data: null, error: new Error(error.message) };
    }

    return { data, error: null };
  } catch (err) {
    console.error('[SERVICES] Exception upserting provider service:', err);
    return { data: null, error: err as Error };
  }
}

/**
 * Remove um serviço do prestador
 */
export async function deletePrestadorServico(
  servicoId: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('prestador_servicos')
      .delete()
      .eq('id', servicoId);

    if (error) {
      console.error('[SERVICES] Error deleting provider service:', error);
      return { error: new Error(error.message) };
    }

    return { error: null };
  } catch (err) {
    console.error('[SERVICES] Exception deleting provider service:', err);
    return { error: err as Error };
  }
}

/**
 * Ativa/desativa um serviço do prestador
 */
export async function togglePrestadorServico(
  servicoId: string,
  ativo: boolean
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('prestador_servicos')
      .update({ ativo })
      .eq('id', servicoId);

    if (error) {
      console.error('[SERVICES] Error toggling provider service:', error);
      return { error: new Error(error.message) };
    }

    return { error: null };
  } catch (err) {
    console.error('[SERVICES] Exception toggling provider service:', err);
    return { error: err as Error };
  }
}
