// balance.mjs — diagnostica di taratura (non e un test, non fallisce mai).
//
// Il selftest accoppia squadre CASUALI, che spesso sono di forza molto diversa:
// li lo sweep e legittimo. Qui invece costruisco squadre come le produce
// un'asta vera — stesso budget, quindi forza simile — e guardo se la
// distribuzione dei risultati somiglia a dei playoff veri.
//
//   node tools/balance.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const { installData, makeRng, shuffle, STRATEGIES } = await import('../js/core.js');
const D = installData(readJson('data/players.json'), readJson('data/archetypes.json'));
const { buildTeam, simSeries } = await import('../js/engine.js');
const { autoLineup } = await import('../js/state.js');

// Costruisce due quintetti con lo stesso "costo" complessivo, come se fossero
// usciti dalla stessa asta da 50 crediti.
function pairOfTeams(seed) {
  const rng = makeRng(seed);
  const strategies = Object.keys(STRATEGIES);
  const pool = shuffle(D.players.slice(), rng);

  const target = 440 + Math.floor(rng() * 25); // somma overall dei 5
  const build = (skip) => {
    for (let tries = 0; tries < 400; tries++) {
      const cand = shuffle(pool, makeRng(seed + ':' + skip + ':' + tries)).slice(0, 5);
      const sum = cand.reduce((s, p) => s + p.ovr, 0);
      if (Math.abs(sum - target) <= 4) return cand;
    }
    return pool.slice(skip * 5, skip * 5 + 5);
  };

  return [0, 1].map((i) => {
    const five = build(i);
    const roster = five.map((p) => p.id);
    const lineup = autoLineup(roster);
    const sorted = five.slice().sort((a, b) => b.attrs.sco - a.attrs.sco);
    return buildTeam(i === 0 ? 'agre' : 'steve', lineup, {
      v1: sorted[0].id, v2: sorted[1].id,
      strategy: strategies[Math.floor(rng() * strategies.length)],
    });
  });
}

const N = 600;
const dist = { '4-0': 0, '4-1': 0, '4-2': 0, '4-3': 0 };
let games = 0, margins = [], gapSum = 0;
let upsets = 0;

for (let i = 0; i < N; i++) {
  const [A, B] = pairOfTeams('bal' + i);
  const r = simSeries(A, B, 'bs' + i);
  dist[`4-${Math.min(r.wins.a, r.wins.b)}`]++;
  gapSum += Math.abs((A.off + A.def) - (B.off + B.def));
  const favourite = A.off + A.def >= B.off + B.def ? A.key : B.key;
  if (r.winner !== favourite) upsets++;
  r.games.forEach((g) => { games++; margins.push(g.margin); });
}

const pct = (n) => ((n / N) * 100).toFixed(1).padStart(5) + '%';
margins.sort((a, b) => a - b);
const med = margins[Math.floor(margins.length / 2)];
const avg = margins.reduce((s, v) => s + v, 0) / margins.length;

console.log(`\nSquadre di pari valore, ${N} serie\n`);
console.log(`  4-0 ${pct(dist['4-0'])}   (playoff NBA reali: ~13%)`);
console.log(`  4-1 ${pct(dist['4-1'])}   (~25%)`);
console.log(`  4-2 ${pct(dist['4-2'])}   (~32%)`);
console.log(`  4-3 ${pct(dist['4-3'])}   (~30%)`);
console.log(`\n  gare totali ......... ${games}`);
console.log(`  scarto medio ........ ${avg.toFixed(1)} punti  (NBA ~11)`);
console.log(`  scarto mediano ...... ${med} punti`);
console.log(`  divario medio di forza fra le due squadre: ${(gapSum / N).toFixed(1)} punti di rating`);
console.log(`  sorprese (vince la sfavorita): ${((upsets / N) * 100).toFixed(1)}%\n`);
