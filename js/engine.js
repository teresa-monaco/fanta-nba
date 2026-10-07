// engine.js — modello aggregato di simulazione.
//
// Come funziona, in breve:
//  1. buildTeam() riduce un quintetto a un profilo numerico (attacco, difesa,
//     spacing, rimbalzi, protezione del ferro, taglia...) e registra le
//     penalita di fit come "fattori" leggibili.
//  2. matchup() confronta due profili e applica i modificatori di strategia,
//     che dipendono da CHI hai davanti (il post-up vale meno contro un
//     protettore del ferro, la transizione vale di piu contro un quintetto grosso).
//  3. simGame() traduce la differenza in possessi e punti per possesso, aggiunge
//     la varianza (che la strategia puo alzare o abbassare) e distribuisce il
//     punteggio in un box score.
//
// Ogni numero che conta viene esportato come "fattore" con la sua grandezza:
// il narratore ci costruisce sopra la spiegazione, quindi il racconto non puo
// mai contraddire il risultato.

import { db, makeRng, gauss, clamp, SLOTS, TEAM_NAMES, STRATEGIES, allenatoriDi } from './core.js';

// Peso per rango di realizzazione. Piu i pesi sono piatti, piu conta il quinto
// uomo e meno paga comprare una sola superstar circondata da gregari.
// Verificabile con: node tools/audit-gioco.mjs, sezione 3.
const W_SCORING = [0.25, 0.22, 0.20, 0.17, 0.16];

/* ==========================================================
   1. PROFILO SQUADRA
   ========================================================== */

export function buildTeam(key, lineup, tactics) {
  const D = db();
  let five = SLOTS.map((slot) => {
    const p = D.byId[lineup[slot]];
    if (!p) throw new Error(`Quintetto incompleto per ${key}: manca ${slot}`);
    return { ...p, slot };
  });

  const a = (p) => p.attrs;
  const factors = [];

  // L'allenatore lavora sugli ATTRIBUTI, prima che se ne ricavi il profilo:
  // cosi il suo effetto si propaga da solo a tutto il resto (spacing, box
  // score, soglie), invece di essere un aggiustamento finale sul totale.
  const coach = applicaAllenatore(five, tactics, key, factors);
  five = coach.five;

  // --- aggregati grezzi ---
  const scoSorted = five.map(a).map((x) => x.sco).sort((x, y) => y - x);
  const teamScoring = scoSorted.reduce((s, v, i) => s + v * W_SCORING[i], 0);

  const treSorted = five.map(a).map((x) => x.tre).sort((x, y) => y - x);
  const spacing = (treSorted[0] * 0.32 + treSorted[1] * 0.28 + treSorted[2] * 0.22 + treSorted[3] * 0.18);
  const shooters = five.filter((p) => a(p).tre >= 75).length;

  const plaSorted = five.map(a).map((x) => x.pla).sort((x, y) => y - x);
  const playmaking = plaSorted[0] * 0.55 + plaSorted[1] * 0.30 + (plaSorted[2] + plaSorted[3] + plaSorted[4]) / 3 * 0.15;

  const rebounding = five.reduce((s, p) => s + a(p).reb, 0) / 5;
  const difSorted = five.map(a).map((x) => x.dif).sort((x, y) => y - x);
  const rimProtect = difSorted[0] * 0.60 + difSorted[1] * 0.40;

  const perimeterCrew = five.filter((p) => ['PG', 'SG', 'SF'].includes(p.slot));
  const perimD = perimeterCrew.reduce((s, p) => s + a(p).dpe, 0) / perimeterCrew.length;

  const athleticism = five.reduce((s, p) => s + a(p).atl, 0) / 5;
  const size = five.reduce((s, p) => s + D.positionSize[p.pos], 0); // sulla posizione NATURALE
  const usageTotal = five.reduce((s, p) => s + a(p).usg, 0);
  const avgSco = five.reduce((s, p) => s + a(p).sco, 0) / 5;
  const bigs = five.filter((p) => ['PF', 'C'].includes(p.slot));
  const bigScoring = Math.max(...bigs.map((p) => a(p).sco));
  const bigPlay = Math.max(...bigs.map((p) => a(p).pla));

  // --- base ---
  // Attacco e difesa devono avere centro e dispersione paragonabili, altrimenti
  // il lato piu "largo" decide le partite da solo. Con la scala degli attributi
  // attuale entrambi stanno attorno a 70-75 con una forbice di circa 20 punti.
  // Verificabile con: node tools/calibra.mjs
  let off = teamScoring * 0.62 + spacing * 0.20 + playmaking * 0.18;
  let def = 26 + perimD * 0.30 + rimProtect * 0.22 + rebounding * 0.10 + (size / 15) * 80 * 0.06;

  // --- penalita di fit (le stesse cose che guarderebbe un allenatore) ---

  const misfits = five.filter((p) => p.slot !== p.pos && !(p.alt || []).includes(p.slot));
  if (misfits.length) {
    const d = -2.6 * misfits.length;
    off += d; def += d;
    factors.push({ key: 'fuori-ruolo', side: key, delta: d * 2, label: 'Giocatori fuori ruolo',
      data: { names: misfits.map((p) => `${p.n} da ${p.slot}`) } });
  }

  if (shooters < 2) {
    const d = -(2 - shooters) * 5.0;
    off += d;
    factors.push({ key: 'no-spacing', side: key, delta: d, label: 'Spacing assente', data: { shooters } });
  } else if (shooters >= 4) {
    const d = 3.2;
    off += d;
    factors.push({ key: 'spacing-totale', side: key, delta: d, label: 'Spacing totale', data: { shooters } });
  }

  if (plaSorted[0] < 72) {
    const d = -(72 - plaSorted[0]) * 0.50;
    off += d;
    factors.push({ key: 'no-playmaker', side: key, delta: d, label: 'Nessun vero regista', data: { best: Math.round(plaSorted[0]) } });
  }

  const usageOver = usageTotal - 372;
  let usageClashDelta = 0;
  if (usageOver > 0) {
    usageClashDelta = -usageOver * 0.105;
    factors.push({ key: 'troppe-bocche', side: key, delta: usageClashDelta, label: 'Troppe bocche da sfamare',
      data: { over: Math.round(usageOver) } });
  }

  if (rimProtect < 58) {
    const d = -(58 - rimProtect) * 0.55;
    def += d;
    factors.push({ key: 'ferro-scoperto', side: key, delta: d, label: 'Ferro scoperto', data: { rim: Math.round(rimProtect) } });
  }

  // Il quinto uomo gioca gli stessi minuti della stella. Senza questo, il
  // modello premiava solo i picchi e comprare una superstar circondata da
  // gregari era sempre la mossa giusta: una risposta giusta uccide l'asta.
  const sottoMedia = five.reduce((s, p) => s + Math.max(0, 89 - p.ovr), 0);
  if (sottoMedia > 6) {
    const d = -(sottoMedia - 6) * 0.60;
    off += d * 0.55; def += d * 0.45;
    const peggiore = five.slice().sort((x, y) => x.ovr - y.ovr)[0];
    factors.push({ key: 'anello-debole', side: key, delta: d, label: 'Anello debole',
      data: { worst: peggiore.n, n: five.filter((p) => p.ovr < 89).length } });
  }

  if (size < 13) {
    const d = -(13 - size) * 2.4;
    def += d;
    factors.push({ key: 'quintetto-piccolo', side: key, delta: d, label: 'Quintetto sottodimensionato', data: { size } });
  }

  // Il primo violino dovrebbe essere il miglior realizzatore: se non lo e,
  // l'attacco sta dando la palla alla persona sbagliata.
  const topScorerId = five.slice().sort((x, y) => a(y).sco - a(x).sco)[0].id;
  if (tactics.v1 && tactics.v1 !== topScorerId) {
    const d = -2.2;
    off += d;
    factors.push({ key: 'violino-sbagliato', side: key, delta: d, label: 'Prima opzione non ottimale',
      data: { chosen: D.byId[tactics.v1]?.n, best: D.byId[topScorerId]?.n } });
  }

  const r = RITMI[tactics.ritmo] || RITMI.medio;

  return {
    key, name: TEAM_NAMES[key], five, tactics,
    off, def, usageClashDelta,
    spacing, shooters, playmaking, rebounding, rimProtect, perimD,
    athleticism, size, usageTotal, avgSco, teamScoring, bigScoring, bigPlay,
    // Ritmo: quanti possessi VUOLE e quanto e capace di imporlo. Il secondo
    // conta quanto il primo — correre senza rimbalzo difensivo e playmaking
    // vuol dire correre solo quando lo concede l'avversario.
    ritmo: tactics.ritmo || 'medio',
    possVoluti: r.poss + (coach.poss || 0),
    controllo: 1 + r.ctrl + (rebounding - 62) * 0.010 + (playmaking - 74) * 0.008,
    varCoach: coach.var || 0,
    coach: coach.info,
    factors,
    byId: (id) => five.find((p) => p.id === id),
  };
}

/* ==========================================================
   1b. RITMO E ALLENATORE
   ========================================================== */

// Il ritmo NON e uno scambio fra attacco e difesa: misurato su 6000 partite,
// togliere 3 all'attacco e darne 3 alla difesa lascia le vittorie al 51%
// esatte, cambia solo il punteggio finale. Quello che il ritmo sposta
// davvero e la VARIANZA: meno possessi, meno tempo per la squadra piu forte
// di dimostrare che lo e. Con 14 possessi in meno la sfavorita passa dal
// 24% al 27% (divario 20) e dal 32% al 34% (divario 8).
//
// Quindi qui c'e un numero solo, i possessi. Il vantaggio e lo svantaggio di
// correre nascono dalla ROSA (in matchup) e da CHI hai davanti, non da un
// bonus piatto uguale per tutti.
export const RITMI = {
  lento:    { label: 'Lento',      poss: -9,  ctrl: 0.15,  desc: 'Partita corta. Protegge chi e sfavorito e chi ha un quintetto squilibrato.' },
  medio:    { label: 'Medio',      poss: 0,   ctrl: 0,     desc: 'Nessuna scelta di campo: si gioca al ritmo che esce.' },
  veloce:   { label: 'Veloce',     poss: 7,   ctrl: 0,     desc: 'Piu possessi: premia atletismo e tiro, chiede gambe.' },
  'run-gun': { label: 'Run and gun', poss: 14, ctrl: -0.15, desc: 'Nessun freno. La squadra migliore vince piu spesso, la peggiore crolla.' },
};

// L'allenatore modifica gli attributi dei cinque PRIMA che se ne ricavi il
// profilo. E sempre un patto: da e toglie. Un bonus senza costo non sarebbe
// una scelta, sarebbe il calcolo di quale numero e piu grande.
function applicaAllenatore(five, tactics, key, factors) {
  const D = db();
  const c = D.coachById?.[tactics?.coach];
  if (!c) return { five, poss: 0, var: 0, info: null };
  const arc = D.coachArch?.[c.arc];
  if (!arc) return { five, poss: 0, var: 0, info: null };

  const e = arc.eff || {};
  const starId = tactics.v1 || five.slice().sort((x, y) => y.attrs.sco - x.attrs.sco)[0]?.id;

  const out = five.map((p) => {
    const delta = { ...(e.attr || {}) };
    const extra = p.id === starId ? (e.star || {}) : (e.altri || {});
    for (const [k, v] of Object.entries(extra)) delta[k] = (delta[k] || 0) + v;
    if (!Object.keys(delta).length) return p;
    const attrs = { ...p.attrs };
    for (const [k, v] of Object.entries(delta)) {
      if (attrs[k] === undefined) continue;
      attrs[k] = clamp(attrs[k] + v, 20, 99);
    }
    return { ...p, attrs };
  });

  factors.push({
    key: 'allenatore', side: key, delta: 0, label: `${c.n}: ${arc.label.toLowerCase()}`,
    data: { coach: c.n, arc: c.arc }, infoOnly: true,
  });

  return { five: out, poss: e.poss || 0, var: e.var || 0, info: { id: c.id, n: c.n, arc: c.arc, label: arc.label } };
}

/* ==========================================================
   2. STRATEGIE — modificatori che dipendono dall'avversario
   ========================================================== */

const STRAT = {
  'palla-star': { pace: 0, variance: 0.90, fx(t, o) {
    const f = [];
    const v1 = t.byId(t.tactics.v1) || t.five[0];
    const lift = (v1.attrs.sco - t.avgSco) * 0.22;
    f.push({ key: 'star-usage', delta: lift, label: `${v1.n} con la palla in mano`, data: { player: v1.n } });
    const pressure = -Math.max(0, o.perimD - 54) * 0.42;
    if (pressure < -0.6) f.push({ key: 'star-contenuta', delta: pressure, label: 'Attacco prevedibile contro una difesa perimetrale forte', data: { oppPerimD: Math.round(o.perimD) } });
    return f;
  }},
  'isolamento': { pace: -2, variance: 1.00, fx(t, o) {
    const f = [];
    const v1 = t.byId(t.tactics.v1) || t.five[0];
    const v2 = t.byId(t.tactics.v2) || t.five[1];
    f.push({ key: 'iso-talento', delta: ((v1.attrs.sco + v2.attrs.sco) / 2 - t.avgSco) * 0.22, label: 'Uno contro uno per i due violini', data: { player: v1.n } });
    f.push({ key: 'iso-ritmo', delta: -Math.max(0, o.perimD - 60) * 0.30, label: 'Ritmo bloccato dalla difesa individuale avversaria', data: {} });
    return f;
  }},
  'pick-roll': { pace: 2, variance: 0.98, fx(t, o) {
    const f = [];
    const quality = (Math.max(t.playmaking, 60) - 74) * 0.30 + (t.bigScoring - 78) * 0.22;
    f.push({ key: 'pnr-coppia', delta: quality, label: 'Qualita della coppia nel pick and roll', data: {} });
    const slow = Math.max(0, 67 - o.athleticism) * 0.20;
    if (slow > 0.5) f.push({ key: 'pnr-difesa-lenta', delta: slow, label: 'Difesa avversaria lenta nei cambi', data: {} });
    return f;
  }},
  'post-up': { pace: -3, variance: 0.92, fx(t, o) {
    const f = [];
    f.push({ key: 'post-peso', delta: (t.bigScoring - 80) * 0.40, label: 'Peso offensivo nel pitturato', data: {} });
    const wall = -Math.max(0, o.rimProtect - 72) * 0.42;
    if (wall < -0.6) f.push({ key: 'post-muro', delta: wall, label: 'Il ferro avversario e protetto', data: { oppRim: Math.round(o.rimProtect) } });
    f.push({ key: 'post-scarichi', delta: (t.shooters - 2) * 1.8, label: 'Scarichi sui tiratori dopo il raddoppio', data: { shooters: t.shooters } });
    return f;
  }},
  'attacco-ferro': { pace: 3, variance: 1.02, fx(t, o) {
    const f = [];
    f.push({ key: 'ferro-atletismo', delta: (t.athleticism - 67) * 0.24, label: 'Pressione atletica sul canestro', data: {} });
    f.push({ key: 'ferro-muro', delta: -Math.max(0, o.rimProtect - 72) * 0.36, label: 'Protezione del ferro avversaria', data: { oppRim: Math.round(o.rimProtect) } });
    return f;
  }},
  'tiro-3': { pace: 4, variance: 1.34, fx(t, o) {
    const f = [];
    f.push({ key: 'tre-volume', delta: 2.6 + (t.spacing - 72) * 0.34, label: 'Volume e qualita dal perimetro', data: { spacing: Math.round(t.spacing) } });
    f.push({ key: 'tre-varianza', delta: 0, label: 'Serata al tiro', data: {}, varianceOnly: true });
    return f;
  }},
  'transizione': { pace: 7, variance: 1.12, fx(t, o) {
    const f = [];
    f.push({ key: 'tr-atletismo', delta: (t.athleticism - 67) * 0.26, label: 'Gambe e campo aperto', data: {} });
    const heavy = Math.max(0, o.size - 15) * 1.4;
    if (heavy > 0.5) f.push({ key: 'tr-pesantezza', delta: heavy, label: 'Quintetto avversario troppo pesante per correre', data: { oppSize: o.size } });
    return f;
  }},
  'motion': { pace: 1, variance: 0.94, fx(t, o) {
    const f = [];
    // Il motion e l'unica strategia che RIPARA il caos da troppe stelle.
    if (t.usageClashDelta < 0) {
      const heal = -t.usageClashDelta * 0.72;
      f.push({ key: 'motion-armonia', delta: heal, label: 'Il movimento di palla disinnesca il conflitto di usage', data: {} });
    }
    f.push({ key: 'motion-lettura', delta: (t.playmaking - 74) * 0.24, label: 'Letture collettive e gioco senza palla', data: {} });
    const solo = t.five.filter((p) => p.attrs.pla >= 72).length;
    if (solo <= 1) f.push({ key: 'motion-un-creatore', delta: -3.4, label: 'Un solo creatore: il motion gira a vuoto', data: {} });
    return f;
  }},
  'dentro-fuori': { pace: 0, variance: 1.04, fx(t, o) {
    const f = [];
    f.push({ key: 'df-lungo', delta: 1.4 + (t.bigScoring - 78) * 0.26, label: 'Il lungo attira la difesa', data: {} });
    f.push({ key: 'df-tiro', delta: (t.spacing - 76) * 0.20, label: 'Tiratori pronti sugli scarichi', data: {} });
    if (t.shooters < 2 || t.bigScoring < 80) f.push({ key: 'df-incompleto', delta: -3.0, label: 'Manca meta del meccanismo dentro-fuori', data: {} });
    return f;
  }},
  'handoff': { pace: 2, variance: 1.00, fx(t, o) {
    const f = [];
    f.push({ key: 'ho-tiro', delta: 1.4 + (t.spacing - 74) * 0.20, label: 'Tiratori liberati in movimento', data: {} });
    f.push({ key: 'ho-lettura', delta: (t.playmaking - 74) * 0.16 + (t.bigPlay - 66) * 0.12, label: 'Consegne e letture dei lunghi', data: {} });
    return f;
  }},
  'equilibrato': { pace: 0, variance: 1.00, fx() {
    return [{ key: 'eq-solido', delta: 1.6, label: 'Nessuna debolezza sfruttabile', data: {} }];
  }},
};

export function matchup(A, B) {
  const sA = STRAT[A.tactics.strategy] || STRAT['equilibrato'];
  const sB = STRAT[B.tactics.strategy] || STRAT['equilibrato'];

  const fxA = sA.fx(A, B).map((f) => ({ ...f, side: A.key }));
  const fxB = sB.fx(B, A).map((f) => ({ ...f, side: B.key }));

  const offA = A.off + fxA.reduce((s, f) => s + (f.varianceOnly ? 0 : f.delta), 0);
  const offB = B.off + fxB.reduce((s, f) => s + (f.varianceOnly ? 0 : f.delta), 0);

  // Vantaggi strutturali indipendenti dalla strategia.
  const structural = [];
  const rebDiff = A.rebounding - B.rebounding;
  if (Math.abs(rebDiff) > 4) {
    structural.push({ key: 'rimbalzi', side: rebDiff > 0 ? A.key : B.key,
      delta: Math.abs(rebDiff) * 0.16, label: 'Dominio a rimbalzo', data: { diff: Math.round(Math.abs(rebDiff)) } });
  }
  const sizeDiff = A.size - B.size;
  if (Math.abs(sizeDiff) >= 3) {
    structural.push({ key: 'taglia', side: sizeDiff > 0 ? A.key : B.key,
      delta: Math.abs(sizeDiff) * 0.55, label: 'Vantaggio di stazza', data: { diff: Math.abs(sizeDiff) } });
  }
  const spcDiff = A.spacing - B.spacing;
  if (Math.abs(spcDiff) > 5) {
    structural.push({ key: 'spacing-diff', side: spcDiff > 0 ? A.key : B.key,
      delta: Math.abs(spcDiff) * 0.13, label: 'Campo piu aperto', data: { diff: Math.round(Math.abs(spcDiff)) } });
  }
  const pdDiff = A.perimD - B.perimD;
  if (Math.abs(pdDiff) > 5) {
    structural.push({ key: 'difesa-perimetro', side: pdDiff > 0 ? A.key : B.key,
      delta: Math.abs(pdDiff) * 0.14, label: 'Difesa perimetrale superiore', data: { diff: Math.round(Math.abs(pdDiff)) } });
  }

  // --- ritmo: uno scontro, non una scelta solitaria ---
  // I possessi sono per definizione gli stessi per entrambe: il ritmo reale e
  // la media delle due volonta, PESATA da chi lo controlla. Non puoi correre
  // se l'altro rimbalza e risale a passo d'uomo.
  const cA = Math.max(0.35, A.controllo ?? 1), cB = Math.max(0.35, B.controllo ?? 1);
  const voluto = ((A.possVoluti ?? 0) * cA + (B.possVoluti ?? 0) * cB) / (cA + cB);
  const pace = 95 + (sA.pace + sB.pace) / 2 + voluto;

  // Chi ha imposto il suo ritmo e chi lo sta subendo: e un fattore vero, e il
  // narratore ci puo costruire sopra una frase che non inventa niente.
  const scartoRitmo = (A.possVoluti ?? 0) - (B.possVoluti ?? 0);
  if (Math.abs(scartoRitmo) >= 7) {
    const vince = (scartoRitmo > 0) === (voluto > ((A.possVoluti + B.possVoluti) / 2)) ? A : B;
    const subisce = vince === A ? B : A;
    structural.push({ key: 'ritmo-imposto', side: vince.key, delta: 0, infoOnly: true,
      label: `Ritmo imposto da ${vince.name}`,
      data: { vince: vince.name, subisce: subisce.name, poss: Math.round(pace) } });
  }

  // --- il ritmo premia o punisce la ROSA, non tutti allo stesso modo ---
  // Qui nasce il "+" e il "-" che nel modello piatto non esisteva: correre
  // con cinque lunghi lenti e un suicidio, rallentare senza un dominatore
  // uno contro uno anche. Stanno a parte dalle strutturali perche quelle
  // descrivono differenze gia dentro off/def, queste invece PESANO.
  const ritmoFx = [];
  for (const T of [A, B]) {
    const o = T === A ? B : A;
    const p = T.possVoluti ?? 0;
    if (p >= 6) {
      // Correre: servono gambe e tiratori, la stazza e un peso morto.
      const d = (T.athleticism - 67) * 0.24 + (T.shooters - 2) * 1.9 - Math.max(0, T.size - 15) * 1.4;
      ritmoFx.push({ key: 'ritmo-corsa', side: T.key, delta: d,
        label: d >= 0 ? 'Il quintetto regge il ritmo alto' : 'Quintetto sbagliato per correre',
        data: { atl: Math.round(T.athleticism), size: T.size } });
    } else if (p <= -6) {
      // Rallentare: serve qualcuno che se la crei da solo a meta campo.
      const iso = Math.max(...T.five.map((x) => x.attrs.sco));
      const d = (iso - 86) * 0.22 + (T.rimProtect - 70) * 0.10 - Math.max(0, 3 - T.shooters) * 1.2;
      ritmoFx.push({ key: 'ritmo-lento', side: T.key, delta: d,
        label: d >= 0 ? 'Attacco da meta campo affidabile' : 'A ritmo basso l\'attacco si inceppa',
        data: { iso: Math.round(iso) } });
      // La parte difensiva vale solo contro chi la transizione la cerca:
      // rallentare contro un post-up gli fa un favore, non un dispetto.
      if (['transizione', 'attacco-ferro'].includes(o.tactics.strategy)) {
        ritmoFx.push({ key: 'ritmo-freno', side: T.key, delta: 2.4,
          label: `Ritmo basso: a ${o.name} tolgono il campo aperto`, data: { opp: o.name } });
      }
    }
  }
  const sommaRitmo = (k) => ritmoFx.filter((f) => f.side === k).reduce((s, f) => s + f.delta, 0);

  // L'allenatore puo rendere la squadra piu solida o piu imprevedibile.
  const varA = Math.max(0.6, sA.variance * (1 + (A.varCoach || 0)));
  const varB = Math.max(0.6, sB.variance * (1 + (B.varCoach || 0)));

  return {
    offA: offA + sommaRitmo(A.key), offB: offB + sommaRitmo(B.key),
    defA: A.def, defB: B.def, pace,
    varA, varB,
    factors: [...A.factors, ...B.factors, ...fxA, ...fxB, ...ritmoFx, ...structural],
  };
}

/* ==========================================================
   3. SIMULAZIONE PARTITA
   ========================================================== */

// Taratura: con questi due numeri una sfida fra squadre di pari valore da
// circa il 62% alla favorita per singola gara — il che produce una
// distribuzione di serie vicina a quella dei playoff veri. Alzare il
// coefficiente rende il gioco piu prevedibile, alzare la sigma piu casuale.
// Verificabile con: node tools/balance.mjs
export const RATING_WEIGHT = 0.0030;
const GAME_SIGMA = 8.5;

export function simGame(A, B, m, rng, opts = {}) {
  const homeIsA = !!opts.homeIsA;
  const poss = Math.round(m.pace + clamp(gauss(rng), -2, 2) * 2.4);

  // Le due costanti di taratura stanno fuori (vedi sopra simGame): servono
  // anche al referto, che deve tradurre un divario di rating in punti veri.

  // La normale pura ha code infinite: senza un taglio esce ogni tanto una gara
  // da 65 punti, che per dei quintetti di All-Star non e verosimile.
  const bump = () => clamp(gauss(rng), -1.9, 1.9);
  // Il pavimento a 1.00 punti per possesso: sotto, un quintetto di All-Star
  // non ci va nemmeno nella peggiore delle serate.
  const ppp = (off, def, home) => clamp(1.105 + (off - def) * RATING_WEIGHT + (home ? 0.017 : -0.017), 1.02, 1.33);

  const pppA = ppp(m.offA, m.defB, homeIsA);
  const pppB = ppp(m.offB, m.defA, !homeIsA);

  let sa = poss * pppA + bump() * GAME_SIGMA * m.varA;
  let sb = poss * pppB + bump() * GAME_SIGMA * m.varB;
  let scoreA = Math.round(sa);
  let scoreB = Math.round(sb);

  let ot = 0;
  while (scoreA === scoreB) {
    ot++;
    scoreA += Math.round(10 + gauss(rng) * 3);
    scoreB += Math.round(10 + gauss(rng) * 3);
  }

  const boxA = boxScore(A, scoreA, rng);
  const boxB = boxScore(B, scoreB, rng);
  const aWon = scoreA > scoreB;

  const all = [
    ...boxA.map((l) => ({ ...l, team: A.key, won: aWon })),
    ...boxB.map((l) => ({ ...l, team: B.key, won: !aWon })),
  ];
  all.forEach((l) => { l.gs = l.pts + l.reb * 1.15 + l.ast * 1.45 + (l.won ? 6 : 0); });
  const mvp = all.slice().sort((x, y) => y.gs - x.gs)[0];

  return { scoreA, scoreB, boxA, boxB, mvp, ot, poss, margin: Math.abs(scoreA - scoreB) };
}

// Quanto oscilla la serata di un giocatore (vedi boxScore). Verificabile con
// la misura in audit-gioco: oscillazione del primo marcatore intorno al 20%,
// e il favorito al premio di miglior marcatore di una serie intorno al 70%.
export const SERATA_SIGMA = 0.25;

// Ripartisce il punteggio di squadra fra i cinque secondo usage e strategia.
function boxScore(T, teamPts, rng) {
  // Gli esponenti sotto 1 COMPRIMONO le differenze. Servono perche gli
  // attributi ora spaziano da 20 a 99: usati grezzi, un usage 99 accanto a
  // quattro usage 20 si prendeva il 55% dei punti di squadra (uscivano gare
  // da 67 punti individuali). Alzarli concentra di piu su una stella sola.
  const mult = usageMultipliers(T);
  // LA SERATA DI OGNUNO. La quota di punti di un giocatore oscillava di un
  // 12% al massimo: chi faceva 30 di media ne faceva fra 27 e 33, sempre. Il
  // miglior marcatore di una serie era scritto prima di cominciare (il
  // favorito lo vinceva nel 94% delle serie simulate, dal terzo in giu mai),
  // e i box score erano piatti. Nella NBA vera uno da 30 oscilla di 7-8
  // punti da una sera all'altra: ha le serate da 45 e quelle da 18.
  //
  // Adesso la quota oscilla in modo proporzionale (log-normale), tagliata a
  // 1,8 deviazioni perche una serata da 70 non e verosimile. Tocca SOLO come
  // si dividono i punti dentro la squadra: il punteggio di squadra e gia
  // deciso, e ogni gara ha il suo generatore, quindi nessun risultato cambia.
  const raw = T.five.map((p, i) => Math.max(3, Math.pow(p.attrs.usg, 0.75) * mult[i]
    * Math.exp(SERATA_SIGMA * clamp(gauss(rng), -1.8, 1.8))));
  const tot = raw.reduce((s, v) => s + v, 0);

  let lines = T.five.map((p, i) => ({
    id: p.id, n: p.n, slot: p.slot,
    pts: Math.max(2, Math.round(teamPts * (raw[i] / tot))),
    reb: 0, ast: 0,
  }));

  // Riallinea la somma al punteggio esatto.
  let diff = teamPts - lines.reduce((s, l) => s + l.pts, 0);
  let guard = 0;
  while (diff !== 0 && guard++ < 60) {
    const idx = Math.floor(rng() * 5);
    if (diff > 0) { lines[idx].pts++; diff--; }
    else if (lines[idx].pts > 2) { lines[idx].pts--; diff++; }
  }

  const teamReb = Math.round(42 + gauss(rng) * 3.4);
  const rebW = T.five.map((p) => Math.pow(p.attrs.reb / 50, 1.5));
  const rebTot = rebW.reduce((s, v) => s + v, 0);

  const teamAst = Math.round(26 + gauss(rng) * 3.4);
  const astW = T.five.map((p) => Math.pow(p.attrs.pla / 50, 1.8));
  const astTot = astW.reduce((s, v) => s + v, 0);

  lines.forEach((l, i) => {
    l.reb = Math.max(0, Math.round(teamReb * (rebW[i] / rebTot) * (0.8 + rng() * 0.4)));
    l.ast = Math.max(0, Math.round(teamAst * (astW[i] / astTot) * (0.75 + rng() * 0.5)));
  });

  return lines;
}

function usageMultipliers(T) {
  const s = T.tactics.strategy;
  const v1 = T.tactics.v1, v2 = T.tactics.v2;
  return T.five.map((p) => {
    let m = 1;
    if (p.id === v1) m *= 1.22;
    if (p.id === v2) m *= 1.10;
    switch (s) {
      case 'palla-star':
        m *= p.id === v1 ? 1.34 : (p.id === v2 ? 1.08 : 0.76); break;
      case 'isolamento':
        m *= (p.id === v1 || p.id === v2) ? 1.22 : 0.82; break;
      case 'post-up':
        if (p.slot === 'C') m *= 1.36; if (p.slot === 'PG') m *= 0.90; break;
      case 'pick-roll':
        if (p.slot === 'PG') m *= 1.20; if (p.slot === 'C') m *= 1.18; break;
      case 'tiro-3':
        m *= p.attrs.tre >= 78 ? 1.26 : 0.80; break;
      case 'transizione':
        m *= p.attrs.atl >= 82 ? 1.20 : 0.90; break;
      case 'motion':
        m = 1 + (m - 1) * 0.35; m *= 0.96 + (p.attrs.pla / 500); break;
      case 'attacco-ferro':
        m *= p.attrs.atl >= 80 ? 1.16 : 0.92; break;
      case 'dentro-fuori':
        if (p.slot === 'C' || p.attrs.tre >= 78) m *= 1.14; break;
      case 'handoff':
        if (p.attrs.tre >= 76) m *= 1.14; break;
      default: break;
    }
    return m;
  });
}

/* ==========================================================
   4. SERIE
   ========================================================== */

const HOME_PATTERN = [true, true, false, false, true, false, true]; // 2-2-1-1-1 per la testa di serie

export function simSeries(A, B, seed) {
  const rng = makeRng(seed);
  const m = matchup(A, B);
  // Testa di serie: chi ha il profilo complessivo migliore gioca in casa gara 1.
  const powerA = A.off + A.def, powerB = B.off + B.def;
  const aIsHost = powerA >= powerB;

  const games = [];
  let wa = 0, wb = 0;
  const tally = {};

  while (wa < 4 && wb < 4) {
    const i = games.length;
    const homeIsA = aIsHost ? HOME_PATTERN[i] : !HOME_PATTERN[i];
    const g = simGame(A, B, m, rng, { homeIsA });
    if (g.scoreA > g.scoreB) wa++; else wb++;
    g.n = i + 1;
    g.seriesAfter = { a: wa, b: wb };
    games.push(g);
    [...g.boxA.map((l) => ({ ...l, team: A.key })), ...g.boxB.map((l) => ({ ...l, team: B.key }))]
      .forEach((l) => {
        const t = (tally[l.id] ||= { id: l.id, n: l.n, team: l.team, pts: 0, reb: 0, ast: 0, g: 0 });
        t.pts += l.pts; t.reb += l.reb; t.ast += l.ast; t.g++;
      });
  }

  const winner = wa === 4 ? A.key : B.key;
  const mvp = Object.values(tally)
    .filter((t) => t.team === winner)
    .map((t) => ({ ...t, ppg: t.pts / t.g, rpg: t.reb / t.g, apg: t.ast / t.g,
      score: t.pts / t.g + (t.reb / t.g) * 1.15 + (t.ast / t.g) * 1.45 }))
    .sort((x, y) => y.score - x.score)[0];

  return { a: A.key, b: B.key, wins: { a: wa, b: wb }, games, winner, mvp, matchup: m, aIsHost, done: true };
}

// Per le Finals: ricostruisce la serie fino alla gara n. Poiche tutto e
// deterministico, ogni client che chiama questa funzione con lo stesso seed
// ottiene le stesse identiche partite — non serve trasmettere i risultati.
export function simSeriesUpTo(A, B, seed, n) {
  const m = matchup(A, B);
  let s = {
    a: A.key, b: B.key, seed, wins: { a: 0, b: 0 }, games: [],
    done: false, winner: null, mvp: null,
    aIsHost: A.off + A.def >= B.off + B.def,
    matchup: m, _m: m,
  };
  for (let i = 0; i < n && !s.done; i++) s = playNextGame(A, B, s);
  return s;
}

// Per le Finals: una gara alla volta, stato serializzabile fra un "Vai" e l'altro.
export function playNextGame(A, B, series) {
  const m = series._m || matchup(A, B);
  const rng = makeRng(series.seed + ':' + series.games.length);
  const powerA = A.off + A.def, powerB = B.off + B.def;
  const aIsHost = series.aIsHost ?? (powerA >= powerB);
  const homeIsA = aIsHost ? HOME_PATTERN[series.games.length] : !HOME_PATTERN[series.games.length];

  const g = simGame(A, B, m, rng, { homeIsA });
  g.n = series.games.length + 1;
  const wins = { ...series.wins };
  if (g.scoreA > g.scoreB) wins.a++; else wins.b++;
  g.seriesAfter = wins;

  const games = [...series.games, g];
  const done = wins.a === 4 || wins.b === 4;
  const winner = done ? (wins.a === 4 ? A.key : B.key) : null;

  let mvp = null;
  if (done) {
    const tally = {};
    games.forEach((gg) => {
      [...gg.boxA.map((l) => ({ ...l, team: A.key })), ...gg.boxB.map((l) => ({ ...l, team: B.key }))]
        .forEach((l) => {
          const t = (tally[l.id] ||= { id: l.id, n: l.n, team: l.team, pts: 0, reb: 0, ast: 0, g: 0 });
          t.pts += l.pts; t.reb += l.reb; t.ast += l.ast; t.g++;
        });
    });
    mvp = Object.values(tally).filter((t) => t.team === winner)
      .map((t) => ({ ...t, ppg: t.pts / t.g, rpg: t.reb / t.g, apg: t.ast / t.g,
        score: t.pts / t.g + (t.reb / t.g) * 1.15 + (t.ast / t.g) * 1.45 }))
      .sort((x, y) => y.score - x.score)[0];
  }

  return { ...series, games, wins, done, winner, mvp, aIsHost, matchup: m };
}

/* ==========================================================
   5. ACCOPPIAMENTI — il matchup piu interessante
   ========================================================== */

const AXES = [
  { key: 'pace', label: 'ritmo', get: (t) => (STRAT[t.tactics.strategy] || STRAT['equilibrato']).pace * 6 + 50 },
  { key: 'size', label: 'stazza', get: (t) => t.size * 5 },
  { key: 'spacing', label: 'spacing', get: (t) => t.spacing },
  { key: 'star', label: 'dipendenza dalla star', get: (t) => {
      const sc = t.five.map((p) => p.attrs.sco).sort((a, b) => b - a);
      return 50 + (sc[0] - (sc[1] + sc[2] + sc[3] + sc[4]) / 4) * 1.6;
    } },
  { key: 'defense', label: 'impianto difensivo', get: (t) => t.def },
];

function contrast(t1, t2) {
  let sum = 0;
  const per = {};
  for (const ax of AXES) {
    const d = Math.abs(ax.get(t1) - ax.get(t2));
    per[ax.key] = d;
    sum += d * d;
  }
  return { total: Math.sqrt(sum), per };
}

const potenza = (t) => t.off + t.def;

/* ==========================================================
   4b. IL REFERTO — le scelte tattiche hanno pagato?
   ==========================================================

   Senza questo, nessuna delle scelte si impara: si tirano a caso per sempre.
   Ogni voce e un numero che il motore ha davvero usato, riportato in PUNTI A
   PARTITA, che e l'unica unita che si capisce al volo. Confronta la scelta
   fatta con la media di tutte le alternative, e dice quale sarebbe stata la
   migliore CONTRO QUESTO AVVERSARIO: contro un altro la risposta cambia. */

// Sotto questa soglia, in punti a partita, una differenza non e un consiglio.
const SOGLIA_REFERTO = 0.25;

export function refertoTattico(T, O) {
  const lineup = Object.fromEntries(T.five.map((p) => [p.slot, p.id]));
  const roster = T.five.map((p) => p.id);

  // Punti a partita che questo attacco produce contro questa difesa.
  const punti = (tactics) => {
    const t = buildTeam(T.key, lineup, tactics);
    const m = matchup(t, O);
    return (m.offA - m.defB) * RATING_WEIGHT * m.pace;
  };

  const base = punti(T.tactics);
  const voci = [];

  const dimensione = (campo, valori, etichetta, nomeDi) => {
    if (valori.length < 2) return;
    const alt = valori.map((v) => ({ v, p: v === T.tactics[campo] ? base : punti({ ...T.tactics, [campo]: v }) }));
    const media = alt.reduce((s, x) => s + x.p, 0) / alt.length;
    const best = alt.reduce((a, b) => (b.p > a.p ? b : a));
    const quantoMeglio = best.p - base;
    // Sotto un quarto di punto a partita non e un consiglio, e rumore
    // arrotondato: suggerire "meglio Drummond (+0.0)" al posto di Doncic
    // farebbe sembrare rotto il referto, e avrebbe ragione.
    const ininfluente = quantoMeglio < SOGLIA_REFERTO
      && Math.max(...alt.map((x) => x.p)) - Math.min(...alt.map((x) => x.p)) < SOGLIA_REFERTO * 2;
    voci.push({
      campo, etichetta,
      scelto: nomeDi(T.tactics[campo]),
      // Rispetto a scegliere a caso: e la domanda vera, "e servito decidere?"
      valore: base - media,
      migliore: nomeDi(best.v),
      quantoMeglio,
      eraGiusta: quantoMeglio < SOGLIA_REFERTO,
      ininfluente,
    });
  };

  dimensione('strategy', Object.keys(STRAT), 'Strategia', (v) => STRATEGIES[v]?.label || v);
  dimensione('ritmo', Object.keys(RITMI), 'Ritmo', (v) => RITMI[v]?.label || v);
  const coachDisponibili = allenatoriDi(roster).map((c) => c.id);
  dimensione('coach', coachDisponibili, 'Allenatore', (v) => db().coachById?.[v]?.n || '—');

  // Il primo violino: l'unica delle cinque scelte che finora non si misurava.
  dimensione('v1', roster.filter((id) => id !== T.tactics.v2), 'Primo violino',
    (v) => db().byId[v]?.n || '—');

  return { squadra: T.name, key: T.key, base, voci };
}

/* ==========================================================
   5a-bis. STAGIONE REGOLARE — girone all'italiana
   ==========================================================

   Alternativa alle teste di serie sorteggiate. Tutti contro tutti a gara
   secca, poi le prime 2^k entrano nel tabellone e partono tutte dallo stesso
   turno: il vantaggio di saltare un turno sparisce perche non lo salta piu
   nessuno. Misurato: valeva +12.5 punti di titoli in tre squadre, +8.3 in sei.

   Costa meno di quanto sembri. Le gare di stagione sono righe di una tabella,
   simulate in blocco; le serie sono quelle che si scoprono due gare alla
   volta. Il girone TOGLIE serie: in dodici si passa da 11 a 7. */

// Quanti giri. Sotto una decina di partite a testa la classifica e rumore:
// con tre squadre e un giro solo la piu forte resta fuori dal tabellone una
// volta su cinque, con dieci partite a testa una volta su nove. Sopra la
// decina il guadagno si ferma, quindi non si paga di piu.
export function giriStagione(n) {
  return Math.max(1, Math.round(10 / (n - 1)));
}

export function potenzaSotto(n) {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

// Il calendario e deterministico come tutto il resto: sul database finisce il
// seed, non i risultati.
export function calendario(keys, giri) {
  const out = [];
  for (let g = 0; g < giri; g++) {
    for (let a = 0; a < keys.length; a++) {
      for (let b = a + 1; b < keys.length; b++) {
        // Andata in casa di A, ritorno in casa di B. Con un giro solo si
        // alterna: il fattore campo non puo essere un regalo a meta girone.
        const homeIsA = giri > 1 ? g % 2 === 0 : (a + b) % 2 === 0;
        out.push({ g, a: keys[a], b: keys[b], homeIsA, seed: `${g}:${keys[a]}-${keys[b]}` });
      }
    }
  }
  return out;
}

export function simStagione(T, keys, seedBase, giri) {
  const cal = calendario(keys, giri);
  const righe = {};
  for (const k of keys) righe[k] = { k, w: 0, l: 0, pf: 0, ps: 0, h2h: {} };
  const gare = [];

  for (const m of cal) {
    const A = T[m.a], B = T[m.b];
    const g = simGame(A, B, matchup(A, B), makeRng(`${seedBase}:rs${m.seed}`), { homeIsA: m.homeIsA });
    const ra = righe[m.a], rb = righe[m.b];
    const vinceA = g.scoreA > g.scoreB;
    ra.pf += g.scoreA; ra.ps += g.scoreB;
    rb.pf += g.scoreB; rb.ps += g.scoreA;
    (vinceA ? ra : rb).w++;
    (vinceA ? rb : ra).l++;
    ra.h2h[m.b] = (ra.h2h[m.b] || 0) + (vinceA ? 1 : 0);
    rb.h2h[m.a] = (rb.h2h[m.a] || 0) + (vinceA ? 0 : 1);
    gare.push({
      giro: m.g, a: m.a, b: m.b, sa: g.scoreA, sb: g.scoreB,
      vince: vinceA ? m.a : m.b, margin: g.margin, ot: g.ot, mvp: g.mvp,
    });
  }

  for (const k of keys) righe[k].diff = righe[k].pf - righe[k].ps;

  // Criteri di parita, nell'ordine: vittorie, poi record fra le sole squadre
  // appaiate (una mini-classifica, cosi il confronto resta transitivo e
  // l'ordinamento e sempre lo stesso), poi differenza canestri, poi la chiave.
  // Un comparatore non transitivo darebbe classifiche diverse a seconda
  // dell'ordine di partenza: su uno stato condiviso sarebbe un disastro.
  const cls = [];
  const perVittorie = new Map();
  for (const k of keys) {
    const w = righe[k].w;
    if (!perVittorie.has(w)) perVittorie.set(w, []);
    perVittorie.get(w).push(righe[k]);
  }
  for (const w of [...perVittorie.keys()].sort((x, y) => y - x)) {
    const gruppo = perVittorie.get(w);
    for (const r of gruppo) {
      r.miniW = gruppo.reduce((acc, o) => acc + (o.k === r.k ? 0 : (r.h2h[o.k] || 0)), 0);
    }
    gruppo.sort((x, y) => (y.miniW - x.miniW) || (y.diff - x.diff) || (x.k < y.k ? -1 : 1));
    // Con chi e' stato deciso il posto: serve a spiegarlo in tabella.
    for (const r of gruppo) r.appaiata = gruppo.length > 1;
    cls.push(...gruppo);
  }
  cls.forEach((r, i) => { r.pos = i + 1; });

  return { cls, gare, giri, perSquadra: (keys.length - 1) * giri };
}

// Dal tabellone della stagione al tabellone dei playoff. Accoppiamenti da
// testa di serie: la prima contro l'ultima qualificata, la seconda contro la
// penultima. Nessun turno saltato da nessuno.
export function tabelloneDaStagione(teams, cls, _seedBase) {
  const tutte = cls.length;
  const q = potenzaSotto(tutte);
  const passa = cls.slice(0, q).map((r) => r.k);
  const fuori = cls.slice(q).map((r) => r.k);

  const ordine = [];
  for (let i = 0; i < q / 2; i++) ordine.push(passa[i], passa[q - 1 - i]);

  const serie = [];
  let campo = q;
  while (campo > 1) { serie.push(campo / 2); campo /= 2; }

  const nome = (k) => teams[k]?.name || TEAM_NAMES[k] || k;
  const reasons = [];
  const prima = cls[0];
  reasons.push(`${nome(prima.k)} chiude la stagione regolare da prima, ${prima.w}-${prima.l}.`);
  if (fuori.length) {
    reasons.push(fuori.length === 1
      ? `${nome(fuori[0])} resta fuori dai playoff.`
      : `Restano fuori ${fuori.map(nome).join(', ')}.`);
  }
  if (q >= 4) reasons.push('Accoppiamenti da classifica: la prima incontra l\'ultima qualificata.');

  return { n: tutte, ordine, teste: 0, giocano: q, serie, reasons, fuori, daStagione: true };
}

/* ==========================================================
   5b. TABELLONE — da 2 a 12 squadre, un solo algoritmo
   ========================================================== */

// Eliminazione diretta. Si arrotonda alla potenza di due superiore e i posti
// che avanzano diventano teste di serie che saltano il primo turno. Le teste
// di serie si SORTEGGIANO, non si danno alle migliori: misurato su 800 tornei
// (tools/bye.mjs), darle al piu forte gli regala +10 punti di titoli, a sorte
// ne aggiunge 3.
export function formaTabellone(n) {
  let p = 2;
  while (p < n) p *= 2;
  const teste = p - n;          // quante saltano il primo turno
  const giocano = n - teste;    // quante scendono in campo subito (sempre pari)
  const serie = [giocano / 2];
  let campo = teste + giocano / 2;
  while (campo > 1) { serie.push(campo / 2); campo /= 2; }
  return { teste, giocano, serie };            // serie = quante partite per turno
}

// "Finale", "Semifinale", "Quarti"... contati dalla fine. Il primo turno,
// quando ci sono teste di serie, e un preliminare e si chiama cosi.
export function nomeTurno(r, totTurni, conTeste) {
  if (r === 0 && conTeste && totTurni > 1) return 'Turno preliminare';
  const daFondo = totTurni - 1 - r;
  return ['Finale', 'Semifinale', 'Quarti di finale', 'Ottavi di finale'][daFondo] || `Turno ${r + 1}`;
}

export function componiTabellone(teams, seed = 'bye') {
  const k = Object.keys(teams);
  const { teste, giocano, serie } = formaTabellone(k.length);

  // Ordine sorteggiato: i primi "teste" saltano il primo turno, gli altri
  // si accoppiano a due a due nell'ordine in cui escono.
  const ordine = shuffleDet(k, makeRng(seed + ':tabellone'));
  const inTesta = ordine.slice(0, teste);
  const subito = ordine.slice(teste);

  const reasons = [];
  if (k.length === 2) {
    reasons.push(`Solo due squadre: si va dritti alle Finals, ${teams[ordine[0]].name} contro ${teams[ordine[1]].name}.`);
  } else {
    if (inTesta.length) {
      reasons.push(inTesta.length === 1
        ? `Il sorteggio manda ${teams[inTesta[0]].name} direttamente al turno successivo: salta il preliminare.`
        : `Il sorteggio fa saltare il preliminare a ${inTesta.map((x) => teams[x].name).join(', ')}.`);
    }
    // Sul primo accoppiamento diciamo su quale asse si gioca: da qualche parte
    // bisogna pur cominciare a raccontare il torneo.
    if (subito.length >= 2) {
      const [x, y] = subito;
      const c = contrast(teams[x], teams[y]);
      const asse = AXES.slice().sort((u, v) => c.per[v.key] - c.per[u.key])[0];
      reasons.push(`Si apre con ${teams[x].name} contro ${teams[y].name}: è sull'asse "${asse.label}" che sono più lontane.`);
    }
  }

  return { n: k.length, ordine, teste, giocano, serie, reasons };
}

// Shuffle deterministico locale: qui serve con un rng gia seminato.
function shuffleDet(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Ricostruisce il tabellone completo dallo stato: chi gioca contro chi in ogni
// turno NON e salvato, viene dedotto dai risultati dei turni precedenti. Il
// motore e deterministico, quindi ogni client arriva alle stesse conclusioni.
export function costruisciBracket(po, T) {
  const turni = [];
  let campo = null;

  for (let r = 0; r < po.turni.length; r++) {
    let concorrenti;
    if (r === 0) {
      concorrenti = po.ordine.slice(po.teste);
    } else if (r === 1) {
      concorrenti = [...po.ordine.slice(0, po.teste), ...campo];
    } else {
      concorrenti = campo;
    }

    const round = [];
    for (let i = 0; i * 2 < concorrenti.length; i++) {
      const a = concorrenti[i * 2], b = concorrenti[i * 2 + 1];
      const meta = po.turni[r]?.[i] || { seed: `${po.seedBase}:r${r}m${i}`, gamesPlayed: 0 };
      const pronti = a && b && T[a] && T[b];
      round.push({
        r, i, a, b, seed: meta.seed, gamesPlayed: meta.gamesPlayed,
        res: pronti ? simSeriesUpTo(T[a], T[b], meta.seed, meta.gamesPlayed) : null,
      });
    }
    turni.push(round);
    campo = round.map((m) => (m.res?.done ? m.res.winner : null));
  }
  return turni;
}

// Delle 3 partizioni possibili di 4 squadre sceglie quella che massimizza il
// contrasto stilistico complessivo, e dice su quale asse si gioca lo scontro.
export function pickBracket(teams) {
  const k = Object.keys(teams);
  const partitions = [
    [[k[0], k[1]], [k[2], k[3]]],
    [[k[0], k[2]], [k[1], k[3]]],
    [[k[0], k[3]], [k[1], k[2]]],
  ];

  let best = null;
  for (const p of partitions) {
    const c1 = contrast(teams[p[0][0]], teams[p[0][1]]);
    const c2 = contrast(teams[p[1][0]], teams[p[1][1]]);
    const score = c1.total + c2.total;
    if (!best || score > best.score) best = { pairs: p, score, contrasts: [c1, c2] };
  }

  const reasons = best.pairs.map((pair, i) => {
    const c = best.contrasts[i];
    const topAxis = AXES.slice().sort((x, y) => c.per[y.key] - c.per[x.key])[0];
    const t1 = teams[pair[0]], t2 = teams[pair[1]];
    const hi = topAxis.get(t1) >= topAxis.get(t2) ? t1 : t2;
    const lo = hi === t1 ? t2 : t1;
    return `${t1.name} contro ${t2.name}: è sull'asse "${topAxis.label}" che le due squadre sono più lontane — ${hi.name} sta molto sopra, ${lo.name} molto sotto. È il confronto che dice di più.`;
  });

  return { semis: best.pairs, reasons };
}
