// Handicaps from a file: the club office exports members' handicap indexes from the club's own system (which has
// Golf Ireland's) and uploads the CSV. Rows match members by GUI number, then by name. Pure, tested in
// handicap-csv.test.js; the upload is in office/members.js.

/** CSV text → rows of fields (quotes, commas inside quotes; ; or tab separated too). Blank lines are skipped. */
export function parseCsv(text) {
  text = String(text).replace(/^\uFEFF/, '').replace(/^sep=.?\r?\n/i, '') // a BOM, and Excel's "sep=;" line
  const first = String(text).split(/\r?\n/, 1)[0]
  const sep = [',', ';', '\t'].reduce((a, b) => (first.split(b).length > first.split(a).length ? b : a))
  const rows = []
  let row = [], f = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++ } else if (c === '"') q = false; else f += c
    } else if (c === '"') q = true
    else if (c === sep) { row.push(f); f = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(f); f = ''
      if (row.some(x => x.trim())) rows.push(row.map(x => x.trim()))
      row = []
    } else f += c
  }
  row.push(f)
  if (row.some(x => x.trim())) rows.push(row.map(x => x.trim()))
  return rows
}

const fold = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
// The first heading that passes the first test that any heading passes (so "Handicap Index" beats "Handicap").
const col = (head, ...tests) => { for (const t of tests) { const i = head.findIndex(h => t.test(h)); if (i >= 0) return i } return -1 }

/**
 * → { changes: [{ id, name, from, to }], same, unmatched: [names], problems: [text] } or { error }.
 * A plus handicap (+1.2) is -1.2, as the app stores it.
 */
export function readHandicaps(text, members) {
  const rows = parseCsv(text)
  if (!rows.length) return { error: 'That file is empty.' }
  const head = rows[0].map(fold)
  const hcp = col(head, /^handicap index$/, /^(hi|whs index|whs handicap index|current handicap index|exact handicap)$/, /^(handicap|hcp)$/) // not Low HI, playing or course handicaps
  if (hcp < 0) return { error: 'Couldn’t find a handicap column. It needs a heading like “Handicap Index”.' }
  const gui = col(head, /^gui/, /golf ireland/, /union number/, /^cdh/)
  const name = col(head, /^(name|full name|member|member name|player)$/)
  const firstN = col(head, /^(first name|forename|first)$/), lastN = col(head, /^(surname|last name|last)$/)
  if (gui < 0 && name < 0 && (firstN < 0 || lastN < 0)) return { error: 'Couldn’t find a name or GUI number column.' }
  const byGui = new Map(members.filter(m => m.gui).map(m => [String(m.gui).replace(/\D/g, ''), m]))
  const byName = new Map()
  for (const m of members) { const k = fold(m.name); byName.set(k, byName.has(k) ? null : m) } // two with the same name: not by name
  const out = { changes: [], same: 0, unmatched: [], problems: [] }, seen = new Map() // member id → their row's label
  for (const r of rows.slice(1)) {
    const who = name >= 0 ? r[name] : [r[firstN], r[lastN]].filter(Boolean).join(' ')
    const g = gui >= 0 ? (r[gui] ?? '').replace(/\D/g, '') : ''
    const named = byName.get(fold(who)) || null // by name only if the GUI numbers don't disagree
    const m = (g && byGui.get(g)) || (named && !(g && named.gui && String(named.gui).replace(/\D/g, '') !== g) ? named : null)
    const label = who || (g ? `GUI ${g}` : 'A row')
    if (!m) { out.unmatched.push(label); continue }
    if (seen.has(m.id)) { seen.set(m.id, 'twice'); continue }
    seen.set(m.id, label)
    const raw = (r[hcp] ?? '').replace(/\s/g, ''), plus = raw.startsWith('+')
    const n = Number(raw.replace(/^\+/, ''))
    if (!/^\+?\d+(\.\d+)?$/.test(raw) || !Number.isFinite(n) || n < 0 || n > 54 || (plus && n > 10)) { out.problems.push(`${label}: “${r[hcp] ?? ''}” isn’t a handicap index`); continue }
    const to = Math.round((plus ? -n : n) * 10) / 10
    if (m.hcp != null && Number(m.hcp) === to) { out.same++; continue }
    out.changes.push({ id: m.id, name: m.name, from: m.hcp == null ? null : Number(m.hcp), to })
  }
  // A member matched by more than one row: neither is used (which one is right isn't ours to guess).
  for (const [id, v] of seen) if (v === 'twice') {
    const m = members.find(x => x.id === id)
    out.changes = out.changes.filter(c => c.id !== id)
    out.problems.push(`${m.name}: in the file more than once, so not changed`)
  }
  return out
}
