-- Chat messages table for client ↔ provider communication
CREATE TABLE IF NOT EXISTS public.mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.solicitacoes(id) ON DELETE CASCADE,
  remetente_id uuid NOT NULL REFERENCES auth.users(id),
  remetente_tipo text NOT NULL CHECK (remetente_tipo IN ('cliente', 'prestador')),
  conteudo text NOT NULL,
  lido boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookup
CREATE INDEX idx_mensagens_solicitacao ON public.mensagens(solicitacao_id, created_at);

-- Enable RLS
ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

-- Participants can read messages from their request
CREATE POLICY "Participantes podem ler mensagens"
  ON public.mensagens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.solicitacoes s
      WHERE s.id = mensagens.solicitacao_id
        AND (s.cliente_id = auth.uid() OR s.prestador_id = auth.uid())
    )
  );

-- Participants can send messages to their request
CREATE POLICY "Participantes podem enviar mensagens"
  ON public.mensagens FOR INSERT
  WITH CHECK (
    remetente_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.solicitacoes s
      WHERE s.id = mensagens.solicitacao_id
        AND (s.cliente_id = auth.uid() OR s.prestador_id = auth.uid())
    )
  );

-- Participants can mark messages as read (update lido field)
CREATE POLICY "Participantes podem marcar como lido"
  ON public.mensagens FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.solicitacoes s
      WHERE s.id = mensagens.solicitacao_id
        AND (s.cliente_id = auth.uid() OR s.prestador_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.solicitacoes s
      WHERE s.id = mensagens.solicitacao_id
        AND (s.cliente_id = auth.uid() OR s.prestador_id = auth.uid())
    )
  );

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens;

-- ============================================================
-- Push Notification Trigger (calls Edge Function via pg_net)
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  edge_url text;
  service_key text;
BEGIN
  edge_url := 'https://pncjqmbdkwmmkccukkhi.supabase.co/functions/v1/notify-chat-message';

  -- Get the service role key from vault (or use the one from settings)
  -- We pass the record as JSON body
  PERFORM net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', NEW.id,
        'solicitacao_id', NEW.solicitacao_id,
        'remetente_id', NEW.remetente_id,
        'remetente_tipo', NEW.remetente_tipo,
        'conteudo', NEW.conteudo
      )
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_new_chat_message
  AFTER INSERT ON public.mensagens
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_chat_message();
