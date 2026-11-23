// ct-scan-bets — reads a slot machine's BET MENU from photos of its denom/bet-select
// screens, so the Bet Table builder can be filled in automatically instead of by hand.
//
// The client (Google Drive mode) sends 1+ downscaled JPEGs (base64), one per denomination
// screen, plus the user's Google ACCESS TOKEN. We don't use a Supabase login here (Drive
// users have none), so this function is deployed with --no-verify-jwt and authenticates the
// caller by verifying the Google token against Google's tokeninfo endpoint:
//   • the token must have been minted for THIS app (aud === our OAuth client id), and
//   • if SCAN_ALLOWED_EMAILS is set, the token's email must be on that list (cost guard).
// Images are passed to Claude vision and then discarded — never stored.
//
// Secrets: ANTHROPIC_API_KEY (required, shared with the other scanners).
// Optional: SCAN_ALLOWED_EMAILS (comma/space separated), GOOGLE_CLIENT_ID (defaults below).

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGES = 12;
// Public OAuth client id (same value lives in the public web app); env can override.
const DEFAULT_CLIENT_ID = '745353300003-h73ergl5l5rvqr3ulp7g3elugd36aq2q.apps.googleusercontent.com';

// Verify a Google access token: returns { email } when the token is for this app (and, when
// an allowlist is configured, on it), else { error } with an HTTP status.
async function verifyGoogle(token: string): Promise<{ email: string } | { error: string; status: number }> {
  if (!token) return { error: 'Sign in with Google first.', status: 401 };
  let info: Record<string, unknown>;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token));
    if (!r.ok) return { error: 'Your Google sign-in has expired — sign in again.', status: 401 };
    info = await r.json();
  } catch {
    return { error: 'Could not verify your Google sign-in.', status: 502 };
  }
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || DEFAULT_CLIENT_ID;
  if (info.aud !== clientId && info.azp !== clientId) return { error: 'Not authorized for this app.', status: 403 };
  const email = String(info.email || '').toLowerCase();
  if (info.email_verified === 'false' || info.email_verified === false) return { error: 'Your Google email is not verified.', status: 403 };
  const allow = (Deno.env.get('SCAN_ALLOWED_EMAILS') || '')
    .split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (allow.length && !allow.includes(email)) return { error: 'This Google account is not allowed to scan machines.', status: 403 };
  return { email };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));

    const auth = await verifyGoogle(typeof body.google_token === 'string' ? body.google_token : '');
    if ('error' in auth) return json({ ok: false, message: auth.error }, auth.status);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ ok: false, message: 'Machine scanning is not configured on the server yet.' }, 500);

    const rawImages = Array.isArray(body.images) ? body.images : [];
    const images = rawImages
      .filter((im: unknown) => im && typeof (im as { data?: unknown }).data === 'string')
      .slice(0, MAX_IMAGES)
      .map((im: { data: string; media_type?: string }) => ({
        data: im.data,
        media_type: ALLOWED_MEDIA.includes(im.media_type || '') ? (im.media_type as string) : 'image/jpeg',
      }));
    if (!images.length) return json({ ok: false, message: 'No photos provided.' }, 400);

    const instruction =
      'Each image is a bet-selection screen from a credit-based slot machine. A screen shows a row of ' +
      'DENOMINATION buttons (e.g. 1¢ 2¢ 5¢ 10¢ $1 $2 $5) with exactly ONE highlighted/selected (usually ' +
      'green), and a row of "PLAY N CREDITS" tiles listing the credit amounts you can bet at that denomination.\n\n' +
      'For EACH image determine:\n' +
      '• the SELECTED denomination (the highlighted button) as an integer number of CENTS (1¢→1, 5¢→5, ' +
      '10¢→10, $1→100, $2→200, $5→500).\n' +
      '• the bet levels: the large CREDITS number on each PLAY tile, as integers, left to right (ignore the ' +
      'small "N PER LINE" sub-text).\n' +
      '• the machine/game name from the title, if visible.\n\n' +
      'Combine all images. If two images show the same selected denomination, merge them and keep the fuller ' +
      'credit list. Reply with STRICT JSON ONLY — no prose, no markdown, no code fences — exactly:\n' +
      '{"machine_name": string|null, "denoms": [{"denom_cents": int, "credits": [int, ...]}]}\n' +
      'Order denoms from smallest cents to largest. Omit any screen you cannot read confidently. If none are ' +
      'legible, reply {"machine_name":null,"denoms":[]}.';

    const content = [
      ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } })),
      { type: 'text', text: instruction },
    ];

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 2048,
        output_config: { effort: 'medium' },
        messages: [{ role: 'user', content }],
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text().catch(() => '');
      console.error('Anthropic error', aiRes.status, detail.slice(0, 300));
      return json({ ok: false, message: 'Machine reader is unavailable right now.' }, 502);
    }

    const data = await aiRes.json();
    if (data.stop_reason === 'refusal') return json({ ok: true, machine_name: null, denoms: [], raw: 'refusal' });

    const text = (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join(' ')
      .trim();

    // Pull the JSON object out of whatever the model returned (defensive against stray prose/fences).
    let parsed: { machine_name?: unknown; denoms?: unknown } = {};
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { /* fall through to empty */ }
    }

    const denoms = (Array.isArray(parsed.denoms) ? parsed.denoms : [])
      .map((d: { denom_cents?: unknown; credits?: unknown }) => ({
        denom_cents: Math.round(Number(d.denom_cents)),
        credits: (Array.isArray(d.credits) ? d.credits : [])
          .map((c: unknown) => Math.round(Number(c)))
          .filter((c: number) => Number.isFinite(c) && c > 0),
      }))
      .filter((d: { denom_cents: number; credits: number[] }) =>
        Number.isFinite(d.denom_cents) && d.denom_cents > 0 && d.credits.length > 0);

    const machine_name = typeof parsed.machine_name === 'string' && parsed.machine_name.trim()
      ? parsed.machine_name.trim() : null;

    return json({ ok: true, machine_name, denoms });
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
