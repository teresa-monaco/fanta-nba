// teste.mjs — quanto conta saltare il primo turno, per ogni formato.
//
//   node tools/teste.mjs
//
// Le teste di serie si sorteggiano, quindi il formato non premia chi e gia
// avanti. Ma qualcuno il primo turno lo salta e qualcuno no: qui si misura
// quanto quel salto vale in probabilita di vincere il torneo.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const { installData, makeRng, shuffle, STRATEGIES, TEAM_KEYS, NUMERI_SQUADRE } = await import('../js/core.js');
const D = installData(readJson('data/players.json'), readJson('data/archetypes.json'), readJson('data/coaches.json'));
const { buildTeam, simSeriesUpTo, componiTabellone, formaTabellone } = await import('../js/engine.js');
const { autoLineup } = await import('../js/state.js');

const STRAT = Object.keys(STRATEGIES);
// 400 tornei davano un errore di ±3 punti: abbastanza da far sembrare il
// formato a 6 il piu squilibrato quando il piu squilibrato e quello a 3.
// Una misura di equita che sbaglia l'ordine delle righe non serve a niente.
const N = 1500;

console.log('\nQUANTO VALE SALTARE IL PRIMO TURNO\n');
console.log('  n   con testa di serie   senza   vantaggio   (equita = stessa colonna)');
console.log('  ' + '-'.repeat(70));

for (const n of NUMERI_SQUADRE) {
  const f = formaTabellone(n);
  if (f.teste === 0) { console.log(`  ${String(n).padStart(2)}   nessuna testa di serie: tutte partono dallo stesso turno`); continue; }

  let titoliTeste = 0, titoliAltri = 0;

  for (let i = 0; i < N; i++) {
    const rng = makeRng(`teste${n}-${i}`);
    const pool = shuffle(D.players.map((p) => p.id), rng);
    const T = {};
    for (let j = 0; j < n; j++) {
      const roster = pool.slice(j * 5, j * 5 + 5);
      const ord = roster.map((id) => D.byId[id]).sort((a, b) => b.attrs.sco - a.attrs.sco);
      T[TEAM_KEYS[j]] = buildTeam(TEAM_KEYS[j], autoLineup(roster), {
        v1: ord[0].id, v2: ord[1].id, strategy: STRAT[Math.floor(rng() * STRAT.length)],
      });
    }
    const tab = componiTabellone(T, `teste${n}-${i}`);
    const teste = new Set(tab.ordine.slice(0, tab.teste));

    // Gioca il torneo fino in fondo.
    let campo = tab.ordine.slice(tab.teste);
    let vincitore = null;
    for (let r = 0; r < tab.serie.length; r++) {
      const prossimo = [];
      for (let m = 0; m * 2 < campo.length; m++) {
        const a = campo[m * 2], b = campo[m * 2 + 1];
        prossimo.push(simSeriesUpTo(T[a], T[b], `teste${n}-${i}:r${r}m${m}`, 7).winner);
      }
      campo = r === 0 ? [...tab.ordine.slice(0, tab.teste), ...prossimo] : prossimo;
      if (campo.length === 1) { vincitore = campo[0]; break; }
    }
    if (!vincitore) continue;
    if (teste.has(vincitore)) titoliTeste++; else titoliAltri++;
  }

  // Probabilita per singola squadra, non per gruppo: i gruppi hanno taglie diverse.
  const perTesta = titoliTeste / N / f.teste;
  const perAltra = titoliAltri / N / (n - f.teste);
  const vantaggio = (perTesta - perAltra) * 100;
  console.log(`  ${String(n).padStart(2)}   ${(perTesta * 100).toFixed(1).padStart(16)}%   ${(perAltra * 100).toFixed(1).padStart(5)}%` +
    `   ${(vantaggio >= 0 ? '+' : '') + vantaggio.toFixed(1)}`.padStart(11) +
    `   ${Math.abs(vantaggio) < 6 ? 'accettabile' : 'SQUILIBRATO'}`);
}
console.log('');
