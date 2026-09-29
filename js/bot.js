// bot.js — giocatori finti, per quando siete in tre e volete giocare in
// quattro.
//
// COME FUNZIONANO. Un bot e una sedia occupata da nessuno. Li guida SOLO chi
// ospita, come gia succede per la chiusura dei lotti: se li guidassero tutti
// i device, quattro browser proverebbero a rilanciare per lo stesso bot.
//
// NON BARANO. Vedono esattamente quello che vedete voi — le rose altrui sono
// gia sullo schermo di tutti — e passano dagli stessi controlli: canBid, la
// regola di riserva, il tetto di spesa. Nessuna scorciatoia.
//
// SONO QUATTRO E DIVERSI. Non per fare scena: quattro copie dello stesso bot
// ottimo renderebbero ogni asta identica. Uno solo gioca bene davvero.

import { db, allenatoriDi, makeRng, hashStr, SLOTS, STRATEGIES, ROSTER_SIZE } from './core.js';
import { buildTeam, matchup, RITMI } from './engine.js';

/* ==========================================================
   Livello di sostituzione
   ==========================================================

   Per sapere quanto vale un giocatore PER QUESTA ROSA si completa la rosa con
   delle riserve e si guarda di quanto salgono attacco e difesa.

   Il primo tentativo usava veri giocatori di fascia media, uno per ruolo. Non
   funziona, e si vedeva dai risultati: i piu preziosi risultavano tutti ala
   grande, e Jokic valeva PIU di prima se la rosa aveva gia Shaq. Quella
   differenza non misurava il giocatore, misurava quale riempitivo gli
   capitava di sostituire. Qui la riserva e una sola, ripetuta in ogni ruolo,
   con gli attributi del decimo percentile: il confronto e sempre lo stesso. */

const ATTR = ['sco', 'tre', 'pla', 'reb', 'dif', 'dpe', 'atl', 'usg'];
let riserveMesse = false;

export function installaRiserve() {
  const D = db();
  if (riserveMesse && D.byId.__ris_PG) return;
  const base = {};
  for (const a of ATTR) {
    const v = D.players.map((p) => p.attrs[a]).sort((x, y) => x - y);
    base[a] = v[Math.floor(v.length * 0.10)];
  }
  for (const sl of SLOTS) {
    D.byId[`__ris_${sl}`] = {
      id: `__ris_${sl}`, n: `riserva ${sl}`, ovr: 85, pos: sl, alt: [],
      arc: null, era: '2020s', tm: '-', attrs: { ...base },
    };
  }
  riserveMesse = true;
}

// Disposizione provvisoria, la stessa che usa la schermata d'asta.
function disponi(ids) {
  const D = db();
  const out = Object.fromEntries(SLOTS.map((sl) => [sl, null]));
  const ps = (ids || []).map((id) => D.byId[id]).filter(Boolean);
  const resto = [];
  for (const p of ps) { if (!out[p.pos]) out[p.pos] = p.id; else resto.push(p); }
  const ancora = [];
  for (const p of resto) {
    const alt = (p.alt || []).find((sl) => !out[sl]);
    if (alt) out[alt] = p.id; else ancora.push(p);
  }
  for (const p of ancora) {
    const libero = SLOTS.find((sl) => !out[sl]);
    if (libero) out[libero] = p.id;
  }
  return out;
}

export function forzaRosa(ids) {
  installaRiserve();
  const D = db();
  const lu = disponi(ids);
  for (const sl of SLOTS) if (!lu[sl]) lu[sl] = `__ris_${sl}`;
  const ord = Object.values(lu).map((id) => D.byId[id]).sort((a, b) => b.attrs.sco - a.attrs.sco);
  const T = buildTeam('t1', lu, {
    v1: ord[0].id, v2: ord[1].id, strategy: 'equilibrato', ritmo: 'medio', coach: null,
  });
  return T.off + T.def;
}

export function valorePer(rosa, id) {
  if (rosa.includes(id)) return -999;
  return forzaRosa([...rosa, id]) - forzaRosa(rosa);
}

/* ==========================================================
   Le quattro teste
   ========================================================== */

// Ognuna dice solo una cosa: fino a quanto sale su questo giocatore. Il
// resto — riserva, slot, validita — lo impone lo stato, non il bot.
export const BOT = {
  ada: {
    nome: 'Ada',
    stile: 'calcola il valore di ogni giocatore per la sua rosa',
    forte: true,
    attesa: [900, 2600],
    tetto(st, k, pid, S) {
      const D = db();
      const t = st.teams[k];
      const liberi = ROSTER_SIZE - t.roster.length;
      const max = S.maxBid(st, k);
      if (liberi <= 0 || max < 1) return 0;
      const v = valorePer(t.roster, pid);
      if (v <= 0) return Math.min(max, 1);
      // Quanto vale rispetto a quello che il mercato offre ancora. Il metro e
      // il valore mediano dei disponibili, non il percentile: schiacciava tutto.
      const presi = new Set(S.attive(st).flatMap((x) => st.teams[x].roster));
      const restanti = D.players.filter((p) => !presi.has(p.id));
      const passo = Math.max(1, Math.ceil(restanti.length / 60));
      const valori = restanti.filter((_, i) => i % passo === 0)
        .map((p) => valorePer(t.roster, p.id)).sort((a, b) => a - b);
      const mediano = valori.length ? valori[Math.floor(valori.length / 2)] : v;
      const rapporto = mediano > 0 ? v / mediano : 1;
      // 0.9 non e un numero scelto a occhio: e quello che ha vinto di piu
      // nel confronto fra aggressivita diverse (vedi tools/bot-arena.mjs).
      let tetto = Math.round((t.credits / liberi) * Math.pow(rapporto, 1.9) * 0.9);
      if (liberi === 2) tetto = Math.max(tetto, Math.floor(t.credits * 0.6));
      if (liberi === 1) tetto = max;
      return Math.max(0, Math.min(max, tetto));
    },
  },

  bruno: {
    nome: 'Bruno',
    stile: 'compra i nomi grossi e si innamora delle stelle',
    forte: false,
    attesa: [400, 1500],
    tetto(st, k, pid, S) {
      const D = db();
      const p = D.byId[pid];
      const max = S.maxBid(st, k);
      if (max < 1) return 0;
      return Math.min(max, Math.round((p.ovr - 85) * 2.8));
    },
  },

  cleo: {
    nome: 'Cleo',
    stile: 'caccia le occasioni e non paga mai il prezzo pieno',
    forte: false,
    attesa: [1800, 3400],
    tetto(st, k, pid, S) {
      const t = st.teams[k];
      const liberi = ROSTER_SIZE - t.roster.length;
      const max = S.maxBid(st, k);
      if (liberi <= 0 || max < 1) return 0;
      const v = valorePer(t.roster, pid);
      // Paga poco per tutti, e si sveglia solo quando restano pochi posti.
      let tetto = Math.round(Math.max(1, v) * 0.22);
      if (liberi <= 2) tetto = Math.max(tetto, Math.floor(t.credits * 0.5));
      if (liberi === 1) tetto = max;
      return Math.max(0, Math.min(max, tetto));
    },
  },

  dino: {
    nome: 'Dino',
    stile: 'svuota la cassa sui primi due che gli piacciono',
    forte: false,
    attesa: [300, 1100],
    tetto(st, k, pid, S) {
      const D = db();
      const p = D.byId[pid];
      const t = st.teams[k];
      const liberi = ROSTER_SIZE - t.roster.length;
      const max = S.maxBid(st, k);
      if (liberi <= 0 || max < 1) return 0;
      if (liberi >= 4 && p.ovr >= 92) return max;       // tutto e subito
      if (liberi >= 3) return Math.min(max, Math.round((p.ovr - 88) * 3));
      return Math.min(max, liberi === 1 ? max : 3);      // poi si tira a campare
    },
  },
};

export const ID_BOT = Object.keys(BOT);
export const uidBot = (k) => `bot:${k}`;
export const eBot = (uid) => String(uid || '').startsWith('bot:');

// Quale bot tocca adesso: ruotano, e l'ordine dipende dal seed della partita,
// cosi due serate di fila non hanno gli stessi avversari.
export function prossimoBot(st) {
  const usati = new Set(Object.values(st.bots || {}));
  const rng = makeRng(`${st.seed}:bot`);
  const ordine = ID_BOT.slice();
  for (let i = ordine.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ordine[i], ordine[j]] = [ordine[j], ordine[i]];
  }
  return ordine.find((b) => !usati.has(b)) || null;
}

/* ==========================================================
   Quanto offre, adesso
   ========================================================== */

// Ritorna l'importo da offrire, o null se questo bot per ora sta fermo.
// `momento` e un timestamp locale di chi ospita: serve solo a non farli
// rilanciare tutti nello stesso istante, cosa che si vedrebbe subito.
export function offerta(st, k, S, momento, memoria) {
  const bot = BOT[st.bots?.[k]];
  if (!bot || st.phase !== 'auction') return null;
  const a = st.auction;
  if (!a.running || a.paused) return null;
  const pid = S.currentPlayerId(st);
  if (!pid || S.slotsLeft(st, k) <= 0) return null;

  const cur = a.bid;
  if (cur && cur.team === k) return null;          // non si rilancia su se stessi
  const minimo = cur ? cur.amount + 1 : 1;

  // Il tetto si calcola una volta per lotto: per Ada sono un centinaio di
  // simulazioni, e non cambia mentre si rilancia.
  const m = memoria[k] || (memoria[k] = {});
  if (m.lotto !== a.idx) {
    m.lotto = a.idx;
    m.tetto = bot.tetto(st, k, pid, S);
    // Ogni bot ha il suo tempo di reazione: entrano scaglionati.
    const [min, max] = bot.attesa;
    m.sveglia = momento + min + Math.random() * (max - min);
  }
  if (momento < m.sveglia) return null;
  if (m.tetto < minimo) return null;
  return S.canBid(st, k, minimo) ? minimo : null;
}

/* ==========================================================
   La tattica
   ========================================================== */

function permutazioni(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const resto = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutazioni(resto)) out.push([arr[i], ...p]);
  }
  return out;
}

// Ada calcola: prova le combinazioni e tiene quella che regge meglio contro
// TUTTE le strategie che gli avversari potrebbero scegliere, non solo contro
// quella che hanno adesso. Gli altri tre scelgono come sceglierebbe una
// persona di fretta.
export function tatticaBot(st, k, S) {
  const D = db();
  const bot = BOT[st.bots?.[k]];
  const rosa = st.teams[k].roster;
  if (!bot || rosa.length < ROSTER_SIZE) return null;

  const ord = rosa.map((id) => D.byId[id]).sort((a, b) => b.attrs.sco - a.attrs.sco);
  const sbloccati = allenatoriDi(rosa);

  if (!bot.forte) {
    // Scelte di pancia, diverse per ognuno: servono a non farli sembrare
    // tutti lo stesso avversario.
    const rng = makeRng(`${st.seed}:${k}:tat`);
    const perStile = {
      bruno: { strategy: 'palla-star', ritmo: 'veloce' },
      cleo: { strategy: 'equilibrato', ritmo: 'lento' },
      dino: { strategy: 'transizione', ritmo: 'run-gun' },
    }[st.bots[k]] || { strategy: 'equilibrato', ritmo: 'medio' };
    return {
      lu: S.autoLineup(rosa),
      tac: {
        v1: ord[0].id, v2: ord[1].id, ...perStile,
        coach: sbloccati.length ? sbloccati[Math.floor(rng() * sbloccati.length)].id : null,
      },
    };
  }

  const avversari = [];
  for (const o of S.attive(st)) {
    if (o === k) continue;
    const ro = st.teams[o].roster;
    if (ro.length < ROSTER_SIZE) continue;
    const lo = st.lineups?.[o] && SLOTS.every((sl) => st.lineups[o][sl])
      ? st.lineups[o] : S.autoLineup(ro);
    const oo = ro.map((id) => D.byId[id]).sort((a, b) => b.attrs.sco - a.attrs.sco);
    for (const sv of Object.keys(STRATEGIES)) {
      try {
        avversari.push(buildTeam(o, lo, {
          v1: st.tactics[o]?.v1 || oo[0].id, v2: st.tactics[o]?.v2 || oo[1].id,
          strategy: sv, ritmo: st.tactics[o]?.ritmo || 'medio', coach: st.tactics[o]?.coach || null,
        }));
      } catch { /* quintetto non ancora valido */ }
    }
  }

  // Due passaggi, o sarebbero milioni di combinazioni: prima il quintetto
  // (120 disposizioni, tattica fissa), poi il resto sulle tre migliori.
  const base = { v1: ord[0].id, v2: ord[1].id, strategy: 'equilibrato', ritmo: 'medio', coach: null };
  const cls = [];
  for (const perm of permutazioni(rosa)) {
    const lu = {}; SLOTS.forEach((sl, i) => { lu[sl] = perm[i]; });
    try { const T = buildTeam(k, lu, base); cls.push({ lu, s: T.off + T.def }); } catch { /* disposizione non valida */ }
  }
  cls.sort((a, b) => b.s - a.s);

  const coach = [null, ...sbloccati.map((c) => c.id)];
  const v1c = ord.slice(0, 3).map((p) => p.id);
  const v2c = ord.slice(0, 4).map((p) => p.id);
  let best = null;
  for (const { lu } of cls.slice(0, 3)) {
    for (const v1 of v1c) for (const v2 of v2c) {
      if (v1 === v2) continue;
      for (const strategy of Object.keys(STRATEGIES)) {
        for (const ritmo of Object.keys(RITMI)) for (const c of coach) {
          const tac = { v1, v2, strategy, ritmo, coach: c };
          let T;
          try { T = buildTeam(k, lu, tac); } catch { continue; }
          let s;
          if (!avversari.length) s = T.off + T.def;
          else {
            let somma = 0, peggio = Infinity;
            for (const O of avversari) {
              const m = matchup(T, O);
              const d = (m.offA - m.defB) - (m.offB - m.defA);
              somma += d; if (d < peggio) peggio = d;
            }
            s = (somma / avversari.length) * 0.5 + peggio * 0.5;
          }
          if (!best || s > best.s) best = { s, lu, tac };
        }
      }
    }
  }
  return best;
}

export { hashStr };
