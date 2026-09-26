// ct-scan-comp — reads a photo of a casino comp flyer / mailer and extracts the offer
// into structured fields so "+ New comp" can prefill. Claude vision; image is not stored.
// Requires the ANTHROPIC_API_KEY secret (same one ct-scan-ticket uses).

import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { requireUser } from '../_shared/user.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createAdminClient();
    const userResult = await requireUser(supabase, req);
    if ('error' in userResult) return json({ ok: false, message: userResult.error }, userResult.status);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ ok: false, message: 'Comp scanning is not configured on the server yet.' }, 500);

    const image = typeof body.image === 'string' ? body.image : '';
    const media_type = ALLOWED_MEDIA.includes(body.media_type) ? body.media_type : 'image/jpeg';
    if (!image) return json({ ok: false, message: 'No image provided.' }, 400);
    const today = typeof body.today === 'string' ? body.today : new Date().toISOString().slice(0, 10);
    const casinos = Array.isArray(body.casinos) ? (body.casinos as unknown[]).filter((c) => typeof c === 'string').slice(0, 40) : [];

    const prompt =
      'This photo shows a casino comp/offer flyer or mailer (e.g. free play, match play, ' +
      'a free buffet or meal, a hotel night, a gift). Extract the single main offer into JSON. ' +
      `Today is ${today}. Resolve any month/day dates to a full YYYY-MM-DD in the nearest sensible ` +
      'year (upcoming, not past, when no year is printed). ' +
      (casinos.length ? `If the casino matches one of these, use that exact spelling: ${casinos.join(', ')}. ` : '') +
      'Reply with ONLY a JSON object, no prose, of this exact shape:\n' +
      '{"title": string (short, e.g. "$50 Free Play"), "casino": string|null, ' +
      '"valid_from": "YYYY-MM-DD"|null, "valid_to": "YYYY-MM-DD"|null, ' +
      '"days_of_week": number[]|null (0=Sunday..6=Saturday, only if the offer is limited to specific weekdays), ' +
      '"single_use": boolean (true if it is a one-time / single-redemption offer), ' +
      '"notes": string|null (brief conditions, tier, or details)}. ' +
      'Use null for anything not stated. If this is not a comp offer, reply {"title": null}.';

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 1024,
        output_config: { effort: 'low' },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: image } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text().catch(() => '');
      console.error('Anthropic error', aiRes.status, detail.slice(0, 300));
      return json({ ok: false, message: 'Comp reader is unavailable right now.' }, 502);
    }

    const data = await aiRes.json();
    if (data.stop_reason === 'refusal') return json({ ok: true, comp: null, raw: 'refusal' });

    const text = (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text).join(' ').trim();

    // Pull the first {...} block and parse it.
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return json({ ok: true, comp: null, raw: text.slice(0, 300) });
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(m[0]); } catch { return json({ ok: true, comp: null, raw: text.slice(0, 300) }); }

    const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    if (!title) return json({ ok: true, comp: null, raw: 'no offer found' });
    const dow = Array.isArray(parsed.days_of_week)
      ? (parsed.days_of_week as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
      : null;

    const comp = {
      title,
      casino: typeof parsed.casino === 'string' ? parsed.casino.trim() : null,
      valid_from: isDate(parsed.valid_from) ? parsed.valid_from : null,
      valid_to: isDate(parsed.valid_to) ? parsed.valid_to : null,
      days_of_week: (dow && dow.length) ? dow : null,
      single_use: parsed.single_use === true,
      notes: typeof parsed.notes === 'string' ? parsed.notes.trim() || null : null,
    };
    return json({ ok: true, comp });
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
