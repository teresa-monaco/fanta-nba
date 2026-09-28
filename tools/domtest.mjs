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
const mkEl = (id) => ({
  id, innerHTML: '', value: '', disabled: false, textContent: '',
  dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
  closest: () => null,
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

// fetch che legge dal disco: e cosi che core.js carica i due JSON.
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^\.\//, '');
  const body = readFileSync(join(root, rel), 'utf8');
  return { ok: true, json: async () => JSON.parse(body) };
};

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
const { ui, render } = await import('../js/ui.js');
const { buildTeam, pickBracket, simSeries } = await import('../js/engine.js');
const { TEAM_KEYS, STRATEGIES } = await import('../js/core.js');

console.log('\nCollaudo interfaccia (modalita locale, DOM simulato)\n');

/* 1. Lobby */
ok(!!F?.session, 'l\'app si avvia e apre una sessione', F?.session?.mode);
ok(clean() && has('Fanta NBA', 'Inizia'), 'la lobby si disegna');
ok(els.topbar.innerHTML.includes('FANTA'), 'la barra in alto si disegna');

/* 2. Asta */
const now = () => Date.now();
await F.session.apply((s) => S.startAuction(s, now()));
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
await F.session.apply((s) => S.takeSeat(s, 'local', 'Diego', TEAM_KEYS[0]));
ok(has('(tu)') && has('puoi arrivare a'), 'chi ha una squadra la vede in evidenza, con budget e tetto di spesa');
ok(has('Gli avversari'), 'gli altri finiscono in un blocco separato, sotto');
ok(html().indexOf('(tu)') < html().indexOf('Gli avversari'), 'e la propria viene prima');
ok(has('class="chip'), 'la propria rosa è visibile a colpo d\'occhio');
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
  const k = TEAM_KEYS.filter((t) => S.slotsLeft(F.state, t) > 0)[0];
  const price = Math.min(S.maxBid(F.state, k), 1 + (guard % 7));
  await F.session.apply((s) => S.placeBid(s, k, Math.max(1, price), now()));
  await F.session.apply((s) => S.resolveLot(s, now()));
}
ok(F.state.phase === 'lineups', 'l\'asta si chiude e passa ai quintetti', `${guard} lotti`);
ok(TEAM_KEYS.every((k) => F.state.teams[k].roster.length === 5), 'tutte le rose sono da 5');

/* 3. Quintetti */
ok(clean() && has('Quintetti', 'Ricalcola'), 'la schermata quintetti si disegna');
ok(['PG', 'SG', 'SF', 'PF', 'C'].every((p) => has(`>${p}<`)), 'tutti e cinque i ruoli compaiono');

/* 4. Tattica */
await F.session.apply((s) => S.toTactics(s));
ok(clean() && has('Impostazioni tattiche', 'Primo violino', 'Strategia offensiva'), 'la schermata tattica si disegna');
ok(Object.values(STRATEGIES).every((v) => has(v.label)), 'tutte le strategie sono selezionabili');
for (const k of TEAM_KEYS) await F.session.apply((s) => S.setTactics(s, k, { strategy: 'pick-roll' }));
ok(clean(), 'cambiare strategia non rompe il rendering');

/* 5. Playoff */
const T = {};
for (const k of TEAM_KEYS) T[k] = buildTeam(k, F.state.lineups[k], F.state.tactics[k]);
const { semis, reasons } = pickBracket(T);
await F.session.apply((s) => S.toPlayoffs(s, semis, reasons));
ok(clean() && has('Playoff', 'Semifinale 1', 'Semifinale 2'), 'il tabellone si disegna');
ok(has('Simula la serie'), 'le semifinali sono avviabili');

await F.session.apply((s) => S.revealSemi(s, 's1'));
await F.session.apply((s) => S.revealSemi(s, 's2'));
ok(clean() && has('Gara 1', 'MVP della serie', 'Perché ha vinto'), 'le semifinali mostrano gare, MVP e spiegazione');
ok(has('Box score'), 'il box score e consultabile');
ok(has('Apri le Finals'), 'le Finals si possono aprire');

const po = F.state.po;
const r1 = simSeries(T[po.s1.a], T[po.s1.b], po.s1.seed);
const r2 = simSeries(T[po.s2.a], T[po.s2.b], po.s2.seed);
const l1 = r1.winner === po.s1.a ? po.s1.b : po.s1.a;
const l2 = r2.winner === po.s2.a ? po.s2.b : po.s2.a;
await F.session.apply((s) => S.openFinal(s, r1.winner, r2.winner, l1, l2));
ok(clean() && has('Finals', 'Vai — Gara 1'), 'le Finals partono da gara 1, non simulate in blocco');

// Una gara alla volta, come chiedono le regole.
let steps = 0, sawStop = false;
while (steps++ < 8) {
  await F.session.apply((s) => S.advanceFinal(s));
  if (html().includes('Campione')) { sawStop = true; break; }
}
ok(sawStop, 'le Finals si chiudono e proclamano il campione', `${steps} gare`);
ok(clean() && has('MVP delle Finals'), 'l\'MVP delle Finals viene assegnato');
ok(has('Finale 3° / 4° posto'), 'compare la finalina fra le due eliminate');
await F.session.apply((s) => S.revealThird(s));
ok(clean() && has('MVP della serie'), 'la finalina si simula');
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

/* Controlli finali */
ok(!uncaught, 'nessuna eccezione non gestita', uncaught ? String(uncaught) : '');
ok(!html().includes('undefined') && !html().includes('NaN'), 'nessun "undefined" o "NaN" a schermo');
ok(!html().includes('{T}') && !html().includes('{player}'), 'nessun segnaposto non sostituito');

console.log(fails === 0 ? '\nInterfaccia OK su tutte le schermate.\n' : `\n${fails} problemi.\n`);
process.exit(fails === 0 ? 0 : 1);
