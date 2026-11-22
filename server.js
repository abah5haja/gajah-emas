'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createSeed } = require('./seed');

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
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
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
  return clamp(Math.floor(minute), 0, 90);
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
    .filter((match) => match.status === 'finished')
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

  const scorers = [...players]
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name, 'id'))
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
    meta: db.meta,
    teams,
    players,
    matches,
    mabar,
    standings,
    scorers,
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
          baseMinute: Number.isFinite(Number(body.minute)) ? clamp(number(body.minute), 0, 90) : 0,
          startedAt: new Date().toISOString(),
          running: true
        };
      }
      if (status === 'finished') {
        match.clock = {
          baseMinute: Number.isFinite(Number(body.minute))
            ? clamp(number(body.minute), 0, 120)
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
      match.clock.baseMinute = clamp(number(body.minute), 0, 90);
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
    if (body.minute != null && match.status !== 'live') {
      match.clock = match.clock || {};
      match.clock.baseMinute = clamp(number(body.minute), 0, 120);
      match.clock.running = false;
    }
    persist();
    broadcast();
    sendJson(res, 200, { ok: true, match });
    return;
  }

  if (matchIdMatch && method === 'DELETE') {
    const id = decodeURIComponent(matchIdMatch[1]);
    const before = db.matches.length;
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
    match[key] = clamp(number(match[key], 0) + delta, 0, 99);
    persist();
    broadcast();
    sendJson(res, 200, { ok: true, match });
    return;
  }

  const eventMatch = pathname.match(/^\/api\/admin\/matches\/([^/]+)\/events$/);
  if (eventMatch && method === 'POST') {
    const match = findMatch(decodeURIComponent(eventMatch[1]));
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
      minute: clamp(Math.floor(number(body.minute, matchMinute(match))), 0, 120),
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
