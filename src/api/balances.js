/* ---------- Member balances (the club's competition purse and clubhouse account) ---------- */

// The balances live in the club's own system (e.g. Club Systems / ClubV1, shown in HowDidiDo). When the club links it,
// a server function reads them with the club's key and this returns them; until then there's nothing to show, and the
// app says how fees are paid instead. Everything that shows balances (Account, the entry fee line) already calls this.

/** My balances in pence: { competition, clubhouse } (either may be null), or null when the club hasn't linked its system. */
export async function getMyBalances() {
  return null
}
