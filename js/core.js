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
// La forbice decide QUANTO CONTA L'OVERALL rispetto all'archetipo, ed e la
// manopola piu importante di tutto il gioco. Era 0.90-1.08, e con quella da
// 85 a 99 gli attributi salivano di 8 punti in media mentre fra due archetipi
// allo stesso overall la differenza arrivava a 50: l'archetipo contava sei
// volte l'overall, e un 92 batteva regolarmente un 99.
//
// Allargata a 0.76-1.16 gli intoccabili tornano in cima (9 degli 11 nomi
// grossi nei primi venti, il peggiore 24esimo invece che 72esimo) e le serie
// restano plausibili: sweep dal 16% al 20%, sorprese ferme al 24%.
// Allargarla ancora (0.66-1.22) porterebbe gli sweep al 26% e le sorprese al
// 17%, cioe un gioco piu prevedibile: non vale il guadagno.
// Verificabile con: node tools/balance.mjs e node tools/valutazioni.mjs
const OVR_MIN = 85, OVR_MAX = 100;
const SCALA_MIN = 0.76, SCALA_MAX = 1.16;

// Quanto l'overall conta sull'attributo-firma dell'archetipo, rispetto a
// quanto conta su tutto il resto. A 1 non cambia niente rispetto a prima; a
// 0 due giocatori dello stesso archetipo avrebbero la firma identica a
// qualunque overall. Un quarto lascia un vantaggio ai fuoriclasse senza
// renderli i migliori anche nel mestiere degli altri.
const FORZA_FIRMA = 0.25;

export function deriveAttrs(p, archetypes) {
  const arc = archetypes[p.arc];
  if (!arc) throw new Error(`Archetipo sconosciuto: ${p.arc} (${p.n})`);

  // SE IL GIOCATORE HA I SUOI NUMERI, SI USANO QUELLI.
  //
  // Per molto tempo nessun giocatore ne aveva: c'erano 22 modelli e 225
  // giocatori, e gli attributi si estrapolavano dal modello scalato
  // sull'overall. Funzionava, ma voleva dire che nessuno aveva mai scritto
  // il tiro da tre di Pau Gasol — usciva da una formula. Era il motivo per
  // cui certi valori non convincevano: non erano sbagliati, erano assenti.
  //
  // Un giocatore su tre aveva gia bisogno di una correzione a mano (65 su
  // 225, con trentatre scostamenti da venti punti o piu). Quando un terzo
  // dei casi e un'eccezione, il modello non descrive piu: va aggirato.
  //
  // La derivazione qui sotto resta, e serve a due cose: dare dei numeri di
  // partenza a un giocatore nuovo che non li ha ancora, e documentare da
  // dove vengono quelli congelati.
  if (p.attrs) {
    const out = {};
    for (const k of ATTR_KEYS) out[k] = Math.round(clamp(p.attrs[k] ?? 50, 20, 99));
    return out;
  }
  const livello = clamp((p.ovr - OVR_MIN) / (OVR_MAX - OVR_MIN), 0, 1);
  const scala = SCALA_MIN + (SCALA_MAX - SCALA_MIN) * livello;

  // "mod" e la via di fuga per i casi che l'archetipo non sa esprimere:
  // Kidd rimbalzava come un'ala pur essendo un playmaker puro, Penny molto
  // meno di quanto dica il suo archetipo. Senza questo, due giocatori dello
  // stesso archetipo differiscono solo per l'overall.
  // L'ATTRIBUTO-FIRMA QUASI NON SCALA.
  //
  // Finche l'overall moltiplicava tutto, uno specialista non poteva essere il
  // migliore nemmeno nella sua specialita. Misurato: Mutombo, quattro volte
  // difensore dell'anno, proteggeva il ferro diciotto punti sotto Shaq;
  // Rodman, sette titoli di rimbalzi, rimbalzava meno di otto giocatori. Nel
  // gioco "specialista" voleva dire solo "meno forte", e infatti fra il
  // miglior archetipo e il peggiore c'erano 17,5 punti di valore, con
  // three-and-d a meno di zero: metterlo in squadra la peggiorava.
  //
  // Ogni archetipo dichiara in `firma` l'attributo che lo definisce. Su
  // quello la forbice si stringe a un quarto: chi e bravo in generale resta
  // un po' avanti, ma a decidere chi stoppa di piu e il PROFILO, cioe che
  // giocatore sei, non quanto sei forte in tutto il resto.
  //
  // Non azzerata del tutto: un fuoriclasse resta un po' meglio anche nella
  // specialita altrui, e senza nessuna scala due sharpshooter di overall
  // diverso tirerebbero identici.
  const scalaFirma = 1 + (scala - 1) * FORZA_FIRMA;
  const firma = new Set(arc.firma || []);

  const mod = p.mod || {};
  const out = {};
  for (const k of ATTR_KEYS) {
    // Scostamento stabile per giocatore+attributo: due pari-overall dello
    // stesso archetipo non devono essere cloni perfetti.
    const jitter = (hashStr(p.id + ':' + k) % 1000) / 1000;
    const nudge = (jitter - 0.5) * 6; // -3 .. +3
    const s = firma.has(k) ? scalaFirma : scala;
    out[k] = Math.round(clamp((arc.p[k] + (mod[k] || 0)) * s + nudge, 20, 99));
  }
  return out;
}

/* ---------- Costanti di gioco ---------- */

// Le chiavi sono POSIZIONI fisse (t1…t12), non nomi: reggono i colori in CSS
// (.t-t1 … .t-t12), le sedie di chi gioca e le partite già salvate. I NOMI
// invece girano a ogni partita — per cambiarli si tocca solo la lista qui
// sotto, e nient'altro.
export const TEAM_KEYS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12'];

// Devono essere piu dei posti a sedere, e di parecchio: in lobby si cambia
// nome finche non piace, e con dodici nomi in dodici si resterebbe fermi sul
// primo. Ventidue lasciano da zappare anche col tavolo pieno.
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
  'Climberz',
  'Appennino',
  'Penetrazione Centrale',
  'Doppio Palleggio',
  'Sam Bowie Fan Club',
  'Darko Academy',
  'Estrema Unzione',
  'Reparto Cardiologia',
  'Qué Mirás Bobo',
  'Fallo Antisportivo',
  'Tony Montana',
  'Terzo Tempo',
];

// I nomi si estraggono dal SEED della partita, non si salvano nel database:
// ogni client rimescola con lo stesso seme e arriva alla stessa assegnazione.
// La sedia resta la stessa (t3 e sempre la stessa persona), cambia l'etichetta.
export const TEAM_NAMES = {};

// L'assegnazione di partenza, in indici invece che in stringhe: serve poter
// dire "il prossimo" senza cercare una stringa dentro un elenco.
export function indiciBase(seed) {
  const ordine = shuffle(NOMI_SQUADRE.map((_, i) => i), makeRng(String(seed) + ':nomi'));
  const out = {};
  TEAM_KEYS.forEach((k, i) => { out[k] = ordine[i % ordine.length]; });
  return out;
}

// `scelte` sono i cambi fatti in lobby, una mappa sedia -> indice. Quelli si
// salvano davvero nel database, ma sono numeri: una partita intera sta in una
// manciata di byte, come tutto il resto dello stato.
export function applicaNomi(seed, scelte) {
  const idx = { ...indiciBase(seed), ...(scelte || {}) };
  TEAM_KEYS.forEach((k) => {
    // Il ripiego resta come rete di sicurezza: se un giorno si toglie un nome
    // dalla lista, una sedia salvata con quell'indice resta battezzata invece
    // di finire "undefined".
    TEAM_NAMES[k] = NOMI_SQUADRE[idx[k]] ?? `Squadra ${k.slice(1)}`;
  });
  return TEAM_NAMES;
}

// Un altro nome, per chi sta zappando.
//
// SI PESCA, NON SI SCORRE. La prima versione prendeva il successivo in elenco,
// e non era una pescata: premendo si scendeva sempre nello stesso ordine, e
// due persone allo stesso tavolo che premono lo stesso numero di volte si
// ritrovavano lo stesso giro di nomi. Il tasto sembrava una freccia giu.
//
// Il caso vero qui e lecito perche il risultato si SALVA nello stato: non
// viene ricalcolato da nessun'altra parte, quindi non rompe la regola per cui
// la partita si rigioca identica dal seme. Le simulazioni restano sui seed.
//
// Si scartano solo i nomi delle sedie OCCUPATE, non di tutte e dodici: in due,
// escludere anche le dieci sedie vuote lascerebbe dodici nomi su ventidue e
// meta elenco non uscirebbe mai.
export function prossimoNome(seed, scelte, k, occupate, rnd) {
  const idx = { ...indiciBase(seed), ...(scelte || {}) };
  const presi = new Set((occupate || TEAM_KEYS).filter((x) => x !== k).map((x) => idx[x]));
  // Nemmeno quello che ho gia: se ricapitasse, il tasto sembrerebbe rotto.
  presi.add(idx[k]);
  const liberi = NOMI_SQUADRE.map((_, i) => i).filter((i) => !presi.has(i));
  if (!liberi.length) return idx[k];
  const r = typeof rnd === 'function' ? rnd() : Math.random();
  return liberi[Math.min(liberi.length - 1, Math.floor(r * liberi.length))];
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
