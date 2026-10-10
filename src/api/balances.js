import { must, sb } from './client.js'

/* ---------- Member balances (the club's competition purse and clubhouse account) ---------- */

// The balances live in the club's own system (e.g. Club Systems / ClubV1, shown in HowDidiDo). When the club links it,
// a server job copies each member's figures into member_balances (source 'club'); until then a member can have example
// figures (source 'example') to show how it looks. Everything that shows balances (Account, the entry fee line) calls this.

/** My balances in pence: { competition, clubhouse, example } (either amount may be null), or null when there are none. */
export async function getMyBalances() {
  const r = must(await sb.from('member_balances').select('competition_pence, clubhouse_pence, source').maybeSingle())
  return r && { competition: r.competition_pence, clubhouse: r.clubhouse_pence, example: r.source === 'example' }
}
