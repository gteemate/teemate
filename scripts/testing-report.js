// The testing report (npm run testing:pdf): what each feature does, the testing carried out for it and the latest
// results, then the generic tests, then the pre-demo checklist. Pure: the results come in, HTML comes out.

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** The database test output (scripts/db.mjs test) → [{ file, name, ok }]. */
export function parseDbOutput(text) {
  const out = []
  let file = null
  for (const line of text.split('\n')) {
    if (/^\S+\.sql$/.test(line.trim()) && !line.startsWith(' ')) file = line.trim()
    const m = line.match(/^\s+([✓✗])\s+(.*?)(?:\s+→\s+.*)?$/)
    if (m && file) out.push({ file, name: m[2], ok: m[1] === '✓' })
  }
  return out
}

const rel = (name, root) => name.replace(`${root}/`, '')
const label = a => [...a.ancestorTitles, a.title].join(' › ')

/** How a test named in the register did: { passed, failed, failures: [names], notRun? }. */
export function resolveRef(ref, { vitest, db, root }) {
  let picked = []
  const inFile = path => vitest.testResults.filter(f => rel(f.name, root) === path).flatMap(f => f.assertionResults)
  if (ref.startsWith('journey:')) picked = inFile('src/test/journeys/refusals.test.js').filter(a => a.ancestorTitles[0] === ref.slice(8))
  else if (ref.startsWith('rule:')) picked = inFile('src/test/contract/rules.test.js').filter(a => a.ancestorTitles[0] === ref.slice(5))
  else {
    const [path, name] = ref.split(' › ')
    if (path.endsWith('.sql')) {
      const file = path.split('/').pop()
      const rows = db.filter(d => d.file === file && (name == null || d.name.replace(/''/g, "'") === name || d.name.startsWith(name)))
      if (!rows.length) return { passed: 0, failed: 0, failures: [], notRun: true }
      return { passed: rows.filter(r => r.ok).length, failed: rows.filter(r => !r.ok).length, failures: rows.filter(r => !r.ok).map(r => `${file}: ${r.name}`) }
    }
    picked = inFile(path).filter(a => name == null || a.title === name || a.title.startsWith(name) || label(a).includes(name))
  }
  if (!picked.length) return { passed: 0, failed: 0, failures: [], notRun: true }
  const failed = picked.filter(a => a.status === 'failed')
  return { passed: picked.filter(a => a.status === 'passed').length, failed: failed.length, failures: failed.map(label) }
}

const sum = rs => rs.reduce((t, r) => ({ passed: t.passed + r.passed, failed: t.failed + r.failed, failures: [...t.failures, ...r.failures], notRun: t.notRun || !!r.notRun }), { passed: 0, failed: 0, failures: [], notRun: false })
const badge = r => (r.failed ? `<span class="tag bad">${r.failed} failed</span> ` : '') + (r.notRun ? '<span class="tag warn">not run</span> ' : '') + `<span class="tag good">${r.passed} passed</span>`

const CSS = `
@page { size: A4; margin: 14mm 15mm 16mm 15mm; }
:root { --navy:#13213f; --gold:#b8933a; --ink:#1d2433; --muted:#5b6475; --line:#d9dde5; --soft:#f3f5f9; --red:#a33b3b; --amber:#a86b12; --green:#2f7a4b; }
* { box-sizing: border-box; }
body { font: 9.4pt/1.42 -apple-system, "Helvetica Neue", Arial, sans-serif; color: var(--ink); margin: 0; }
h1 { font: 700 21pt/1.1 Georgia, serif; color: var(--navy); margin: 0 0 2mm; }
h2 { font: 700 14pt/1.2 Georgia, serif; color: var(--navy); margin: 7mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 2px solid var(--gold); break-after: avoid; }
h3 { font-size: 10.6pt; color: var(--navy); margin: 0 0 1mm; }
p { margin: 0 0 2mm; }
.sub { color: var(--muted); margin-bottom: 4mm; }
.kicker { font-size: 7.5pt; letter-spacing: .08em; text-transform: uppercase; color: var(--gold); font-weight: 700; }
.stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3mm; margin: 4mm 0; }
.stat { border: 1px solid var(--line); border-radius: 2mm; padding: 2.5mm; text-align: center; }
.stat b { display: block; font: 700 16pt/1 Georgia, serif; color: var(--navy); }
.stat small { color: var(--muted); font-size: 7.6pt; }
.feature { border: 1px solid var(--line); border-radius: 2mm; padding: 3mm 3.5mm; margin-bottom: 3.5mm; break-inside: avoid; }
.feature .what { color: var(--muted); margin-bottom: 2mm; }
table { width: 100%; border-collapse: collapse; font-size: 8.4pt; }
th { text-align: left; background: var(--navy); color: #fff; font-weight: 600; padding: 1.4mm 2mm; }
td { border-bottom: 1px solid var(--line); padding: 1.3mm 2mm; vertical-align: top; }
td.r { white-space: nowrap; text-align: right; width: 34mm; }
.tests { color: var(--muted); font-size: 7.4pt; margin-top: .6mm; }
.tag { display: inline-block; font-size: 7pt; font-weight: 700; padding: .2mm 1.5mm; border-radius: 1mm; color: #fff; }
.good { background: var(--green); } .bad { background: var(--red); } .warn { background: var(--amber); }
.failbox { border: 2px solid var(--red); background: #fbecec; border-radius: 2mm; padding: 3mm; margin: 3mm 0; }
.failbox h3 { color: var(--red); }
.okbox { border: 2px solid var(--green); background: #edf6f0; border-radius: 2mm; padding: 3mm; margin: 3mm 0; }
.login { border: 1px solid var(--line); border-radius: 2mm; padding: 3mm; margin-bottom: 3mm; break-inside: avoid; }
.login ol { margin: 1mm 0 0; padding-left: 5mm; }
.login li { margin-bottom: 1.4mm; }
.box { display: inline-block; width: 3.2mm; height: 3.2mm; border: 1.2px solid var(--navy); border-radius: .6mm; margin-right: 1.5mm; vertical-align: -0.5mm; }
.see { color: var(--green); }
.pb { break-before: page; }
`

/**
 * The report's HTML. features: the register; generic: the generic tests; foundFixed: [{ date, what, test }];
 * screens: { when, sizes, problems } from the last real-browser run, or null.
 */
export function buildReport({ vitest, db, root, features, areas, generic, foundFixed, date, journeys, rules, screens }) {
  const ctx = { vitest, db, root }
  const rows = features.map(f => ({ f, scen: f.scenarios.map(s => ({ s, r: sum(s.tests.map(t => resolveRef(t, ctx))) })) }))
  const gen = generic.map(g => ({ g, r: sum(g.tests.map(t => resolveRef(t, ctx))) }))
  const allVitest = vitest.testResults.flatMap(f => f.assertionResults)
  const vFail = allVitest.filter(a => a.status === 'failed'), dbFail = db.filter(d => !d.ok)
  const failures = [...vFail.map(a => `${label(a)}`), ...dbFail.map(d => `${d.file}: ${d.name}`)]
  const scenarios = rows.reduce((n, x) => n + x.scen.length, 0)

  const featureHtml = f => {
    const x = rows.find(y => y.f === f)
    return `<div class="feature"><div class="kicker">${esc(f.area)}</div><h3>${esc(f.name)}</h3><div class="what">${esc(f.what)}</div>
      <table><tr><th>Tested in this situation</th><th class="r">Result</th></tr>${x.scen.map(({ s, r }) => `<tr><td>${esc(s.says)}<div class="tests">${s.tests.map(t => esc(t.replace(/^journey:/, 'Journey: ').replace(/^rule:/, 'Same rule on both sides: '))).join(' · ')}</div></td><td class="r">${badge(r)}</td></tr>`).join('')}</table></div>`
  }
  const logins = [...new Set(features.flatMap(f => f.demo.map(d => d.who)))]
  const checklist = logins.map(who => `<div class="login"><h3>${esc(who)} <span class="kicker">password: password</span></h3><ol>${features.flatMap(f => f.demo.filter(d => d.who === who).map(d =>
    `<li><span class="box"></span><b>${esc(f.name)}:</b> ${d.steps.map(esc).join(' → ')}${d.see ? ` <span class="see">Expect: ${esc(d.see)}</span>` : ''}</li>`)).join('')}</ol></div>`).join('')

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>TeeMate testing</title><style>${CSS}</style></head><body>
  <div class="kicker">TeeMate · testing before a demo</div>
  <h1>What’s tested, and how it went</h1>
  <p class="sub">Run on ${esc(date)}. Every feature, each situation it’s tested in, and the result of the latest run; then the tests that apply across the whole app; then a checklist to tap through on a phone before a demo.</p>
  <div class="stats">
    <div class="stat"><b>${features.length}</b><small>features</small></div>
    <div class="stat"><b>${scenarios}</b><small>situations tested</small></div>
    <div class="stat"><b>${journeys}</b><small>journeys tapped through</small></div>
    <div class="stat"><b>${allVitest.length.toLocaleString('en-GB')}</b><small>app tests</small></div>
    <div class="stat"><b>${db.length}</b><small>database checks</small></div>
  </div>
  ${failures.length ? `<div class="failbox"><h3>${failures.length} test${failures.length === 1 ? '' : 's'} failed in this run</h3><ul>${failures.slice(0, 40).map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>`
    : `<div class="okbox"><b>Everything passed.</b> ${allVitest.length.toLocaleString('en-GB')} app tests and ${db.length} database checks on the test database.</div>`}
  <p><b>How the testing works.</b> <b>Journeys</b> tap through the real app on a pretend server as each kind of person (member, organiser, captain, club office, halfway hut staff, visitor, new joiner). For every way the server can say no, each journey checks the message is seen, the screen isn’t stuck and nothing is half-saved. <b>Same rules on both sides</b> (${rules} rules) checks the pretend server keeps the real database’s rules. <b>Database checks</b> run on the test database as each person.</p>
  ${screens ? `<p><b>Real phones and iPad sizes</b> (npm run test:screens) last run ${esc(screens.when)}: ${esc(screens.summary)}.</p>` : '<p><b>Real phones and iPad sizes</b> (npm run test:screens): not run yet on this computer. It signs in to the test database with your own login, so it’s run by you.</p>'}

  <h2 class="pb">Part 1 · Feature by feature</h2>
  ${areas.map(a => features.filter(f => f.area === a).map(featureHtml).join('')).join('')}

  <h2 class="pb">Part 2 · Tests across the whole app</h2>
  <table><tr><th>Check</th><th>What it means</th><th class="r">Result</th></tr>${gen.map(({ g, r }) => `<tr><td><b>${esc(g.name)}</b><div class="tests">${esc(g.group)}</div></td><td>${esc(g.says)}</td><td class="r">${badge(r)}</td></tr>`).join('')}</table>
  ${foundFixed.length ? `<h3 style="margin-top:5mm">Found by this testing, and fixed</h3><table><tr><th>When</th><th>What was wrong</th><th>Test that now guards it</th></tr>${foundFixed.map(x => `<tr><td>${esc(x.date)}</td><td>${esc(x.what)}</td><td>${esc(x.test)}</td></tr>`).join('')}</table>` : ''}

  <h2 class="pb">Part 3 · Before a demo: tap through on a phone</h2>
  <p>About 20–30 minutes. Sign in with each demo login (password: <b>password</b>), tick each step, and check you see what’s expected. Do the club office steps on an iPad or computer.</p>
  ${checklist}
  </body></html>`
}
