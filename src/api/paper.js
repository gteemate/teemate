// Paper scorecards: read a photographed card (the read-scorecard function on the server), keep the cropped photos,
// and the confirmation of the uploader's own score (by a player on the card or the club office).
import { must, sb } from './client.js'

const BUCKET = 'scorecards'
const photoPath = (roundId, n) => `${roundId}/${n}.jpg`

async function toBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/**
 * Read the cropped score grids (one per card). pars: the course's 18 pars. → { parMatches, cards: [{ columns: [{ label, holes: [{ score, sure }], out, in, total }] }] }
 */
export async function readScorecard({ images, pars }) {
  const body = { images: await Promise.all(images.map(toBase64)), pars }
  const { data, error } = await sb.functions.invoke('read-scorecard', { body })
  if (error) {
    let msg = null
    try { msg = (await error.context?.json())?.error } catch { /* not JSON */ }
    throw new Error(msg || 'The card couldn’t be read. Retake the photo or enter the scores by hand.')
  }
  return data
}

/** After the scores are saved: this card was read from paper; who confirms my score (a member id, or null for the office). */
export async function markPaperCard(roundId, photos, confirmerId) {
  must(await sb.rpc('mark_paper_card', { p_round: roundId, p_photos: photos, p_confirmer: confirmerId }))
}
export async function confirmPaperScore(roundId) { must(await sb.rpc('confirm_paper_score', { p_round: roundId })) }
export async function sendBackPaperScore(roundId, note) { must(await sb.rpc('send_back_paper_score', { p_round: roundId, p_note: note })) }
export async function resendPaperScore(roundId) { must(await sb.rpc('resend_paper_score', { p_round: roundId })) }

/** Paper scores waiting for me to confirm (and, for the club office, those left for the office). */
export async function getPaperConfirms() {
  return must(await sb.rpc('my_paper_confirms')) ?? []
}

export async function uploadCardPhoto(roundId, n, blob) {
  must(await sb.storage.from(BUCKET).upload(photoPath(roundId, n), blob, { upsert: true, contentType: 'image/jpeg' }))
}
/** A link to a card's photo that works for 10 minutes. */
export async function cardPhotoUrl(roundId, n) {
  return must(await sb.storage.from(BUCKET).createSignedUrl(photoPath(roundId, n), 600)).signedUrl
}
/** Remove a card's photos (before the card itself goes: only players on it may). */
export async function removeCardPhotos(roundId) {
  await sb.storage.from(BUCKET).remove([photoPath(roundId, 1), photoPath(roundId, 2)])
}
