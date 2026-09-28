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
const { buildTeam, simSeriesUpTo, componiTabellone } = await import('../js/engine.js');
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

function playFullGame(seed, quante = 4) {
  const rng = makeRng(seed);
  let s = S.newGame(seed, 'host');

  // Lobby: entrano in quanti dice il chiamante, e la squadra gliela assegna il gioco.
  for (let i = 0; i < quante; i++) s = S.joinGame(s, 'u' + i, 'P' + i);
  if (Object.keys(s.seats).length !== quante) bad('non entrano tutti', `${Object.keys(s.seats).length} di ${quante}`);
  if (new Set(Object.values(s.seats)).size !== quante) bad('due giocatori hanno avuto la stessa squadra');
  // Quando sono tutte assegnate non si entra piu.
  if (quante === 4 && S.joinGame(s, 'intruso', 'X') !== undefined) bad('si entra anche a squadre esaurite');

  s = S.startAuction(s, tick());
  if (s.phase !== 'auction') bad('l\'asta non parte');
  const IN_GIOCO = S.attive(s);
  if (IN_GIOCO.length !== quante) bad('squadre in gioco sbagliate', `${IN_GIOCO.length} invece di ${quante}`);

  // Asta: ogni squadra rilancia con probabilita e prezzo casuali.
  let guard = 0;
  while (s.phase === 'auction' && guard++ < 5000) {
    const pid = S.currentPlayerId(s);
    if (!pid) break;

    const bidders = IN_GIOCO.filter((k) => S.slotsLeft(s, k) > 0);
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
    for (const k of IN_GIOCO) {
      const t = s.teams[k];
      if (t.credits < 0) bad('credito negativo', k);
      if (t.roster.length > ROSTER_SIZE) bad('rosa oltre i 5', k);
      if (new Set(t.roster).size !== t.roster.length) bad('giocatore duplicato nella stessa rosa', k);
      const left = ROSTER_SIZE - t.roster.length;
      if (left > 0 && t.credits < left) bad('regola di riserva violata', `${k}: ${t.credits} crediti per ${left} slot`);
    }
    const allOwned = IN_GIOCO.flatMap((k) => s.teams[k].roster);
    if (new Set(allOwned).size !== allOwned.length) bad('stesso giocatore a due squadre');
  }

  if (s.phase !== 'squadra') { bad('l\'asta non si e chiusa nelle squadre', `fase ${s.phase} dopo ${guard} lotti`); return null; }
  for (const k of IN_GIOCO) {
    if (s.teams[k].roster.length !== ROSTER_SIZE) bad('rosa incompleta a fine asta', k);
    const spent = START_CREDITS - s.teams[k].credits;
    const logged = s.auction.log.filter((l) => l.team === k).reduce((a, l) => a + l.price, 0);
    if (spent !== logged) bad('contabilita non torna', `${k}: ${spent} vs ${logged}`);
  }

  // Quintetti: completi e senza ripetizioni.
  if (!S.lineupsReady(s)) bad('quintetti incompleti');
  for (const k of IN_GIOCO) {
    const ids = SLOTS.map((sl) => s.lineups[k][sl]);
    if (new Set(ids).size !== 5) bad('stesso giocatore in due ruoli', k);
    if (ids.some((id) => !s.teams[k].roster.includes(id))) bad('in quintetto un giocatore non in rosa', k);
  }
  // Uno scambio non deve mai perdere un giocatore, e due scambi uguali
  // devono riportare il quintetto esattamente com'era.
  const prima = JSON.stringify(s.lineups[IN_GIOCO[0]]);
  s = S.swapSlots(s, IN_GIOCO[0], 'PG', 'C');
  if (new Set(SLOTS.map((sl) => s.lineups[IN_GIOCO[0]][sl])).size !== 5) bad('lo scambio ha perso un giocatore');
  s = S.swapSlots(s, IN_GIOCO[0], 'PG', 'C');
  if (JSON.stringify(s.lineups[IN_GIOCO[0]]) !== prima) bad('lo scambio non e reversibile');

  // Tattica.
  const strategies = Object.keys(STRATEGIES);
  for (const k of IN_GIOCO) {
    s = S.setTactics(s, k, { strategy: strategies[Math.floor(rng() * strategies.length)] });
  }
  if (!S.tacticsReady(s)) bad('tattica non pronta dopo l\'assegnazione automatica');
  // Due violini uguali vanno rifiutati.
  const v1 = s.tactics[IN_GIOCO[0]].v1;
  if (S.setTactics(s, IN_GIOCO[0], { v2: v1 }) !== s) bad('accettati due violini identici');

  // Playoff: la forma del tabellone dipende da quante squadre giocano.
  const T = {};
  for (const k of IN_GIOCO) T[k] = buildTeam(k, s.lineups[k], s.tactics[k]);
  const tab = componiTabellone(T, seed);
  const atteso = { 4: 'quattro', 3: 'tre', 2: 'due' }[quante];
  if (tab.tipo !== atteso) bad('tabellone sbagliato per il numero di squadre', `${tab.tipo} con ${quante}`);
  if (!tab.reasons?.length) bad('motivazioni mancanti');
  s = S.toPlayoffs(s, tab);

  // Ogni serie va avanti finche non si chiude, col suo passo.
  const chiudi = (which, passo) => {
    const m0 = s.po[which];
    if (!m0) return null;
    let r = null;
    for (let i = 0; i < 10; i++) {
      s = S.advanceSeries(s, which, passo);
      r = simSeriesUpTo(T[s.po[which].a], T[s.po[which].b], s.po[which].seed, s.po[which].gamesPlayed);
      if (r.done) break;
    }
    if (!r?.done) bad('serie che non si chiude', which);
    else {
      if (Math.max(r.wins.a, r.wins.b) !== 4) bad('serie non chiusa a 4 vittorie', which);
      if (r.games.length < 4 || r.games.length > 7) bad('numero di gare fuori range', `${which}: ${r.games.length}`);
      if (!r.mvp) bad('MVP mancante', which);
    }
    return r;
  };

  const r1 = chiudi('s1', S.PASSO_SEMI);
  const r2 = chiudi('s2', S.PASSO_SEMI);

  if (quante === 4) {
    const l1 = r1.winner === s.po.s1.a ? s.po.s1.b : s.po.s1.a;
    const l2 = r2.winner === s.po.s2.a ? s.po.s2.b : s.po.s2.a;
    s = S.openFinal(s, r1.winner, r2.winner, l1, l2);
  } else if (quante === 3) {
    if (!s.po.bye) bad('con tre squadre manca il bye');
    if (s.po.s2) bad('con tre squadre non ci devono essere due semifinali');
    s = S.openFinal(s, s.po.bye, r1.winner, null, null);
    if (s.po.third) bad('con tre squadre non ci deve essere la finalina');
  }
  // con due squadre la finale esiste gia da toPlayoffs

  const f = chiudi('final', S.PASSO_FINALE);
  if (f && f.games.length !== s.po.final.gamesPlayed) bad('gare simulate e contatore fuori sincrono');

  // Nessuna squadra puo giocare contro se stessa, mai.
  for (const w of ['s1', 's2', 'final', 'third']) {
    if (s.po[w] && s.po[w].a === s.po[w].b) bad('una squadra gioca contro se stessa', w);
  }
  if (quante === 4) {
    const finalisti = new Set([s.po.final.a, s.po.final.b]);
    if (finalisti.has(s.po.third.a) || finalisti.has(s.po.third.b)) bad('finalina con una finalista');
  }

  return { champion: f.winner, games: f.games.length, quante };
}

/* ---------- Esecuzione ---------- */

// Si gioca in 2, 3 o 4: ogni formato ha un tabellone diverso e va provato.
const PER_FORMATO = 80;
const champs = {};
const gareFinali = {};
const contate = {};

for (const quante of [4, 3, 2]) {
  for (let i = 0; i < PER_FORMATO; i++) {
    const r = playFullGame(`flow${quante}-${i}`, quante);
    if (!r) continue;
    champs[r.champion] = (champs[r.champion] || 0) + 1;
    gareFinali[quante] = (gareFinali[quante] || 0) + r.games;
    contate[quante] = (contate[quante] || 0) + 1;
  }
}

const totali = Object.values(contate).reduce((a, b) => a + b, 0);
console.log(`\n${totali} partite intere giocate (lobby → asta → squadre → playoff → campione)\n`);
for (const q of [4, 3, 2]) {
  console.log(`  con ${q} squadre: ${contate[q] || 0} partite, Finals da ${((gareFinali[q] || 0) / (contate[q] || 1)).toFixed(1)} gare di media`);
}
console.log('\n  Titoli vinti:', TEAM_KEYS.map((k) => `${k} ${champs[k] || 0}`).join('  '));

if (fails === 0) {
  console.log('Nessuna regola violata.\n');
} else {
  console.log(`${fails} violazioni, raggruppate:\n`);
  [...problems.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}x  ${k}`));
  console.log('');
}
process.exit(fails === 0 ? 0 : 1);
