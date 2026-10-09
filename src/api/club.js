import { must, sb } from './client.js'

/* ---------- Club colours ---------- */

/** { main, accent, name }: two hex codes and the club name ('' if not set). Works before signing in. */
export async function getTheme() {
  return must(await sb.rpc('get_theme'))
}

export async function setTheme(main, accent) {
  must(await sb.rpc('admin_set_theme', { p_main: main, p_accent: accent }))
}

/** Admins only. Trimmed; '' clears it. */
export async function setClubName(name) {
  must(await sb.rpc('admin_set_club_name', { p_name: name }))
}
