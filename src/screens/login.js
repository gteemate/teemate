// Sign in with an emailed magic link. Also the screen for a login that isn't on the members list.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, render } from '../ui.js'

export function draw() {
  header('TeeMates', S.loginSent ? 'Check your email' : 'Sign in with the email the club has for you')
  if (S.loginSent) {
    $('main').innerHTML = `<div class="done"><div class="flagmark">✉️</div><h4>Link sent</h4>
      <p>We've emailed a sign-in link to<br><b style="color:var(--ink)">${esc(S.loginSent)}</b></p>
      <p class="hint">Open it on this phone or computer, or any other, and you'll be signed in there. It works once and expires after an hour.</p>
      <button class="linkbtn" id="again">Use a different email</button></div>`
    $('again').onclick = () => { S.loginSent = null; render() }
    return
  }
  $('main').innerHTML = `<div class="screen"><form class="card evsec" id="login" novalidate>
    <h4>Sign in</h4>
    <label for="email">Email</label><input id="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required>
    <p class="gerr" id="err" role="alert"></p>
    <button class="primary" type="submit" id="send">Email me a sign-in link</button>
    <span class="hint">No password needed. We'll send you a link that signs you straight in.</span>
  </form></div>`
  setTimeout(() => $('email')?.focus(), 30)
  $('login').onsubmit = async e => {
    e.preventDefault()
    const email = $('email').value.trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $('err').textContent = 'Enter your email address.'; return }
    $('send').disabled = true
    $('send').textContent = 'Sending…'
    try {
      await api.sendMagicLink(email)
      S.loginSent = email
      render()
    } catch (err) {
      $('err').textContent = /rate limit/i.test(err.message) ? 'Too many sign-in emails just now. Please wait a few minutes and try again.' : err.message
      $('send').disabled = false
      $('send').textContent = 'Email me a sign-in link'
    }
  }
}

export function drawNotMember({ email }) {
  header('TeeMates', '')
  $('main').innerHTML = `<div class="done"><div class="flagmark">⛳</div><h4>Not on the list yet</h4>
    <p>You're signed in as <b style="color:var(--ink)">${esc(email)}</b>, but that email isn't on the club's members list.</p>
    <p class="hint">Ask the club secretary to add it, or sign in with the email the club has for you.</p>
    <button class="ghost" id="out">Sign out</button></div>`
  $('out').onclick = () => api.signOut()
}
