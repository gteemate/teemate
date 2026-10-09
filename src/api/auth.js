import { forgetMe, must, sb } from './client.js'

/* ---------- Sign-in (email + password; no emails are sent) ---------- */

export async function getSession() {
  return must(await sb.auth.getSession()).session
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (error) {
    throw new Error(/invalid login credentials/i.test(error.message)
      ? 'Wrong email or password. First time here? Create your account instead.'
      : error.message)
  }
}

/** True if this email is approved but its account hasn't been created yet (after a failed sign-in). */
export async function needsAccount(email) {
  return must(await sb.rpc('needs_account', { p_email: email }))
}

/** First sign-in: create a login with a password. Only emails an admin has approved are accepted. */
export async function createAccount(email, password) {
  const { data, error } = await sb.auth.signUp({ email: email.trim().toLowerCase(), password })
  if (error) {
    throw new Error(/already registered|already exists/i.test(error.message)
      ? "There's already an account for that email. Sign in instead, or ask the admin to reset your login."
      : error.message)
  }
  if (!data.session) throw new Error('Account created, but sign-in failed. Try signing in.')
}

/** Is my login waiting for an admin to approve it? */
export async function myRequestPending() {
  return must(await sb.rpc('my_request_pending'))
}

/** Forget the cached member so the next getMe() asks again (e.g. "Check again" after approval). */
export async function changePassword(password) {
  must(await sb.auth.updateUser({ password }))
}

export async function signOut() {
  forgetMe()
  must(await sb.auth.signOut())
}

/** cb(event) on sign-in, sign-out, token refresh. */
export function onAuthChange(cb) {
  let current = null
  sb.auth.onAuthStateChange((event, session) => {
    const id = session?.user.id ?? null
    if (id !== current) forgetMe() // only forget the member when the login actually changes
    current = id
    cb(event, session)
  })
}
