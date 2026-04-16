-- ============================================================
-- Migration: Function Buscar Serviços Disponíveis
-- Description: Função RPC para buscar serviços disponíveis próximos ao cliente
-- ============================================================

-- Função para calcular distância em km entre duas coordenadas (Haversine)
CREATE OR REPLACE FUNCTION calcular_distancia_km(
  lat1 float,
  lng1 float,
  lat2 float,
  lng2 float
)
RETURNS float
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN 6371 * acos(
    LEAST(1.0, GREATEST(-1.0,
      cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2) - radians(lng1)) 
      + sin(radians(lat1)) * sin(radians(lat2))
    ))
  );
END;
$$;

-- Função principal para buscar serviços disponíveis
CREATE OR REPLACE FUNCTION buscar_servicos_disponiveis(
  p_origem_lat float,
  p_origem_lng float,
  p_destino_lat float DEFAULT NULL,
  p_destino_lng float DEFAULT NULL,
  p_raio_km float DEFAULT 50,
  p_limite int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  prestador_id uuid,
  tipo_servico_id text,
  tipo_servico_nome text,
  tipo_servico_descricao text,
  tipo_servico_icone text,
  preco_base decimal,
  preco_por_km decimal,
  prestador_nome text,
  prestador_foto_url text,
  prestador_rating float,
  prestador_total_servicos bigint,
  prestador_telefone text,
  distancia_km float,
  tempo_estimado_min int,
  distancia_viagem_km float,
  preco_final decimal
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_distancia_viagem float := 0;
BEGIN
  -- Calcular distância da viagem se destino foi fornecido
  IF p_destino_lat IS NOT NULL AND p_destino_lng IS NOT NULL THEN
    v_distancia_viagem := calcular_distancia_km(p_origem_lat, p_origem_lng, p_destino_lat, p_destino_lng);
  END IF;

  RETURN QUERY
  SELECT 
    ps.id,
    ps.prestador_id,
    ps.tipo_servico_id,
    ts.nome as tipo_servico_nome,
    ts.descricao as tipo_servico_descricao,
    ts.icone as tipo_servico_icone,
    ps.preco_base,
    ps.preco_por_km,
    p.nome as prestador_nome,
    p.avatar_url as prestador_foto_url,
    COALESCE(p.avaliacao, 4.5)::float as prestador_rating,
    (SELECT COUNT(*) FROM solicitacoes s WHERE s.prestador_id = p.id AND s.status = 'finalizado') as prestador_total_servicos,
    p.telefone as prestador_telefone,
    calcular_distancia_km(p_origem_lat, p_origem_lng, p.latitude, p.longitude) as distancia_km,
    -- Tempo estimado: 2 min por km + tempo base do serviço
    FLOOR(2 * calcular_distancia_km(p_origem_lat, p_origem_lng, p.latitude, p.longitude) + COALESCE(ps.tempo_estimado_chegada, 15))::int as tempo_estimado_min,
    v_distancia_viagem as distancia_viagem_km,
    (ps.preco_base + (ps.preco_por_km * v_distancia_viagem))::decimal as preco_final
  FROM prestador_servicos ps
  JOIN prestadores p ON p.id = ps.prestador_id
  JOIN tipos_servico ts ON ts.id = ps.tipo_servico_id
  WHERE p.status = 'online'
    AND p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND ps.ativo = true
    AND ts.ativo = true
    AND calcular_distancia_km(p_origem_lat, p_origem_lng, p.latitude, p.longitude) <= p_raio_km
  ORDER BY 
    distancia_km ASC,
    prestador_rating DESC
  LIMIT p_limite;
END;
$$;

-- Comentários
COMMENT ON FUNCTION buscar_servicos_disponiveis IS 'Busca serviços de guincho disponíveis próximos à localização do cliente';
COMMENT ON FUNCTION calcular_distancia_km IS 'Calcula distância em quilômetros entre duas coordenadas usando a fórmula de Haversine';

-- Grant execute para usuários anônimos e autenticados
GRANT EXECUTE ON FUNCTION buscar_servicos_disponiveis TO anon;
GRANT EXECUTE ON FUNCTION buscar_servicos_disponiveis TO authenticated;
GRANT EXECUTE ON FUNCTION calcular_distancia_km TO anon;
GRANT EXECUTE ON FUNCTION calcular_distancia_km TO authenticated;
