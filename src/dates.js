// Date helpers shared by screens and api.js.
export const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const p2 = n => String(n).padStart(2, '0')

export const isoDate = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
export const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
export const nextDays = n => [...Array(n)].map((_, i) => { const d = today(); d.setDate(d.getDate() + i); return d })
export const dayMonth = d => `${d.getDate()} ${MN[d.getMonth()]}`
export const longDay = d => `${DN[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`
export const hhmm = m => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`
