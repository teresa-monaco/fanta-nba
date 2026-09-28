// state.js — forma dello stato condiviso e transizioni pure.
//
// Nota di progetto: sul database NON finiscono mai i risultati delle partite,
// solo il seed della serie. Il motore e deterministico, quindi ogni client
// ricalcola da solo esattamente le stesse gare. Lo stato condiviso resta di
// pochi KB e non esiste il rischio che due schermi mostrino risultati diversi.

import { TEAM_KEYS, TEAM_NAMES, SLOTS, START_CREDITS, ROSTER_SIZE, makeRng, shuffle, db } from './core.js';

export const BID_SECONDS = 15;

export function newGame(seed, hostUid) {
  const teams = {};
  for (const k of TEAM_KEYS) teams[k] = { credits: START_CREDITS, roster: [] };
  const lineups = {}; const tactics = {};
  for (const k of TEAM_KEYS) {
    lineups[k] = { PG: null, SG: null, SF: null, PF: null, C: null };
    tactics[k] = { v1: null, v2: null, strategy: 'equilibrato' };
  }
  return {
    v: 1, seed, host: hostUid, phase: 'lobby',
    seats: {}, // uid -> teamKey
    names: {}, // uid -> nickname
    teams, lineups, tactics,
    auction: { order: null, idx: 0, bid: null, deadline: null, running: false, log: [], unsold: [] },
    po: null,
  };
}

// Il Realtime Database non memorizza chiavi null ne array vuoti: al ritorno
// dalla rete lo scheletro va ricostruito, altrimenti roster.length esplode.
export function hydrate(raw) {
  const s = { ...raw };
  s.seats = s.seats || {};
  s.names = s.names || {};
  s.teams = s.teams || {};
  s.lineups = s.lineups || {};
  s.tactics = s.tactics || {};
  for (const k of TEAM_KEYS) {
    s.teams[k] = { credits: START_CREDITS, roster: [], ...(s.teams[k] || {}) };
    s.teams[k].roster = s.teams[k].roster || [];
    const lu = s.lineups[k] || {};
    s.lineups[k] = Object.fromEntries(SLOTS.map((sl) => [sl, lu[sl] ?? null]));
    s.tactics[k] = { v1: null, v2: null, strategy: 'equilibrato', ...(s.tactics[k] || {}) };
  }
  const a = s.auction || {};
  s.auction = {
    order: a.order || null, idx: a.idx ?? 0, bid: a.bid || null,
    deadline: a.deadline || null, running: !!a.running,
    paused: !!a.paused, remaining: a.remaining ?? null,
    log: a.log || [], unsold: a.unsold || [],
  };
  if (s.po) {
    s.po = { ...s.po, semis: s.po.semis || [], reasons: s.po.reasons || [] };
  }
  return s;
}

/* ---------- Lobby ---------- */

export function takeSeat(s, uid, nickname, teamKey) {
  const seats = { ...s.seats };
  for (const [u, t] of Object.entries(seats)) if (t === teamKey && u !== uid) return s; // gia occupata
  seats[uid] = teamKey;
  return { ...s, seats, names: { ...s.names, [uid]: nickname } };
}

export function leaveSeat(s, uid) {
  const seats = { ...s.seats };
  delete seats[uid];
  return { ...s, seats };
}

/* ---------- Asta ---------- */

export function slotsLeft(s, teamKey) {
  return ROSTER_SIZE - s.teams[teamKey].roster.length;
}

// Regola di riserva: devi sempre poter comprare gli slot che ti restano,
// quindi tieni da parte 1 credito per ognuno di quelli oltre a questo.
export function maxBid(s, teamKey) {
  const left = slotsLeft(s, teamKey);
  if (left <= 0) return 0;
  return Math.max(0, s.teams[teamKey].credits - (left - 1));
}

// La pausa vale per tutti: il cronometro vive nello stato condiviso, non nel
// browser di chi ospita. Si conserva il tempo residuo, così alla ripresa non
// si riparte da capo né si scade subito.
export function pauseAuction(s, now) {
  if (!s.auction.running || s.auction.paused) return s;
  return { ...s, auction: { ...s.auction, paused: true, remaining: Math.max(0, (s.auction.deadline || now) - now) } };
}

export function resumeAuction(s, now) {
  if (!s.auction.paused) return s;
  const left = s.auction.remaining ?? BID_SECONDS * 1000;
  return { ...s, auction: { ...s.auction, paused: false, remaining: null, deadline: now + Math.max(3000, left) } };
}

export function canBid(s, teamKey, amount) {
  if (s.phase !== 'auction' || !s.auction.running || s.auction.paused) return false;
  if (slotsLeft(s, teamKey) <= 0) return false;
  const cur = s.auction.bid;
  if (cur && cur.team === teamKey) return false; // non si rilancia su se stessi
  const min = cur ? cur.amount + 1 : 1;
  return amount >= min && amount <= maxBid(s, teamKey);
}

export function startAuction(s, now) {
  const D = db();
  const rng = makeRng(s.seed + ':pool');
  const order = shuffle(D.players.map((p) => p.id), rng);
  return openLot({ ...s, phase: 'auction', auction: { ...s.auction, order, idx: -1 } }, now);
}

// Passa al lotto successivo. Salta chi e gia stato comprato e, se il mazzo
// finisce prima che le rose siano piene, riparte da capo: senza questo giro
// la partita potrebbe restare bloccata con quintetti incompleti.
export function openLot(s, now) {
  const a = s.auction;
  // Un lotto nuovo riparte sempre spausato: la pausa vale per il lotto in corso.
  const fresh = { ...a, bid: null, paused: false, remaining: null };
  const stillBuying = TEAM_KEYS.some((k) => slotsLeft(s, k) > 0 && maxBid(s, k) >= 1);
  if (!stillBuying || !a.order?.length) {
    return { ...s, auction: { ...fresh, running: false, deadline: null } };
  }

  const owned = new Set(TEAM_KEYS.flatMap((k) => s.teams[k].roster));
  let idx = a.idx;
  for (let step = 0; step < a.order.length; step++) {
    idx = (idx + 1) % a.order.length;
    if (!owned.has(a.order[idx])) {
      return { ...s, auction: { ...fresh, idx, deadline: now + BID_SECONDS * 1000, running: true } };
    }
  }
  // Non dovrebbe succedere: il pool e molto piu grande dei 20 posti totali.
  return { ...s, auction: { ...fresh, running: false, deadline: null } };
}

export function placeBid(s, teamKey, amount, now) {
  if (!canBid(s, teamKey, amount)) return s;
  return {
    ...s,
    auction: {
      ...s.auction,
      bid: { team: teamKey, amount },
      // Ogni rilancio rimette il cronometro a 8s: chiude in fretta ma lascia rispondere.
      deadline: Math.max(s.auction.deadline, now + 8000),
    },
  };
}

// Assegnazione: la usa sia il timer scaduto sia l'override manuale del banditore.
export function award(s, playerId, teamKey, price, now) {
  if (slotsLeft(s, teamKey) <= 0) return s;
  // Anche l'override manuale rispetta la riserva: senza questo vincolo il
  // banditore potrebbe svuotare un budget e lasciare quella squadra
  // impossibilitata a completare il quintetto, bloccando la partita.
  if (price > maxBid(s, teamKey)) return s;
  if (s.teams[teamKey].roster.includes(playerId)) return s;

  const teams = {
    ...s.teams,
    [teamKey]: {
      credits: s.teams[teamKey].credits - price,
      roster: [...s.teams[teamKey].roster, playerId],
    },
  };
  const log = [...s.auction.log, { playerId, team: teamKey, price }];
  let next = { ...s, teams, auction: { ...s.auction, log } };

  if (TEAM_KEYS.every((k) => next.teams[k].roster.length >= ROSTER_SIZE)) {
    return toLineups(next);
  }
  return openLot(next, now);
}

export function passLot(s, now) {
  const pid = currentPlayerId(s);
  const unsold = pid ? [...s.auction.unsold, pid] : s.auction.unsold;
  return openLot({ ...s, auction: { ...s.auction, unsold } }, now);
}

// Chiamata dal banditore quando il cronometro e scaduto.
export function resolveLot(s, now) {
  const pid = currentPlayerId(s);
  const bid = s.auction.bid;
  if (!pid) return s;
  if (!bid) return passLot(s, now);
  return award(s, pid, bid.team, bid.amount, now);
}

export function currentPlayerId(s) {
  const a = s.auction;
  if (!a.order || a.idx < 0 || a.idx >= a.order.length) return null;
  return a.order[a.idx];
}

/* ---------- Quintetti ---------- */

export function toLineups(s) {
  const lineups = {};
  for (const k of TEAM_KEYS) lineups[k] = autoLineup(s.teams[k].roster);
  return { ...s, phase: 'lineups', lineups, auction: { ...s.auction, running: false, bid: null, deadline: null } };
}

// Assegnazione automatica: minimizza il costo totale di "fuori ruolo"
// provando tutte le 120 permutazioni. Con 5 giocatori e istantaneo.
export function autoLineup(roster) {
  const D = db();
  const ps = roster.map((id) => D.byId[id]).filter(Boolean);
  if (ps.length < 5) {
    const out = {};
    SLOTS.forEach((sl, i) => { out[sl] = ps[i]?.id ?? null; });
    return out;
  }
  const cost = (p, slot) => {
    if (p.pos === slot) return 0;
    if ((p.alt || []).includes(slot)) return 1;
    const gap = Math.abs(D.positionSize[p.pos] - D.positionSize[slot]);
    return 3 + gap * 2;
  };
  let best = null;
  const perm = (arr, k = 0) => {
    if (k === arr.length) {
      const c = arr.reduce((s, p, i) => s + cost(p, SLOTS[i]), 0);
      if (!best || c < best.c) best = { c, order: arr.slice() };
      return;
    }
    for (let i = k; i < arr.length; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]];
      perm(arr, k + 1);
      [arr[k], arr[i]] = [arr[i], arr[k]];
    }
  };
  perm(ps.slice());
  const out = {};
  SLOTS.forEach((sl, i) => { out[sl] = best.order[i].id; });
  return out;
}

// Scambia due slot (unico modo sicuro di editare: il quintetto resta sempre completo).
export function swapSlots(s, teamKey, slotA, slotB) {
  const lu = { ...s.lineups[teamKey] };
  [lu[slotA], lu[slotB]] = [lu[slotB], lu[slotA]];
  return { ...s, lineups: { ...s.lineups, [teamKey]: lu } };
}

export function lineupsReady(s) {
  return TEAM_KEYS.every((k) => SLOTS.every((sl) => !!s.lineups[k][sl]));
}

/* ---------- Impostazioni tattiche ---------- */

export function toTactics(s) {
  const D = db();
  const tactics = { ...s.tactics };
  for (const k of TEAM_KEYS) {
    if (tactics[k].v1 && tactics[k].v2) continue;
    const sorted = s.teams[k].roster.map((id) => D.byId[id]).filter(Boolean)
      .sort((x, y) => y.attrs.sco - x.attrs.sco);
    tactics[k] = { v1: sorted[0]?.id ?? null, v2: sorted[1]?.id ?? null, strategy: tactics[k].strategy || 'equilibrato' };
  }
  return { ...s, phase: 'tactics', tactics };
}

export function setTactics(s, teamKey, patch) {
  const cur = { ...s.tactics[teamKey], ...patch };
  if (cur.v1 && cur.v1 === cur.v2) return s; // i due violini devono essere diversi
  return { ...s, tactics: { ...s.tactics, [teamKey]: cur } };
}

export function tacticsReady(s) {
  return TEAM_KEYS.every((k) => {
    const t = s.tactics[k];
    return t.v1 && t.v2 && t.v1 !== t.v2 && t.strategy;
  });
}

/* ---------- Playoff ---------- */

export function toPlayoffs(s, semis, reasons) {
  const [p1, p2] = semis;
  return {
    ...s,
    phase: 'playoffs',
    po: {
      semis, reasons,
      s1: { a: p1[0], b: p1[1], seed: `${s.seed}:s1`, revealed: false },
      s2: { a: p2[0], b: p2[1], seed: `${s.seed}:s2`, revealed: false },
      final: null,
      third: null,
    },
  };
}

export function revealSemi(s, which) {
  const po = { ...s.po, [which]: { ...s.po[which], revealed: true } };
  return { ...s, po };
}

export function openFinal(s, winner1, winner2, loser1, loser2) {
  const po = {
    ...s.po,
    final: { a: winner1, b: winner2, seed: `${s.seed}:final`, gamesPlayed: 0 },
    third: { a: loser1, b: loser2, seed: `${s.seed}:third`, revealed: false },
  };
  return { ...s, po };
}

export function advanceFinal(s) {
  const f = s.po.final;
  if (!f) return s;
  return { ...s, po: { ...s.po, final: { ...f, gamesPlayed: f.gamesPlayed + 1 } } };
}

export function revealThird(s) {
  return { ...s, po: { ...s.po, third: { ...s.po.third, revealed: true } } };
}

/* ---------- Ricominciare ---------- */

// Nuova partita da zero, ma tenendo chi e seduto dove: nessuno deve
// riscegliere la squadra fra un'asta e l'altra.
export function resetGame(s, seed) {
  const fresh = newGame(seed, s.host);
  return { ...fresh, seats: s.seats, names: s.names };
}

/* ---------- Utility di presentazione ---------- */

export function teamOf(s, uid) { return s.seats[uid] || null; }
export function seatTaken(s, teamKey) { return Object.values(s.seats).includes(teamKey); }
export function nameOfSeat(s, teamKey) {
  const uid = Object.keys(s.seats).find((u) => s.seats[u] === teamKey);
  return uid ? s.names[uid] : null;
}
export { TEAM_KEYS, TEAM_NAMES, SLOTS, ROSTER_SIZE, START_CREDITS };
