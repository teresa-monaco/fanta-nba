// calibra.mjs — quali soglie ha senso usare dentro il motore, adesso?
//
//   node tools/calibra.mjs
//
// Le costanti in engine.js ("tiratore" = tre >= 75, "niente regia" se il
// miglior passatore sta sotto 72, ...) erano tarate sulla vecchia scala.
// Questo script costruisce migliaia di quintetti casuali e mostra dove
// cadono davvero i valori, così le soglie si scelgono sui dati.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const { installData, makeRng, shuffle, STRATEGIES, TEAM_KEYS } = await import('../js/core.js');
const D = installData(readJson('data/players.json'), readJson('data/archetypes.json'), readJson('data/coaches.json'));
const { buildTeam } = await import('../js/engine.js');
const { autoLineup } = await import('../js/state.js');

const pct = (vals, q) => {
  const s = vals.slice().sort((a, b) => a - b);
  return Math.round(s[Math.floor(s.length * q)]);
};
const riga = (nome, vals) =>
  `  ${nome.padEnd(22)} p10 ${String(pct(vals, .10)).padStart(3)}   p25 ${String(pct(vals, .25)).padStart(3)}` +
  `   mediana ${String(pct(vals, .50)).padStart(3)}   p75 ${String(pct(vals, .75)).padStart(3)}   p90 ${String(pct(vals, .90)).padStart(3)}`;

/* --- per singolo attributo, su tutti i giocatori --- */
console.log('\nATTRIBUTI SUI 225 GIOCATORI\n');
const ATTR = { sco: 'realizzazione', tre: 'tiro da 3', pla: 'playmaking', reb: 'rimbalzi',
  dif: 'protezione ferro', dpe: 'difesa perimetro', atl: 'atletismo', usg: 'palla richiesta' };
for (const [k, nome] of Object.entries(ATTR)) riga(nome, D.players.map((p) => p.attrs[k]));
for (const [k, nome] of Object.entries(ATTR)) console.log(riga(nome, D.players.map((p) => p.attrs[k])));

/* --- aggregati di squadra, su quintetti casuali --- */
const strategie = Object.keys(STRATEGIES);
const squadre = [];
for (let i = 0; i < 1500; i++) {
  const rng = makeRng('cal' + i);
  const pool = shuffle(D.players.map((p) => p.id), rng);
  const roster = pool.slice(0, 5);
  const lineup = autoLineup(roster);
  const sorted = roster.map((id) => D.byId[id]).sort((a, b) => b.attrs.sco - a.attrs.sco);
  squadre.push(buildTeam(TEAM_KEYS[0], lineup, {
    v1: sorted[0].id, v2: sorted[1].id, strategy: strategie[i % strategie.length],
  }));
}

console.log(`\nAGGREGATI SU ${squadre.length} QUINTETTI CASUALI\n`);
console.log(riga('spacing', squadre.map((t) => t.spacing)));
console.log(riga('playmaking', squadre.map((t) => t.playmaking)));
console.log(riga('rimbalzi', squadre.map((t) => t.rebounding)));
console.log(riga('protezione ferro', squadre.map((t) => t.rimProtect)));
console.log(riga('difesa perimetro', squadre.map((t) => t.perimD)));
console.log(riga('atletismo', squadre.map((t) => t.athleticism)));
console.log(riga('usage totale', squadre.map((t) => t.usageTotal)));
console.log(riga('ATTACCO (off)', squadre.map((t) => t.off)));
console.log(riga('DIFESA (def)', squadre.map((t) => t.def)));

/* --- quanti "tiratori" per soglia --- */
console.log('\nQUANTI TIRATORI PER QUINTETTO, AL VARIARE DELLA SOGLIA\n');
for (const soglia of [60, 65, 70, 75, 80]) {
  const conte = squadre.map((t) => t.five.filter((p) => p.attrs.tre >= soglia).length);
  const media = conte.reduce((a, b) => a + b, 0) / conte.length;
  const zeroUno = conte.filter((c) => c < 2).length / conte.length;
  console.log(`  tre >= ${soglia}:  media ${media.toFixed(2)} tiratori   ·   quintetti con meno di 2: ${(zeroUno * 100).toFixed(0)}%`);
}

/* --- quanto spesso scattano le penalita, con le soglie ATTUALI --- */
console.log('\nQUANTO SCATTANO LE PENALITA CON LE SOGLIE DI ADESSO\n');
const conta = (f) => `${((squadre.filter(f).length / squadre.length) * 100).toFixed(0)}%`;
console.log(`  "spacing assente"   (meno di 2 con tre>=75) ... ${conta((t) => t.shooters < 2)}`);
console.log(`  "nessun regista"    (miglior pla < 72) ........ ${conta((t) => Math.max(...t.five.map((p) => p.attrs.pla)) < 72)}`);
console.log(`  "ferro scoperto"    (rimProtect < 58) ......... ${conta((t) => t.rimProtect < 58)}`);
console.log(`  "troppe bocche"     (usage totale > 372) ...... ${conta((t) => t.usageTotal > 372)}`);
console.log('');
