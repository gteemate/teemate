// Run a journey's steps with the pretend-browser driver (driver.js).
export async function runSteps(app, steps) {
  for (const s of steps) {
    if (typeof s.tap === 'function') await app.tap(s.tap(app.db)) // worked out from the pretend database (ids made at setup)
    else if (s.tap) await app.tap(s.tap)
    else if (s.type) await app.type(...s.type)
    else if (s.pick) { const el = document.querySelector(s.pick[0]); el.value = s.pick[1]; el.dispatchEvent(new Event('change', { bubbles: true })); await app.settle() }
    else if (s.back) await app.back()
  }
}

// A refusal message as the server would fill it in: each % with a name, a competition, a number.
const FILL = ['Jacqueline Cochrane', 'Mixed Fourball', '3']
export const fillMessage = msg => { let i = 0; return msg.replace(/%/g, () => FILL[i++ % FILL.length]) }
