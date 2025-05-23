-- File: jsapps/supabase/migrations/20240615103000_create_search_users_function.sql

CREATE OR REPLACE FUNCTION public.search_users(p_search_term TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  avatar_url TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    u.id,
    u.name,
    u.avatar_url
  FROM
    public.users u
  WHERE
    u.id <> auth.uid() AND ( -- Exclude current user
      u.name ILIKE '%' || p_search_term || '%' OR
      u.email ILIKE '%' || p_search_term || '%' -- Also search by email as per instruction
    )
  LIMIT 10; -- Limit results
$$;

-- Set search_path for the function to ensure it uses public schema tables.
-- This is important for SECURITY DEFINER functions.
ALTER FUNCTION public.search_users(TEXT) SET search_path = public;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.search_users(TEXT) TO authenticated;

-- Comments on ownership and privileges:
-- For SECURITY DEFINER, the function executes with the owner's permissions.
-- The user running migrations (typically 'postgres' or the default Supabase admin role)
-- will be the owner. This role must have SELECT on public.users.
-- This is generally the default setup in Supabase.
-- If RLS is enabled on public.users, SECURITY DEFINER functions bypass row-level security
-- for the table they access, unless the table is explicitly specified to be RLS-protected
-- even for the owner (which is not typical for public.users in this context).
-- The `u.id <> auth.uid()` condition is a direct way to filter out the current user.
-- The `search_path = public` is important to ensure that unqualified table names like `users`
-- resolve to `public.users` and not some other table if the default search_path for the
-- function owner is different.
