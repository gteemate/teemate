// The camera, reading a QR code: a full-screen view with a frame to aim at. jsQR reads the frames (the phone camera
// can't read a code inside a web page on iPhone by itself). Tests replace this module (vi.mock), so it stays thin.
import jsQR from 'jsqr'

export const NO_CAMERA = 'Can’t use the camera: find the member by name instead'

/** Opens the scanner. onText(text) once, when a code reads; onError(message) if the camera can't be used.
 *  → { stop() }: closes it and stops the camera (also done after a read, or Cancel). */
export function openScanner({ onText, onError }) {
  const box = document.createElement('div')
  box.className = 'scanov'
  box.setAttribute('role', 'dialog')
  box.setAttribute('aria-label', 'Scan a member’s card')
  box.innerHTML = `<video playsinline muted></video><div class="scanframe" aria-hidden="true"></div>
    <p class="scanhint">Point the camera at the QR code on the member’s Account card</p>
    <button type="button" class="ghost scanx">Cancel</button>`
  document.body.appendChild(box)
  const video = box.querySelector('video'), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true })
  let stream = null, timer = null, done = false
  const stop = () => {
    done = true
    clearTimeout(timer)
    stream?.getTracks().forEach(t => t.stop())
    box.remove()
  }
  box.querySelector('.scanx').onclick = stop
  const look = () => {
    if (done) return
    if (video.readyState >= 2 && video.videoWidth) {
      const w = Math.min(640, video.videoWidth), h = Math.round(video.videoHeight * (w / video.videoWidth))
      canvas.width = w; canvas.height = h
      ctx.drawImage(video, 0, 0, w, h)
      const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })
      if (code?.data) { stop(); onText(code.data); return }
    }
    timer = setTimeout(look, 200)
  }
  navigator.mediaDevices?.getUserMedia?.({ video: { facingMode: 'environment' }, audio: false })
    .then(s => {
      if (done) { s.getTracks().forEach(t => t.stop()); return }
      stream = s; video.srcObject = s
      return video.play().then(look)
    })
    .catch(() => { stop(); onError(NO_CAMERA) })
    ?? (stop(), onError(NO_CAMERA)) // no camera at all (or not https)
  return { stop }
}
