// What the journey list doesn't cover yet: app actions that change something with no journey, database refusals
// with no journey checking them (and no reason they can't happen), and people with no journeys.
const READS = /^(get|my|needs|forget|onAuth|myId|todayIso|hutOrdersToday)/ // data functions that only read

const messagesOf = (j, index) => {
  if (j.refusals?.none) return []
  const all = [...new Set((index.api[j.action]?.rpc ?? []).flatMap(f => index.db[f] ?? []))]
  return Array.isArray(j.refusals) ? j.refusals : all
}

export function gaps(journeys, index, people, alsoUnreachable = {}, notOffered = {}) {
  const changes = Object.keys(index.api).filter(n => !READS.test(n) && (index.api[n].rpc.length || index.api[n].tables.length))
  const covered = new Set(journeys.map(j => j.action))
  const actions = changes.filter(n => !covered.has(n) && !(n in notOffered)) // notOffered: data functions no screen calls, with why
  // Every message a covered action's database functions can give must be a journey's refusal or have a reason.
  const seen = new Set(Object.keys(alsoUnreachable))
  for (const j of journeys) { messagesOf(j, index).forEach(m => seen.add(m)); Object.keys(j.unreachable ?? {}).forEach(m => seen.add(m)) }
  const messages = {}
  for (const n of changes.filter(n => covered.has(n))) {
    if (journeys.some(j => j.action === n && j.refusals?.none)) continue
    for (const f of index.api[n].rpc) {
      const missing = (index.db[f] ?? []).filter(m => !seen.has(m))
      if (missing.length) messages[f] = [...new Set([...(messages[f] ?? []), ...missing])]
    }
  }
  return { actions, messages, people: people.filter(p => !journeys.some(j => j.who === p)) }
}
