'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createSeed, buildTournament } = require('./seed');
const { buildTeamPdf } = require('./pdf-report');

const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_PIN = String(process.env.ADMIN_PIN || '2468');
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SESSION_SECRET = crypto.randomBytes(32);
const SESSION_COOKIE = 'mini_soccer_admin';
const SESSION_MS = 8 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const MATCH_MINUTES = 30;
const HALF_MINUTES = 15;
const KNOCKOUT_TEMPLATE = [
  { id: 'qf1', stage: 'quarterfinal', label: '8 Besar 1' },
  { id: 'qf2', stage: 'quarterfinal', label: '8 Besar 2' },
  { id: 'qf3', stage: 'quarterfinal', label: '8 Besar 3' },
  { id: 'qf4', stage: 'quarterfinal', label: '8 Besar 4' },
  { id: 'sf1', stage: 'semifinal', label: 'Semifinal 1' },
  { id: 'sf2', stage: 'semifinal', label: 'Semifinal 2' },
  { id: 'third', stage: 'third', label: 'Perebutan Juara 3' },
  { id: 'final', stage: 'final', label: 'Final' }
];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const seed = createSeed();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    let changed = false;
    if (!data.tournament || !Array.isArray(data.tournament.groups)) {
      data.tournament = buildTournament(data.teams);
      changed = true;
    }
    if (![3, 4].includes(Number(data.tournament.teamsPerGroup))) {
      data.tournament.teamsPerGroup = 3;
      changed = true;
    }
    if (number(data.tournament.qualifyPerGroup) < 1) {
      data.tournament.qualifyPerGroup = 2;
      changed = true;
    }
    if (!Array.isArray(data.tournamentHistory)) {
      data.tournamentHistory = [];
      changed = true;
    }
    if (changed) fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('Data lama tidak bisa dibaca, membuat data baru.', error);
    const seed = createSeed();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
}

const db = loadDb();
const teamMap = new Map(db.teams.map((team) => [team.id, team]));
const sseClients = new Set();
const loginAttempts = new Map();

function persist() {
  db.meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function text(value, max = 120) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function derivedShort(name) {
  const words = String(name || '').split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words.map((word) => word[0]).join('').slice(0, 3).toUpperCase();
  }
  return String(name || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'TIM';
}

function uniqueShort(base) {
  const used = new Set(db.teams.map((team) => String(team.short || '').toUpperCase()));
  const clean = String(base || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'TIM';
  if (!used.has(clean)) return clean;
  let index = 2;
  while (used.has(`${clean.slice(0, 3)}${index}`)) index += 1;
  return `${clean.slice(0, 3)}${index}`;
}

function uniqueTeamId(name) {
  const base = slugify(name) || `tim-${crypto.randomBytes(3).toString('hex')}`;
  const used = new Set(db.teams.map((team) => team.id));
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function saveRasterUpload(prefix, id, dataUrl, label) {
  if (!dataUrl) return null;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl));
  if (!match) throw new HttpError(400, `${label} harus PNG, JPG, atau WebP.`);
  const type = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 1.5 * 1024 * 1024) {
    throw new HttpError(400, `Ukuran ${label.toLowerCase()} maksimal 1,5 MB setelah dikompres.`);
  }
  const valid = type === 'png'
    ? buffer.length > 8 && buffer[0] === 0x89 && buffer.slice(1, 4).toString() === 'PNG'
    : type === 'jpeg'
      ? buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8
      : buffer.length > 12 && buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP';
  if (!valid) throw new HttpError(400, `File ${label.toLowerCase()} tidak valid.`);
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = type === 'jpeg' ? 'jpg' : type;
  const filename = `${prefix}-${id}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

function saveTeamLogo(teamId, dataUrl) {
  return saveRasterUpload('team', teamId, dataUrl, 'Logo');
}

function savePlayerPhoto(playerId, dataUrl) {
  return saveRasterUpload('player', playerId, dataUrl, 'Foto');
}

function removeUpload(publicPath, prefix) {
  if (!publicPath) return;
  const filename = path.basename(String(publicPath));
  if (!filename.startsWith(`${prefix}-`)) return;
  const target = path.join(UPLOAD_DIR, filename);
  if (!target.startsWith(`${UPLOAD_DIR}${path.sep}`)) return;
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch (error) {
    console.error('Gagal menghapus file upload.', error);
  }
}

function matchMinute(match) {
  const clock = match.clock || {};
  let minute = number(clock.baseMinute, 0);
  if (match.status === 'live' && clock.running && clock.startedAt) {
    const started = Date.parse(clock.startedAt);
    if (Number.isFinite(started)) {
      minute += Math.floor((Date.now() - started) / MINUTE_MS);
    }
  }
  return clamp(Math.floor(minute), 0, MATCH_MINUTES);
}

function computeStandings() {
  const rows = new Map(db.teams.map((team) => [team.id, {
    teamId: team.id,
    name: team.name,
    short: team.short,
    color: team.color,
    color2: team.color2,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0,
    form: []
  }]));

  const finished = db.matches
    .filter((match) => match.status === 'finished' && !match.tournamentId)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

  for (const match of finished) {
    const home = rows.get(match.homeId);
    const away = rows.get(match.awayId);
    if (!home || !away) continue;
    const homeScore = number(match.homeScore, 0);
    const awayScore = number(match.awayScore, 0);

    home.played += 1;
    away.played += 1;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.won += 1; home.points += 3; home.form.push('W');
      away.lost += 1; away.form.push('L');
    } else if (homeScore < awayScore) {
      away.won += 1; away.points += 3; away.form.push('W');
      home.lost += 1; home.form.push('L');
    } else {
      home.drawn += 1; home.points += 1; home.form.push('D');
      away.drawn += 1; away.points += 1; away.form.push('D');
    }
  }

  const table = [...rows.values()].map((row) => {
    row.goalDiff = row.goalsFor - row.goalsAgainst;
    row.form = row.form.slice(-5);
    return row;
  });

  table.sort((a, b) =>
    b.points - a.points ||
    b.goalDiff - a.goalDiff ||
    b.goalsFor - a.goalsFor ||
    a.name.localeCompare(b.name, 'id')
  );

  return table.map((row, index) => ({ ...row, rank: index + 1 }));
}

function roundRobinRounds(teamIds) {
  const teams = [...teamIds];
  if (teams.length % 2 !== 0) teams.push(null);
  const rounds = [];
  const count = teams.length;
  if (count < 2) return rounds;
  for (let round = 0; round < count - 1; round += 1) {
    const pairs = [];
    for (let index = 0; index < count / 2; index += 1) {
      const home = teams[index];
      const away = teams[count - 1 - index];
      if (home && away) pairs.push([home, away]);
    }
    rounds.push(pairs);
    const fixed = teams[0];
    const rest = teams.slice(1);
    rest.unshift(rest.pop());
    teams.splice(0, teams.length, fixed, ...rest);
  }
  return rounds;
}

function cardCountsByPlayer(matches) {
  const counts = new Map();
  for (const match of matches) {
    for (const event of match.events || []) {
      if (!event.playerId || (event.type !== 'yellow' && event.type !== 'red')) continue;
      const entry = counts.get(event.playerId) || { yellow: 0, red: 0 };
      if (event.type === 'yellow') entry.yellow += 1;
      else entry.red += 1;
      counts.set(event.playerId, entry);
    }
  }
  return counts;
}

function tournamentLeaders(matches) {
  const stats = new Map();
  for (const match of matches) {
    for (const event of match.events || []) {
      if (!['goal', 'yellow', 'red'].includes(event.type)) continue;
      const key = event.playerId || `name:${event.playerName || 'unknown'}`;
      const player = event.playerId ? db.players.find((item) => item.id === event.playerId) : null;
      const teamId = event.teamId || (player ? player.teamId : null);
      const team = teamMap.get(teamId);
      const entry = stats.get(key) || {
        playerId: event.playerId || null,
        name: player ? player.name : event.playerName || 'Tanpa nama',
        teamName: team ? team.name : 'Tanpa tim',
        teamId: team ? team.id : null,
        teamColor: team ? team.color : '#cffF45',
        photo: player ? player.photo || null : null,
        goals: 0,
        yellowCards: 0,
        redCards: 0
      };
      if (event.type === 'goal') entry.goals += 1;
      if (event.type === 'yellow') entry.yellowCards += 1;
      if (event.type === 'red') entry.redCards += 1;
      stats.set(key, entry);
    }
  }
  const rows = [...stats.values()];
  const ranked = (metric) => rows
    .filter((row) => row[metric] > 0)
    .sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name, 'id'))
    .slice(0, 10);
  return {
    scorers: ranked('goals'),
    yellow: ranked('yellowCards'),
    red: ranked('redCards')
  };
}

function computeTournament() {
  const tournament = db.tournament;
  if (!tournament) return null;
  const tournamentMatches = db.matches.filter((match) => match.tournamentId === tournament.id);
  const groups = (tournament.groups || []).map((group) => {
    const matches = tournamentMatches.filter((match) => match.groupId === group.id);
    const rows = group.teamIds
      .map((teamId) => teamMap.get(teamId))
      .filter(Boolean)
      .map((team) => ({
        teamId: team.id,
        name: team.name,
        short: team.short,
        color: team.color,
        color2: team.color2,
        logo: team.logo || null,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        points: 0,
        yellowCards: 0,
        redCards: 0
      }));
    const rowMap = new Map(rows.map((row) => [row.teamId, row]));

    for (const match of matches) {
      for (const event of match.events || []) {
        const row = event.teamId ? rowMap.get(event.teamId) : null;
        if (!row) continue;
        if (event.type === 'yellow') row.yellowCards += 1;
        if (event.type === 'red') row.redCards += 1;
      }
    }

    for (const match of matches.filter((item) => item.status === 'finished')) {
      const home = rowMap.get(match.homeId);
      const away = rowMap.get(match.awayId);
      if (!home || !away) continue;
      const homeScore = number(match.homeScore, 0);
      const awayScore = number(match.awayScore, 0);
      home.played += 1;
      away.played += 1;
      home.goalsFor += homeScore;
      home.goalsAgainst += awayScore;
      away.goalsFor += awayScore;
      away.goalsAgainst += homeScore;
      if (homeScore > awayScore) {
        home.won += 1; home.points += 3;
        away.lost += 1;
      } else if (homeScore < awayScore) {
        away.won += 1; away.points += 3;
        home.lost += 1;
      } else {
        home.drawn += 1; away.drawn += 1;
        home.points += 1; away.points += 1;
      }
    }

    rows.forEach((row) => { row.goalDiff = row.goalsFor - row.goalsAgainst; });
    rows.sort((a, b) =>
      b.points - a.points ||
      b.goalDiff - a.goalDiff ||
      b.goalsFor - a.goalsFor ||
      a.name.localeCompare(b.name, 'id')
    );
    const standings = rows.map((row, index) => ({
      ...row,
      rank: index + 1,
      qualified: index < number(tournament.qualifyPerGroup, 2)
    }));
    return {
      ...group,
      standings,
      emptySlots: Math.max(0, number(tournament.teamsPerGroup, 3) - standings.length),
      matchCount: matches.length,
      finishedCount: matches.filter((match) => match.status === 'finished').length
    };
  });

  return {
    ...tournament,
    groups,
    groupCount: groups.length,
    slotTotal: groups.length * number(tournament.teamsPerGroup, 3),
    slotsFilled: groups.reduce((total, group) => total + group.standings.length, 0),
    matchCount: tournamentMatches.length,
    finishedCount: tournamentMatches.filter((match) => match.status === 'finished').length,
    knockoutMatchCount: knockoutMatchCount(tournament),
    leaders: tournamentLeaders(tournamentMatches),
    knockout: enrichKnockout(tournament)
  };
}

function tournamentHistorySummary() {
  return (db.tournamentHistory || []).map((tournament) => {
    const teamIds = new Set((tournament.groups || []).flatMap((group) => group.teamIds || []));
    return {
      id: tournament.id,
      name: tournament.name,
      status: tournament.status,
      startsAt: tournament.startsAt,
      teamsPerGroup: tournament.teamsPerGroup,
      teamCount: teamIds.size,
      matchCount: db.matches.filter((match) => match.tournamentId === tournament.id).length,
      archivedAt: tournament.archivedAt || null
    };
  }).sort((a, b) => new Date(b.archivedAt || 0) - new Date(a.archivedAt || 0));
}

function wibIsoAt(baseMs, addDays, hour, minute) {
  const shifted = new Date(baseMs + addDays * 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000);
  const date = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
  return new Date(date.getTime() + ((hour - 7) * 60 + minute) * 60 * 1000).toISOString();
}

function autoKnockoutKickoffs(groupMatches) {
  const lastKickoff = groupMatches.reduce((latest, match) => {
    const time = Date.parse(match.kickoff);
    return Number.isFinite(time) ? Math.max(latest, time) : latest;
  }, 0);
  const base = Math.max(Date.now(), lastKickoff) + 24 * 60 * 60 * 1000;
  return {
    qf1: wibIsoAt(base, 0, 9, 0),
    qf2: wibIsoAt(base, 0, 11, 0),
    qf3: wibIsoAt(base, 0, 14, 0),
    qf4: wibIsoAt(base, 0, 16, 0),
    sf1: wibIsoAt(base, 1, 15, 0),
    sf2: wibIsoAt(base, 1, 19, 0),
    third: wibIsoAt(base, 2, 15, 0),
    final: wibIsoAt(base, 2, 19, 0)
  };
}

function findBracketMatch(tournament, slot) {
  if (!slot) return null;
  if (slot.matchId) {
    const match = db.matches.find((item) => item.id === slot.matchId);
    if (match) return match;
  }
  return db.matches.find((match) => match.tournamentId === tournament.id && match.bracketSlot === slot.id) || null;
}

function createBracketMatch(tournament, slot) {
  if (!slot.homeId || !slot.awayId) return null;
  const existing = findBracketMatch(tournament, slot);
  if (existing) {
    slot.matchId = existing.id;
    return existing;
  }
  const match = {
    id: `match-${crypto.randomBytes(4).toString('hex')}`,
    round: slot.label,
    tournamentId: tournament.id,
    stage: slot.stage,
    bracketSlot: slot.id,
    kickoff: slot.kickoff,
    venue: tournament.venue || 'Lapangan Mini Soccer',
    homeId: slot.homeId,
    awayId: slot.awayId,
    homeScore: 0,
    awayScore: 0,
    status: 'upcoming',
    events: []
  };
  db.matches.push(match);
  slot.matchId = match.id;
  return match;
}

function bracketWinnerId(match) {
  if (!match || match.status !== 'finished') return null;
  if (number(match.homeScore, 0) === number(match.awayScore, 0)) return null;
  return number(match.homeScore, 0) > number(match.awayScore, 0) ? match.homeId : match.awayId;
}

function bracketLoserId(match) {
  if (!match || match.status !== 'finished') return null;
  if (number(match.homeScore, 0) === number(match.awayScore, 0)) return null;
  return number(match.homeScore, 0) > number(match.awayScore, 0) ? match.awayId : match.homeId;
}

function setBracketSlotTeams(tournament, slot, homeId, awayId) {
  if (!slot) return false;
  const nextHome = homeId || null;
  const nextAway = awayId || null;
  const existing = findBracketMatch(tournament, slot);
  if (existing && existing.status !== 'upcoming') return false;
  const changed = slot.homeId !== nextHome || slot.awayId !== nextAway;
  if (!changed && existing) {
    slot.matchId = existing.id;
    return false;
  }
  slot.homeId = nextHome;
  slot.awayId = nextAway;
  if (existing) {
    if (nextHome && nextAway) {
      existing.homeId = nextHome;
      existing.awayId = nextAway;
      if (slot.kickoff) existing.kickoff = slot.kickoff;
      slot.matchId = existing.id;
    } else if (!(existing.events || []).length && number(existing.homeScore, 0) === 0 && number(existing.awayScore, 0) === 0) {
      db.matches = db.matches.filter((match) => match.id !== existing.id);
      slot.matchId = null;
    } else {
      return false;
    }
  }
  if (nextHome && nextAway) createBracketMatch(tournament, slot);
  return true;
}

function syncAutoKnockout(tournament) {
  const knockout = tournament && tournament.knockout;
  if (!knockout || knockout.mode !== 'auto') return false;
  const slots = new Map((knockout.slots || []).map((slot) => [slot.id, slot]));
  const winner = (id) => bracketWinnerId(findBracketMatch(tournament, slots.get(id)));
  const loser = (id) => bracketLoserId(findBracketMatch(tournament, slots.get(id)));
  let changed = false;
  changed = setBracketSlotTeams(tournament, slots.get('sf1'), winner('qf1'), winner('qf2')) || changed;
  changed = setBracketSlotTeams(tournament, slots.get('sf2'), winner('qf3'), winner('qf4')) || changed;
  changed = setBracketSlotTeams(tournament, slots.get('third'), loser('sf1'), loser('sf2')) || changed;
  changed = setBracketSlotTeams(tournament, slots.get('final'), winner('sf1'), winner('sf2')) || changed;
  return changed;
}

function enrichKnockout(tournament) {
  const knockout = tournament && tournament.knockout;
  if (!knockout) return null;
  const slots = (knockout.slots || []).map((slot) => {
    const match = findBracketMatch(tournament, slot);
    const home = slot.homeId ? teamMap.get(slot.homeId) || null : null;
    const away = slot.awayId ? teamMap.get(slot.awayId) || null : null;
    return {
      ...slot,
      home,
      away,
      match: match
        ? {
            id: match.id,
            status: match.status,
            homeScore: number(match.homeScore, 0),
            awayScore: number(match.awayScore, 0),
            minute: matchMinute(match),
            kickoff: match.kickoff,
            venue: match.venue
          }
        : null
    };
  });
  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  const finalSlot = byId.get('final');
  const thirdSlot = byId.get('third');
  const finalMatch = finalSlot ? findBracketMatch(tournament, finalSlot) : null;
  const thirdMatch = thirdSlot ? findBracketMatch(tournament, thirdSlot) : null;
  const finalWinner = bracketWinnerId(finalMatch);
  const finalLoser = bracketLoserId(finalMatch);
  const thirdWinner = bracketWinnerId(thirdMatch);
  const thirdLoser = bracketLoserId(thirdMatch);
  return {
    mode: knockout.mode,
    createdAt: knockout.createdAt,
    slots,
    podium: {
      champion: finalWinner ? teamMap.get(finalWinner) || null : null,
      runnerUp: finalLoser ? teamMap.get(finalLoser) || null : null,
      third: thirdWinner ? teamMap.get(thirdWinner) || null : null,
      fourth: thirdLoser ? teamMap.get(thirdLoser) || null : null
    }
  };
}

function knockoutMatchCount(tournament) {
  return db.matches.filter((match) => match.tournamentId === tournament.id && match.bracketSlot).length;
}

function publicState() {
  const standings = computeStandings();
  const teamLookup = new Map(standings.map((row) => [row.teamId, row]));
  const teams = db.teams.map((team) => ({
    ...team,
    playerCount: db.players.filter((player) => player.teamId === team.id).length,
    standing: teamLookup.get(team.id) || null
  }));

  const players = db.players.map((player) => {
    const team = teamMap.get(player.teamId);
    return {
      ...player,
      teamName: team ? team.name : 'Free agent',
      teamColor: team ? team.color : '#98a394',
      teamShort: team ? team.short : 'FA'
    };
  });
  const cards = cardCountsByPlayer(db.matches);
  for (const player of players) {
    const counts = cards.get(player.id) || { yellow: 0, red: 0 };
    player.yellowCards = counts.yellow;
    player.redCards = counts.red;
  }

  const scorers = [...players]
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name, 'id'))
    .slice(0, 10);
  const yellowLeaders = [...players]
    .filter((player) => player.yellowCards > 0)
    .sort((a, b) => b.yellowCards - a.yellowCards || b.redCards - a.redCards || a.name.localeCompare(b.name, 'id'))
    .slice(0, 10);
  const redLeaders = [...players]
    .filter((player) => player.redCards > 0)
    .sort((a, b) => b.redCards - a.redCards || b.yellowCards - a.yellowCards || a.name.localeCompare(b.name, 'id'))
    .slice(0, 10);

  const matches = db.matches
    .map((match) => ({
      ...match,
      minute: matchMinute(match),
      home: teamMap.get(match.homeId) || null,
      away: teamMap.get(match.awayId) || null,
      events: [...(match.events || [])].sort((a, b) => b.minute - a.minute)
    }))
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

  const mabar = db.mabar.map((session) => ({
    ...session,
    participants: (session.participants || []).map(({ token, ...participant }) => participant),
    participantCount: (session.participants || []).length
  }));

  return {
    meta: {
      ...db.meta,
      matchFormat: { totalMinutes: MATCH_MINUTES, halves: 2, minutesPerHalf: HALF_MINUTES }
    },
    teams,
    players,
    matches,
    mabar,
    tournament: computeTournament(),
    tournamentHistory: tournamentHistorySummary(),
    standings,
    scorers,
    yellowLeaders,
    redLeaders,
    online: sseClients.size,
    serverNow: Date.now()
  };
}

function broadcast() {
  const payload = `event: state\ndata: ${JSON.stringify(publicState())}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function parseCookies(req) {
  const cookies = {};
  for (const chunk of String(req.headers.cookie || '').split(';')) {
    const index = chunk.indexOf('=');
    if (index === -1) continue;
    cookies[chunk.slice(0, index).trim()] = decodeURIComponent(chunk.slice(index + 1).trim());
  }
  return cookies;
}

function hmac(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function createSession() {
  const payload = `admin.${Date.now() + SESSION_MS}`;
  return `${payload}.${hmac(payload)}`;
}

function isAdmin(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [role, expires, signature] = parts;
  if (role !== 'admin' || number(expires) < Date.now()) return false;
  const expected = hmac(`${role}.${expires}`);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
}

function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  sendJson(res, 401, { error: 'Sesi admin tidak valid. Silakan masuk kembali.' });
  return false;
}

function clientIp(req) {
  return String(req.socket.remoteAddress || 'unknown');
}

function loginLocked(req) {
  const record = loginAttempts.get(clientIp(req));
  if (!record) return false;
  if (Date.now() - record.startedAt > 10 * MINUTE_MS) {
    loginAttempts.delete(clientIp(req));
    return false;
  }
  return record.count >= 5;
}

function recordFailedLogin(req) {
  const ip = clientIp(req);
  const record = loginAttempts.get(ip);
  if (!record || Date.now() - record.startedAt > 10 * MINUTE_MS) {
    loginAttempts.set(ip, { count: 1, startedAt: Date.now() });
  } else {
    record.count += 1;
  }
}

function pinMatches(candidate) {
  const given = Buffer.from(String(candidate));
  const wanted = Buffer.from(ADMIN_PIN);
  return given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
}

function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > limit) {
        reject(new HttpError(413, 'Data terlalu besar.'));
        req.pause();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new HttpError(400, 'Format JSON tidak valid.'));
      }
    });
    req.on('error', reject);
  });
}

function findMatch(id) {
  const match = db.matches.find((item) => item.id === id);
  if (!match) throw new HttpError(404, 'Pertandingan tidak ditemukan.');
  return match;
}

function findMabar(id) {
  const session = db.mabar.find((item) => item.id === id);
  if (!session) throw new HttpError(404, 'Sesi mabar tidak ditemukan.');
  return session;
}

function validToken(value) {
  return /^[a-zA-Z0-9_-]{8,80}$/.test(String(value || ''));
}

function parseMabarBody(body) {
  const title = text(body.title, 60);
  const date = text(body.date, 10);
  const time = text(body.time, 5);
  const venue = text(body.venue, 80);
  const city = text(body.city, 60);
  const format = text(body.format, 4);
  const level = text(body.level, 20);
  const host = text(body.host, 24);
  const notes = text(body.notes, 240);
  const slots = Math.floor(number(body.slots, 0));
  const price = Math.max(0, Math.floor(number(body.price, 0)));
  const formats = ['5v5', '7v7', '8v8', '9v9'];
  const levels = ['Santai', 'Menengah', 'Kompetitif'];

  if (title.length < 3) throw new HttpError(400, 'Judul mabar minimal 3 karakter.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+07:00`))) {
    throw new HttpError(400, 'Tanggal mabar tidak valid.');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new HttpError(400, 'Jam mabar tidak valid.');
  if (venue.length < 3) throw new HttpError(400, 'Lokasi minimal 3 karakter.');
  if (!formats.includes(format)) throw new HttpError(400, 'Format harus 5v5, 7v7, 8v8, atau 9v9.');
  if (!levels.includes(level)) throw new HttpError(400, 'Level mabar tidak valid.');
  if (host.length < 2) throw new HttpError(400, 'Nama host minimal 2 karakter.');
  if (slots < 6 || slots > 30) throw new HttpError(400, 'Jumlah slot harus antara 6 sampai 30.');
  if (!Number.isFinite(price) || price > 1000000) throw new HttpError(400, 'Harga tidak valid.');

  return { title, date, time, venue, city, format, level, host, notes, slots, price };
}

function joinMabar(session, name, token) {
  if (session.participants.length >= session.slots) {
    throw new HttpError(409, 'Slot mabar ini sudah penuh.');
  }
  if (session.participants.some((participant) => participant.token === token)) {
    throw new HttpError(409, 'Kamu sudah terdaftar di sesi ini.');
  }
  const participant = {
    id: crypto.randomUUID(),
    name,
    token,
    joinedAt: new Date().toISOString()
  };
  session.participants.push(participant);
  return participant;
}

function publicParticipant(participant) {
  const { token, ...safe } = participant;
  return safe;
}

const staticTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    sendJson(res, 400, { error: 'Path tidak valid.' });
    return;
  }

  let requested = decoded === '/' ? '/index.html' : decoded;
  let filePath = path.resolve(PUBLIC_DIR, `.${requested}`);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Akses ditolak.' });
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    if (path.extname(requested)) {
      sendJson(res, 404, { error: 'File tidak ditemukan.' });
      return;
    }
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = staticTypes[ext] || 'application/octet-stream';
  const data = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': data.length,
    'Cache-Control': ext === '.html' ? 'no-store' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });
  res.end(req.method === 'HEAD' ? undefined : data);
}

async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  const teamReportMatch = pathname.match(/^\/api\/teams\/([^/]+)\/report\.pdf$/);
  if (method === 'GET' && teamReportMatch) {
    const teamId = decodeURIComponent(teamReportMatch[1]);
    const team = teamMap.get(teamId);
    if (!team) throw new HttpError(404, 'Tim tidak ditemukan.');
    const standings = computeStandings();
    const standing = standings.find((row) => row.teamId === team.id) || null;
    const cards = cardCountsByPlayer(db.matches);
    const players = db.players
      .filter((player) => player.teamId === team.id)
      .map((player) => {
        const counts = cards.get(player.id) || { yellow: 0, red: 0 };
        return { ...player, yellowCards: counts.yellow, redCards: counts.red };
      });
    let tournamentGroup = null;
    if (db.tournament) {
      const tournament = computeTournament();
      const group = tournament
        ? tournament.groups.find((item) => item.teamIds.includes(team.id))
        : null;
      if (group) {
        const row = group.standings.find((item) => item.teamId === team.id);
        tournamentGroup = {
          tournamentName: tournament.name,
          groupName: group.name,
          rank: row ? row.rank : null
        };
      }
    }
    const pdf = buildTeamPdf({ team, standing, players, tournamentGroup });
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.length,
      'Content-Disposition': `attachment; filename="${team.id}-report.pdf"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(pdf);
    return;
  }

  if (method === 'GET' && pathname === '/api/state') {
    sendJson(res, 200, { ...publicState(), isAdmin: isAdmin(req) });
    return;
  }

  if (method === 'GET' && pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');
    sseClients.add(res);
    res.write(`event: state\ndata: ${JSON.stringify(publicState())}\n\n`);
    broadcast();
    req.on('close', () => {
      sseClients.delete(res);
      broadcast();
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/login') {
    if (loginLocked(req)) {
      sendJson(res, 429, { error: 'Terlalu banyak percobaan. Coba lagi dalam 10 menit.' });
      return;
    }
    const body = await readJson(req);
    if (!pinMatches(body.pin || '')) {
      recordFailedLogin(req);
      sendJson(res, 401, { error: 'PIN admin salah.' });
      return;
    }
    loginAttempts.delete(clientIp(req));
    const maxAge = Math.floor(SESSION_MS / 1000);
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${createSession()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
    sendJson(res, 200, { ok: true, isAdmin: true });
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/logout') {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === 'GET' && pathname === '/api/admin/session') {
    sendJson(res, 200, { isAdmin: isAdmin(req) });
    return;
  }

  if (method === 'POST' && pathname === '/api/mabar') {
    const body = await readJson(req);
    const values = parseMabarBody(body);
    const token = validToken(body.token) ? body.token : crypto.randomUUID();
    const session = {
      id: `mabar-${crypto.randomBytes(4).toString('hex')}`,
      ...values,
      createdAt: new Date().toISOString(),
      participants: []
    };
    const participant = joinMabar(session, values.host, token);
    db.mabar.unshift(session);
    persist();
    broadcast();
    sendJson(res, 201, {
      ok: true,
      id: session.id,
      token,
      participant: publicParticipant(participant),
      session: publicState().mabar.find((item) => item.id === session.id)
    });
    return;
  }

  let mabarMatch = pathname.match(/^\/api\/mabar\/([^/]+)\/join$/);
  if (mabarMatch && method === 'POST') {
    const session = findMabar(decodeURIComponent(mabarMatch[1]));
    const body = await readJson(req);
    const name = text(body.name, 24);
    if (name.length < 2) throw new HttpError(400, 'Nama minimal 2 karakter.');
    const token = validToken(body.token) ? body.token : crypto.randomUUID();
    const participant = joinMabar(session, name, token);
    persist();
    broadcast();
    sendJson(res, 200, {
      ok: true,
      token,
      participant: publicParticipant(participant),
      session: publicState().mabar.find((item) => item.id === session.id)
    });
    return;
  }

  mabarMatch = pathname.match(/^\/api\/mabar\/([^/]+)\/leave$/);
  if (mabarMatch && method === 'POST') {
    const session = findMabar(decodeURIComponent(mabarMatch[1]));
    const body = await readJson(req);
    const token = text(body.token, 80);
    const before = session.participants.length;
    session.participants = session.participants.filter((participant) => participant.token !== token);
    if (session.participants.length === before) throw new HttpError(404, 'Kamu tidak terdaftar di sesi ini.');
    persist();
    broadcast();
    sendJson(res, 200, {
      ok: true,
      session: publicState().mabar.find((item) => item.id === session.id)
    });
    return;
  }

  if (pathname.startsWith('/api/admin/')) {
    if (!requireAdmin(req, res)) return;
  }

  if (method === 'PATCH' && pathname === '/api/admin/tournament') {
    const body = await readJson(req);
    const tournament = db.tournament;
    if (!tournament) throw new HttpError(404, 'Turnamen belum tersedia.');
    const hasFixtures = db.matches.some((match) => match.tournamentId === tournament.id);

    if (body.name != null) {
      const name = text(body.name, 80);
      if (name.length < 3) throw new HttpError(400, 'Nama turnamen minimal 3 karakter.');
      tournament.name = name;
    }
    if (body.status != null) {
      const status = text(body.status, 20);
      if (!['upcoming', 'live', 'finished'].includes(status)) throw new HttpError(400, 'Status turnamen tidak valid.');
      if (status === 'finished') {
        const unfinished = db.matches.filter((match) => match.tournamentId === tournament.id && match.status !== 'finished');
        if (unfinished.length) {
          throw new HttpError(409, `Selesaikan ${unfinished.length} pertandingan turnamen terlebih dahulu sebelum menutup turnamen.`);
        }
        if (tournament.knockout) {
          const incompleteBracket = tournament.knockout.slots.filter((slot) => {
            const match = findBracketMatch(tournament, slot);
            return !match || match.status !== 'finished';
          });
          if (incompleteBracket.length) {
            throw new HttpError(409, 'Selesaikan seluruh fase gugur termasuk perebutan juara 3 dan final sebelum menutup turnamen.');
          }
        }
      }
      tournament.status = status;
    }
    if (body.venue != null) {
      const venue = text(body.venue, 80);
      if (venue.length < 3) throw new HttpError(400, 'Nama lapangan minimal 3 karakter.');
      tournament.venue = venue;
    }
    if (body.notes != null) tournament.notes = text(body.notes, 300);
    if (body.startsAt != null) {
      const startsAt = new Date(body.startsAt);
      if (Number.isNaN(startsAt.getTime())) throw new HttpError(400, 'Tanggal mulai tidak valid.');
      tournament.startsAt = startsAt.toISOString();
    }
    if (body.teamsPerGroup != null) {
      const teamsPerGroup = Math.floor(number(body.teamsPerGroup, 0));
      if (![3, 4].includes(teamsPerGroup)) throw new HttpError(400, 'Format grup harus 3 atau 4 tim.');
      if (tournament.knockout) throw new HttpError(409, 'Hapus fase gugur sebelum mengubah format turnamen.');
      if (hasFixtures && teamsPerGroup !== tournament.teamsPerGroup) {
        throw new HttpError(409, 'Hapus jadwal grup sebelum mengubah format turnamen.');
      }
      tournament.teamsPerGroup = teamsPerGroup;
    }

    if (body.assignments != null) {
      if (tournament.status === 'finished') throw new HttpError(409, 'Turnamen sudah ditutup. Buat turnamen baru untuk mengubah pembagian grup.');
      if (tournament.knockout) throw new HttpError(409, 'Hapus fase gugur sebelum mengubah pembagian grup.');
      if (hasFixtures) throw new HttpError(409, 'Hapus jadwal grup sebelum mengubah pembagian grup.');
      if (typeof body.assignments !== 'object' || Array.isArray(body.assignments)) {
        throw new HttpError(400, 'Data pembagian grup tidak valid.');
      }
      const groupIds = ['A', 'B', 'C', 'D'];
      const buckets = new Map(groupIds.map((id) => [id, []]));
      for (const team of db.teams) {
        const rawGroup = text(body.assignments[team.id], 1).toUpperCase();
        if (!rawGroup) continue;
        if (!buckets.has(rawGroup)) throw new HttpError(400, `Grup ${rawGroup} tidak valid.`);
        buckets.get(rawGroup).push(team.id);
      }
      for (const [groupId, teamIds] of buckets) {
        if (teamIds.length > tournament.teamsPerGroup) {
          throw new HttpError(400, `Grup ${groupId} maksimal ${tournament.teamsPerGroup} tim.`);
        }
      }
      tournament.groups = groupIds.map((id) => ({
        id,
        name: `Grup ${id}`,
        teamIds: buckets.get(id)
      }));
    } else if (tournament.groups.some((group) => group.teamIds.length > tournament.teamsPerGroup)) {
      throw new HttpError(400, 'Kurangi jumlah tim di grup sebelum memperkecil format.');
    }

    tournament.updatedAt = new Date().toISOString();
    persist();
    broadcast();
    sendJson(res, 200, { ok: true, tournament: computeTournament() });
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/tournament/new') {
    const body = await readJson(req);
    const previous = db.tournament;
    if (previous && previous.status !== 'finished') {
      throw new HttpError(409, 'Tutup turnamen yang sekarang sebelum membuat turnamen baru.');
    }
    if (previous) {
      const unfinished = db.matches.filter((match) => match.tournamentId === previous.id && match.status !== 'finished');
      if (unfinished.length) {
        throw new HttpError(409, 'Masih ada pertandingan turnamen yang belum selesai.');
      }
    }
    const name = text(body.name, 80);
    if (name.length < 3) throw new HttpError(400, 'Nama turnamen minimal 3 karakter.');
    const teamsPerGroup = Math.floor(number(body.teamsPerGroup, 3));
    if (![3, 4].includes(teamsPerGroup)) throw new HttpError(400, 'Format grup harus 3 atau 4 tim.');
    const startsAt = new Date(body.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new HttpError(400, 'Tanggal mulai tidak valid.');
    const venue = text(body.venue, 80);
    if (venue.length < 3) throw new HttpError(400, 'Nama lapangan minimal 3 karakter.');
    const notes = text(body.notes, 300);

    if (previous) {
      if (!Array.isArray(db.tournamentHistory)) db.tournamentHistory = [];
      previous.archivedAt = new Date().toISOString();
      db.tournamentHistory.unshift(previous);
    }
    db.tournament = {
      id: `turnamen-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      status: 'upcoming',
      teamsPerGroup,
      qualifyPerGroup: 2,
      startsAt: startsAt.toISOString(),
      venue,
      notes: notes || 'Fase grup empat grup. Peringkat 1 dan 2 setiap grup melaju ke babak perempat final.',
      groups: ['A', 'B', 'C', 'D'].map((id) => ({
        id,
        name: `Grup ${id}`,
        teamIds: []
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    persist();
    broadcast();
    sendJson(res, 201, { ok: true, tournament: computeTournament(), history: tournamentHistorySummary() });
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/tournament/knockout/auto') {
    const tournament = db.tournament;
    if (!tournament) throw new HttpError(404, 'Turnamen belum tersedia.');
    if (tournament.status === 'finished') throw new HttpError(409, 'Turnamen sudah ditutup.');
    if (tournament.knockout) throw new HttpError(409, 'Fase gugur sudah dibuat.');
    const groupMatches = db.matches.filter((match) => match.tournamentId === tournament.id && match.groupId);
    if (!groupMatches.length) throw new HttpError(400, 'Buat dan selesaikan jadwal fase grup terlebih dahulu.');
    if (groupMatches.some((match) => match.status !== 'finished')) {
      throw new HttpError(409, 'Selesaikan semua pertandingan fase grup sebelum mengisi 8 besar otomatis.');
    }
    const tournamentState = computeTournament();
    const groupMap = new Map(tournamentState.groups.map((group) => [group.id, group]));
    if (tournamentState.groups.some((group) => group.standings.length !== tournament.teamsPerGroup)) {
      throw new HttpError(409, 'Semua slot grup harus terisi sebelum membuat fase gugur.');
    }
    for (const id of ['A', 'B', 'C', 'D']) {
      if (!groupMap.get(id) || groupMap.get(id).standings.length < 2) {
        throw new HttpError(409, 'Setiap grup membutuhkan minimal dua tim dengan hasil pertandingan.');
      }
    }
    const a = groupMap.get('A').standings;
    const b = groupMap.get('B').standings;
    const c = groupMap.get('C').standings;
    const d = groupMap.get('D').standings;
    const pairings = {
      qf1: [a[0].teamId, b[1].teamId],
      qf2: [c[0].teamId, d[1].teamId],
      qf3: [b[0].teamId, a[1].teamId],
      qf4: [d[0].teamId, c[1].teamId]
    };
    const times = autoKnockoutKickoffs(groupMatches);
    const slots = KNOCKOUT_TEMPLATE.map((template) => ({
      ...template,
      homeId: pairings[template.id] ? pairings[template.id][0] : null,
      awayId: pairings[template.id] ? pairings[template.id][1] : null,
      kickoff: times[template.id],
      matchId: null
    }));
    tournament.knockout = {
      mode: 'auto',
      createdAt: new Date().toISOString(),
      slots
    };
    for (const slot of slots.filter((item) => item.stage === 'quarterfinal')) {
      createBracketMatch(tournament, slot);
    }
    persist();
    broadcast();
    sendJson(res, 201, { ok: true, tournament: computeTournament() });
    return;
  }

  if (method === 'PUT' && pathname === '/api/admin/tournament/knockout/manual') {
    const body = await readJson(req);
    const tournament = db.tournament;
    if (!tournament) throw new HttpError(404, 'Turnamen belum tersedia.');
    if (tournament.status === 'finished') throw new HttpError(409, 'Turnamen sudah ditutup.');
    if (tournament.knockout && tournament.knockout.mode === 'auto') {
      throw new HttpError(409, 'Hapus fase gugur otomatis sebelum mengisi manual.');
    }
    const groupMatches = db.matches.filter((match) => match.tournamentId === tournament.id && match.groupId);
    if (!groupMatches.length) throw new HttpError(400, 'Buat jadwal fase grup terlebih dahulu sebelum mengisi fase gugur.');
    if (!Array.isArray(body.slots)) throw new HttpError(400, 'Data slot fase gugur tidak valid.');
    const inputById = new Map(body.slots.map((slot) => [text(slot.id, 20), slot]));
    const existing = tournament.knockout;
    const oldSlots = new Map(((existing && existing.slots) || []).map((slot) => [slot.id, slot]));
    const nextSlots = [];
    const oldMatchesToRemove = [];
    for (const template of KNOCKOUT_TEMPLATE) {
      const oldSlot = oldSlots.get(template.id);
      const oldMatch = oldSlot ? findBracketMatch(tournament, oldSlot) : null;
      if (oldMatch && oldMatch.status !== 'upcoming') {
        nextSlots.push(oldSlot);
        continue;
      }
      const input = inputById.get(template.id) || oldSlot;
      if (!input) throw new HttpError(400, `Slot ${template.label} belum diisi.`);
      const kickoff = new Date(input.kickoff || (oldSlot && oldSlot.kickoff));
      if (Number.isNaN(kickoff.getTime())) throw new HttpError(400, `Waktu ${template.label} tidak valid.`);
      const homeId = text(input.homeId, 60) || null;
      const awayId = text(input.awayId, 60) || null;
      if (homeId && !teamMap.has(homeId)) throw new HttpError(400, `Tim pada ${template.label} tidak valid.`);
      if (awayId && !teamMap.has(awayId)) throw new HttpError(400, `Tim pada ${template.label} tidak valid.`);
      if (homeId && homeId === awayId) throw new HttpError(400, `${template.label} tidak boleh mempertemukan tim yang sama.`);
      if (oldMatch) {
        if ((oldMatch.events || []).length || number(oldMatch.homeScore, 0) || number(oldMatch.awayScore, 0)) {
          throw new HttpError(409, `Hapus kejadian/skor ${template.label} sebelum mengubah jadwalnya.`);
        }
        oldMatchesToRemove.push(oldMatch.id);
      }
      editableIds.add(template.id);
      nextSlots.push({
        ...template,
        homeId,
        awayId,
        kickoff: kickoff.toISOString(),
        matchId: null
      });
    }
    if (oldMatchesToRemove.length) {
      const removeIds = new Set(oldMatchesToRemove);
      db.matches = db.matches.filter((match) => !removeIds.has(match.id));
    }
    tournament.knockout = {
      mode: 'manual',
      createdAt: (existing && existing.createdAt) || new Date().toISOString(),
      slots: nextSlots
    };
    for (const slot of nextSlots) createBracketMatch(tournament, slot);
    persist();
    broadcast();
    sendJson(res, 200, { ok: true, tournament: computeTournament() });
    return;
  }

  if (method === 'DELETE' && pathname === '/api/admin/tournament/knockout') {
    const tournament = db.tournament;
    if (!tournament) throw new HttpError(404, 'Turnamen belum tersedia.');
    if (!tournament.knockout) throw new HttpError(404, 'Fase gugur belum dibuat.');
    if (tournament.status === 'finished') throw new HttpError(409, 'Turnamen sudah ditutup.');
    const bracketMatches = db.matches.filter((match) => match.tournamentId === tournament.id && match.bracketSlot);
    if (bracketMatches.some((match) => match.status !== 'upcoming' || (match.events || []).length || number(match.homeScore, 0) || number(match.awayScore, 0))) {
      throw new HttpError(409, 'Fase gugur yang sudah memiliki hasil tidak bisa dihapus.');
    }
    if (bracketMatches.length) {
      const ids = new Set(bracketMatches.map((match) => match.id));
      db.matches = db.matches.filter((match) => !ids.has(match.id));
    }
    tournament.knockout = null;
    persist();
    broadcast();
    sendJson(res, 200, { ok: true, tournament: computeTournament() });
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/tournament/fixtures') {
    const tournament = db.tournament;
    if (!tournament) throw new HttpError(404, 'Turnamen belum tersedia.');
    if (tournament.status === 'finished') throw new HttpError(409, 'Turnamen sudah ditutup.');
    if (tournament.knockout) throw new HttpError(409, 'Hapus fase gugur sebelum menyusun ulang jadwal grup.');
    if (db.matches.some((match) => match.tournamentId === tournament.id)) {
      throw new HttpError(409, 'Jadwal grup sudah dibuat.');
    }
    const incomplete = tournament.groups.filter((group) => group.teamIds.length !== tournament.teamsPerGroup);
    if (incomplete.length) {
      throw new HttpError(400, `Lengkapi semua slot grup dulu (${tournament.groups.map((group) => `${group.id}: ${group.teamIds.length}/${tournament.teamsPerGroup}`).join(', ')}).`);
    }

    const roundsByGroup = new Map();
    let maxRounds = 0;
    for (const group of tournament.groups) {
      const rounds = roundRobinRounds(group.teamIds);
      roundsByGroup.set(group.id, rounds);
      maxRounds = Math.max(maxRounds, rounds.length);
    }
    const pairs = [];
    for (let roundIndex = 0; roundIndex < maxRounds; roundIndex += 1) {
      for (const group of tournament.groups) {
        const round = roundsByGroup.get(group.id)[roundIndex] || [];
        for (const [homeId, awayId] of round) {
          pairs.push({
            groupId: group.id,
            homeId,
            awayId,
            matchday: roundIndex + 1
          });
        }
      }
    }
    const startMs = (() => {
      const parsed = Date.parse(tournament.startsAt);
      if (Number.isFinite(parsed) && parsed > Date.now()) return parsed;
      const next = new Date();
      next.setDate(next.getDate() + 1);
      next.setHours(9, 0, 0, 0);
      return next.getTime();
    })();
    const hourOffsets = [0, 2, 5, 7];
    const newMatches = pairs.map((pair, index) => ({
      id: `match-${crypto.randomBytes(4).toString('hex')}`,
      round: `Fase Grup ${pair.groupId} · MD${pair.matchday}`,
      tournamentId: tournament.id,
      groupId: pair.groupId,
      kickoff: new Date(
        startMs +
        Math.floor(index / 4) * 24 * 60 * 60 * 1000 +
        hourOffsets[index % 4] * 60 * 60 * 1000
      ).toISOString(),
      venue: tournament.venue || 'Lapangan Mini Soccer',
      homeId: pair.homeId,
      awayId: pair.awayId,
      homeScore: 0,
      awayScore: 0,
      status: 'upcoming',
      events: []
    }));
    db.matches.push(...newMatches);
    persist();
    broadcast();
    sendJson(res, 201, { ok: true, count: newMatches.length, matches: newMatches, tournament: computeTournament() });
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/tournament/fixtures/manual') {
    const body = await readJson(req);
    const tournament = db.tournament;
    if (!tournament) throw new HttpError(404, 'Turnamen belum tersedia.');
    if (tournament.status === 'finished') throw new HttpError(409, 'Turnamen sudah ditutup.');
    if (tournament.knockout) throw new HttpError(409, 'Hapus fase gugur sebelum menambah laga grup.');
    const groupId = text(body.groupId, 1).toUpperCase();
    const group = tournament.groups.find((item) => item.id === groupId);
    if (!group) throw new HttpError(400, 'Grup tidak valid.');
    const homeId = text(body.homeId, 60);
    const awayId = text(body.awayId, 60);
    if (!group.teamIds.includes(homeId) || !group.teamIds.includes(awayId)) {
      throw new HttpError(400, `Pilih dua tim yang sudah berada di Grup ${groupId}.`);
    }
    if (homeId === awayId) throw new HttpError(400, 'Tim kandang dan tandang harus berbeda.');
    const kickoffDate = new Date(body.kickoff);
    if (Number.isNaN(kickoffDate.getTime())) throw new HttpError(400, 'Jadwal tidak valid.');
    const duplicate = db.matches.some((match) => (
      match.tournamentId === tournament.id &&
      match.groupId === groupId &&
      ((match.homeId === homeId && match.awayId === awayId) || (match.homeId === awayId && match.awayId === homeId))
    ));
    if (duplicate) {
      const homeName = teamMap.get(homeId)?.name || homeId;
      const awayName = teamMap.get(awayId)?.name || awayId;
      throw new HttpError(409, `Laga ${homeName} vs ${awayName} di Grup ${groupId} sudah ada.`);
    }
    const match = {
      id: `match-${crypto.randomBytes(4).toString('hex')}`,
      round: `Fase Grup ${groupId}`,
      tournamentId: tournament.id,
      groupId,
      kickoff: kickoffDate.toISOString(),
      venue: tournament.venue || teamMap.get(homeId).venue,
      homeId,
      awayId,
      homeScore: 0,
      awayScore: 0,
      status: 'upcoming',
      events: [],
      manual: true
    };
    db.matches.push(match);
    persist();
    broadcast();
    sendJson(res, 201, { ok: true, match });
    return;
  }

  if (method === 'DELETE' && pathname === '/api/admin/tournament/fixtures') {
    const tournament = db.tournament;
    if (!tournament) throw new HttpError(404, 'Turnamen belum tersedia.');
    if (tournament.knockout) throw new HttpError(409, 'Hapus fase gugur sebelum menghapus jadwal grup.');
    const fixtures = db.matches.filter((match) => match.tournamentId === tournament.id);
    if (!fixtures.length) throw new HttpError(404, 'Belum ada jadwal grup.');
    if (fixtures.some((match) => match.status !== 'upcoming')) {
      throw new HttpError(409, 'Jadwal grup yang sudah berjalan atau selesai tidak bisa dihapus.');
    }
    db.matches = db.matches.filter((match) => match.tournamentId !== tournament.id);
    persist();
    broadcast();
    sendJson(res, 200, { ok: true, count: fixtures.length, tournament: computeTournament() });
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/teams') {
    const body = await readJson(req, 8 * 1024 * 1024);
    const name = text(body.name, 50);
    if (name.length < 2) throw new HttpError(400, 'Nama tim minimal 2 karakter.');
    if (db.teams.some((team) => team.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(409, 'Nama tim sudah dipakai.');
    }
    const currentYear = new Date().getFullYear();
    const color = /^#[0-9a-fA-F]{6}$/.test(String(body.color || '')) ? String(body.color) : '#cfff45';
    const color2 = /^#[0-9a-fA-F]{6}$/.test(String(body.color2 || '')) ? String(body.color2) : '#1b241b';
    const rawPlayers = Array.isArray(body.players) ? body.players : [];
    if (!rawPlayers.length) throw new HttpError(400, 'Tambahkan minimal satu pemain.');
    if (rawPlayers.length > 30) throw new HttpError(400, 'Maksimal 30 pemain per tim.');

    const id = uniqueTeamId(name);
    const short = uniqueShort(text(body.short, 8) || derivedShort(name));
    const players = [];
    const photoQueue = [];
    const usedNumbers = new Set();
    for (let index = 0; index < rawPlayers.length; index += 1) {
      const entry = rawPlayers[index] || {};
      const playerName = text(entry.name, 50);
      if (!playerName) continue;
      if (playerName.length < 2) throw new HttpError(400, `Nama pemain baris ${index + 1} minimal 2 karakter.`);
      const position = ['GK', 'DF', 'MF', 'FW'].includes(String(entry.position || '').toUpperCase())
        ? String(entry.position).toUpperCase()
        : 'MF';
      let shirt = Math.floor(number(entry.number, 0));
      if (!shirt) {
        shirt = 1;
        while (usedNumbers.has(shirt)) shirt += 1;
      }
      if (shirt < 1 || shirt > 99) throw new HttpError(400, `Nomor punggung ${playerName} harus 1 sampai 99.`);
      if (usedNumbers.has(shirt)) throw new HttpError(400, `Nomor punggung ${shirt} dipakai lebih dari satu pemain.`);
      usedNumbers.add(shirt);
      const player = {
        id: `p-${crypto.randomBytes(4).toString('hex')}`,
        name: playerName,
        teamId: id,
        position,
        number: shirt,
        goals: 0,
        assists: 0,
        matches: 0,
        photo: null
      };
      players.push(player);
      if (entry.photo) photoQueue.push({ player, data: entry.photo });
    }
    if (!players.length) throw new HttpError(400, 'Isi minimal satu nama pemain.');

    const savedPhotos = [];
    let logo = null;
    try {
      for (const item of photoQueue) {
        const photo = savePlayerPhoto(item.player.id, item.data);
        if (photo) {
          item.player.photo = photo;
          savedPhotos.push(photo);
        }
      }
      logo = saveTeamLogo(id, body.logo);
    } catch (error) {
      for (const photo of savedPhotos) removeUpload(photo, 'player');
      throw error;
    }
    const team = {
      id,
      name,
      short,
      city: text(body.city, 60) || 'Jakarta',
      color,
      color2,
      coach: text(body.coach, 50) || 'Belum diisi',
      founded: clamp(Math.floor(number(body.founded, currentYear)), 1900, currentYear + 1),
      venue: text(body.venue, 80) || 'Lapangan Mini Soccer',
      logo
    };
    db.teams.push(team);
    db.players.push(...players);
    teamMap.set(team.id, team);
    persist();
    broadcast();
    sendJson(res, 201, { ok: true, team, players });
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/matches') {
    const body = await readJson(req);
    const homeId = text(body.homeId, 60);
    const awayId = text(body.awayId, 60);
    if (!teamMap.has(homeId) || !teamMap.has(awayId)) throw new HttpError(400, 'Tim tidak valid.');
    if (homeId === awayId) throw new HttpError(400, 'Tim kandang dan tandang harus berbeda.');
    const kickoffDate = new Date(body.kickoff);
    if (Number.isNaN(kickoffDate.getTime())) throw new HttpError(400, 'Jadwal tidak valid.');
    const match = {
      id: `match-${crypto.randomBytes(4).toString('hex')}`,
      round: text(body.round, 30) || db.meta.matchday,
      kickoff: kickoffDate.toISOString(),
      venue: text(body.venue, 80) || teamMap.get(homeId).venue,
      homeId,
      awayId,
      homeScore: 0,
      awayScore: 0,
      status: 'upcoming',
      events: []
    };
    db.matches.push(match);
    persist();
    broadcast();
    sendJson(res, 201, { ok: true, match });
    return;
  }

  const matchIdMatch = pathname.match(/^\/api\/admin\/matches\/([^/]+)$/);
  if (matchIdMatch && method === 'PATCH') {
    const match = findMatch(decodeURIComponent(matchIdMatch[1]));
    const body = await readJson(req);
    const allowed = ['upcoming', 'live', 'finished'];
    if (body.status != null) {
      const status = text(body.status, 20);
      if (!allowed.includes(status)) throw new HttpError(400, 'Status pertandingan tidak valid.');
      if (status === 'live' && match.status !== 'live') {
        match.clock = {
          baseMinute: Number.isFinite(Number(body.minute)) ? clamp(number(body.minute), 0, MATCH_MINUTES) : 0,
          startedAt: new Date().toISOString(),
          running: true
        };
      }
      if (status === 'finished') {
        if (match.bracketSlot && number(match.homeScore, 0) === number(match.awayScore, 0)) {
          throw new HttpError(409, 'Laga fase gugur tidak boleh berakhir seri. Tentukan pemenang terlebih dahulu.');
        }
        match.clock = {
          baseMinute: Number.isFinite(Number(body.minute))
            ? clamp(number(body.minute), 0, MATCH_MINUTES)
            : matchMinute(match),
          startedAt: new Date().toISOString(),
          running: false
        };
      }
      if (status === 'upcoming') {
        match.clock = { baseMinute: 0, startedAt: new Date().toISOString(), running: false };
      }
      match.status = status;
    }
    if (body.minute != null && match.status === 'live') {
      match.clock = match.clock || {};
      match.clock.baseMinute = clamp(number(body.minute), 0, MATCH_MINUTES);
      match.clock.startedAt = new Date().toISOString();
    }
    if (body.running != null) {
      match.clock = match.clock || { baseMinute: matchMinute(match), startedAt: new Date().toISOString(), running: false };
      if (body.running && !match.clock.running) {
        match.clock.startedAt = new Date().toISOString();
        match.clock.running = true;
      } else if (!body.running && match.clock.running) {
        match.clock.baseMinute = matchMinute(match);
        match.clock.startedAt = new Date().toISOString();
        match.clock.running = false;
      }
    }
    if (body.venue != null) match.venue = text(body.venue, 80) || match.venue;
    if (body.control != null) match.inControl = Boolean(body.control);
    if (body.minute != null && match.status !== 'live') {
      match.clock = match.clock || {};
      match.clock.baseMinute = clamp(number(body.minute), 0, MATCH_MINUTES);
      match.clock.running = false;
    }
    if (match.bracketSlot && match.status === 'finished' && db.tournament && db.tournament.id === match.tournamentId) {
      syncAutoKnockout(db.tournament);
    }
    persist();
    broadcast();
    sendJson(res, 200, { ok: true, match });
    return;
  }

  if (matchIdMatch && method === 'DELETE') {
    const id = decodeURIComponent(matchIdMatch[1]);
    const before = db.matches.length;
    const target = db.matches.find((match) => match.id === id);
    if (target && target.bracketSlot) throw new HttpError(409, 'Pertandingan fase gugur tidak bisa dihapus dari sini. Hapus bracket fase gugur terlebih dahulu.');
    db.matches = db.matches.filter((match) => match.id !== id);
    if (db.matches.length === before) throw new HttpError(404, 'Pertandingan tidak ditemukan.');
    persist();
    broadcast();
    sendJson(res, 200, { ok: true });
    return;
  }

  const scoreMatch = pathname.match(/^\/api\/admin\/matches\/([^/]+)\/score$/);
  if (scoreMatch && method === 'POST') {
    const match = findMatch(decodeURIComponent(scoreMatch[1]));
    const body = await readJson(req);
    const side = text(body.side, 10);
    const delta = Math.trunc(number(body.delta, 0));
    if (side !== 'home' && side !== 'away') throw new HttpError(400, 'Sisi tim tidak valid.');
    if (delta === 0 || Math.abs(delta) > 9) throw new HttpError(400, 'Perubahan skor tidak valid.');
    const key = side === 'home' ? 'homeScore' : 'awayScore';
    const nextScore = clamp(number(match[key], 0) + delta, 0, 99);
    if (match.bracketSlot && match.status === 'finished') {
      const homeScore = side === 'home' ? nextScore : number(match.homeScore, 0);
      const awayScore = side === 'away' ? nextScore : number(match.awayScore, 0);
      if (homeScore === awayScore) throw new HttpError(409, 'Skor laga fase gugur tidak boleh seri.');
    }
    match[key] = nextScore;
    if (match.bracketSlot && match.status === 'finished' && db.tournament && db.tournament.id === match.tournamentId) {
      syncAutoKnockout(db.tournament);
    }
    persist();
    broadcast();
    sendJson(res, 200, { ok: true, match });
    return;
  }

  const eventMatch = pathname.match(/^\/api\/admin\/matches\/([^/]+)\/events$/);
  if (eventMatch && method === 'POST') {
    const match = findMatch(decodeURIComponent(eventMatch[1]));
    if (match.bracketSlot && match.status === 'finished') {
      throw new HttpError(409, 'Kejadian laga fase gugur yang sudah selesai tidak bisa diubah.');
    }
    const body = await readJson(req);
    const side = text(body.side, 10);
    const type = text(body.type, 20);
    const types = ['goal', 'yellow', 'red', 'sub', 'kickoff', 'halftime', 'fulltime', 'other'];
    if (side !== 'home' && side !== 'away') throw new HttpError(400, 'Sisi tim tidak valid.');
    if (!types.includes(type)) throw new HttpError(400, 'Jenis kejadian tidak valid.');
    const teamId = side === 'home' ? match.homeId : match.awayId;
    const playerId = text(body.playerId, 60);
    let player = null;
    if (playerId) {
      player = db.players.find((item) => item.id === playerId && item.teamId === teamId);
      if (!player) throw new HttpError(400, 'Pemain tidak berasal dari tim tersebut.');
    }
    if (type === 'goal' && !player) throw new HttpError(400, 'Pilih pencetak gol.');
    const event = {
      id: `ev-${crypto.randomBytes(4).toString('hex')}`,
      minute: clamp(Math.floor(number(body.minute, matchMinute(match))), 0, MATCH_MINUTES),
      type,
      teamId,
      playerId: player ? player.id : null,
      playerName: player ? player.name : text(body.playerName, 40) || teamMap.get(teamId).name,
      note: text(body.note, 140)
    };
    match.events = match.events || [];
    match.events.push(event);
    if (type === 'goal') {
      const key = side === 'home' ? 'homeScore' : 'awayScore';
      match[key] = clamp(number(match[key], 0) + 1, 0, 99);
      if (player) player.goals = number(player.goals, 0) + 1;
    }
    persist();
    broadcast();
    sendJson(res, 201, { ok: true, event, match });
    return;
  }

  const deleteEvent = pathname.match(/^\/api\/admin\/matches\/([^/]+)\/events\/([^/]+)$/);
  if (deleteEvent && method === 'DELETE') {
    const match = findMatch(decodeURIComponent(deleteEvent[1]));
    if (match.bracketSlot && match.status === 'finished') {
      throw new HttpError(409, 'Kejadian laga fase gugur yang sudah selesai tidak bisa diubah.');
    }
    const eventId = decodeURIComponent(deleteEvent[2]);
    const event = (match.events || []).find((item) => item.id === eventId);
    if (!event) throw new HttpError(404, 'Kejadian tidak ditemukan.');
    if (event.type === 'goal') {
      if (event.teamId === match.homeId) match.homeScore = clamp(number(match.homeScore, 0) - 1, 0, 99);
      if (event.teamId === match.awayId) match.awayScore = clamp(number(match.awayScore, 0) - 1, 0, 99);
      const player = db.players.find((item) => item.id === event.playerId);
      if (player) player.goals = Math.max(0, number(player.goals, 0) - 1);
    }
    match.events = match.events.filter((item) => item.id !== eventId);
    persist();
    broadcast();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/mabar') {
    const body = await readJson(req);
    const values = parseMabarBody(body);
    const session = {
      id: `mabar-${crypto.randomBytes(4).toString('hex')}`,
      ...values,
      createdAt: new Date().toISOString(),
      participants: []
    };
    const token = validToken(body.token) ? body.token : crypto.randomUUID();
    const participant = joinMabar(session, values.host, token);
    db.mabar.unshift(session);
    persist();
    broadcast();
    sendJson(res, 201, {
      ok: true,
      id: session.id,
      participant: publicParticipant(participant),
      session: publicState().mabar.find((item) => item.id === session.id)
    });
    return;
  }

  const deleteMabar = pathname.match(/^\/api\/admin\/mabar\/([^/]+)$/);
  if (deleteMabar && method === 'DELETE') {
    const id = decodeURIComponent(deleteMabar[1]);
    const before = db.mabar.length;
    db.mabar = db.mabar.filter((session) => session.id !== id);
    if (db.mabar.length === before) throw new HttpError(404, 'Sesi mabar tidak ditemukan.');
    persist();
    broadcast();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/players') {
    const body = await readJson(req, 4 * 1024 * 1024);
    const name = text(body.name, 50);
    const teamId = text(body.teamId, 60);
    const position = text(body.position, 2);
    const shirt = Math.floor(number(body.number, 0));
    if (name.length < 2) throw new HttpError(400, 'Nama pemain minimal 2 karakter.');
    if (!teamMap.has(teamId)) throw new HttpError(400, 'Tim tidak valid.');
    if (db.players.filter((player) => player.teamId === teamId).length >= 30) {
      throw new HttpError(409, 'Skuad maksimal 30 pemain.');
    }
    if (!['GK', 'DF', 'MF', 'FW'].includes(position)) throw new HttpError(400, 'Posisi tidak valid.');
    if (shirt < 1 || shirt > 99) throw new HttpError(400, 'Nomor punggung harus 1 sampai 99.');
    const id = `p-${crypto.randomBytes(4).toString('hex')}`;
    const photo = savePlayerPhoto(id, body.photo);
    const player = {
      id,
      name,
      teamId,
      position,
      number: shirt,
      goals: 0,
      assists: 0,
      matches: 0,
      photo
    };
    db.players.push(player);
    persist();
    broadcast();
    sendJson(res, 201, { ok: true, player });
    return;
  }

  const playerIdMatch = pathname.match(/^\/api\/admin\/players\/([^/]+)$/);
  if (playerIdMatch && method === 'PATCH') {
    const id = decodeURIComponent(playerIdMatch[1]);
    const player = db.players.find((item) => item.id === id);
    if (!player) throw new HttpError(404, 'Pemain tidak ditemukan.');
    const body = await readJson(req, 4 * 1024 * 1024);
    if (!Object.prototype.hasOwnProperty.call(body, 'photo')) {
      throw new HttpError(400, 'Tidak ada perubahan foto.');
    }
    if (body.photo == null || body.photo === '') {
      removeUpload(player.photo, 'player');
      player.photo = null;
    } else {
      const nextPhoto = savePlayerPhoto(player.id, body.photo);
      if (player.photo && player.photo !== nextPhoto) removeUpload(player.photo, 'player');
      player.photo = nextPhoto;
    }
    persist();
    broadcast();
    sendJson(res, 200, { ok: true, player });
    return;
  }

  if (playerIdMatch && method === 'DELETE') {
    const id = decodeURIComponent(playerIdMatch[1]);
    const player = db.players.find((item) => item.id === id);
    if (!player) throw new HttpError(404, 'Pemain tidak ditemukan.');
    db.players = db.players.filter((item) => item.id !== id);
    removeUpload(player.photo, 'player');
    persist();
    broadcast();
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: 'Endpoint tidak ditemukan.' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Metode tidak diizinkan.' });
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
    } else {
      console.error(error);
      sendJson(res, 500, { error: 'Terjadi kesalahan di server.' });
    }
  }
});

setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': keep-alive\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 25 * 1000);

server.listen(PORT, HOST, () => {
  console.log(`Pertandingan Mini Soccer siap di http://localhost:${PORT}`);
  console.log(`Admin PIN: ${ADMIN_PIN}`);
});
