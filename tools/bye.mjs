// bye.mjs — con tre squadre, saltare la semifinale quanto vale?
//
//   node tools/bye.mjs
//
// La migliore sulla carta va dritta in finale. E un vantaggio legittimo
// (premia chi ha fatto l'asta migliore) o schiaccia le altre due?

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const { installData, makeRng, shuffle, STRATEGIES, TEAM_KEYS } = await import('../js/core.js');
const D = installData(readJson('data/players.json'), readJson('data/archetypes.json'), readJson('data/coaches.json'));
const { buildTeam, simSeriesUpTo, componiTabellone } = await import('../js/engine.js');
const { autoLineup } = await import('../js/state.js');

const STRAT = Object.keys(STRATEGIES);
const N = 800;
let titoliBye = 0, titoliMigliore = 0;
let titoliRoundRobin = 0; // quante volte la migliore vincerebbe senza bye

for (let i = 0; i < N; i++) {
  const rng = makeRng('bye' + i);
  const pool = shuffle(D.players.map((p) => p.id), rng);
  const T = {};
  for (let j = 0; j < 3; j++) {
    const roster = pool.slice(j * 5, j * 5 + 5);
    const ord = roster.map((id) => D.byId[id]).sort((a, b) => b.attrs.sco - a.attrs.sco);
    T[TEAM_KEYS[j]] = buildTeam(TEAM_KEYS[j], autoLineup(roster), {
      v1: ord[0].id, v2: ord[1].id, strategy: STRAT[Math.floor(rng() * STRAT.length)],
    });
  }
  const chiavi = Object.keys(T);
  // Chi e la migliore SULLA CARTA: il metro con cui si giudicano i formati.
  const migliore = chiavi.slice().sort((a, b) => (T[b].off + T[b].def) - (T[a].off + T[a].def))[0];

  // Variante scartata: bye al piu forte.
  const altriF = chiavi.filter((k) => k !== migliore);
  const semiF = simSeriesUpTo(T[altriF[0]], T[altriF[1]], `b${i}:s`, 7);
  if (simSeriesUpTo(T[migliore], T[semiF.winner], `b${i}:f`, 7).winner === migliore) titoliBye++;

  // Formato adottato: bye a sorte (e quello che produce componiTabellone).
  const tab = componiTabellone(T, 'bye' + i);
  const semiS = simSeriesUpTo(T[tab.semi[0]], T[tab.semi[1]], `b${i}:ss`, 7);
  if (simSeriesUpTo(T[tab.bye], T[semiS.winner], `b${i}:fs`, 7).winner === migliore) titoliMigliore++;

  // Confronto: girone all'italiana, tutte contro tutte, senza bye.
  const punti = {};
  for (const k of Object.keys(T)) punti[k] = 0;
  const cop = [[0, 1], [0, 2], [1, 2]];
  for (const [x, y] of cop) {
    const a = TEAM_KEYS[x], b = TEAM_KEYS[y];
    punti[simSeriesUpTo(T[a], T[b], `b${i}:rr${x}${y}`, 7).winner]++;
  }
  const vincitoreRR = Object.entries(punti).sort((p, q) => q[1] - p[1])[0][0];
  if (vincitoreRR === migliore) titoliRoundRobin++;
}

const pc = (n) => ((n / N) * 100).toFixed(1) + '%';
console.log(`\nTre squadre, ${N} tornei. Quanto spesso vince la migliore sulla carta?\n`);
console.log(`  bye al piu forte (scartato) ......... ${pc(titoliBye)}`);
console.log(`  bye a sorte (adottato) .............. ${pc(titoliMigliore)}`);
console.log(`  girone all'italiana, nessun bye ..... ${pc(titoliRoundRobin)}   <- riferimento neutro`);
const e1 = ((titoliBye - titoliRoundRobin) / N) * 100;
const e2 = ((titoliMigliore - titoliRoundRobin) / N) * 100;
console.log(`\n  il bye al piu forte aggiunge ${e1 >= 0 ? '+' : ''}${e1.toFixed(1)} punti al gia favorito`);
console.log(`  il bye a sorte aggiunge      ${e2 >= 0 ? '+' : ''}${e2.toFixed(1)} punti`);
console.log(`\n  (a caso sarebbe 33.3%; con 4 squadre la migliore vince una singola serie nel 73%)\n`);
