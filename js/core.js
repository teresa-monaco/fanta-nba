// core.js — caricamento dati, RNG deterministico, derivazione attributi.
// Tutto qui dentro e puro e riproducibile: stesso seed => stessa partita.

/* ---------- RNG deterministico (mulberry32) ---------- */

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let a = (typeof seed === 'string' ? hashStr(seed) : seed) >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Normale standard via Box-Muller, alimentata da un rng uniforme.
export function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ---------- Caricamento dati ---------- */

let DB = null;

// Separata dal fetch cosi la stessa pipeline e verificabile da Node,
// dove i file si leggono da disco (vedi tools/selftest.mjs).
export function installData(pJson, aJson, cJson) {
  const archetypes = aJson.archetypes;
  const positionSize = aJson.positionSize;
  const byId = {};
  const players = pJson.players.map((p) => {
    const full = { ...p, attrs: deriveAttrs(p, archetypes) };
    byId[p.id] = full;
    return full;
  });

  // Allenatori: si sbloccano dai giocatori comprati. L'indice squadra|epoca
  // -> allenatore e il modo in cui una rosa diventa una rosa di panchine.
  const coachArch = cJson?.archetipi || {};
  const coaches = cJson?.allenatori || [];
  const coachById = {};
  const coachBySlot = {};
  for (const c of coaches) {
    coachById[c.id] = c;
    for (const slot of c.tm || []) coachBySlot[slot] = c;
  }

  DB = { players, byId, archetypes, positionSize, coaches, coachById, coachBySlot, coachArch };
  return DB;
}

export async function loadData() {
  if (DB) return DB;
  const [pRes, aRes, cRes] = await Promise.all([
    fetch('./data/players.json'),
    fetch('./data/archetypes.json'),
    fetch('./data/coaches.json'),
  ]);
  if (!pRes.ok || !aRes.ok || !cRes.ok) throw new Error('Impossibile caricare i dati dei giocatori.');
  return installData(await pRes.json(), await aRes.json(), await cRes.json());
}

// Gli allenatori che una rosa sblocca: uno per giocatore, quello della sua
// squadra nella sua epoca. Due compagni di squadra portano lo stesso nome,
// quindi con cinque giocatori se ne sbloccano da uno a cinque.
export function allenatoriDi(roster) {
  const D = db();
  const out = [];
  const visti = new Set();
  for (const id of roster || []) {
    const p = D.byId[id];
    if (!p) continue;
    const c = D.coachBySlot[`${p.tm}|${p.era}`];
    if (!c || visti.has(c.id)) continue;
    visti.add(c.id);
    out.push({ ...c, ...D.coachArch[c.arc], da: p.n });
  }
  return out;
}

export function db() {
  if (!DB) throw new Error('Dati non ancora caricati.');
  return DB;
}

/* ---------- Attributi derivati ---------- */

const ATTR_KEYS = ['sco', 'tre', 'pla', 'reb', 'dif', 'dpe', 'atl', 'usg'];

// Come in 2K: l'ARCHETIPO dice che giocatore e (il profilo, 0-100 assoluto),
// l'OVERALL dice quanto e bravo (scala il profilo). Il modello additivo di
// prima — overall + scostamento — schiacciava un valore su quattro contro il
// tetto di 99 e non lasciava nessuno davvero scarso in niente.
//
// OVR_MIN..OVR_MAX mappano su SCALA_MIN..SCALA_MAX: un 85 tiene il 90% del
// suo profilo, un 100 lo supera dell'8%. Allargare la forbice rende i
// giocatori scarsi piu scarsi; alzarla tutta gonfia i numeri.
const OVR_MIN = 85, OVR_MAX = 100;
const SCALA_MIN = 0.90, SCALA_MAX = 1.08;

export function deriveAttrs(p, archetypes) {
  const arc = archetypes[p.arc];
  if (!arc) throw new Error(`Archetipo sconosciuto: ${p.arc} (${p.n})`);
  const livello = clamp((p.ovr - OVR_MIN) / (OVR_MAX - OVR_MIN), 0, 1);
  const scala = SCALA_MIN + (SCALA_MAX - SCALA_MIN) * livello;

  // "mod" e la via di fuga per i casi che l'archetipo non sa esprimere:
  // Kidd rimbalzava come un'ala pur essendo un playmaker puro, Penny molto
  // meno di quanto dica il suo archetipo. Senza questo, due giocatori dello
  // stesso archetipo differiscono solo per l'overall.
  const mod = p.mod || {};
  const out = {};
  for (const k of ATTR_KEYS) {
    // Scostamento stabile per giocatore+attributo: due pari-overall dello
    // stesso archetipo non devono essere cloni perfetti.
    const jitter = (hashStr(p.id + ':' + k) % 1000) / 1000;
    const nudge = (jitter - 0.5) * 6; // -3 .. +3
    out[k] = Math.round(clamp((arc.p[k] + (mod[k] || 0)) * scala + nudge, 20, 99));
  }
  return out;
}

/* ---------- Costanti di gioco ---------- */

// Le chiavi sono POSIZIONI fisse (t1…t12), non nomi: reggono i colori in CSS
// (.t-t1 … .t-t12), le sedie di chi gioca e le partite già salvate. I NOMI
// invece girano a ogni partita — per cambiarli si tocca solo la lista qui
// sotto, e nient'altro.
export const TEAM_KEYS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12'];

export const NOMI_SQUADRE = [
  'Pornland',
  'Volta Reno FC',
  "m johnson's son",
  'Dominic Toretto',
  'Leuvenia',
  'Sex Pred',
  'il dolph',
  'Sucio',
  'No lo silben',
  'Dimash',
];

// I nomi si estraggono dal SEED della partita, non si salvano nel database:
// ogni client rimescola con lo stesso seme e arriva alla stessa assegnazione.
// La sedia resta la stessa (t3 e sempre la stessa persona), cambia l'etichetta.
export const TEAM_NAMES = {};

export function applicaNomi(seed) {
  const estratti = shuffle(NOMI_SQUADRE, makeRng(String(seed) + ':nomi'));
  TEAM_KEYS.forEach((k, i) => {
    // I nomi sono dieci e le sedie dodici: nella partita a dodici le ultime
    // due riprendono un nome con il numero, invece di restare senza.
    TEAM_NAMES[k] = i < estratti.length ? estratti[i] : `${estratti[i % estratti.length]} II`;
  });
  return TEAM_NAMES;
}

// Un'assegnazione c'e sempre, anche prima che una partita esista: gli script
// e i test costruiscono squadre senza passare dalla lobby.
applicaNomi('fanta-nba');

// Quanti si puo essere. Sopra i quattro solo numeri pari: con 5, 7 o 9 il
// tabellone si riempie di teste di serie che saltano il primo turno (con 9
// sarebbero sette su nove) e smette di somigliare a un torneo.
export const NUMERI_SQUADRE = [2, 3, 4, 6, 8, 10, 12];
export const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'];
export const SLOT_LABEL = {
  PG: 'Playmaker',
  SG: 'Guardia',
  SF: 'Ala piccola',
  PF: 'Ala grande',
  C: 'Centro',
};
export const START_CREDITS = 50;
export const ROSTER_SIZE = 5;

export const STRATEGIES = {
  'palla-star': { label: 'Palla alla star', desc: 'Tutto passa dalla prima opzione: più isolamenti, più tiri, attacco più prevedibile.' },
  'pick-roll': { label: 'Pick and roll', desc: 'Playmaker e lungo insieme: crea mismatch, vive del talento della coppia.' },
  'post-up': { label: 'Post-up', desc: 'Si gioca spalle a canestro, si cercano i raddoppi e gli scarichi sui tiratori.' },
  'attacco-ferro': { label: 'Attacco al ferro', desc: 'Penetrazioni e falli subiti. Devasta chi non protegge il canestro.' },
  'tiro-3': { label: 'Tiro da 3', desc: 'Volume massimo da fuori. Alza il tetto e il pavimento: serate da 130 e serate da 88.' },
  'transizione': { label: 'Transizione', desc: 'Ritmo altissimo, si punisce chi è lento o troppo grosso.' },
  'motion': { label: 'Motion offense', desc: 'Palla che gira, tagli, nessuno monopolizza. Perdona i quintetti con troppe bocche da sfamare.' },
  'isolamento': { label: 'Isolamento', desc: 'Uno contro uno sistematico per i due violini. Efficace col talento, fragile contro difese fisiche.' },
  'dentro-fuori': { label: 'Gioco dentro-fuori', desc: 'Il lungo attira la difesa, i tiratori puniscono. Serve entrambe le cose.' },
  'handoff': { label: 'Handoff', desc: 'Consegne e blocchi continui per liberare i tiratori in movimento.' },
  'equilibrato': { label: 'Sistema equilibrato', desc: 'Nessun estremo: niente bonus grossi, nessuna debolezza sfruttabile.' },
};
