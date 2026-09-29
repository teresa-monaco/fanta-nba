// domtest.mjs — collaudo dell'interfaccia senza browser.
//
// Costruisce il minimo DOM finto che serve ad app.js (getElementById,
// localStorage, location, fetch su file locali), avvia davvero l'applicazione
// in modalita locale e la porta attraverso tutte e cinque le schermate,
// controllando che ognuna produca HTML sensato e nessuna sollevi eccezioni.
//
//   node tools/domtest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- DOM finto ---------- */

const store = new Map();
// Il DOM finto tiene stringhe, non un albero: querySelector non puo davvero
// cercare. Restituisce vuoto, e i controlli sul markup si fanno sul testo.
// L'importante e che l'app non esploda chiamandolo.
const mkEl = (id) => ({
  id, innerHTML: '', value: '', disabled: false, textContent: '',
  dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
  closest: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  scrollIntoView() {},
});
const els = { app: mkEl('app'), topbar: mkEl('topbar') };

globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = {
  getElementById: (id) => els[id] ?? null,
  addEventListener() {},
  querySelector: () => null,
  querySelectorAll: () => [],
};
// ?local=1 tiene il test in modalità locale anche ora che Firebase è configurato:
// senza, proverebbe a scaricare l'SDK dalla rete e a connettersi davvero.
let reloaded = false;
globalThis.location = { search: '?local=1', origin: 'https://example.test', pathname: '/', reload() { reloaded = true; } };
globalThis.confirm = () => true;
globalThis.history = { replaceState() {} };
globalThis.window = globalThis;
// In Node 24 navigator esiste gia ed e in sola lettura: aggiungo solo il pezzo che manca.
Object.defineProperty(globalThis.navigator, 'clipboard', {
  value: { writeText: async () => {} }, configurable: true,
});

// fetch che legge dal disco: e cosi che core.js carica i JSON dei dati.
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^\.\//, '');
  const body = readFileSync(join(root, rel), 'utf8');
  return { ok: true, json: async () => JSON.parse(body) };
};

// Viewport finto da iPhone con la barra di Safari APERTA: il viewport di
// layout è 844, quello visibile 730. La barra dei rilanci deve alzarsi di 114.
const cssVars = {};
globalThis.document.documentElement = { style: { setProperty(k, v) { cssVars[k] = v; } } };
globalThis.innerHeight = 844;
globalThis.visualViewport = { height: 730, offsetTop: 0, addEventListener() {} };
globalThis.addEventListener = () => {};

let uncaught = null;
process.on('unhandledRejection', (e) => { uncaught = e; });

/* ---------- Avvio dell'app vera ---------- */

await import('../js/app.js');
await new Promise((r) => setTimeout(r, 60));

let fails = 0;
const ok = (cond, label, extra = '') => {
  if (cond) console.log(`  PASS  ${label}${extra ? ' — ' + extra : ''}`);
  else { console.log(`  FAIL  ${label}${extra ? ' — ' + extra : ''}`); fails++; }
};
const html = () => els.app.innerHTML;
const has = (...bits) => bits.every((b) => html().includes(b));
const clean = () => !html().includes('Errore di rendering') && !html().includes('Qualcosa non va');

const F = globalThis.FANTA;
const S = await import('../js/state.js');
const { ui, render, teamsFromState, stagioneFromState, esc } = await import('../js/ui.js');
const { buildTeam, componiTabellone, simSeriesUpTo, costruisciBracket, matchup, RITMI,
  giriStagione, tabelloneDaStagione } = await import('../js/engine.js');
const { TEAM_KEYS, STRATEGIES, db } = await import('../js/core.js');
const BotAI = await import('../js/bot.js');

console.log('\nCollaudo interfaccia (modalita locale, DOM simulato)\n');

/* 1. Lobby */
ok(!!F?.session, 'l\'app si avvia e apre una sessione', F?.session?.mode);
ok(clean() && has('Fanta NBA', 'Inizia'), 'la lobby si disegna');
ok(els.topbar.innerHTML.includes('FANTA'), 'la barra in alto si disegna');
ok(cssVars['--vv-bottom'] === '114px',
  'la barra dei rilanci si alza sopra la toolbar di Safari', `--vv-bottom = ${cssVars['--vv-bottom']}`);

/* 2. Asta */
const now = () => Date.now();
// Esplicito: senza sedie occupate il default sarebbe "tutte e dieci".
await F.session.apply((s) => S.startAuction(s, now(), TEAM_KEYS.slice(0, 4)));
// Agganciato alla struttura, non a una parola: le etichette cambiano con la grafica.
ok(clean() && has('class="card lot"', 'class="lot-head"', 'crediti'), 'la schermata d\'asta si disegna');
ok(has('Realizzazione', 'Protezione ferro'), 'gli attributi del giocatore sono visibili');
ok(has('Assegna a mano') && has('>Salta<'), 'i comandi del banditore stanno nel blocco del giocatore');
ok(html().indexOf('Assegna a mano') < html().indexOf('class="card bidbox'),
  'e stanno sotto le valutazioni, prima del riquadro offerte');
ok(!has('>Assegna</button>'), 'senza offerte "Assegna" non compare: non c\'è niente da assegnare');
ok(has('data-act="toggle-pause"'), 'c\'è il tasto per fermare il cronometro');
ok(has('+1<small>1') && has('+2<small>2') && has('+3<small>3') && has('All in'),
  'i quattro tasti di rilancio ci sono, con l\'importo risultante sotto');
ok(!has('Rilancia a'), 'niente etichette lunghe sui tasti di rilancio');
// Il cronometro deve stare ANCHE nella barra fissa: i tasti sono li, e con
// la pagina scrollata il conto alla rovescia in cima non si vede piu.
ok((html().match(/data-clock/g) || []).length >= 2,
  'il cronometro c\'e anche nella barra dei rilanci, non solo in cima');
ok(html().lastIndexOf('data-clock') > html().indexOf('class="bidbar"'),
  'ed e dentro la barra fissa, non sopra');
// Le caselle d'asta sono targate per ruolo: serve a vedere chi manca.
ok(['PG', 'SG', 'SF', 'PF', 'C'].every((p) => html().includes(`<span class="pos">${p}</span>`))
  || !has('class="rslots"'), 'le caselle della propria rosa portano il ruolo');

/* Con un'offerta sul tavolo "Assegna" compare, e All in si arma in due tocchi */
await F.session.apply((s) => S.placeBid(s, TEAM_KEYS[1], 3, now()));
ok(has('>Assegna</button>'), 'con un\'offerta sul tavolo compare "Assegna"');
ok(has('+1<small>4'), 'i rilanci ripartono dall\'offerta corrente, non da zero');
{
  const maxMia = S.maxBid(F.state, TEAM_KEYS[0]);
  ui.allIn = { team: TEAM_KEYS[0], at: 3 };
  render(els.app, { state: F.state, session: F.session });
  ok(has('Sicuro?'), 'All in chiede conferma invece di svuotare il budget al primo tocco');
  ok(has(`data-amt="${maxMia}"`), 'e la conferma offre esattamente il massimo consentito');
  ui.allIn = null;
  render(els.app, { state: F.state, session: F.session });
  ok(!has('Sicuro?'), 'l\'armamento si annulla');
}

/* Squadra propria in evidenza — è il comportamento della modalità online */
await F.session.apply((s) => S.joinGame(s, 'local', 'Diego'));
ok(has('(tu)') && has('puoi arrivare a'), 'chi ha una squadra la vede in evidenza, con budget e tetto di spesa');
ok(has('class="rslots"') && ['PG', 'SG', 'SF', 'PF', 'C'].every((p) => html().includes(`>${p}</span>`)),
  'la propria rosa mostra cinque caselle di ruolo, non cinque "libero" uguali');
ok(has('rslot vuoto'), 'e i ruoli ancora scoperti si vedono a colpo d\'occhio');
ok(has('Gli avversari'), 'gli altri finiscono in un blocco separato, sotto');
ok(html().indexOf('(tu)') < html().indexOf('Gli avversari'), 'e la propria viene prima');
ok(has('class="rslot'), 'la propria rosa è visibile a colpo d\'occhio');
await F.session.apply((s) => S.leaveSeat(s, 'local'));

/* Pausa: ferma il cronometro per tutti e blocca i rilanci */
// Importo valido, così il rifiuto dipende SOLO dalla pausa e non dal prezzo.
const valido = () => (F.state.auction.bid?.amount ?? 0) + 1;
await F.session.apply((s) => S.pauseAuction(s, now()));
ok(F.state.auction.paused, 'la pausa entra nello stato condiviso, non solo nel browser');
ok(!S.canBid(F.state, TEAM_KEYS[0], valido()), 'in pausa un rilancio per il resto valido viene rifiutato');
ok(has('Cronometro fermo'), 'la barra dice chiaramente che è fermo');
const rimasto = F.state.auction.remaining;
ok(rimasto > 0 && rimasto <= 15000, 'il tempo residuo viene conservato', `${Math.round(rimasto / 1000)}s`);
await F.session.apply((s) => S.resumeAuction(s, now()));
ok(!F.state.auction.paused && S.canBid(F.state, TEAM_KEYS[0], valido()), 'alla ripresa si torna a poter rilanciare');
ok(els.topbar.innerHTML.includes('new-game'), 'la barra in alto ha il tasto per ricominciare');
ok(has('Ricomincia da capo'), 'e c\'è anche in fondo alla schermata, dove si vede');

// Compra 20 giocatori tirando a sorte fra le squadre che hanno ancora posto.
let guard = 0;
while (F.state.phase === 'auction' && guard++ < 400) {
  const k = S.attive(F.state).filter((t) => S.slotsLeft(F.state, t) > 0)[0];
  const price = Math.min(S.maxBid(F.state, k), 1 + (guard % 7));
  await F.session.apply((s) => S.placeBid(s, k, Math.max(1, price), now()));
  await F.session.apply((s) => S.resolveLot(s, now()));
}
ok(F.state.phase === 'squadra', 'l\'asta si chiude e passa alle squadre', `${guard} lotti`);
ok(S.attive(F.state).every((k) => F.state.teams[k].roster.length === 5), 'tutte le rose sono da 5');

/* 3. Le squadre: quintetto spiegato e tattica, in una schermata sola */
ok(clean() && has('Le squadre', 'Primo violino', 'Strategia offensiva'),
  'quintetto e tattica stanno nella stessa schermata');
ok(['PG', 'SG', 'SF', 'PF', 'C'].every((p) => has(`>${p}<`)), 'tutti e cinque i ruoli compaiono');
ok(has('class="identita"'), 'il profilo del quintetto viene spiegato, non solo mostrato');
ok(has('data-act="toggle-lineup"'), 'il quintetto si puo comunque sbloccare e correggere');
ok(!has('data-act="pick-slot"'), 'ma di partenza e in sola lettura: non e una decisione finta');
ok(Object.values(STRATEGIES).every((v) => has(v.label)), 'tutte le strategie sono selezionabili');

/* Tutte le impostazioni tecniche in una schermata sola */
{
  ok(Object.values(RITMI).every((v) => has(v.label)) && has('data-act="set-ritmo"'),
    'il ritmo si sceglie nella stessa schermata');
  ok(has('type="range"') && has('class="rslider"'),
    'ed e una barra da scorrere, non quattro scatole separate');
  ok(has(`max="${Object.keys(RITMI).length - 1}"`), 'la barra copre tutti i ritmi');
  ok(has('data-act="set-coach"') && has('class="cstrip"'),
    'e anche l\'allenatore, in una striscia da sfogliare');
  ok(has('class="avatar"') && has('data-coach-strip'), 'ogni allenatore ha una faccia');
  ok(has('data-act="coach-scorri"'), 'e ci sono le frecce per il successivo');
  // Una carta alla volta: se fossero affiancate torneremmo al muro di testo.
  ok(has('scroll-snap-align') || html().includes('class="ccard'),
    'le schede stanno su una striscia, non tutte aperte insieme');

  const k0 = S.attive(F.state)[0];
  const libs = S.allenatoriDi(F.state.teams[k0].roster);
  ok(libs.length >= 2, 'la rosa sblocca piu di un allenatore', `${libs.length}`);
  ok(libs.every((c) => F.state.teams[k0].roster.some((id) => db().byId[id].tm + '|' + db().byId[id].era === c.tm.find((s) => s === db().byId[id].tm + '|' + db().byId[id].era))),
    'ogni allenatore sbloccato viene da un giocatore davvero in rosa');
  ok(libs.every((c) => has(esc(c.n))), 'gli allenatori sbloccati sono tutti a schermo');

  // L'ordine: prima cosa hai, poi come lo usi.
  const pos = (t) => html().indexOf(t);
  ok(pos('class="slots') < pos('Primo violino')
    && pos('Primo violino') < pos('Strategia offensiva')
    && pos('Strategia offensiva') < pos('data-act="set-ritmo"')
    && pos('data-act="set-ritmo"') < pos('data-act="set-coach"'),
    'l\'ordine e quello giusto: quintetto, violini, attacco, ritmo, allenatore');

  // Un allenatore che la rosa NON sblocca va rifiutato.
  const estraneo = db().coaches.find((c) => !libs.some((l) => l.id === c.id));
  ok(S.setTactics(F.state, k0, { coach: estraneo.id }) === F.state,
    'un allenatore non sbloccato viene rifiutato', estraneo.n);
  const dentro = S.setTactics(F.state, k0, { coach: libs[1].id });
  ok(dentro.tactics[k0].coach === libs[1].id, 'uno sbloccato invece si sceglie', libs[1].n);

  // Il ritmo cambia davvero la partita simulata, non solo l'etichetta.
  const T1 = buildTeam(k0, F.state.lineups[k0], { ...F.state.tactics[k0], ritmo: 'lento' });
  const T2 = buildTeam(k0, F.state.lineups[k0], { ...F.state.tactics[k0], ritmo: 'run-gun' });
  ok(T2.possVoluti - T1.possVoluti >= 20, 'lento e run and gun chiedono ritmi molto diversi',
    `${T1.possVoluti} contro ${T2.possVoluti}`);
  const altro = S.attive(F.state)[1];
  const O = buildTeam(altro, F.state.lineups[altro], F.state.tactics[altro]);
  ok(matchup(T2, O).pace - matchup(T1, O).pace > 8, 'e il ritmo scelto sposta i possessi della partita',
    `${matchup(T1, O).pace.toFixed(0)} contro ${matchup(T2, O).pace.toFixed(0)}`);

  // L'allenatore cambia gli attributi dei giocatori, non un totale finale.
  const senza = buildTeam(k0, F.state.lineups[k0], { ...F.state.tactics[k0], coach: null });
  const con = buildTeam(k0, F.state.lineups[k0], { ...F.state.tactics[k0], coach: libs[0].id });
  ok(JSON.stringify(senza.five.map((p) => p.attrs)) !== JSON.stringify(con.five.map((p) => p.attrs)),
    'l\'allenatore lavora sugli attributi dei cinque', libs[0].n);
  ok(con.coach?.n === libs[0].n, 'e la squadra sa chi ha in panchina');
}
for (const k of TEAM_KEYS) await F.session.apply((s) => S.setTactics(s, k, { strategy: 'pick-roll' }));
ok(clean(), 'cambiare strategia non rompe il rendering');

/* 5. Playoff */
const T = {};
for (const k of S.attive(F.state)) T[k] = buildTeam(k, F.state.lineups[k], F.state.tactics[k]);
const tab = componiTabellone(T, F.state.seed);
ok(tab.serie.join(',') === '2,1', 'con quattro squadre: due semifinali e una finale');
await F.session.apply((s) => S.toPlayoffs(s, tab));
ok(clean() && has('Playoff', 'Semifinale 1', 'Semifinale 2'), 'il tabellone si disegna');
ok(has('Vai — le prime due gare'), 'le semifinali partono a due gare per volta');
ok(!has('Vai — Gara'), 'in semifinale non si va una gara alla volta: quello e riservato alle Finals');

// Semifinali: due gare a tocco, finché entrambe non sono chiuse.
for (let i = 0; i < 5; i++) {
  await F.session.apply((s) => S.advanceSeries(s, 0, 0, S.PASSO_SEMI));
  await F.session.apply((s) => S.advanceSeries(s, 0, 1, S.PASSO_SEMI));
}
ok(clean() && has('Gara 1', 'MVP della serie', 'Perché ha vinto'), 'le semifinali mostrano gare, MVP e spiegazione');
// Le gare gia lette si richiudono: aperte tutte, chi guarda senza toccare
// restava fermo su gara 1 mentre il tavolo era a gara 6.
ok(has('game chiusa'), 'le gare precedenti si richiudono a una riga');
ok(has('data-ultima-gara'), 'l\'ultima gara e marcata, cosi si puo portare in vista');
ok((html().match(/class="story"/g) || []).length < (html().match(/class="gname"/g) || []).length,
  'e non sono tutte aperte insieme',
  `${(html().match(/class="story"/g) || []).length} cronache su ${(html().match(/class="gname"/g) || []).length} gare`);
ok(has('Box score'), 'il box score e consultabile');
ok(has('Finale') && has('Vai — Gara 1'), 'la finale si apre da sola quando le semifinali sono chiuse');

// Una gara alla volta, come chiedono le regole.
let steps = 0, sawStop = false;
while (steps++ < 8) {
  await F.session.apply((s) => S.advanceSeries(s, 1, 0, S.PASSO_FINALE));
  if (html().includes('Campione')) { sawStop = true; break; }
}
ok(sawStop, 'la finale si chiude e proclama il campione', `${steps} gare`);
ok(clean() && has('MVP della serie'), 'l\'MVP viene assegnato');

/* Il referto: senza, nessuna delle cinque scelte si impara mai */
ok(has('Il referto'), 'a serie chiusa compare il referto tattico');
ok(has('class="referto"') && has('Strategia') && has('Ritmo') && has('Allenatore') && has('Primo violino'),
  'e copre tutte e quattro le scelte misurabili');
ok(html().indexOf('Perché ha vinto') < html().indexOf('Il referto'),
  'sta dopo la spiegazione, non prima: prima cosa e successo, poi di chi e la colpa');
ok(!has('>Il referto') || has('punti a partita'),
  'i numeri sono in punti a partita, non in unita del motore');
ok(has('finale 3°/4° posto'), 'viene proposta la finalina fra le due eliminate');
{
  const turni = costruisciBracket(F.state.po, T);
  const perdenti = turni[0].map((m) => (m.res.winner === m.a ? m.b : m.a));
  await F.session.apply((s) => S.openThird(s, perdenti[0], perdenti[1]));
  for (let i = 0; i < 5; i++) await F.session.apply((s) => S.advanceThird(s, S.PASSO_SEMI));
  ok(clean() && has('Finale 3° / 4° posto'), 'la finalina si simula');
}

/* Albo d'oro: si scrive da solo e sopravvive all'azzeramento */
await new Promise((r) => setTimeout(r, 30));
ok((F.state.albo || []).length === 1, 'la partita finisce nell\'albo d\'oro da sola',
  `${(F.state.albo || []).length} voci`);
ok(has('Albo d\'oro'), 'l\'albo compare a fine partita');
{
  const voce = F.state.albo[0];
  ok(!!voce.championName && !!voce.mvp && Array.isArray(voce.roster) && voce.roster.length === 5,
    'la voce ha campione, MVP e quintetto', `${voce.championName} b. ${voce.runnerUpName} ${voce.wins}`);
  const doppio = S.recordAlbo(F.state, voce);
  ok(doppio === undefined, 'registrarla due volte non fa niente');
  const dopoReset = S.resetGame(F.state, 'altro-seed');
  ok((dopoReset.albo || []).length === 1, 'l\'albo sopravvive a "Nuova partita"');
  ok(S.classifica(F.state).some((t) => t.titoli === 1), 'la classifica conta il titolo');
}
ok(has('Nuova partita'), 'a fine partita il tasto diventa in evidenza');
ok(!html().includes('Ricomincia da capo'), 'e non ne compaiono due insieme');

/* 6. Ricominciare */
{
  const prima = F.state;
  const dopo = S.resetGame(prima, 'seed-nuovo');
  ok(dopo.phase === 'lobby' && !dopo.po, 'azzerare riporta alla lobby e cancella i playoff');
  ok(TEAM_KEYS.every((k) => dopo.teams[k].roster.length === 0 && dopo.teams[k].credits === 50),
    'azzerare restituisce 50 crediti e rose vuote');
  ok(JSON.stringify(dopo.seats) === JSON.stringify(prima.seats),
    'azzerare NON fa riscegliere la squadra a nessuno');
  ok(dopo.seed !== prima.seed, 'la nuova partita ha un seed diverso (asta diversa)');
}

/* 7. Dodici squadre in mano a chi ospita: la barra dei rilanci non deve
      diventare più alta dello schermo. Sopra le tre si sceglie prima la
      squadra e poi si rilancia, invece di una riga di tasti a testa. */
{
  await F.session.apply((s) => S.resetGame(s, 'dodici'));
  await F.session.apply((s) => S.startAuction(s, now(), TEAM_KEYS.slice(0, 12)));
  ok(clean() && S.attive(F.state).length === 12, 'l\'asta parte con dodici squadre');

  const righe = (html().match(/class="bidrow"/g) || []).length;
  ok(has('class="bidpick"'), 'compare il selettore di squadra');
  ok(righe === 1, 'e i tasti di rilancio restano una riga sola', `${righe} righe`);
  ok((html().match(/class="pickchip/g) || []).length === 12, 'il selettore elenca tutte e dodici');
  ok(has('bidbar-spacer tall'), 'lo spazio sotto il contenuto tiene conto del selettore');

  // La scelta è vera: cambia la squadra per cui si rilancia.
  const primo = TEAM_KEYS[0], settimo = TEAM_KEYS[6];
  ok(html().includes(`data-act="bid" data-team="${primo}"`), 'di partenza si rilancia per la prima');
  ui.bidTeam = settimo;
  render(els.app, { state: F.state, session: F.session });
  ok(html().includes(`data-act="bid" data-team="${settimo}"`)
    && !html().includes(`data-act="bid" data-team="${primo}"`),
    'scegliendo un\'altra squadra i tasti rilanciano per quella');
  ui.bidTeam = null;

  ok(!has('class="ros"'), 'con dodici squadre le rose degli avversari lasciano il posto ai crediti');

  // Fino a tre squadre in mano il selettore non serve e non deve comparire.
  await F.session.apply((s) => S.resetGame(s, 'tre'));
  await F.session.apply((s) => S.startAuction(s, now(), TEAM_KEYS.slice(0, 3)));
  ok(!has('class="bidpick"') && (html().match(/class="bidrow"/g) || []).length === 3,
    'con tre squadre restano le tre righe di sempre, senza selettore');
  ok(has('class="ros"'), 'e le rose degli avversari si vedono');
}

/* 8. Stagione regolare: la classifica al posto delle teste sorteggiate */
{
  await F.session.apply((s) => S.resetGame(s, 'stagione'));
  await F.session.apply((s) => S.setFormato(s, true));
  ui.numSquadre = 6;
  render(els.app, { state: F.state, session: F.session });
  ok(clean() && has('Stagione + playoff', 'data-act="formato"'), 'in lobby si sceglie il formato');
  ok(has('Le prime 4 passano'), 'e la lobby dice cosa comporta', '6 squadre');

  // Il formato e una preferenza del tavolo, non della singola partita.
  await F.session.apply((s) => S.resetGame(s, 'stagione2'));
  ok(F.state.conStagione === true, 'il formato scelto sopravvive a "Nuova partita"');

  await F.session.apply((s) => S.startAuction(s, now(), TEAM_KEYS.slice(0, 6)));
  let g2 = 0;
  while (F.state.phase === 'auction' && g2++ < 400) {
    const k = S.attive(F.state).filter((t) => S.slotsLeft(F.state, t) > 0)[0];
    await F.session.apply((s) => S.placeBid(s, k, Math.max(1, Math.min(S.maxBid(F.state, k), 1 + (g2 % 5))), now()));
    await F.session.apply((s) => S.resolveLot(s, now()));
  }
  ok(F.state.phase === 'squadra', 'l\'asta a sei si chiude');
  ok(has('Gioca la stagione regolare'), 'prima della stagione il tasto e quello giusto');
  ok(!has('Ai playoff'), 'e non si puo saltare direttamente ai playoff');
  ok(has('10 partite a testa'), 'la schermata dice quante partite si giocano');

  const giri = giriStagione(6);
  ok(giri === 2, 'con sei squadre il girone e di andata e ritorno', `${giri} giri`);
  await F.session.apply((s) => S.giocaStagione(s, giri));
  ok(clean() && has('class="classifica"', 'Stagione regolare'), 'la classifica si disegna');
  ok(has('>playoff<') && has('>fuori<'), 'si vede chi passa e chi resta fuori');
  ok(has('30 gare, 10 a testa'), 'e quante gare sono state giocate');
  ok(has('Tutti i risultati (30)'), 'i risultati partita per partita sono consultabili');
  ok(has('Ritocca le tattiche') && has('Ai playoff'), 'dopo la stagione si ritoccano le tattiche');

  const st = stagioneFromState(F.state);
  ok(st.cls.length === 6 && st.cls.every((r) => r.w + r.l === 10), 'ognuna ha giocato 10 partite');

  // Il ritocco cambia i playoff ma non la classifica gia giocata.
  const primaDelRitocco = st.cls.map((r) => `${r.k}:${r.w}`).join();
  for (const k of S.attive(F.state)) await F.session.apply((s) => S.setTactics(s, k, { strategy: 'tiro-3' }));
  const dopo = stagioneFromState(F.state);
  ok(dopo.cls.map((r) => `${r.k}:${r.w}`).join() === primaDelRitocco,
    'ritoccare le tattiche non riscrive la classifica');
  ok(F.state.tactics[S.attive(F.state)[0]].strategy === 'tiro-3'
    && F.state.stagione.tactics[S.attive(F.state)[0]].strategy !== undefined,
    'ma le nuove tattiche sono quelle che andranno ai playoff');

  const Tfin = teamsFromState(F.state);
  const tab8 = tabelloneDaStagione(Tfin, dopo.cls, F.state.seed);
  ok(tab8.teste === 0, 'col girone nessuno salta un turno');
  ok(tab8.ordine.length === 4 && tab8.fuori.length === 2, 'passano le prime quattro, due restano fuori');
  ok(tab8.ordine[0] === dopo.cls[0].k && tab8.ordine[1] === dopo.cls[3].k,
    'la prima incontra l\'ultima qualificata');
  await F.session.apply((s) => S.toPlayoffs(s, tab8));
  ok(clean() && has('Semifinale 1', 'Semifinale 2'), 'il tabellone da classifica si disegna');
  ok(!has('Turno preliminare'), 'e non c\'e nessun turno preliminare');
}

/* 9. I bot: si aggiungono dalla lobby e giocano da soli */
{
  await F.session.apply((s) => S.resetGame(s, 'coibot'));
  // I bot vivono nelle STANZE, dove le sedie sono vere. In modalita locale
  // chi ospita gia gestisce tutte le squadre da solo e la lobby non mostra
  // nemmeno le sedie: per disegnarla come la vede una stanza serve fingere
  // la modalita.
  const stanza = { ...F.session, mode: 'room' };
  await F.session.apply((s) => S.joinGame(s, 'io', 'Diego'));
  render(els.app, { state: F.state, session: stanza });
  ok(has('data-act="aggiungi-bot"'), 'in una stanza c\'è il tasto per aggiungere un bot');
  ok(has('Manca qualcuno?'), 'e dice a cosa serve');

  await F.session.apply((s) => S.aggiungiBot(s));
  render(els.app, { state: F.state, session: stanza });
  const primi = S.botDi(F.state);
  ok(primi.length === 1, 'il bot occupa una sedia', primi.join());
  ok(S.attive(F.state).length === 2, 'e conta come squadra in gioco');
  ok(has('>bot</span>'), 'ed è segnalato come tale nella lista');
  ok(has('data-act="togli-bot"'), 'e chi ospita lo può togliere');

  // Quattro e non di più: sono quattro teste diverse, non infinite copie.
  for (let i = 0; i < 6; i++) await F.session.apply((s) => S.aggiungiBot(s));
  ok(S.botDi(F.state).length === BotAI.ID_BOT.length,
    'non se ne aggiungono più di quanti ne esistono', `${S.botDi(F.state).length}`);
  const nomi = S.botDi(F.state).map((k) => F.state.names[`bot:${k}`]);
  ok(new Set(nomi).size === nomi.length, 'e sono tutti diversi', nomi.join(', '));

  // Si tolgono.
  const primo = S.botDi(F.state)[0];
  await F.session.apply((s) => S.togliBot(s, primo));
  ok(!S.botDi(F.state).includes(primo), 'un bot si può togliere');
  ok(!F.state.seats[`bot:${primo}`], 'e la sedia torna libera');

  // A partita avviata non si tocca più niente.
  await F.session.apply((s) => S.startAuction(s, now(), S.attive(s)));
  ok(S.aggiungiBot(F.state) === undefined, 'a partita avviata non si aggiungono bot');
  ok(S.togliBot(F.state, S.botDi(F.state)[0]) === undefined, 'e non si tolgono');

  // Offrono davvero, e restano dentro le regole.
  {
    const k = S.botDi(F.state)[0];
    const memoria = {};
    let offerte = 0;
    for (let giro = 0; giro < 30; giro++) {
      const q = BotAI.offerta(F.state, k, S, Date.now() + giro * 700, memoria);
      if (q == null) continue;
      ok(S.canBid(F.state, k, q), 'ogni offerta del bot passa da canBid', `${q}`);
      offerte++;
      break;
    }
    ok(offerte > 0, 'il bot rilancia entro il tempo del lotto');
  }

  // L'azzeramento li lascia seduti: sono parte del tavolo, non della partita.
  const quanti = S.botDi(F.state).length;
  const dopo = S.resetGame(F.state, 'altro');
  ok(S.botDi(dopo).length === quanti, 'i bot restano seduti dopo "Nuova partita"');
}

/* Controlli finali */
ok(!uncaught, 'nessuna eccezione non gestita', uncaught ? String(uncaught) : '');
ok(!html().includes('undefined') && !html().includes('NaN'), 'nessun "undefined" o "NaN" a schermo');
ok(!html().includes('{T}') && !html().includes('{player}'), 'nessun segnaposto non sostituito');

console.log(fails === 0 ? '\nInterfaccia OK su tutte le schermate.\n' : `\n${fails} problemi.\n`);
process.exit(fails === 0 ? 0 : 1);
