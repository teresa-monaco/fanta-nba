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

   Ci sono voluti tre tentativi.

   Il primo usava veri giocatori di fascia media, uno per ruolo. I piu
   preziosi risultavano tutti ala grande, e Jokic valeva PIU di prima se la
   rosa aveva gia Shaq: quella differenza non misurava il giocatore, misurava
   quale riempitivo gli capitava di sostituire.

   Il secondo usava UNA riserva sola, uguale in ogni ruolo, con gli attributi
   del decimo percentile di tutto il pool. Peggio: la protezione del ferro e
   una cosa da lunghi, quindi il decimo percentile su tutti i giocatori e il
   valore di una guardia. Quella riserva era un disastro sotto canestro in
   OGNI ruolo, e cosi qualunque centro — anche un 86 — sembrava salvare la
   squadra da un buco che nella realta non esiste: il quinto uomo e comunque
   un 85 vero. Risultato: nove dei primi quindici erano centri, e Brad
   Daugherty valeva quanto Michael Jordan.

   Il terzo dava a ogni ruolo una riserva con gli attributi MEDIANI dei
   giocatori di quel ruolo. Sembra giusto e non lo e: un giocatore che ha la
   mediana in TUTTO non ha punti deboli, e quindi e sopra la media vera —
   misurato, solo 14 guardie su 42 lo battevano su piu di meta attributi. E
   puniva i giocatori spigolosi: Wade, +12 in realizzazione e +34 in
   atletismo ma -47 nel tiro da tre, finiva 177esimo su 225.

   Il quarto, questo: si usano GIOCATORI VERI di fascia media, e se ne
   provano tre per ruolo mediando i risultati. Veri, quindi con i loro buchi;
   tre, perche uno solo porta le proprie stranezze nel confronto — ed era
   esattamente l'errore del primo tentativo. */

const ATTR = ['sco', 'tre', 'pla', 'reb', 'dif', 'dpe', 'atl', 'usg'];
const QUANTE_RISERVE = 3;
let riserveMesse = false;
let riserve = [];   // QUANTE_RISERVE squadre di riserve, una per confronto

export function installaRiserve() {
  const D = db();
  if (riserveMesse) return;
  // Attorno alla meta della classifica per ruolo: chi prenderesti davvero se
  // non comprassi niente di meglio.
  const PERC = [0.40, 0.50, 0.60];
  riserve = PERC.map((pc) => {
    const set = {};
    for (const sl of SLOTS) {
      const delRuolo = D.players.filter((p) => p.pos === sl).sort((a, b) => a.ovr - b.ovr);
      set[sl] = delRuolo[Math.floor(delRuolo.length * pc)]?.id || delRuolo[0]?.id;
    }
    return set;
  });
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

// Forza della rosa completata con UNA delle squadre di riserve.
function forzaCon(ids, set) {
  const D = db();
  const lu = disponi(ids);
  const usati = new Set(ids);
  for (const sl of SLOTS) {
    if (lu[sl]) continue;
    // Se la riserva di quel ruolo e gia in rosa (capita: sono giocatori
    // veri) se ne prende un'altra qualunque libera, o il confronto salta.
    let r = set[sl];
    if (!r || usati.has(r)) {
      r = D.players.find((p) => p.pos === sl && !usati.has(p.id))?.id;
    }
    if (!r) return null;
    lu[sl] = r;
    usati.add(r);
  }
  const ord = Object.values(lu).map((id) => D.byId[id]).sort((a, b) => b.attrs.sco - a.attrs.sco);
  try {
    const T = buildTeam('t1', lu, {
      v1: ord[0].id, v2: ord[1].id, strategy: 'equilibrato', ritmo: 'medio', coach: null,
    });
    return T.off + T.def;
  } catch { return null; }
}

// Media su tutte le squadre di riserve: una sola porterebbe le proprie
// stranezze dentro il confronto.
export function forzaRosa(ids) {
  installaRiserve();
  let somma = 0, n = 0;
  for (const set of riserve) {
    const f = forzaCon(ids, set);
    if (f !== null) { somma += f; n++; }
  }
  return n ? somma / n : 0;
}

// Chi puo giocare piu ruoli vale di piu, e il confronto su una rosa vuota da
// solo non lo vede: li ognuno prende la sua posizione naturale. Ma LeBron che
// fa SF, PF e PG riempie qualunque buco tu abbia, mentre uno da un ruolo solo
// lo riempie se ti serve e altrimenti ti costringe a spostare un altro.
// Il peso e piccolo di proposito: la versatilita e un di piu, non il motivo
// per cui compri un giocatore.
const BONUS_RUOLO = 0.9;

export function valorePer(rosa, id) {
  if (rosa.includes(id)) return -999;
  const D = db();
  const p = D.byId[id];
  const base = forzaRosa([...rosa, id]) - forzaRosa(rosa);
  const ruoli = 1 + ((p?.alt || []).length);
  return base + (ruoli - 1) * BONUS_RUOLO;
}

/* ==========================================================
   Le quattro teste
   ========================================================== */

// Ognuna dice solo una cosa: fino a quanto sale su questo giocatore. Il
// resto — riserva, slot, validita — lo impone lo stato, non il bot.
// Quanto spinge Ada sui giocatori che valgono. Non e un numero scelto a
// occhio: esce dal confronto in tools/bot-arena.mjs, che misura anche i
// crediti lasciati in tasca a fine asta — la spia che aveva mancato il
// difetto la prima volta.
const AGGRESSIVITA = 1.5;

export const BOT = {
  ada: {
    nome: 'Ada',
    stile: 'calcola il valore di ogni giocatore per la sua rosa',
    forte: true,
    attesa: [900, 2600],
    // I CREDITI SI SPALMANO SUI LOTTI CONTESI, NON SUGLI SLOT.
    //
    // La prima versione divideva la cassa per gli slot da riempire e finiva
    // l'asta con 28 crediti su 50 in tasca, avendo lasciato un 96 a undici e
    // un 89 a dieci. Sbagliava due cose insieme.
    //
    // La prima: quando l'avversario ha riempito la rosa, tutto quello che
    // resta costa 1. Quindi i crediti non vanno divisi per i MIEI slot, ma
    // per i lotti in cui qualcuno mi contendera ancora il giocatore. Gli
    // ultimi posti si riempiono con gli avanzi, e vanno preventivati a 1.
    //
    // La seconda: misurava il valore come rapporto con la mediana. Ma i
    // valori sono compresi fra 13 e 56 con mediana 31, quindi un 96 usciva
    // "appena sopra la media" e il moltiplicatore restava a 1.1. Il rango
    // fra i disponibili separa molto meglio il fuoriclasse dal riempitivo.
    tetto(st, k, pid, S) {
      const D = db();
      const t = st.teams[k];
      const liberi = ROSTER_SIZE - t.roster.length;
      const max = S.maxBid(st, k);
      if (liberi <= 0 || max < 1) return 0;
      const v = valorePer(t.roster, pid);
      if (v <= 0) return Math.min(max, 1);

      const presi = new Set(S.attive(st).flatMap((x) => st.teams[x].roster));
      const restanti = D.players.filter((p) => !presi.has(p.id));
      const passo = Math.max(1, Math.ceil(restanti.length / 60));
      const valori = restanti.filter((_, i) => i % passo === 0)
        .map((p) => valorePer(t.roster, p.id)).sort((a, b) => a - b);
      const perc = valori.length ? valori.filter((x) => x < v).length / valori.length : 0.5;

      // Quanti lotti mi verranno ancora contesi: non piu di quanti slot
      // restano agli altri, e non piu dei miei. Oltre quelli si compra a 1.
      const slotAltrui = S.attive(st).filter((x) => x !== k)
        .reduce((a, x) => a + Math.max(0, ROSTER_SIZE - st.teams[x].roster.length), 0);
      const contesi = Math.max(1, Math.min(liberi, slotAltrui));
      const quota = max / contesi;

      // Il peso viene dal rango, non dal rapporto: i primi vanno pagati.
      let peso;
      if (perc >= 0.95) peso = 2.6;
      else if (perc >= 0.85) peso = 1.9;
      else if (perc >= 0.70) peso = 1.3;
      else if (perc >= 0.45) peso = 0.7;
      else peso = 0.25;

      let tetto = Math.round(quota * peso * AGGRESSIVITA);
      // Tenere crediti a fine asta non serve a niente: se nessuno me li
      // contende piu, tanto vale spenderli sull'ultimo che vale qualcosa.
      if (slotAltrui === 0) tetto = Math.min(max, 1);
      else if (liberi === 1) tetto = max;
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
