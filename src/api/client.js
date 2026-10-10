// The Supabase connection and the signed-in member, shared by every file in src/api/.
import { createClient } from '@supabase/supabase-js'
import { isoDate, today } from '../dates.js'

export const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, detectSessionInUrl: false },
})

export const must = ({ data, error }) => {
  if (error) throw new Error(error.message)
  return data
}
export const todayIso = () => isoDate(today())

export const MEMBER_COLS = 'id, name, gui, hcp_index, admin, hut_staff'
export const toMember = m => ({ id: m.id, name: m.name, gui: m.gui, hcp: Number(m.hcp_index), admin: m.admin, hutStaff: !!m.hut_staff })

let me // cached for the session; undefined = not loaded, null = signed in but not a member
/** The signed-in member, or null if this login isn't on the members list. */
export async function getMe() {
  if (me !== undefined) return me
  const id = must(await sb.rpc('current_member_id'))
  me = id == null ? null : toMember(must(await sb.from('members').select(MEMBER_COLS).eq('id', id).single()))
  return me
}
export const myId = async () => (await getMe())?.id
export const forgetMe = () => { me = undefined }
