// The read-scorecard function's own logic, kept free of Deno so the app's tests can run it: the request sent to
// Claude for the cropped score grids, and the check on what comes back.

export const MODEL = 'claude-opus-5-5'
export const UNREADABLE = 'The card couldn’t be read. Retake the photo or enter the scores by hand.'

const hole = {
  type: 'object', additionalProperties: false, required: ['score', 'sure'],
  properties: { score: { type: ['integer', 'null'] }, sure: { type: 'boolean' } },
}
const total = { type: ['integer', 'null'] }
export const READING_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['parMatches', 'cards'],
  properties: {
    parMatches: { type: 'boolean' },
    cards: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['columns'],
        properties: {
          columns: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false, required: ['label', 'holes', 'out', 'in', 'total'],
              properties: { label: { type: 'string', enum: ['A', 'B'] }, holes: { type: 'array', items: hole }, out: total, in: total, total },
            },
          },
        },
      },
    },
  },
}

/** The Messages request for these cards. images: base64 JPEGs, one per card; pars: the course's 18 pars. */
export function buildRequest({ images, pars }) {
  const text = [
    `${images.length === 1 ? 'This is the score grid' : `These are the score grids of ${images.length} cards`} from a golf club's paper scorecard, cut from a photo.`,
    'Holes 1 to 18 run down the side. Each card has Score columns headed A and B, one per player, with OUT, IN and TOTAL rows.',
    'Read only the Score columns (not yardages, par, stroke index, the marker column or match-play points).',
    'For each card, give its Score columns in order (A, then B). For each column give all 18 holes in order:',
    'the number written as score, or null if the box is blank; sure is false when the handwriting is hard to read.',
    'Give the OUT, IN and TOTAL written on the card for that column (null if blank). Do not add anything up yourself.',
    `This club's pars for holes 1–18 are: ${pars.join(', ')}. Set parMatches to false if the printed par column clearly differs.`,
  ].join('\n')
  return {
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: READING_SCHEMA } },
    fallbacks: 'default',
    messages: [{
      role: 'user',
      content: [...images.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })), { type: 'text', text }],
    }],
  }
}

const isInt = v => Number.isInteger(v)
const nullOrInt = v => v === null || isInt(v)

/** The reading, or an error the member can act on when it isn't the shape asked for. */
export function checkReply(r) {
  const ok = r && typeof r.parMatches === 'boolean' && Array.isArray(r.cards) && r.cards.length > 0
    && r.cards.every(c => Array.isArray(c.columns) && c.columns.length > 0 && c.columns.every(col =>
      ['A', 'B'].includes(col.label) && Array.isArray(col.holes) && col.holes.length === 18
      && col.holes.every(h => nullOrInt(h?.score) && typeof h.sure === 'boolean')
      && nullOrInt(col.out) && nullOrInt(col.in) && nullOrInt(col.total)))
  if (!ok) throw new Error(UNREADABLE)
  return r
}
