// Shared navigation shortcuts. Screens opened from Account (the old Admin screen) go back to it.
import { S } from '../state.js'
import { render, top0 } from '../ui.js'

export const toAdmin = async () => { S.aview = 'account'; await render(); top0() }
