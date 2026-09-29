// audit-gioco.mjs — le scelte che il gioco chiede di fare contano davvero?
//
//   node tools/audit-gioco.mjs
//
// Non guarda il codice, guarda il GIOCO: se una strategia domina, se una
// forma di rosa e sempre giusta, se scegliere il primo violino sposta
// qualcosa. Una scelta che non cambia il risultato e una schermata sprecata.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const { installData, makeRng, shuffle, STRATEGIES, TEAM_KEYS } = await import('../js/core.js');
const D = installData(readJson('data/players.json'), readJson('data/archetypes.json'), readJson('data/coaches.json'));
const { buildTeam, simSeries, matchup, simGame } = await import('../js/engine.js');
const { autoLineup } = await import('../js/state.js');

const STRAT = Object.keys(STRATEGIES);
const pct = (n, t) => ((n / t) * 100).toFixed(1).padStart(5) + '%';

/* helper: costruisce una squadra da una lista di id */
function squadra(key, ids, strategia, v1i = 0, v2i = 1) {
  const lineup = autoLineup(ids);
  const ord = ids.map((id) => D.byId[id]).sort((a, b) => b.attrs.sco - a.attrs.sco);
  return buildTeam(key, lineup, { v1: ord[v1i].id, v2: ord[v2i].id, strategy: strategia });
}

/* helper: 5 giocatori pescati in una fascia di overall */
function rosa(rng, fasce) {
  return fasce.map((f) => {
    const cand = D.players.filter((p) => p.ovr >= f[0] && p.ovr <= f[1]);
    return cand[Math.floor(rng() * cand.length)].id;
  });
}

/* helper: quante serie vince A su B */
function scontro(A, B, n, seed) {
  let w = 0;
  for (let i = 0; i < n; i++) if (simSeries(A, B, `${seed}:${i}`).winner === A.key) w++;
  return w;
}

console.log('\n' + '='.repeat(72));
console.log('1. LE UNDICI STRATEGIE SONO BILANCIATE?');
console.log('='.repeat(72));
console.log('\n  Stessa identica squadra, sola cosa che cambia: la strategia.');
console.log('  400 confronti per strategia contro avversari casuali.\n');
{
  const vinte = Object.fromEntries(STRAT.map((s) => [s, 0]));
  const tot = Object.fromEntries(STRAT.map((s) => [s, 0]));
  for (let i = 0; i < 400; i++) {
    const rng = makeRng('bal' + i);
    const pool = shuffle(D.players.map((p) => p.id), rng);
    const mia = pool.slice(0, 5), sua = pool.slice(5, 10);
    const B = squadra(TEAM_KEYS[1], sua, STRAT[Math.floor(rng() * STRAT.length)]);
    for (const s of STRAT) {
      const A = squadra(TEAM_KEYS[0], mia, s);
      tot[s]++;
      if (simSeries(A, B, 'st' + i).winner === A.key) vinte[s]++;
    }
  }
  const righe = STRAT.map((s) => [STRATEGIES[s].label, vinte[s] / tot[s]]).sort((a, b) => b[1] - a[1]);
  for (const [l, v] of righe) {
    const barre = '#'.repeat(Math.round(v * 60));
    console.log(`  ${l.padEnd(24)} ${(v * 100).toFixed(1).padStart(5)}%  ${barre}`);
  }
  const sp = (righe[0][1] - righe[righe.length - 1][1]) * 100;
  console.log(`\n  Forbice fra la migliore e la peggiore: ${sp.toFixed(1)} punti di vittorie.`);
  console.log(`  ${sp < 8 ? 'Bilanciate: nessuna scelta ovvia.' : sp < 20 ? 'Squilibrio percepibile.' : 'SQUILIBRIO GRAVE: una strategia domina.'}`);
}

console.log('\n' + '='.repeat(72));
console.log('2. QUANTO VALE SCEGLIERE BENE LA STRATEGIA?');
console.log('='.repeat(72));
console.log('\n  Contro un avversario NOTO: quanto guadagni a scegliere la');
console.log('  strategia migliore invece della peggiore, o di una a caso?\n');
{
  let miglior = 0, peggior = 0, media = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    const rng = makeRng('sc' + i);
    const pool = shuffle(D.players.map((p) => p.id), rng);
    const mia = pool.slice(0, 5), sua = pool.slice(5, 10);
    const B = squadra(TEAM_KEYS[1], sua, STRAT[Math.floor(rng() * STRAT.length)]);
    const esiti = STRAT.map((s) => {
      const A = squadra(TEAM_KEYS[0], mia, s);
      return scontro(A, B, 9, `s${i}${s}`) / 9;
    });
    miglior += Math.max(...esiti);
    peggior += Math.min(...esiti);
    media += esiti.reduce((a, b) => a + b, 0) / esiti.length;
    n++;
  }
  console.log(`  scegliendo la strategia MIGLIORE ....... ${(miglior / n * 100).toFixed(1)}% di serie vinte`);
  console.log(`  scegliendo a caso ...................... ${(media / n * 100).toFixed(1)}%`);
  console.log(`  scegliendo la PEGGIORE ................. ${(peggior / n * 100).toFixed(1)}%`);
  const g = (miglior - peggior) / n * 100;
  console.log(`\n  Scarto fra la scelta migliore e la peggiore: ${g.toFixed(1)} punti.`);
  console.log(`  ${g < 10 ? 'La schermata tattica conta POCO: e quasi decorativa.' : g < 25 ? 'Conta, ma non decide.' : 'Conta molto: puo ribaltare una serie.'}`);
}

console.log('\n' + '='.repeat(72));
console.log('3. CHE FORMA DI ROSA CONVIENE COMPRARE?');
console.log('='.repeat(72));
console.log('\n  Tutte con 5 giocatori. Round robin, 200 scontri per coppia.\n');
{
  const FORME = {
    'Una superstar + 4 gregari': [[97, 100], [85, 86], [85, 86], [85, 86], [85, 86]],
    'Due stelle + 3 gregari':    [[93, 95], [93, 95], [85, 86], [85, 86], [85, 86]],
    'Tre buoni + 2 gregari':     [[90, 92], [90, 92], [90, 92], [85, 86], [85, 86]],
    'Cinque equilibrati':        [[88, 90], [88, 90], [88, 90], [88, 90], [88, 90]],
  };
  const nomi = Object.keys(FORME);
  const punti = Object.fromEntries(nomi.map((n) => [n, 0]));
  const partite = Object.fromEntries(nomi.map((n) => [n, 0]));
  const sommaOvr = Object.fromEntries(nomi.map((n) => [n, 0]));
  let campioni = 0;

  for (let i = 0; i < 200; i++) {
    const rng = makeRng('forma' + i);
    const sq = {};
    nomi.forEach((n, k) => {
      const ids = rosa(rng, FORME[n]);
      sommaOvr[n] += ids.reduce((s, id) => s + D.byId[id].ovr, 0);
      sq[n] = squadra(TEAM_KEYS[k], ids, STRAT[Math.floor(rng() * STRAT.length)]);
    });
    campioni++;
    for (let a = 0; a < nomi.length; a++) {
      for (let b = a + 1; b < nomi.length; b++) {
        const A = sq[nomi[a]], B = sq[nomi[b]];
        partite[nomi[a]]++; partite[nomi[b]]++;
        if (simSeries(A, B, `f${i}-${a}-${b}`).winner === A.key) punti[nomi[a]]++;
        else punti[nomi[b]]++;
      }
    }
  }
  const ord = nomi.map((n) => [n, punti[n] / partite[n], sommaOvr[n] / campioni]).sort((a, b) => b[1] - a[1]);
  console.log('  forma della rosa                 vittorie   somma overall media');
  for (const [n, v, o] of ord) {
    console.log(`  ${n.padEnd(30)} ${(v * 100).toFixed(1).padStart(5)}%      ${o.toFixed(0)}`);
  }
  const sp = (ord[0][1] - ord[ord.length - 1][1]) * 100;
  console.log(`\n  Forbice: ${sp.toFixed(1)} punti.`);
  console.log(`  ${sp < 10 ? 'Nessuna forma domina: l asta ha scelte vere.' : 'Una forma e chiaramente migliore: l asta ha una risposta giusta.'}`);
}

console.log('\n' + '='.repeat(72));
console.log('4. SCEGLIERE I VIOLINI CONTA?');
console.log('='.repeat(72));
{
  let giusto = 0, sbagliato = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    const rng = makeRng('vi' + i);
    const pool = shuffle(D.players.map((p) => p.id), rng);
    const mia = pool.slice(0, 5), sua = pool.slice(5, 10);
    const s = STRAT[Math.floor(rng() * STRAT.length)];
    const B = squadra(TEAM_KEYS[1], sua, STRAT[Math.floor(rng() * STRAT.length)]);
    giusto += scontro(squadra(TEAM_KEYS[0], mia, s, 0, 1), B, 7, 'g' + i) / 7;
    sbagliato += scontro(squadra(TEAM_KEYS[0], mia, s, 4, 3), B, 7, 'g' + i) / 7;
    n++;
  }
  console.log(`\n  primo violino = miglior realizzatore .... ${(giusto / n * 100).toFixed(1)}% di serie vinte`);
  console.log(`  primo violino = PEGGIOR realizzatore .... ${(sbagliato / n * 100).toFixed(1)}%`);
  const g = (giusto - sbagliato) / n * 100;
  console.log(`\n  Scarto: ${g.toFixed(1)} punti.`);
  console.log(`  ${g < 5 ? 'Quasi ininfluente: la scelta e finta.' : g < 15 ? 'Conta un po.' : 'Scelta pesante.'}`);
}

console.log('\n' + '='.repeat(72));
console.log('5. IL QUINTETTO (CHI GIOCA DOVE) CONTA?');
console.log('='.repeat(72));
{
  let auto = 0, pessimo = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    const rng = makeRng('q' + i);
    const pool = shuffle(D.players.map((p) => p.id), rng);
    const mia = pool.slice(0, 5), sua = pool.slice(5, 10);
    const s = STRAT[Math.floor(rng() * STRAT.length)];
    const B = squadra(TEAM_KEYS[1], sua, STRAT[Math.floor(rng() * STRAT.length)]);

    const A1 = squadra(TEAM_KEYS[0], mia, s);
    // quintetto al contrario: ogni giocatore nel ruolo piu lontano possibile
    const SL = ['PG', 'SG', 'SF', 'PF', 'C'];
    const perTaglia = mia.map((id) => D.byId[id]).sort((a, b) => D.positionSize[a.pos] - D.positionSize[b.pos]);
    const lu = {}; SL.forEach((sl, k) => { lu[sl] = perTaglia[4 - k].id; });
    const ord = mia.map((id) => D.byId[id]).sort((a, b) => b.attrs.sco - a.attrs.sco);
    const A2 = buildTeam(TEAM_KEYS[0], lu, { v1: ord[0].id, v2: ord[1].id, strategy: s });

    auto += scontro(A1, B, 7, 'q' + i) / 7;
    pessimo += scontro(A2, B, 7, 'q' + i) / 7;
    n++;
  }
  console.log(`\n  quintetto assegnato bene ................ ${(auto / n * 100).toFixed(1)}% di serie vinte`);
  console.log(`  quintetto ribaltato (tutti fuori ruolo) . ${(pessimo / n * 100).toFixed(1)}%`);
  const g = (auto - pessimo) / n * 100;
  console.log(`\n  Scarto: ${g.toFixed(1)} punti.`);
  console.log(`  ${g < 5 ? 'Il quintetto non conta: la schermata e inutile.' : 'Il quintetto conta.'}`);
  console.log('  NOTA: l app assegna gia il quintetto ottimo da sola. Se la differenza');
  console.log('  e grande, il giocatore non ha modo di sbagliare — ne di essere bravo.');
}

console.log('\n' + '='.repeat(72));
console.log('6. QUANTO DECIDE LA ROSA, QUANTO IL CASO');
console.log('='.repeat(72));
{
  let vinceMigliore = 0, n = 0;
  const gap = [];
  for (let i = 0; i < 600; i++) {
    const rng = makeRng('luck' + i);
    const pool = shuffle(D.players.map((p) => p.id), rng);
    const A = squadra(TEAM_KEYS[0], pool.slice(0, 5), STRAT[Math.floor(rng() * STRAT.length)]);
    const B = squadra(TEAM_KEYS[1], pool.slice(5, 10), STRAT[Math.floor(rng() * STRAT.length)]);
    const fav = (A.off + A.def) >= (B.off + B.def) ? A.key : B.key;
    gap.push(Math.abs((A.off + A.def) - (B.off + B.def)));
    if (simSeries(A, B, 'l' + i).winner === fav) vinceMigliore++;
    n++;
  }
  console.log(`\n  la squadra sulla carta migliore vince nel ${(vinceMigliore / n * 100).toFixed(1)}% delle serie`);
  console.log(`  divario medio di forza: ${(gap.reduce((a, b) => a + b, 0) / gap.length).toFixed(1)} punti di rating`);
  const p = vinceMigliore / n;
  console.log(`\n  ${p > 0.85 ? 'Troppo deterministico: chi vince l asta ha gia vinto.' : p > 0.62 ? 'Equilibrio sano: la rosa conta, ma non basta.' : 'Troppo caotico: l asta conta poco.'}`);
}
console.log('');
