// Sign in with email and password, or create an account the first time (approved emails only).
// Also the screen for a login that isn't on the members list.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, render, passwordInput } from '../ui.js'

const MIN = 8

export function draw() {
  if (S.loginMode === 'request') return drawRequest()
  const create = S.loginMode === 'create'
  header('TeeMate', create ? 'First time? Choose a password' : 'Sign in with your email and password')
  $('main').innerHTML = `<div class="screen"><form class="card evsec" id="login" novalidate>
    <h4>${create ? 'Create account' : 'Sign in'}</h4>
    <label for="email">Email</label><input id="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="${esc(S.loginEmail)}">
    <label for="pw">${create ? 'Choose a password' : 'Password'}</label>${passwordInput('pw', `autocomplete="${create ? 'new-password' : 'current-password'}" ${create ? `placeholder="At least ${MIN} characters"` : ''}`)}
    ${create ? `<label for="pw2">Password again</label>${passwordInput('pw2', 'autocomplete="new-password"')}` : ''}
    ${create && S.loginNotice ? `<p class="hcpnote" style="margin:4px 0 0">${esc(S.loginNotice)}</p>` : ''}
    <p class="gerr" id="err" role="alert"></p>
    <button class="primary" type="submit" id="go">${create ? 'Create account' : 'Sign in'}</button>
    <span class="hint">${create ? 'Your email has to be approved by the club admin first.' : 'Forgotten your password? Ask the club admin to reset your login.'}</span>
    <button type="button" class="linkbtn" id="mode" style="align-self:flex-start">${create ? 'Already have an account? Sign in' : 'First time here? Create your account'}</button>
    <button type="button" class="linkbtn" id="toreq" style="align-self:flex-start">Not approved yet? Request access</button>
  </form></div>`
  setTimeout(() => $(S.loginEmail ? 'pw' : 'email')?.focus(), 30)
  $('mode').onclick = () => { S.loginEmail = $('email').value.trim(); S.loginNotice = ''; S.loginMode = create ? 'signin' : 'create'; render() }
  $('toreq').onclick = () => { pendingPw = null; S.loginEmail = $('email').value.trim(); S.loginMode = 'request'; render() }
  $('login').onsubmit = async e => {
    e.preventDefault()
    const email = $('email').value.trim(), pw = $('pw').value, err = m => ($('err').textContent = m)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Enter your email address.')
    if (!pw) return err('Enter your password.')
    if (create && pw.length < MIN) return err(`Choose a password of at least ${MIN} characters.`)
    if (create && pw !== $('pw2').value) return err("The two passwords don't match.")
    const go = $('go'), label = go.textContent
    go.disabled = true
    go.textContent = create ? 'Creating…' : 'Signing in…'
    try {
      await (create ? api.createAccount(email, pw) : api.signIn(email, pw))
      S.loginEmail = ''
      S.loginNotice = ''
      S.loginMode = 'signin'
      // onAuthChange in main.js redraws once signed in
    } catch (ex) {
      // Not approved yet: offer to leave their name for the admin.
      if (create && /given access/.test(ex.message)) { pendingPw = pw; S.loginEmail = email; S.loginMode = 'request'; render(); return }
      // Approved but never set a password: take them to Create account instead of "wrong password".
      if (!create && /Wrong email or password/.test(ex.message) && (await api.needsAccount(email).catch(() => false))) {
        S.loginEmail = email
        S.loginMode = 'create'
        S.loginNotice = 'This email is approved but hasn’t been set up yet. Choose your password below to create your account.'
        render()
        return
      }
      err(ex.message)
      go.disabled = false
      go.textContent = label
    }
  }
}

// The password typed on "Create account" is kept here (in memory only) if the email turns out not to
// be approved, so the request form can create the account with it: one password, set once.
let pendingPw = null

function drawRequest() {
  const needPw = !pendingPw
  header('TeeMate', 'Ask the club admin for access')
  $('main').innerHTML = `<div class="screen"><form class="card evsec" id="req" novalidate>
    <h4>Request access</h4>
    <span class="hint">${needPw ? 'Leave your name and choose your password.' : 'Your email isn’t approved yet. Leave your name and'} the club admin will see your request. Once you’re approved, just sign in with your email and password.</span>
    <label for="rname">Your name</label><input id="rname" autocomplete="name" placeholder="e.g. Pete Reid">
    <label for="remail">Email</label><input id="remail" type="email" autocomplete="email" inputmode="email" value="${esc(S.loginEmail)}" ${needPw ? '' : 'readonly'}>
    ${needPw ? `<label for="rpw">Choose a password</label>${passwordInput('rpw', `autocomplete="new-password" placeholder="At least ${MIN} characters"`)}
      <label for="rpw2">Password again</label>${passwordInput('rpw2', 'autocomplete="new-password"')}` : ''}
    <p class="gerr" id="err" role="alert"></p>
    <button class="primary" type="submit" id="go">Request access</button>
    <button type="button" class="linkbtn" id="back" style="align-self:flex-start">Back to sign in</button>
  </form></div>`
  setTimeout(() => $('rname')?.focus(), 30)
  $('back').onclick = () => { pendingPw = null; S.loginMode = 'signin'; render() }
  $('req').onsubmit = async e => {
    e.preventDefault()
    const name = $('rname').value.trim(), email = $('remail').value.trim(), err = m => ($('err').textContent = m)
    if (!name) return err('Enter your name.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Enter your email address.')
    const pw = pendingPw ?? $('rpw').value
    if (!pendingPw) {
      if (pw.length < MIN) return err(`Choose a password of at least ${MIN} characters.`)
      if (pw !== $('rpw2').value) return err("The two passwords don't match.")
    }
    $('go').disabled = true
    try {
      await api.requestAccess(email, name)
      // Create the account now with their password. If they already made one while waiting, sign in.
      await api.createAccount(email, pw).catch(async ex => {
        if (/already an account/.test(ex.message)) return api.signIn(email, pw)
        throw ex
      })
    } catch (ex) {
      err(ex.message)
      $('go').disabled = false
      return
    }
    pendingPw = null
    S.loginEmail = ''
    S.loginMode = 'signin'
    // signed in now: the app shows the "waiting for approval" screen
  }
}

/** Signed in but not (yet) a member: waiting for approval, or not on the list. */
export function drawNotMember({ email }) {
  header('TeeMate', '')
  const show = pending => {
    $('main').innerHTML = pending
      ? `<div class="done"><div class="flagmark">⛳</div><h4>Request sent</h4>
          <p>Thanks. Your request is with the club admin.</p>
          <p class="hint">As soon as you’re approved you’ll get straight in. Just open TeeMate, or sign in with <b style="color:var(--ink)">${esc(email)}</b> and the password you chose.</p>
          <div class="gm-btns"><button class="ghost" id="out">Sign out</button><button class="primary" id="again">Check again</button></div></div>`
      : `<div class="done"><div class="flagmark">⛳</div><h4>Not on the list yet</h4>
          <p>You're signed in as <b style="color:var(--ink)">${esc(email)}</b>, but that email isn't on the club's members list.</p>
          <p class="hint">Ask the club admin to approve it.</p>
          <div class="gm-btns"><button class="ghost" id="out">Sign out</button><button class="primary" id="again">Check again</button></div></div>`
    $('out').onclick = () => api.signOut()
    $('again').onclick = () => { api.forgetMe(); render() }
  }
  show(false)
  api.myRequestPending().then(show).catch(() => {})
}

// Change password (from Admin), as a bottom sheet.
export function passwordSheet(onDone) {
  $('modal').innerHTML = `<div class="overlay" id="ovl"><form class="sheet" id="pwform" novalidate aria-labelledby="pwt">
    <h4 id="pwt">Change password</h4>
    <label for="npw">New password</label>${passwordInput('npw', `autocomplete="new-password" placeholder="At least ${MIN} characters"`)}
    <label for="npw2">New password again</label>${passwordInput('npw2', 'autocomplete="new-password"')}
    <p class="gerr" id="pwerr" role="alert"></p>
    <div class="gm-btns"><button type="button" class="ghost" id="pwcancel">Cancel</button><button type="submit" class="primary" id="pwsave">Save password</button></div>
  </form></div>`
  setTimeout(() => $('npw')?.focus(), 30)
  const close = () => { $('modal').innerHTML = ''; onDone(false) }
  $('pwcancel').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  $('pwform').onsubmit = async e => {
    e.preventDefault()
    const pw = $('npw').value, err = m => ($('pwerr').textContent = m)
    if (pw.length < MIN) return err(`Choose a password of at least ${MIN} characters.`)
    if (pw !== $('npw2').value) return err("The two passwords don't match.")
    $('pwsave').disabled = true
    try {
      await api.changePassword(pw)
    } catch (ex) {
      $('pwsave').disabled = false
      return err(ex.message)
    }
    $('modal').innerHTML = ''
    onDone(true)
  }
}
