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
const { buildTeam, simSeriesUpTo, componiTabellone, costruisciBracket, formaTabellone } = await import('../js/engine.js');
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
  if (quante === TEAM_KEYS.length && S.joinGame(s, 'intruso', 'X') !== undefined) bad('si entra anche a squadre esaurite');

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

  // Playoff: il tabellone e generico, cambia solo il numero di turni.
  const T = {};
  for (const k of IN_GIOCO) T[k] = buildTeam(k, s.lineups[k], s.tactics[k]);
  const tab = componiTabellone(T, seed);
  const atteso = formaTabellone(quante);
  if (tab.serie.join(',') !== atteso.serie.join(',')) bad('forma del tabellone sbagliata', `${quante}: ${tab.serie}`);
  if (!tab.reasons?.length) bad('motivazioni mancanti');
  if (new Set(tab.ordine).size !== quante) bad('ordine del tabellone con ripetizioni');
  s = S.toPlayoffs(s, tab);

  // Si scopre turno per turno: ogni serie fino in fondo, poi il turno dopo.
  const totTurni = s.po.turni.length;
  let ultimo = null;
  for (let r = 0; r < totTurni; r++) {
    const passo = r === totTurni - 1 ? S.PASSO_FINALE : S.PASSO_SEMI;
    for (let i = 0; i < s.po.turni[r].length; i++) {
      let res = null;
      for (let k = 0; k < 10; k++) {
        s = S.advanceSeries(s, r, i, passo);
        const b = costruisciBracket(s.po, T);
        res = b[r][i].res;
        if (res?.done) break;
      }
      if (!res?.done) { bad('serie che non si chiude', `turno ${r} serie ${i}`); return null; }
      if (Math.max(res.wins.a, res.wins.b) !== 4) bad('serie non chiusa a 4 vittorie');
      if (res.games.length < 4 || res.games.length > 7) bad('numero di gare fuori range', String(res.games.length));
      if (!res.mvp) bad('MVP mancante');
      if (r === totTurni - 1 && i === 0) ultimo = res;
    }
  }

  const bracket = costruisciBracket(s.po, T);
  // Nessuno gioca contro se stesso, e nessuno compare due volte nello stesso turno.
  for (const round of bracket) {
    const visti = new Set();
    for (const m of round) {
      if (m.a === m.b) bad('una squadra gioca contro se stessa');
      for (const x of [m.a, m.b]) {
        if (visti.has(x)) bad('una squadra gioca due serie nello stesso turno');
        visti.add(x);
      }
    }
  }
  // Ogni squadra entra nel tabellone una volta sola.
  const primoTurno = new Set(bracket[0].flatMap((m) => [m.a, m.b]));
  const teste = new Set(s.po.ordine.slice(0, s.po.teste));
  if (primoTurno.size + teste.size !== quante) bad('qualcuno manca dal tabellone o e contato due volte');
  if (bracket[bracket.length - 1].length !== 1) bad('l\'ultimo turno non e una finale sola');

  return { champion: ultimo.winner, games: ultimo.games.length, quante, turni: totTurni };
}

/* ---------- Esecuzione ---------- */

// Si gioca in 2, 3 o 4: ogni formato ha un tabellone diverso e va provato.
const PER_FORMATO = 40;
const champs = {};
const gareFinali = {};
const contate = {};
const turniPer = {};

for (const quante of [2, 3, 4, 6, 8, 10]) {
  for (let i = 0; i < PER_FORMATO; i++) {
    const r = playFullGame(`flow${quante}-${i}`, quante);
    if (!r) continue;
    champs[r.champion] = (champs[r.champion] || 0) + 1;
    gareFinali[quante] = (gareFinali[quante] || 0) + r.games;
    contate[quante] = (contate[quante] || 0) + 1;
    turniPer[quante] = r.turni;
  }
}

const totali = Object.values(contate).reduce((a, b) => a + b, 0);
console.log(`\n${totali} partite intere giocate (lobby → asta → squadre → playoff → campione)\n`);
for (const q of [2, 3, 4, 6, 8, 10]) {
  console.log(`  con ${String(q).padStart(2)} squadre: ${String(contate[q] || 0).padStart(3)} partite, ${turniPer[q] || 0} turni, Finals da ${((gareFinali[q] || 0) / (contate[q] || 1)).toFixed(1)} gare`);
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
