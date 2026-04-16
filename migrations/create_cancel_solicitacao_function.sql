-- Create function to cancel solicitacao
-- This function cancels a request if it belongs to the current user or is a guest request

-- Drop existing function first (to avoid return type conflict)
DROP FUNCTION IF EXISTS public.cancel_my_solicitacao(UUID);

-- Create the function
CREATE FUNCTION public.cancel_my_solicitacao(request_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_user_id UUID;
BEGIN
    -- Get current user ID
    v_user_id := auth.uid();
    
    -- Get the request
    SELECT * INTO v_request
    FROM solicitacoes
    WHERE id = request_id;
    
    -- Check if request exists
    IF v_request IS NULL THEN
        RAISE EXCEPTION 'Solicitação não encontrada';
    END IF;
    
    -- Check if request can be cancelled (only pending status)
    IF v_request.status NOT IN ('pendente') THEN
        RAISE EXCEPTION 'Solicitação não pode ser cancelada. Status atual: %', v_request.status;
    END IF;
    
    -- Check ownership:
    -- 1. Authenticated users can cancel their own requests
    -- 2. Guest requests (cliente_id IS NULL) can be cancelled by anyone (no ownership check needed)
    IF v_user_id IS NOT NULL AND v_request.cliente_id IS NOT NULL THEN
        -- Authenticated user trying to cancel someone else's request
        IF v_request.cliente_id != v_user_id THEN
            RAISE EXCEPTION 'Você não tem permissão para cancelar esta solicitação';
        END IF;
    END IF;
    
    -- Update the request status to cancelled
    UPDATE solicitacoes
    SET 
        status = 'cancelado',
        updated_at = NOW()
    WHERE id = request_id;
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

-- Grant execute permission to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION public.cancel_my_solicitacao(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_my_solicitacao(UUID) TO anon;

-- Add comment
COMMENT ON FUNCTION public.cancel_my_solicitacao(UUID) IS 
'Cancela uma solicitação de guincho. Permite que usuários autenticados cancelem suas próprias solicitações e visitantes cancelem solicitações sem cliente_id.';
