import { must, sb } from './client.js'

/* ---------- Club colours ---------- */

/** { main, accent } hex codes. Works before signing in. */
export async function getTheme() {
  return must(await sb.rpc('get_theme'))
}

export async function setTheme(main, accent) {
  must(await sb.rpc('admin_set_theme', { p_main: main, p_accent: accent }))
}
