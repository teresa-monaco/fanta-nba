// spread.mjs — diagnostica: quanto sono varie le valutazioni?
//
//   node tools/spread.mjs
//
// Non fallisce mai: serve a vedere se gli attributi sono schiacciati in alto
// e se il tetto a 99 sta tagliando via la varieta.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const { installData } = await import('../js/core.js');
const D = installData(readJson('data/players.json'), readJson('data/archetypes.json'));

const ATTR = { sco: 'Realizzazione', tre: 'Tiro da 3', pla: 'Playmaking', reb: 'Rimbalzi',
  dif: 'Protez. ferro', dpe: 'Difesa perim.', atl: 'Atletismo', usg: 'Palla richiesta' };

const istogramma = (vals, min, max, passo) => {
  const righe = [];
  for (let lo = min; lo < max; lo += passo) {
    const n = vals.filter((v) => v >= lo && v < lo + passo).length;
    const pct = (n / vals.length) * 100;
    righe.push(`   ${String(lo).padStart(3)}-${String(lo + passo - 1).padEnd(3)} ${'#'.repeat(Math.round(pct / 1.2)).padEnd(42)} ${pct.toFixed(1).padStart(5)}%  (${n})`);
  }
  return righe.join('\n');
};

/* 1. Gli overall scritti a mano */
const ovr = D.players.map((p) => p.ovr);
console.log(`\n1. OVERALL dei ${ovr.length} giocatori (scritti a mano in players.json)\n`);
console.log(istogramma(ovr, 85, 101, 2));
console.log(`\n   media ${(ovr.reduce((a, b) => a + b, 0) / ovr.length).toFixed(1)}  ·  mediana ${ovr.slice().sort((a, b) => a - b)[Math.floor(ovr.length / 2)]}`);

/* 2. Gli attributi derivati */
const tutti = [];
for (const p of D.players) for (const k of Object.keys(ATTR)) tutti.push(p.attrs[k]);
console.log(`\n2. ATTRIBUTI derivati (${tutti.length} valori: ${D.players.length} giocatori x 8)\n`);
console.log(istogramma(tutti, 30, 100, 10));
const media = tutti.reduce((a, b) => a + b, 0) / tutti.length;
console.log(`\n   media ${media.toFixed(1)}  ·  minimo ${Math.min(...tutti)}  ·  massimo ${Math.max(...tutti)}`);

/* 3. Quanto morde il tetto a 99 */
const a99 = tutti.filter((v) => v === 99).length;
const sopra90 = tutti.filter((v) => v >= 90).length;
const sotto70 = tutti.filter((v) => v < 70).length;
console.log(`\n3. COMPRESSIONE IN ALTO\n`);
console.log(`   valori esattamente a 99 (tetto) .... ${((a99 / tutti.length) * 100).toFixed(1)}%  (${a99})`);
console.log(`   valori 90 o superiori .............. ${((sopra90 / tutti.length) * 100).toFixed(1)}%`);
console.log(`   valori sotto 70 .................... ${((sotto70 / tutti.length) * 100).toFixed(1)}%`);

/* 4. Escursione dentro il singolo giocatore */
const escursioni = D.players.map((p) => {
  const v = Object.keys(ATTR).map((k) => p.attrs[k]);
  return Math.max(...v) - Math.min(...v);
});
console.log(`\n4. ESCURSIONE dentro un giocatore (massimo meno minimo)\n`);
console.log(`   media ${(escursioni.reduce((a, b) => a + b, 0) / escursioni.length).toFixed(1)} punti`);
console.log(`   giocatori con escursione sotto i 25 punti: ${((escursioni.filter((e) => e < 25).length / escursioni.length) * 100).toFixed(0)}%`);

/* 5. Tre esempi concreti */
console.log(`\n5. ESEMPI\n`);
for (const id of ['shaq', 'gobert', 'korver', 'draymond', 'curry']) {
  const p = D.byId[id];
  if (!p) continue;
  console.log(`   ${p.n} (${p.ovr} ovr, ${p.arc})`);
  console.log(`     ` + Object.entries(ATTR).map(([k, l]) => `${l.split(' ')[0]} ${p.attrs[k]}`).join(' · '));
}
console.log('');
