'use strict';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function cleanText(value) {
  return String(value == null ? '' : value)
    .replace(/[–—]/g, '-')
    .replace(/[·•]/g, '-')
    .replace(/×/g, 'x')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pdfString(value) {
  return cleanText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function color(value, fallback = '#cfff45') {
  let source = String(value || fallback).replace('#', '');
  if (source.length === 3) source = source.split('').map((char) => char + char).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(source)) source = fallback.replace('#', '');
  return [
    parseInt(source.slice(0, 2), 16) / 255,
    parseInt(source.slice(2, 4), 16) / 255,
    parseInt(source.slice(4, 6), 16) / 255
  ];
}

function rgb(value) {
  return value.map((part) => Math.round(part * 1000) / 1000).join(' ');
}

function readableOn(value) {
  const [r, g, b] = value;
  return (r * 0.299 + g * 0.587 + b * 0.114) > 0.6 ? '0.06 0.08 0.04' : '1 1 1';
}

function positionLabel(position) {
  return { GK: 'Kiper', DF: 'Bek', MF: 'Gelandang', FW: 'Penyerang' }[position] || position || '-';
}

function generatedStamp(date = new Date()) {
  const formatted = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Jakarta'
  }).format(date).replace(/\./g, ':');
  return `${formatted} WIB`;
}

function buildTeamPdf({ team, standing, players = [], tournamentGroup = null, generatedAt = new Date() }) {
  const commands = [];
  const primary = color(team.color, '#cfff45');
  const secondary = color(team.color2, '#1b241b');
  const onPrimary = readableOn(primary);
  const ink = '0.055 0.075 0.05';
  const muted = '0.35 0.39 0.33';
  const line = '0.84 0.87 0.81';
  const soft = '0.965 0.975 0.95';
  const gold = '0.85 0.66 0.05';
  const red = '0.78 0.16 0.19';

  function fill(value, x, y, width, height) {
    commands.push(`${rgb(value)} rg`, `${x} ${y} ${width} ${height} re f`);
  }
  function fillInk(value, x, y, width, height) {
    commands.push(`${value} rg`, `${x} ${y} ${width} ${height} re f`);
  }
  function stroke(value, x1, y1, x2, y2, width = 0.6) {
    commands.push(`${value} RG`, `${width} w`, `${x1} ${y1} m ${x2} ${y2} l S`);
  }
  function text(value, x, y, size = 9, font = 'F1', fillColor = ink) {
    commands.push(`${fillColor} rg`, 'BT', `/${font} ${size} Tf`, `1 0 0 1 ${x} ${y} Tm`, `(${pdfString(value)}) Tj`, 'ET');
  }
  function clipped(value, maxChars) {
    const cleaned = cleanText(value);
    return cleaned.length > maxChars ? `${cleaned.slice(0, Math.max(0, maxChars - 1))}-` : cleaned;
  }

  // Header band.
  fill(primary, MARGIN, 752, CONTENT_WIDTH, 64);
  fillInk(rgb(secondary), MARGIN, 752, 5, 64);
  text('LAPORAN TIM', MARGIN + 20, 796, 7, 'F2', onPrimary);
  text(clipped(team.name, 36), MARGIN + 20, 775, 22, 'F2', onPrimary);
  text(`${team.city || '-'} | Berdiri ${team.founded || '-'} | Pelatih ${team.coach || '-'}`, MARGIN + 20, 761, 8, 'F1', onPrimary);
  text(team.short || '', PAGE_WIDTH - MARGIN - 44, 798, 15, 'F2', onPrimary);

  // Team meta.
  text('PROFIL KLUB', MARGIN, 728, 7.5, 'F2', muted);
  text(`Home base: ${team.venue || '-'}`, MARGIN, 715, 9, 'F1', ink);
  if (tournamentGroup) {
    text(`Turnamen: ${tournamentGroup.tournamentName || '-'} | ${tournamentGroup.groupName || '-'} | Peringkat ${tournamentGroup.rank || '-'}`, MARGIN, 702, 8, 'F1', muted);
  } else {
    text('Turnamen: belum masuk grup fase grup', MARGIN, 702, 8, 'F1', muted);
  }
  text(`Laporan dibuat ${generatedStamp(generatedAt)}`, PAGE_WIDTH - MARGIN - 196, 702, 7.5, 'F1', muted);

  // Summary cards.
  text('RINGKASAN LIGA', MARGIN, 677, 7.5, 'F2', muted);
  const cards = [
    ['Peringkat', standing ? `#${standing.rank}` : '-'],
    ['Poin', standing ? String(standing.points) : '0'],
    ['Main', standing ? String(standing.played) : '0'],
    ['Menang', standing ? String(standing.won) : '0'],
    ['Selisih Gol', standing ? `${standing.goalDiff > 0 ? '+' : ''}${standing.goalDiff}` : '0']
  ];
  const cardGap = 6;
  const cardWidth = (CONTENT_WIDTH - cardGap * (cards.length - 1)) / cards.length;
  cards.forEach(([label, value], index) => {
    const x = MARGIN + index * (cardWidth + cardGap);
    fillInk(soft, x, 630, cardWidth, 38);
    text(label.toUpperCase(), x + 8, 657, 5.8, 'F2', muted);
    text(value, x + 8, 639, 16, 'F2', index === 4 && String(value).startsWith('-') ? red : ink);
  });
  const formText = standing && standing.form && standing.form.length ? `Form terakhir: ${standing.form.join(' - ')}` : 'Form terakhir: -';
  const goalsText = standing ? `Gol ${standing.goalsFor}:${standing.goalsAgainst} | ${standing.won}M ${standing.drawn}S ${standing.lost}K` : 'Belum ada pertandingan liga';
  text(formText, MARGIN, 615, 8, 'F1', muted);
  text(goalsText, MARGIN + 210, 615, 8, 'F1', muted);

  // Squad table.
  text('DATA PEMAIN', MARGIN, 590, 7.5, 'F2', muted);
  const columns = [
    { key: 'number', label: 'NO', x: 48, width: 18 },
    { key: 'name', label: 'NAMA', x: 69, width: 164 },
    { key: 'position', label: 'POSISI', x: 240, width: 62 },
    { key: 'matches', label: 'MAIN', x: 313, width: 34 },
    { key: 'goals', label: 'GOL', x: 355, width: 34 },
    { key: 'assists', label: 'ASSIST', x: 397, width: 38 },
    { key: 'yellowCards', label: 'KK', x: 447, width: 30 },
    { key: 'redCards', label: 'KM', x: 490, width: 30 }
  ];
  fillInk('0.91 0.93 0.88', MARGIN, 568, CONTENT_WIDTH, 16);
  for (const column of columns) {
    const colorValue = column.key === 'yellowCards' ? gold : column.key === 'redCards' ? red : muted;
    text(column.label, column.x, 573, 6.5, 'F2', colorValue);
  }
  let rowY = 552;
  if (!players.length) {
    text('Belum ada pemain terdaftar.', MARGIN, rowY, 9, 'F1', muted);
  } else {
    const sorted = [...players].sort((a, b) => {
      const order = { GK: 0, DF: 1, MF: 2, FW: 3 };
      return (order[a.position] ?? 9) - (order[b.position] ?? 9) || Number(a.number || 0) - Number(b.number || 0);
    });
    const rowHeight = sorted.length > 22 ? 14 : 15.4;
    sorted.forEach((player, index) => {
      if (index % 2 === 0) fillInk('0.985 0.99 0.978', MARGIN, rowY - 4, CONTENT_WIDTH, rowHeight);
      text(String(player.number || '-'), columns[0].x, rowY, 8, 'F2', ink);
      text(clipped(player.name, 34), columns[1].x, rowY, 8.4, 'F1', ink);
      text(positionLabel(player.position), columns[2].x, rowY, 8, 'F1', muted);
      text(String(player.matches || 0), columns[3].x, rowY, 8, 'F1', ink);
      text(String(player.goals || 0), columns[4].x, rowY, 8.4, 'F2', ink);
      text(String(player.assists || 0), columns[5].x, rowY, 8, 'F1', muted);
      text(String(player.yellowCards || 0), columns[6].x, rowY, 8, 'F1', gold);
      text(String(player.redCards || 0), columns[7].x, rowY, 8, 'F1', red);
      stroke(line, MARGIN, rowY - 5, PAGE_WIDTH - MARGIN, rowY - 5, 0.4);
      rowY -= rowHeight;
    });
  }

  // Team totals.
  const totalGoals = players.reduce((sum, player) => sum + Number(player.goals || 0), 0);
  const totalAssists = players.reduce((sum, player) => sum + Number(player.assists || 0), 0);
  const totalYellow = players.reduce((sum, player) => sum + Number(player.yellowCards || 0), 0);
  const totalRed = players.reduce((sum, player) => sum + Number(player.redCards || 0), 0);
  const totalsY = Math.max(74, rowY - 30);
  fillInk(soft, MARGIN, totalsY - 4, CONTENT_WIDTH, 23);
  text(`TOTAL SKUAD  |  ${players.length} pemain  |  ${totalGoals} gol  |  ${totalAssists} assist`, MARGIN + 8, totalsY + 4, 8, 'F2', ink);
  text(`kartu kuning ${totalYellow}  |  kartu merah ${totalRed}`, PAGE_WIDTH - MARGIN - 154, totalsY + 4, 8, 'F1', red);

  // Footer.
  stroke(line, MARGIN, 48, PAGE_WIDTH - MARGIN, 48, 0.7);
  text('PERTANDINGAN - Mini Soccer Live', MARGIN, 34, 7.5, 'F2', muted);
  text(`Dicetak ${generatedStamp(generatedAt)}`, PAGE_WIDTH - MARGIN - 140, 34, 7.5, 'F1', muted);

  const content = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    `<< /Title (${pdfString(`Laporan ${team.name}`)}) /Author (Pertandingan) /Creator (Pertandingan Mini Soccer) >>`
  ];
  const parts = [];
  let offset = 0;
  const push = (value) => {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, 'latin1');
    parts.push(buffer);
    offset += buffer.length;
  };
  push(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(offset);
    push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });
  const xrefOffset = offset;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.forEach((objectOffset) => push(`${String(objectOffset).padStart(10, '0')} 00000 n \n`));
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.concat(parts);
}

module.exports = { buildTeamPdf, cleanText };
