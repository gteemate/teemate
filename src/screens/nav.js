// Shared navigation shortcuts. Screens opened from Account or the club office go back the way they came (Account if
// there's nowhere to go back to).
import { S } from '../state.js'
import { goBack, render, top0 } from '../ui.js'

export const toAdmin = () => goBack(async () => { S.aview = 'account'; await render(); top0() })
