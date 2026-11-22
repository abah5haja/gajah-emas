'use strict';

/* =========================================================
   Pertandingan — Mini Soccer Live
   Vanilla SPA, dependency free.
   ========================================================= */

const WIB = 'Asia/Jakarta';
const MINUTE_MS = 60 * 1000;
const root = {
  header: document.getElementById('site-header'),
  ticker: document.getElementById('ticker-root'),
  view: document.getElementById('view'),
  footer: document.getElementById('site-footer'),
  mobileNav: document.getElementById('mobile-nav'),
  modal: document.getElementById('modal-root'),
  toast: document.getElementById('toast-root')
};

const state = {
  data: null,
  isAdmin: false,
  connected: false,
  loading: true,
  error: null,
  serverOffset: 0,
  theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  ui: {
    playerSearch: '',
    playerTeam: '',
    playerSort: 'goals',
    matchFilter: 'all',
    adminTab: 'live',
    homeLeader: 'goals'
  },
  modal: null
};

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

function safeColor(value, fallback = '#cfff45') {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(value || '')) ? value : fallback;
}

function logoSrc(value) {
  const source = String(value || '');
  return /^\/uploads\/[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/i.test(source) ? source : '';
}

function photoSrc(value) {
  const source = String(value || '');
  return /^\/uploads\/player-[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/i.test(source) ? source : '';
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0
});

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: WIB
});

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: WIB
});

const longDateFormatter = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: WIB
});

const timeFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: WIB
});

const dayFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit', timeZone: WIB
});

const monthFormatter = new Intl.DateTimeFormat('id-ID', {
  month: 'short', timeZone: WIB
});

const isoDayFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: WIB
});

function formatKickoff(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Jadwal menyusul';
  return dateTimeFormatter.format(date).replace(/\./g, ':');
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return timeFormatter.format(date).replace(/\./g, ':');
}

function isoDay(date = new Date()) {
  return isoDayFormatter.format(date);
}

function todayIso() {
  return isoDay(new Date());
}

function addDaysIso(days) {
  return isoDay(new Date(Date.now() + days * 24 * 60 * MINUTE_MS));
}

function dateInputValue(offsetDays = 1, hour = 19) {
  return `${addDaysIso(offsetDays)}T${pad(hour)}:00`;
}

function toDateTimeLocalValue(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return dateInputValue(1, 9);
  const parts = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: WIB
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || '00';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function parseMabarDate(session) {
  return new Date(`${session.date}T${session.time || '00:00'}:00+07:00`);
}

function relativeDay(session) {
  const today = todayIso();
  const tomorrow = addDaysIso(1);
  if (session.date === today) return 'Hari ini';
  if (session.date === tomorrow) return 'Besok';
  const parsed = parseMabarDate(session);
  if (Number.isNaN(parsed.getTime())) return 'Jadwal menyusul';
  return longDateFormatter.format(parsed);
}

function liveMinute(match) {
  const clock = match.clock || {};
  let minute = num(clock.baseMinute, 0);
  if (match.status === 'live' && clock.running && clock.startedAt) {
    const started = Date.parse(clock.startedAt);
    if (Number.isFinite(started)) {
      minute += Math.floor((Date.now() + state.serverOffset - started) / MINUTE_MS);
    }
  }
  return Math.max(0, Math.min(90, Math.floor(minute)));
}

function clockIsRunning(match) {
  return Boolean(match && match.clock && match.clock.running && match.status === 'live');
}

function getTeam(id) {
  return (state.data && state.data.teams.find((team) => team.id === id)) || null;
}

function getPlayer(id) {
  return (state.data && state.data.players.find((player) => player.id === id)) || null;
}

function getMatch(id) {
  return (state.data && state.data.matches.find((match) => match.id === id)) || null;
}

function getMabar(id) {
  return (state.data && state.data.mabar.find((session) => session.id === id)) || null;
}

function currentTournamentAssignments() {
  const assignments = {};
  const tournament = state.data && state.data.tournament;
  if (!tournament) return assignments;
  for (const group of tournament.groups || []) {
    for (const teamId of group.teamIds || []) assignments[teamId] = group.id;
  }
  return assignments;
}

function teamInitials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function playerInitials(name) {
  const parts = String(name || '?').split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function positionLabel(position) {
  return { GK: 'Kiper', DF: 'Bek', MF: 'Gelandang', FW: 'Penyerang' }[position] || position;
}

function matchWinner(match) {
  if (match.status !== 'finished' || match.homeScore === match.awayScore) return null;
  return match.homeScore > match.awayScore ? 'home' : 'away';
}

function latestEvent(match) {
  if (!match.events || !match.events.length) return null;
  return [...match.events].sort((a, b) => b.minute - a.minute)[0];
}

function latestGoal(match) {
  if (!match.events || !match.events.length) return null;
  const goals = match.events.filter((event) => event.type === 'goal').sort((a, b) => b.minute - a.minute);
  return goals[0] || latestEvent(match);
}

function crest(team, size = 'md') {
  if (!team) return '';
  const logo = logoSrc(team.logo);
  return `<span class="crest crest-${size} ${logo ? 'has-logo' : ''}" style="--crest:${safeColor(team.color)};--crest-2:${safeColor(team.color2, '#1b241b')}" aria-hidden="true">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" decoding="async">` : `<span>${esc(team.short)}</span>`}</span>`;
}

function avatar(player, size = 'md') {
  if (!player) return '';
  const team = getTeam(player.teamId);
  const color = team ? safeColor(team.color) : '#cfff45';
  const photo = photoSrc(player.photo);
  return `<span class="avatar avatar-${size} ${photo ? 'has-photo' : ''}" style="--avatar-color:${color}" aria-hidden="true">${photo ? `<img src="${esc(photo)}" alt="" loading="lazy" decoding="async">` : esc(playerInitials(player.name))}</span>`;
}

function teamDot(team) {
  return `<span class="team-dot" style="--dot-color:${safeColor(team ? team.color : '#98a394')}"></span>`;
}

function formDots(form) {
  if (!form || !form.length) return '<span class="muted">—</span>';
  return form.map((result) => `<span class="form-dot ${result === 'W' ? 'win' : result === 'D' ? 'draw' : 'loss'}" title="${result === 'W' ? 'Menang' : result === 'D' ? 'Seri' : 'Kalah'}">${result}</span>`).join('');
}

function matchStatusPill(match, withDate = false) {
  if (match.status === 'live') {
    return `<span class="status-pill is-live"><span class="live-dot"></span><span data-clock-minute="${esc(match.id)}">${liveMinute(match)}'</span></span>`;
  }
  if (match.status === 'finished') return '<span class="status-pill is-finished">FT</span>';
  if (withDate) return `<span class="status-pill is-upcoming">${esc(formatDate(match.kickoff))}</span>`;
  return `<span class="status-pill is-upcoming">${esc(formatTime(match.kickoff))} WIB</span>`;
}

function scoreLine(match) {
  if (match.status === 'upcoming') return { home: '–', away: '–' };
  return { home: String(match.homeScore), away: String(match.awayScore) };
}

const ICON_PATHS = {
  home: '<path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.7V21h13V9.7"/><path d="M9.5 21v-6h5v6"/>',
  live: '<path d="M4 18V9M9.3 18V5M14.7 18v-7M20 18V7"/>',
  teams: '<path d="M12 3 20 6v6c0 5-3.5 7.8-8 9-4.5-1.2-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
  players: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.4a3 3 0 0 1 0 5.2"/><path d="M17 14c2.5.4 4 2.7 4 5"/>',
  mabar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M12 14v4M10 16h4"/>',
  admin: '<path d="M4 7h9M18 7h2M4 17h2M10 17h10"/><circle cx="15.5" cy="7" r="2.5"/><circle cx="7.5" cy="17" r="2.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowUp: '<path d="M7 17 17 7M8 7h9v9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4"/><path d="M12 13v4M8 21h8M9 17h6"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  logout: '<path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  card: '<rect x="7" y="3.5" width="10" height="17" rx="2"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="m12 8 3.2 2.3-1.2 3.7h-4l-1.2-3.7L12 8Z"/><path d="M12 3v5M4.5 9.5 8.8 10M19.5 9.5 15.2 10M7 20l3-6M17 20l-3-6"/>',
  flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.4a3 3 0 0 1 0 5.2M17 14c2.5.4 4 2.7 4 5"/>',
  whistle: '<path d="M4 15a5 5 0 0 0 5 5h2l3-7H8"/><path d="M14 13h6a2 2 0 0 0 2-2V9l-7-1"/><circle cx="14" cy="16" r="4"/>',
  wifi: '<path d="M4 9a13 13 0 0 1 16 0M7 12a8 8 0 0 1 10 0M10 15a3 3 0 0 1 4 0"/><circle cx="12" cy="19" r=".8" fill="currentColor" stroke="none"/>',
  spark: '<path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z"/><circle cx="12" cy="13" r="3.3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'
};

function icon(name, extraClass = '') {
  return `<svg class="icon ${extraClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

function brandMark() {
  return `<svg class="brand-symbol" viewBox="0 0 44 44" aria-hidden="true">
    <rect x="1.5" y="1.5" width="41" height="41" rx="12" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="1.2"/>
    <path d="M22 5v32M5 22h32" stroke="currentColor" stroke-opacity=".18" stroke-width="1.1"/>
    <circle cx="22" cy="22" r="8.4" fill="none" stroke="currentColor" stroke-width="2.2"/>
    <path d="M22 13.6v5.2M22 25.2v5.2M13.6 22h5.2M25.2 22h5.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="22" cy="22" r="2.3" fill="currentColor"/>
  </svg>`;
}

const NAV_ITEMS = [
  { path: '/', label: 'Beranda', icon: 'home' },
  { path: '/live', label: 'Live', icon: 'live' },
  { path: '/turnamen', label: 'Turnamen', icon: 'trophy' },
  { path: '/tim', label: 'Tim', icon: 'teams' },
  { path: '/pemain', label: 'Pemain', icon: 'players' },
  { path: '/mabar', label: 'Mabar', icon: 'mabar' }
];

function activePath() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return '/';
  return NAV_ITEMS.find((item) => item.path !== '/' && path.startsWith(item.path))?.path || path;
}

function navLink(item, className = '') {
  const active = activePath() === item.path;
  return `<a href="${item.path}" data-link class="${className} ${active ? 'is-active' : ''}" ${active ? 'aria-current="page"' : ''}>${item.label}</a>`;
}

function applyTheme(theme, options = {}) {
  state.theme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.theme === 'light' ? '#f3f6eb' : '#070907');
  if (options.persist !== false) {
    try { localStorage.setItem('pertandingan_theme', state.theme); } catch { /* Penyimpanan tidak tersedia. */ }
  }
}

function renderHeader() {
  if (!state.data) return;
  const online = state.data.online || 1;
  const isAdminRoute = location.pathname.startsWith('/admin');
  root.header.innerHTML = `
    <div class="wrap header-inner">
      <a class="brand" href="/" data-link aria-label="Pertandingan, ke beranda">
        <span class="brand-mark">${brandMark()}</span>
        <span class="brand-copy"><strong>PERTANDINGAN</strong><span>MINI SOCCER</span></span>
      </a>
      <nav class="desktop-nav" aria-label="Navigasi utama">
        ${NAV_ITEMS.map((item) => navLink(item, 'nav-link')).join('')}
      </nav>
      <div class="header-actions">
        <span class="online-badge ${state.connected ? '' : 'is-offline'}" title="${state.connected ? 'Terhubung ke pembaruan live' : 'Menyambungkan ulang'}">
          <span class="online-dot"></span>${state.connected ? `${online} online` : 'offline'}
        </span>
        <button type="button" class="theme-toggle" data-action="toggle-theme" aria-label="Ganti ke mode ${state.theme === 'light' ? 'gelap' : 'terang'}" title="Mode ${state.theme === 'light' ? 'gelap' : 'terang'}">
          ${icon(state.theme === 'light' ? 'moon' : 'sun')}
        </button>
        <a href="/admin" data-link class="admin-link ${isAdminRoute ? 'is-active' : ''}" aria-label="Panel admin">
          ${icon('admin')}<span>${state.isAdmin ? 'Operator' : 'Admin'}</span>
        </a>
      </div>
    </div>`;
}

function renderMobileNav() {
  if (!state.data) return;
  const current = activePath();
  root.mobileNav.innerHTML = NAV_ITEMS.map((item) => `
    <a href="${item.path}" data-link class="mobile-link ${current === item.path ? 'is-active' : ''}" ${current === item.path ? 'aria-current="page"' : ''}>
      ${icon(item.icon)}<span>${item.label}</span>
    </a>`).join('');
}

function renderFooter() {
  if (!state.data) return;
  root.footer.innerHTML = `
    <div class="wrap footer-inner">
      <div class="footer-brand">
        <a class="brand" href="/" data-link>
          <span class="brand-mark">${brandMark()}</span>
          <span class="brand-copy"><strong>PERTANDINGAN</strong><span>MINI SOCCER</span></span>
        </a>
        <p>Ruang kecil untuk permainan besar. Skor live, statistik, dan mabar dalam satu tempat.</p>
      </div>
      <div class="footer-links">
        <div>
          <span class="footer-label">Liga</span>
          <a href="/live" data-link>Match center</a>
          <a href="/turnamen" data-link>Turnamen</a>
          <a href="/tim" data-link>Tim</a>
          <a href="/pemain" data-link>Pemain</a>
        </div>
        <div>
          <span class="footer-label">Komunitas</span>
          <a href="/mabar" data-link>Mabar</a>
          <a href="/admin" data-link>Operator</a>
        </div>
      </div>
    </div>
    <div class="wrap footer-bottom">
      <span>© ${new Date().getFullYear()} ${esc(state.data.meta.season)}</span>
      <span class="live-tech">${icon('wifi')} Live data · SSE</span>
    </div>`;
}

function renderTicker() {
  if (!state.data) return;
  const live = state.data.matches.filter((match) => match.status === 'live');
  const recent = state.data.matches.filter((match) => match.status === 'finished').slice(-3).reverse();
  const openSessions = state.data.mabar.filter((session) => session.participants.length < session.slots).length;
  const items = [];

  live.forEach((match) => {
    items.push(`<span class="ticker-item"><span class="ticker-live">LIVE</span><strong>${esc(match.home.name)} ${match.homeScore}–${match.awayScore} ${esc(match.away.name)}</strong><span class="ticker-muted">${liveMinute(match)}'</span></span>`);
  });
  recent.forEach((match) => {
    items.push(`<span class="ticker-item"><span class="ticker-muted">FT</span><span>${esc(match.home.short)} ${match.homeScore}–${match.awayScore} ${esc(match.away.short)}</span></span>`);
  });
  items.push(`<span class="ticker-item"><span class="ticker-accent">${icon('mabar')}</span><strong>${openSessions} sesi mabar</strong><span class="ticker-muted">siap diikuti</span></span>`);
  items.push(`<span class="ticker-item"><span class="ticker-accent">${icon('players')}</span><span>${state.data.players.length} pemain terdaftar</span></span>`);

  const content = items.join('<span class="ticker-separator" aria-hidden="true">/</span>');
  root.ticker.innerHTML = `
    <div class="ticker">
      <div class="wrap ticker-inner">
        <span class="ticker-brand">${icon('live')} LIVE WIRE</span>
        <div class="ticker-viewport"><div class="ticker-track">${content}<span class="ticker-separator" aria-hidden="true">/</span>${content}</div></div>
      </div>
    </div>`;
}

function renderAll(options = {}) {
  if (!state.data) return;
  const preserveFocus = options.preserveFocus !== false;
  const active = preserveFocus ? document.activeElement : null;
  const focusKey = active && active.dataset ? active.dataset.focusKey : null;
  const selectionStart = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
  const selectionEnd = active && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;

  renderHeader();
  renderTicker();
  renderPage();
  renderFooter();
  renderMobileNav();
  tickClocks();

  if (focusKey) {
    const next = document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
    if (next) {
      next.focus({ preventScroll: true });
      if (selectionStart != null && typeof next.setSelectionRange === 'function') {
        try { next.setSelectionRange(selectionStart, selectionEnd); } catch { /* input type tanpa seleksi */ }
      }
    }
  }
}

function renderPage() {
  if (!state.data) return;
  const path = location.pathname.replace(/\/+$/, '') || '/';
  let html;
  if (path === '/') html = renderHomePage();
  else if (path === '/live') html = renderLivePage();
  else if (path === '/turnamen') html = renderTournamentPage();
  else if (path === '/tim') html = renderTeamsPage();
  else if (path === '/pemain') html = renderPlayersPage();
  else if (path === '/mabar') html = renderMabarPage();
  else if (path === '/admin') html = renderAdminPage();
  else html = renderNotFoundPage();
  root.view.innerHTML = html;

  const titles = {
    '/': 'Pertandingan — Mini Soccer Live',
    '/live': 'Match Center — Pertandingan',
    '/turnamen': 'Turnamen — Pertandingan',
    '/tim': 'Tim — Pertandingan',
    '/pemain': 'Pemain — Pertandingan',
    '/mabar': 'Mabar — Pertandingan',
    '/admin': 'Ruang Operator — Pertandingan'
  };
  document.title = titles[path] || 'Halaman tidak ditemukan — Pertandingan';
  tickClocks();
}

function tickClocks() {
  if (!state.data) return;
  document.querySelectorAll('[data-clock-minute]').forEach((element) => {
    const match = getMatch(element.dataset.clockMinute);
    if (match) element.textContent = `${liveMinute(match)}'`;
  });
  document.querySelectorAll('[data-clock-bar]').forEach((element) => {
    const match = getMatch(element.dataset.clockBar);
    if (match) element.style.width = `${Math.min(100, (liveMinute(match) / 90) * 100)}%`;
  });
  document.querySelectorAll('[data-clock-state]').forEach((element) => {
    const match = getMatch(element.dataset.clockState);
    if (match) element.textContent = clockIsRunning(match) ? 'Jam berjalan' : match.status === 'live' ? 'Jeda' : '';
  });
}

function pageHead({ eyebrow, title, description, actions = '', className = '' }) {
  return `<div class="wrap"><section class="page-head ${className}">
    <div class="page-head-copy">
      <span class="eyebrow"><span class="eyebrow-mark"></span>${eyebrow}</span>
      <h1>${title}</h1>
      <p>${description}</p>
    </div>
    ${actions ? `<div class="page-head-actions">${actions}</div>` : ''}
  </section></div>`;
}

function sectionHead(kicker, title, link, linkLabel = 'Lihat semua') {
  return `<div class="section-head">
    <div><span class="kicker">${kicker}</span><h2>${title}</h2></div>
    ${link ? `<a href="${link}" data-link class="text-link">${linkLabel} ${icon('arrow')}</a>` : ''}
  </div>`;
}

function emptyState(iconName, title, copy) {
  return `<div class="empty-state">${icon(iconName)}<h3>${title}</h3><p>${copy}</p></div>`;
}

function renderNotFoundPage() {
  return `<div class="wrap not-found">
    <span class="eyebrow"><span class="eyebrow-mark"></span>404</span>
    <h1>Bola keluar lapangan.</h1>
    <p>Halaman yang kamu tuju tidak ada. Kembali ke lapangan utama.</p>
    <a href="/" data-link class="btn btn-primary">Kembali ke beranda ${icon('arrow')}</a>
  </div>`;
}

/* =========================================================
   Shared match components
   ========================================================= */

function scoreboard(match, options = {}) {
  if (!match) return '';
  const featured = Boolean(options.featured);
  const home = match.home;
  const away = match.away;
  const score = scoreLine(match);
  const live = match.status === 'live';
  const latest = latestGoal(match);

  return `<article class="scoreboard ${featured ? 'is-featured' : ''} ${live ? 'is-live' : ''}">
    <div class="scoreboard-top">
      <span class="score-round">${esc(match.round)}</span>
      ${matchStatusPill(match)}
      <span class="score-venue">${icon('pin')}${esc(match.venue)}</span>
    </div>
    <div class="scoreboard-main">
      <div class="score-team">
        ${crest(home, featured ? 'xl' : 'lg')}
        <strong>${esc(home ? home.name : 'TBD')}</strong>
        <span>${esc(home ? home.city : '')}</span>
      </div>
      <div class="score-middle">
        <div class="score-numbers"><b>${score.home}</b><span>:</span><b>${score.away}</b></div>
        ${live
          ? `<div class="clock-track"><span data-clock-bar="${esc(match.id)}" style="width:${Math.min(100, (liveMinute(match) / 90) * 100)}%"></span></div>`
          : `<span class="score-caption">${match.status === 'finished' ? 'Full time' : formatKickoff(match.kickoff)}</span>`}
      </div>
      <div class="score-team is-away">
        ${crest(away, featured ? 'xl' : 'lg')}
        <strong>${esc(away ? away.name : 'TBD')}</strong>
        <span>${esc(away ? away.city : '')}</span>
      </div>
    </div>
    ${live && latest ? `<div class="score-highlight">${eventGlyph(latest.type)}<span><b>${esc(latest.playerName)}</b> ${eventVerb(latest.type)} · ${latest.minute}'</span></div>` : ''}
    <div class="scoreboard-foot">
      <span>${icon('clock')}${formatKickoff(match.kickoff)}</span>
      <a href="/live" data-link class="text-link">Match center ${icon('arrow')}</a>
    </div>
  </article>`;
}

function eventGlyph(type) {
  if (type === 'goal') return `<span class="event-glyph is-goal">${icon('ball')}</span>`;
  if (type === 'yellow') return '<span class="event-glyph"><span class="mini-card is-yellow"></span></span>';
  if (type === 'red') return '<span class="event-glyph"><span class="mini-card is-red"></span></span>';
  if (type === 'sub') return `<span class="event-glyph">${icon('swap')}</span>`;
  if (type === 'kickoff') return `<span class="event-glyph">${icon('flag')}</span>`;
  if (type === 'fulltime') return `<span class="event-glyph">${icon('whistle')}</span>`;
  return `<span class="event-glyph">${icon('spark')}</span>`;
}

function eventVerb(type) {
  return {
    goal: 'mencetak gol',
    yellow: 'mendapat kartu kuning',
    red: 'mendapat kartu merah',
    sub: 'masuk / keluar',
    kickoff: 'kick-off',
    fulltime: 'peluit panjang',
    other: 'catatan'
  }[type] || 'kejadian';
}

function eventLabel(type) {
  return {
    goal: 'Gol', yellow: 'Kartu kuning', red: 'Kartu merah',
    sub: 'Pergantian', kickoff: 'Kick-off', fulltime: 'Full time', other: 'Catatan'
  }[type] || type;
}

function matchRow(match) {
  const score = scoreLine(match);
  const winner = matchWinner(match);
  return `<a href="/live" data-link class="match-row ${match.status === 'live' ? 'is-live' : ''}">
    <div class="match-row-state">
      ${match.status === 'live'
        ? `<span class="status-pill is-live"><span class="live-dot"></span><span data-clock-minute="${esc(match.id)}">${liveMinute(match)}'</span></span>`
        : match.status === 'finished'
          ? '<span class="status-pill is-finished">FT</span>'
          : `<span class="row-date">${esc(formatDate(match.kickoff))}</span><span class="row-time">${esc(formatTime(match.kickoff))} WIB</span>`}
    </div>
    <div class="match-row-teams">
      <div class="match-row-team ${winner === 'home' ? 'is-winner' : ''}">
        ${teamDot(match.home)}<span>${esc(match.home.name)}</span><b>${score.home}</b>
      </div>
      <div class="match-row-team ${winner === 'away' ? 'is-winner' : ''}">
        ${teamDot(match.away)}<span>${esc(match.away.name)}</span><b>${score.away}</b>
      </div>
    </div>
    <span class="match-row-arrow">${icon('arrow')}</span>
  </a>`;
}

function standingsTable(limit = 8) {
  const rows = state.data.standings.slice(0, limit);
  return `<div class="standings-wrap">
    <table class="standings-table">
      <thead><tr><th>#</th><th class="align-left">Tim</th><th>M</th><th>SG</th><th>Pts</th><th class="form-col">Form</th></tr></thead>
      <tbody>
        ${rows.map((row) => `<tr class="${row.rank <= 2 ? 'is-qualified' : ''}">
          <td class="rank-cell">${pad(row.rank)}</td>
          <td class="team-cell"><span class="team-dot" style="--dot-color:${safeColor(row.color)}"></span><strong>${esc(row.name)}</strong><span class="team-short">${esc(row.short)}</span></td>
          <td>${row.played}</td>
          <td>${row.goalDiff > 0 ? '+' : ''}${row.goalDiff}</td>
          <td class="points-cell">${row.points}</td>
          <td class="form-col"><span class="form-dots">${formDots(row.form)}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function avatarStack(people, max = 5, size = 'sm') {
  const visible = people.slice(0, max);
  const colors = ['#cfff45', '#58a0ff', '#ff9b4a', '#39dbc8', '#b395ff', '#ffd84f'];
  const more = people.length - visible.length;
  return `<span class="avatar-stack">
    ${visible.map((person, index) => `<span class="avatar avatar-${size}" style="--avatar-color:${colors[index % colors.length]}" title="${esc(person.name)}">${esc(playerInitials(person.name))}</span>`).join('')}
    ${more > 0 ? `<span class="avatar avatar-${size} avatar-more">+${more}</span>` : ''}
  </span>`;
}

function nextMabarSession() {
  const now = Date.now();
  return [...state.data.mabar]
    .sort((a, b) => parseMabarDate(a) - parseMabarDate(b))
    .find((session) => parseMabarDate(session).getTime() + 3 * 60 * MINUTE_MS > now) || state.data.mabar[0];
}

function mabarNudge() {
  const session = nextMabarSession();
  if (!session) return '';
  return `<a href="/mabar" data-link class="mabar-nudge">
    <span class="nudge-icon">${icon('mabar')}</span>
    <span class="nudge-copy"><span class="nudge-kicker">Mabar berikutnya</span><strong>${esc(session.title)}</strong><span>${esc(relativeDay(session))} · ${esc(session.time)} · ${esc(session.venue)}</span></span>
    <span class="nudge-arrow">${icon('arrowUp')}</span>
  </a>`;
}

function renderScorerRow(player, index, metric = 'goals') {
  const value = metric === 'goals' ? player.goals : metric === 'yellow' ? player.yellowCards : player.redCards;
  const label = metric === 'goals' ? 'gol' : metric === 'yellow' ? 'kuning' : 'merah';
  return `<li class="scorer-row">
    <span class="scorer-rank">${pad(index + 1)}</span>
    ${avatar(player, 'md')}
    <span class="scorer-copy"><strong>${esc(player.name)}</strong><span>${esc(player.teamName)} · ${esc(positionLabel(player.position))}</span></span>
    <span class="scorer-stat ${metric !== 'goals' ? `is-${metric}` : ''}"><b>${value}</b><span>${label}</span></span>
  </li>`;
}

/* =========================================================
   Home
   ========================================================= */

function renderHomePage() {
  const matches = state.data.matches;
  const liveMatches = matches.filter((match) => match.status === 'live');
  const upcoming = matches
    .filter((match) => match.status === 'upcoming')
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const recent = matches
    .filter((match) => match.status === 'finished')
    .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));
  const live = liveMatches[0] || null;
  const openSlots = state.data.mabar.reduce((total, session) => total + Math.max(0, session.slots - session.participants.length), 0);
  const spotlight = [];
  const seen = new Set();
  [...liveMatches, ...upcoming.slice(0, 2), ...recent.slice(0, 2)].forEach((match) => {
    if (!seen.has(match.id)) {
      seen.add(match.id);
      spotlight.push(match);
    }
  });
  const topScorers = state.data.scorers.slice(0, 5);
  const leaderMode = state.ui.homeLeader || 'goals';
  const leaderBoard = leaderMode === 'yellow'
    ? (state.data.yellowLeaders || [])
    : leaderMode === 'red'
      ? (state.data.redLeaders || [])
      : state.data.scorers;
  const leaderboardRows = leaderBoard.slice(0, 5);
  const nextSession = nextMabarSession();
  const heroMatch = live || upcoming[0];

  return `
  <section class="hero wrap">
    <div class="hero-copy">
      <span class="eyebrow"><span class="eyebrow-mark"></span>${esc(state.data.meta.season)} · ${esc(state.data.meta.matchday)}</span>
      <h1>Sepak bola mini.<br><span class="accent-text">Energi maksimal.</span></h1>
      <p class="hero-lede">Skor langsung dari lapangan, profil setiap pemain, dan mabar yang selalu punya slot. Semua yang kamu butuhkan untuk tetap dekat dengan permainan.</p>
      <div class="hero-actions">
        <a href="/live" data-link class="btn btn-primary">Tonton live ${icon('arrow')}</a>
        <a href="/mabar" data-link class="btn btn-ghost">Cari mabar ${icon('mabar')}</a>
      </div>
      <div class="hero-proof">
        <span class="avatar-stack">${topScorers.slice(0, 4).map((player, index) => `<span class="avatar avatar-md" style="--avatar-color:${['#cfff45', '#58a0ff', '#ff9b4a', '#39dbc8'][index]}">${esc(playerInitials(player.name))}</span>`).join('')}</span>
        <span><strong>${state.data.players.length} pemain</strong><small>${state.data.teams.length} tim · ${recent.length + liveMatches.length + upcoming.length} laga terdata</small></span>
      </div>
    </div>
    <div class="hero-stage">
      <span class="stage-glow" aria-hidden="true"></span>
      ${heroMatch ? scoreboard(heroMatch, { featured: true }) : emptyState('ball', 'Belum ada pertandingan', 'Jadwal akan muncul di sini.')}
    </div>
  </section>

  <section class="wrap">
    <div class="stat-strip">
      <div class="stat-cell"><span class="stat-value">${pad(state.data.teams.length)}</span><span class="stat-label">Tim</span><span class="stat-note">berkompetisi</span></div>
      <div class="stat-cell"><span class="stat-value">${pad(state.data.players.length)}</span><span class="stat-label">Pemain</span><span class="stat-note">terdaftar</span></div>
      <div class="stat-cell"><span class="stat-value">${pad(liveMatches.length)}</span><span class="stat-label">Live</span><span class="stat-note">pertandingan</span></div>
      <div class="stat-cell"><span class="stat-value">${pad(openSlots)}</span><span class="stat-label">Slot mabar</span><span class="stat-note">masih terbuka</span></div>
    </div>
  </section>

  <section class="wrap section">
    ${sectionHead('Pekan ini', 'Sorotan pertandingan', '/live', 'Buka match center')}
    <div class="home-grid">
      <div class="panel schedule-panel">
        <div class="panel-head">
          <div><span class="panel-kicker">Live & jadwal</span><h3>Papan pertandingan</h3></div>
          <span class="sync-pill">${icon('wifi')} real-time</span>
        </div>
        <div class="match-stack">${spotlight.map(matchRow).join('')}</div>
        <a href="/live" data-link class="panel-link">Lihat semua pertandingan ${icon('arrow')}</a>
      </div>
      <div class="panel standings-panel">
        <div class="panel-head">
          <div><span class="panel-kicker">Klasemen</span><h3>${esc(state.data.meta.matchday)}</h3></div>
          <span class="legend"><span class="legend-dot"></span>2 besar</span>
        </div>
        ${standingsTable(8)}
        <a href="/tim" data-link class="panel-link">Lihat semua tim ${icon('arrow')}</a>
      </div>
    </div>
  </section>

  <section class="wrap section home-lower">
    <div class="panel scorers-panel">
      <div class="panel-head">
        <div><span class="panel-kicker">Papan skor</span><h3>${leaderMode === 'yellow' ? 'Kartu kuning' : leaderMode === 'red' ? 'Kartu merah' : 'Top scorer'}</h3></div>
        <span class="trophy-mark">${leaderMode === 'goals' ? icon('trophy') : `<span class="mini-card is-${leaderMode}"></span>`}</span>
      </div>
      <div class="leader-tabs">
        <button type="button" class="leader-tab ${leaderMode === 'goals' ? 'is-active' : ''}" data-action="home-leader" data-leader="goals">Gol</button>
        <button type="button" class="leader-tab ${leaderMode === 'yellow' ? 'is-active' : ''}" data-action="home-leader" data-leader="yellow"><span class="mini-card is-yellow"></span>Kuning</button>
        <button type="button" class="leader-tab ${leaderMode === 'red' ? 'is-active' : ''}" data-action="home-leader" data-leader="red"><span class="mini-card is-red"></span>Merah</button>
      </div>
      ${leaderboardRows.length
        ? `<ol class="scorer-list">${leaderboardRows.map((player, index) => renderScorerRow(player, index, leaderMode)).join('')}</ol>`
        : `<div class="leader-empty">${leaderMode === 'goals' ? icon('ball') : `<span class="mini-card is-${leaderMode}"></span>`}<span>Belum ada ${leaderMode === 'yellow' ? 'kartu kuning' : leaderMode === 'red' ? 'kartu merah' : 'gol'} tercatat.</span></div>`}
      <a href="/pemain" data-link class="panel-link">Lihat semua pemain ${icon('arrow')}</a>
    </div>
    ${nextSession ? `<a href="/mabar" data-link class="mabar-spotlight">
      <span class="spotlight-top"><span class="spotlight-kicker">${icon('mabar')} Mabar berikutnya</span><span class="spotlight-live">${esc(nextSession.format)}</span></span>
      <span class="spotlight-date">${esc(relativeDay(nextSession))} · ${esc(nextSession.time)} WIB</span>
      <h2>${esc(nextSession.title)}</h2>
      <span class="spotlight-venue">${icon('pin')} ${esc(nextSession.venue)}, ${esc(nextSession.city)}</span>
      <span class="spotlight-social">${avatarStack(nextSession.participants, 4, 'sm')}<span><b>${esc(nextSession.host)}</b> jadi host</span></span>
      ${nextSession.notes ? `<span class="spotlight-note">${esc(nextSession.notes)}</span>` : ''}
      <span class="spotlight-progress"><span class="progress-track"><span style="width:${Math.min(100, (nextSession.participants.length / nextSession.slots) * 100)}%"></span></span><span>${nextSession.participants.length}/${nextSession.slots} pemain</span></span>
      <span class="spotlight-foot"><span>${icon('users')} ${nextSession.slots - nextSession.participants.length} slot tersisa</span><span class="circle-arrow">${icon('arrow')}</span></span>
    </a>` : ''}
  </section>`;
}

/* =========================================================
   Live page
   ========================================================= */

function renderEventPanel(match) {
  const events = match.events || [];
  return `<div class="panel event-panel">
    <div class="panel-head">
      <div><span class="panel-kicker">Menit demi menit</span><h2>Jalannya laga</h2></div>
      <span class="sync-pill">${icon('wifi')} auto-update</span>
    </div>
    ${events.length ? `<div class="timeline">${events.map((event) => {
      const team = getTeam(event.teamId);
      return `<div class="timeline-item is-${esc(event.type)}" style="--event-color:${safeColor(team ? team.color : '#cfff45')}">
        <span class="timeline-minute">${event.minute}'</span>
        ${eventGlyph(event.type)}
        <div class="timeline-copy">
          <strong>${esc(event.playerName)}</strong>
          <span>${esc(team ? team.name : '')}${event.note ? ` · ${esc(event.note)}` : ''}</span>
        </div>
        <span class="timeline-type">${esc(eventLabel(event.type))}</span>
      </div>`;
    }).join('')}</div>` : emptyState('flag', 'Belum ada kejadian', 'Gol, kartu, dan pergantian pemain akan muncul di sini.')}
  </div>`;
}

function renderStatsPanel(match) {
  const stats = match.stats;
  if (!stats) {
    return `<div class="panel live-side-panel">
      <div class="panel-head"><div><span class="panel-kicker">Statistik</span><h3>Performa laga</h3></div></div>
      ${emptyState('live', 'Statistik menyusul', 'Data pertandingan akan tampil setelah kick-off.')}
    </div>`;
  }
  const home = match.home;
  const away = match.away;
  const rows = [
    { label: 'Penguasaan', home: stats.possession[0], away: stats.possession[1], suffix: '%' },
    { label: 'Tembakan', home: stats.shots[0], away: stats.shots[1] },
    { label: 'Tepat sasaran', home: stats.shotsOnTarget[0], away: stats.shotsOnTarget[1] },
    { label: 'Corner', home: stats.corners[0], away: stats.corners[1] },
    { label: 'Pelanggaran', home: stats.fouls[0], away: stats.fouls[1] }
  ];
  return `<div class="panel live-side-panel stats-panel">
    <div class="panel-head"><div><span class="panel-kicker">Statistik</span><h3>Performa laga</h3></div><span class="live-mini">LIVE</span></div>
    <div class="duel-teams">
      <span class="duel-team">${crest(home, 'sm')}<b>${esc(home.name)}</b></span>
      <span class="duel-vs">VS</span>
      <span class="duel-team is-away"><b>${esc(away.name)}</b>${crest(away, 'sm')}</span>
    </div>
    <div class="duel-list">
      ${rows.map((row) => {
        const total = Math.max(1, row.home + row.away);
        return `<div class="duel-row">
          <div class="duel-labels"><span>${row.home}${row.suffix || ''}</span><span>${row.label}</span><span>${row.away}${row.suffix || ''}</span></div>
          <div class="duel-bar"><span class="duel-home" style="width:${(row.home / total) * 100}%;background:${safeColor(home.color)}"></span><span class="duel-away" style="width:${(row.away / total) * 100}%;background:${safeColor(away.color)}"></span></div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function sideFixture(match) {
  const score = scoreLine(match);
  return `<a href="/live" data-link class="side-fixture ${match.status === 'live' ? 'is-live' : ''}">
    <span class="side-fixture-time">${match.status === 'live' ? `<b><span class="live-dot"></span>${liveMinute(match)}'</b>` : match.status === 'finished' ? '<b>FT</b>' : `<b>${esc(formatTime(match.kickoff))}</b>`}<small>${esc(formatDate(match.kickoff))}</small></span>
    <span class="side-fixture-teams">
      <span>${teamDot(match.home)}<span class="side-team-name">${esc(match.home.name)}</span><b>${score.home}</b></span>
      <span>${teamDot(match.away)}<span class="side-team-name">${esc(match.away.name)}</span><b>${score.away}</b></span>
    </span>
  </a>`;
}

function renderMatchArchive() {
  const filter = state.ui.matchFilter || 'all';
  const all = state.data.matches;
  const filtered = all.filter((match) => filter === 'all' || match.status === filter);
  const today = todayIso();
  const dates = [...new Set(filtered.map((match) => isoDay(new Date(match.kickoff))))];
  const upcomingDates = dates.filter((date) => date >= today).sort();
  const pastDates = dates.filter((date) => date < today).sort().reverse();
  const orderedDates = [...upcomingDates, ...pastDates];
  const filters = [
    { key: 'all', label: 'Semua', count: all.length },
    { key: 'live', label: 'Live', count: all.filter((match) => match.status === 'live').length },
    { key: 'upcoming', label: 'Jadwal', count: all.filter((match) => match.status === 'upcoming').length },
    { key: 'finished', label: 'Hasil', count: all.filter((match) => match.status === 'finished').length }
  ];

  function archiveRow(match) {
    const home = match.home;
    const away = match.away;
    const score = scoreLine(match);
    return `<div class="archive-row ${match.status === 'live' ? 'is-live' : ''}">
      <span class="archive-status">
        ${match.status === 'live'
          ? `<span class="status-pill is-live"><span class="live-dot"></span><span data-clock-minute="${esc(match.id)}">${liveMinute(match)}'</span></span>`
          : match.status === 'finished'
            ? '<span class="status-pill is-finished">FT</span>'
            : `<b>${esc(formatTime(match.kickoff))}</b><small>WIB</small>`}
      </span>
      <span class="archive-teams">
        <span class="archive-team ${matchWinner(match) === 'home' ? 'is-winner' : ''}">${crest(home, 'sm')}<span class="archive-name">${esc(home.name)}</span><b>${score.home}</b></span>
        <span class="archive-team ${matchWinner(match) === 'away' ? 'is-winner' : ''}">${crest(away, 'sm')}<span class="archive-name">${esc(away.name)}</span><b>${score.away}</b></span>
      </span>
      <span class="archive-meta"><b>${esc(match.round)}</b><span>${icon('pin')}${esc(match.venue)}</span></span>
    </div>`;
  }

  return `<div class="match-archive">
    ${sectionHead('Arsip lengkap', 'Semua pertandingan', '', '')}
    <div class="archive-toolbar">
      <div class="filter-chips">
        ${filters.map((item) => `<button type="button" class="filter-chip ${filter === item.key ? 'is-active' : ''}" data-action="match-filter" data-filter="${item.key}" aria-pressed="${filter === item.key}">${item.label}<span class="chip-count">${item.count}</span></button>`).join('')}
      </div>
      <span class="tiny-label">${filtered.length} pertandingan</span>
    </div>
    ${orderedDates.length ? orderedDates.map((date) => {
      const dayMatches = filtered
        .filter((match) => isoDay(new Date(match.kickoff)) === date)
        .sort((a, b) => {
          const rank = { live: 0, upcoming: 1, finished: 2 };
          return rank[a.status] - rank[b.status] || new Date(a.kickoff) - new Date(b.kickoff);
        });
      const labelDate = new Date(`${date}T12:00:00+07:00`);
      const dayLabel = longDateFormatter.format(labelDate);
      return `<div class="archive-group">
        <div class="archive-date"><strong>${esc(dayLabel)}</strong><span>${date === today ? 'Hari ini · ' : ''}${dayMatches.length} laga</span></div>
        <div class="archive-list">${dayMatches.map(archiveRow).join('')}</div>
      </div>`;
    }).join('') : emptyState('search', 'Tidak ada pertandingan', 'Coba pilih filter lain.')}
  </div>`;
}

function renderLivePage() {
  const matches = state.data.matches;
  const live = matches.filter((match) => match.status === 'live');
  const upcoming = matches
    .filter((match) => match.status === 'upcoming')
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const finished = matches
    .filter((match) => match.status === 'finished')
    .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));
  const focus = live[0] || upcoming[0] || finished[0];
  const sideMatches = [...upcoming.slice(0, 4), ...finished.slice(0, 3)];

  return `${pageHead({
    eyebrow: 'Match center',
    title: `Detik demi detik.<br><span class="accent-text">Tanpa jeda.</span>`,
    description: 'Skor, kejadian penting, dan statistik pertandingan diperbarui otomatis. Biarkan layar ini yang berteriak untukmu.',
    actions: `${live.length ? `<span class="live-count"><span class="live-dot"></span>${live.length} live sekarang</span>` : '<span class="live-count is-idle">Tidak ada laga live</span>'}
      ${state.isAdmin ? '<a href="/admin" data-link class="btn btn-ghost btn-sm">Kontrol live ' + icon('admin') + '</a>' : ''}`
  })}
  <section class="wrap live-page">
    <div class="live-layout">
      <div class="live-primary">
        ${live.length
          ? live.map((match) => `<div class="live-score-block">${scoreboard(match, { featured: true })}</div>`).join('')
          : (focus ? `<div class="live-score-block">${scoreboard(focus, { featured: true })}</div>` : emptyState('ball', 'Belum ada pertandingan', 'Jadwal pekan ini belum tersedia.'))}
        ${focus ? renderEventPanel(focus) : ''}
      </div>
      <aside class="live-aside">
        ${focus ? renderStatsPanel(focus) : ''}
        <div class="panel side-fixtures">
          <div class="panel-head"><div><span class="panel-kicker">Papan lain</span><h3>Jadwal & hasil</h3></div><span class="tiny-label">${upcoming.length + finished.length} laga</span></div>
          <div class="side-fixture-list">${sideMatches.length ? sideMatches.map(sideFixture).join('') : '<p class="muted small">Belum ada pertandingan lain.</p>'}</div>
          ${finished.length ? `<a href="/tim" data-link class="panel-link">Lihat klasemen lengkap ${icon('arrow')}</a>` : ''}
        </div>
        ${mabarNudge()}
      </aside>
    </div>
    ${renderMatchArchive()}
  </section>`;
}


/* =========================================================
   Tournament
   ========================================================= */

function tournamentStatus(status) {
  const map = {
    upcoming: { label: 'Rencana', className: 'is-upcoming' },
    live: { label: 'Berlangsung', className: 'is-live' },
    finished: { label: 'Selesai', className: 'is-finished' }
  };
  return map[status] || map.upcoming;
}

function renderTournamentGroup(group, tournament) {
  const standings = group.standings || [];
  const emptySlots = group.emptySlots || 0;
  let tableRows = standings.map((row) => `<tr class="${row.qualified ? 'is-qualified' : ''}">
    <td class="group-rank">${row.qualified ? '<span class="qual-dot"></span>' : ''}${pad(row.rank)}</td>
    <td class="group-team-cell">${crest(row, 'xs')}<span class="group-team-name">${esc(row.name)}</span></td>
    <td>${row.played}</td>
    <td class="hide-mobile">${row.won}</td>
    <td class="hide-mobile">${row.drawn}</td>
    <td class="hide-mobile">${row.lost}</td>
    <td>${row.goalDiff > 0 ? '+' : ''}${row.goalDiff}</td>
    <td class="group-card-cell">
      <span class="card-mini is-yellow" title="Kartu kuning">${row.yellowCards}</span>
      <span class="card-mini is-red" title="Kartu merah">${row.redCards}</span>
    </td>
    <td class="group-points">${row.points}</td>
  </tr>`).join('');
  if (emptySlots > 0) {
    const canAssign = state.isAdmin && tournament.status !== 'finished' && !tournament.matchCount;
    tableRows += Array.from({ length: emptySlots }, () => `<tr class="group-empty-row">
      <td>—</td>
      <td class="group-team-cell">${canAssign
        ? `<button type="button" class="empty-team-add" data-action="open-group-picker" data-group="${esc(group.id)}">${icon('plus')} Pilih tim</button>`
        : '<span class="empty-team">Menunggu tim</span>'}</td>
      <td>—</td><td class="hide-mobile">—</td><td class="hide-mobile">—</td><td class="hide-mobile">—</td>
      <td>—</td><td>—</td><td>—</td>
    </tr>`).join('');
  }
  return `<article class="group-card">
    <div class="group-card-head">
      <span class="group-letter">${esc(group.id)}</span>
      <div class="group-card-copy"><span class="kicker">Fase grup</span><h3>${esc(group.name)}</h3></div>
      <span class="group-slot-count ${emptySlots ? 'is-incomplete' : ''}">${standings.length}/${tournament.teamsPerGroup} tim</span>
    </div>
    <div class="group-table-wrap">
      <table class="group-table">
        <thead><tr>
          <th>#</th><th class="align-left">Tim</th><th>M</th>
          <th class="hide-mobile">W</th><th class="hide-mobile">D</th><th class="hide-mobile">L</th>
          <th>SG</th><th title="Kartu kuning / merah">K</th><th>Pts</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <div class="group-card-foot"><span class="qual-dot"></span>${tournament.qualifyPerGroup} teratas lolos ke ${tournament.qualifyPerGroup * tournament.groups.length} besar</div>
  </article>`;
}

function renderTournamentLeaderCard(title, entries, metric, iconClass, emptyText) {
  const label = metric === 'goals' ? 'gol' : metric === 'yellowCards' ? 'kuning' : 'merah';
  return `<div class="tournament-leader-card">
    <div class="tournament-leader-head">
      <span class="leader-icon ${iconClass}">${metric === 'goals' ? icon('ball') : '<span class="mini-card is-' + (metric === 'yellowCards' ? 'yellow' : 'red') + '"></span>'}</span>
      <div><span class="kicker">Posisi</span><h3>${title}</h3></div>
    </div>
    ${entries.length ? `<ol class="tournament-leader-list">
      ${entries.slice(0, 5).map((entry, index) => `<li class="tournament-leader-row">
        <span class="leader-rank">${pad(index + 1)}</span>
        ${avatar(entry, 'sm')}
        <span class="leader-copy"><strong>${esc(entry.name)}</strong><span>${esc(entry.teamName)}</span></span>
        <span class="leader-value"><b>${entry[metric]}</b><small>${label}</small></span>
      </li>`).join('')}
    </ol>` : `<div class="leader-empty">${icon('trophy')}<span>${emptyText}</span></div>`}
  </div>`;
}

function renderTournamentFixtures(tournament) {
  const matches = state.data.matches
    .filter((match) => match.tournamentId === tournament.id)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  return `<div class="panel tournament-schedule">
    <div class="panel-head">
      <div><span class="panel-kicker">Kalender</span><h2>Jadwal fase grup</h2></div>
      <span class="tiny-label">${matches.length ? `${matches.length} laga` : 'Belum ada jadwal'}</span>
    </div>
    ${matches.length ? `<div class="tournament-fixture-list">
      ${matches.map((match) => {
        const score = scoreLine(match);
        return `<a href="/live" data-link class="tournament-fixture ${match.status === 'live' ? 'is-live' : ''}">
          <span class="fixture-date"><b>${esc(formatDate(match.kickoff))}</b><small>${esc(formatTime(match.kickoff))} WIB</small></span>
          <span class="fixture-group">Grup ${esc(match.groupId || '-')}</span>
          <span class="fixture-teams">
            <span>${teamDot(match.home)}<span class="fixture-team-name">${esc(match.home.name)}</span><b>${score.home}</b></span>
            <span>${teamDot(match.away)}<span class="fixture-team-name">${esc(match.away.name)}</span><b>${score.away}</b></span>
          </span>
          <span class="fixture-status">${matchStatusPill(match)}</span>
        </a>`;
      }).join('')}
    </div><a href="/live" data-link class="panel-link">Lihat di match center ${icon('arrow')}</a>`
      : `<div class="tournament-schedule-empty">${icon('calendar')}<div><h3>Jadwal belum dibuat</h3><p>Jadwal grup akan muncul setelah seluruh slot tim terisi dan operator menyusun pertandingan.</p></div></div>`}
  </div>`;
}

function renderTournamentPage() {
  const tournament = state.data.tournament;
  if (!tournament) {
    return `<div class="wrap">${emptyState('trophy', 'Turnamen belum disiapkan', 'Rencana fase grup akan tampil di sini.')}</div>`;
  }
  const status = tournamentStatus(tournament.status);
  const groupCount = tournament.groups.length;
  const complete = tournament.slotsFilled >= tournament.slotTotal;
  const missing = Math.max(0, tournament.slotTotal - tournament.slotsFilled);
  const leaders = tournament.leaders || { scorers: [], yellow: [], red: [] };
  const qualifiedTotal = groupCount * numberOr(tournament.qualifyPerGroup, 2);

  return `${pageHead({
    eyebrow: 'Rencana turnamen · Fase grup',
    title: `Empat grup.<br><span class="accent-text">Satu jalur juara.</span>`,
    description: `${esc(tournament.name)} memakai format ${groupCount} grup × ${tournament.teamsPerGroup} tim. Klasemen grup, kartu, dan raihan gol diperbarui dari pertandingan yang selesai.`,
    actions: `<span class="event-status ${status.className}">${status.label}</span>
      ${state.isAdmin ? `<button type="button" class="btn btn-ghost btn-sm" data-action="open-admin-tournament">${icon('trophy')} Atur turnamen</button>` : ''}`
  })}
  <section class="wrap tournament-page">
    <div class="tournament-hero">
      <div class="tournament-hero-copy">
        <span class="eyebrow"><span class="eyebrow-mark"></span>${esc(tournament.name)}</span>
        <h2>${groupCount} grup, ${tournament.teamsPerGroup} tim per grup.</h2>
        <p>${esc(tournament.notes || 'Fase grup menentukan siapa yang melaju ke babak berikutnya.')}</p>
        <div class="tournament-facts">
          <span>${icon('calendar')}${esc(formatKickoff(tournament.startsAt))}</span>
          <span>${icon('pin')}${esc(tournament.venue)}</span>
          <span>${icon('users')}${tournament.slotsFilled}/${tournament.slotTotal} slot terisi</span>
        </div>
      </div>
      <div class="tournament-progress-card">
        <span class="kicker">Slot peserta</span>
        <strong>${tournament.slotsFilled}<span>/${tournament.slotTotal}</span></strong>
        <div class="progress-track"><span style="width:${(tournament.slotsFilled / tournament.slotTotal) * 100}%"></span></div>
        <small class="${complete ? 'is-complete' : ''}">${complete ? 'Semua slot terisi' : `Menunggu ${missing} tim lagi`}</small>
      </div>
    </div>

    <ol class="stage-track">
      <li class="is-current"><span>01</span><div><b>Fase grup</b><small>${groupCount} grup × ${tournament.teamsPerGroup} tim</small></div></li>
      <li><span>02</span><div><b>${qualifiedTotal} besar</b><small>${tournament.qualifyPerGroup} teratas / grup</small></div></li>
      <li><span>03</span><div><b>Semifinal</b><small>4 tim</small></div></li>
      <li><span>04</span><div><b>Final</b><small>2 tim</small></div></li>
    </ol>

    <div class="section-head tournament-group-heading">
      <div><span class="kicker">Klasemen grup</span><h2>Posisi setiap grup</h2></div>
      <span class="qualification-key"><span class="qual-dot"></span>Zona lolos</span>
    </div>
    <div class="group-grid">${tournament.groups.map((group) => renderTournamentGroup(group, tournament)).join('')}</div>

    <div class="qualification-panel">
      <span class="qualification-icon">${icon('trophy')}</span>
      <div>
        <span class="kicker">Keterangan lolos</span>
        <h3>${tournament.qualifyPerGroup} tim teratas dari setiap grup lolos ke babak ${qualifiedTotal} besar.</h3>
        <p>${qualifiedTotal} tim akan bermain di perempat final. Peringkat ${tournament.qualifyPerGroup + 1}${tournament.teamsPerGroup === 4 ? ' dan 4' : ''} tidak lolos. Klasemen memakai poin, selisih gol, lalu gol memasukkan. Kolom K adalah jumlah kartu kuning dan merah.</p>
      </div>
      <div class="qualification-route"><b>${groupCount} × ${tournament.qualifyPerGroup}</b><span>${icon('arrow')}</span><b>${qualifiedTotal} tim</b></div>
    </div>

    <div class="section-head tournament-stats-heading">
      <div><span class="kicker">Papan statistik</span><h2>Pencetak gol & kartu</h2></div>
      <span class="tiny-label">Berdasarkan kejadian pertandingan turnamen</span>
    </div>
    <div class="tournament-leaders-grid">
      ${renderTournamentLeaderCard('Pencetak gol terbanyak', leaders.scorers || [], 'goals', 'is-goal-leader', 'Belum ada gol tercatat.')}
      ${renderTournamentLeaderCard('Kartu kuning terbanyak', leaders.yellow || [], 'yellowCards', 'is-yellow-leader', 'Belum ada kartu kuning.')}
      ${renderTournamentLeaderCard('Kartu merah terbanyak', leaders.red || [], 'redCards', 'is-red-leader', 'Belum ada kartu merah.')}
    </div>

    ${renderTournamentFixtures(tournament)}
  </section>`;
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}



function renderTeamsPage() {
  const teams = [...state.data.teams].sort((a, b) => (a.standing?.rank || 99) - (b.standing?.rank || 99));
  return `${pageHead({
    eyebrow: 'Klub & skuad',
    title: `Semua tim.<br><span class="accent-text">Satu liga.</span>`,
    description: 'Kenali tim, form terakhir, dan pemain yang mengisi lapangan. Klasemen dihitung dari hasil pertandingan yang sudah selesai.',
    actions: '<a href="/pemain" data-link class="btn btn-ghost btn-sm">Jelajahi pemain ' + icon('arrow') + '</a>'
  })}
  <section class="wrap teams-page">
    <div class="teams-overview">
      <span><b>${state.data.teams.length}</b> tim</span>
      <span><b>${state.data.players.length}</b> pemain</span>
      <span><b>${state.data.matches.filter((match) => match.status === 'finished').length}</b> laga selesai</span>
      <span class="overview-note">${icon('trophy')} ${esc(state.data.standings[0]?.name || '—')} memimpin klasemen</span>
    </div>
    <div class="team-grid">${teams.map(teamCard).join('')}</div>
  </section>`;
}

function teamCard(team) {
  const standing = team.standing;
  return `<button type="button" class="team-card" data-action="open-team" data-id="${esc(team.id)}" style="--team:${safeColor(team.color)};--team-2:${safeColor(team.color2, '#182018')}">
    <span class="team-card-glow" aria-hidden="true"></span>
    <span class="team-card-top">
      <span class="team-rank">#${standing ? pad(standing.rank) : '—'}</span>
      <span class="form-dots">${formDots(standing ? standing.form : [])}</span>
    </span>
    <span class="team-identity">
      ${crest(team, 'lg')}
      <span class="team-card-copy"><strong>${esc(team.name)}</strong><span>${esc(team.city)} · sejak ${team.founded}</span></span>
    </span>
    <span class="team-card-record">
      <span><b>${standing ? standing.points : 0}</b><small>poin</small></span>
      <span><b>${standing ? standing.played : 0}</b><small>main</small></span>
      <span><b>${standing ? (standing.goalDiff > 0 ? '+' : '') + standing.goalDiff : 0}</b><small>selisih</small></span>
      <span><b>${team.playerCount}</b><small>pemain</small></span>
    </span>
    <span class="team-card-foot"><span>${icon('users')} ${team.playerCount} pemain terdaftar</span><span class="card-arrow">${icon('arrow')}</span></span>
  </button>`;
}

/* =========================================================
   Players
   ========================================================= */

function filteredPlayers() {
  const query = state.ui.playerSearch.trim().toLowerCase();
  const teamId = state.ui.playerTeam;
  let players = [...state.data.players];
  if (teamId) players = players.filter((player) => player.teamId === teamId);
  if (query) {
    players = players.filter((player) =>
      player.name.toLowerCase().includes(query) ||
      player.teamName.toLowerCase().includes(query) ||
      positionLabel(player.position).toLowerCase().includes(query) ||
      String(player.number).includes(query)
    );
  }
  const sort = state.ui.playerSort;
  players.sort((a, b) => {
    if (sort === 'assists') return b.assists - a.assists || b.goals - a.goals;
    if (sort === 'yellow') return b.yellowCards - a.yellowCards || b.redCards - a.redCards || a.name.localeCompare(b.name, 'id');
    if (sort === 'red') return b.redCards - a.redCards || b.yellowCards - a.yellowCards || a.name.localeCompare(b.name, 'id');
    if (sort === 'name') return a.name.localeCompare(b.name, 'id');
    if (sort === 'number') return a.number - b.number || a.name.localeCompare(b.name, 'id');
    return b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name, 'id');
  });
  return players;
}

function playersTableHtml(players) {
  if (!players.length) {
    return emptyState('search', 'Pemain tidak ditemukan', 'Coba kata kunci lain atau pilih tim yang berbeda.');
  }
  return `<div class="table-card">
    <table class="players-table">
      <thead><tr>
        <th>Pemain</th><th>Tim</th><th class="hide-mobile">Main</th><th class="align-right">Gol</th><th class="align-right">Assist</th><th class="align-right card-col">Kartu</th><th></th>
      </tr></thead>
      <tbody>
        ${players.map((player) => `<tr data-action="open-player" data-id="${esc(player.id)}" tabindex="0">
          <td>
            <span class="player-cell">
              ${avatar(player, 'md')}
              <span class="player-copy"><strong>${esc(player.name)}</strong><span>#${player.number} · ${esc(positionLabel(player.position))}<em class="mobile-team">${esc(player.teamName)}</em></span></span>
            </span>
          </td>
          <td><span class="team-inline"><span class="team-dot" style="--dot-color:${safeColor(player.teamColor)}"></span>${esc(player.teamName)}</span></td>
          <td class="hide-mobile">${player.matches}</td>
          <td class="align-right"><span class="stat-number ${player.goals >= 4 ? 'is-hot' : ''}">${player.goals}</span></td>
          <td class="align-right">${player.assists}</td>
          <td class="align-right card-col"><span class="player-cards"><span class="card-mini is-yellow" title="Kartu kuning">${player.yellowCards}</span><span class="card-mini is-red" title="Kartu merah">${player.redCards}</span></span></td>
          <td class="row-arrow">${icon('arrow')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function playerCountLabel(players) {
  const suffix = state.ui.playerSearch || state.ui.playerTeam ? 'ditemukan' : 'pemain';
  return `${players.length} ${suffix}`;
}

function refreshPlayers() {
  const results = document.getElementById('player-results');
  if (!results) return;
  const players = filteredPlayers();
  results.innerHTML = playersTableHtml(players);
  const count = document.getElementById('player-count');
  if (count) count.textContent = playerCountLabel(players);
  document.querySelectorAll('[data-team-filter]').forEach((button) => {
    const active = button.dataset.teamFilter === state.ui.playerTeam;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function renderPlayersPage() {
  const players = filteredPlayers();
  return `${pageHead({
    eyebrow: 'Direktori pemain',
    title: `Semua wajah<br><span class="accent-text">di lapangan.</span>`,
    description: 'Cari pemain, telusuri tim, dan lihat siapa yang paling sering menggetarkan jaring. Data mengikuti pertandingan yang tercatat.',
    actions: `<span class="player-total">${icon('players')} ${state.data.players.length} pemain</span>`
  })}
  <section class="wrap players-page">
    <div class="players-toolbar">
      <label class="search-box">
        ${icon('search')}
        <input id="player-search" data-focus-key="player-search" type="search" value="${esc(state.ui.playerSearch)}" placeholder="Cari nama, tim, atau nomor..." autocomplete="off" aria-label="Cari pemain">
        <span class="search-hint">Ctrl K</span>
      </label>
      <label class="sort-box">
        <span>Urutkan</span>
        <select id="player-sort" aria-label="Urutkan pemain">
          <option value="goals" ${state.ui.playerSort === 'goals' ? 'selected' : ''}>Gol terbanyak</option>
          <option value="assists" ${state.ui.playerSort === 'assists' ? 'selected' : ''}>Assist terbanyak</option>
          <option value="yellow" ${state.ui.playerSort === 'yellow' ? 'selected' : ''}>Kartu kuning</option>
          <option value="red" ${state.ui.playerSort === 'red' ? 'selected' : ''}>Kartu merah</option>
          <option value="name" ${state.ui.playerSort === 'name' ? 'selected' : ''}>Nama A–Z</option>
          <option value="number" ${state.ui.playerSort === 'number' ? 'selected' : ''}>Nomor punggung</option>
        </select>
      </label>
    </div>
    <div class="filter-row">
      <div class="filter-chips">
        <button type="button" class="filter-chip ${!state.ui.playerTeam ? 'is-active' : ''}" data-action="filter-team" data-team-filter="" aria-pressed="${!state.ui.playerTeam}">Semua tim</button>
        ${state.data.teams.map((team) => `<button type="button" class="filter-chip ${state.ui.playerTeam === team.id ? 'is-active' : ''}" data-action="filter-team" data-team-filter="${esc(team.id)}" aria-pressed="${state.ui.playerTeam === team.id}"><span class="team-dot" style="--dot-color:${safeColor(team.color)}"></span>${esc(team.short)}</button>`).join('')}
      </div>
      <span class="player-count" id="player-count">${playerCountLabel(players)}</span>
    </div>
    <div id="player-results">${playersTableHtml(players)}</div>
    <div class="players-note">${icon('spark')} Klik pemain untuk melihat profil dan statistik lengkap.</div>
  </section>`;
}

/* =========================================================
   Mabar
   ========================================================= */

function readJsonStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
}

function memberships() {
  return readJsonStorage('pertandingan_memberships', {});
}

function membershipFor(sessionId) {
  return memberships()[sessionId] || null;
}

function saveMembership(sessionId, participantId) {
  const map = memberships();
  map[sessionId] = participantId;
  localStorage.setItem('pertandingan_memberships', JSON.stringify(map));
}

function removeMembership(sessionId) {
  const map = memberships();
  delete map[sessionId];
  localStorage.setItem('pertandingan_memberships', JSON.stringify(map));
}

function joinedSession(session) {
  const participantId = membershipFor(session.id);
  return participantId ? session.participants.some((participant) => participant.id === participantId) : false;
}

function clientToken() {
  let token = localStorage.getItem('pertandingan_token');
  if (!token || !/^[a-zA-Z0-9_-]{8,80}$/.test(token)) {
    token = crypto.randomUUID();
    localStorage.setItem('pertandingan_token', token);
  }
  return token;
}

function storedName() {
  return localStorage.getItem('pertandingan_name') || '';
}

function sessionIsPast(session) {
  return parseMabarDate(session).getTime() + 2 * 60 * MINUTE_MS < Date.now();
}

function mabarCard(session) {
  const joined = joinedSession(session);
  const past = sessionIsPast(session);
  const full = session.participants.length >= session.slots;
  const remaining = Math.max(0, session.slots - session.participants.length);
  const percent = Math.min(100, (session.participants.length / session.slots) * 100);
  const date = parseMabarDate(session);
  const day = dayFormatter.format(date);
  const month = monthFormatter.format(date).replace('.', '').toUpperCase();
  const action = joined
    ? `<button type="button" class="btn btn-outline btn-sm" data-action="leave-mabar" data-id="${esc(session.id)}">${icon('check')} Terdaftar</button>`
    : past
      ? '<span class="mabar-closed">Sesi selesai</span>'
      : full
        ? '<span class="mabar-closed">Slot penuh</span>'
        : `<button type="button" class="btn btn-primary btn-sm" data-action="join-mabar" data-id="${esc(session.id)}">Ikut mabar ${icon('plus')}</button>`;

  return `<article class="mabar-card ${joined ? 'is-joined' : ''} ${past ? 'is-past' : ''}">
    <div class="mabar-card-top">
      <div class="date-tile"><strong>${day}</strong><span>${month}</span></div>
      <div class="mabar-badges"><span class="format-pill">${esc(session.format)}</span><span class="level-pill level-${session.level.toLowerCase()}">${esc(session.level)}</span></div>
    </div>
    <div class="mabar-title-row">
      <h3>${esc(session.title)}</h3>
      ${joined ? '<span class="joined-badge">' + icon('check') + ' Kamu ikut</span>' : ''}
    </div>
    <p class="mabar-venue">${icon('pin')}${esc(session.venue)}, ${esc(session.city)}</p>
    <div class="mabar-meta">
      <span>${icon('clock')}${esc(relativeDay(session))} · ${esc(session.time)} WIB</span>
      <span>${icon('users')}${esc(session.host)} sebagai host</span>
    </div>
    <div class="slot-block">
      <div class="slot-labels"><span><b>${session.participants.length}</b>/${session.slots} pemain</span><span>${remaining ? `${remaining} slot tersisa` : 'Penuh'}</span></div>
      <div class="progress-track"><span style="width:${percent}%"></span></div>
    </div>
    <div class="participants-row">
      ${avatarStack(session.participants, 5, 'sm')}
      <span class="participant-text">${session.participants.length ? `${session.participants.slice(0, 2).map((participant) => esc(participant.name)).join(', ')}${session.participants.length > 2 ? ` +${session.participants.length - 2} lainnya` : ''}` : 'Jadi yang pertama bergabung'}</span>
    </div>
    <div class="mabar-card-foot">
      <span class="price">${session.price ? idr.format(session.price) : 'Gratis'}<small>${session.price ? '/ orang' : ''}</small></span>
      ${action}
    </div>
  </article>`;
}

function renderMabarPage() {
  const sessions = [...state.data.mabar].sort((a, b) => parseMabarDate(a) - parseMabarDate(b));
  const open = sessions.filter((session) => !sessionIsPast(session));
  const totalPlayers = sessions.reduce((total, session) => total + session.participants.length, 0);
  const openSlots = open.reduce((total, session) => total + Math.max(0, session.slots - session.participants.length), 0);
  return `${pageHead({
    eyebrow: 'Komunitas',
    title: `Kurang orang?<br><span class="accent-text">Mabar saja.</span>`,
    description: 'Temukan permainan yang cocok, isi slot, dan datang. Buat sesi sendiri kalau belum ada yang pas dengan jadwalmu.',
    actions: `<button type="button" class="btn btn-primary" data-action="create-mabar">${icon('plus')} Buat mabar</button>`
  })}
  <section class="wrap mabar-page">
    <div class="mabar-summary">
      <div class="mabar-summary-main">
        <span class="summary-icon">${icon('mabar')}</span>
        <div><span class="kicker">Mabar board</span><h2>${open.length} sesi menanti</h2><p>Semua orang bisa ikut. Cukup isi nama, tanpa akun.</p></div>
      </div>
      <div class="summary-stats">
        <span><b>${totalPlayers}</b> pemain terdaftar</span>
        <span><b>${openSlots}</b> slot terbuka</span>
        <span><b>${sessions.filter((session) => session.participants.length >= session.slots).length}</b> sesi penuh</span>
      </div>
    </div>
    <div class="mabar-grid">${sessions.length ? sessions.map(mabarCard).join('') : emptyState('mabar', 'Belum ada sesi', 'Jadilah yang pertama membuat mabar di pekan ini.')}</div>
    <div class="mabar-cta">
      <div><span class="kicker">Punya lapangan dan waktu?</span><h2>Bikin sesi, ajak yang lain.</h2><p>Isi detail singkat, tentukan jumlah slot, lalu bagikan halaman ini ke grup.</p></div>
      <button type="button" class="btn btn-primary" data-action="create-mabar">${icon('plus')} Buat mabar baru</button>
    </div>
  </section>`;
}


/* =========================================================
   Modals
   ========================================================= */

function openModal(type, payload = {}) {
  state.modal = { type, payload };
  renderModal();
  document.body.classList.add('modal-open');
}

function closeModal() {
  state.modal = null;
  root.modal.innerHTML = '';
  document.body.classList.remove('modal-open');
}

function renderModal() {
  if (!state.modal) {
    root.modal.innerHTML = '';
    document.body.classList.remove('modal-open');
    return;
  }
  const { type, payload } = state.modal;
  let content = '';
  let wide = false;

  if (type === 'team') {
    content = renderTeamModal(payload.teamId);
    wide = true;
  } else if (type === 'player') {
    content = renderPlayerModal(payload.playerId);
    wide = true;
  } else if (type === 'join-mabar') {
    content = renderJoinModal(payload.sessionId);
  } else if (type === 'create-mabar') {
    content = renderCreateMabarModal();
    wide = true;
  } else if (type === 'group-team') {
    content = renderGroupTeamModal(payload.groupId);
  }

  root.modal.innerHTML = content
    ? `<div class="modal-backdrop" data-modal-backdrop>
        <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <button type="button" class="modal-close" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
          ${content}
        </div>
      </div>`
    : '';
  if (content) {
    requestAnimationFrame(() => {
      const focusTarget = root.modal.querySelector('[autofocus]') || root.modal.querySelector('input, select, textarea, button');
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    });
  }
}

function renderTeamModal(teamId) {
  const team = getTeam(teamId);
  if (!team) return '';
  const standing = team.standing;
  const roster = state.data.players
    .filter((player) => player.teamId === team.id)
    .sort((a, b) => {
      const order = { GK: 0, DF: 1, MF: 2, FW: 3 };
      return order[a.position] - order[b.position] || a.number - b.number;
    });
  const teamMatches = state.data.matches.filter((match) => match.homeId === team.id || match.awayId === team.id);
  const next = teamMatches
    .filter((match) => match.status === 'upcoming')
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0];
  const last = teamMatches
    .filter((match) => match.status === 'finished')
    .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff))[0];

  function opponentFixture(match, label) {
    if (!match) return '';
    const isHome = match.homeId === team.id;
    const opponent = isHome ? match.away : match.home;
    const score = match.status === 'upcoming' ? 'vs' : `${isHome ? match.homeScore : match.awayScore}–${isHome ? match.awayScore : match.homeScore}`;
    return `<a href="/live" data-link class="modal-fixture">
      <span class="modal-fixture-meta">${label ? `${label} · ` : ''}${match.status === 'finished' ? esc(formatDate(match.kickoff)) : esc(formatKickoff(match.kickoff))}</span>
      <span class="modal-fixture-main">${crest(opponent, 'sm')}<strong>${esc(opponent.name)}</strong><b>${score}</b></span>
    </a>`;
  }

  return `<div class="team-modal">
    <div class="team-modal-hero" style="--team:${safeColor(team.color)};--team-2:${safeColor(team.color2, '#182018')}">
      <span class="team-modal-glow" aria-hidden="true"></span>
      ${crest(team, 'xl')}
      <div class="team-modal-identity">
        <span class="kicker">Profil tim · ${esc(team.short)}</span>
        <h2 id="modal-title">${esc(team.name)}</h2>
        <p>${esc(team.city)} · berdiri sejak ${team.founded} · pelatih ${esc(team.coach)}</p>
      </div>
      <span class="rank-badge"><small>Peringkat</small><strong>#${standing ? pad(standing.rank) : '—'}</strong></span>
    </div>
    <div class="modal-body">
      <div class="team-report-bar">
        <div><span class="kicker">Laporan tim</span><p>Profil, klasemen, roster, kartu, dan statistik pemain.</p></div>
        <a class="btn btn-ghost btn-sm" href="/api/teams/${encodeURIComponent(team.id)}/report.pdf" download>${icon('download')} Unduh PDF</a>
      </div>
      <div class="modal-stat-grid">
        <div><span>Poin</span><strong>${standing ? standing.points : 0}</strong></div>
        <div><span>Main</span><strong>${standing ? standing.played : 0}</strong></div>
        <div><span>Menang</span><strong>${standing ? standing.won : 0}</strong></div>
        <div><span>Selisih gol</span><strong>${standing ? (standing.goalDiff > 0 ? '+' : '') + standing.goalDiff : 0}</strong></div>
        <div><span>Pemain</span><strong>${roster.length}</strong></div>
      </div>
      <div class="modal-two-col">
        <div class="modal-section">
          <div class="modal-section-head"><h3>Skuad</h3><span class="tiny-label">${roster.length} pemain</span></div>
          <div class="roster-list">
            ${roster.map((player) => `<button type="button" class="roster-row" data-action="open-player" data-id="${esc(player.id)}">
              <span class="roster-number">${pad(player.number)}</span>
              ${avatar(player, 'sm')}
              <span class="roster-name"><strong>${esc(player.name)}</strong><span>${esc(positionLabel(player.position))}</span></span>
              <span class="roster-stat"><b>${player.goals}</b><small>gol</small></span>
              ${icon('arrow')}
            </button>`).join('')}
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-section-head"><h3>Jadwal</h3><span class="form-dots">${formDots(standing ? standing.form : [])}</span></div>
          ${next || last
            ? `${next ? opponentFixture(next, 'Laga berikutnya') : ''}${next && last ? '<div class="modal-divider"></div>' : ''}${last ? opponentFixture(last, 'Hasil terakhir') : ''}`
            : '<p class="muted small">Belum ada jadwal untuk tim ini.</p>'}
          <div class="modal-venue">${icon('pin')} Home base: ${esc(team.venue)}</div>
        </div>
      </div>
    </div>
  </div>`;
}

function renderPlayerModal(playerId) {
  const player = getPlayer(playerId);
  if (!player) return '';
  const team = getTeam(player.teamId);
  const goalRatio = player.matches ? (player.goals / player.matches).toFixed(2) : '0.00';
  const teammates = state.data.players.filter((item) => item.teamId === player.teamId && item.id !== player.id).slice(0, 3);

  return `<div class="player-modal">
    <div class="player-modal-hero" style="--team:${safeColor(team ? team.color : '#cfff45')};--team-2:${safeColor(team ? team.color2 : '#263326', '#182018')}">
      <span class="player-modal-glow" aria-hidden="true"></span>
      <span class="player-big-number">${pad(player.number)}</span>
      ${avatar(player, 'xl')}
      <div class="player-modal-identity">
        <span class="kicker">${esc(positionLabel(player.position))} · ${esc(team ? team.short : 'FA')}</span>
        <h2 id="modal-title">${esc(player.name)}</h2>
        <button type="button" class="team-link" data-action="open-team" data-id="${esc(team ? team.id : '')}">${team ? `${teamDot(team)}${esc(team.name)}` : 'Free agent'} ${icon('arrowUp')}</button>
        ${state.isAdmin ? `<div class="player-photo-actions">
          <label class="btn btn-sm player-photo-btn" for="player-photo-file">${icon('camera')} ${player.photo ? 'Ganti foto' : 'Upload foto'}</label>
          <input id="player-photo-file" data-player-id="${esc(player.id)}" type="file" accept="image/png,image/jpeg,image/webp" hidden>
          ${player.photo ? `<button type="button" class="btn btn-sm player-photo-remove" data-action="remove-player-photo" data-id="${esc(player.id)}">${icon('trash')} Hapus</button>` : ''}
        </div>` : ''}
      </div>
    </div>
    <div class="modal-body">
      <div class="modal-stat-grid player-stats">
        <div><span>Gol</span><strong>${player.goals}</strong></div>
        <div><span>Assist</span><strong>${player.assists}</strong></div>
        <div><span>Main</span><strong>${player.matches}</strong></div>
        <div><span>Gol / laga</span><strong>${goalRatio}</strong></div>
      </div>
      <div class="player-profile-grid">
        <div class="profile-fact"><span>Nomor punggung</span><strong>#${player.number}</strong></div>
        <div class="profile-fact"><span>Posisi</span><strong>${esc(positionLabel(player.position))}</strong></div>
        <div class="profile-fact"><span>Kontribusi</span><strong>${player.goals} gol · ${player.assists} assist</strong></div>
        <div class="profile-fact"><span>Kartu</span><strong class="inline-cards"><span class="card-mini is-yellow">${player.yellowCards}</span><span class="card-mini is-red">${player.redCards}</span></strong></div>
      </div>
      <div class="modal-section-head"><h3>Rekan setim</h3><span class="tiny-label">${esc(team ? team.name : '')}</span></div>
      <div class="teammate-row">
        ${teammates.map((teammate) => `<button type="button" class="teammate-chip" data-action="open-player" data-id="${esc(teammate.id)}">${avatar(teammate, 'sm')}<span>${esc(teammate.name)}</span>${icon('arrowUp')}</button>`).join('')}
      </div>
    </div>
  </div>`;
}

function renderJoinModal(sessionId) {
  const session = getMabar(sessionId);
  if (!session) return '';
  const remaining = Math.max(0, session.slots - session.participants.length);
  return `<form class="modal-form" data-form="join-mabar">
    <span class="kicker">Konfirmasi slot</span>
    <h2 id="modal-title">Ikut ${esc(session.title)}?</h2>
    <p class="modal-lede">Kamu akan terdaftar sebagai peserta. Nama ini yang terlihat oleh pemain lain.</p>
    <input type="hidden" name="sessionId" value="${esc(session.id)}">
    <div class="join-summary">
      <span>${icon('calendar')}${esc(relativeDay(session))} · ${esc(session.time)} WIB</span>
      <span>${icon('pin')}${esc(session.venue)}</span>
      <span>${icon('users')}${remaining} slot tersisa</span>
    </div>
    <label class="field">
      <span>Nama kamu</span>
      <input name="name" value="${esc(storedName())}" placeholder="Contoh: Raka" minlength="2" maxlength="24" required autofocus>
    </label>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-action="close-modal">Batal</button>
      <button type="submit" class="btn btn-primary">Konfirmasi ikut ${icon('arrow')}</button>
    </div>
    <p class="form-hint">Dengan bergabung, kamu setuju hadir sesuai jadwal. Bisa dibatalkan kapan saja.</p>
  </form>`;
}

function renderGroupTeamModal(groupId) {
  const tournament = state.data.tournament;
  const group = tournament && (tournament.groups || []).find((item) => item.id === groupId);
  if (!tournament || !group) return '';
  const assigned = new Set(tournament.groups.flatMap((item) => item.teamIds || []));
  const available = state.data.teams.filter((team) => !assigned.has(team.id));
  const remaining = Math.max(0, tournament.teamsPerGroup - (group.teamIds || []).length);
  const locked = tournament.status === 'finished' || tournament.matchCount > 0;
  return `<div class="modal-form group-picker-modal">
    <span class="kicker">Pembagian grup</span>
    <h2 id="modal-title">Pilih tim untuk Grup ${esc(group.id)}</h2>
    <p class="modal-lede">${remaining} slot tersisa. Tim yang sudah masuk grup lain tidak ditampilkan lagi.</p>
    ${locked
      ? `<div class="group-picker-empty">${icon('lock')}<div><strong>Pembagian grup terkunci</strong><p>${tournament.status === 'finished' ? 'Turnamen sudah selesai.' : 'Jadwal grup sudah dibuat.'} Hapus jadwal atau buat turnamen baru untuk mengubahnya.</p></div></div>`
      : available.length
        ? `<div class="team-picker-list">
            ${available.map((team) => `<button type="button" class="team-picker-row" data-action="pick-group-team" data-id="${esc(team.id)}" data-group="${esc(group.id)}">
              ${crest(team, 'sm')}
              <span class="team-picker-copy"><strong>${esc(team.name)}</strong><span>${esc(team.city)} · ${team.playerCount} pemain</span></span>
              <span class="team-picker-add">${icon('plus')}</span>
            </button>`).join('')}
          </div>`
        : `<div class="group-picker-empty">${icon('users')}<div><strong>Semua tim sudah masuk grup</strong><p>Tambahkan tim baru terlebih dahulu, lalu kembali ke halaman ini.</p></div></div>`}
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-action="close-modal">Tutup</button>
      <button type="button" class="btn btn-primary" data-action="open-admin-teams">${icon('plus')} Tambah tim baru</button>
    </div>
    <p class="form-hint">Tim yang dipilih langsung masuk ke grup dan tidak muncul lagi di daftar ini.</p>
  </div>`;
}

function renderCreateMabarModal() {
  return `<form class="modal-form" data-form="create-mabar">
    <span class="kicker">Buat sesi baru</span>
    <h2 id="modal-title">Ajak orang main.</h2>
    <p class="modal-lede">Isi detail lapangan dan waktu. Kamu otomatis terdaftar sebagai host dan peserta pertama.</p>
    <div class="form-grid">
      <label class="field field-span-2"><span>Judul mabar</span><input name="title" placeholder="Mabar After Office" minlength="3" maxlength="60" required autofocus></label>
      <label class="field"><span>Tanggal</span><input name="date" type="date" value="${addDaysIso(1)}" min="${todayIso()}" required></label>
      <label class="field"><span>Jam mulai (WIB)</span><input name="time" type="time" value="19:00" required></label>
      <label class="field"><span>Lapangan</span><input name="venue" placeholder="Lapangan Cempaka" minlength="3" maxlength="80" required></label>
      <label class="field"><span>Kota</span><input name="city" placeholder="Jakarta Selatan" maxlength="60" required></label>
      <label class="field"><span>Format</span><select name="format"><option value="7v7">7v7</option><option value="5v5">5v5</option><option value="8v8">8v8</option><option value="9v9">9v9</option></select></label>
      <label class="field"><span>Level</span><select name="level"><option value="Menengah">Menengah</option><option value="Santai">Santai</option><option value="Kompetitif">Kompetitif</option></select></label>
      <label class="field"><span>Total slot</span><input name="slots" type="number" value="14" min="6" max="30" required></label>
      <label class="field"><span>Biaya / orang</span><input name="price" type="number" value="35000" min="0" max="1000000" step="5000" required></label>
      <label class="field field-span-2"><span>Nama host</span><input name="host" value="${esc(storedName())}" placeholder="Nama kamu" minlength="2" maxlength="24" required></label>
      <label class="field field-span-2"><span>Catatan <em>(opsional)</em></span><textarea name="notes" rows="3" maxlength="240" placeholder="Pakai jersey bibs, datang 15 menit lebih awal..."></textarea></label>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-action="close-modal">Batal</button>
      <button type="submit" class="btn btn-primary">Buat sesi ${icon('plus')}</button>
    </div>
  </form>`;
}

/* =========================================================
   Admin
   ========================================================= */

function renderAdminLogin() {
  const live = state.data.matches.filter((match) => match.status === 'live');
  const upcoming = state.data.matches
    .filter((match) => match.status === 'upcoming')
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const next = live[0] || upcoming[0];
  return `<section class="wrap admin-login">
    <div class="admin-login-copy">
      <span class="eyebrow"><span class="eyebrow-mark"></span>Operator area</span>
      <h1>Kendali ada<br><span class="accent-text">di tanganmu.</span></h1>
      <p>Perbarui skor, catat gol dan kartu, atur menit pertandingan, serta kelola sesi mabar. Semua perubahan langsung tampil di layar penonton.</p>
      <ul class="login-points">
        <li>${icon('wifi')}<span><b>Real-time</b> lewat Server-Sent Events</span></li>
        <li>${icon('ball')}<span><b>Skor & kejadian</b> tercatat rapi</span></li>
        <li>${icon('mabar')}<span><b>Kelola mabar</b> dari satu panel</span></li>
      </ul>
      ${next ? `<div class="login-match-preview">
        <span class="preview-label">${next.status === 'live' ? '<span class="live-dot"></span> Sedang live' : 'Laga berikutnya'}</span>
        <div class="preview-score">${crest(next.home, 'sm')}<span class="preview-team">${esc(next.home.name)}</span><b>${next.homeScore} : ${next.awayScore}</b><span class="preview-team">${esc(next.away.name)}</span>${crest(next.away, 'sm')}</div>
        <small>${esc(next.round)} · ${esc(formatKickoff(next.kickoff))}</small>
      </div>` : ''}
    </div>
    <form class="login-card" data-form="admin-login">
      <span class="kicker">Ruang operator</span>
      <h2>Masuk ke panel</h2>
      <p>Gunakan PIN operator untuk membuka kontrol pertandingan.</p>
      <label class="field">
        <span>PIN admin</span>
        <input type="password" name="pin" inputmode="numeric" autocomplete="current-password" maxlength="12" placeholder="••••" required autofocus>
      </label>
      <button type="submit" class="btn btn-primary btn-block">Masuk ${icon('arrow')}</button>
      <p class="form-hint">PIN demo: <code>2468</code>. Untuk produksi, atur lewat environment <code>ADMIN_PIN</code>.</p>
      <div class="login-security">${icon('lock')} Sesi aman, berlaku 8 jam.</div>
    </form>
  </section>`;
}

function renderAdminMatch(match) {
  const home = match.home;
  const away = match.away;
  const running = clockIsRunning(match);
  const events = match.events || [];
  const minuteValue = match.status === 'live' ? liveMinute(match) : num(match.clock?.baseMinute, 0);
  const playerOptions = [home, away].map((team) => `<optgroup label="${esc(team.name)}">
    ${state.data.players.filter((player) => player.teamId === team.id).map((player) => `<option value="${esc(player.id)}">#${player.number} ${esc(player.name)} (${esc(player.position)})</option>`).join('')}
  </optgroup>`).join('');

  return `<article class="admin-match ${match.status === 'live' ? 'is-live' : ''}">
    <div class="admin-match-head">
      <div class="admin-match-title">
        ${crest(home, 'sm')}<strong>${esc(home.short)}</strong>
        <span class="admin-score-mini">${match.homeScore} : ${match.awayScore}</span>
        <strong>${esc(away.short)}</strong>${crest(away, 'sm')}
      </div>
      <div class="admin-match-meta">${matchStatusPill(match)}<span>${esc(match.round)} · ${esc(formatKickoff(match.kickoff))}</span></div>
    </div>
    <div class="admin-score-grid">
      <div class="admin-score-side">
        <span class="admin-team-label">${teamDot(home)}${esc(home.name)}</span>
        <div class="stepper">
          <button type="button" data-action="admin-score" data-match="${esc(match.id)}" data-side="home" data-delta="-1" aria-label="Kurangi skor ${esc(home.name)}">${icon('minus')}</button>
          <b>${match.homeScore}</b>
          <button type="button" data-action="admin-score" data-match="${esc(match.id)}" data-side="home" data-delta="1" aria-label="Tambah skor ${esc(home.name)}">${icon('plus')}</button>
        </div>
      </div>
      <span class="admin-score-vs">VS</span>
      <div class="admin-score-side is-away">
        <span class="admin-team-label">${esc(away.name)}${teamDot(away)}</span>
        <div class="stepper">
          <button type="button" data-action="admin-score" data-match="${esc(match.id)}" data-side="away" data-delta="-1" aria-label="Kurangi skor ${esc(away.name)}">${icon('minus')}</button>
          <b>${match.awayScore}</b>
          <button type="button" data-action="admin-score" data-match="${esc(match.id)}" data-side="away" data-delta="1" aria-label="Tambah skor ${esc(away.name)}">${icon('plus')}</button>
        </div>
      </div>
    </div>
    <div class="admin-control-row">
      <form class="admin-inline-form" data-form="admin-match">
        <input type="hidden" name="matchId" value="${esc(match.id)}">
        <label><span>Status</span><select name="status">
          <option value="upcoming" ${match.status === 'upcoming' ? 'selected' : ''}>Belum mulai</option>
          <option value="live" ${match.status === 'live' ? 'selected' : ''}>Live</option>
          <option value="finished" ${match.status === 'finished' ? 'selected' : ''}>Selesai</option>
        </select></label>
        <label><span>Menit</span><input type="number" name="minute" min="0" max="90" value="${minuteValue}"></label>
        <button type="submit" class="btn btn-sm btn-ghost">${icon('check')} Simpan</button>
      </form>
      <button type="button" class="btn btn-sm btn-ghost" data-action="admin-clock" data-match="${esc(match.id)}" data-running="${running ? 'false' : 'true'}">
        ${running ? icon('pause') + ' Jeda' : icon('play') + ' Lanjutkan'}
      </button>
      ${match.status === 'live' ? `<button type="button" class="btn btn-sm btn-danger-soft" data-action="admin-finish" data-match="${esc(match.id)}">${icon('whistle')} Full time</button>` : ''}
    </div>
    <form class="admin-event-form" data-form="admin-event">
      <input type="hidden" name="matchId" value="${esc(match.id)}">
      <div class="admin-event-grid">
        <label><span>Kejadian</span><select name="type">
          <option value="goal">Gol</option>
          <option value="yellow">Kartu kuning</option>
          <option value="red">Kartu merah</option>
          <option value="sub">Pergantian</option>
        </select></label>
        <label><span>Pemain</span><select name="playerId" required>${playerOptions}</select></label>
        <label><span>Menit</span><input type="number" name="minute" min="0" max="120" value="${minuteValue}"></label>
      </div>
      <div class="admin-event-note">
        <input name="note" maxlength="140" placeholder="Catatan opsional, mis. Assist: Bima Saputra">
        <button type="submit" class="btn btn-sm btn-primary">${icon('plus')} Catat</button>
      </div>
    </form>
    ${events.length ? `<div class="admin-events">
      ${events.map((event) => `<div class="admin-event-row">
        <span class="admin-event-minute">${event.minute}'</span>
        ${eventGlyph(event.type)}
        <span class="admin-event-copy"><b>${esc(event.playerName)}</b><small>${esc(eventLabel(event.type))}${event.note ? ` · ${esc(event.note)}` : ''}</small></span>
        <button type="button" class="icon-button danger" data-action="delete-event" data-match="${esc(match.id)}" data-event="${esc(event.id)}" aria-label="Hapus kejadian">${icon('trash')}</button>
      </div>`).join('')}
    </div>` : '<p class="admin-empty">Belum ada kejadian tercatat.</p>'}
  </article>`;
}

function renderAdminCreateMatch() {
  return `<div class="panel admin-form-panel">
    <div class="panel-head"><div><span class="panel-kicker">Jadwal baru</span><h3>Tambah pertandingan</h3></div>${icon('calendar')}</div>
    <form data-form="admin-create-match" class="stack-form">
      <div class="form-grid">
        <label class="field"><span>Tim kandang</span><select name="homeId" required>${state.data.teams.map((team) => `<option value="${esc(team.id)}">${esc(team.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Tim tandang</span><select name="awayId" required>${state.data.teams.map((team) => `<option value="${esc(team.id)}" ${team.id === state.data.teams[1]?.id ? 'selected' : ''}>${esc(team.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Pekan</span><input name="round" value="${esc(state.data.meta.matchday)}" maxlength="30" required></label>
        <label class="field"><span>Kick-off (WIB)</span><input type="datetime-local" name="kickoff" value="${dateInputValue(1, 19)}" required></label>
        <label class="field field-span-2"><span>Lapangan</span><input name="venue" placeholder="Lapangan Cempaka" maxlength="80" required></label>
      </div>
      <button type="submit" class="btn btn-primary btn-block">${icon('plus')} Simpan pertandingan</button>
    </form>
  </div>`;
}

function renderPlayerPhotoPlaceholder() {
  return `<span class="logo-placeholder">${icon('camera')}<small>Belum ada foto</small></span>`;
}

function renderAdminAddPlayer() {
  return `<div class="panel admin-form-panel">
    <div class="panel-head"><div><span class="panel-kicker">Skuad</span><h3>Tambah pemain ke skuad</h3></div>${icon('players')}</div>
    <p class="inline-hint squad-add-hint">Tambahkan pemain baru ke tim yang sudah ada, lengkap dengan foto.</p>
    <form data-form="admin-add-player" class="stack-form">
      <div class="form-grid">
        <label class="field field-span-2"><span>Nama pemain</span><input name="name" placeholder="Nama lengkap" minlength="2" maxlength="50" required></label>
        <label class="field"><span>Tim</span><select name="teamId">${state.data.teams.map((team) => `<option value="${esc(team.id)}">${esc(team.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Posisi</span><select name="position"><option value="FW">Penyerang</option><option value="MF">Gelandang</option><option value="DF">Bek</option><option value="GK">Kiper</option></select></label>
        <label class="field"><span>Nomor punggung</span><input name="number" type="number" min="1" max="99" value="10" required></label>
        <div class="field field-span-2 player-photo-field">
          <span>Foto pemain <em>(opsional)</em></span>
          <div class="logo-upload player-photo-upload">
            <div class="logo-preview player-photo-preview" id="new-player-photo-preview">${renderPlayerPhotoPlaceholder()}</div>
            <div class="logo-upload-copy">
              <div class="logo-actions">
                <label class="btn btn-ghost btn-sm" for="new-player-photo-file">${icon('camera')} Pilih foto</label>
                <input id="new-player-photo-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
                <input id="new-player-photo-data" type="hidden" name="photo">
                <button type="button" class="btn btn-ghost btn-sm" data-action="clear-new-player-photo">${icon('x')} Hapus</button>
              </div>
              <small>PNG, JPG, atau WebP. Foto akan tampil bulat di direktori dan profil.</small>
            </div>
          </div>
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-block">${icon('plus')} Tambah pemain</button>
    </form>
  </div>`;
}

function renderRosterInputRow(index) {
  const positions = ['GK', 'DF', 'DF', 'MF', 'FW'];
  const selected = positions[index] || 'MF';
  const options = [['GK', 'Kiper'], ['DF', 'Bek'], ['MF', 'Gelandang'], ['FW', 'Penyerang']]
    .map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`)
    .join('');
  return `<div class="roster-input-row">
    <label class="roster-slot roster-photo-trigger" title="Upload foto pemain ${index + 1}" aria-label="Upload foto pemain ${index + 1}">
      <span class="roster-slot-preview">${pad(index + 1)}</span>
      <span class="roster-slot-camera">${icon('camera')}</span>
      <input class="roster-photo-input" type="file" accept="image/png,image/jpeg,image/webp" hidden>
      <input class="roster-photo-data" type="hidden" name="playerPhoto">
    </label>
    <label class="mini-field name"><span class="sr-only">Nama pemain</span><input name="playerName" aria-label="Nama pemain" maxlength="50" placeholder=""></label>
    <label class="mini-field pos"><span class="sr-only">Posisi</span><select name="playerPos" aria-label="Posisi">${options}</select></label>
    <label class="mini-field number"><span class="sr-only">Nomor punggung</span><input name="playerNumber" aria-label="Nomor punggung" type="number" min="1" max="99" placeholder=""></label>
    <button type="button" class="icon-button danger" data-action="remove-team-player" aria-label="Hapus baris pemain">${icon('trash')}</button>
  </div>`;
}

function renderLogoPlaceholder() {
  return `<span class="logo-placeholder">${icon('teams')}<small>Belum ada logo</small></span>`;
}

function renderAdminCreateTeam() {
  return `<div class="panel admin-form-panel team-create-panel">
    <div class="panel-head"><div><span class="panel-kicker">Tim baru</span><h3>Input nama tim, logo & pemain</h3></div>${icon('teams')}</div>
    <form data-form="admin-create-team" class="stack-form">
      <div class="form-grid">
        <label class="field field-span-2"><span>Nama tim</span><input name="name" placeholder="Contoh: Garuda Muda FC" minlength="2" maxlength="50" required autofocus></label>
        <label class="field"><span>Kode singkat <em>(opsional)</em></span><input name="short" placeholder="GRM" maxlength="4"></label>
        <label class="field"><span>Kota</span><input name="city" value="Jakarta" maxlength="60" required></label>
        <label class="field"><span>Pelatih <em>(opsional)</em></span><input name="coach" placeholder="Nama pelatih" maxlength="50"></label>
        <label class="field"><span>Tahun berdiri</span><input name="founded" type="number" min="1900" max="${new Date().getFullYear() + 1}" value="${new Date().getFullYear()}"></label>
        <label class="field field-span-2"><span>Lapangan / home base <em>(opsional)</em></span><input name="venue" placeholder="Lapangan Cempaka" maxlength="80"></label>
        <label class="field color-field"><span>Warna utama</span><input name="color" type="color" value="#cfff45"></label>
        <label class="field color-field"><span>Warna gelap</span><input name="color2" type="color" value="#1b241b"></label>
        <div class="field field-span-2 logo-field">
          <span>Logo tim <em>(opsional)</em></span>
          <div class="logo-upload">
            <div class="logo-preview" id="team-logo-preview">
              ${renderLogoPlaceholder()}
            </div>
            <div class="logo-upload-copy">
              <div class="logo-actions">
                <label class="btn btn-ghost btn-sm" for="team-logo-file">${icon('plus')} Pilih logo</label>
                <input id="team-logo-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
                <input id="team-logo-data" type="hidden" name="logo">
                <button type="button" class="btn btn-ghost btn-sm" data-action="clear-team-logo">${icon('x')} Hapus</button>
              </div>
              <small>PNG, JPG, atau WebP. Gambar diperkecil otomatis agar ringan.</small>
            </div>
          </div>
        </div>
      </div>
      <div class="team-form-section">
        <div class="section-subhead">
          <div><span class="kicker">Skuad awal</span><h4>Nama pemain</h4></div>
          <button type="button" class="btn btn-ghost btn-sm" data-action="add-team-player">${icon('plus')} Tambah pemain</button>
        </div>
        <p class="inline-hint">Isi minimal satu pemain. Baris yang namanya kosong akan diabaikan.</p>
        <p class="inline-hint">Klik lingkaran nomor pemain untuk upload foto. Pemain lain bisa ditambahkan nanti lewat panel Tambah pemain.</p>
        <div class="roster-input-head" aria-hidden="true">
          <span>Foto</span><span>Nama pemain</span><span>Posisi</span><span>No.</span><span></span>
        </div>
        <div id="new-team-players" class="roster-input-list">
          ${Array.from({ length: 5 }, (_, index) => renderRosterInputRow(index)).join('')}
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-block">${icon('check')} Simpan tim & pemain</button>
    </form>
  </div>`;
}

function renderAdminTeamList() {
  const teams = [...state.data.teams].sort((a, b) => (a.standing?.rank || 99) - (b.standing?.rank || 99));
  return `<div class="panel admin-form-panel">
    <div class="panel-head"><div><span class="panel-kicker">Terdaftar</span><h3>Daftar tim</h3></div><span class="tiny-label">${teams.length} tim</span></div>
    <div class="admin-team-list">
      ${teams.map((team) => `<button type="button" class="admin-team-row" data-action="open-team" data-id="${esc(team.id)}">
        ${crest(team, 'sm')}
        <span class="admin-team-copy"><strong>${esc(team.name)}</strong><span>${esc(team.city)} · ${team.playerCount} pemain</span></span>
        <span class="admin-team-rank">#${team.standing ? pad(team.standing.rank) : '—'}</span>
        ${icon('arrow')}
      </button>`).join('')}
    </div>
  </div>`;
}

function renderAdminCreateMabar() {
  return `<div class="panel admin-form-panel">
    <div class="panel-head"><div><span class="panel-kicker">Komunitas</span><h3>Buat sesi mabar</h3></div>${icon('mabar')}</div>
    <form data-form="admin-create-mabar" class="stack-form">
      <div class="form-grid">
        <label class="field field-span-2"><span>Judul</span><input name="title" placeholder="Mabar Operator" minlength="3" maxlength="60" required></label>
        <label class="field"><span>Tanggal</span><input name="date" type="date" value="${addDaysIso(2)}" min="${todayIso()}" required></label>
        <label class="field"><span>Jam (WIB)</span><input name="time" type="time" value="19:30" required></label>
        <label class="field"><span>Lapangan</span><input name="venue" placeholder="Lapangan Cempaka" maxlength="80" required></label>
        <label class="field"><span>Kota</span><input name="city" placeholder="Jakarta Selatan" maxlength="60" required></label>
        <label class="field"><span>Format</span><select name="format"><option value="7v7">7v7</option><option value="5v5">5v5</option><option value="8v8">8v8</option><option value="9v9">9v9</option></select></label>
        <label class="field"><span>Level</span><select name="level"><option value="Menengah">Menengah</option><option value="Santai">Santai</option><option value="Kompetitif">Kompetitif</option></select></label>
        <label class="field"><span>Slot</span><input name="slots" type="number" min="6" max="30" value="14" required></label>
        <label class="field"><span>Biaya / orang</span><input name="price" type="number" min="0" max="1000000" step="5000" value="35000" required></label>
        <label class="field field-span-2"><span>Nama host</span><input name="host" value="Operator" maxlength="24" required></label>
        <label class="field field-span-2"><span>Catatan</span><textarea name="notes" rows="2" maxlength="240" placeholder="Info tambahan untuk peserta..."></textarea></label>
      </div>
      <button type="submit" class="btn btn-primary btn-block">${icon('plus')} Buat sesi</button>
    </form>
  </div>`;
}

function renderAdminMabarList() {
  const sessions = [...state.data.mabar].sort((a, b) => parseMabarDate(a) - parseMabarDate(b));
  return `<div class="panel admin-form-panel">
    <div class="panel-head"><div><span class="panel-kicker">Kelola</span><h3>Sesi mabar</h3></div><span class="tiny-label">${sessions.length} sesi</span></div>
    <div class="admin-mabar-list">
      ${sessions.map((session) => `<div class="admin-mabar-row">
        <div class="admin-mabar-date"><b>${esc(session.date.slice(8, 10))}</b><span>${esc(session.time)}</span></div>
        <div class="admin-mabar-copy"><strong>${esc(session.title)}</strong><span>${esc(session.venue)} · ${session.participants.length}/${session.slots} pemain</span></div>
        <button type="button" class="icon-button danger" data-action="delete-mabar" data-id="${esc(session.id)}" aria-label="Hapus mabar">${icon('trash')}</button>
      </div>`).join('') || '<p class="muted small">Belum ada sesi mabar.</p>'}
    </div>
  </div>`;
}

function renderAdminArchive() {
  const finished = state.data.matches
    .filter((match) => match.status === 'finished')
    .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));
  return `<div class="panel admin-form-panel">
    <div class="panel-head"><div><span class="panel-kicker">Arsip</span><h3>Hasil selesai</h3></div><span class="tiny-label">${finished.length} laga</span></div>
    <div class="admin-archive-list">
      ${finished.slice(0, 8).map((match) => `<div class="admin-archive-row">
        <span>${esc(formatDate(match.kickoff))}</span>
        <b>${esc(match.home.short)} ${match.homeScore}–${match.awayScore} ${esc(match.away.short)}</b>
        <small>${esc(match.round)}</small>
      </div>`).join('')}
    </div>
  </div>`;
}

function renderAdminTournamentSettings() {
  const tournament = state.data.tournament;
  if (!tournament) return emptyState('trophy', 'Turnamen belum tersedia', 'Muat ulang server untuk menyiapkan turnamen.');
  const startsAt = toDateTimeLocalValue(tournament.startsAt);
  return `<div class="panel admin-form-panel">
    <div class="panel-head"><div><span class="panel-kicker">Event</span><h3>Pengaturan turnamen</h3></div>${icon('trophy')}</div>
    <form data-form="admin-tournament-settings" class="stack-form form-labels-hidden">
      <div class="form-grid">
        <label class="field field-span-2"><span>Nama turnamen</span><input name="name" value="${esc(tournament.name)}" placeholder="Contoh: Gajah Emas Cup 2027" minlength="3" maxlength="80" required></label>
        <label class="field"><span>Status</span><select name="status">
          <option value="upcoming" ${tournament.status === 'upcoming' ? 'selected' : ''}>Rencana</option>
          <option value="live" ${tournament.status === 'live' ? 'selected' : ''}>Berlangsung</option>
          <option value="finished" ${tournament.status === 'finished' ? 'selected' : ''}>Selesai</option>
        </select></label>
        <label class="field"><span>Format grup</span><select name="teamsPerGroup" ${tournament.matchCount ? 'disabled' : ''}>
          <option value="3" ${tournament.teamsPerGroup === 3 ? 'selected' : ''}>4 grup × 3 tim</option>
          <option value="4" ${tournament.teamsPerGroup === 4 ? 'selected' : ''}>4 grup × 4 tim</option>
        </select></label>
        <label class="field"><span>Tanggal mulai (WIB)</span><input name="startsAt" type="datetime-local" value="${esc(startsAt)}" required></label>
        <label class="field"><span>Lapangan utama</span><input name="venue" value="${esc(tournament.venue)}" placeholder="Contoh: Lapangan Cempaka" maxlength="80" required></label>
        <label class="field field-span-2"><span>Catatan / aturan</span><textarea name="notes" rows="2" maxlength="300" placeholder="Contoh: 2 teratas setiap grup lolos ke 8 besar.">${esc(tournament.notes)}</textarea></label>
      </div>
      ${tournament.matchCount ? '<p class="admin-lock-note">Format grup dikunci karena jadwal sudah dibuat. Hapus jadwal grup untuk mengubahnya.</p>' : ''}
      <button type="submit" class="btn btn-primary btn-block">${icon('check')} Simpan pengaturan</button>
    </form>
    <div class="admin-danger-zone">
      <button type="button" class="btn btn-danger-soft btn-block" data-action="admin-close-tournament">${icon('whistle')} Tutup & selesaikan turnamen</button>
      <p>Selesaikan semua pertandingan grup terlebih dahulu. Setelah ditutup, kamu bisa membuat turnamen baru.</p>
    </div>
  </div>`;
}

function renderAdminTournamentGroups() {
  const tournament = state.data.tournament;
  if (!tournament) return '';
  const locked = tournament.matchCount > 0 || tournament.status === 'finished';
  const assigned = new Set(tournament.groups.flatMap((group) => group.teamIds));
  const availableCount = state.data.teams.filter((team) => !assigned.has(team.id)).length;
  return `<div class="panel admin-form-panel">
    <div class="panel-head"><div><span class="panel-kicker">Pembagian grup</span><h3>Tim per grup</h3></div><span class="tiny-label">${tournament.slotsFilled}/${tournament.slotTotal}</span></div>
    <p class="inline-hint">Klik slot kosong untuk memasukkan tim. Tim yang sudah masuk grup tidak akan muncul lagi di daftar pilihan.</p>
    <div class="admin-group-board">
      ${tournament.groups.map((group) => {
        const teams = (group.teamIds || []).map(getTeam).filter(Boolean);
        const empty = Math.max(0, tournament.teamsPerGroup - teams.length);
        return `<div class="admin-group-card">
          <div class="admin-group-card-head">
            <span class="group-letter">${esc(group.id)}</span>
            <div><span class="kicker">Grup ${esc(group.id)}</span><h4>${teams.length}/${tournament.teamsPerGroup} tim</h4></div>
          </div>
          <div class="admin-group-slot-list">
            ${teams.map((team) => `<div class="admin-group-team-row">
              ${crest(team, 'sm')}
              <span class="admin-group-team-name">${esc(team.name)}</span>
              ${locked ? '' : `<button type="button" class="icon-button danger admin-group-remove" data-action="remove-group-team" data-team="${esc(team.id)}" data-group="${esc(group.id)}" aria-label="Keluarkan ${esc(team.name)} dari Grup ${esc(group.id)}">${icon('x')}</button>`}
            </div>`).join('')}
            ${Array.from({ length: empty }, () => `<button type="button" class="admin-group-empty-slot" data-action="open-group-picker" data-group="${esc(group.id)}" ${locked ? 'disabled' : ''}>
              <span class="admin-slot-plus">${icon('plus')}</span>
              <span>${locked ? 'Slot kosong' : 'Pilih tim'}</span>
            </button>`).join('')}
            ${empty === 0 ? '<div class="admin-group-full">Grup penuh</div>' : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="admin-group-board-foot">
      <span>${availableCount} tim belum masuk grup.</span>
      ${locked ? '<span class="admin-lock-inline">Pembagian grup dikunci karena jadwal sudah dibuat.</span>' : ''}
      <button type="button" class="text-link" data-action="open-admin-teams">Tambah tim baru ${icon('arrow')}</button>
    </div>
  </div>`;
}

function renderAdminTournamentHistory() {
  const history = state.data.tournamentHistory || [];
  return `<div class="panel admin-form-panel">
    <div class="panel-head"><div><span class="panel-kicker">Arsip</span><h3>Riwayat turnamen</h3></div><span class="tiny-label">${history.length} event</span></div>
    ${history.length ? `<div class="admin-tournament-history">
      ${history.map((item) => `<div class="admin-history-row">
        <span class="admin-history-icon">${icon('trophy')}</span>
        <span class="admin-history-copy"><strong>${esc(item.name)}</strong><span>${esc(formatDate(item.startsAt))} · ${item.teamCount} tim · ${item.matchCount} laga</span></span>
      </div>`).join('')}
    </div>` : '<p class="inline-hint">Belum ada turnamen yang diarsipkan.</p>'}
  </div>`;
}

function renderNewTournamentPanel() {
  return `<div class="panel admin-form-panel new-tournament-panel">
    <div class="panel-head"><div><span class="panel-kicker">Turnamen berikutnya</span><h3>Buat turnamen baru</h3></div>${icon('spark')}</div>
    <p class="inline-hint">Turnamen yang selesai akan masuk riwayat. Pertandingan dan statistiknya tetap tersimpan.</p>
    <form data-form="admin-new-tournament" class="stack-form form-labels-hidden">
      <div class="form-grid">
        <label class="field field-span-2"><span>Nama turnamen baru</span><input name="name" placeholder="Contoh: Piala Antar Kampung 2027" minlength="3" maxlength="80" required autofocus></label>
        <label class="field"><span>Format grup</span><select name="teamsPerGroup">
          <option value="3">4 grup × 3 tim</option>
          <option value="4">4 grup × 4 tim</option>
        </select></label>
        <label class="field"><span>Tanggal mulai (WIB)</span><input name="startsAt" type="datetime-local" value="${dateInputValue(21, 9)}" required></label>
        <label class="field"><span>Lapangan utama</span><input name="venue" placeholder="Contoh: Lapangan Cempaka" maxlength="80" required></label>
        <label class="field"><span>Catatan / aturan</span><textarea name="notes" rows="2" maxlength="300" placeholder="Contoh: 2 teratas setiap grup lolos ke 8 besar."></textarea></label>
      </div>
      <button type="submit" class="btn btn-primary btn-block">${icon('plus')} Buat turnamen baru</button>
    </form>
  </div>`;
}

function renderAdminTournamentFixtures() {
  const tournament = state.data.tournament;
  if (!tournament) return '';
  const fixtures = state.data.matches
    .filter((match) => match.tournamentId === tournament.id)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const complete = tournament.groups.every((group) => group.standings.length === tournament.teamsPerGroup);
  const canDelete = fixtures.length > 0 && fixtures.every((match) => match.status === 'upcoming');
  const missingGroups = tournament.groups
    .filter((group) => group.standings.length < tournament.teamsPerGroup)
    .map((group) => `${group.id}: ${group.standings.length}/${tournament.teamsPerGroup}`);
  return `<div class="panel admin-form-panel">
    <div class="panel-head"><div><span class="panel-kicker">Jadwal</span><h3>Fase grup</h3></div><span class="tiny-label">${fixtures.length ? `${fixtures.length} laga` : 'Belum dibuat'}</span></div>
    <div class="fixture-build-state">
      <span class="fixture-state-icon ${complete ? 'is-ready' : ''}">${icon(complete ? 'check' : 'users')}</span>
      <div><strong>${complete ? 'Semua grup siap' : 'Slot grup belum lengkap'}</strong><p>${complete ? 'Jadwal round-robin bisa dibuat untuk seluruh grup.' : `Lengkapi slot berikut: ${missingGroups.join(', ')}.`}</p></div>
    </div>
    ${fixtures.length ? `<div class="admin-tournament-fixtures">
      ${fixtures.map((match) => `<div class="admin-tournament-fixture">
        <span class="admin-fixture-group">${esc(match.groupId)}</span>
        <span class="admin-fixture-teams">${crest(match.home, 'xs')}<span>${esc(match.home.short)}</span><b>${match.homeScore}–${match.awayScore}</b><span>${esc(match.away.short)}</span>${crest(match.away, 'xs')}</span>
        <span class="admin-fixture-date">${esc(formatDate(match.kickoff))} · ${esc(formatTime(match.kickoff))}</span>
        ${matchStatusPill(match)}
      </div>`).join('')}
    </div>
    <button type="button" class="btn btn-danger-soft btn-block" data-action="admin-delete-fixtures" ${canDelete ? '' : 'disabled'}>${icon('trash')} Hapus jadwal grup</button>
    ${canDelete ? '<p class="admin-lock-note">Hapus jadwal hanya bisa dilakukan selama semua laga masih upcoming dan belum memiliki hasil.</p>' : '<p class="admin-lock-note">Jadwal tidak bisa dihapus karena sudah ada laga live/selesai.</p>'}`
      : `<button type="button" class="btn btn-primary btn-block" data-action="admin-generate-fixtures" ${complete ? '' : 'disabled'}>${icon('calendar')} Buat jadwal round-robin</button>
         <p class="admin-lock-note">${complete ? 'Sistem akan membuat semua pertemuan antartim di setiap grup.' : 'Penuhi semua slot grup terlebih dahulu.'}</p>`}
    <a href="/turnamen" data-link class="panel-link">Lihat halaman turnamen ${icon('arrow')}</a>
  </div>`;
}

function renderAdminTournamentTab() {
  const tournament = state.data.tournament;
  if (!tournament) {
    return `<div class="panel admin-form-panel"><div class="panel-head"><div><span class="panel-kicker">Event</span><h3>Turnamen belum tersedia</h3></div>${icon('trophy')}</div><p class="inline-hint">Muat ulang server untuk menyiapkan turnamen.</p></div>`;
  }
  const notePanel = `<div class="panel admin-note-panel">
    <span class="summary-icon">${icon('trophy')}</span>
    <h3>Keterangan lolos</h3>
    <p>${tournament.qualifyPerGroup} tim teratas dari setiap grup lolos ke babak ${tournament.qualifyPerGroup * tournament.groups.length} besar.</p>
    <span class="admin-server-state is-online"><span class="online-dot"></span>Klasemen dari laga selesai</span>
  </div>`;
  if (tournament.status === 'finished') {
    return `<div class="admin-layout">
      <div class="admin-main">
        <div class="panel admin-finished-panel">
          <span class="summary-icon">${icon('check')}</span>
          <div><span class="kicker">Turnamen selesai</span><h3>${esc(tournament.name)}</h3><p>${tournament.slotsFilled} tim · ${tournament.matchCount} pertandingan · siap digantikan turnamen baru.</p></div>
          <a href="/turnamen" data-link class="btn btn-ghost btn-sm">Lihat hasil ${icon('arrow')}</a>
        </div>
        ${renderNewTournamentPanel()}
      </div>
      <aside class="admin-side">
        ${renderAdminTournamentHistory()}
        ${notePanel}
      </aside>
    </div>`;
  }
  return `<div class="admin-layout">
    <div class="admin-main">
      ${renderAdminTournamentSettings()}
      ${renderAdminTournamentGroups()}
      ${renderAdminTournamentFixtures()}
    </div>
    <aside class="admin-side">
      ${renderAdminTournamentHistory()}
      ${notePanel}
    </aside>
  </div>`;
}

function renderAdminDashboard() {
  const activeMatches = state.data.matches
    .filter((match) => match.status === 'live' || match.status === 'upcoming')
    .sort((a, b) => {
      if (a.status === 'live' && b.status !== 'live') return -1;
      if (b.status === 'live' && a.status !== 'live') return 1;
      return new Date(a.kickoff) - new Date(b.kickoff);
    });
  const liveCount = state.data.matches.filter((match) => match.status === 'live').length;
  const tab = state.ui.adminTab || 'live';

  return `<section class="wrap admin-page">
    <div class="admin-topbar">
      <div>
        <span class="eyebrow"><span class="eyebrow-mark"></span>Operator console</span>
        <h1>Ruang <span class="accent-text">kontrol.</span></h1>
        <p>Setiap perubahan langsung tersiar ke semua layar penonton.</p>
      </div>
      <div class="admin-topbar-actions">
        <span class="live-count ${liveCount ? '' : 'is-idle'}"><span class="live-dot"></span>${liveCount ? `${liveCount} live` : 'idle'}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-action="admin-logout">${icon('logout')} Keluar</button>
      </div>
    </div>
    <div class="admin-tabs">
      <button type="button" class="admin-tab ${tab === 'live' ? 'is-active' : ''}" data-action="admin-tab" data-tab="live">${icon('live')} Kontrol live</button>
      <button type="button" class="admin-tab ${tab === 'tournament' ? 'is-active' : ''}" data-action="admin-tab" data-tab="tournament">${icon('trophy')} Turnamen</button>
      <button type="button" class="admin-tab ${tab === 'teams' ? 'is-active' : ''}" data-action="admin-tab" data-tab="teams">${icon('teams')} Tim & pemain</button>
      <button type="button" class="admin-tab ${tab === 'data' ? 'is-active' : ''}" data-action="admin-tab" data-tab="data">${icon('mabar')} Mabar & arsip</button>
    </div>
    ${tab === 'live' ? `<div class="admin-layout">
      <div class="admin-main">
        <div class="section-head compact"><div><span class="kicker">Pertandingan aktif</span><h2>Kontrol skor</h2></div><span class="tiny-label">${activeMatches.length} laga</span></div>
        <div class="admin-match-list">${activeMatches.length ? activeMatches.map(renderAdminMatch).join('') : emptyState('ball', 'Tidak ada laga aktif', 'Tambahkan pertandingan baru di bawah.')}</div>
        ${renderAdminCreateMatch()}
      </div>
      <aside class="admin-side">
        <div class="panel admin-note-panel">
          <span class="summary-icon">${icon('wifi')}</span>
          <h3>Siaran langsung</h3>
          <p>${state.connected ? `Terhubung · ${state.data.online} layar aktif` : 'Koneksi live terputus. Data tetap tersimpan.'}</p>
          <span class="admin-server-state ${state.connected ? 'is-online' : ''}"><span class="online-dot"></span>${state.connected ? 'SSE tersambung' : 'Menyambungkan ulang...'}</span>
        </div>
        ${renderAdminArchive()}
      </aside>
    </div>` : tab === 'tournament' ? renderAdminTournamentTab() : tab === 'teams' ? `<div class="admin-layout">
      <div class="admin-main">
        ${renderAdminCreateTeam()}
      </div>
      <aside class="admin-side">
        ${renderAdminAddPlayer()}
        ${renderAdminTeamList()}
      </aside>
    </div>` : `<div class="admin-layout">
      <div class="admin-main">
        ${renderAdminCreateMabar()}
      </div>
      <aside class="admin-side">
        ${renderAdminMabarList()}
        ${renderAdminArchive()}
      </aside>
    </div>`}
  </section>`;
}

function renderAdminPage() {
  return state.isAdmin ? renderAdminDashboard() : renderAdminLogin();
}


/* =========================================================
   Network + feedback
   ========================================================= */

async function api(path, options = {}) {
  const request = {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  };
  if (options.body !== undefined) {
    request.headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Permintaan gagal (${response.status}).`);
  return payload;
}

async function refreshState() {
  const data = await api('/api/state');
  state.data = data;
  state.isAdmin = Boolean(data.isAdmin);
  state.serverOffset = data.serverNow - Date.now();
  renderAll({ preserveFocus: true });
  if (state.modal) renderModal();
}

function toast(message, type = 'success') {
  const element = document.createElement('div');
  element.className = `toast toast-${type}`;
  element.innerHTML = `<span class="toast-icon">${icon(type === 'error' ? 'x' : type === 'info' ? 'spark' : 'check')}</span><span>${esc(message)}</span>`;
  root.toast.appendChild(element);
  requestAnimationFrame(() => element.classList.add('is-visible'));
  setTimeout(() => {
    element.classList.remove('is-visible');
    setTimeout(() => element.remove(), 250);
  }, 3800);
}

function busy(button, active) {
  if (!button) return;
  if (active) {
    button.dataset.original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> Memproses';
  } else {
    button.disabled = false;
    if (button.dataset.original) button.innerHTML = button.dataset.original;
  }
}

function navigate(path) {
  if (path === `${location.pathname}${location.search}${location.hash}`) return;
  history.pushState({}, '', path);
  closeModal();
  window.scrollTo({ top: 0, behavior: 'instant' });
  renderAll({ preserveFocus: false });
}

function connectStream() {
  if (!('EventSource' in window)) {
    setInterval(() => refreshState().catch(() => {}), 15000);
    return;
  }
  const source = new EventSource('/api/stream');
  source.addEventListener('state', (event) => {
    try {
      const incoming = JSON.parse(event.data);
      const wasAdmin = state.isAdmin;
      state.data = incoming;
      state.isAdmin = wasAdmin;
      state.serverOffset = incoming.serverNow - Date.now();
      state.connected = true;
      if (!state.loading) renderAll({ preserveFocus: true });
    } catch {
      /* Abaikan payload rusak; koneksi akan mengirim state berikutnya. */
    }
  });
  source.onopen = () => {
    state.connected = true;
    renderHeader();
  };
  source.onerror = () => {
    state.connected = false;
    renderHeader();
  };
}

/* =========================================================
   Actions
   ========================================================= */

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca file logo.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Gambar logo tidak bisa dibaca.'));
    image.src = source;
  });
}

async function prepareImageUpload(file) {
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
    throw new Error('Logo harus berupa PNG, JPG, atau WebP.');
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('Ukuran file logo maksimal 5 MB.');
  const source = await readFileAsDataUrl(file);
  const image = await loadImageElement(source);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('Ukuran gambar logo tidak valid.');
  const scale = Math.min(1, 512 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const result = canvas.toDataURL('image/webp', 0.9);
  if (!/^data:image\/(png|jpeg|webp);base64,/i.test(result)) throw new Error('Format logo tidak didukung browser ini.');
  if (result.length > 2.5 * 1024 * 1024) throw new Error('Logo masih terlalu besar, coba gambar lain.');
  return result;
}

async function handleTeamLogoFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const dataInput = document.getElementById('team-logo-data');
  const preview = document.getElementById('team-logo-preview');
  try {
    const dataUrl = await prepareImageUpload(file);
    if (dataInput) dataInput.value = dataUrl;
    if (preview) {
      preview.classList.add('has-image');
      preview.innerHTML = `<img src="${esc(dataUrl)}" alt="Pratinjau logo tim">`;
    }
    toast('Logo siap dipakai.', 'info');
  } catch (error) {
    input.value = '';
    if (dataInput) dataInput.value = '';
    toast(error.message, 'error');
  }
}

async function handleNewPlayerPhoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const dataInput = document.getElementById('new-player-photo-data');
  const preview = document.getElementById('new-player-photo-preview');
  try {
    const dataUrl = await prepareImageUpload(file);
    if (dataInput) dataInput.value = dataUrl;
    if (preview) {
      preview.classList.add('has-image');
      preview.innerHTML = `<img src="${esc(dataUrl)}" alt="Pratinjau foto pemain">`;
    }
    toast('Foto pemain siap dipakai.', 'info');
  } catch (error) {
    input.value = '';
    if (dataInput) dataInput.value = '';
    toast(error.message, 'error');
  }
}

async function handleRosterPhotoInput(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const row = input.closest('.roster-input-row');
  if (!row) return;
  const dataInput = row.querySelector('.roster-photo-data');
  const preview = row.querySelector('.roster-slot-preview');
  const slot = row.querySelector('.roster-slot');
  try {
    const dataUrl = await prepareImageUpload(file);
    if (dataInput) dataInput.value = dataUrl;
    if (preview) preview.innerHTML = `<img src="${esc(dataUrl)}" alt="">`;
    if (slot) {
      slot.classList.add('has-photo');
      slot.title = 'Ganti foto pemain';
    }
  } catch (error) {
    input.value = '';
    toast(error.message, 'error');
  }
}

async function handlePlayerPhotoUpload(input) {
  const file = input.files && input.files[0];
  const playerId = input.dataset.playerId;
  if (!file || !playerId) return;
  try {
    const dataUrl = await prepareImageUpload(file);
    await api(`/api/admin/players/${encodeURIComponent(playerId)}`, {
      method: 'PATCH',
      body: { photo: dataUrl }
    });
    await refreshState();
    toast('Foto pemain diperbarui.');
  } catch (error) {
    input.value = '';
    toast(error.message, 'error');
  }
}

async function handleAction(element, event) {
  const action = element.dataset.action;

  if (action === 'open-team') {
    event.preventDefault();
    openModal('team', { teamId: element.dataset.id });
    return;
  }

  if (action === 'open-player') {
    event.preventDefault();
    openModal('player', { playerId: element.dataset.id });
    return;
  }

  if (action === 'close-modal') {
    event.preventDefault();
    closeModal();
    return;
  }

  if (action === 'create-mabar') {
    event.preventDefault();
    openModal('create-mabar');
    return;
  }

  if (action === 'join-mabar') {
    event.preventDefault();
    openModal('join-mabar', { sessionId: element.dataset.id });
    return;
  }

  if (action === 'leave-mabar') {
    event.preventDefault();
    const id = element.dataset.id;
    const session = getMabar(id);
    if (!session) return;
    if (!window.confirm(`Batalkan keikutsertaan di ${session.title}?`)) return;
    try {
      await api(`/api/mabar/${encodeURIComponent(id)}/leave`, { method: 'POST', body: { token: clientToken() } });
      removeMembership(id);
      await refreshState();
      toast('Keikutsertaan dibatalkan.');
    } catch (error) {
      removeMembership(id);
      await refreshState();
      toast(error.message, 'error');
    }
    return;
  }

  if (action === 'filter-team') {
    event.preventDefault();
    state.ui.playerTeam = element.dataset.teamFilter || '';
    refreshPlayers();
    return;
  }

  if (action === 'toggle-theme') {
    event.preventDefault();
    const next = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    renderHeader();
    toast(`Mode ${next === 'light' ? 'terang' : 'gelap'} aktif.`, 'info');
    return;
  }

  if (action === 'retry') {
    event.preventDefault();
    boot();
    return;
  }

  if (action === 'add-team-player') {
    event.preventDefault();
    const list = document.getElementById('new-team-players');
    if (!list) return;
    const rows = list.querySelectorAll('.roster-input-row');
    if (rows.length >= 30) {
      toast('Maksimal 30 pemain per tim.', 'error');
      return;
    }
    list.insertAdjacentHTML('beforeend', renderRosterInputRow(rows.length));
    const newRow = list.lastElementChild;
    const input = newRow && newRow.querySelector('input[name="playerName"]');
    if (input) input.focus();
    return;
  }

  if (action === 'remove-team-player') {
    event.preventDefault();
    const row = element.closest('.roster-input-row');
    if (!row) return;
    const list = row.parentElement;
    if (list.querySelectorAll('.roster-input-row').length <= 1) {
      toast('Minimal satu baris pemain.', 'error');
      return;
    }
    row.remove();
    return;
  }

  if (action === 'clear-team-logo') {
    event.preventDefault();
    const dataInput = document.getElementById('team-logo-data');
    const fileInput = document.getElementById('team-logo-file');
    const preview = document.getElementById('team-logo-preview');
    if (dataInput) dataInput.value = '';
    if (fileInput) fileInput.value = '';
    if (preview) {
      preview.classList.remove('has-image');
      preview.innerHTML = renderLogoPlaceholder();
    }
    return;
  }

  if (action === 'clear-new-player-photo') {
    event.preventDefault();
    const dataInput = document.getElementById('new-player-photo-data');
    const fileInput = document.getElementById('new-player-photo-file');
    const preview = document.getElementById('new-player-photo-preview');
    if (dataInput) dataInput.value = '';
    if (fileInput) fileInput.value = '';
    if (preview) {
      preview.classList.remove('has-image');
      preview.innerHTML = renderPlayerPhotoPlaceholder();
    }
    return;
  }

  if (action === 'remove-player-photo') {
    event.preventDefault();
    const player = getPlayer(element.dataset.id);
    if (!player) return;
    if (!window.confirm(`Hapus foto ${player.name}?`)) return;
    try {
      await api(`/api/admin/players/${encodeURIComponent(player.id)}`, {
        method: 'PATCH',
        body: { photo: null }
      });
      await refreshState();
      toast('Foto pemain dihapus.');
    } catch (error) {
      toast(error.message, 'error');
    }
    return;
  }

  if (action === 'home-leader') {
    event.preventDefault();
    const leader = element.dataset.leader;
    state.ui.homeLeader = ['goals', 'yellow', 'red'].includes(leader) ? leader : 'goals';
    renderPage();
    return;
  }

  if (action === 'match-filter') {
    event.preventDefault();
    state.ui.matchFilter = element.dataset.filter || 'all';
    renderPage();
    return;
  }

  if (action === 'open-admin-tournament') {
    event.preventDefault();
    state.ui.adminTab = 'tournament';
    navigate('/admin');
    return;
  }

  if (action === 'open-group-picker') {
    event.preventDefault();
    openModal('group-team', { groupId: element.dataset.group });
    return;
  }

  if (action === 'pick-group-team') {
    event.preventDefault();
    const teamId = element.dataset.id;
    const groupId = element.dataset.group;
    const team = getTeam(teamId);
    try {
      const assignments = currentTournamentAssignments();
      assignments[teamId] = groupId;
      await api('/api/admin/tournament', { method: 'PATCH', body: { assignments } });
      closeModal();
      await refreshState();
      toast(`${team ? team.name : 'Tim'} masuk Grup ${groupId}.`);
    } catch (error) {
      toast(error.message, 'error');
    }
    return;
  }

  if (action === 'remove-group-team') {
    event.preventDefault();
    const team = getTeam(element.dataset.team);
    const groupId = element.dataset.group;
    if (!window.confirm(`Keluarkan ${team ? team.name : 'tim ini'} dari Grup ${groupId}?`)) return;
    try {
      const assignments = currentTournamentAssignments();
      delete assignments[element.dataset.team];
      await api('/api/admin/tournament', { method: 'PATCH', body: { assignments } });
      await refreshState();
      toast(`${team ? team.name : 'Tim'} dikeluarkan dari Grup ${groupId}.`);
    } catch (error) {
      toast(error.message, 'error');
    }
    return;
  }

  if (action === 'open-admin-teams') {
    event.preventDefault();
    state.ui.adminTab = 'teams';
    closeModal();
    navigate('/admin');
    return;
  }

  if (action === 'admin-close-tournament') {
    event.preventDefault();
    const tournament = state.data.tournament;
    if (!window.confirm(`Tutup dan selesaikan ${tournament ? tournament.name : 'turnamen ini'}? Pastikan semua pertandingan grup sudah selesai.`)) return;
    try {
      await api('/api/admin/tournament', { method: 'PATCH', body: { status: 'finished' } });
      await refreshState();
      toast('Turnamen ditutup. Kamu bisa membuat turnamen baru.');
    } catch (error) {
      toast(error.message, 'error');
    }
    return;
  }

  if (action === 'admin-generate-fixtures') {
    event.preventDefault();
    try {
      const result = await api('/api/admin/tournament/fixtures', { method: 'POST', body: {} });
      await refreshState();
      toast(`${result.count} pertandingan fase grup berhasil dibuat.`);
    } catch (error) {
      toast(error.message, 'error');
    }
    return;
  }

  if (action === 'admin-delete-fixtures') {
    event.preventDefault();
    if (!window.confirm('Hapus seluruh jadwal fase grup? Hasil pertandingan belum ada, jadi aman untuk disusun ulang.')) return;
    try {
      const result = await api('/api/admin/tournament/fixtures', { method: 'DELETE' });
      await refreshState();
      toast(`${result.count} jadwal fase grup dihapus.`, 'info');
    } catch (error) {
      toast(error.message, 'error');
    }
    return;
  }

  if (action === 'admin-tab') {
    event.preventDefault();
    state.ui.adminTab = element.dataset.tab || 'live';
    renderPage();
    return;
  }

  if (action === 'admin-score') {
    event.preventDefault();
    const matchId = element.dataset.match;
    try {
      await api(`/api/admin/matches/${encodeURIComponent(matchId)}/score`, {
        method: 'POST',
        body: { side: element.dataset.side, delta: Number(element.dataset.delta) }
      });
      await refreshState();
      toast('Skor diperbarui.');
    } catch (error) {
      toast(error.message, 'error');
    }
    return;
  }

  if (action === 'admin-clock') {
    event.preventDefault();
    const matchId = element.dataset.match;
    const running = element.dataset.running === 'true';
    try {
      await api(`/api/admin/matches/${encodeURIComponent(matchId)}`, {
        method: 'PATCH',
        body: { running }
      });
      await refreshState();
      toast(running ? 'Jam pertandingan dilanjutkan.' : 'Jam pertandingan dijeda.');
    } catch (error) {
      toast(error.message, 'error');
    }
    return;
  }

  if (action === 'admin-finish') {
    event.preventDefault();
    const matchId = element.dataset.match;
    const match = getMatch(matchId);
    if (!match) return;
    if (!window.confirm(`Selesaikan ${match.home.name} vs ${match.away.name}? Skor akan menjadi hasil akhir.`)) return;
    try {
      await api(`/api/admin/matches/${encodeURIComponent(matchId)}`, {
        method: 'PATCH',
        body: { status: 'finished' }
      });
      await refreshState();
      toast('Pertandingan ditandai selesai.');
    } catch (error) {
      toast(error.message, 'error');
    }
    return;
  }

  if (action === 'delete-event') {
    event.preventDefault();
    if (!window.confirm('Hapus catatan kejadian ini? Skor gol akan disesuaikan.')) return;
    try {
      await api(`/api/admin/matches/${encodeURIComponent(element.dataset.match)}/events/${encodeURIComponent(element.dataset.event)}`, { method: 'DELETE' });
      await refreshState();
      toast('Kejadian dihapus.');
    } catch (error) {
      toast(error.message, 'error');
    }
    return;
  }

  if (action === 'delete-mabar') {
    event.preventDefault();
    const session = getMabar(element.dataset.id);
    if (!session) return;
    if (!window.confirm(`Hapus sesi ${session.title}?`)) return;
    try {
      await api(`/api/admin/mabar/${encodeURIComponent(session.id)}`, { method: 'DELETE' });
      removeMembership(session.id);
      await refreshState();
      toast('Sesi mabar dihapus.');
    } catch (error) {
      toast(error.message, 'error');
    }
    return;
  }

  if (action === 'admin-logout') {
    event.preventDefault();
    try {
      await api('/api/admin/logout', { method: 'POST' });
      state.isAdmin = false;
      if (state.data) state.data.isAdmin = false;
      renderAll({ preserveFocus: false });
      toast('Kamu sudah keluar dari panel operator.', 'info');
    } catch (error) {
      toast(error.message, 'error');
    }
  }
}

/* =========================================================
   Forms
   ========================================================= */

async function handleForm(form) {
  const name = form.dataset.form;
  const values = Object.fromEntries(new FormData(form).entries());
  const submit = form.querySelector('[type="submit"]');

  if (name === 'admin-login') {
    busy(submit, true);
    try {
      await api('/api/admin/login', { method: 'POST', body: { pin: String(values.pin || '') } });
      await refreshState();
      toast('Mode operator aktif. Selamat bekerja.');
    } catch (error) {
      toast(error.message, 'error');
      const input = form.querySelector('input[name="pin"]');
      if (input) {
        input.value = '';
        input.focus();
      }
    } finally {
      busy(submit, false);
    }
    return;
  }

  if (name === 'join-mabar') {
    const sessionId = String(values.sessionId || '');
    const displayName = String(values.name || '').trim();
    busy(submit, true);
    try {
      const result = await api(`/api/mabar/${encodeURIComponent(sessionId)}/join`, {
        method: 'POST',
        body: { name: displayName, token: clientToken() }
      });
      localStorage.setItem('pertandingan_name', displayName);
      if (result.participant && result.participant.id) saveMembership(sessionId, result.participant.id);
      closeModal();
      await refreshState();
      toast(`Kamu sudah terdaftar di ${result.session?.title || 'mabar'}.`);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      busy(submit, false);
    }
    return;
  }

  if (name === 'create-mabar') {
    busy(submit, true);
    try {
      const result = await api('/api/mabar', {
        method: 'POST',
        body: {
          ...values,
          slots: Number(values.slots),
          price: Number(values.price),
          token: clientToken()
        }
      });
      localStorage.setItem('pertandingan_name', String(values.host || '').trim());
      if (result.participant && result.participant.id) saveMembership(result.id, result.participant.id);
      closeModal();
      await refreshState();
      navigate('/mabar');
      toast('Sesi mabar berhasil dibuat.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      busy(submit, false);
    }
    return;
  }

  if (name === 'admin-match') {
    busy(submit, true);
    try {
      await api(`/api/admin/matches/${encodeURIComponent(values.matchId)}`, {
        method: 'PATCH',
        body: { status: values.status, minute: Number(values.minute) }
      });
      await refreshState();
      toast('Status pertandingan disimpan.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      busy(submit, false);
    }
    return;
  }

  if (name === 'admin-event') {
    const matchId = String(values.matchId || '');
    const match = getMatch(matchId);
    const player = getPlayer(String(values.playerId || ''));
    if (!match || !player) {
      toast('Pilih pemain yang valid.', 'error');
      return;
    }
    const side = player.teamId === match.homeId ? 'home' : player.teamId === match.awayId ? 'away' : null;
    if (!side) {
      toast('Pemain tidak berasal dari tim pada laga ini.', 'error');
      return;
    }
    busy(submit, true);
    try {
      await api(`/api/admin/matches/${encodeURIComponent(matchId)}/events`, {
        method: 'POST',
        body: {
          side,
          type: values.type,
          playerId: player.id,
          minute: Number(values.minute),
          note: String(values.note || '')
        }
      });
      await refreshState();
      toast(values.type === 'goal' ? 'Gol dicatat. Skor diperbarui.' : 'Kejadian dicatat.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      busy(submit, false);
    }
    return;
  }

  if (name === 'admin-tournament-settings') {
    const raw = String(values.startsAt || '');
    const startsAt = new Date(`${raw}${raw.length === 16 ? ':00' : ''}+07:00`);
    if (Number.isNaN(startsAt.getTime())) {
      toast('Tanggal mulai turnamen tidak valid.', 'error');
      return;
    }
    busy(submit, true);
    try {
      const body = {
        name: values.name,
        status: values.status,
        startsAt: startsAt.toISOString(),
        venue: values.venue,
        notes: values.notes
      };
      if (values.teamsPerGroup !== undefined) body.teamsPerGroup = Number(values.teamsPerGroup);
      await api('/api/admin/tournament', { method: 'PATCH', body });
      await refreshState();
      toast('Pengaturan turnamen diperbarui.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      busy(submit, false);
    }
    return;
  }

  if (name === 'admin-new-tournament') {
    const raw = String(values.startsAt || '');
    const startsAt = new Date(`${raw}${raw.length === 16 ? ':00' : ''}+07:00`);
    if (Number.isNaN(startsAt.getTime())) {
      toast('Tanggal mulai turnamen tidak valid.', 'error');
      return;
    }
    busy(submit, true);
    try {
      await api('/api/admin/tournament/new', {
        method: 'POST',
        body: {
          name: values.name,
          teamsPerGroup: Number(values.teamsPerGroup),
          startsAt: startsAt.toISOString(),
          venue: values.venue,
          notes: values.notes
        }
      });
      state.ui.adminTab = 'tournament';
      await refreshState();
      toast('Turnamen baru siap. Bagi tim ke grup A–D.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      busy(submit, false);
    }
    return;
  }

  if (name === 'admin-create-team') {
    const rosterRows = [...form.querySelectorAll('.roster-input-row')];
    const players = rosterRows.map((row) => ({
      name: String(row.querySelector('input[name="playerName"]')?.value || '').trim(),
      position: String(row.querySelector('select[name="playerPos"]')?.value || 'MF'),
      number: Number(row.querySelector('input[name="playerNumber"]')?.value || 0),
      photo: String(row.querySelector('.roster-photo-data')?.value || '') || null
    })).filter((player) => player.name);
    if (!players.length) {
      toast('Isi minimal satu nama pemain.', 'error');
      return;
    }
    busy(submit, true);
    try {
      const result = await api('/api/admin/teams', {
        method: 'POST',
        body: {
          name: values.name,
          short: values.short,
          city: values.city,
          coach: values.coach,
          founded: Number(values.founded) || undefined,
          venue: values.venue,
          color: values.color,
          color2: values.color2,
          logo: values.logo || null,
          players
        }
      });
      state.ui.adminTab = 'teams';
      await refreshState();
      toast(`${result.team.name} dan ${result.players.length} pemain berhasil ditambahkan.`);
      openModal('team', { teamId: result.team.id });
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      busy(submit, false);
    }
    return;
  }

  if (name === 'admin-create-match') {
    const raw = String(values.kickoff || '');
    const kickoff = new Date(`${raw}${raw.length === 16 ? ':00' : ''}+07:00`);
    if (Number.isNaN(kickoff.getTime())) {
      toast('Tanggal dan jam kick-off tidak valid.', 'error');
      return;
    }
    busy(submit, true);
    try {
      await api('/api/admin/matches', {
        method: 'POST',
        body: {
          homeId: values.homeId,
          awayId: values.awayId,
          round: values.round,
          kickoff: kickoff.toISOString(),
          venue: values.venue
        }
      });
      await refreshState();
      toast('Pertandingan baru ditambahkan.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      busy(submit, false);
    }
    return;
  }

  if (name === 'admin-add-player') {
    busy(submit, true);
    try {
      await api('/api/admin/players', {
        method: 'POST',
        body: {
          name: values.name,
          teamId: values.teamId,
          position: values.position,
          number: Number(values.number),
          photo: values.photo || null
        }
      });
      await refreshState();
      toast('Pemain baru masuk ke skuad.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      busy(submit, false);
    }
    return;
  }

  if (name === 'admin-create-mabar') {
    busy(submit, true);
    try {
      const result = await api('/api/admin/mabar', {
        method: 'POST',
        body: {
          ...values,
          slots: Number(values.slots),
          price: Number(values.price),
          token: clientToken()
        }
      });
      if (result.participant && result.participant.id) saveMembership(result.session.id, result.participant.id);
      await refreshState();
      toast('Sesi mabar baru dibuat.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      busy(submit, false);
    }
    return;
  }
}

/* =========================================================
   Event wiring + boot
   ========================================================= */

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-link]');
  if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !link.target) {
    const url = new URL(link.href, location.origin);
    if (url.origin === location.origin) {
      event.preventDefault();
      navigate(url.pathname + url.search);
      return;
    }
  }

  if (event.target.matches('[data-modal-backdrop]')) {
    closeModal();
    return;
  }

  const actionElement = event.target.closest('[data-action]');
  if (actionElement) {
    handleAction(actionElement, event).catch((error) => toast(error.message || 'Terjadi kesalahan.', 'error'));
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  handleForm(form).catch((error) => toast(error.message || 'Terjadi kesalahan.', 'error'));
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'player-search') {
    state.ui.playerSearch = event.target.value;
    refreshPlayers();
  }
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'player-sort') {
    state.ui.playerSort = event.target.value;
    refreshPlayers();
  }
  if (event.target.id === 'team-logo-file') {
    handleTeamLogoFile(event.target).catch((error) => toast(error.message, 'error'));
  }
  if (event.target.id === 'new-player-photo-file') {
    handleNewPlayerPhoto(event.target).catch((error) => toast(error.message, 'error'));
  }
  if (event.target.id === 'player-photo-file') {
    handlePlayerPhotoUpload(event.target).catch((error) => toast(error.message, 'error'));
  }
  if (event.target.classList.contains('roster-photo-input')) {
    handleRosterPhotoInput(event.target).catch((error) => toast(error.message, 'error'));
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.modal) {
    closeModal();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (location.pathname !== '/pemain') navigate('/pemain');
    setTimeout(() => {
      const input = document.getElementById('player-search');
      if (input) input.focus();
    }, 40);
    return;
  }
  if (event.key === 'Enter' && event.target.matches('tr[data-action="open-player"]')) {
    event.preventDefault();
    event.target.click();
  }
});

window.addEventListener('popstate', () => {
  closeModal();
  renderAll({ preserveFocus: false });
  window.scrollTo(0, 0);
});

function renderBoot() {
  root.view.innerHTML = `<div class="boot-screen">
    <span class="boot-mark">${brandMark()}</span>
    <span class="boot-label">Memuat pertandingan</span>
    <span class="boot-bar"><span></span></span>
  </div>`;
}

function renderBootError(message) {
  root.view.innerHTML = `<div class="boot-screen boot-error">
    <span class="boot-mark">${brandMark()}</span>
    <h1>Koneksi ke lapangan terputus.</h1>
    <p>${esc(message || 'Server tidak merespons. Coba muat ulang halaman.')}</p>
    <button type="button" class="btn btn-primary" data-action="retry">Coba lagi ${icon('arrow')}</button>
  </div>`;
}

async function boot() {
  state.loading = true;
  state.error = null;
  applyTheme(state.theme, { persist: false });
  renderBoot();
  try {
    const data = await api('/api/state');
    state.data = data;
    state.isAdmin = Boolean(data.isAdmin);
    state.serverOffset = data.serverNow - Date.now();
    state.connected = true;
    state.loading = false;
    renderAll({ preserveFocus: false });
    connectStream();
  } catch (error) {
    state.loading = false;
    state.error = error;
    renderBootError(error.message);
  }
}

setInterval(tickClocks, 10 * 1000);
boot();

