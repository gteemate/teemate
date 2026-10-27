// read-scorecard: reads the cropped score grids of a group's paper cards with Claude and returns the Score columns.
// Signed-in members only; take_paper_read (as the member) refuses while the club has paper scorecards switched off,
// and after 10 reads in a day. The Anthropic key is the ANTHROPIC_API_KEY secret and never reaches phones.
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildRequest, checkReply, UNREADABLE } from './core.js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const anthropic = new Anthropic()

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'Not found' }, 404)

  const auth = req.headers.get('Authorization') ?? ''
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const taken = await sb.rpc('take_paper_read')
  if (taken.error) return reply({ error: taken.error.message }, 400)

  let body: { images?: string[]; pars?: number[]; open?: number[]; players?: number }
  try { body = await req.json() } catch { return reply({ error: UNREADABLE }, 400) }
  const images = (body.images ?? []).slice(0, 2)
  if (!images.length || !Array.isArray(body.pars) || body.pars.length !== 18) return reply({ error: UNREADABLE }, 400)

  try {
    const msg = await anthropic.beta.messages.create({ ...buildRequest({ images, pars: body.pars }), betas: ['server-side-fallback-2026-07-01'] } as never)
    if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') return reply({ error: UNREADABLE }, 400)
    const text = msg.content.find((b: { type: string }) => b.type === 'text') as { text: string } | undefined
    return reply(checkReply(JSON.parse(text?.text ?? 'null')))
  } catch (err) {
    console.error('read-scorecard', err)
    return reply({ error: UNREADABLE }, 400)
  }
})
