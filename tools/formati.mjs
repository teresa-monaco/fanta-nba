// formati.mjs — che forma prende il tabellone per ogni numero di squadre.
//
//   node tools/formati.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const { installData, NUMERI_SQUADRE, ROSTER_SIZE } = await import('../js/core.js');
const D = installData(readJson('data/players.json'), readJson('data/archetypes.json'));
const { formaTabellone, nomeTurno } = await import('../js/engine.js');

console.log('\nFORMATI AMMESSI\n');
console.log('  n   teste   turni   serie   acquisti   struttura');
console.log('  ' + '-'.repeat(84));
for (const n of NUMERI_SQUADRE) {
  const f = formaTabellone(n);
  const nomi = f.serie.map((_, r) => nomeTurno(r, f.serie.length, f.teste > 0));
  const tot = f.serie.reduce((a, b) => a + b, 0);
  console.log(`  ${String(n).padStart(2)}   ${String(f.teste).padStart(5)}   ${String(f.serie.length).padStart(5)}` +
    `   ${String(tot).padStart(5)}   ${String(n * ROSTER_SIZE).padStart(8)}   ` +
    f.serie.map((s, i) => `${nomi[i]} (${s})`).join(' -> '));
}
console.log(`\n  Il pool ha ${D.players.length} giocatori: con 10 squadre se ne comprano ${10 * ROSTER_SIZE}.`);

// Quanto dura una serata, a spanne.
console.log('\nDURATA STIMATA\n');
console.log('  n    lotti   serie   minuti circa');
for (const n of NUMERI_SQUADRE) {
  const f = formaTabellone(n);
  const lotti = n * ROSTER_SIZE;
  const serie = f.serie.reduce((a, b) => a + b, 0);
  // ~22s a lotto con i rilanci, ~45s per scoprire una serie e leggerla
  const minuti = Math.round((lotti * 22 + serie * 45) / 60);
  console.log(`  ${String(n).padStart(2)}   ${String(lotti).padStart(5)}   ${String(serie).padStart(5)}   ${String(minuti).padStart(6)}`);
}
console.log('');
