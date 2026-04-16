-- ============================================================
-- Migration: Tipos de Serviço
-- Description: Cria tabela de tipos de serviços disponíveis
-- ============================================================

-- Criar tabela de tipos de serviço
CREATE TABLE IF NOT EXISTS public.tipos_servico (
  id text PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  icone text,
  imagem_url text,
  ativo boolean DEFAULT true,
  ordem int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Inserir tipos de serviço padrão
INSERT INTO public.tipos_servico (id, nome, descricao, icone, ordem) VALUES
  ('carro_leve', 'Carro Leve', 'Veículos de passeio e utilitários pequenos (até 3.5 ton)', 'car', 1),
  ('carro_pesado', 'Carro Pesado', 'Caminhões, ônibus e veículos grandes (acima de 3.5 ton)', 'truck', 2),
  ('moto', 'Moto', 'Motocicletas e ciclomotores', 'bike', 3),
  ('plataforma', 'Plataforma', 'Transporte em plataforma elevatória para veículos baixos ou de luxo', 'local-shipping', 4),
  ('reboque', 'Reboque', 'Reboque tradicional com roldana', 'rv-hookup', 5)
ON CONFLICT (id) DO NOTHING;

-- Habilitar RLS
ALTER TABLE public.tipos_servico ENABLE ROW LEVEL SECURITY;

-- Política: Todos podem ler tipos de serviço
CREATE POLICY "Tipos de serviço são públicos"
  ON public.tipos_servico FOR SELECT
  TO anon, authenticated
  USING (true);

-- Índice para ordenação
CREATE INDEX IF NOT EXISTS idx_tipos_servico_ordem ON public.tipos_servico(ordem);

-- Comentário
COMMENT ON TABLE public.tipos_servico IS 'Catálogo de tipos de serviços de guincho disponíveis na plataforma';
