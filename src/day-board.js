// The leaderboard of the day (everyone's scores today) is on for the days of the week the club ticks, unless the
// office switched just today on or off. theme: getTheme()'s { dayBoardDays, dayBoardToday }.
import { fromIso } from './dates.js'

export function dayBoardOn(theme, iso) {
  if (theme?.dayBoardToday?.date === iso) return !!theme.dayBoardToday.on
  return (theme?.dayBoardDays ?? [0, 1, 2, 3, 4, 5, 6]).includes(fromIso(iso).getDay())
}
