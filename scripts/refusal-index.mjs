// The refusal index (src/test/journeys/refusal-index.json): every way the database can say no to each app action.
//   db:  { [function]: [messages] } — the latest definition of each public function in supabase/migrations, with the
//        `raise exception` messages it (and any public function it calls) can give. '' is unescaped; % stays.
//   api: { [action]: { rpc: [functions], tables: [tables written directly] } } — from src/api/*.js.
// npm run journeys:index rewrites it; a test checks it's up to date.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export function buildIndex() {
  // Latest definition of each function (migrations run in name order; a later one replaces an earlier).
  const defs = {}
  const dir = join(root, 'supabase/migrations')
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, f), 'utf8')
    for (const m of sql.matchAll(/create (?:or replace )?function public\.(\w+)\s*\(([\s\S]*?)(?=\n(?:create|revoke|grant|alter|drop|insert|update|comment|select|do) |$)/gi)) defs[m[1]] = m[0]
  }
  const own = Object.fromEntries(Object.entries(defs).map(([fn, body]) => [fn,
    [...new Set([...body.matchAll(/raise exception '((?:[^']|'')*)'/g)].map(x => x[1].replace(/''/g, "'")))]]))
  const calls = Object.fromEntries(Object.entries(defs).map(([fn, body]) => [fn,
    [...new Set([...body.matchAll(/public\.(\w+)\s*\(/g)].map(x => x[1]).filter(x => x !== fn && defs[x]))]]))
  // A function's refusals include those of the functions it calls (e.g. a booking checking guest points).
  const all = fn => { const seen = new Set(), out = new Set(); const walk = f => { if (seen.has(f)) return; seen.add(f); own[f]?.forEach(m => out.add(m)); calls[f]?.forEach(walk) }; walk(fn); return [...out] }
  const db = Object.fromEntries(Object.keys(defs).sort().map(fn => [fn, all(fn)]))

  // Each exported data function's calls to the database.
  const api = {}
  const apiDir = join(root, 'src/api')
  for (const f of readdirSync(apiDir).filter(f => f.endsWith('.js') && !f.startsWith('cache') && !f.includes('.test.') && f !== 'all.js').sort()) {
    const src = readFileSync(join(apiDir, f), 'utf8')
    const starts = [...src.matchAll(/^export (?:async )?function (\w+)|^export const (\w+) = /gm)]
    starts.forEach((m, i) => {
      const body = src.slice(m.index, starts[i + 1]?.index ?? src.length)
      api[m[1] ?? m[2]] = {
        rpc: [...new Set([...body.matchAll(/\.rpc\('(\w+)'/g)].map(x => x[1]))],
        tables: [...new Set([...body.matchAll(/\.from\('(\w+)'\)\s*\.(?:insert|update|delete|upsert)\(/g)].map(x => x[1]))],
      }
    })
  }
  return { db, api: Object.fromEntries(Object.entries(api).sort()) }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = join(root, 'src/test/journeys/refusal-index.json')
  writeFileSync(out, JSON.stringify(buildIndex(), null, 1) + '\n')
  console.log(`Wrote ${out}`)
}
