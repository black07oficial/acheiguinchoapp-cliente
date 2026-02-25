-- ============================================================
-- INCREMENTAL: Run this if you already have the mensagens table
-- Adds: UPDATE policy + push notification trigger
-- ============================================================

-- 1. Add UPDATE policy for marking messages as read
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

-- 2. Push notification trigger function
CREATE OR REPLACE FUNCTION public.notify_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://pncjqmbdkwmmkccukkhi.supabase.co/functions/v1/notify-chat-message',
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

-- 3. Trigger on new message
CREATE TRIGGER on_new_chat_message
  AFTER INSERT ON public.mensagens
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_chat_message();
