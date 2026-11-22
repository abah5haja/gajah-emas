'use strict';

const MINUTE = 60 * 1000;

function pad(n) {
  return String(n).padStart(2, '0');
}

function jakartaDate(offsetDays = 0) {
  const jakartaNow = new Date(Date.now() + 7 * 60 * MINUTE);
  const target = new Date(Date.UTC(
    jakartaNow.getUTCFullYear(),
    jakartaNow.getUTCMonth(),
    jakartaNow.getUTCDate() + offsetDays
  ));
  return target.toISOString().slice(0, 10);
}

function kickoff(offsetDays, hour, minute) {
  return new Date(`${jakartaDate(offsetDays)}T${pad(hour)}:${pad(minute)}:00+07:00`).toISOString();
}

function createSeed() {
  const teams = [
    {
      id: 'garuda-fc', name: 'Garuda FC', short: 'GRD', city: 'Jakarta Selatan',
      color: '#d4ff4f', color2: '#29450c', coach: 'Andri Suryana', founded: 2019,
      venue: 'Lapangan Cempaka'
    },
    {
      id: 'banteng-united', name: 'Banteng United', short: 'BTU', city: 'Depok',
      color: '#ff6268', color2: '#481014', coach: 'Rudi Hartono', founded: 2018,
      venue: 'Lapangan Kartika'
    },
    {
      id: 'elang-jaya', name: 'Elang Jaya', short: 'ELJ', city: 'Jakarta Timur',
      color: '#58a0ff', color2: '#102b52', coach: 'Dedi Kurnia', founded: 2020,
      venue: 'Lapangan Pulo Gadung'
    },
    {
      id: 'rajawali-sc', name: 'Rajawali SC', short: 'RJW', city: 'Tangerang',
      color: '#ff9b4a', color2: '#4a2410', coach: 'Iwan Setiawan', founded: 2017,
      venue: 'Lapangan Alam Sutera'
    },
    {
      id: 'naga-biru', name: 'Naga Biru', short: 'NGB', city: 'Bekasi',
      color: '#39dbc8', color2: '#0b3d38', coach: 'Hendra Wijaya', founded: 2021,
      venue: 'Lapangan Galaxy'
    },
    {
      id: 'badak-fc', name: 'Badak FC', short: 'BDK', city: 'Bogor',
      color: '#b395ff', color2: '#2d1f52', coach: 'Yusuf Ramlan', founded: 2019,
      venue: 'Lapangan Pajajaran'
    },
    {
      id: 'singa-muda', name: 'Singa Muda', short: 'SGM', city: 'Jakarta Pusat',
      color: '#ffd84f', color2: '#4a390c', coach: 'Teguh Prasetyo', founded: 2020,
      venue: 'Lapangan Senayan'
    },
    {
      id: 'macan-putih', name: 'Macan Putih', short: 'MCP', city: 'Jakarta Barat',
      color: '#e8ecf2', color2: '#3b4350', coach: 'Asep Gunawan', founded: 2018,
      venue: 'Lapangan Kebon Jeruk'
    }
  ];

  const players = [
    ['p-raka', 'Raka Pratama', 'garuda-fc', 'FW', 9, 6, 2, 12],
    ['p-gilang', 'Gilang Ramadhan', 'garuda-fc', 'FW', 11, 4, 3, 12],
    ['p-bima', 'Bima Saputra', 'garuda-fc', 'MF', 8, 2, 5, 12],
    ['p-rizky', 'Rizky Maulana', 'garuda-fc', 'MF', 10, 1, 4, 11],
    ['p-danu', 'Danu Wijaya', 'garuda-fc', 'DF', 4, 0, 1, 12],
    ['p-yoga', 'Yoga Santoso', 'garuda-fc', 'DF', 3, 0, 0, 10],
    ['p-arif', 'Arif Hidayat', 'garuda-fc', 'MF', 6, 1, 1, 9],
    ['p-fajar', 'Fajar Nugroho', 'garuda-fc', 'GK', 1, 0, 0, 12],

    ['p-aditya', 'Aditya Firmansyah', 'banteng-united', 'FW', 7, 5, 1, 11],
    ['p-bayu', 'Bayu Kurniawan', 'banteng-united', 'MF', 10, 3, 4, 12],
    ['p-cakra', 'Cakra Wibowo', 'banteng-united', 'FW', 9, 2, 1, 11],
    ['p-dimas', 'Dimas Anggara', 'banteng-united', 'MF', 8, 1, 2, 10],
    ['p-eko', 'Eko Prasetyo', 'banteng-united', 'DF', 5, 1, 0, 12],
    ['p-farhan', 'Farhan Malik', 'banteng-united', 'DF', 4, 0, 1, 11],
    ['p-galih', 'Galih Permana', 'banteng-united', 'GK', 1, 0, 0, 12],
    ['p-hafiz', 'Hafiz Ramadhan', 'banteng-united', 'DF', 3, 0, 0, 8],

    ['p-reza', 'Reza Fadillah', 'elang-jaya', 'FW', 9, 4, 1, 12],
    ['p-arya', 'Arya Kusuma', 'elang-jaya', 'MF', 8, 2, 3, 12],
    ['p-daffa', 'Daffa Alfarizi', 'elang-jaya', 'FW', 11, 2, 2, 10],
    ['p-surya', 'Surya Lesmana', 'elang-jaya', 'MF', 6, 1, 1, 11],
    ['p-tirta', 'Tirta Wijaksana', 'elang-jaya', 'DF', 3, 0, 1, 12],
    ['p-hanif', 'Hanif Fauzan', 'elang-jaya', 'DF', 4, 0, 0, 9],
    ['p-bagas', 'Bagas Dwi', 'elang-jaya', 'GK', 12, 0, 0, 12],

    ['p-fikri', 'Fikri Hidayat', 'rajawali-sc', 'FW', 10, 3, 1, 11],
    ['p-rafi', 'Rafi Ardiansyah', 'rajawali-sc', 'MF', 8, 2, 2, 12],
    ['p-seno', 'Seno Aji', 'rajawali-sc', 'FW', 9, 1, 2, 10],
    ['p-wahyu', 'Wahyu Setiawan', 'rajawali-sc', 'MF', 7, 0, 1, 11],
    ['p-ilham', 'Ilham Fadil', 'rajawali-sc', 'DF', 5, 1, 0, 12],
    ['p-naufal', 'Naufal Hakim', 'rajawali-sc', 'DF', 2, 0, 0, 9],
    ['p-jefri', 'Jefri Gunawan', 'rajawali-sc', 'GK', 1, 0, 0, 12],

    ['p-kevin', 'Kevin Sanjaya', 'naga-biru', 'FW', 9, 2, 1, 10],
    ['p-dion', 'Dion Saputra', 'naga-biru', 'MF', 8, 1, 2, 11],
    ['p-yudha', 'Yudha Pratama', 'naga-biru', 'FW', 11, 2, 0, 10],
    ['p-sakti', 'Sakti Nugraha', 'naga-biru', 'MF', 6, 0, 1, 9],
    ['p-aldo', 'Aldo Firmansyah', 'naga-biru', 'DF', 4, 0, 1, 12],
    ['p-gio', 'Gio Ramadhan', 'naga-biru', 'DF', 3, 0, 0, 11],
    ['p-ivan', 'Ivan Kurnia', 'naga-biru', 'GK', 1, 0, 0, 12],

    ['p-brian', 'Brian Maulana', 'badak-fc', 'FW', 9, 2, 1, 11],
    ['p-cesar', 'Cesar Adi', 'badak-fc', 'MF', 10, 1, 2, 12],
    ['p-dwiki', 'Dwiki Setiawan', 'badak-fc', 'FW', 7, 1, 0, 9],
    ['p-egar', 'Egar Prasetya', 'badak-fc', 'MF', 8, 0, 2, 12],
    ['p-fauzi', 'Fauzi Rahman', 'badak-fc', 'DF', 5, 0, 1, 10],
    ['p-genta', 'Genta Wibawa', 'badak-fc', 'DF', 4, 0, 0, 11],
    ['p-herdi', 'Herdi Santosa', 'badak-fc', 'GK', 1, 0, 0, 12],

    ['p-ian', 'Ian Rizky', 'singa-muda', 'FW', 9, 3, 0, 11],
    ['p-julio', 'Julio Pratama', 'singa-muda', 'MF', 8, 2, 2, 12],
    ['p-krisna', 'Krisna Bayu', 'singa-muda', 'FW', 11, 2, 1, 10],
    ['p-lutfi', 'Lutfi Hakim', 'singa-muda', 'MF', 6, 1, 1, 10],
    ['p-mario', 'Mario Saputra', 'singa-muda', 'DF', 4, 0, 1, 12],
    ['p-nando', 'Nando Wijaya', 'singa-muda', 'DF', 3, 0, 0, 9],
    ['p-oscar', 'Oscar Damanik', 'singa-muda', 'GK', 1, 0, 0, 12],

    ['p-pandu', 'Pandu Wicaksono', 'macan-putih', 'FW', 9, 4, 1, 11],
    ['p-qori', 'Qori Firmansyah', 'macan-putih', 'MF', 8, 2, 2, 12],
    ['p-rizal', 'Rizal Maulana', 'macan-putih', 'FW', 11, 1, 1, 9],
    ['p-sandy', 'Sandy Pratama', 'macan-putih', 'MF', 6, 1, 0, 10],
    ['p-taufik', 'Taufik Hidayat', 'macan-putih', 'DF', 4, 0, 1, 12],
    ['p-umar', 'Umar Said', 'macan-putih', 'DF', 3, 0, 0, 10],
    ['p-vino', 'Vino Bastian', 'macan-putih', 'GK', 1, 0, 0, 12]
  ].map(([id, name, teamId, position, number, goals, assists, matches]) => ({
    id, name, teamId, position, number, goals, assists, matches
  }));

  const matches = [
    {
      id: 'match-p5-1', round: 'Pekan 5', kickoff: kickoff(-14, 19, 0),
      venue: 'Lapangan Cempaka', homeId: 'garuda-fc', awayId: 'elang-jaya',
      homeScore: 3, awayScore: 1, status: 'finished', events: []
    },
    {
      id: 'match-p5-2', round: 'Pekan 5', kickoff: kickoff(-14, 20, 30),
      venue: 'Lapangan Kartika', homeId: 'banteng-united', awayId: 'rajawali-sc',
      homeScore: 2, awayScore: 0, status: 'finished', events: []
    },
    {
      id: 'match-p5-3', round: 'Pekan 5', kickoff: kickoff(-13, 16, 0),
      venue: 'Lapangan Galaxy', homeId: 'naga-biru', awayId: 'badak-fc',
      homeScore: 1, awayScore: 1, status: 'finished', events: []
    },
    {
      id: 'match-p5-4', round: 'Pekan 5', kickoff: kickoff(-13, 18, 0),
      venue: 'Lapangan Senayan', homeId: 'singa-muda', awayId: 'macan-putih',
      homeScore: 2, awayScore: 3, status: 'finished', events: []
    },
    {
      id: 'match-p6-1', round: 'Pekan 6', kickoff: kickoff(-7, 19, 0),
      venue: 'Lapangan Cempaka', homeId: 'garuda-fc', awayId: 'banteng-united',
      homeScore: 2, awayScore: 2, status: 'finished', events: []
    },
    {
      id: 'match-p6-2', round: 'Pekan 6', kickoff: kickoff(-7, 20, 30),
      venue: 'Lapangan Pulo Gadung', homeId: 'elang-jaya', awayId: 'naga-biru',
      homeScore: 1, awayScore: 0, status: 'finished', events: []
    },
    {
      id: 'match-p6-3', round: 'Pekan 6', kickoff: kickoff(-6, 16, 0),
      venue: 'Lapangan Alam Sutera', homeId: 'rajawali-sc', awayId: 'singa-muda',
      homeScore: 2, awayScore: 1, status: 'finished', events: []
    },
    {
      id: 'match-p6-4', round: 'Pekan 6', kickoff: kickoff(-6, 18, 0),
      venue: 'Lapangan Pajajaran', homeId: 'badak-fc', awayId: 'macan-putih',
      homeScore: 0, awayScore: 2, status: 'finished', events: []
    },
    {
      id: 'match-p7-1', round: 'Pekan 7', kickoff: kickoff(-2, 19, 0),
      venue: 'Lapangan Cempaka', homeId: 'garuda-fc', awayId: 'rajawali-sc',
      homeScore: 1, awayScore: 0, status: 'finished', events: []
    },
    {
      id: 'match-p7-2', round: 'Pekan 7', kickoff: kickoff(-2, 20, 30),
      venue: 'Lapangan Kartika', homeId: 'banteng-united', awayId: 'naga-biru',
      homeScore: 3, awayScore: 1, status: 'finished', events: []
    },
    {
      id: 'match-p7-3', round: 'Pekan 7', kickoff: kickoff(-1, 16, 0),
      venue: 'Lapangan Pulo Gadung', homeId: 'elang-jaya', awayId: 'badak-fc',
      homeScore: 2, awayScore: 2, status: 'finished', events: []
    },
    {
      id: 'match-p7-4', round: 'Pekan 7', kickoff: kickoff(-1, 18, 0),
      venue: 'Lapangan Senayan', homeId: 'singa-muda', awayId: 'macan-putih',
      homeScore: 2, awayScore: 1, status: 'finished', events: []
    },
    {
      id: 'match-live', round: 'Pekan 8', kickoff: kickoff(0, 16, 0),
      venue: 'Lapangan Cempaka', homeId: 'garuda-fc', awayId: 'banteng-united',
      homeScore: 2, awayScore: 1, status: 'live',
      clock: {
        baseMinute: 0,
        startedAt: new Date(Date.now() - 67 * MINUTE).toISOString(),
        running: true
      },
      stats: {
        possession: [54, 46], shots: [9, 7], shotsOnTarget: [5, 3],
        corners: [4, 3], fouls: [6, 8]
      },
      events: [
        {
          id: 'ev-live-4', minute: 60, type: 'sub', teamId: 'banteng-united',
          playerId: 'p-cakra', playerName: 'Cakra Wibowo', note: 'Keluar: Dimas Anggara'
        },
        {
          id: 'ev-live-3', minute: 58, type: 'goal', teamId: 'garuda-fc',
          playerId: 'p-gilang', playerName: 'Gilang Ramadhan', note: 'Assist: Rizky Maulana'
        },
        {
          id: 'ev-live-2', minute: 46, type: 'yellow', teamId: 'garuda-fc',
          playerId: 'p-danu', playerName: 'Danu Wijaya', note: 'Pelanggaran taktis'
        },
        {
          id: 'ev-live-1', minute: 34, type: 'goal', teamId: 'banteng-united',
          playerId: 'p-aditya', playerName: 'Aditya Firmansyah', note: 'Assist: Bayu Kurniawan'
        },
        {
          id: 'ev-live-0', minute: 12, type: 'goal', teamId: 'garuda-fc',
          playerId: 'p-raka', playerName: 'Raka Pratama', note: 'Assist: Bima Saputra'
        }
      ]
    },
    {
      id: 'match-up-1', round: 'Pekan 8', kickoff: kickoff(0, 19, 30),
      venue: 'Lapangan Pulo Gadung', homeId: 'elang-jaya', awayId: 'rajawali-sc',
      homeScore: 0, awayScore: 0, status: 'upcoming', events: []
    },
    {
      id: 'match-up-2', round: 'Pekan 8', kickoff: kickoff(1, 20, 0),
      venue: 'Lapangan Galaxy', homeId: 'naga-biru', awayId: 'badak-fc',
      homeScore: 0, awayScore: 0, status: 'upcoming', events: []
    },
    {
      id: 'match-up-3', round: 'Pekan 8', kickoff: kickoff(7, 19, 0),
      venue: 'Lapangan Senayan', homeId: 'singa-muda', awayId: 'macan-putih',
      homeScore: 0, awayScore: 0, status: 'upcoming', events: []
    }
  ];

  const mabar = [
    {
      id: 'mabar-sabtu-malam',
      title: 'Mabar Sabtu Malam',
      date: jakartaDate(0),
      time: '20:00',
      venue: 'Lapangan Cempaka',
      city: 'Jakarta Selatan',
      format: '7v7',
      level: 'Menengah',
      slots: 14,
      price: 35000,
      host: 'Raka',
      notes: 'Pakai jersey bibs. Datang 15 menit lebih awal untuk pemanasan.',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * MINUTE).toISOString(),
      participants: [
        ['Raka', 0], ['Bima', 1], ['Gilang', 2], ['Danu', 3], ['Yoga', 4],
        ['Fikri', 5], ['Rafi', 6], ['Seno', 7], ['Ilham', 8], ['Naufal', 9]
      ].map(([name, i]) => ({
        id: `demo-sabtu-${i}`, name, token: `demo-sabtu-token-${i}`,
        joinedAt: new Date(Date.now() - (i + 1) * 26 * MINUTE).toISOString()
      }))
    },
    {
      id: 'mabar-after-office',
      title: 'Mabar After Office',
      date: jakartaDate(2),
      time: '19:30',
      venue: 'Lapangan Kartika',
      city: 'Depok',
      format: '5v5',
      level: 'Santai',
      slots: 12,
      price: 30000,
      host: 'Bayu',
      notes: 'Santai tapi serius. Rotasi kiper tiap 10 menit.',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * MINUTE).toISOString(),
      participants: [
        ['Bayu', 0], ['Aditya', 1], ['Cakra', 2], ['Dimas', 3], ['Eko', 4],
        ['Farhan', 5], ['Reza', 6], ['Arya', 7]
      ].map(([name, i]) => ({
        id: `demo-office-${i}`, name, token: `demo-office-token-${i}`,
        joinedAt: new Date(Date.now() - (i + 1) * 41 * MINUTE).toISOString()
      }))
    },
    {
      id: 'mabar-sunday',
      title: 'Sunday Morning Kickabout',
      date: jakartaDate(7),
      time: '07:00',
      venue: 'Lapangan Senayan',
      city: 'Jakarta Pusat',
      format: '8v8',
      level: 'Kompetitif',
      slots: 16,
      price: 40000,
      host: 'Ian',
      notes: 'Full field. Bawa air minum sendiri, wasit tersedia.',
      createdAt: new Date(Date.now() - 24 * 60 * MINUTE).toISOString(),
      participants: [
        ['Ian', 0], ['Julio', 1], ['Krisna', 2], ['Lutfi', 3], ['Mario', 4],
        ['Nando', 5], ['Pandu', 6], ['Qori', 7], ['Rizal', 8], ['Sandy', 9]
      ].map(([name, i]) => ({
        id: `demo-sunday-${i}`, name, token: `demo-sunday-token-${i}`,
        joinedAt: new Date(Date.now() - (i + 1) * 18 * MINUTE).toISOString()
      }))
    }
  ];

  return {
    meta: {
      season: 'Liga Mini Soccer 2026',
      matchday: 'Pekan 8',
      updatedAt: new Date().toISOString()
    },
    teams,
    players,
    matches,
    mabar,
    tournament: buildTournament(teams),
    tournamentHistory: []
  };
}

const TOURNAMENT_GROUP_IDS = ['A', 'B', 'C', 'D'];

function buildTournament(teams, options = {}) {
  const teamsPerGroup = 3;
  const groups = TOURNAMENT_GROUP_IDS.map((id) => ({
    id,
    name: `Grup ${id}`,
    teamIds: []
  }));
  const slotTotal = TOURNAMENT_GROUP_IDS.length * teamsPerGroup;
  teams.slice(0, slotTotal).forEach((team, index) => {
    groups[index % groups.length].teamIds.push(team.id);
  });
  return {
    id: 'gajah-emas-cup-2026',
    name: 'Gajah Emas Cup 2026',
    status: 'upcoming',
    teamsPerGroup,
    qualifyPerGroup: 2,
    startsAt: options.startsAt || kickoff(21, 9, 0),
    venue: options.venue || 'Lapangan Cempaka',
    notes: 'Fase grup empat grup. Peringkat 1 dan 2 setiap grup melaju ke babak perempat final.',
    groups,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

module.exports = { createSeed, buildTournament };
