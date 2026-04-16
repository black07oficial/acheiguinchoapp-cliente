-- Fix RLS policies for solicitacoes table to allow guest users
-- This enables visitors to create requests without authentication

-- Enable RLS (if not already enabled)
ALTER TABLE solicitacoes ENABLE ROW LEVEL SECURITY;

-- Drop existing insert policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Allow guest inserts" ON solicitacoes;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON solicitacoes;
DROP POLICY IF EXISTS "Enable insert for guests" ON solicitacoes;

-- Create policy to allow anyone (including guests) to insert
-- This is safe because we're only allowing INSERT, not SELECT/UPDATE/DELETE
CREATE POLICY "Enable insert for guests" ON solicitacoes
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Policy for authenticated users to view their own requests
DROP POLICY IF EXISTS "Users can view own requests" ON solicitacoes;
CREATE POLICY "Users can view own requests" ON solicitacoes
    FOR SELECT
    TO authenticated
    USING (
        cliente_id = auth.uid() OR 
        EXISTS (
            SELECT 1 FROM prestadores 
            WHERE prestadores.id = auth.uid() 
            AND solicitacoes.prestador_id = prestadores.id
        )
    );

-- Policy for providers to view assigned requests
DROP POLICY IF EXISTS "Providers can view assigned requests" ON solicitacoes;
CREATE POLICY "Providers can view assigned requests" ON solicitacoes
    FOR SELECT
    TO authenticated
    USING (
        prestador_id = auth.uid() OR
        status = 'pendente'
    );

-- Policy for guests to view their own requests (by request ID)
-- This allows guests to track their request after creation
DROP POLICY IF EXISTS "Guests can view own request by ID" ON solicitacoes;
CREATE POLICY "Guests can view own request by ID" ON solicitacoes
    FOR SELECT
    TO anon
    USING (
        cliente_id IS NULL AND 
        nome_visitante IS NOT NULL AND
        created_at > NOW() - INTERVAL '24 hours'
    );

-- Policy for authenticated users to update their own requests
DROP POLICY IF EXISTS "Users can update own requests" ON solicitacoes;
CREATE POLICY "Users can update own requests" ON solicitacoes
    FOR UPDATE
    TO authenticated
    USING (cliente_id = auth.uid())
    WITH CHECK (cliente_id = auth.uid());

-- Policy for providers to update assigned requests
DROP POLICY IF EXISTS "Providers can update assigned requests" ON solicitacoes;
CREATE POLICY "Providers can update assigned requests" ON solicitacoes
    FOR UPDATE
    TO authenticated
    USING (prestador_id = auth.uid() OR status = 'pendente')
    WITH CHECK (prestador_id = auth.uid() OR status = 'pendente');

-- Add comment explaining the policies
COMMENT ON TABLE solicitacoes IS 'Tabela de solicitações de guincho. RLS permite inserção anônima para visitantes.';
