// partite.mjs — gioca davvero e cerca cosa non va.
//
//   node tools/partite.mjs
//
// Non verifica che il codice giri (per quello ci sono gli altri test):
// gioca centinaia di partite complete, legge quello che esce e segnala
// incoerenze, ripetizioni, squilibri e cose che a un giocatore darebbero
// fastidio.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const { installData, makeRng, shuffle, STRATEGIES, TEAM_KEYS, TEAM_NAMES } = await import('../js/core.js');
const D = installData(readJson('data/players.json'), readJson('data/archetypes.json'), readJson('data/coaches.json'));
const { buildTeam, simSeriesUpTo, componiTabellone } = await import('../js/engine.js');
const { narrateGame, explainSeries, teamIdentity } = await import('../js/narrator.js');
const S = await import('../js/state.js');

const STRAT = Object.keys(STRATEGIES);
const problemi = new Map();
const segnala = (c, d = '') => problemi.set(c + (d ? ' :: ' + d : ''), (problemi.get(c + (d ? ' :: ' + d : '')) || 0) + 1);

/* ---------- costruttori ---------- */

// Due rose dallo STESSO mescolamento: altrimenti lo stesso giocatore puo
// finire in entrambe le squadre, cosa che in una vera asta non succede mai.
function dueRose(rng) {
  const pool = shuffle(D.players.map((p) => p.id), rng);
  return [pool.slice(0, 5), pool.slice(5, 10)];
}
function rosaCasuale(rng) {
  return shuffle(D.players.map((p) => p.id), rng).slice(0, 5);
}
function squadra(key, ids, strategia) {
  const ord = ids.map((id) => D.byId[id]).sort((a, b) => b.attrs.sco - a.attrs.sco);
  return buildTeam(key, S.autoLineup(ids), { v1: ord[0].id, v2: ord[1].id, strategy: strategia });
}

/* ---------- controlli su una gara ---------- */

function controllaGara(A, B, g, dove) {
  const sommaA = g.boxA.reduce((s, l) => s + l.pts, 0);
  const sommaB = g.boxB.reduce((s, l) => s + l.pts, 0);
  if (sommaA !== g.scoreA) segnala('box score non somma al punteggio', `${dove} ${sommaA} vs ${g.scoreA}`);
  if (sommaB !== g.scoreB) segnala('box score non somma al punteggio', `${dove} ${sommaB} vs ${g.scoreB}`);
  if (g.scoreA === g.scoreB) segnala('gara finita in parita');
  if (g.scoreA < 70 || g.scoreB < 70) segnala('punteggio troppo basso', `${g.scoreA}-${g.scoreB}`);
  if (g.scoreA > 160 || g.scoreB > 160) segnala('punteggio troppo alto', `${g.scoreA}-${g.scoreB}`);

  const testo = narrateGame(A, B, g);
  if (/\{[a-zA-Z]+\}/.test(testo)) segnala('segnaposto non sostituito nella cronaca', testo.slice(0, 60));
  if (testo.includes('undefined') || testo.includes('NaN')) segnala('undefined o NaN nella cronaca');
  // La cronaca deve nominare il vincitore, non il perdente come protagonista.
  const vincente = g.scoreA > g.scoreB ? A : B;
  if (!testo.includes(vincente.name)) segnala('la cronaca non nomina chi ha vinto');
  return testo;
}

function controllaSerie(A, B, r, dove) {
  if (Math.max(r.wins.a, r.wins.b) !== 4) segnala('serie non chiusa a 4', dove);
  if (!r.mvp) { segnala('MVP mancante', dove); return; }
  // L'MVP deve venire dalla squadra che ha vinto.
  const squadraMvp = r.mvp.team;
  if (squadraMvp !== r.winner) segnala('MVP dalla squadra sconfitta', dove);
  if (r.mvp.ppg < 8) segnala('MVP con pochissimi punti', `${r.mvp.n} ${r.mvp.ppg.toFixed(1)}`);
  const perche = explainSeries(A, B, r);
  if (!perche.length) segnala('nessuna spiegazione del perche', dove);
  for (const p of perche) {
    if (/\{[a-zA-Z]+\}/.test(p)) segnala('segnaposto nella spiegazione', p.slice(0, 60));
    if (p.includes('undefined')) segnala('undefined nella spiegazione', p.slice(0, 60));
  }
}

/* ==========================================================
   1. UNO CONTRO UNO, TUTTE LE STRATEGIE CONTRO TUTTE
   ========================================================== */

console.log('\n' + '='.repeat(74));
console.log('1. UNO CONTRO UNO — matrice 11 x 11 delle strategie');
console.log('='.repeat(74));
console.log('\n  Stesse due rose in tutti i confronti: cambia SOLO la strategia.');
console.log('  24 coppie di rose diverse, 6 serie per casella: 17.424 serie.\n');

const vittorie = {};
for (const a of STRAT) { vittorie[a] = {}; for (const b of STRAT) vittorie[a][b] = 0; }
// Durata delle serie, sul totale e per strategia di chi attacca.
const durate = { 4: 0, 5: 0, 6: 0, 7: 0 };
const durataPerStrat = {};
for (const a of STRAT) durataPerStrat[a] = { 4: 0, 5: 0, 6: 0, 7: 0 };

// Su PIU coppie di rose: con una sola, si misura cosa piace a quelle due
// squadre, non quanto vale la strategia in generale.
const COPPIE = 24, PER_CASELLA = 6;
{
  for (let c = 0; c < COPPIE; c++) {
    const rng = makeRng('1v1-' + c);
    const [rosaA, rosaB] = dueRose(rng);
    for (const sa of STRAT) {
      const A = squadra(TEAM_KEYS[0], rosaA, sa);
      for (const sb of STRAT) {
        const B = squadra(TEAM_KEYS[1], rosaB, sb);
        for (let i = 0; i < PER_CASELLA; i++) {
          const r = simSeriesUpTo(A, B, `m:${c}:${sa}:${sb}:${i}`, 7);
          if (r.winner === A.key) vittorie[sa][sb]++;
          durate[r.games.length]++;
          durataPerStrat[sa][r.games.length]++;
          if (c === 0 && i === 0) {
            controllaSerie(A, B, r, `${sa} vs ${sb}`);
            r.games.forEach((g, j) => controllaGara(A, B, g, `${sa}/${sb} g${j + 1}`));
          }
        }
      }
    }
  }
}
const PROVE = COPPIE * PER_CASELLA;

const sigla = { 'palla-star': 'STAR', 'pick-roll': 'P&R', 'post-up': 'POST', 'attacco-ferro': 'FERRO',
  'tiro-3': 'TIRO3', 'transizione': 'TRANS', 'motion': 'MOTION', 'isolamento': 'ISO',
  'dentro-fuori': 'D-F', 'handoff': 'HAND', 'equilibrato': 'EQUI' };

process.stdout.write('  ' + 'attacca \\ difende'.padEnd(9));
for (const b of STRAT) process.stdout.write(sigla[b].padStart(7));
console.log('   MEDIA');
for (const a of STRAT) {
  process.stdout.write('  ' + sigla[a].padEnd(9));
  let tot = 0;
  for (const b of STRAT) { const v = vittorie[a][b]; tot += v; process.stdout.write(`${((v / PROVE) * 100).toFixed(0)}%`.padStart(7)); }
  console.log(`   ${((tot / (PROVE * STRAT.length)) * 100).toFixed(1)}%`.padStart(9));
}

const medie = STRAT.map((a) => [a, STRAT.reduce((s, b) => s + vittorie[a][b], 0) / (PROVE * STRAT.length)]).sort((x, y) => y[1] - x[1]);
console.log(`\n  Migliore: ${STRATEGIES[medie[0][0]].label} ${(medie[0][1] * 100).toFixed(1)}%`);
console.log(`  Peggiore: ${STRATEGIES[medie[medie.length - 1][0]].label} ${(medie[medie.length - 1][1] * 100).toFixed(1)}%`);
console.log(`  Forbice: ${((medie[0][1] - medie[medie.length - 1][1]) * 100).toFixed(1)} punti`);

// Esiste morra cinese? Cerchiamo caselle dove A batte B, B batte C, C batte A.
let cicli = 0;
for (const a of STRAT) for (const b of STRAT) for (const c of STRAT) {
  if (a === b || b === c || a === c) continue;
  if (vittorie[a][b] > PROVE * 0.58 && vittorie[b][c] > PROVE * 0.58 && vittorie[c][a] > PROVE * 0.58) cicli++;
}
console.log(`  Triangoli "morra cinese" (A batte B batte C batte A): ${cicli}`);

const totSerie = Object.values(durate).reduce((a, b) => a + b, 0);
console.log(`\n  DURATA DELLE ${totSerie.toLocaleString('it-IT')} SERIE\n`);
for (const d of [4, 5, 6, 7]) {
  const n = durate[d];
  const q = (n / totSerie) * 100;
  console.log(`    ${d} gare (4-${d - 4})  ${String(n).padStart(6)}   ${q.toFixed(1).padStart(5)}%  ${'#'.repeat(Math.round(q))}`);
}
const mediaGare = [4, 5, 6, 7].reduce((s, d) => s + d * durate[d], 0) / totSerie;
console.log(`\n    gare per serie, in media: ${mediaGare.toFixed(2)}`);
console.log(`    serie lunghe (6 o 7 gare): ${(((durate[6] + durate[7]) / totSerie) * 100).toFixed(1)}%`);

console.log(`\n  La strategia cambia la DURATA? (quota di serie da 7 gare)\n`);
STRAT.map((a) => {
  const t = Object.values(durataPerStrat[a]).reduce((x, y) => x + y, 0);
  return [a, durataPerStrat[a][7] / t, durataPerStrat[a][4] / t];
}).sort((x, y) => y[1] - x[1]).forEach(([a, sette, quattro]) => {
  console.log(`    ${STRATEGIES[a].label.padEnd(24)} 7 gare ${(sette * 100).toFixed(1).padStart(5)}%   sweep ${(quattro * 100).toFixed(1).padStart(5)}%`);
});

/* ==========================================================
   2. UNA PARTITA 1v1 PER INTERO, COME LA VEDE UN GIOCATORE
   ========================================================== */

console.log('\n' + '='.repeat(74));
console.log('2. UNA PARTITA UNO CONTRO UNO, PER INTERO');
console.log('='.repeat(74));
{
  const rng = makeRng('demo1v1');
  const A = squadra(TEAM_KEYS[0], rosaCasuale(rng), 'tiro-3');
  const B = squadra(TEAM_KEYS[1], rosaCasuale(rng), 'post-up');
  const T = { [A.key]: A, [B.key]: B };
  const tab = componiTabellone(T, 'demo1v1');
  console.log(`\n  Tabellone: ${tab.tipo}`);
  tab.reasons.forEach((r) => console.log(`  ${r}`));
  console.log(`\n  ${A.name}: ${teamIdentity(A)}`);
  console.log(`     ${A.five.map((p) => `${p.slot} ${p.n} (${p.ovr})`).join(', ')}`);
  console.log(`     strategia: ${STRATEGIES[A.tactics.strategy].label}`);
  console.log(`\n  ${B.name}: ${teamIdentity(B)}`);
  console.log(`     ${B.five.map((p) => `${p.slot} ${p.n} (${p.ovr})`).join(', ')}`);
  console.log(`     strategia: ${STRATEGIES[B.tactics.strategy].label}\n`);

  const f = simSeriesUpTo(A, B, 'demo1v1:final', 7);
  f.games.forEach((g) => {
    console.log(`  Gara ${g.n}${g.ot ? ' (OT)' : ''}: ${A.name} ${g.scoreA} - ${g.scoreB} ${B.name}   [serie ${g.seriesAfter.a}-${g.seriesAfter.b}]`);
    console.log(`     ${narrateGame(A, B, g)}`);
  });
  console.log(`\n  CAMPIONE: ${TEAM_NAMES[f.winner]} ${Math.max(f.wins.a, f.wins.b)}-${Math.min(f.wins.a, f.wins.b)}`);
  console.log(`  MVP: ${f.mvp.n} — ${f.mvp.ppg.toFixed(1)} punti, ${f.mvp.rpg.toFixed(1)} rimbalzi, ${f.mvp.apg.toFixed(1)} assist`);
  console.log('  Perche:');
  explainSeries(A, B, f).forEach((p) => console.log(`    - ${p}`));
}

/* ==========================================================
   3. TANTE PARTITE IN QUATTRO
   ========================================================== */

console.log('\n' + '='.repeat(74));
console.log('3. DUECENTO TORNEI IN QUATTRO');
console.log('='.repeat(74));
{
  const durate = { 4: 0, 5: 0, 6: 0, 7: 0 };
  const stratCampione = {};
  const mvpConta = {};
  let tornei = 0, gare = 0;
  const cronache = new Set();
  const spiegazioni = new Set();

  for (let i = 0; i < 200; i++) {
    const rng = makeRng('t4-' + i);
    const pool = shuffle(D.players.map((p) => p.id), rng);
    const T = {};
    TEAM_KEYS.forEach((k, j) => {
      T[k] = squadra(k, pool.slice(j * 5, j * 5 + 5), STRAT[Math.floor(rng() * STRAT.length)]);
    });
    // Il tabellone e generico da quando si gioca da 2 a 12: gli accoppiamenti
    // stanno in "ordine", a due a due. "semis" non esiste piu.
    const tab = componiTabellone(T, 't4-' + i);
    const [a1, b1, a2, b2] = tab.ordine;
    const s1 = simSeriesUpTo(T[a1], T[b1], `t${i}:s1`, 7);
    const s2 = simSeriesUpTo(T[a2], T[b2], `t${i}:s2`, 7);
    controllaSerie(T[a1], T[b1], s1, 'semi1');
    controllaSerie(T[a2], T[b2], s2, 'semi2');

    const F1 = T[s1.winner], F2 = T[s2.winner];
    const f = simSeriesUpTo(F1, F2, `t${i}:f`, 7);
    controllaSerie(F1, F2, f, 'finale');
    f.games.forEach((g, j) => { gare++; cronache.add(controllaGara(F1, F2, g, `finale g${j + 1}`)); });
    explainSeries(F1, F2, f).forEach((p) => spiegazioni.add(p));

    durate[f.games.length]++;
    stratCampione[T[f.winner].tactics.strategy] = (stratCampione[T[f.winner].tactics.strategy] || 0) + 1;
    mvpConta[f.mvp.n] = (mvpConta[f.mvp.n] || 0) + 1;
    tornei++;
  }

  console.log(`\n  ${tornei} tornei, ${gare} gare di finale\n`);
  console.log('  Durata delle Finals:');
  for (const d of [4, 5, 6, 7]) console.log(`    ${d} gare: ${((durate[d] / tornei) * 100).toFixed(1)}%`);

  console.log('\n  Strategia del campione (quante volte ha vinto il titolo):');
  Object.entries(stratCampione).sort((a, b) => b[1] - a[1]).forEach(([s, n]) =>
    console.log(`    ${STRATEGIES[s].label.padEnd(24)} ${String(n).padStart(3)}  ${((n / tornei) * 100).toFixed(1)}%`));
  const attesa = tornei / STRAT.length;
  const fuori = Object.entries(stratCampione).filter(([, n]) => Math.abs(n - attesa) > attesa * 0.75);
  if (fuori.length) console.log(`    (attesa per strategia: ${attesa.toFixed(1)} titoli)`);

  console.log(`\n  Varieta dei testi:`);
  console.log(`    cronache diverse ..... ${cronache.size} su ${gare} gare  (${((cronache.size / gare) * 100).toFixed(0)}%)`);
  console.log(`    spiegazioni diverse .. ${spiegazioni.size}`);

  const mvpTop = Object.entries(mvpConta).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(`\n  MVP delle Finals piu frequenti:`);
  mvpTop.forEach(([n, c]) => console.log(`    ${n.padEnd(26)} ${c} volte`));
  if (mvpTop[0][1] > tornei * 0.12) segnala('un giocatore domina gli MVP', `${mvpTop[0][0]} ${mvpTop[0][1]}/${tornei}`);
}

/* ==========================================================
   ESITO
   ========================================================== */

console.log('\n' + '='.repeat(74));
console.log('PROBLEMI TROVATI');
console.log('='.repeat(74) + '\n');
if (!problemi.size) console.log('  Nessuno.\n');
else [...problemi.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(6)}x  ${k}`));
console.log('');
