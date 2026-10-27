// Names compared the way people type them: accents and case ignored ("ciaran" finds Ciarán, "obrien" finds O'Brien
// when apostrophes are dropped too). Used by every name search.
export const fold = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
