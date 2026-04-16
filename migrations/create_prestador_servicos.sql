-- ============================================================
-- Migration: Prestador Serviços
-- Description: Cria tabela de serviços oferecidos por cada prestador
-- ============================================================

-- Criar tabela de serviços do prestador
CREATE TABLE IF NOT EXISTS public.prestador_servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id uuid NOT NULL REFERENCES public.prestadores(id) ON DELETE CASCADE,
  tipo_servico_id text NOT NULL REFERENCES public.tipos_servico(id) ON DELETE RESTRICT,
  preco_base decimal(10,2) NOT NULL CHECK (preco_base >= 0),
  preco_por_km decimal(10,2) DEFAULT 0 CHECK (preco_por_km >= 0),
  tempo_estimado_chegada int DEFAULT 15, -- minutos
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Um prestador só pode ter um registro por tipo de serviço
  UNIQUE(prestador_id, tipo_servico_id)
);

-- Habilitar RLS
ALTER TABLE public.prestador_servicos ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Prestadores podem gerenciar seus serviços" ON public.prestador_servicos;
DROP POLICY IF EXISTS "Clientes podem ver serviços disponíveis" ON public.prestador_servicos;

-- Política: Prestadores podem gerenciar seus próprios serviços
CREATE POLICY "Prestadores podem gerenciar seus serviços"
  ON public.prestador_servicos FOR ALL
  TO authenticated
  USING (prestador_id = auth.uid())
  WITH CHECK (prestador_id = auth.uid());

-- Política: Clientes podem ver serviços de prestadores online
CREATE POLICY "Clientes podem ver serviços disponíveis"
  ON public.prestador_servicos FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.prestadores p
      WHERE p.id = prestador_id
        AND p.status = 'online'
    )
    AND ativo = true
  );

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_prestador_servicos_prestador ON public.prestador_servicos(prestador_id);
CREATE INDEX IF NOT EXISTS idx_prestador_servicos_tipo ON public.prestador_servicos(tipo_servico_id);
CREATE INDEX IF NOT EXISTS idx_prestador_servicos_ativo ON public.prestador_servicos(ativo);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_prestador_servicos_updated_at ON public.prestador_servicos;

CREATE TRIGGER update_prestador_servicos_updated_at
  BEFORE UPDATE ON public.prestador_servicos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comentário
COMMENT ON TABLE public.prestador_servicos IS 'Serviços oferecidos por cada prestador com seus respectivos preços';
COMMENT ON COLUMN public.prestador_servicos.preco_base IS 'Preço base do serviço em reais';
COMMENT ON COLUMN public.prestador_servicos.preco_por_km IS 'Preço adicional por quilômetro rodado';
COMMENT ON COLUMN public.prestador_servicos.tempo_estimado_chegada IS 'Tempo estimado de chegada em minutos';
