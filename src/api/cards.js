import { isoDate, today } from '../dates.js'
import { toView, toStored, mergeSaved, disagreements } from '../card-view.js'
import { must, myId, sb, todayIso } from './client.js'
import { getMembers } from './members.js'
import { getGuests } from './tee-times.js'

/* ---------- Rounds and leaderboard ---------- */

// lineup: the card's players in order, each { m: memberId } or { g: guestId }; the first started the card.
// Everyone on a card shares it; each player gets it in their own view (themselves first, see card-view.js).
const ROUND_COLS = 'id, created_by, lineup, slot_id, game, pairing, scores, entered, done, submitted, tee_time, updated_at'
const toCard = r => ({ id: r.id, createdBy: r.created_by, updatedAt: r.updated_at, lineup: r.lineup, slotId: r.slot_id, game: r.game, pairing: r.pairing, scores: r.scores, entered: r.entered, done: r.done, submitted: r.submitted })

/** Today's card I'm on (one I started, or one someone started with me on it), or null. */
export async function getCurrentRound() {
  const meId = await myId()
  const r = must(await sb.from('rounds').select(ROUND_COLS).eq('date', todayIso())
    .contains('lineup', JSON.stringify([{ m: meId }])) // as JSON (an array would be sent as a Postgres array). The starter is always on their own card
    .order('id', { ascending: false }).limit(1).maybeSingle())
  return r && toView(toCard(r), meId)
}

/** One card by id, in my view, or null if it's gone. */
export async function getRound(id) {
  const r = must(await sb.from('rounds').select(ROUND_COLS).eq('id', id).maybeSingle())
  return r && toView(toCard(r), await myId())
}

/** Delete a scorecard I started. */
export async function deleteRound(id) {
  must(await sb.from('rounds').delete().eq('id', id))
}

const toRow = c => ({ lineup: c.lineup, slot_id: c.slotId ?? null, game: c.game, pairing: c.pairing, scores: c.scores, entered: c.entered ?? null, done: c.done, submitted: c.submitted })

/** Make my unsaved copy into the group's card (both in my view), carrying across the scores I typed, matched by player. */
function moveTyping(round, card) {
  const key = e => (e.m != null ? `m${e.m}` : `g${e.g}`)
  const at = new Map(card.lineup.map((e, k) => [key(e), k]))
  const changed = new Set()
  for (const c of round.changed ?? []) {
    const [i, k] = c.split(':').map(Number), to = at.get(key(round.lineup[k]))
    if (to == null) continue // not on the group's card
    card.scores[i][to] = round.scores[i][k]
    ;(card.entered ??= card.scores.map(row => row.map(() => null)))[i][to] = round.entered?.[i]?.[k] ?? null
    changed.add(`${i}:${to}`)
  }
  card.done = card.done.map((d, i) => d || !!round.done[i])
  Object.assign(round, card, { changed, checks: round.checks ?? [] })
}

/**
 * Insert or update a scorecard (in my view). A new round gets its id set.
 * round.changed: the "hole:player" scores I've typed in since loading (in my view). Only those can
 * replace what's saved, and not when the saved one is more trustworthy (see mergeSaved), so a par I
 * never touched can't overwrite someone's real score. My copy ends up as what was saved.
 * Where someone else typed a different score for the same player, it's added to round.checks
 * ({ i, k, mine, theirs, by, kept } in my view) so the app can ask for a second look.
 * The write only goes through if nobody has saved since I read the card (the database stamps
 * updated_at on every save); if someone has, read and merge again, so phones saving at the same
 * moment on the green can't wipe each other's scores. 6 tries: a four-ball all saving at once needs 4.
 */
export async function saveRound(round) {
  // A new card for a tee time: if someone in the group has already started today's card, it's that one
  // (what I typed moves across to it), so a group never ends up split over two cards.
  if (!round.id && round.slotId != null) {
    const r = must(await sb.rpc('start_tee_time_card', { p_card: toRow(toStored(round)) }))
    if (!r.joined) {
      Object.assign(round, { id: r.id, createdBy: await myId(), updatedAt: r.updated_at, changed: new Set() })
      return
    }
    const theirs = await getRound(r.id)
    if (!theirs) throw new Error('This card has been deleted by someone in your group.')
    moveTyping(round, theirs)
  }
  const mine = toStored(round)
  let card = mine
  const changed = new Set([...(round.changed ?? [])].map(c => { const [i, v] = c.split(':'); return `${i}:${round.perm ? round.perm[v] : v}` }))
  if (round.id) {
    for (let tries = 1; ; tries++) {
      const cur = must(await sb.from('rounds').select('lineup, scores, entered, done, submitted, updated_at').eq('id', round.id).maybeSingle())
      if (!cur) throw new Error('This card has been deleted by someone in your group.')
      let checks = []
      card = mine
      if (JSON.stringify(cur.lineup) === JSON.stringify(mine.lineup)) {
        const inv = round.perm ? round.perm.reduce((a, s, v) => ((a[s] = v), a), []) : null
        checks = disagreements(mine, cur, changed).map(d => ({ ...d, k: inv ? inv[d.k] : d.k }))
        card = mergeSaved(mine, cur, changed)
      }
      const saved = must(await sb.from('rounds').update(toRow(card)).eq('id', round.id)
        .eq('updated_at', cur.updated_at) // only if nobody has saved since I read it
        .select('updated_at').maybeSingle())
      if (saved) { round.updatedAt = saved.updated_at; round.checks = [...(round.checks ?? []), ...checks]; break }
      if (tries === 6) throw new Error('Your group is saving at the same time. Tap save again.')
    }
  } else {
    const r = must(await sb.from('rounds').insert({ ...toRow(card), date: todayIso() }).select('id, created_by, updated_at').single())
    Object.assign(round, { id: r.id, createdBy: r.created_by, updatedAt: r.updated_at })
  }
  const v = round.perm ? toView(card, round.lineup[0].m) : card
  Object.assign(round, { scores: v.scores, entered: v.entered, done: v.done, submitted: v.submitted, changed: new Set() })
}

/**
 * Everyone's round today: [{ member, gross: [...completed holes], teeTime?, live }]. My group comes first.
 * Guests appear as member-like entries { id: 'g<id>', name, hcp, guest: true } (hcp 0 until it's set).
 */
export async function getTodayRounds(date = today()) {
  const [rounds, members, meId] = await Promise.all([
    sb.from('rounds').select(ROUND_COLS).eq('date', isoDate(date)).order('id').then(must),
    getMembers(),
    myId(),
  ])
  const guests = await getGuests([...new Set(rounds.flatMap(r => r.lineup.filter(e => e.g != null).map(e => e.g)))])
  const byKey = new Map([
    ...members.map(m => [`m${m.id}`, m]),
    ...guests.map(g => [`g${g.id}`, { id: `g${g.id}`, name: g.name, hcp: g.hcp ?? 0, guest: true }]),
  ])
  rounds.sort((a, b) => (b.created_by === meId) - (a.created_by === meId))
  const seen = new Set(), out = []
  for (const r of rounds) {
    let played = r.done.findIndex(d => !d)
    if (played === -1) played = r.done.length
    r.lineup.forEach((e, k) => {
      const key = e.m != null ? `m${e.m}` : `g${e.g}`
      if (seen.has(key) || !byKey.has(key)) return
      seen.add(key)
      out.push({ member: byKey.get(key), gross: r.scores.slice(0, played).map(s => s[k]), teeTime: r.tee_time ?? undefined, live: true })
    })
  }
  return out
}

/** Each group's scorecard for an event day, by tee time: { [slotId]: round } (cards started from that tee time). */
export async function getCardsForTeeTimes(date, slotIds) {
  const rows = must(await sb.from('rounds').select(ROUND_COLS).eq('date', date).in('slot_id', slotIds).order('updated_at'))
  return Object.fromEntries(rows.map(r => [r.slot_id, toCard(r)])) // latest card per tee time wins
}
