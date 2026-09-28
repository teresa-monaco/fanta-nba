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
export function installData(pJson, aJson) {
  const archetypes = aJson.archetypes;
  const positionSize = aJson.positionSize;
  const byId = {};
  const players = pJson.players.map((p) => {
    const full = { ...p, attrs: deriveAttrs(p, archetypes) };
    byId[p.id] = full;
    return full;
  });
  DB = { players, byId, archetypes, positionSize };
  return DB;
}

export async function loadData() {
  if (DB) return DB;
  const [pRes, aRes] = await Promise.all([
    fetch('./data/players.json'),
    fetch('./data/archetypes.json'),
  ]);
  if (!pRes.ok || !aRes.ok) throw new Error('Impossibile caricare i dati dei giocatori.');
  return installData(await pRes.json(), await aRes.json());
}

export function db() {
  if (!DB) throw new Error('Dati non ancora caricati.');
  return DB;
}

/* ---------- Attributi derivati ---------- */

const ATTR_KEYS = ['sco', 'tre', 'pla', 'reb', 'dif', 'dpe', 'atl', 'usg'];

// L'archetipo da la forma, l'overall da il livello, un jitter deterministico
// (stabile per giocatore+attributo) evita che due pari-overall dello stesso
// archetipo siano cloni perfetti.
export function deriveAttrs(p, archetypes) {
  const arc = archetypes[p.arc];
  if (!arc) throw new Error(`Archetipo sconosciuto: ${p.arc} (${p.n})`);
  const out = {};
  for (const k of ATTR_KEYS) {
    const jitter = (hashStr(p.id + ':' + k) % 1000) / 1000; // 0..1 stabile
    const nudge = (jitter - 0.5) * 6; // -3 .. +3
    out[k] = Math.round(clamp(p.ovr + arc.d[k] + nudge, 35, 99));
  }
  return out;
}

/* ---------- Costanti di gioco ---------- */

// Le chiavi sono POSIZIONI fisse (t1..t4), non nomi: reggono i colori in CSS
// (.t-t1 … .t-t4) e le partite già salvate. Per rinominare le squadre si
// cambia solo TEAM_NAMES, qui sotto, e non si tocca nient'altro.
export const TEAM_KEYS = ['t1', 't2', 't3', 't4'];
export const TEAM_NAMES = {
  t1: 'USZ',
  t2: 'FollowTheLeader',
  t3: 'Volta Reno',
  t4: 'R4cist',
};
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
