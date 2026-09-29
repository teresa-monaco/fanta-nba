// audit-bug.mjs — caccia ai bug nei punti fragili, non nella strada felice.
//
//   node tools/audit-bug.mjs
//
// Gli altri test giocano partite normali. Questo prova i casi storti:
// il giro attraverso Firebase, l'azzeramento a meta partita, chi entra e
// chi esce, il numero di squadre sbagliato, l'albo che si riempie.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const { installData, makeRng, TEAM_KEYS, NUMERI_SQUADRE, STRATEGIES, ROSTER_SIZE } = await import('../js/core.js');
const D = installData(readJson('data/players.json'), readJson('data/archetypes.json'));
const { buildTeam, simSeriesUpTo, componiTabellone, costruisciBracket, formaTabellone,
  simStagione, giriStagione, tabelloneDaStagione } = await import('../js/engine.js');
const S = await import('../js/state.js');

let fails = 0;
const ok = (c, label, extra = '') => {
  console.log(`  ${c ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  if (!c) fails++;
};

let clock = 1e6;
const tick = () => (clock += 1000);

// Imita il giro attraverso il Realtime Database: via undefined, via i null,
// via gli array vuoti. E il punto dove lo stato si rompe in silenzio.
function giroFirebase(s) {
  const scrub = (v) => {
    if (v === undefined || v === null) return undefined;
    if (Array.isArray(v)) { const a = v.map(scrub).filter((x) => x !== undefined); return a.length ? a : undefined; }
    if (typeof v === 'object') {
      const o = {};
      for (const [k, val] of Object.entries(v)) { const x = scrub(val); if (x !== undefined) o[k] = x; }
      return Object.keys(o).length ? o : undefined;
    }
    return v;
  };
  return S.hydrate(JSON.parse(JSON.stringify(scrub(s) ?? {})));
}

function partitaFinoA(quante, fase, seed = 'bug') {
  const rng = makeRng(seed);
  let s = S.newGame(seed, 'host');
  for (let i = 0; i < quante; i++) s = S.joinGame(s, 'u' + i, 'P' + i);
  if (fase === 'lobby') return s;

  s = S.startAuction(s, tick());
  const IN = S.attive(s);
  if (fase === 'auction-inizio') return s;

  let g = 0;
  while (s.phase === 'auction' && g++ < 4000) {
    const k = IN.filter((t) => S.slotsLeft(s, t) > 0)[g % IN.length] || IN.find((t) => S.slotsLeft(s, t) > 0);
    if (!k) break;
    s = S.placeBid(s, k, Math.max(1, Math.min(S.maxBid(s, k), 1 + (g % 6))), tick());
    s = S.resolveLot(s, tick());
  }
  if (fase === 'squadra') return s;

  // La fotografia della stagione e la struttura piu fragile che passa dal
  // database: cinque slot per squadra, e il database i null li butta via.
  if (fase === 'stagione' || fase === 'stagione-playoff') {
    s = S.setFormato({ ...s, phase: 'lobby' }, true);
    s = { ...s, phase: 'squadra' };
    s = S.giocaStagione(s, giriStagione(quante));
    if (fase === 'stagione') return s;
    const Tst = {};
    for (const k of IN) Tst[k] = buildTeam(k, s.stagione.lineups[k], s.stagione.tactics[k]);
    const st = simStagione(Tst, IN, s.stagione.seedBase, s.stagione.giri);
    const Tp = {};
    for (const k of IN) Tp[k] = buildTeam(k, s.lineups[k], s.tactics[k]);
    s = S.toPlayoffs(s, tabelloneDaStagione(Tp, st.cls, seed));
    return { s, T: Tp, st };
  }

  const T = {};
  for (const k of IN) T[k] = buildTeam(k, s.lineups[k], s.tactics[k]);
  s = S.toPlayoffs(s, componiTabellone(T, seed));
  if (fase === 'playoff-inizio') return { s, T };

  // gioca tutto
  for (let r = 0; r < s.po.turni.length; r++) {
    for (let i = 0; i < s.po.turni[r].length; i++) {
      for (let k = 0; k < 10; k++) {
        s = S.advanceSeries(s, r, i, r === s.po.turni.length - 1 ? S.PASSO_FINALE : S.PASSO_SEMI);
        if (costruisciBracket(s.po, T)[r][i].res?.done) break;
      }
    }
  }
  return { s, T };
}

console.log('\n' + '='.repeat(70));
console.log('1. LO STATO SOPRAVVIVE AL GIRO ATTRAVERSO FIREBASE?');
console.log('='.repeat(70) + '\n');
for (const quante of NUMERI_SQUADRE) {
  for (const fase of ['lobby', 'auction-inizio', 'squadra', 'stagione', 'stagione-playoff', 'playoff-inizio', 'fine']) {
    const r = partitaFinoA(quante, fase, `fb${quante}${fase}`);
    const s = r.s || r;
    const dopo = giroFirebase(s);
    const T = r.T;
    let problema = null;
    if (dopo.phase !== s.phase) problema = `fase ${s.phase} -> ${dopo.phase}`;
    else if (S.attive(dopo).length !== S.attive(s).length) problema = 'squadre attive perse';
    else if (s.po) {
      if ((dopo.po?.turni || []).length !== s.po.turni.length) problema = 'turni persi';
      else if ((dopo.po?.ordine || []).length !== s.po.ordine.length) problema = 'ordine perso';
      else if (dopo.po.teste !== s.po.teste) problema = `teste ${s.po.teste} -> ${dopo.po.teste}`;
      else if (T) {
        const a = costruisciBracket(s.po, T), b = costruisciBracket(dopo.po, T);
        const key = (x) => x.map((rr) => rr.map((m) => `${m.a}v${m.b}:${m.gamesPlayed}`).join('|')).join('//');
        if (key(a) !== key(b)) problema = 'il tabellone cambia dopo il giro';
      }
    }
    // La classifica ricalcolata dopo il giro dal database deve essere identica:
    // se il database mangia uno slot del quintetto, la stagione si riscrive.
    if (!problema && s.stagione) {
      if (!dopo.stagione) problema = 'la fotografia della stagione si perde';
      else {
        const rifai = (x) => {
          const Tx = {};
          for (const k of S.attive(x)) Tx[k] = buildTeam(k, x.stagione.lineups[k], x.stagione.tactics[k]);
          return simStagione(Tx, S.attive(x), x.stagione.seedBase, x.stagione.giri)
            .cls.map((rr) => `${rr.k}:${rr.w}-${rr.l}`).join();
        };
        if (rifai(s) !== rifai(dopo)) problema = 'la classifica cambia dopo il giro';
      }
    }
    if (problema) { ok(false, `${quante} squadre, fase ${fase}`, problema); }
  }
}
ok(fails === 0, 'nessuno stato si rompe passando dal database', `${NUMERI_SQUADRE.length} formati x 7 fasi`);

console.log('\n' + '='.repeat(70));
console.log('2. NUMERI DI SQUADRE NON AMMESSI');
console.log('='.repeat(70) + '\n');
{
  for (const n of [0, 1, 5, 7, 9, 11]) {
    let s = S.newGame('inv' + n, 'host');
    for (let i = 0; i < n; i++) s = S.joinGame(s, 'u' + i, 'P' + i) || s;
    const r = S.startAuction(s, tick());
    ok(r === undefined, `con ${n} squadre l'asta NON parte`);
  }
  for (const n of NUMERI_SQUADRE) {
    let s = S.newGame('val' + n, 'host');
    for (let i = 0; i < n; i++) s = S.joinGame(s, 'u' + i, 'P' + i);
    ok(S.startAuction(s, tick())?.phase === 'auction', `con ${n} squadre l'asta parte`);
  }
  // Piu persone delle chiavi: entrano le prime 12 e la partita e valida.
  {
    let s = S.newGame('tredici', 'host');
    for (let i = 0; i < 13; i++) s = S.joinGame(s, 'u' + i, 'P' + i) || s;
    ok(Object.keys(s.seats).length === TEAM_KEYS.length, 'in tredici entrano solo i primi dodici');
    ok(S.startAuction(s, tick())?.phase === 'auction', 'e la partita parte comunque, in dodici');
  }

  // Oltre le chiavi disponibili non si entra.
  let pieno = S.newGame('pieno', 'host');
  for (let i = 0; i < TEAM_KEYS.length; i++) pieno = S.joinGame(pieno, 'u' + i, 'P' + i);
  ok(S.joinGame(pieno, 'extra', 'X') === undefined, `oltre ${TEAM_KEYS.length} squadre non si entra`);
}

console.log('\n' + '='.repeat(70));
console.log('3. AZZERARE A META PARTITA');
console.log('='.repeat(70) + '\n');
for (const fase of ['auction-inizio', 'squadra', 'playoff-inizio', 'fine']) {
  const r = partitaFinoA(4, fase, 'reset' + fase);
  const s = r.s || r;
  const dopo = S.resetGame(s, 'nuovo-seed');
  const problemi = [];
  if (dopo.phase !== 'lobby') problemi.push('non torna in lobby');
  if (dopo.po) problemi.push('playoff non cancellati');
  if (dopo.attive) problemi.push('squadre attive non azzerate');
  if (Object.keys(dopo.seats).length !== Object.keys(s.seats).length) problemi.push('sedie perse');
  if (TEAM_KEYS.some((k) => dopo.teams[k].credits !== 50 || dopo.teams[k].roster.length)) problemi.push('rose o crediti non azzerati');
  if (dopo.auction.running || dopo.auction.log.length) problemi.push('asta non azzerata');
  ok(!problemi.length, `azzerare durante "${fase}"`, problemi.join(', '));
}

console.log('\n' + '='.repeat(70));
console.log('4. CHI ENTRA E CHI ESCE');
console.log('='.repeat(70) + '\n');
{
  let s = S.newGame('inout', 'host');
  s = S.joinGame(s, 'a', 'Anna');
  s = S.joinGame(s, 'b', 'Bruno');
  s = S.joinGame(s, 'c', 'Carla');
  ok(S.attive(s).length === 3, 'tre dentro');
  const squadraB = s.seats.b;
  s = S.leaveSeat(s, 'b');
  ok(S.attive(s).length === 2 && !s.names.b, 'chi esce libera squadra e nome');
  s = S.joinGame(s, 'd', 'Dario');
  ok(s.seats.d === squadraB, 'chi entra dopo riprende la squadra liberata', squadraB);
  // Rientrare con lo stesso uid rinomina, non ruba una seconda squadra.
  const prima = Object.keys(s.seats).length;
  s = S.joinGame(s, 'a', 'Anna Maria');
  ok(Object.keys(s.seats).length === prima && s.names.a === 'Anna Maria',
    'rientrare cambia solo il nome, non assegna una seconda squadra');
}

console.log('\n' + '='.repeat(70));
console.log('5. ALBO D\'ORO SU PIU PARTITE');
console.log('='.repeat(70) + '\n');
{
  let s = S.newGame('albo', 'host');
  for (let i = 0; i < 4; i++) s = S.joinGame(s, 'u' + i, 'P' + i);
  for (let partita = 0; partita < 3; partita++) {
    const voce = { seed: `s${partita}`, quando: Date.now(), champion: TEAM_KEYS[partita % 4],
      championName: 'X', runnerUp: TEAM_KEYS[(partita + 1) % 4], runnerUpName: 'Y', wins: '4-2', mvp: 'Tizio', roster: [] };
    const n1 = S.recordAlbo(s, voce);
    ok(n1 !== undefined, `partita ${partita + 1} entra nell'albo`);
    s = n1;
    ok(S.recordAlbo(s, voce) === undefined, `partita ${partita + 1} non entra due volte`);
    s = S.resetGame(s, 'seed' + partita);
  }
  ok(s.albo.length === 3, 'tre partite nell\'albo dopo tre azzeramenti', `${s.albo.length}`);
  const cl = S.classifica(s);
  ok(cl.reduce((a, t) => a + t.titoli, 0) === 3, 'la classifica conta tre titoli');
  ok(cl.reduce((a, t) => a + t.finali, 0) === 6, 'e sei finali giocate');
  ok(giroFirebase(s).albo.length === 3, 'l\'albo sopravvive al giro dal database');
}

console.log('\n' + '='.repeat(70));
console.log('6. IL TABELLONE E SEMPRE COERENTE');
console.log('='.repeat(70) + '\n');
for (const n of NUMERI_SQUADRE) {
  const problemi = new Set();
  for (let i = 0; i < 60; i++) {
    const { s, T } = partitaFinoA(n, 'fine', `coe${n}-${i}`);
    const b = costruisciBracket(s.po, T);
    const f = formaTabellone(n);
    if (b.length !== f.serie.length) problemi.add('numero di turni sbagliato');
    if (b[b.length - 1].length !== 1) problemi.add('ultimo turno non e una finale');
    // Tutte le squadre entrano, una volta sola.
    const entrate = new Set([...s.po.ordine.slice(0, s.po.teste), ...b[0].flatMap((m) => [m.a, m.b])]);
    if (entrate.size !== n) problemi.add('qualcuno manca dal tabellone');
    // Ogni turno ha esattamente i vincitori del precedente (piu le teste al turno 1).
    for (let r = 1; r < b.length; r++) {
      const attesi = new Set([...(r === 1 ? s.po.ordine.slice(0, s.po.teste) : []), ...b[r - 1].map((m) => m.res.winner)]);
      const presenti = new Set(b[r].flatMap((m) => [m.a, m.b]));
      if (attesi.size !== presenti.size || [...attesi].some((x) => !presenti.has(x))) problemi.add(`turno ${r} con partecipanti sbagliati`);
    }
    // Chi perde non gioca piu.
    const eliminati = new Set();
    for (const round of b) for (const m of round) {
      if (eliminati.has(m.a) || eliminati.has(m.b)) problemi.add('una squadra eliminata rigioca');
      eliminati.add(m.res.winner === m.a ? m.b : m.a);
    }
  }
  ok(problemi.size === 0, `${String(n).padStart(2)} squadre, 60 tornei`, [...problemi].join('; '));
}

console.log('\n' + (fails === 0 ? 'Nessun bug trovato.\n' : `${fails} problemi.\n`));
process.exit(fails === 0 ? 0 : 1);
