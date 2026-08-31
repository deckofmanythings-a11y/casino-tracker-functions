// ct-scan-ticket — reads the cash value off a photo of a casino TITO (ticket-in
// ticket-out) voucher, so the Cash Out screen can prefill the amount.
//
// The client sends a downscaled JPEG (base64). We pass it to Claude's vision API and
// ask for just the printed cash value. The image is NEVER stored — a TITO ticket is a
// bearer instrument, so it's read and discarded. Requires the ANTHROPIC_API_KEY secret.
//
// Raw fetch to /v1/messages (matches how discord-auth calls Discord); no SDK dependency
// in the edge runtime.

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
    if (!apiKey) return json({ ok: false, message: 'Ticket scanning is not configured on the server yet.' }, 500);

    const image = typeof body.image === 'string' ? body.image : '';
    const media_type = ALLOWED_MEDIA.includes(body.media_type) ? body.media_type : 'image/jpeg';
    if (!image) return json({ ok: false, message: 'No image provided.' }, 400);

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
            {
              type: 'text',
              text: 'This photo shows a casino TITO (ticket-in ticket-out) cash-out voucher. ' +
                'Find the printed cash value — the dollar amount the ticket is worth (often the largest ' +
                'dollar figure, and also spelled out in words). Reply with ONLY that number: digits and an ' +
                'optional decimal point, no currency symbol, no commas, no words (e.g. 123.45). If no cash ' +
                'value is clearly legible, reply with exactly NONE.',
            },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text().catch(() => '');
      console.error('Anthropic error', aiRes.status, detail.slice(0, 300));
      return json({ ok: false, message: 'Ticket reader is unavailable right now.' }, 502);
    }

    const data = await aiRes.json();
    if (data.stop_reason === 'refusal') return json({ ok: true, amount: null, raw: 'refusal' });

    const text = (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join(' ')
      .trim();

    const match = text.replace(/[,$\s]/g, '').match(/\d+(?:\.\d{1,2})?/);
    const amount = match ? Number(match[0]) : null;

    return json({ ok: true, amount: Number.isFinite(amount as number) ? amount : null, raw: text });
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
