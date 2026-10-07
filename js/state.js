// state.js — forma dello stato condiviso e transizioni pure.
//
// Nota di progetto: sul database NON finiscono mai i risultati delle partite,
// solo il seed della serie. Il motore e deterministico, quindi ogni client
// ricalcola da solo esattamente le stesse gare. Lo stato condiviso resta di
// pochi KB e non esiste il rischio che due schermi mostrino risultati diversi.

import { TEAM_KEYS, TEAM_NAMES, SLOTS, START_CREDITS, ROSTER_SIZE, NUMERI_SQUADRE, makeRng, shuffle, db, allenatoriDi, prossimoNome } from './core.js';
import { BOT, prossimoBot, uidBot, eBot } from './bot.js';

// Era 15. Abbassato a 12 giocando: con i bot che ci ripensano a ogni rilancio
// e chi gioca ormai esperto, gli ultimi secondi di un lotto erano spesso
// silenzio. Su una ventina di lotti sono un minuto abbondante in meno.
export const BID_SECONDS = 12;

// Quanto dura l'apertura della pallina del draft fra un giocatore e l'altro.
//
// SI AGGIUNGE AL CRONOMETRO, non si toglie: i secondi per offrire
// restano interi e nessuno perde tempo di decisione guardando un'animazione.
// Su una ventina di lotti sono una quindicina di secondi in piu sull'asta.
//
// Sta nello stato e non nel foglio di stile perche tutti i telefoni devono
// essere d'accordo su quando la pallina e aperta: si ricava dal tempo che
// manca, quindi chi entra a meta lotto vede la scheda gia scoperta invece di
// una pallina chiusa che non si apre piu.
export const RIVELA_MS = 600;

export function newGame(seed, hostUid) {
  const teams = {};
  for (const k of TEAM_KEYS) teams[k] = { credits: START_CREDITS, roster: [] };
  const lineups = {}; const tactics = {};
  for (const k of TEAM_KEYS) {
    lineups[k] = { PG: null, SG: null, SF: null, PF: null, C: null };
    tactics[k] = { v1: null, v2: null, strategy: 'equilibrato', ritmo: 'medio', coach: null };
  }
  return {
    v: 1, seed, host: hostUid, phase: 'lobby',
    seats: {}, // uid -> teamKey
    names: {}, // uid -> nickname
    teams, lineups, tactics,
    bots: {},           // teamKey -> quale bot la occupa
    nomi: {},           // teamKey -> indice in NOMI_SQUADRE, per chi in lobby cambia nome
    pronti: {},         // teamKey -> ha confermato quintetto e tattica
    conStagione: false, // si sceglie in lobby: solo playoff, o stagione + playoff
    stagione: null,     // fotografia di quintetti e tattiche con cui si e giocata
    auction: { order: null, idx: 0, bid: null, deadline: null, running: false, log: [], unsold: [],
      skipVoti: {}, skipUsati: 0 },
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
  s.nomi = s.nomi || {};     // stanze aperte prima dello zapping: nessun cambio
  s.pronti = s.pronti || {}; // stanze aperte prima del tasto conferma
  for (const k of TEAM_KEYS) {
    s.teams[k] = { credits: START_CREDITS, roster: [], ...(s.teams[k] || {}) };
    s.teams[k].roster = s.teams[k].roster || [];
    const lu = s.lineups[k] || {};
    s.lineups[k] = Object.fromEntries(SLOTS.map((sl) => [sl, lu[sl] ?? null]));
    s.tactics[k] = { v1: null, v2: null, strategy: 'equilibrato', ritmo: 'medio', coach: null, ...(s.tactics[k] || {}) };
  }
  const a = s.auction || {};
  s.auction = {
    order: a.order || null, idx: a.idx ?? 0, bid: a.bid || null,
    deadline: a.deadline || null, running: !!a.running,
    paused: !!a.paused, remaining: a.remaining ?? null,
    log: a.log || [], unsold: a.unsold || [],
    skipVoti: a.skipVoti || {}, skipUsati: a.skipUsati ?? 0,
  };
  s.albo = s.albo || [];
  s.bots = s.bots || {};
  s.conStagione = !!s.conStagione;
  if (s.stagione) {
    // Anche qui il database toglie i null: lo scheletro va ricostruito o
    // buildTeam trova un quintetto con quattro slot invece di cinque.
    const st = s.stagione;
    const lu = {}, tc = {};
    for (const k of TEAM_KEYS) {
      const l = st.lineups?.[k] || {};
      lu[k] = Object.fromEntries(SLOTS.map((sl) => [sl, l[sl] ?? null]));
      tc[k] = { v1: null, v2: null, strategy: 'equilibrato', ritmo: 'medio', coach: null, ...(st.tactics?.[k] || {}) };
    }
    s.stagione = { giri: st.giri ?? 1, seedBase: st.seedBase || s.seed, lineups: lu, tactics: tc };
  }
  if (s.po) {
    s.po = {
      ...s.po,
      reasons: s.po.reasons || [],
      ordine: s.po.ordine || [],
      teste: s.po.teste ?? 0,
      turni: (s.po.turni || []).map((round) => (round || []).map((m) => ({ gamesPlayed: 0, ...m }))),
    };
    if (s.po.third) s.po.third = { gamesPlayed: 0, ...s.po.third };
    s.po.pron = s.po.pron || {}; // stanze aperte prima dei pronostici
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
  const bots = { ...(s.bots || {}) };
  const k = seats[uid];
  delete seats[uid];
  delete names[uid];
  if (k) delete bots[k];
  return { ...s, seats, names, bots };
}

/* ---------- Bot ---------- */

// Un bot e una sedia occupata da nessuno. Serve quando siete in tre e volete
// giocare in quattro: se ne aggiunge uno e il tabellone torna pari. Li guida
// chi ospita, come gia fa per la chiusura dei lotti.
// `chiedi` serve solo alle misure: in partita non lo passa nessuno e il bot lo
// sceglie la rotazione. Senza, l'arena non poteva mettere Ada contro Bruno —
// chiedeva Ada e si sedeva chi capitava, e le quattro righe della tabella
// finivano per misurare tutte la stessa cosa.
export function aggiungiBot(s, chiedi, rnd) {
  if (s.phase !== 'lobby') return undefined;
  const libera = TEAM_KEYS.find((k) => !Object.values(s.seats).includes(k));
  if (!libera) return undefined;
  const presi = Object.values(s.bots || {});
  const quale = (chiedi && BOT[chiedi] && !presi.includes(chiedi)) ? chiedi : prossimoBot(s, rnd);
  if (!quale) return undefined; // finiti
  const uid = uidBot(libera);
  return {
    ...s,
    seats: { ...s.seats, [uid]: libera },
    names: { ...s.names, [uid]: BOT[quale].nome },
    bots: { ...(s.bots || {}), [libera]: quale },
  };
}

export function togliBot(s, teamKey) {
  if (s.phase !== 'lobby' || !s.bots?.[teamKey]) return undefined;
  return leaveSeat(s, uidBot(teamKey));
}

export function botDi(s) {
  return Object.keys(s.bots || {});
}

/* ---------- Il nome della squadra ---------- */

// In lobby si aspetta, e aspettare fermi e la parte peggiore. Il nome non si
// scrive: si pesca, e quello che esce te lo tieni finche non ripremi. Cambiare
// e gratis e reversibile, quindi non serve nessuna conferma.
//
// Si salva l'INDICE, non la stringa: due byte invece di venti, e se un domani
// un nome si corregge cambia ovunque senza migrazioni.
//
// `rnd` esiste per i test, che devono poter ripetere la stessa pescata. In
// partita non lo passa nessuno e si pesca davvero a caso.
export function cambiaNome(s, teamKey, rnd) {
  if (s.phase !== 'lobby') return undefined;
  // Una sedia vuota non ha nessuno che possa volerla rinominare, e lasciarlo
  // fare toglierebbe nomi dal giro a chi sta giocando.
  if (!Object.values(s.seats).includes(teamKey)) return undefined;
  // Un nome libero c'e sempre: le sedie sono al massimo dodici e i nomi
  // ventidue, quindi almeno dieci restano fuori da qualunque tavolo pieno.
  const prossimo = prossimoNome(s.seed, s.nomi, teamKey, Object.values(s.seats), rnd);
  return { ...s, nomi: { ...(s.nomi || {}), [teamKey]: prossimo } };
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
  // I voti per saltare valgono per QUESTO lotto: al successivo si riparte.
  const fresh = { ...a, bid: null, paused: false, remaining: null, skipVoti: {} };
  const stillBuying = attive(s).some((k) => slotsLeft(s, k) > 0 && maxBid(s, k) >= 1);
  if (!stillBuying || !a.order?.length) {
    return { ...s, auction: { ...fresh, running: false, deadline: null } };
  }

  const owned = new Set(attive(s).flatMap((k) => s.teams[k].roster));
  let idx = a.idx;
  for (let step = 0; step < a.order.length; step++) {
    idx = (idx + 1) % a.order.length;
    if (!owned.has(a.order[idx])) {
      // Il tempo della pallina si aggiunge: i secondi per offrire
      // partono quando la scheda e scoperta, non prima.
      return { ...s, auction: { ...fresh, idx, deadline: now + BID_SECONDS * 1000 + RIVELA_MS, running: true } };
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

/* ---------- Saltare un giocatore ---------- */

// Quante volte il tavolo puo rifiutare un giocatore in tutta l'asta. Dopo,
// chi esce va comprato. Tre e il numero delle regole di casa: si cambia qui.
export const MAX_SKIP = 3;

// Chi ha ancora voce in capitolo: chi ha almeno un posto libero. Una squadra
// con la rosa piena non puo comprare, quindi non ha senso che il suo voto
// blocchi gli altri.
export function puoVotare(s) {
  return attive(s).filter((k) => slotsLeft(s, k) > 0);
}

export function skipRimasti(s) {
  return Math.max(0, MAX_SKIP - (s.auction.skipUsati || 0));
}

// Il voto e una manifestazione di disinteresse, non un comando: il giocatore
// salta solo se lo rifiutano TUTTI quelli che potrebbero comprarlo.
export function votaSkip(s, teamKey, now) {
  if (s.phase !== 'auction' || !s.auction.running || s.auction.paused) return undefined;
  if (!puoVotare(s).includes(teamKey)) return undefined;
  if (skipRimasti(s) <= 0) return undefined;

  const voti = { ...(s.auction.skipVoti || {}) };
  if (voti[teamKey]) delete voti[teamKey]; else voti[teamKey] = true;

  const tutti = puoVotare(s).every((k) => voti[k]);
  if (!tutti) return { ...s, auction: { ...s.auction, skipVoti: voti } };

  // Unanimita: si salta, e se ne consuma uno dei tre.
  return passLot({
    ...s,
    auction: { ...s.auction, skipVoti: {}, skipUsati: (s.auction.skipUsati || 0) + 1 },
  }, now);
}

// Finiti gli skip, un giocatore che nessuno vuole non puo restare per aria:
// va a chi ne ha piu bisogno, al prezzo minimo. Senza questo, "il quarto
// bisogna prenderlo per forza" non avrebbe modo di succedere davvero — il
// tavolo potrebbe semplicemente non offrire e lasciarlo passare lo stesso.
export function assegnaDufficio(s, now) {
  const pid = currentPlayerId(s);
  if (!pid) return s;
  const candidati = puoVotare(s).filter((k) => maxBid(s, k) >= 1);
  if (!candidati.length) return passLot(s, now);
  const scelto = candidati.slice().sort((a, b) =>
    slotsLeft(s, b) - slotsLeft(s, a)              // chi ha piu posti vuoti
    || s.teams[b].credits - s.teams[a].credits     // poi chi ha piu cassa
    || (a < b ? -1 : 1))[0];                       // poi un ordine stabile
  return award(s, pid, scelto, 1, now);
}

// Quanto manca alla chiusura del lotto, in millisecondi. null quando non c'e
// un cronometro in corso.
//
// STA QUI, NON NELL'INTERFACCIA. Prima chi ospita leggeva il tempo residuo
// dal valore di ritorno di tickClock(), che disegna il cronometro a schermo —
// e tickClock restituisce null quando non trova l'elemento da aggiornare.
// Voleva dire che la chiusura automatica del lotto dipendeva da un pezzo di
// pagina: bastava un ridisegno andato storto e l'asta si fermava in silenzio
// per tutti, col cronometro a zero e il giocatore mai assegnato. Il tempo e
// un fatto dello stato, non del DOM.
export function tempoRimasto(s, now) {
  const a = s?.auction;
  if (!a?.running || a.paused || !a.deadline) return null;
  return Math.max(0, a.deadline - now);
}

// La pallina e ancora chiusa? Si ricava dal tempo che manca, quindi tutti i
// telefoni sono d'accordo senza scambiarsi niente, e chi entra a meta lotto
// vede la scheda gia scoperta invece di una pallina che non si apre piu.
export function inRivelazione(s, now) {
  const left = tempoRimasto(s, now);
  return left !== null && left > BID_SECONDS * 1000;
}

// Chiamata dal banditore quando il cronometro e scaduto.
export function resolveLot(s, now) {
  const pid = currentPlayerId(s);
  const bid = s.auction.bid;
  if (!pid) return s;
  if (bid) return award(s, pid, bid.team, bid.amount, now);
  // Nessuna offerta e nessuno skip: il giocatore non sparisce, lo prende
  // qualcuno. Finche restano skip il tavolo puo ancora rifiutarlo votando,
  // ma lasciar scadere il tempo non e un modo per farlo.
  return assegnaDufficio(s, now);
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
    // Un allenatore di partenza c'e sempre: la scelta e se cambiarlo, non se
    // farla. Cosi nessuno resta bloccato senza sapere che gli mancava.
    const sbloccati = allenatoriDi(s.teams[k].roster);
    const coach = sbloccati.some((c) => c.id === tactics[k].coach)
      ? tactics[k].coach : (sbloccati[0]?.id ?? null);
    if (tactics[k].v1 && tactics[k].v2) { tactics[k] = { ...tactics[k], coach }; continue; }
    const sorted = s.teams[k].roster.map((id) => D.byId[id]).filter(Boolean)
      .sort((x, y) => y.attrs.sco - x.attrs.sco);
    tactics[k] = {
      v1: sorted[0]?.id ?? null,
      v2: sorted[1]?.id ?? null,
      strategy: tactics[k].strategy || 'equilibrato',
      ritmo: tactics[k].ritmo || 'medio',
      coach,
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

/* ---------- Chi ha finito di decidere ---------- */

// Quintetto e tattica si possono cambiare fino all'ultimo, quindi avere dei
// valori validi non vuol dire aver finito: chi ospita non sapeva se stavi
// ancora pensando o se eri andato a prendere da bere. Questo e un segnale
// esplicito — "per me si puo andare" — e si puo ritirare, perche cambiare
// idea dopo aver guardato le altre squadre e esattamente quello che si fa.
//
// NON BLOCCA NIENTE. Chi ospita vede il conto e decide: aspettare un
// distratto o partire lo stesso. Se il tasto fermasse i playoff, uno che si
// allontana dal telefono bloccherebbe la serata di tutti.
export function confermaPronto(s, teamKey, valore) {
  if (s.phase !== 'squadra' || !attive(s).includes(teamKey)) return undefined;
  const pronti = { ...(s.pronti || {}) };
  const ora = valore === undefined ? !pronti[teamKey] : !!valore;
  if (ora) pronti[teamKey] = true; else delete pronti[teamKey];
  return { ...s, pronti };
}

export function haConfermato(s, teamKey) {
  return !!(s.pronti || {})[teamKey];
}

export function quantiPronti(s) {
  return attive(s).filter((k) => (s.pronti || {})[k]).length;
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

// Assegnazione PROVVISORIA, per l'asta: la rosa non e ancora completa e
// autoLineup ha bisogno di cinque giocatori. Serve solo a far vedere quali
// caselle sono ancora vuote, cioe chi ti manca davvero. A fine asta
// autoLineup rifa tutto da zero cercando la disposizione ottima.
export function slotProvvisori(roster) {
  const D = db();
  const out = Object.fromEntries(SLOTS.map((sl) => [sl, null]));
  const ps = (roster || []).map((id) => D.byId[id]).filter(Boolean);
  const restano = [];
  // Prima chi ha il ruolo naturale libero, poi i ruoli alternativi, poi il
  // resto dove capita: cosi un doppione non ruba la casella a chi la merita.
  for (const p of ps) {
    if (!out[p.pos]) out[p.pos] = p.id; else restano.push(p);
  }
  const ancora = [];
  for (const p of restano) {
    const alt = (p.alt || []).find((sl) => !out[sl]);
    if (alt) out[alt] = p.id; else ancora.push(p);
  }
  for (const p of ancora) {
    const libero = SLOTS.find((sl) => !out[sl]);
    if (libero) out[libero] = p.id;
  }
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
  // L'allenatore lo sbloccano i giocatori comprati: non si puo scegliere
  // Popovich senza aver preso nessuno dei suoi Spurs.
  if (cur.coach && !allenatoriDi(s.teams[teamKey].roster).some((c) => c.id === cur.coach)) return s;
  return { ...s, tactics: { ...s.tactics, [teamKey]: cur } };
}

export function tacticsReady(s) {
  return attive(s).every((k) => {
    const t = s.tactics[k];
    return t.v1 && t.v2 && t.v1 !== t.v2 && t.strategy && t.ritmo;
  });
}

export { allenatoriDi, eBot, uidBot };

/* ---------- Stagione regolare ---------- */

// Il formato si sceglie in lobby e vale per tutti. Con 2, 4 e 8 squadre la
// stagione non serve a eliminare nessuno (entrano tutte nel tabellone): serve
// a dare un senso alla classifica e a seminare gli accoppiamenti.
export function setFormato(s, con) {
  if (s.phase !== 'lobby') return undefined;
  return { ...s, conStagione: !!con };
}

// La stagione si gioca UNA volta, con i quintetti e le tattiche di adesso.
// Quella fotografia resta nello stato: dopo si possono ritoccare le tattiche
// per i playoff senza che la classifica gia giocata cambi sotto i piedi.
export function giocaStagione(s, giri) {
  if (s.phase !== 'squadra' || s.stagione || !squadraReady(s)) return undefined;
  const lineups = {}, tactics = {};
  for (const k of TEAM_KEYS) {
    lineups[k] = { ...s.lineups[k] };
    tactics[k] = { ...s.tactics[k] };
  }
  // Finita la stagione le tattiche si ritoccano, quindi le conferme date per
  // giocarla non valgono piu: si ricomincia a dire quando si e pronti.
  return { ...s, pronti: {}, stagione: { giri, seedBase: s.seed, lineups, tactics } };
}

/* ---------- Playoff ---------- */

// Ogni serie si scopre una gara alla volta, in tutti i turni.
//
// I turni prima della finale andavano a due gare per volta, per non far durare
// troppo la serata. Con il punteggio che si anima non regge piu: due gare
// insieme vogliono dire due punteggi che salgono nello stesso momento, e in
// semifinale le serie aperte sono due — quattro animazioni a schermo e nessuna
// che si riesce a seguire. Meglio una gara sola e la si guarda davvero.
export const PASSO_GARA = 1;

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
      fuori: tab.fuori || [],          // eliminate dalla stagione regolare
      daStagione: !!tab.daStagione,
      turni,
      third: null, // nasce solo se il penultimo turno aveva due serie
      // La serie a schermo (vedi serie.js). Si salva da subito: senza, a
      // serie chiusa si passava da soli alla prossima, e il riepilogo non lo
      // vedeva nessuno.
      corrente: '0-0',
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

/* ---------- Pronostici ---------- */

// Due mercati per serie: l'esito ("e", per esempio "4-1" dal punto di vista
// del tabellone, prima squadra a sinistra) e il miglior marcatore ("m", l'id
// del giocatore). Pronostica chiunque sia al tavolo, anche chi gioca la
// serie: e tutto gia deciso nel seme, nessuno puo influenzarlo. Una serie
// gia iniziata non si pronostica piu: dopo gara 1 sarebbe facile.
export const ESITO_VALIDO = /^(4-[0-3]|[0-3]-4)$/;

export function pronostica(s, chi, id, campo, valore) {
  if (s.phase !== 'playoffs' || !s.po || !attive(s).includes(chi)) return undefined;
  if (campo === 'e' ? !ESITO_VALIDO.test(valore) : (campo !== 'm' || !valore)) return undefined;
  let meta;
  if (id === 'third') meta = s.po.third;
  else {
    const [r, i] = String(id).split('-').map(Number);
    meta = s.po.turni?.[r]?.[i];
  }
  if (!meta || meta.gamesPlayed > 0) return undefined;
  const pron = s.po.pron || {};
  const mio = { ...(pron[id]?.[chi] || {}) };
  delete mio.v; delete mio.g; // il formato di prima: vincente e gare
  mio[campo] = valore;
  return { ...s, po: { ...s.po, pron: { ...pron, [id]: { ...(pron[id] || {}), [chi]: mio } } } };
}

/* ---------- La serie in corso ---------- */

// Si gioca una serie alla volta (vedi serie.js). Chi ospita la sposta con
// "Avanti" quando quella prima e chiusa e il riepilogo e stato letto.
export function vaiASerie(s, id) {
  if (s.phase !== 'playoffs' || !s.po || !id) return undefined;
  return { ...s, po: { ...s.po, corrente: id } };
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

/* ---------- Le rivalita fra serate ---------- */

// Chi ha battuto chi, sommando tutte le serate. L'albo sapeva chi aveva vinto
// il titolo, non chi aveva eliminato chi: il testa a testa fra persone e il
// cuore delle discussioni fra una serata e l'altra, ed era l'unica cosa che
// mancava per averle.
//
// Si conta per PERSONA e non per sedia, perche le sedie possono cambiare
// padrone. Le serate registrate prima che esistesse questo conto non hanno
// le serie dentro: si saltano invece di inventarle.
export function rivalita(albo) {
  const coppie = {};
  const persone = {};
  const io = (n) => (persone[n] ||= { nome: n, vinte: 0, perse: 0, contro: {} });

  for (const e of albo || []) {
    for (const x of e.serie || []) {
      if (!x.a || !x.b || x.a === x.b) continue;
      const vince = x.va > x.vb ? x.a : x.b;
      const perde = vince === x.a ? x.b : x.a;
      // La coppia si chiude sempre nello stesso ordine, cosi Diego-Fabio e
      // Fabio-Diego sono la stessa rivalita.
      const [p, q] = [x.a, x.b].sort();
      const c = (coppie[`${p}|${q}`] ||= { a: p, b: q, va: 0, vb: 0 });
      if (vince === p) c.va++; else c.vb++;
      io(vince).vinte++;
      io(perde).perse++;
      const cp = (io(perde).contro[vince] ||= { vinte: 0, perse: 0 });
      cp.perse++;
      const cv = (io(vince).contro[perde] ||= { vinte: 0, perse: 0 });
      cv.vinte++;
    }
  }

  // La bestia nera: l'avversario contro cui hai perso piu serie, e almeno
  // piu di quante gliene hai vinte — se siete pari non e una bestia nera,
  // e una rivalita.
  for (const p of Object.values(persone)) {
    const peggio = Object.entries(p.contro)
      .filter(([, r]) => r.perse > r.vinte)
      .sort((a, b) => (b[1].perse - b[1].vinte) - (a[1].perse - a[1].vinte) || b[1].perse - a[1].perse)[0];
    p.bestiaNera = peggio ? { nome: peggio[0], ...peggio[1] } : null;
  }

  return {
    coppie: Object.values(coppie).sort((x, y) => (y.va + y.vb) - (x.va + x.vb) || Math.abs(y.va - y.vb) - Math.abs(x.va - x.vb)),
    persone,
  };
}

/* ---------- Ricominciare ---------- */

// Nuova partita da zero, ma tenendo chi e seduto dove: nessuno deve
// riscegliere la squadra fra un'asta e l'altra.
export function resetGame(s, seed) {
  const fresh = newGame(seed, s.host);
  // L'albo d'oro e le sedie sopravvivono: e il motivo per cui si rigioca.
  // Anche il formato scelto: chi gioca con la stagione regolare non vuole
  // riattivarla a ogni partita.
  // I bot restano seduti fra una partita e l'altra, come le persone.
  return { ...fresh, seats: s.seats, names: s.names, albo: s.albo || [],
    bots: s.bots || {}, conStagione: !!s.conStagione };
}

/* ---------- Utility di presentazione ---------- */

export function teamOf(s, uid) { return s.seats[uid] || null; }
export function seatTaken(s, teamKey) { return Object.values(s.seats).includes(teamKey); }
export function nameOfSeat(s, teamKey) {
  const uid = Object.keys(s.seats).find((u) => s.seats[u] === teamKey);
  return uid ? s.names[uid] : null;
}
export { TEAM_KEYS, TEAM_NAMES, SLOTS, ROSTER_SIZE, START_CREDITS, NUMERI_SQUADRE };
