// flowtest.mjs — gioca 200 partite intere, dall'asta al campione, controllando
// che le regole non si rompano mai. E il test che copre state.js, dove stanno
// i vincoli veri (budget, riserva, rose piene, passaggi di fase).
//
//   node tools/flowtest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const { installData, makeRng, TEAM_KEYS, SLOTS, STRATEGIES, START_CREDITS, ROSTER_SIZE } = await import('../js/core.js');
const D = installData(readJson('data/players.json'), readJson('data/archetypes.json'));
const { buildTeam, simSeries, simSeriesUpTo, pickBracket } = await import('../js/engine.js');
const S = await import('../js/state.js');

let fails = 0;
const problems = new Map();
const bad = (label, detail = '') => {
  fails++;
  const k = label + (detail ? ' :: ' + detail : '');
  problems.set(k, (problems.get(k) || 0) + 1);
};

let clock = 1_000_000;
const tick = () => (clock += 1000);

/* ---------- Una partita intera ---------- */

function playFullGame(seed) {
  const rng = makeRng(seed);
  let s = S.newGame(seed, 'host');

  // Lobby: quattro giocatori si siedono.
  TEAM_KEYS.forEach((k, i) => { s = S.takeSeat(s, 'u' + i, 'P' + i, k); });
  if (Object.keys(s.seats).length !== 4) bad('le quattro sedie non si occupano');
  // Una sedia occupata non si puo rubare.
  const before = JSON.stringify(s.seats);
  s = S.takeSeat(s, 'intruso', 'X', TEAM_KEYS[0]);
  if (JSON.stringify(s.seats) !== before) bad('una sedia occupata e stata rubata');

  s = S.startAuction(s, tick());
  if (s.phase !== 'auction') bad('l\'asta non parte');

  // Asta: ogni squadra rilancia con probabilita e prezzo casuali.
  let guard = 0;
  while (s.phase === 'auction' && guard++ < 5000) {
    const pid = S.currentPlayerId(s);
    if (!pid) break;

    const bidders = TEAM_KEYS.filter((k) => S.slotsLeft(s, k) > 0);
    // Giro di rilanci finche qualcuno ha voglia e budget.
    let rounds = 0;
    while (rounds++ < 30) {
      const k = bidders[Math.floor(rng() * bidders.length)];
      if (!k) break;
      const cur = s.auction.bid;
      const min = cur ? cur.amount + 1 : 1;
      const max = S.maxBid(s, k);
      if (max < min || (cur && cur.team === k)) break;
      if (rng() > 0.62) break; // qualcuno molla
      const amount = min + Math.floor(rng() * Math.max(1, Math.min(4, max - min + 1)));

      const canBefore = S.canBid(s, k, amount);
      const next = S.placeBid(s, k, amount, tick());
      if (canBefore && next === s) bad('un rilancio valido e stato rifiutato');
      if (!canBefore && next !== s) bad('un rilancio NON valido e stato accettato');
      s = next;
    }

    // Nessuno ha offerto: il lotto salta. Altrimenti si aggiudica.
    s = S.resolveLot(s, tick());

    // Invarianti dopo ogni lotto.
    for (const k of TEAM_KEYS) {
      const t = s.teams[k];
      if (t.credits < 0) bad('credito negativo', k);
      if (t.roster.length > ROSTER_SIZE) bad('rosa oltre i 5', k);
      if (new Set(t.roster).size !== t.roster.length) bad('giocatore duplicato nella stessa rosa', k);
      const left = ROSTER_SIZE - t.roster.length;
      if (left > 0 && t.credits < left) bad('regola di riserva violata', `${k}: ${t.credits} crediti per ${left} slot`);
    }
    const allOwned = TEAM_KEYS.flatMap((k) => s.teams[k].roster);
    if (new Set(allOwned).size !== allOwned.length) bad('stesso giocatore a due squadre');
  }

  if (s.phase !== 'lineups') { bad('l\'asta non si e chiusa in quintetti', `fase ${s.phase} dopo ${guard} lotti`); return null; }
  for (const k of TEAM_KEYS) {
    if (s.teams[k].roster.length !== ROSTER_SIZE) bad('rosa incompleta a fine asta', k);
    const spent = START_CREDITS - s.teams[k].credits;
    const logged = s.auction.log.filter((l) => l.team === k).reduce((a, l) => a + l.price, 0);
    if (spent !== logged) bad('contabilita non torna', `${k}: ${spent} vs ${logged}`);
  }

  // Quintetti: completi e senza ripetizioni.
  if (!S.lineupsReady(s)) bad('quintetti incompleti');
  for (const k of TEAM_KEYS) {
    const ids = SLOTS.map((sl) => s.lineups[k][sl]);
    if (new Set(ids).size !== 5) bad('stesso giocatore in due ruoli', k);
    if (ids.some((id) => !s.teams[k].roster.includes(id))) bad('in quintetto un giocatore non in rosa', k);
  }
  // Uno scambio non deve mai perdere un giocatore, e due scambi uguali
  // devono riportare il quintetto esattamente com'era.
  const prima = JSON.stringify(s.lineups[TEAM_KEYS[0]]);
  s = S.swapSlots(s, TEAM_KEYS[0], 'PG', 'C');
  if (new Set(SLOTS.map((sl) => s.lineups[TEAM_KEYS[0]][sl])).size !== 5) bad('lo scambio ha perso un giocatore');
  s = S.swapSlots(s, TEAM_KEYS[0], 'PG', 'C');
  if (JSON.stringify(s.lineups[TEAM_KEYS[0]]) !== prima) bad('lo scambio non e reversibile');

  // Tattica.
  s = S.toTactics(s);
  const strategies = Object.keys(STRATEGIES);
  for (const k of TEAM_KEYS) {
    s = S.setTactics(s, k, { strategy: strategies[Math.floor(rng() * strategies.length)] });
  }
  if (!S.tacticsReady(s)) bad('tattica non pronta dopo l\'assegnazione automatica');
  // Due violini uguali vanno rifiutati.
  const v1 = s.tactics[TEAM_KEYS[0]].v1;
  if (S.setTactics(s, TEAM_KEYS[0], { v2: v1 }) !== s) bad('accettati due violini identici');

  // Playoff.
  const T = {};
  for (const k of TEAM_KEYS) T[k] = buildTeam(k, s.lineups[k], s.tactics[k]);
  const { semis, reasons } = pickBracket(T);
  if (new Set(semis.flat()).size !== 4) bad('bracket con squadre ripetute');
  if (reasons.length !== 2) bad('motivazioni mancanti');
  s = S.toPlayoffs(s, semis, reasons);

  s = S.revealSemi(s, 's1');
  s = S.revealSemi(s, 's2');
  const r1 = simSeries(T[s.po.s1.a], T[s.po.s1.b], s.po.s1.seed);
  const r2 = simSeries(T[s.po.s2.a], T[s.po.s2.b], s.po.s2.seed);
  for (const r of [r1, r2]) {
    if (Math.max(r.wins.a, r.wins.b) !== 4) bad('semifinale non chiusa a 4 vittorie');
    if (r.games.length < 4 || r.games.length > 7) bad('numero di gare fuori range', String(r.games.length));
    if (!r.mvp) bad('MVP mancante');
  }

  const l1 = r1.winner === s.po.s1.a ? s.po.s1.b : s.po.s1.a;
  const l2 = r2.winner === s.po.s2.a ? s.po.s2.b : s.po.s2.a;
  s = S.openFinal(s, r1.winner, r2.winner, l1, l2);

  // Finals una gara alla volta.
  const A = T[s.po.final.a], B = T[s.po.final.b];
  let f = null, steps = 0;
  while (steps++ < 8) {
    s = S.advanceFinal(s);
    f = simSeriesUpTo(A, B, s.po.final.seed, s.po.final.gamesPlayed);
    if (f.done) break;
  }
  if (!f?.done) bad('le Finals non si chiudono');
  if (f && f.games.length !== s.po.final.gamesPlayed) bad('gare simulate e contatore fuori sincrono');
  // Nessuna gara oltre la quarta vittoria.
  if (f && Math.max(f.wins.a, f.wins.b) !== 4) bad('serie chiusa male');
  if (f && f.games.length > 7) bad('piu di sette gare nelle Finals');

  // Il terzo posto usa le due eliminate, non le finaliste.
  const finalisti = new Set([s.po.final.a, s.po.final.b]);
  if (finalisti.has(s.po.third.a) || finalisti.has(s.po.third.b)) bad('finalina con una finalista');

  return { champion: f.winner, games: f.games.length };
}

/* ---------- Esecuzione ---------- */

const N = 200;
const champs = {};
let totalFinalGames = 0;

for (let i = 0; i < N; i++) {
  const r = playFullGame('flow' + i);
  if (r) { champs[r.champion] = (champs[r.champion] || 0) + 1; totalFinalGames += r.games; }
}

console.log(`\n${N} partite intere giocate (lobby → asta → quintetti → tattica → playoff → campione)\n`);
console.log('  Titoli vinti:', TEAM_KEYS.map((k) => `${k} ${champs[k] || 0}`).join('  '));
console.log(`  Durata media delle Finals: ${(totalFinalGames / N).toFixed(1)} gare\n`);

if (fails === 0) {
  console.log('Nessuna regola violata.\n');
} else {
  console.log(`${fails} violazioni, raggruppate:\n`);
  [...problems.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}x  ${k}`));
  console.log('');
}
process.exit(fails === 0 ? 0 : 1);
