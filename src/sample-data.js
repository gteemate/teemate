// Sample data used until Supabase is connected. The database seed uses the same values.

const T = ['black', 'white', 'yellow', 'red']
// [name, par, [black, white, yellow, red], stroke index, green depth (yds)]
const AILSA = [
  ['Ailsa Craig', 4, [441, 402, 369, 312], 6, 31], ['Mak Siccar', 4, [425, 375, 360, 330], 10, 37], ['Blaw Wearie', 4, [496, 390, 382, 374], 4, 33],
  ['Woe-Be-Tide', 3, [194, 189, 179, 143], 16, 28], ['Fin Me Oot', 5, [531, 501, 483, 413], 8, 38], ['Tappie Toorie', 3, [171, 138, 128, 103], 18, 26],
  ["Roon The Ben'", 5, [575, 491, 478, 420], 12, 40], ['Goat Fell', 4, [476, 429, 365, 388], 2, 45], ["Bruce's Castle", 3, [248, 187, 168, 143], 14, 30],
  ['Dinna Fouter', 5, [565, 496, 487, 371], 9, 34], ['Maidens', 3, [215, 178, 146, 115], 15, 28], ['Monument', 4, [468, 388, 383, 356], 3, 34],
  ['Tickly Tap', 4, [409, 380, 344, 331], 13, 43], ['Risk-An-Hope', 5, [568, 498, 487, 409], 11, 33], ["Ca' Canny", 3, [234, 183, 167, 107], 17, 32],
  ['Wee Burn', 4, [479, 420, 381, 375], 1, 33], ['Lang Whang', 4, [509, 449, 387, 350], 5, 34], ['Duel In The Sun', 4, [485, 417, 400, 366], 7, 30],
]

export const COURSE = {
  name: 'Ailsa',
  tees: [
    { key: 'black', name: 'Black', colour: '#111111' },
    { key: 'white', name: 'White', colour: '#ffffff', rating: 72, slope: 130 },
    { key: 'yellow', name: 'Yellow', colour: '#e8c33a' },
    { key: 'red', name: 'Red', colour: '#c8342b' },
  ],
  holes: AILSA.map(([name, par, yds, si, greenDepth], i) => ({
    n: i + 1, name, par, si, greenDepth,
    yards: Object.fromEntries(T.map((t, k) => [t, yds[k]])),
  })),
}

// Today's pins: [yards on from the front, side]
const PINS = [[8, 'L'], [29, 'C'], [26, 'R'], [12, 'C'], [32, 'L'], [6, 'R'], [32, 'C'], [16, 'L'], [24, 'C'], [19, 'R'], [5, 'L'], [30, 'C'], [16, 'R'], [19, 'C'], [9, 'L'], [24, 'R'], [30, 'L'], [13, 'C']]
export const PIN_SHEET = {
  setAt: '06:30',
  setBy: 'Head greenkeeper',
  pins: PINS.map(([yardsOn, side], i) => ({ hole: i + 1, yardsOn, side })),
}

export const ME_ID = 0
export const MEMBERS = [
  { id: 0, name: 'Gary Cochrane', gui: '10844471', hcp: 12.4, committee: true, admin: true },
  { id: 1, name: 'Declan Murphy', gui: '10831207', hcp: 8.2 }, { id: 2, name: 'Aoife Brennan', gui: '10845519', hcp: 15.1 },
  { id: 3, name: "Ciarán O'Neill", gui: '10820933', hcp: 4.6 }, { id: 4, name: 'Siobhán Kelly', gui: '10867741', hcp: 22.0 },
  { id: 5, name: 'Mark Doherty', gui: '10812288', hcp: 10.3 }, { id: 6, name: 'Niall Gallagher', gui: '10839104', hcp: 18.7 },
  { id: 7, name: 'Peter Walsh', gui: '10851162', hcp: 6.9 }, { id: 8, name: 'Róisín McCarthy', gui: '10873350', hcp: 13.5 },
  { id: 9, name: 'Eoin Fitzgerald', gui: '10829876', hcp: 2.1 }, { id: 10, name: 'Tom Byrne', gui: '10841003', hcp: 24.8 },
  { id: 11, name: 'Liam Quinn', gui: '10858417', hcp: 9.9 }, { id: 12, name: 'Orla Ryan', gui: '10866205', hcp: 16.2 },
]
export const BUDDIES = [1, 3, 5, 7, 11]

// Guest points: yearly allowance per member; a guest costs points depending on the course.
export const GUEST_RULES = { allowance: 36, costByCourse: { Ailsa: 3 } }
const g = (date, guest, club) => ({ date: `2026-${date}`, guest, club, course: 'Ailsa', points: 3 })
export const GUEST_HISTORY = {
  0: [g('03-14', 'Paul Hughes', 'Royal Portrush'), g('06-02', 'Sean Byrne', 'Portmarnock'), g('08-19', 'Chris Weir', 'Castlerock')],
  1: [g('04-06', 'Alan Moore', 'Malone'), g('07-09', 'Alan Moore', 'Malone')],
  2: [g('02-01', 'Kate Doyle', 'The Island'), g('03-03', 'Kate Doyle', 'The Island'), g('04-07', 'Lisa Ward', 'Lahinch'), g('05-05', 'Lisa Ward', 'Lahinch'), g('06-02', 'Kate Doyle', 'The Island'), g('07-07', 'Ann Kerr', 'Ardglass'), g('08-04', 'Ann Kerr', 'Ardglass'), g('09-01', 'Lisa Ward', 'Lahinch'), g('09-15', 'Kate Doyle', 'The Island'), g('09-22', 'Ann Kerr', 'Ardglass'), g('09-29', 'Lisa Ward', 'Lahinch'), g('10-06', 'Kate Doyle', 'The Island')],
  5: [g('05-08', 'John Reid', 'Galgorm'), g('06-12', 'John Reid', 'Galgorm'), g('07-17', 'Tom Hall', 'Shandon Park'), g('08-21', 'Tom Hall', 'Shandon Park')],
  7: [g('05-30', 'Ian Bell', 'Royal County Down')],
  11: [g('04-03', 'Rory Kane', 'Ballyliffin'), g('05-01', 'Rory Kane', 'Ballyliffin'), g('06-05', 'Mick Shaw', 'Rosapenna'), g('07-03', 'Mick Shaw', 'Rosapenna'), g('08-07', 'Rory Kane', 'Ballyliffin'), g('09-04', 'Mick Shaw', 'Rosapenna')],
}

// Club game settings: which games are on, allowance overrides, preferred game per group size.
export const GAME_SETTINGS = { settings: {}, pref: { 2: 'sm2', 3: 'six', 4: 'bbl' } }

// My group's round in progress: 11 holes played, as score differences to par.
const DEL = [[1, 0, 1, 1, 1, 0, 0, 1, 1, 0, 2], [0, 1, 0, 0, 1, 0, 1, 0, -1, 1, 0], [0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1], [1, 0, 1, -1, 1, 1, 0, 1, 1, 0, 0]]
export const CURRENT_ROUND = {
  id: 1, players: [0, 1, 3, 5], game: 'bbl', pairing: 0, submitted: {},
  scores: COURSE.holes.map((h, i) => DEL.map(d => h.par + (i < 11 ? d[i] : 0))),
  done: COURSE.holes.map((_, i) => i < 11),
}

// Others out today: [member id, holes played or null if yet to play, tee time]
export const FIELD = [[9, 18], [8, 18], [6, 16], [12, 18], [7, 14], [2, 18], [11, 18], [4, 12], [10, null, '13:20'], [3, null, '13:40']]

export const EVENTS = [{
  id: 1, name: 'Autumn Cup', A: { name: 'Blues', col: '#19335A' }, B: { name: 'Maroons', col: '#762A43' }, active: true, days: 2,
  course: 'Ailsa · White tees', format: 'Better ball · off the low',
  players: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  team: { 0: 'A', 1: 'A', 5: 'A', 7: 'A', 9: 'A', 11: 'A', 2: 'B', 3: 'B', 4: 'B', 6: 'B', 8: 'B', 10: 'B' },
  matches: {
    1: [{ a: [0, 1], b: [3, 2], tee: '12:00', res: { st: 'done', d: 3, txt: '3&2' } }, { a: [5, 7], b: [4, 6], tee: '12:10', res: { st: 'live', d: -1, thru: 12 } }, { a: [9, 11], b: [8, 10], tee: '12:20', res: { st: 'ns' } }],
    2: [{ a: [0, 5], b: [2, 4], tee: '10:00', res: { st: 'ns' } }, { a: [1, 9], b: [3, 8], tee: '10:10', res: { st: 'ns' } }, { a: [7, 11], b: [6, 10], tee: '10:20', res: { st: 'ns' } }],
  },
}]

// Seeded random numbers so the sample tee sheet and field look the same on every load.
export function rng(seed) {
  return () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
}
