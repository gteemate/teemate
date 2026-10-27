import { describe, it, expect } from 'vitest'
import { readHandicaps, parseCsv } from './handicap-csv.js'

const members = [
  { id: 1, name: "Ciarán O'Neill", gui: '10831207', hcp: 12.4 },
  { id: 2, name: 'Pat Reid', gui: '', hcp: 14.2 },
  { id: 3, name: 'Una Hayes', gui: '10840001', hcp: -1.5 },
  { id: 4, name: 'Tom Byrne', gui: null, hcp: 20 },
]

describe('reading a handicap file (CSV from the club’s system)', () => {
  it('quoted fields, commas inside quotes, and blank lines', () => {
    expect(parseCsv('a,b\n"x, y",2\n\n')).toEqual([['a', 'b'], ['x, y', '2']])
  })
  it('matches by GUI number first, then by name; shows what changes', () => {
    const r = readHandicaps('Name,GUI Number,Handicap Index\nC O Neill,10831207,11.9\nPat Reid,,14.2\nTom Byrne,,19.6\n', members)
    expect(r.changes).toEqual([{ id: 1, name: "Ciarán O'Neill", from: 12.4, to: 11.9 }, { id: 4, name: 'Tom Byrne', from: 20, to: 19.6 }])
    expect(r.same).toBe(1)
    expect(r.unmatched).toEqual([])
  })
  it('a plus handicap (+1.2) is stored as -1.2', () => {
    const r = readHandicaps('GUI,HI\n10840001,+1.2\n', members)
    expect(r.changes).toEqual([{ id: 3, name: 'Una Hayes', from: -1.5, to: -1.2 }])
  })
  it('first name and surname columns; names match without accents or case', () => {
    const r = readHandicaps('First Name;Surname;Index\nciaran;o\'neill;10.1\n', members)
    expect(r.changes.map(c => c.id)).toEqual([1])
  })
  it('people not found are listed, not guessed', () => {
    const r = readHandicaps('Name,Handicap Index\nSean Nobody,8.0\n', members)
    expect(r.unmatched).toEqual(['Sean Nobody'])
    expect(r.changes).toEqual([])
  })
  it('a handicap that isn’t a number, or out of range, is listed as a problem', () => {
    const r = readHandicaps('Name,Handicap Index\nPat Reid,abc\nTom Byrne,60\n', members)
    expect(r.problems).toEqual(['Pat Reid: “abc” isn’t a handicap index', 'Tom Byrne: “60” isn’t a handicap index'])
  })
  it('no handicap column: says so', () => {
    expect(readHandicaps('Name,Email\nPat Reid,p@x.ie\n', members).error).toBe('Couldn’t find a handicap column. It needs a heading like “Handicap Index”.')
  })
  it('no name or GUI column: says so', () => {
    expect(readHandicaps('Handicap Index\n12\n', members).error).toBe('Couldn’t find a name or GUI number column.')
  })
})
