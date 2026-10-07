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
const D = installData(readJson('data/players.json'), readJson('data/archetypes.json'), readJson('data/coaches.json'));
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
        s = S.advanceSeries(s, r, i, S.PASSO_GARA);
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
console.log('1b. SALTARE UN GIOCATORE');
console.log('='.repeat(70) + '\n');
{
  const nuova = () => {
    let s = S.newGame('skip', 'host');
    for (let i = 0; i < 4; i++) s = S.joinGame(s, 'u' + i, 'P' + i);
    return S.startAuction(s, tick(), S.attive(s));
  };

  // Un voto solo non basta: serve l'accordo di tutti quelli che possono comprare.
  {
    let s = nuova();
    const [a, b] = S.attive(s);
    const prima = S.currentPlayerId(s);
    s = S.votaSkip(s, a, tick());
    ok(S.currentPlayerId(s) === prima, 'un voto solo non salta il giocatore');
    ok(Object.keys(s.auction.skipVoti).length === 1, 'ma il voto resta registrato');
    s = S.votaSkip(s, a, tick());
    ok(Object.keys(s.auction.skipVoti).length === 0, 'e si puo ritirare');
  }

  // Unanimita: salta, e ne consuma uno dei tre.
  {
    let s = nuova();
    const prima = S.currentPlayerId(s);
    for (const k of S.puoVotare(s)) s = S.votaSkip(s, k, tick());
    ok(S.currentPlayerId(s) !== prima, 'con tutti d\'accordo il giocatore salta');
    ok(s.auction.skipUsati === 1, 'e se ne consuma uno', `usati ${s.auction.skipUsati}`);
    ok(Object.keys(s.auction.skipVoti).length === 0, 'i voti si azzerano sul lotto nuovo');
    ok(s.auction.unsold.includes(prima), 'e il giocatore finisce fra i non venduti');
  }

  // Tre e poi basta.
  {
    let s = nuova();
    for (let giro = 0; giro < S.MAX_SKIP; giro++) {
      for (const k of S.puoVotare(s)) s = S.votaSkip(s, k, tick());
    }
    ok(s.auction.skipUsati === S.MAX_SKIP, `si arriva a ${S.MAX_SKIP} skip`);
    ok(S.skipRimasti(s) === 0, 'e poi non ne restano');
    const rifiutato = S.votaSkip(s, S.puoVotare(s)[0], tick());
    ok(rifiutato === undefined, 'il quarto voto viene rifiutato');
  }

  // Finiti gli skip, il tempo che scade NON fa passare il giocatore.
  {
    let s = nuova();
    for (let giro = 0; giro < S.MAX_SKIP; giro++) {
      for (const k of S.puoVotare(s)) s = S.votaSkip(s, k, tick());
    }
    const pid = S.currentPlayerId(s);
    const rosePrima = S.attive(s).reduce((a, k) => a + s.teams[k].roster.length, 0);
    s = S.resolveLot(s, tick());   // nessuna offerta
    const roseDopo = S.attive(s).reduce((a, k) => a + s.teams[k].roster.length, 0);
    ok(roseDopo === rosePrima + 1, 'senza offerte il giocatore viene assegnato d\'ufficio');
    ok(!s.auction.unsold.includes(pid), 'e non finisce fra i non venduti');
    const chi = S.attive(s).find((k) => s.teams[k].roster.includes(pid));
    ok(!!chi && 50 - s.teams[chi].credits === 1, 'al prezzo minimo', chi);
  }

  // Chi ha la rosa piena non deve votare: non potrebbe comprarlo comunque.
  {
    let s = nuova();
    const [a] = S.attive(s);
    // Si riempie la rosa di una squadra a mano.
    const ids = D.players.slice(0, 5).map((p) => p.id);
    s = { ...s, teams: { ...s.teams, [a]: { credits: 20, roster: ids } } };
    ok(!S.puoVotare(s).includes(a), 'una squadra al completo non ha voto');
    const altri = S.puoVotare(s);
    const prima = S.currentPlayerId(s);
    for (const k of altri) s = S.votaSkip(s, k, tick());
    ok(S.currentPlayerId(s) !== prima, 'e gli altri bastano da soli per saltare');
  }

  // Con l'asta in pausa non si vota.
  {
    let s = S.pauseAuction(nuova(), tick());
    ok(S.votaSkip(s, S.puoVotare(s)[0], tick()) === undefined, 'in pausa il voto e rifiutato');
  }
}

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

/* ==========================================================
   Il nome della squadra si cambia in lobby
   ==========================================================

   Si zappa mentre si aspetta. Le cose che possono rompersi sono due: finire
   con due squadre chiamate uguale, e restare incastrati sullo stesso nome. */
console.log('\nIL NOME SI CAMBIA IN LOBBY\n');
{
  const core = await import('../js/core.js');
  const { NOMI_SQUADRE, applicaNomi, TEAM_NAMES } = core;

  ok(NOMI_SQUADRE.length > TEAM_KEYS.length,
    'i nomi sono piu delle sedie, o col tavolo pieno non si zappa',
    `${NOMI_SQUADRE.length} nomi, ${TEAM_KEYS.length} sedie`);
  ok(new Set(NOMI_SQUADRE).size === NOMI_SQUADRE.length, 'nessun nome ripetuto nell\'elenco');

  let s = S.newGame('zap', 'h1');
  s = S.joinGame(s, 'h1', 'Diego');
  s = S.joinGame(s, 'u2', 'Teresa');
  s = S.joinGame(s, 'u3', 'Fabio');
  const mio = s.seats.h1;

  // 1. Cambia davvero, e cambia solo la mia.
  applicaNomi(s.seed, s.nomi);
  const prima = { ...TEAM_NAMES };
  s = S.cambiaNome(s, mio) || s;
  applicaNomi(s.seed, s.nomi);
  ok(TEAM_NAMES[mio] !== prima[mio], 'il nome della mia squadra cambia', `${prima[mio]} -> ${TEAM_NAMES[mio]}`);
  ok(Object.values(s.seats).filter((k) => k !== mio).every((k) => TEAM_NAMES[k] === prima[k]),
    'le squadre degli altri restano come stavano');

  // 2. Zappando trenta volte non si finisce mai addosso a un altro. E' la
  //    regola che conta: due "Pornland" allo stesso tavolo e ingiocabile.
  const visti = new Set();
  let doppioni = 0;
  for (let i = 0; i < 30; i++) {
    s = S.cambiaNome(s, mio) || s;
    applicaNomi(s.seed, s.nomi);
    const occupate = Object.values(s.seats);
    const nomi = occupate.map((k) => TEAM_NAMES[k]);
    if (new Set(nomi).size !== nomi.length) doppioni++;
    visti.add(TEAM_NAMES[mio]);
  }
  ok(doppioni === 0, 'zappando trenta volte non si prende mai il nome di un altro', `${doppioni} collisioni`);
  // La soglia e bassa di proposito. Pescando a caso fra i ~19 nomi liberi,
  // in 30 pressioni ne escono in media 15 diversi, con uno scarto di circa
  // 1.6: una soglia a 15 faceva fallire il test una volta su due per puro
  // caso. Qui serve solo a distinguere "gira davvero" da "rimbalza fra due o
  // tre", e 9 e a quattro scarti dalla media: non capita mai per sbaglio, e
  // uno zapping incastrato lo becca comunque.
  ok(visti.size >= 9, 'e si gira per davvero fra i nomi, non fra due o tre',
    `${visti.size} nomi diversi in 30 pressioni`);

  // 2b. SI PESCA, NON SI SCORRE. Prima il tasto dava il successivo in elenco:
  //     due persone allo stesso tavolo che premono lo stesso numero di volte
  //     vedevano lo stesso giro di nomi, e sembrava una freccia giu. Si prova
  //     premendo duecento volte SEMPRE DALLO STESSO STATO: se fosse uno
  //     scorrimento uscirebbe duecento volte lo stesso nome.
  {
    const base = s;
    const idxBase = { ...core.indiciBase(base.seed), ...base.nomi };
    const esiti = new Map();
    for (let i = 0; i < 200; i++) {
      const dopo = S.cambiaNome(base, mio);
      const v = dopo.nomi[mio];
      esiti.set(v, (esiti.get(v) || 0) + 1);
    }
    const seguente = (idxBase[mio] + 1) % NOMI_SQUADRE.length;
    const piuFrequente = Math.max(...esiti.values());
    ok(esiti.size >= 8, 'dallo stesso punto la pescata da esiti diversi, non sempre lo stesso',
      `${esiti.size} nomi diversi in 200 pressioni`);
    ok((esiti.get(seguente) || 0) < 60,
      'e non e il successivo in elenco travestito',
      `il nome dopo e uscito ${esiti.get(seguente) || 0} volte su 200`);
    ok(piuFrequente < 60, 'nessun nome domina la pescata', `il piu frequente ${piuFrequente}/200`);
    ok(!esiti.has(idxBase[mio]), 'e non ricapita mai quello che si aveva gia');
  }

  // 3. Le sedie vuote non si rinominano: toglierebbero nomi a chi gioca.
  const vuota = TEAM_KEYS.find((k) => !Object.values(s.seats).includes(k));
  ok(S.cambiaNome(s, vuota) === undefined, 'una sedia vuota non si puo rinominare');

  // 4. Finita la lobby il nome e quello, o cambierebbe a meta asta.
  let t = S.startAuction(s, tick(), S.attive(s));
  ok(S.cambiaNome(t, mio) === undefined, 'a partita iniziata il nome non si tocca piu');

  // 5. Il cambio deve sopravvivere al giro nel database: e' li che gli
  //    oggetti vuoti spariscono e i campi tornano undefined.
  const scelto = s.nomi[mio];
  const dopo = S.hydrate(giroFirebase(s));
  ok(dopo.nomi?.[mio] === scelto, 'il nome scelto sopravvive al passaggio da Firebase',
    `${scelto} -> ${dopo.nomi?.[mio]}`);

  // 6. Una stanza aperta prima che lo zapping esistesse non ha il campo.
  const vecchia = S.hydrate({ ...S.newGame('vecchia', 'h1'), nomi: undefined });
  ok(vecchia.nomi && Object.keys(vecchia.nomi).length === 0,
    'una stanza aperta prima non si rompe: nessun cambio, nessun errore');

  applicaNomi('fanta-nba');   // si rimette com'era per chi viene dopo
}

/* ==========================================================
   Le rivalita fra serate
   ==========================================================

   Si contano su serate inventate di cui si sa il risultato a mente: tre
   serate, con un vecchio record senza serie in mezzo, che deve essere
   saltato e non inventato. */
console.log('\nLE RIVALITA FRA SERATE\n');
{
  const albo = [
    { seed: 's1', serie: [{ a: 'Diego', b: 'Fabio', va: 4, vb: 2 }, { a: 'Teresa', b: 'Ada', va: 1, vb: 4 }, { a: 'Diego', b: 'Ada', va: 4, vb: 3 }] },
    { seed: 'vecchia', champion: 't1', runnerUp: 't2' },              // registrata prima: niente serie
    { seed: 's2', serie: [{ a: 'Fabio', b: 'Diego', va: 4, vb: 1 }, { a: 'Ada', b: 'Teresa', va: 4, vb: 0 }, { a: 'Fabio', b: 'Ada', va: 2, vb: 4 }] },
    { seed: 's3', serie: [{ a: 'Diego', b: 'Ada', va: 0, vb: 4 }, { a: 'Diego', b: 'Ada', va: 1, vb: 4 }] },
  ];
  const { coppie, persone } = S.rivalita(albo);
  const coppia = (x, y) => coppie.find((c) => (c.a === x && c.b === y) || (c.a === y && c.b === x));

  // Diego-Fabio: Diego vince nella prima serata, Fabio nella seconda.
  const df = coppia('Diego', 'Fabio');
  ok(df && df.va + df.vb === 2, 'Diego e Fabio si sono incontrati due volte', df && `${df.a} ${df.va}-${df.vb} ${df.b}`);
  ok(df && df.va === 1 && df.vb === 1, 'e sono uno pari');

  // Diego-Ada: 1 vinta (s1), poi due perse (s3).
  const da = coppia('Ada', 'Diego');
  const adaV = da.a === 'Ada' ? da.va : da.vb;
  ok(da.va + da.vb === 3 && adaV === 2, 'Ada conduce su Diego 2-1', `${da.a} ${da.va}-${da.vb} ${da.b}`);

  // Diego-Fabio e Fabio-Diego sono la stessa rivalita, non due.
  ok(coppie.filter((c) => [c.a, c.b].sort().join() === 'Diego,Fabio').length === 1,
    'Diego-Fabio e Fabio-Diego sono una rivalita sola');

  // Il vecchio record senza serie non inventa niente.
  ok(coppie.every((c) => c.a !== 't1' && c.b !== 't1'), 'una serata registrata prima viene saltata, non inventata');

  // Bestia nera: Diego ha perso di piu contro Ada (2 perse, 1 vinta).
  ok(persone.Diego.bestiaNera?.nome === 'Ada', 'la bestia nera di Diego e Ada',
    persone.Diego.bestiaNera ? `${persone.Diego.bestiaNera.nome} ${persone.Diego.bestiaNera.vinte}-${persone.Diego.bestiaNera.perse}` : 'nessuna');
  // Con Fabio Diego e pari: una rivalita, non una bestia nera.
  ok(persone.Fabio.bestiaNera === null || persone.Fabio.bestiaNera.nome !== 'Diego',
    'contro chi sei in parita non e una bestia nera');
  ok(persone.Ada.vinte === 5 && persone.Ada.perse === 1, 'Ada: cinque serie vinte e una persa', `${persone.Ada.vinte}-${persone.Ada.perse}`);

  // Un albo vuoto o assente non rompe niente.
  ok(S.rivalita([]).coppie.length === 0 && S.rivalita(undefined).coppie.length === 0, 'senza serate non ci sono rivalita');
}

/* ==========================================================
   I pronostici a quote, e una serie alla volta
   ==========================================================

   Si sa gia come finisce ogni serie — il motore e deterministico — quindi
   si gioca la serata una volta per leggere i risultati, poi la si rigioca
   uguale con i pronostici piazzati prima: uno che prende esito e marcatore,
   uno che prende solo il marcatore, uno che sbaglia tutto. */
console.log('\nI PRONOSTICI A QUOTE\n');
{
  const P = await import('../js/pronostici.js');
  const SR = await import('../js/serie.js');
  const { s: fine, T } = partitaFinoA(4, 'fine', 'pron');
  const s0 = costruisciBracket(fine.po, T)[0][0];
  const quote = P.quoteSerie(T[s0.a], T[s0.b], s0.seed);
  const esito = P.esitoDi(s0.res);
  const sbagliato = P.ESITI.find((e) => e !== esito);
  const { top } = P.marcatoriDi(s0.res);
  const nonTop = quote.marcatori.find((m) => !top.includes(m.id)).id;

  let { s } = partitaFinoA(4, 'playoff-inizio', 'pron');
  const [k1, k2, k3] = S.attive(s);
  ok(s.po.corrente === '0-0', 'i playoff partono dalla semifinale 1');

  // Il riduttore.
  ok(S.pronostica(s, k1, '0-0', 'e', '4-5') === undefined && S.pronostica(s, k1, '0-0', 'e', '2-3') === undefined,
    'un esito impossibile non si accetta');
  ok(S.pronostica(s, k1, '0-0', 'x', '4-1') === undefined, 'un mercato che non esiste nemmeno');
  ok(S.pronostica(s, 't9', '0-0', 'e', '4-1') === undefined, 'chi non e al tavolo non pronostica');
  ok(S.pronostica(s, s0.a, '0-0', 'e', '0-4') !== undefined, 'chi gioca la serie pronostica, anche contro se stesso');
  s = S.pronostica(s, k1, '0-0', 'e', sbagliato);
  s = S.pronostica(s, k1, '0-0', 'e', esito);       // cambia idea
  s = S.pronostica(s, k1, '0-0', 'm', top[0]);
  s = S.pronostica(s, k2, '0-0', 'e', sbagliato);
  s = S.pronostica(s, k2, '0-0', 'm', top[0]);
  s = S.pronostica(s, k3, '0-0', 'e', sbagliato);
  s = S.pronostica(s, k3, '0-0', 'm', nonTop);
  ok(s.po.pron['0-0'][k1].e === esito, 'si cambia idea, vale l\'ultima scelta');
  // Un pronostico del formato di prima (vincente e gare) non si conta e non rompe.
  s = { ...s, po: { ...s.po, pron: { ...s.po.pron, '0-1': { [k1]: { v: 't1', g: 5 } } } } };
  const dopoDb = giroFirebase(s);
  ok(dopoDb.po.pron?.['0-0']?.[k1]?.m === top[0] && dopoDb.po.corrente === '0-0', 'pronostici e serie in corso sopravvivono al database');

  // Da gara 1 si chiude.
  s = S.advanceSeries(s, 0, 0, 1);
  ok(S.pronostica(s, k2, '0-0', 'e', esito) === undefined, 'dopo gara 1 non si pronostica piu');
  ok(S.pronostica(s, k2, '0-1', 'e', '4-1') !== undefined, 'la serie dopo resta aperta');
  for (let i = 0; i < 7; i++) s = S.advanceSeries(s, 0, 0, 1);

  // I punti: la quota di quello che si e preso.
  const cl = P.classificaPronostici(s, T);
  const di = (k) => cl.find((r) => r.key === k);
  const qE = quote.esiti[esito].q, qM = quote.marcatori.find((m) => m.id === top[0]).q;
  ok(Math.abs(di(k1).punti - Math.round((qE + qM) * 100) / 100) < 1e-9 && di(k1).presi === 2,
    'esito e marcatore presi: la somma delle due quote', `${di(k1).punti} = ${qE} + ${qM}`);
  ok(Math.abs(di(k2).punti - qM) < 1e-9 && di(k2).presi === 1, 'solo il marcatore: la sua quota', `${di(k2).punti}`);
  ok(di(k3).punti === 0 && di(k3).chiusi === 1, 'tutto sbagliato: zero');
  ok(cl[0].key === k1, 'in testa chi ha preso di piu');
  ok(!cl.some((r) => r.key === k1 && r.fatti > 1), 'il pronostico del formato vecchio non si conta');
  ok(P.reDeiPronostici(cl)?.key === k1, 'e il re dei pronostici e lui');
  ok(P.reDeiPronostici([{ key: 'a', punti: 3, presi: 1 }, { key: 'b', punti: 3, presi: 1 }]) === null,
    'a pari punti e pari presi non si incorona nessuno');

  // A pari punti fra marcatori, vince chi ha scelto l'uno o l'altro.
  const finta = { done: true, wins: { a: 4, b: 1 }, games: [{ boxA: [{ id: 'x', pts: 30 }, { id: 'y', pts: 30 }], boxB: [{ id: 'z', pts: 20 }] }] };
  const qf = { esiti: { '4-1': { q: 4 } }, marcatori: [{ id: 'x', q: 2 }, { id: 'y', q: 3 }, { id: 'z', q: 9 }] };
  ok(P.puntiDi({ m: 'x' }, finta, qf).m === 2 && P.puntiDi({ m: 'y' }, finta, qf).m === 3 && P.puntiDi({ m: 'z' }, finta, qf).m === 0,
    'due marcatori a pari punti: vince chi ha scelto l\'uno e chi ha scelto l\'altro');

  // Le quote: oneste, ferme, e non guardano il risultato.
  ok(JSON.stringify(P.quoteSerie(T[s0.a], T[s0.b], s0.seed)) === JSON.stringify(quote), 'le quote non cambiano dopo aver giocato');
  ok(Math.abs(quote.marcatori.reduce((a, m) => a + m.p, 0) - 1) < 1e-9, 'le probabilita dei marcatori fanno 1');

  // Il bot pesca in proporzione: spesso la favorita, mai l'impossibile.
  const rnd = makeRng('bot-quote');
  const fav = P.ESITI.slice().sort((a, b) => quote.esiti[b].p - quote.esiti[a].p)[0];
  let suFav = 0, impossibili = 0;
  for (let i = 0; i < 2000; i++) {
    const p = P.pronosticoBot(quote, rnd);
    if (p.e === fav) suFav++;
    if (quote.esiti[p.e].p === 0 || quote.marcatori.find((m) => m.id === p.m).p === 0) impossibili++;
  }
  ok(Math.abs(suFav / 2000 - quote.esiti[fav].p) < 0.04, 'il bot sceglie l\'esito favorito quanto e probabile',
    `${(suFav / 20).toFixed(1)}% contro ${(quote.esiti[fav].p * 100).toFixed(1)}%`);
  ok(impossibili === 0, 'e non sceglie mai quello che non e uscito in nessuna simulazione');

  // UNA SERIE ALLA VOLTA: l'ordine, la serie in corso, dove si va dopo.
  let t = partitaFinoA(4, 'playoff-inizio', 'ordine').s;
  const ord = () => SR.ordineSerie(t, T);
  ok(ord().map((x) => x.id).join() === '0-0,0-1,1-0', 'l\'ordine: semifinale 1, semifinale 2, finale');
  ok(SR.serieCorrente(t, T).id === '0-0', 'si parte dalla prima');
  for (let i = 0; i < 7; i++) t = S.advanceSeries(t, 0, 0, 1);
  ok(SR.serieCorrente(t, T).id === '0-0', 'a serie chiusa si resta li, finche chi ospita non va avanti');
  ok(SR.dopo(t, T, SR.serieCorrente(t, T)).map((x) => x.id).join() === '0-1', 'e dopo c\'e la semifinale 2');
  t = S.vaiASerie(t, '0-1');
  for (let i = 0; i < 7; i++) t = S.advanceSeries(t, 0, 1, 1);
  const strade = SR.dopo(t, T, SR.serieCorrente(t, T));
  ok(strade.map((x) => x.id).join() === 'third,1-0', 'dopo l\'ultima semifinale: finalina o finale', strade.map((x) => x.id).join());
  t = S.vaiASerie(S.openThird(t, strade[0].a, strade[0].b), 'third');
  ok(ord().map((x) => x.id).join() === '0-0,0-1,third,1-0', 'la finalina si gioca prima della finale');
  for (let i = 0; i < 7; i++) t = S.advanceThird(t, 1);
  ok(SR.dopo(t, T, SR.serieCorrente(t, T)).map((x) => x.id).join() === '1-0', 'chiusa la finalina, la finale');
  t = S.vaiASerie(t, '1-0');
  for (let i = 0; i < 7; i++) t = S.advanceSeries(t, 1, 0, 1);
  ok(SR.dopo(t, T, SR.serieCorrente(t, T)).length === 0, 'dopo la finale non c\'e niente');

  // Una stanza aperta prima del cambio non ha la serie in corso: si prende la
  // prima non chiusa, e niente si rompe.
  let vecchia = partitaFinoA(4, 'playoff-inizio', 'vecchia').s;
  for (let i = 0; i < 7; i++) vecchia = S.advanceSeries(vecchia, 0, 0, 1);
  const { corrente, ...poSenza } = vecchia.po;
  vecchia = giroFirebase({ ...vecchia, po: poSenza });
  ok(SR.serieCorrente(vecchia, T).id === '0-1', 'una stanza di prima riprende dalla prima serie non chiusa');

  // Ogni formato, da cima a fondo seguendo solo "Avanti": tutte le serie
  // giocate una volta, e alla fine un campione. Con e senza finalina.
  for (const n of NUMERI_SQUADRE) for (const conFinalina of [false, true]) {
    let { s: x, T: Tn } = partitaFinoA(n, 'playoff-inizio', `avanti${n}`);
    const viste = [];
    for (let passi = 0; passi < 40; passi++) {
      const c = SR.serieCorrente(x, Tn);
      if (!c.f.done) {
        viste.push(c.id);
        for (let k = 0; k < 7; k++) x = c.id === 'third' ? S.advanceThird(x, 1) : S.advanceSeries(x, c.r, c.i, 1);
        continue;
      }
      const strade = SR.dopo(x, Tn, c);
      if (!strade.length) break;
      const st = conFinalina ? strade[0] : strade[strade.length - 1];
      x = st.id === 'third' ? S.vaiASerie(S.openThird(x, st.a, st.b), 'third') : S.vaiASerie(x, st.id);
    }
    const tot = x.po.turni.reduce((a, r) => a + r.length, 0) + (x.po.third ? 1 : 0);
    const fin = costruisciBracket(x.po, Tn).at(-1)[0];
    ok(viste.length === tot && new Set(viste).size === tot && fin.res?.done,
      `${n} squadre${conFinalina ? ' con finalina' : ''}: una serie alla volta fino al campione`, viste.join(' '));
  }
}

/* ==========================================================
   Chi ha finito la rosa mentre gli altri comprano ancora
   ==========================================================

   Scena vista giocando: rosa completa, gli altri ancora in asta, e nessuna
   visuale dello skip. Le domande sono due. Gli altri restano bloccati ad
   aspettare un voto che non puo arrivare? E se nessuno offre, il giocatore
   resta li per sempre? */
console.log('\nUNA SQUADRA HA FINITO, LE ALTRE NO\n');
{
  const tavolo = () => {
    let s = S.newGame('pieno', 'host');
    for (let i = 0; i < 4; i++) s = S.joinGame(s, 'u' + i, 'P' + i);
    s = S.startAuction(s, tick(), S.attive(s));
    // La prima squadra si riempie comprando a 1 i primi cinque lotti.
    const io = S.attive(s)[0];
    for (let i = 0; i < ROSTER_SIZE; i++) {
      s = S.placeBid(s, io, 1, tick());
      s = S.resolveLot(s, tick());
    }
    return { s, io };
  };

  const { s: base, io } = tavolo();
  ok(S.slotsLeft(base, io) === 0, 'la mia rosa e completa', `${base.teams[io].roster.length}/5`);
  ok(base.phase === 'auction', 'e l\'asta va avanti per gli altri');

  // 1. Il mio voto non serve e non manca: chi ha la rosa piena non puo
  //    comprare, quindi non ha voce. Se l'avesse, il suo silenzio bloccherebbe
  //    tutti gli altri per sempre.
  const votanti = S.puoVotare(base);
  ok(!votanti.includes(io), 'chi ha finito non ha voto: non potrebbe comprarlo comunque');
  ok(votanti.length === 3, 'e agli altri basta l\'accordo fra loro tre', `${votanti.length} votanti`);

  let s2 = base;
  for (const k of votanti) s2 = S.votaSkip(s2, k, tick());
  ok(s2.auction.idx !== base.auction.idx, 'infatti in tre saltano il giocatore senza aspettarmi');

  // 2. IL PUNTO CHE CONTA. Nessuno offre, il tempo scade: il giocatore deve
  //    essere assegnato lo stesso, o l'asta si pianta li.
  let s3 = base;
  const primaIdx = s3.auction.idx;
  const primaPid = S.currentPlayerId(s3);
  s3 = S.resolveLot(s3, tick());
  ok(s3.auction.idx !== primaIdx, 'a tempo scaduto senza offerte il lotto si chiude lo stesso');
  const chi = S.attive(s3).find((k) => s3.teams[k].roster.includes(primaPid));
  ok(!!chi, 'e il giocatore finisce a qualcuno, non nel vuoto',
    chi ? `assegnato a ${chi}` : 'NESSUNO lo ha preso');
  ok(chi !== io, 'mai a chi aveva gia la rosa piena');

  // 3. E deve valere anche a skip esauriti, che e quando capita davvero.
  let s4 = base;
  for (let giro = 0; giro < S.MAX_SKIP; giro++) {
    for (const k of S.puoVotare(s4)) s4 = S.votaSkip(s4, k, tick());
  }
  ok(S.skipRimasti(s4) === 0, 'finiti i tre skip');
  const idx4 = s4.auction.idx;
  const pid4 = S.currentPlayerId(s4);
  s4 = S.resolveLot(s4, tick());
  ok(s4.auction.idx !== idx4 && S.attive(s4).some((k) => s4.teams[k].roster.includes(pid4)),
    'anche a skip finiti il tempo scaduto assegna, non blocca');

  // 3b. IL TEMPO NON DIPENDE DALLA PAGINA. Chi ospita leggeva il residuo dal
  //     valore di ritorno della funzione che DISEGNA il cronometro, e quella
  //     vale null quando non trova l'elemento a schermo: un ridisegno storto
  //     bastava a fermare l'asta per tutti, col tempo a zero e nessuna
  //     assegnazione. Adesso il residuo si calcola dallo stato e basta.
  {
    const t0 = 5_000_000;
    let sx = S.newGame('tempo', 'host');
    sx = S.joinGame(sx, 'u1', 'P1');
    sx = S.joinGame(sx, 'u2', 'P2');
    sx = S.startAuction(sx, t0, S.attive(sx));
    // Il tempo del lotto e i secondi per offrire PIU l'apertura
    // della pallina, che si aggiunge e non si toglie.
    const pieno = S.BID_SECONDS * 1000 + S.RIVELA_MS;
    ok(S.tempoRimasto(sx, t0) === pieno,
      'a lotto appena aperto c\'e il tempo per offrire piu quello della pallina',
      `${S.tempoRimasto(sx, t0)} ms`);
    ok(S.inRivelazione(sx, t0), 'e la pallina risulta ancora chiusa');
    ok(!S.inRivelazione(sx, t0 + S.RIVELA_MS + 1), 'passata l\'apertura, la scheda e scoperta');
    ok(S.tempoRimasto(sx, t0 + pieno + 1) === 0, 'e a tempo finito vale zero, non null');
    ok(S.tempoRimasto(S.pauseAuction(sx, t0 + 1000), t0 + 9000) === null, 'in pausa non scorre');
    ok(S.tempoRimasto({ auction: { running: false } }, t0) === null, 'e senza asta in corso non esiste');
  }

  // 4. E l'asta arriva in fondo davvero, senza che nessuno offra piu niente:
  //    e' la prova che non esiste uno stato da cui non si esce.
  let s5 = base, giri = 0;
  while (s5.phase === 'auction' && giri++ < 400) s5 = S.resolveLot(s5, tick());
  ok(s5.phase === 'squadra', 'senza nessuna offerta l\'asta si chiude comunque', `fase ${s5.phase}`);
  ok(S.attive(s5).every((k) => s5.teams[k].roster.length === ROSTER_SIZE),
    'e tutte le rose sono complete');
}

console.log('\n' + (fails === 0 ? 'Nessun bug trovato.\n' : `${fails} problemi.\n`));
process.exit(fails === 0 ? 0 : 1);
