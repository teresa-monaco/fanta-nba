// fairness.mjs — diagnostica: le quattro sedie valgono uguale?
// Separa l'effetto asta (chi costruisce la rosa migliore) dall'effetto
// playoff (chi ha il tabellone piu comodo), perche sono due bug diversi.
//
//   node tools/fairness.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const { installData, makeRng, TEAM_KEYS, STRATEGIES, ROSTER_SIZE } = await import('../js/core.js');
const D = installData(readJson('data/players.json'), readJson('data/archetypes.json'), readJson('data/coaches.json'));
const { buildTeam, simSeries, simSeriesUpTo, pickBracket } = await import('../js/engine.js');
const S = await import('../js/state.js');

let clock = 1e6;
const tick = () => (clock += 1000);
const N = 400;

const acc = Object.fromEntries(TEAM_KEYS.map((k) => [k, { power: 0, spent: 0, champ: 0, semiWin: 0, semiA: 0 }]));

for (let i = 0; i < N; i++) {
  const rng = makeRng('fair' + i);
  let s = S.newGame('fair' + i, 'host');
  s = S.startAuction(s, tick());

  let guard = 0;
  while (s.phase === 'auction' && guard++ < 5000) {
    const bidders = TEAM_KEYS.filter((k) => S.slotsLeft(s, k) > 0);
    let rounds = 0;
    while (rounds++ < 30) {
      const k = bidders[Math.floor(rng() * bidders.length)];
      if (!k) break;
      const cur = s.auction.bid;
      const min = cur ? cur.amount + 1 : 1;
      const max = S.maxBid(s, k);
      if (max < min || (cur && cur.team === k)) break;
      if (rng() > 0.62) break;
      s = S.placeBid(s, k, min + Math.floor(rng() * Math.max(1, Math.min(4, max - min + 1))), tick());
    }
    s = S.resolveLot(s, tick());
  }
  if (s.phase !== 'lineups') continue;

  s = S.toTactics(s);
  const strategies = Object.keys(STRATEGIES);
  for (const k of TEAM_KEYS) s = S.setTactics(s, k, { strategy: strategies[Math.floor(rng() * strategies.length)] });

  const T = {};
  for (const k of TEAM_KEYS) {
    T[k] = buildTeam(k, s.lineups[k], s.tactics[k]);
    acc[k].power += T[k].off + T[k].def;
    acc[k].spent += ROSTER_SIZE ? (50 - s.teams[k].credits) : 0;
  }

  const { semis, reasons } = pickBracket(T);
  s = S.toPlayoffs(s, semis, reasons);
  acc[s.po.s1.a].semiA++; acc[s.po.s2.a].semiA++;

  const r1 = simSeries(T[s.po.s1.a], T[s.po.s1.b], s.po.s1.seed);
  const r2 = simSeries(T[s.po.s2.a], T[s.po.s2.b], s.po.s2.seed);
  acc[r1.winner].semiWin++; acc[r2.winner].semiWin++;

  const l1 = r1.winner === s.po.s1.a ? s.po.s1.b : s.po.s1.a;
  const l2 = r2.winner === s.po.s2.a ? s.po.s2.b : s.po.s2.a;
  s = S.openFinal(s, r1.winner, r2.winner, l1, l2);
  const A = T[s.po.final.a], B = T[s.po.final.b];
  const f = simSeriesUpTo(A, B, s.po.final.seed, 7);
  acc[f.winner].champ++;
}

console.log(`\n${N} partite. Se le sedie sono eque, le colonne devono somigliarsi.\n`);
console.log('  squadra   rating medio   crediti spesi   semifinali vinte   titoli');
for (const k of TEAM_KEYS) {
  const a = acc[k];
  console.log(`  ${k.padEnd(9)} ${(a.power / N).toFixed(1).padStart(10)} ${(a.spent / N).toFixed(1).padStart(14)} ` +
    `${String(a.semiWin).padStart(16)} ${String(a.champ).padStart(8)}`);
}
console.log(`\n  (atteso a caso: 200 semifinali vinte in totale, ${N / 4} titoli a testa)\n`);
