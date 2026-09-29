// selftest.mjs — controlla che il motore produca risultati PLAUSIBILI,
// non solo che il codice non esploda. Si lancia con:  node tools/selftest.mjs
//
// Cosa verifica:
//  1. integrita dei dati (id unici, archetipi esistenti, overall in range)
//  2. distribuzione delle serie: 4-0/4-1/4-2/4-3 devono esserci tutte,
//     e il 4-3 non deve dominare (era la lamentela esplicita nelle regole)
//  3. punteggi e statistiche individuali dentro range da basket vero
//  4. determinismo: stesso seed => stessa identica serie
//  5. la strategia cambia davvero il risultato

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const core = await import('../js/core.js');
const { installData, makeRng, shuffle, TEAM_KEYS, SLOTS, STRATEGIES, allenatoriDi } = core;
const D = installData(readJson('data/players.json'), readJson('data/archetypes.json'), readJson('data/coaches.json'));
const { buildTeam, simSeries, matchup, pickBracket, refertoTattico } = await import('../js/engine.js');
const { narrateGame, explainSeries, teamIdentity, verdettoReferto } = await import('../js/narrator.js');
const { autoLineup } = await import('../js/state.js');

// Le quattro posizioni, per nome corto: i test non devono rompersi
// quando le squadre vengono rinominate.
const [K0, K1, K2, K3] = TEAM_KEYS;

let fails = 0;
const ok = (cond, label, extra = '') => {
  if (cond) console.log(`  PASS  ${label}${extra ? ' — ' + extra : ''}`);
  else { console.log(`  FAIL  ${label}${extra ? ' — ' + extra : ''}`); fails++; }
};

/* ---------- 1. Dati ---------- */
console.log('\n1. Integrita dei dati');
{
  const ids = D.players.map((p) => p.id);
  ok(new Set(ids).size === ids.length, 'id univoci',
    `${ids.length} giocatori`);
  ok(D.players.every((p) => D.archetypes[p.arc]), 'ogni archetipo esiste');
  const bad = D.players.filter((p) => p.ovr < 85 || p.ovr > 100);
  ok(bad.length === 0, 'overall tutti fra 85 e 100', bad.map((p) => p.n).join(', '));
  ok(D.players.every((p) => SLOTS.includes(p.pos)), 'ruoli validi');
  ok(D.players.every((p) => (p.alt || []).every((a) => SLOTS.includes(a))), 'ruoli alternativi validi');
  ok(D.players.length >= 200, 'pool abbastanza ampio', `${D.players.length} nomi`);
  const perSlot = SLOTS.map((s) => `${s}:${D.players.filter((p) => p.pos === s).length}`);
  ok(SLOTS.every((s) => D.players.filter((p) => p.pos === s).length >= 25),
    'copertura per ruolo', perSlot.join(' '));
  ok(D.players.every((p) => Object.values(p.attrs).every((v) => v >= 20 && v <= 99)),
    'attributi derivati nel range');

  // Le correzioni individuali sono facili da sbagliare scrivendole a mano:
  // una chiave con un refuso verrebbe semplicemente ignorata, in silenzio.
  const CHIAVI = ['sco', 'tre', 'pla', 'reb', 'dif', 'dpe', 'atl', 'usg'];
  const conMod = D.players.filter((p) => p.mod);
  const chiaviStorte = conMod.flatMap((p) => Object.keys(p.mod).filter((k) => !CHIAVI.includes(k)).map((k) => `${p.n}: ${k}`));
  ok(chiaviStorte.length === 0, 'le correzioni individuali usano solo attributi esistenti',
    chiaviStorte.length ? chiaviStorte.join(', ') : `${conMod.length} giocatori corretti a mano`);
  const troppoGrandi = conMod.filter((p) => Object.values(p.mod).some((v) => Math.abs(v) > 40));
  ok(troppoGrandi.length === 0, 'nessuna correzione cosi grande da svuotare l\'archetipo',
    troppoGrandi.map((p) => p.n).join(', '));
}

/* ---------- Helper: quattro squadre casuali ---------- */
function randomTeams(seed) {
  const rng = makeRng(seed);
  const pool = shuffle(D.players.map((p) => p.id), rng);
  const strategies = Object.keys(STRATEGIES);
  const out = {};
  TEAM_KEYS.forEach((k, i) => {
    const roster = pool.slice(i * 5, i * 5 + 5);
    const lineup = autoLineup(roster);
    const sorted = roster.map((id) => D.byId[id]).sort((a, b) => b.attrs.sco - a.attrs.sco);
    const tactics = {
      v1: sorted[0].id, v2: sorted[1].id,
      strategy: strategies[Math.floor(rng() * strategies.length)],
    };
    out[k] = buildTeam(k, lineup, tactics);
  });
  return out;
}

/* ---------- 1b. Allenatori ---------- */
// Una squadra|epoca senza allenatore non darebbe errore: darebbe un giocatore
// che non sblocca niente, in silenzio. Va controllato qui.
console.log('\n1b. Allenatori');
{
  const cJson = readJson('data/coaches.json');
  const slots = new Set(D.players.map((p) => `${p.tm}|${p.era}`));
  const assegnati = new Map();
  const doppi = [];
  for (const c of cJson.allenatori) {
    for (const s of c.tm || []) {
      if (assegnati.has(s)) doppi.push(`${s}: ${assegnati.get(s)} e ${c.id}`);
      assegnati.set(s, c.id);
    }
  }
  const scoperti = [...slots].filter((s) => !assegnati.has(s));
  ok(scoperti.length === 0, 'ogni squadra+epoca ha un allenatore',
    scoperti.length ? scoperti.slice(0, 5).join(', ') : `${slots.size} combinazioni`);
  ok(doppi.length === 0, 'nessuna squadra+epoca ha due allenatori', doppi.slice(0, 3).join(' | '));

  const archiIgnoti = cJson.allenatori.filter((c) => !cJson.archetipi[c.arc]);
  ok(archiIgnoti.length === 0, 'ogni allenatore ha un archetipo esistente',
    archiIgnoti.map((c) => c.id).join(', '));

  // Ogni archetipo e un PATTO: se desse solo bonus, sceglierlo non sarebbe
  // una decisione ma il calcolo di quale numero e piu grande.
  const senzaCosto = [];
  for (const [id, a] of Object.entries(cJson.archetipi)) {
    const v = [...Object.values(a.eff.attr || {}), ...Object.values(a.eff.star || {}), ...Object.values(a.eff.altri || {})];
    if (!v.some((x) => x < 0) && !(a.eff.poss < 0)) senzaCosto.push(id);
  }
  ok(senzaCosto.length === 0, 'ogni allenatore ha un costo, non solo un bonus', senzaCosto.join(', '));

  // Le chiavi degli attributi devono esistere: un refuso verrebbe ignorato.
  const ATTR = ['sco', 'tre', 'pla', 'reb', 'dif', 'dpe', 'atl', 'usg'];
  const refusi = [];
  for (const [id, a] of Object.entries(cJson.archetipi)) {
    for (const blocco of ['attr', 'star', 'altri']) {
      for (const k of Object.keys(a.eff[blocco] || {})) if (!ATTR.includes(k)) refusi.push(`${id}.${blocco}.${k}`);
    }
  }
  ok(refusi.length === 0, 'nessun attributo inventato negli effetti', refusi.join(', '));

  // Una rosa qualunque deve sbloccare piu di un allenatore, o la scelta e finta.
  {
    const rng = makeRng('coach-rose');
    let almenoDue = 0;
    const M = 300;
    for (let i = 0; i < M; i++) {
      const roster = shuffle(D.players.map((p) => p.id), rng).slice(0, 5);
      if (allenatoriDi(roster).length >= 2) almenoDue++;
    }
    ok(almenoDue / M >= 0.95, 'quasi ogni rosa sblocca almeno due allenatori',
      `${(almenoDue / M * 100).toFixed(0)}%`);
  }
}

/* ---------- 1c. Nomi delle squadre ---------- */
console.log('\n1c. Nomi delle squadre');
{
  const { NOMI_SQUADRE, applicaNomi, TEAM_NAMES } = core;
  const a = { ...applicaNomi('partita-uno') };
  const b = { ...applicaNomi('partita-due') };
  ok(JSON.stringify(a) !== JSON.stringify(b), 'i nomi girano fra una partita e l\'altra',
    `${a.t1} -> ${b.t1}`);
  const c = { ...applicaNomi('partita-uno') };
  ok(JSON.stringify(a) === JSON.stringify(c),
    'ma lo stesso seed da sempre gli stessi nomi (o due telefoni divergerebbero)');
  ok(TEAM_KEYS.every((k) => !!TEAM_NAMES[k]), 'nessuna sedia resta senza nome');
  ok(NOMI_SQUADRE.length >= TEAM_KEYS.length,
    'i nomi bastano per tutte le sedie', `${NOMI_SQUADRE.length} nomi, ${TEAM_KEYS.length} sedie`);
  ok(new Set(NOMI_SQUADRE).size === NOMI_SQUADRE.length, 'nella lista non ci sono doppioni');
  ok(new Set(TEAM_KEYS.map((k) => TEAM_NAMES[k])).size === TEAM_KEYS.length,
    'e anche in dodici nessuna squadra ha il nome di un\'altra');
  applicaNomi('fanta-nba');
}

/* ---------- 1d. Easter egg di gara 7 ---------- */
console.log('\n1d. Gara 7');
{
  const T = randomTeams('egg');
  const ks = Object.keys(T);
  const s = simSeries(T[ks[0]], T[ks[1]], 'egg-serie');
  const testo = (i) => narrateGame(T[ks[0]], T[ks[1]], { ...s.games[0], n: i });
  const fuori = [1, 2, 3, 4, 5, 6].filter((i) => testo(i).includes('Fabio'));
  ok(fuori.length === 0, 'prima di gara 7 Fabio non viene nominato', `gare ${fuori.join(', ')}`);
  ok(testo(7).includes('Fabio'), 'in gara 7 si', testo(7).split('.').pop().trim().slice(0, 48));
  // Varia, altrimenti in una serata con tre gara 7 esce sempre la stessa riga.
  const varianti = new Set();
  for (let i = 0; i < 60; i++) {
    const A = randomTeams('egg' + i);
    const kk = Object.keys(A);
    const ss = simSeries(A[kk[0]], A[kk[1]], 'eggs' + i);
    varianti.add(narrateGame(A[kk[0]], A[kk[1]], { ...ss.games[0], n: 7 }).split('. ').pop());
  }
  ok(varianti.size >= 5, 'e la frase su Fabio cambia', `${varianti.size} varianti su 60 gara 7`);
}

/* ---------- 1e. Il referto tattico ---------- */
console.log('\n1e. Il referto');
{
  let numeriStorti = 0, consigliInutili = 0, verdettiVuoti = 0, contraddizioni = 0;
  let conConsiglio = 0, tutteGiuste = 0, voci = 0;
  const M = 120;
  for (let i = 0; i < M; i++) {
    const T = randomTeams('ref' + i);
    const ks = Object.keys(T);
    const s = simSeries(T[ks[0]], T[ks[1]], 'refs' + i);
    for (const [a, b] of [[0, 1], [1, 0]]) {
      const r = refertoTattico(T[ks[a]], T[ks[b]]);
      voci += r.voci.length;
      for (const v of r.voci) {
        if (!Number.isFinite(v.valore) || !Number.isFinite(v.quantoMeglio)) numeriStorti++;
        // Un consiglio deve valere qualcosa: "meglio X (+0.0)" fa sembrare
        // rotto il referto, ed e il difetto che aveva alla prima stesura.
        if (!v.eraGiusta && !v.ininfluente && v.quantoMeglio < 0.2) consigliInutili++;
        if (v.eraGiusta && v.quantoMeglio > 0.3) contraddizioni++;
        if (!v.eraGiusta && !v.ininfluente) conConsiglio++;
      }
      if (r.voci.every((v) => v.eraGiusta)) tutteGiuste++;
      const verdetto = verdettoReferto(r, s.winner === T[ks[a]].key);
      if (!verdetto || verdetto.length < 25) verdettiVuoti++;
    }
  }
  ok(numeriStorti === 0, 'nessun numero storto nel referto', `${voci} voci`);
  ok(consigliInutili === 0, 'nessun consiglio che non vale niente', `${consigliInutili}`);
  ok(contraddizioni === 0, '"la migliore" non compare mai su una scelta battuta');
  ok(verdettiVuoti === 0, 'il verdetto c\'e sempre ed e una frase vera');
  // Se fossero sempre tutte giuste, il referto non insegnerebbe niente; se
  // non lo fossero mai, sarebbe solo una sberla.
  const q = tutteGiuste / (M * 2) * 100;
  ok(q > 2 && q < 60, 'qualche volta si azzecca tutto, di solito no', `${q.toFixed(0)}% di referti perfetti`);
  ok(conConsiglio / (M * 2) >= 1, 'in media almeno un consiglio utile per squadra',
    `${(conConsiglio / (M * 2)).toFixed(1)} per referto`);
}

/* ---------- 2. Distribuzione delle serie ---------- */
console.log('\n2. Distribuzione dei risultati (400 serie)');
{
  const dist = { '4-0': 0, '4-1': 0, '4-2': 0, '4-3': 0 };
  let games = 0, totalMargin = 0, blowouts = 0, close = 0, otCount = 0;
  const scores = [];

  for (let i = 0; i < 400; i++) {
    const T = randomTeams('dist' + i);
    const r = simSeries(T[K0], T[K1], 'ser' + i);
    const loser = Math.min(r.wins.a, r.wins.b);
    dist[`4-${loser}`]++;
    for (const g of r.games) {
      games++; totalMargin += g.margin;
      if (g.margin >= 20) blowouts++;
      if (g.margin <= 4) close++;
      if (g.ot) otCount++;
      scores.push(g.scoreA, g.scoreB);
    }
  }

  const pct = (n) => ((n / 400) * 100).toFixed(1) + '%';
  console.log(`     4-0 ${pct(dist['4-0'])} | 4-1 ${pct(dist['4-1'])} | 4-2 ${pct(dist['4-2'])} | 4-3 ${pct(dist['4-3'])}`);

  ok(Object.values(dist).every((v) => v > 0), 'tutte e quattro le lunghezze compaiono');
  ok(dist['4-3'] / 400 < 0.35, 'il 4-3 non domina', pct(dist['4-3']));
  ok(dist['4-0'] / 400 > 0.05, 'gli sweep esistono', pct(dist['4-0']));

  const avgMargin = totalMargin / games;
  ok(avgMargin > 7 && avgMargin < 16, 'scarto medio da basket vero', avgMargin.toFixed(1) + ' punti');
  ok(close / games > 0.15 && close / games < 0.45, 'quota di gare in volata sensata',
    ((close / games) * 100).toFixed(0) + '%');
  ok(blowouts / games > 0.05, 'esistono le batoste', ((blowouts / games) * 100).toFixed(0) + '%');

  scores.sort((a, b) => a - b);
  const min = scores[0], max = scores[scores.length - 1];
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  ok(avg > 100 && avg < 125, 'punteggio medio realistico', avg.toFixed(1));
  ok(min > 70 && max < 165, 'nessun punteggio assurdo', `min ${min}, max ${max}`);
  console.log(`     overtime: ${((otCount / games) * 100).toFixed(1)}% delle gare`);
}

/* ---------- 3. Statistiche individuali ---------- */
console.log('\n3. Plausibilita delle statistiche individuali');
{
  let maxPts = 0, maxReb = 0, maxAst = 0, minPts = 999, lines = 0;
  let starSample = [];
  for (let i = 0; i < 120; i++) {
    const T = randomTeams('stat' + i);
    const r = simSeries(T[K2], T[K3], 'st' + i);
    for (const g of r.games) {
      for (const l of [...g.boxA, ...g.boxB]) {
        lines++;
        maxPts = Math.max(maxPts, l.pts); minPts = Math.min(minPts, l.pts);
        maxReb = Math.max(maxReb, l.reb); maxAst = Math.max(maxAst, l.ast);
      }
      const v1 = T[K2].tactics.v1;
      const line = g.boxA.find((l) => l.id === v1);
      if (line) starSample.push(line.pts);
    }
  }
  ok(maxPts <= 62, 'nessun punteggio individuale assurdo', `massimo ${maxPts} punti`);
  ok(maxReb <= 27, 'rimbalzi entro limiti umani', `massimo ${maxReb}`);
  ok(maxAst <= 24, 'assist entro limiti umani', `massimo ${maxAst}`);
  ok(minPts >= 2, 'nessun valore negativo');
  const starAvg = starSample.reduce((s, v) => s + v, 0) / starSample.length;
  ok(starAvg > 19 && starAvg < 34, 'il primo violino segna da primo violino', starAvg.toFixed(1) + ' punti di media');
  console.log(`     ${lines} righe di box score controllate`);
}

/* ---------- 4. Determinismo ---------- */
console.log('\n4. Determinismo (e la base della sincronizzazione)');
{
  const T1 = randomTeams('det');
  const T2 = randomTeams('det');
  const a = simSeries(T1[K0], T1[K1], 'same-seed');
  const b = simSeries(T2[K0], T2[K1], 'same-seed');
  ok(JSON.stringify(a.games.map((g) => [g.scoreA, g.scoreB])) ===
     JSON.stringify(b.games.map((g) => [g.scoreA, g.scoreB])),
    'stesso seed => stesse partite', `${a.games.length} gare`);
  const c = simSeries(T1[K0], T1[K1], 'other-seed');
  ok(JSON.stringify(a.games.map((g) => g.scoreA)) !== JSON.stringify(c.games.map((g) => g.scoreA)),
    'seed diverso => partite diverse');
}

/* ---------- 5. La strategia conta ---------- */
console.log('\n5. Impatto delle scelte tattiche');
{
  const T = randomTeams('strat');
  const base = T[K0];
  const opp = T[K1];
  const results = {};
  for (const strat of Object.keys(STRATEGIES)) {
    const variant = buildTeam(K0, lineupOf(base), { ...base.tactics, strategy: strat });
    const m = matchup(variant, opp);
    results[strat] = m.offA;
  }
  const vals = Object.values(results);
  const spread = Math.max(...vals) - Math.min(...vals);
  ok(spread > 3, 'la strategia sposta l\'attacco in modo misurabile', `${spread.toFixed(1)} punti di rating fra la migliore e la peggiore`);

  const best = Object.entries(results).sort((a, b) => b[1] - a[1])[0];
  const worst = Object.entries(results).sort((a, b) => a[1] - b[1])[0];
  console.log(`     per questo quintetto: meglio "${STRATEGIES[best[0]].label}" (${best[1].toFixed(1)}), peggio "${STRATEGIES[worst[0]].label}" (${worst[1].toFixed(1)})`);

  // Il tiro da 3 deve alzare la varianza, non la media.
  const three = buildTeam(K0, lineupOf(base), { ...base.tactics, strategy: 'tiro-3' });
  const bal = buildTeam(K0, lineupOf(base), { ...base.tactics, strategy: 'equilibrato' });
  ok(matchup(three, opp).varA > matchup(bal, opp).varA * 1.3,
    'il tiro da 3 alza davvero la varianza');
}
function lineupOf(T) {
  const out = {};
  for (const p of T.five) out[p.slot] = p.id;
  return out;
}

/* ---------- 6. Accoppiamenti e testo ---------- */
console.log('\n6. Accoppiamenti e narrazione');
{
  const T = randomTeams('brk');
  const { semis, reasons } = pickBracket(T);
  const flat = semis.flat();
  ok(new Set(flat).size === 4, 'ogni squadra gioca una sola semifinale');
  ok(reasons.length === 2 && reasons.every((r) => r.length > 30), 'entrambi gli accoppiamenti sono motivati');
  console.log(`     ${reasons[0]}`);

  const r = simSeries(T[semis[0][0]], T[semis[0][1]], 'narr');
  const story = narrateGame(T[semis[0][0]], T[semis[0][1]], r.games[0]);
  ok(story.length > 50 && !story.includes('{'), 'cronaca senza segnaposto non sostituiti');
  const why = explainSeries(T[semis[0][0]], T[semis[0][1]], r);
  ok(why.length >= 1 && why.every((w) => !w.includes('{')), 'spiegazione senza segnaposto', `${why.length} fattori`);
  console.log(`     "${story}"`);
  why.forEach((w) => console.log(`     · ${w}`));

  // Varieta: la stessa frase non deve uscire sempre.
  const stories = new Set();
  for (let i = 0; i < 40; i++) {
    const TT = randomTeams('v' + i);
    const rr = simSeries(TT[K0], TT[K1], 'v' + i);
    rr.games.forEach((g) => stories.add(narrateGame(TT[K0], TT[K1], g)));
  }
  ok(stories.size > 120, 'le cronache non si ripetono', `${stories.size} testi diversi su ~200 gare`);

  ok(teamIdentity(T[K0]).length > 3, 'identita di squadra generata', teamIdentity(T[K0]));
}

/* ---------- Esito ---------- */
console.log(fails === 0 ? '\nTutti i controlli superati.\n' : `\n${fails} controlli FALLITI.\n`);
process.exit(fails === 0 ? 0 : 1);
