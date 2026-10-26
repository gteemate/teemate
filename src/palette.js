// Team colours: only ones that show up clearly on the app's navy background. Colours saved before (or chosen by a
// free picker) are shown as the palette colour nearest in hue; greys and near-whites become Silver.
export const PALETTE = [
  { name: 'Red', hex: '#E5484D' }, { name: 'Orange', hex: '#F2994A' }, { name: 'Gold', hex: '#E8C547' }, { name: 'Green', hex: '#46C37B' },
  { name: 'Teal', hex: '#2FC4C4' }, { name: 'Sky', hex: '#6CB6FF' }, { name: 'Pink', hex: '#F06FA8' }, { name: 'Lilac', hex: '#B79CFF' },
  { name: 'Silver', hex: '#C9CED6' }, { name: 'White', hex: '#F4F4F2' },
]
const SKY = '#6CB6FF', SILVER = '#C9CED6'
// The app's old defaults (Blues and Reds; league teams), so existing teams keep a sensible look.
const OLD = { '#19335A': SKY, '#762A43': '#E5484D', '#0B6E4F': '#46C37B', '#C9A227': '#E8C547', '#5B3E96': '#B79CFF', '#D2691E': '#F2994A',
  '#2A7AB0': '#2FC4C4', '#8B1E3F': '#F06FA8', '#3D7A2E': '#F4F4F2', '#555B6E': SILVER, '#B5446E': '#F06FA8', '#1F8A8A': '#2FC4C4' }

const hsl = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  if (!d) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s, l }
}
const COLOURED = PALETTE.filter(p => hsl(p.hex).s > 0.3)

/** The colour to show for a team: itself if it's in the palette, else the nearest palette colour. */
export function visible(col) {
  if (typeof col !== 'string' || !/^#[0-9a-f]{6}$/i.test(col)) return SKY
  const hex = col.toUpperCase()
  if (PALETTE.some(p => p.hex === hex)) return hex
  if (OLD[hex]) return OLD[hex]
  const { h, s } = hsl(hex)
  if (s < 0.15) return SILVER
  const gap = p => { const d = Math.abs(hsl(p.hex).h - h); return Math.min(d, 360 - d) }
  return COLOURED.reduce((best, p) => (gap(p) < gap(best) ? p : best)).hex
}
