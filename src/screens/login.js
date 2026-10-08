// Signed out: a welcome screen (Sign in / I'm new · Sign up), then one page for each.
// Signing up is name, email and a password, once. An approved email gets straight in; otherwise
// the account is made with an access request and waits, signed in, until an admin approves it.
// Also the screen for a login that isn't on the members list.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, render, passwordInput } from '../ui.js'

const MIN = 8
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function draw() {
  if (S.loginMode === 'signin') return drawSignIn()
  if (S.loginMode === 'signup') return drawSignUp()
  header('', '')
  $('main').innerHTML = `<div class="screen welcome">
    <div class="brand"><div class="logo">⛳</div><h2>TeeMate</h2><p>Tee times, scores and leagues for the club</p></div>
    <button class="primary big" id="to-in">Sign in</button>
    <button class="ghost big" id="to-up">I'm new · Sign up</button>
  </div>`
  $('to-in').onclick = () => go('signin')
  $('to-up').onclick = () => go('signup')
}

const go = mode => { S.loginMode = mode; S.loginNotice = ''; render() }

function drawSignIn() {
  header('Sign in', '', () => go('welcome'))
  $('main').innerHTML = `<div class="screen"><form class="card evsec" id="login" novalidate>
    <label for="email">Email</label><input id="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="${esc(S.loginEmail)}">
    <label for="pw">Password</label>${passwordInput('pw', 'autocomplete="current-password"')}
    <p class="gerr" id="err" role="alert"></p>
    <button class="primary" type="submit" id="go">Sign in</button>
    <span class="hint">Forgotten your password? Ask the club admin to reset your login.</span>
  </form>
  <button type="button" class="linkbtn" id="to-up">New here? Sign up</button></div>`
  setTimeout(() => $(S.loginEmail ? 'pw' : 'email')?.focus(), 30)
  $('to-up').onclick = () => { S.loginEmail = $('email').value.trim(); go('signup') }
  $('login').onsubmit = async e => {
    e.preventDefault()
    const email = $('email').value.trim(), pw = $('pw').value, err = m => ($('err').textContent = m)
    if (!EMAIL.test(email)) return err('Enter your email address.')
    if (!pw) return err('Enter your password.')
    const btn = $('go')
    btn.disabled = true
    btn.textContent = 'Signing in…'
    try {
      await api.signIn(email, pw)
      S.loginEmail = ''
      S.loginMode = 'welcome' // onAuthChange in main.js redraws once signed in
    } catch (ex) {
      // Approved but never set a password: finish signing up instead of "wrong password".
      if (/Wrong email or password/.test(ex.message) && (await api.needsAccount(email).catch(() => false))) {
        S.loginEmail = email
        S.loginMode = 'signup'
        S.loginNotice = 'Your email is approved but not set up yet. Add your name and choose a password to finish.'
        render()
        return
      }
      err(ex.message.replace(' First time here? Create your account instead.', ''))
      btn.disabled = false
      btn.textContent = 'Sign in'
    }
  }
}

function drawSignUp() {
  header('Sign up', '', () => go('welcome'))
  $('main').innerHTML = `<div class="screen"><form class="card evsec" id="signup" novalidate>
    ${S.loginNotice ? `<p class="hcpnote" style="margin:0 0 4px">${esc(S.loginNotice)}</p>` : ''}
    <label for="name">Your name</label><input id="name" autocomplete="name" placeholder="e.g. Pete Reid" value="${esc(S.requestName)}">
    <label for="email">Email</label><input id="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="${esc(S.loginEmail)}">
    <label for="pw">Choose a password</label>${passwordInput('pw', `autocomplete="new-password" placeholder="At least ${MIN} characters"`)}
    <span class="hint">Tap the eye to check it. You'll use it to sign in on other phones.</span>
    <p class="gerr" id="err" role="alert"></p>
    <button class="primary" type="submit" id="go">Sign up</button>
  </form>
  <button type="button" class="linkbtn" id="to-in">Already have an account? Sign in</button></div>`
  setTimeout(() => $('name')?.focus(), 30)
  $('to-in').onclick = () => { S.loginEmail = $('email').value.trim(); go('signin') }
  $('signup').onsubmit = async e => {
    e.preventDefault()
    const name = $('name').value.trim(), email = $('email').value.trim(), pw = $('pw').value, err = m => ($('err').textContent = m)
    if (!name) return err('Enter your name.')
    if (!EMAIL.test(email)) return err('Enter your email address.')
    if (pw.length < MIN) return err(`Choose a password of at least ${MIN} characters.`)
    const btn = $('go')
    btn.disabled = true
    btn.textContent = 'Signing up…'
    try {
      // Already approved: the account is made and they're in. Otherwise leave a request for the
      // admin and make the account with it, so they wait signed in.
      await api.createAccount(email, pw).catch(async ex => {
        if (!/given access/.test(ex.message)) throw ex
        await api.requestAccess(email, name)
        await api.createAccount(email, pw)
      })
      S.loginEmail = ''
      S.requestName = ''
      S.loginNotice = ''
      S.loginMode = 'welcome' // onAuthChange in main.js redraws: the app, or "waiting for approval"
    } catch (ex) {
      err(ex.message)
      btn.disabled = false
      btn.textContent = 'Sign up'
    }
  }
}

/** Signed in but not (yet) a member: waiting for approval (checks by itself), or not on the list. */
let polling = null
export function drawNotMember({ email }) {
  header('', '')
  clearInterval(polling)
  const show = pending => {
    $('main').innerHTML = pending
      ? `<div class="done" id="waiting"><div class="ring" aria-hidden="true"></div><h4>Waiting for approval</h4>
          <p>Thanks. Your request is with the club admin. Keep this open or come back later: TeeMate opens straight in once you're approved.</p>
          <span class="chip live"><span class="dot"></span>Checking automatically</span>
          <button class="linkbtn" id="out" style="margin-top:18px">Wrong email? Start again</button></div>`
      : `<div class="done"><div class="flagmark">⛳</div><h4>Not on the list yet</h4>
          <p>You're signed in as <b style="color:var(--ink)">${esc(email)}</b>, but that email isn't on the club's members list.</p>
          <p class="hint">Ask the club admin to approve it.</p>
          <div class="gm-btns"><button class="ghost" id="out">Sign out</button><button class="primary" id="again">Check again</button></div></div>`
    $('out').onclick = () => { clearInterval(polling); api.signOut() }
    if ($('again')) $('again').onclick = () => { api.forgetMe(); render() }
    if (pending) polling = setInterval(check, 5000)
  }
  const check = async () => {
    if (!$('waiting')) return clearInterval(polling) // moved on
    api.forgetMe()
    const me = await api.getMe().catch(() => null)
    if (!me) return
    clearInterval(polling)
    $('main').innerHTML = `<div class="done"><div class="tickmark">✓</div><h4>You're in!</h4><p>The admin approved you. Opening TeeMate…</p></div>`
    setTimeout(render, 1200)
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
