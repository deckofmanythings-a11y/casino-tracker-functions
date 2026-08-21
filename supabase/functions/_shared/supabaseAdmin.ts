// Service-role Supabase client, shared by every Edge Function. Supports both the
// legacy SUPABASE_SERVICE_ROLE_KEY and the newer SUPABASE_SECRET_KEYS JSON format.
// Copied as-is from raided-hex-functions/supabase/functions/_shared/supabaseAdmin.ts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

export function getServiceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const secretsJson = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretsJson) {
    try {
      const parsed = JSON.parse(secretsJson);
      if (typeof parsed === 'string') return parsed;
      if (parsed.default) return parsed.default;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].api_key || parsed[0].apiKey || parsed[0].key;
      const firstKey = Object.values(parsed)[0];
      if (typeof firstKey === 'string') return firstKey;
    } catch (_e) { /* fall through */ }
  }
  throw new Error('No service role key available.');
}

export function createAdminClient() {
  return createClient(SUPABASE_URL, getServiceKey());
}
