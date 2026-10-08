// Shared navigation shortcuts.
import { S } from '../state.js'
import { render, top0 } from '../ui.js'

export const toAdmin = async () => { S.aview = 'home'; await render(); top0() }
export const goAdmin = async view => { S.tab = 'admin'; S.aview = view; await render(); top0() }
