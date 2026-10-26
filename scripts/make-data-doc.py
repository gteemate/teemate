# Builds docs/teemate-data.html: every table, its columns, links and one example row (from the test database).
import json, sys, html, re
S = sys.argv[1]
cols = {r['table_name']: r['cols'] for r in json.load(open(f'{S}/cols.json'))}
rows = {r['t']: r['r'] for r in json.load(open(f'{S}/rows.json'))}
fks = json.load(open(f'{S}/fks.json'))
links = {}
for f in fks: links.setdefault(f['t'], {}).setdefault(f['c'], set()).add(f['rt'])

T0 = '2026-10-10T21:34:19+00:00'
ILLUSTRATIVE = {
  'event_entries': {'event_id': 3, 'day': 1, 'member_id': 0, 'round_id': 41, 'created_at': T0, 'marker': {'m': 11}},
  'league_entries': {'event_id': 5, 'week': 2, 'member_id': 3, 'round_id': 44, 'created_at': T0, 'marker': {'m': 5}},
  'friend_contacts': {'id': 1, 'owner': 0, 'name': 'Tom Kelly', 'club': 'Royal Portrush', 'hcp': '8.2', 'gui': '10023456', 'shared_on': '2026-09-20', 'favourite': True, 'updated_at': T0},
  'game_settings': {'game_key': 'bbl', 'enabled': True, 'allowance_pct': 90},
  'member_favourites': {'member_id': 0, 'fav_id': 11},
  'member_game_prefs': {'member_id': 0, 'group_size': 4, 'game_key': 'bbl'},
  'player_events': {'id': 12, 'date': '2026-10-11', 'created_by': 0, 'style': 'singles', 'format': 'kos', 'team_names': {'A': 'Gary Cochrane', 'B': 'Declan Murphy'},
     'players': [{'id': 101, 'name': 'Gary Cochrane', 'memberId': 0, 'guest': False, 'slot': 58, 'team': 'A'}, {'id': 117, 'name': 'Declan Murphy', 'memberId': 1, 'guest': False, 'slot': 59, 'team': 'B'}],
     'status': 'accepted', 'created_at': T0, 'cancel_note': None, 'cancelled_at': None, 'cancelled_by': None, 'proposer_slot': 58, 'proposed_by': 0},
  'player_event_groups': {'event_id': 12, 'slot_id': 59, 'host': False, 'answer': 'accepted', 'answered_by': 1, 'answered_at': T0},
}
# A fuller scorecard than the test data's: a four-ball, three holes in (shortened to 4 holes here).
ILLUSTRATIVE['rounds'] = {'id': 41, 'date': '2026-10-11', 'created_by': 0, 'game': 'bbl', 'pairing': 0,
  'scores': [[5, 4, 4, 6], [4, 5, 3, 4], [3, 3, 4, 3], ['…']], 'done': [True, True, True, False, '…'], 'submitted': {}, 'tee_time': '09:30',
  'updated_at': T0, 'lineup': [{'m': 0}, {'m': 1}, {'m': 3}, {'g': 117}], 'slot_id': 58, 'entered': [[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1], ['…']]}
for t, r in ILLUSTRATIVE.items(): rows[t] = (r, True)
for t in rows:
    if not isinstance(rows[t], tuple): rows[t] = (rows[t], False)
# Personal details: keep the made-up club members, mask anything real.
m, _ = rows['members']; m = dict(m); m['email'] = 'gary.cochrane@example.com'; m['gui'] = '10000123'; m['user_id'] = 'ab41…13f5'; rows['members'] = (m, False)

GROUPS = [
  ('Members and the club', 'Who belongs to the club, who they play with, the club’s own settings and money.',
   ['members', 'access_requests', 'buddies', 'member_favourites', 'friend_contacts', 'member_balances', 'club_settings']),
  ('The course', 'The course itself: holes, tees and today’s pin positions.', ['courses', 'tees', 'holes', 'pin_sheets']),
  ('Tee times and bookings', 'The tee sheet: every 10-minute slot, who booked it, who is playing, guests and requests.',
   ['tee_slots', 'bookings', 'booking_players', 'tee_time_requests', 'booking_notices', 'guest_visits']),
  ('Scorecards and games', 'Shared scorecards and which games the club offers and members prefer.', ['rounds', 'game_settings', 'game_prefs', 'member_game_prefs']),
  ('Matches between groups', 'Challenges from one group (or player) to another on the day.', ['player_events', 'player_event_groups']),
  ('Competitions, leagues and knockouts', 'Events and leagues (scored from cards), sign-up competitions and the knockout draw.',
   ['events', 'event_entries', 'league_entries', 'signup_comps', 'signup_entries', 'signup_declines', 'ko_matches']),
  ('Halfway hut', 'Food and drink ordered from the course.', ['hut_menu', 'hut_orders']),
]
assert sorted(t for g in GROUPS for t in g[2]) == sorted(cols), set(cols) ^ {t for g in GROUPS for t in g[2]}

PURPOSE = {
  'members': 'One row per club member: name, handicap, Golf Ireland number (GUI), login, and what they’re allowed to do (committee, office, hut staff).',
  'access_requests': 'Someone asking to join TeeMate who isn’t matched to a member yet. The committee approves them.',
  'buddies': 'A member’s friends list (other members), with a favourite flag for quick picking when booking.',
  'member_favourites': 'Members starred as favourites, shown first when picking playing partners.',
  'friend_contacts': 'Friends from other clubs, saved from a shared QR card or link: name, club, handicap.',
  'member_balances': 'Each member’s money: competition purse and clubhouse/bar balance. Today example figures; later fed by Club Systems or HowDidiDo.',
  'club_settings': 'One row for the whole club: name, colours, guest allowance, when the tee sheet opens (8pm, 8 days ahead), hut on/off, how entry fees are paid.',
  'courses': 'Each course at the club and how many guest points a guest round costs on it.',
  'tees': 'The tees on each course with their colour, course rating and slope (used to turn a handicap index into strokes).',
  'holes': 'Every hole: par, stroke index, yards from each tee, and green size for the course guide.',
  'pin_sheets': 'The day’s pin positions, set by the greenkeeper, one row per course per day.',
  'tee_slots': 'The tee sheet: one row per 10-minute tee time per day, how many it holds and whether it’s twilight.',
  'bookings': 'A booking made by one member for a tee time (they may bring others).',
  'booking_players': 'Each person in a booking: a member, or a guest with name, club and handicap.',
  'tee_time_requests': 'A request for a tee time that needs committee approval (e.g. before the sheet opens), with the answer.',
  'booking_notices': 'A message to a member when the office moves or cancels their booking. Shown once, then marked seen.',
  'guest_visits': 'Each time a member brings a guest, for the yearly guest-points allowance.',
  'rounds': 'A shared scorecard for a group: who’s on it, the game, every score, which holes are saved and who entered each score.',
  'game_settings': 'Which games the club allows and their handicap allowance (e.g. better ball at 90%).',
  'game_prefs': 'The club’s default game for each group size (2, 3 or 4 players).',
  'member_game_prefs': 'A member’s own preferred game for each group size (Game preferences in Account).',
  'player_events': 'A challenge between groups (four-ball v four-ball, four-ball team match play, own teams) or one against one, with the players snapshotted when sent.',
  'player_event_groups': 'Each tee time in a challenge, whether it’s the host, and its answer (accepted / declined).',
  'events': 'Club and member events and leagues: style, format, days, players and teams, and for leagues the weeks and knockout finish.',
  'event_entries': 'A scorecard counted for an event day, with who marked it.',
  'league_entries': 'A scorecard counted for a league week, with who marked it.',
  'signup_comps': 'Competitions members enter in advance: singles, pairs and knockouts, closing date, entry fee, draw.',
  'signup_entries': 'A member’s entry (with partner for pairs).',
  'signup_declines': 'A member saying “No thanks” to a competition, so they aren’t asked again.',
  'ko_matches': 'Each knockout match in the draw: round, the two entries, the winner and result (e.g. 4&3), and the linked scorecard.',
  'hut_menu': 'The halfway hut menu: sections, items, prices and sold-out.',
  'hut_orders': 'An order from the course: items, total, note and its progress (sent → ready → collected).',
}
NOTES = {
  'start_time': 'minutes after midnight', 'old_time': 'minutes after midnight', 'new_time': 'minutes after midnight',
  'si': 'stroke index', 'gui': 'Golf Ireland number', 'hcp_index': 'handicap index', 'user_id': 'their login',
  'lineup': 'players on the card: {m: member} or {g: guest}', 'scores': 'gross score per hole per player',
  'done': 'which holes are saved', 'entered': 'who typed each score', 'submitted': 'games finished and signed off',
  'pairing': 'which pairs play together', 'game': 'game key, or none for scores only', 'marker': 'who marks the card',
  'players': 'snapshot of everyone in it', 'team_names': 'name for each side', 'proposer_slot': 'tee time whose version is on the table',
  'release_days': 'days ahead the sheet opens', 'guest_allowance': 'guest points a member gets a year',
  'fee_payment': 'how entry fees are paid', 'pins': 'one entry per hole', 'yards': 'yards from each tee',
  'style': 'kind of event', 'format': 'scoring format', 'fmt': 'scoring format', 'kind': 'type', 'status': 'where it’s up to',
  'allowance_pct': 'handicap allowance', 'host': 'the group that sent it', 'answer': 'their reply',
}
PENCE = re.compile(r'pence$')
def pretty_type(t, c):
    return {'bigint': 'number', 'integer': 'number', 'smallint': 'number', 'numeric': 'decimal', 'double precision': 'decimal',
            'text': 'text', 'boolean': 'yes / no', 'jsonb': 'JSON', 'ARRAY': 'list', 'uuid': 'login id', 'date': 'date',
            'timestamp with time zone': 'date & time', 'time without time zone': 'time'}.get(t, t)
def show(c, v):
    if v is None: return '<span class="null">empty</span>'
    if isinstance(v, bool): return 'yes' if v else 'no'
    if c.endswith('_at') and isinstance(v, str): v = v[:16].replace('T', ' ')
    s = json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else str(v)
    if len(s) > 150: s = s[:147] + ' …'
    s = html.escape(s)
    if c in ('start_time', 'old_time', 'new_time') and isinstance(v, int): s += f' <span class="hint">({v // 60:02d}:{v % 60:02d})</span>'
    if PENCE.search(c) and isinstance(v, int): s += f' <span class="hint">(£{v / 100:.2f})</span>'
    return s

def table_block(t):
    r, illus = rows[t]
    ls = links.get(t, {})
    out = [f'<div class="tbl"><div class="th"><span class="tname">{t}</span>{" <span class=illus>illustrative example</span>" if illus else ""}</div>',
           f'<p class="purpose">{PURPOSE[t]}</p>']
    if ls:
        out.append('<p class="links">Links to: ' + ' · '.join(f'<b>{c}</b> → {", ".join(sorted(v))}' for c, v in sorted(ls.items())) + '</p>')
    out.append('<table><tr><th style="width:24%">Column</th><th style="width:14%">Type</th><th>Example</th></tr>')
    for c in cols[t]:
        n, note = c['c'], NOTES.get(c['c'])
        key = ' <span class="key">link</span>' if n in ls else ''
        out.append(f'<tr><td><b>{n}</b>{key}{f"<br><span class=hint>{note}</span>" if note else ""}</td><td>{pretty_type(c["t"], n)}{"" if c["n"] == "YES" else "<span class=req> *</span>"}</td><td class="val">{show(n, (r or {}).get(n))}</td></tr>')
    out.append('</table></div>')
    return '\n'.join(out)

css = open(sys.argv[2]).read()
parts = [f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>TeeMate data</title><style>{css}</style></head><body>']
# Page 1: overview
ov = ''.join(f'<div class="area"><h3>{g}</h3><p>{d}</p><div class="chips">{"".join(f"<span>{t}</span>" for t in ts)}</div></div>' for g, d, ts in GROUPS)
parts.append(f'''<section class="page"><div class="kicker">TeeMate · How the data is structured · October 2026</div>
<h1>The 32 tables behind TeeMate</h1>
<p class="sub">Everything TeeMate knows lives in one PostgreSQL database (Supabase) as 32 tables. Each table is like a spreadsheet tab: one row per thing (a member, a tee time, a scorecard), one column per detail. Tables point at each other by number: a booking says <i>which tee time</i> (slot_id) and <i>who booked</i> (booked_by), rather than copying their details.</p>
<div class="areas">{ov}</div>
<h3 style="margin-top:3mm">Following one round through the tables</h3>
<div class="flow">
<div class="step"><b>members</b>Gary, member 0, handicap 12.4</div><div class="arr">→</div>
<div class="step"><b>tee_slots</b>Sat 09:30 on the Ailsa, holds 4</div><div class="arr">→</div>
<div class="step"><b>bookings + booking_players</b>Gary books it with Declan, Ciarán and a guest</div><div class="arr">→</div>
<div class="step"><b>rounds</b>Their shared card: lineup, game, scores hole by hole</div><div class="arr">→</div>
<div class="step"><b>event_entries / ko_matches</b>The card counts for a competition or a knockout match</div></div>
<p class="foot">How to read the pages that follow: <b>link</b> marks a column that points to another table; <span class="req">*</span> means it must always be filled in. Times on the tee sheet are stored as minutes after midnight (570 = 09:30) and money in pence (450 = £4.50). JSON columns hold small structured lists, such as a scorecard’s scores. Example rows come from the made-up club in the test database; where a table is empty there, the row is marked <i>illustrative</i>. Personal details are masked.</p>
</section>''')
for g, d, ts in GROUPS:
    parts.append(f'<section class="group"><h2>{g}</h2><p class="sub">{d}</p>' + ''.join(table_block(t) for t in ts) + '</section>')
parts.append('</body></html>')
open(sys.argv[3], 'w').write('\n'.join(parts))
print('ok')
