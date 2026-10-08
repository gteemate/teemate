// Sign in with email and password, or create an account the first time (approved emails only).
// Also the screen for a login that isn't on the members list.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, render } from '../ui.js'

const MIN = 8

export function draw() {
  const create = S.loginMode === 'create'
  header('TeeMates', create ? 'First time? Choose a password' : 'Sign in with your email and password')
  $('main').innerHTML = `<div class="screen"><form class="card evsec" id="login" novalidate>
    <h4>${create ? 'Create account' : 'Sign in'}</h4>
    <label for="email">Email</label><input id="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="${esc(S.loginEmail)}">
    <label for="pw">${create ? 'Choose a password' : 'Password'}</label><input id="pw" type="password" autocomplete="${create ? 'new-password' : 'current-password'}" ${create ? `placeholder="At least ${MIN} characters"` : ''}>
    ${create ? '<label for="pw2">Password again</label><input id="pw2" type="password" autocomplete="new-password">' : ''}
    <p class="gerr" id="err" role="alert"></p>
    <button class="primary" type="submit" id="go">${create ? 'Create account' : 'Sign in'}</button>
    <span class="hint">${create ? 'Your email has to be approved by the club admin first.' : 'Forgotten your password? Ask the club admin to reset your login.'}</span>
    <button type="button" class="linkbtn" id="mode" style="align-self:flex-start">${create ? 'Already have an account? Sign in' : 'First time here? Create your account'}</button>
  </form></div>`
  setTimeout(() => $(S.loginEmail ? 'pw' : 'email')?.focus(), 30)
  $('mode').onclick = () => { S.loginEmail = $('email').value.trim(); S.loginMode = create ? 'signin' : 'create'; render() }
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
      S.loginMode = 'signin'
      // onAuthChange in main.js redraws once signed in
    } catch (ex) {
      err(ex.message)
      go.disabled = false
      go.textContent = label
    }
  }
}

export function drawNotMember({ email }) {
  header('TeeMates', '')
  $('main').innerHTML = `<div class="done"><div class="flagmark">⛳</div><h4>Not on the list yet</h4>
    <p>You're signed in as <b style="color:var(--ink)">${esc(email)}</b>, but that email isn't on the club's members list.</p>
    <p class="hint">Ask the club admin to approve it.</p>
    <button class="ghost" id="out">Sign out</button></div>`
  $('out').onclick = () => api.signOut()
}

// Change password (from Admin), as a bottom sheet.
export function passwordSheet(onDone) {
  $('modal').innerHTML = `<div class="overlay" id="ovl"><form class="sheet" id="pwform" novalidate aria-labelledby="pwt">
    <h4 id="pwt">Change password</h4>
    <label for="npw">New password</label><input id="npw" type="password" autocomplete="new-password" placeholder="At least ${MIN} characters">
    <label for="npw2">New password again</label><input id="npw2" type="password" autocomplete="new-password">
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
