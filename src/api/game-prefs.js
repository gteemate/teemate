import { must, myId, sb } from './client.js'

/* ---------- Games ---------- */

/** Club game settings plus my own preferred game per group size: { settings, pref (club), mine }. */
export async function getGameSettings() {
  const [rows, prefs, mine] = await Promise.all([
    sb.from('game_settings').select('game_key, enabled, allowance_pct').then(must),
    sb.from('game_prefs').select('group_size, game_key').then(must),
    sb.from('member_game_prefs').select('group_size, game_key').then(must),
  ])
  const settings = {}
  for (const r of rows) settings[r.game_key] = { on: r.enabled, ...(r.allowance_pct == null ? {} : { pct: r.allowance_pct }) }
  const byGroup = list => Object.fromEntries(list.map(p => [p.group_size, p.game_key]))
  return { settings, pref: byGroup(prefs), mine: byGroup(mine) }
}

/** Save my preferred game for 2-, 3- or 4-ball cards. */
export async function setMyGamePref(groupSize, k) {
  must(await sb.from('member_game_prefs').upsert({ member_id: await myId(), group_size: groupSize, game_key: k }))
}
