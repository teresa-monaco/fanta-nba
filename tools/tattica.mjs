// tattica.mjs — le scelte tecniche contano, e contano il giusto?
//
//   node tools/tattica.mjs
//
// Non fallisce mai: e una diagnostica. Tre domande.
//   1. Il ritmo cambia qualcosa, e in che direzione?
//   2. Gli allenatori sono bilanciati, o ce n'e uno che vince sempre?
//   3. Quanto pesa ogni scelta rispetto alle altre? (la gerarchia e giusta?)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const { installData, makeRng, shuffle, STRATEGIES, TEAM_KEYS, allenatoriDi } = await import('../js/core.js');
const D = installData(readJson('data/players.json'), readJson('data/archetypes.json'), readJson('data/coaches.json'));
const { buildTeam, simGame, matchup, RITMI } = await import('../js/engine.js');
const { autoLineup } = await import('../js/state.js');

const STRAT = Object.keys(STRATEGIES);
const RIT = Object.keys(RITMI);
const N = 2500;

// Due rose disgiunte dallo stesso mazzo: senza questo la stessa stella
// finirebbe in tutte e due le squadre e il confronto non direbbe niente.
function dueRose(i) {
  const rng = makeRng(`tat-${i}`);
  const pool = shuffle(D.players.map((p) => p.id), rng);
  return [pool.slice(0, 5), pool.slice(5, 10)];
}

function squadra(key, roster, patch = {}) {
  const ord = roster.map((id) => D.byId[id]).sort((a, b) => b.attrs.sco - a.attrs.sco);
  return buildTeam(key, autoLineup(roster), {
    v1: ord[0].id, v2: ord[1].id, strategy: 'equilibrato', ritmo: 'medio', coach: null, ...patch,
  });
}

function duello(i, pa, pb) {
  const [ra, rb] = dueRose(i);
  const A = squadra(TEAM_KEYS[0], ra, pa);
  const B = squadra(TEAM_KEYS[1], rb, pb);
  const m = matchup(A, B);
  const g = simGame(A, B, m, makeRng(`tat-${i}:g`), { homeIsA: i % 2 === 0 });
  return { vinceA: g.scoreA > g.scoreB, poss: m.pace, pts: g.scoreA + g.scoreB };
}

/* ---------- 1. Il ritmo ---------- */

console.log(`\n1. IL RITMO CAMBIA QUALCOSA?   (${N} partite per riga, avversario a ritmo medio)\n`);
console.log('   ritmo          vittorie   possessi   punti totali');
console.log('  ' + '-'.repeat(56));
const baseRitmo = {};
for (const r of RIT) {
  let v = 0, poss = 0, pts = 0;
  for (let i = 0; i < N; i++) {
    const d = duello(i, { ritmo: r }, { ritmo: 'medio' });
    if (d.vinceA) v++;
    poss += d.poss; pts += d.pts;
  }
  baseRitmo[r] = v / N * 100;
  console.log(`  ${RITMI[r].label.padEnd(14)} ${(v / N * 100).toFixed(1).padStart(7)}%   ${(poss / N).toFixed(1).padStart(8)}   ${(pts / N).toFixed(0).padStart(12)}`);
}
const spreadRitmo = Math.max(...Object.values(baseRitmo)) - Math.min(...Object.values(baseRitmo));
console.log(`\n  Scarto fra il ritmo migliore e il peggiore: ${spreadRitmo.toFixed(1)} punti di vittorie.`);
console.log('  Se fosse vicino a zero il ritmo sarebbe una scelta finta (era cosi col modello');
console.log('  simmetrico +3 difesa / -3 attacco: 51.0% contro 51.1%, indistinguibili).');

/* ---------- 2. Il ritmo giusto dipende dalla rosa? ---------- */

console.log(`\n2. IL RITMO GIUSTO DIPENDE DALLA ROSA?\n`);
console.log('   Per ogni rosa si prova ogni ritmo e si guarda quale vince di piu.');
console.log('   Se vincesse sempre lo stesso, non sarebbe una scelta ma una regola.\n');
{
  const migliore = {};
  const M = 600;
  for (let i = 0; i < M; i++) {
    let best = null;
    for (const r of RIT) {
      // Piu ripetizioni sulla stessa rosa: serve il segnale, non il rumore.
      let v = 0;
      for (let j = 0; j < 14; j++) {
        const [ra, rb] = dueRose(i);
        const A = squadra(TEAM_KEYS[0], ra, { ritmo: r });
        const B = squadra(TEAM_KEYS[1], rb, { ritmo: RIT[j % RIT.length] });
        const g = simGame(A, B, matchup(A, B), makeRng(`best-${i}-${r}-${j}`), { homeIsA: j % 2 === 0 });
        if (g.scoreA > g.scoreB) v++;
      }
      if (!best || v > best.v) best = { r, v };
    }
    migliore[best.r] = (migliore[best.r] || 0) + 1;
  }
  for (const r of RIT) {
    const q = (migliore[r] || 0) / M * 100;
    console.log(`  ${RITMI[r].label.padEnd(14)} e il migliore per il ${q.toFixed(0).padStart(2)}% delle rose  ${'#'.repeat(Math.round(q / 2))}`);
  }
  console.log('\n  Una ripartizione piatta al 25% direbbe che il ritmo e indifferente;');
  console.log('  una al 100% su uno solo che c\'e una risposta giusta e basta.');
}

/* ---------- 3. Gli allenatori ---------- */

console.log(`\n3. GLI ALLENATORI SONO BILANCIATI?   (${N} partite per riga)\n`);
console.log('   archetipo      vittorie   scarto da "senza allenatore"');
console.log('  ' + '-'.repeat(60));
{
  const archi = Object.keys(readJson('data/coaches.json').archetipi);
  // Un allenatore per archetipo, sempre disponibile: qui si misura l'effetto,
  // non lo sblocco. Si forza il coach ignorando il vincolo della rosa.
  const unoPer = {};
  for (const c of D.coaches) if (!unoPer[c.arc]) unoPer[c.arc] = c.id;

  let senza = 0;
  for (let i = 0; i < N; i++) if (duello(i, {}, {}).vinceA) senza++;
  const base = senza / N * 100;
  console.log(`  ${'(nessuno)'.padEnd(14)} ${base.toFixed(1).padStart(7)}%`);

  const val = {};
  for (const a of archi) {
    let v = 0;
    for (let i = 0; i < N; i++) if (duello(i, { coach: unoPer[a] }, {}).vinceA) v++;
    val[a] = v / N * 100;
    const d = val[a] - base;
    console.log(`  ${a.padEnd(14)} ${val[a].toFixed(1).padStart(7)}%   ${(d >= 0 ? '+' : '') + d.toFixed(1)}`);
  }
  const sp = Math.max(...Object.values(val)) - Math.min(...Object.values(val));
  console.log(`\n  Scarto fra il migliore e il peggiore: ${sp.toFixed(1)} punti.`);
  console.log('  Serve che sia diverso da zero (altrimenti la scelta non conta) ma piu');
  console.log('  piccolo di quello delle strategie: l\'allenatore e un contorno, non il piatto.');
}

/* ---------- 3b. L'allenatore giusto dipende dalla rosa? ---------- */

console.log(`\n3b. L'ALLENATORE GIUSTO DIPENDE DALLA ROSA?\n`);
{
  const archi = {};
  for (const c of D.coaches) if (!archi[c.arc]) archi[c.arc] = c.id;
  const nomi = Object.keys(archi);
  const migliore = {};
  const M = 500;
  for (let i = 0; i < M; i++) {
    let best = null;
    for (const a of nomi) {
      let v = 0;
      for (let j = 0; j < 12; j++) {
        const [ra, rb] = dueRose(i);
        const A = squadra(TEAM_KEYS[0], ra, { coach: archi[a] });
        const B = squadra(TEAM_KEYS[1], rb, {});
        const g = simGame(A, B, matchup(A, B), makeRng(`bc-${i}-${a}-${j}`), { homeIsA: j % 2 === 0 });
        if (g.scoreA > g.scoreB) v++;
      }
      if (!best || v > best.v) best = { a, v };
    }
    migliore[best.a] = (migliore[best.a] || 0) + 1;
  }
  for (const a of nomi) {
    const q = (migliore[a] || 0) / M * 100;
    console.log(`  ${a.padEnd(12)} e il migliore per il ${String(q.toFixed(0)).padStart(2)}% delle rose  ${'#'.repeat(Math.round(q))}`);
  }
  console.log('\n  Con dieci archetipi il caso puro darebbe 10% a testa: serve che nessuno');
  console.log('  stia vicino a zero (inutile) ne sopra il 30% (risposta giusta e basta).');
}

/* ---------- 4. Quanti allenatori sblocca una rosa vera ---------- */

console.log(`\n4. QUANTI ALLENATORI SBLOCCA UNA ROSA?\n`);
{
  const conta = {};
  const M = 4000;
  let archiDiversi = 0;
  for (let i = 0; i < M; i++) {
    const [ra] = dueRose(i);
    const libs = allenatoriDi(ra);
    conta[libs.length] = (conta[libs.length] || 0) + 1;
    archiDiversi += new Set(libs.map((c) => c.arc)).size;
  }
  for (const n of Object.keys(conta).sort()) {
    const q = conta[n] / M * 100;
    console.log(`  ${n} allenatori: ${q.toFixed(1).padStart(5)}%  ${'#'.repeat(Math.round(q / 2))}`);
  }
  console.log(`\n  Identita tattiche diverse fra cui scegliere, in media: ${(archiDiversi / M).toFixed(2)}.`);
  console.log('  Sotto le 2 la scelta sarebbe finta per troppe rose.');
}

/* ---------- 5. La gerarchia delle scelte ---------- */

console.log(`\n5. QUANTO PESA OGNI SCELTA (scarto fra la migliore e la peggiore)\n`);
{
  const prova = (nome, valori, mk) => {
    const res = valori.map((v) => {
      let w = 0;
      for (let i = 0; i < N; i++) if (duello(i, mk(v), {}).vinceA) w++;
      return w / N * 100;
    });
    const sp = Math.max(...res) - Math.min(...res);
    console.log(`  ${nome.padEnd(22)} ${sp.toFixed(1).padStart(5)} punti`);
    return sp;
  };
  const archi = {};
  for (const c of D.coaches) if (!archi[c.arc]) archi[c.arc] = c.id;
  prova('strategia offensiva', STRAT, (v) => ({ strategy: v }));
  prova('allenatore', Object.values(archi), (v) => ({ coach: v }));
  prova('ritmo', RIT, (v) => ({ ritmo: v }));
  console.log('\n  La gerarchia sensata: strategia sopra tutto, allenatore e ritmo sotto.');
  console.log('  Se l\'allenatore superasse la strategia, la serata la deciderebbe chi ha');
  console.log('  pescato il nome giusto all\'asta invece di chi ha scelto meglio.');
}

console.log('');
