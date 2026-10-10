// Before the screen-size checks: the test database reset to the scenarios with test sign-ins (as the end-to-end
// tests); afterwards the scenarios again, linked back to the owner's own sign-in. Test database only.
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { E2E, e2eSetup, scenarios, target } from '../../../scripts/db.mjs'

export default async function setup() {
  if (target !== 'test') throw new Error('Screen-size checks only run against the test database.')
  const password = `scr-${randomBytes(9).toString('base64url')}`
  await e2eSetup(password)
  process.env.SCREENS_EMAIL = E2E.gary
  process.env.SCREENS_PASSWORD = password
  return async () => {
    gallery()
    const made = spawnSync(process.execPath, ['scripts/make-seed.mjs'], { encoding: 'utf8' })
    if (made.status !== 0) throw new Error(made.stderr)
    await scenarios()
  }
}

// test-results/screens/index.html: every screen at every size side by side, with what was found on each.
function gallery() {
  const dir = 'test-results/screens'
  if (!existsSync(dir)) return
  const rows = readdirSync(dir).filter(f => /^results-.*\.json$/.test(f)).flatMap(f => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')))
  const sizes = [...new Set(rows.map(r => r.size))], names = [...new Set(rows.map(r => r.name))].sort()
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const notes = r => {
    const bad = [r.sideways, ...r.offEdge.map(x => `off the edge: ${x}`), ...r.tooSmall.map(x => `too small to tap: ${x}`), ...r.covered.map(x => `covered: ${x}`)].filter(Boolean)
    const meh = [...(r.underAlert ?? []).map(x => `under the alert until it's answered: ${x}`), ...r.small.map(x => `small: ${x}`), ...r.cutOff.map(x => `text cut off: ${x}`)]
    return `${bad.map(x => `<li class="bad">${esc(x)}</li>`).join('')}${meh.map(x => `<li>${esc(x)}</li>`).join('')}` || '<li class="ok">✓ all fine</li>'
  }
  writeFileSync(`${dir}/index.html`, `<!doctype html><meta charset="utf-8"><title>TeeMate screens</title>
<style>body{font:14px system-ui;margin:16px;background:#f4f4f4}h2{margin:28px 0 8px}.row{display:flex;gap:16px;overflow-x:auto;align-items:flex-start}
figure{margin:0;background:#fff;padding:8px;border-radius:8px;flex:none}img{display:block;max-height:640px;border:1px solid #ddd}figcaption{font-weight:600;margin:6px 0}
ul{margin:4px 0;padding-left:18px;max-width:330px;font-size:12px}.bad{color:#b00020;font-weight:600}.ok{color:#137333;list-style:none;margin-left:-18px}</style>
<h1>TeeMate: every screen at every size</h1><p>Red: a real problem (off the edge, covered, too small to tap). Black: worth a look (small, under 40px; text cut off).</p>
${names.map(n => `<h2>${esc(n)}</h2><div class="row">${sizes.map(sz => { const r = rows.find(x => x.size === sz && x.name === n); return r ? `<figure><figcaption>${esc(sz)}</figcaption><a href="${r.file}"><img src="${r.file}" loading="lazy"></a><ul>${notes(r)}</ul></figure>` : '' }).join('')}</div>`).join('')}`)
}
