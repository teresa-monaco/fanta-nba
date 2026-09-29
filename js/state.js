// state.js — forma dello stato condiviso e transizioni pure.
//
// Nota di progetto: sul database NON finiscono mai i risultati delle partite,
// solo il seed della serie. Il motore e deterministico, quindi ogni client
// ricalcola da solo esattamente le stesse gare. Lo stato condiviso resta di
// pochi KB e non esiste il rischio che due schermi mostrino risultati diversi.

import { TEAM_KEYS, TEAM_NAMES, SLOTS, START_CREDITS, ROSTER_SIZE, NUMERI_SQUADRE, makeRng, shuffle, db } from './core.js';

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
  s.albo = s.albo || [];
  if (s.po) {
    s.po = {
      ...s.po,
      reasons: s.po.reasons || [],
      ordine: s.po.ordine || [],
      teste: s.po.teste ?? 0,
      turni: (s.po.turni || []).map((round) => (round || []).map((m) => ({ gamesPlayed: 0, ...m }))),
    };
    if (s.po.third) s.po.third = { gamesPlayed: 0, ...s.po.third };
  }
  return s;
}

/* ---------- Squadre in gioco ---------- */

// Si puo giocare in 2, 3 o 4. Le squadre in gioco vengono fissate quando parte
// l'asta; prima di allora sono quelle con qualcuno seduto. Tutto il resto del
// gioco cicla su QUESTE, mai su TEAM_KEYS.
export function attive(s) {
  if (s.attive?.length) return s.attive;
  const sedute = TEAM_KEYS.filter((k) => Object.values(s.seats || {}).includes(k));
  return sedute.length ? sedute : TEAM_KEYS;
}

export const MIN_SQUADRE = 2;

// Sopra i quattro solo pari: con 5, 7 o 9 meta del tabellone salterebbe il
// primo turno e smetterebbe di somigliare a un torneo.
export const numeroValido = (n) => NUMERI_SQUADRE.includes(n);

/* ---------- Lobby ---------- */

// Non si sceglie la squadra: si scrive il nome e te ne viene assegnata una.
// Toglie il momento morto in cui quattro persone discutono su chi prende cosa.
export function joinGame(s, uid, nickname) {
  if (s.seats[uid]) return { ...s, names: { ...s.names, [uid]: nickname } }; // gia dentro, solo rinomina
  const libera = TEAM_KEYS.find((k) => !Object.values(s.seats).includes(k));
  if (!libera) return undefined; // tutte occupate
  return { ...s, seats: { ...s.seats, [uid]: libera }, names: { ...s.names, [uid]: nickname } };
}

export function leaveSeat(s, uid) {
  const seats = { ...s.seats };
  const names = { ...s.names };
  delete seats[uid];
  delete names[uid];
  return { ...s, seats, names };
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

// Le squadre in gioco si fissano QUI e non cambiano piu: da questo momento
// ogni ciclo del gioco usa s.attive, non tutte e quattro.
export function startAuction(s, now, squadre) {
  const D = db();
  const rng = makeRng(s.seed + ':pool');
  const order = shuffle(D.players.map((p) => p.id), rng);
  // Senza sedie occupate attive() ripiega su TUTTE le chiavi: da sola farebbe
  // partire una partita a dodici in una lobby vuota. Qui serve una richiesta
  // esplicita oppure qualcuno seduto.
  const nessunoDentro = !Object.keys(s.seats || {}).length;
  if (nessunoDentro && !squadre?.length) return undefined;
  const inGioco = squadre?.length ? squadre : attive(s);
  if (!numeroValido(inGioco.length)) return undefined;
  return openLot({
    ...s, phase: 'auction', attive: inGioco,
    auction: { ...s.auction, order, idx: -1 },
  }, now);
}

// Passa al lotto successivo. Salta chi e gia stato comprato e, se il mazzo
// finisce prima che le rose siano piene, riparte da capo: senza questo giro
// la partita potrebbe restare bloccata con quintetti incompleti.
export function openLot(s, now) {
  const a = s.auction;
  // Un lotto nuovo riparte sempre spausato: la pausa vale per il lotto in corso.
  const fresh = { ...a, bid: null, paused: false, remaining: null };
  const stillBuying = attive(s).some((k) => slotsLeft(s, k) > 0 && maxBid(s, k) >= 1);
  if (!stillBuying || !a.order?.length) {
    return { ...s, auction: { ...fresh, running: false, deadline: null } };
  }

  const owned = new Set(attive(s).flatMap((k) => s.teams[k].roster));
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

  if (attive(next).every((k) => next.teams[k].roster.length >= ROSTER_SIZE)) {
    return toSquadra(next);
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

/* ---------- "La tua squadra": quintetto + tattica in un passaggio ---------- */

// Quintetto e impostazioni tattiche stavano su due schermate separate. Il
// quintetto pero lo assegna l'app in modo ottimo: era una decisione finta,
// dove si poteva solo peggiorare. Ora e una schermata sola, dove il quintetto
// si legge (e si corregge solo se si vuole davvero) e si sceglie la tattica.
export function toSquadra(s) {
  const D = db();
  const lineups = {};
  const tactics = { ...s.tactics };
  for (const k of TEAM_KEYS) {
    lineups[k] = autoLineup(s.teams[k].roster);
    if (tactics[k].v1 && tactics[k].v2) continue;
    const sorted = s.teams[k].roster.map((id) => D.byId[id]).filter(Boolean)
      .sort((x, y) => y.attrs.sco - x.attrs.sco);
    tactics[k] = {
      v1: sorted[0]?.id ?? null,
      v2: sorted[1]?.id ?? null,
      strategy: tactics[k].strategy || 'equilibrato',
    };
  }
  return {
    ...s, phase: 'squadra', lineups, tactics,
    auction: { ...s.auction, running: false, bid: null, deadline: null, paused: false, remaining: null },
  };
}

export function squadraReady(s) {
  return lineupsReady(s) && tacticsReady(s);
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
  return attive(s).every((k) => SLOTS.every((sl) => !!s.lineups[k][sl]));
}

/* ---------- Impostazioni tattiche ---------- */

export function setTactics(s, teamKey, patch) {
  const cur = { ...s.tactics[teamKey], ...patch };
  if (cur.v1 && cur.v1 === cur.v2) return s; // i due violini devono essere diversi
  return { ...s, tactics: { ...s.tactics, [teamKey]: cur } };
}

export function tacticsReady(s) {
  return attive(s).every((k) => {
    const t = s.tactics[k];
    return t.v1 && t.v2 && t.v1 !== t.v2 && t.strategy;
  });
}

/* ---------- Playoff ---------- */

// Ogni serie si scopre un pezzo alla volta. Le semifinali vanno a due gare per
// volta, le Finals a una: cosi la tensione sale invece di restare piatta, e il
// momento piu importante della serata e anche il piu lento.
export const PASSO_SEMI = 2;
export const PASSO_FINALE = 1;

// Nello stato finiscono solo l'ordine sorteggiato e, per ogni serie, quante
// gare sono state scoperte. CHI gioca contro chi dal secondo turno in poi non
// si salva: lo deduce costruisciBracket() dai risultati, uguali per tutti
// perche il motore e deterministico.
export function toPlayoffs(s, tab) {
  const turni = tab.serie.map((quante, r) =>
    Array.from({ length: quante }, (_, i) => ({ seed: `${s.seed}:r${r}m${i}`, gamesPlayed: 0 })));
  return {
    ...s,
    phase: 'playoffs',
    po: {
      n: tab.n, ordine: tab.ordine, teste: tab.teste,
      reasons: tab.reasons, seedBase: s.seed,
      turni,
      third: null, // nasce solo se il penultimo turno aveva due serie
    },
  };
}

// Un solo percorso per tutte le serie: cambia solo di quanto si avanza.
export function advanceSeries(s, r, i, passo) {
  const turni = s.po?.turni;
  if (!turni?.[r]?.[i]) return s;
  const nuovi = turni.map((round, ri) => (ri !== r ? round
    : round.map((m, mi) => (mi !== i ? m : { ...m, gamesPlayed: Math.min(7, m.gamesPlayed + passo) }))));
  return { ...s, po: { ...s.po, turni: nuovi } };
}

export function advanceThird(s, passo) {
  const t = s.po?.third;
  if (!t) return s;
  return { ...s, po: { ...s.po, third: { ...t, gamesPlayed: Math.min(7, t.gamesPlayed + passo) } } };
}

// La finalina esiste solo se in semifinale ci sono davvero due eliminate.
export function openThird(s, a, b) {
  if (s.po?.third || !a || !b) return undefined;
  return { ...s, po: { ...s.po, third: { a, b, seed: `${s.seed}:third`, gamesPlayed: 0 } } };
}

/* ---------- Albo d'oro ---------- */

// Sopravvive all'azzeramento: e la memoria della stanza. L'inserimento e
// idempotente sul seed, cosi non importa quante volte lo si tenta.
export function recordAlbo(s, entry) {
  const albo = s.albo || [];
  if (albo.some((e) => e.seed === entry.seed)) return undefined;
  return { ...s, albo: [...albo, entry] };
}

export function classifica(s) {
  const albo = s.albo || [];
  const t = {};
  for (const k of TEAM_KEYS) t[k] = { key: k, nome: TEAM_NAMES[k], titoli: 0, finali: 0, mvp: [] };
  for (const e of albo) {
    if (t[e.champion]) { t[e.champion].titoli++; t[e.champion].finali++; if (e.mvp) t[e.champion].mvp.push(e.mvp); }
    if (t[e.runnerUp]) t[e.runnerUp].finali++;
  }
  return Object.values(t).sort((a, b) => b.titoli - a.titoli || b.finali - a.finali);
}

/* ---------- Ricominciare ---------- */

// Nuova partita da zero, ma tenendo chi e seduto dove: nessuno deve
// riscegliere la squadra fra un'asta e l'altra.
export function resetGame(s, seed) {
  const fresh = newGame(seed, s.host);
  // L'albo d'oro e le sedie sopravvivono: e il motivo per cui si rigioca.
  return { ...fresh, seats: s.seats, names: s.names, albo: s.albo || [] };
}

/* ---------- Utility di presentazione ---------- */

export function teamOf(s, uid) { return s.seats[uid] || null; }
export function seatTaken(s, teamKey) { return Object.values(s.seats).includes(teamKey); }
export function nameOfSeat(s, teamKey) {
  const uid = Object.keys(s.seats).find((u) => s.seats[u] === teamKey);
  return uid ? s.names[uid] : null;
}
export { TEAM_KEYS, TEAM_NAMES, SLOTS, ROSTER_SIZE, START_CREDITS, NUMERI_SQUADRE };
