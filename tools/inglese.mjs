// inglese.mjs — la versione inglese non deve lasciarsi scappare l'italiano.
//
//   node tools/inglese.mjs
//
// Gioca una serata intera con l'app in inglese (lobby, asta, squadre,
// stagione regolare, playoff con pronostici, riepiloghi, campione, card,
// albo, rivalita) e passa al setaccio tutto il testo visibile — compresi
// title, aria-label e placeholder — cercando parole che esistono solo in
// italiano. Nomi di giocatori, allenatori e soprannomi si tolgono prima:
// "il dolph" e "No lo silben" sono nomi propri, non frasi da tradurre.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rj = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

// La lingua si legge all'avvio dei moduli: l'indirizzo va finto PRIMA.
globalThis.location = { search: '?lang=en', pathname: '/fanta-nba/en/', origin: 'https://example.test' };
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.document = { getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
globalThis.window = globalThis;

const L = await import('../js/lingua.js');
const core = await import('../js/core.js');
const a = rj('data/archetypes.json'), c = rj('data/coaches.json');
core.traduciDati(a, c, rj('data/en.json'));
const D = core.installData(rj('data/players.json'), a, c);
const E = await import('../js/engine.js');
const S = await import('../js/state.js');
const UI = await import('../js/ui.js');
const P = await import('../js/pronostici.js');
const SR = await import('../js/serie.js');
const { datiCard } = await import('../js/card.js');

let fails = 0;
const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails++;
};
ok(L.EN, 'l\'app si accende in inglese dall\'indirizzo /en/');

// Parole che in un testo inglese non hanno motivo di esserci.
const ITALIANO = /\b(della|delle|degli|dello|nella|nelle|alla|alle|il|gli|una|che|non|con|sono|squadr[ae]|gara|gare|giocator[ei]|crediti|partit[ae]|stagione|tattich[ae]|quintett[oi]|pronostic[oi]|campione|avanti|tocca|chiusa|ospita|rimbalzi|punti|allenatore|ritmo|violino|albo|tabellone|asta|rilancio|più|perché|già|anche|ancora|tutti|tutte|niente|nessun[oa]?|serata|oppure|entra|esci|cambia|fatto|scegli|vai|torna|simula|passa|turno|semifinale|finale|ritocca|stanza|attesa|vince|ha|è)\b/i;

const nomiPropri = [
  ...D.players.map((p) => p.n), ...D.coaches.map((x) => x.n), ...core.NOMI_SQUADRE,
  'Diego', 'Fabio', 'Steve', 'Agre', 'Nick', 'Ada', 'Bruno', 'Cleo', 'Dino', 'Enzo', 'Fanta NBA',
].sort((x, y) => y.length - x.length);

function testoVisibile(html) {
  const attr = [...html.matchAll(/\b(?:title|aria-label|placeholder)="([^"]*)"/g)].map((m) => m[1]);
  const corpo = html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, '\n');
  let t = [corpo, ...attr].join('\n')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  for (const n of nomiPropri) t = t.split(n).join(' ');
  return t;
}

const trovate = new Map();
function setaccio(nome, html) {
  for (const riga of testoVisibile(html).split('\n')) {
    const r = riga.trim();
    if (!r) continue;
    const m = ITALIANO.exec(r);
    if (m && !trovate.has(r)) trovate.set(r, `${nome}: «${r.slice(0, 120)}» (parola: ${m[0]})`);
  }
}
const disegna = (nome, s, session) => {
  const el = { innerHTML: '' };
  UI.render(el, { state: s, session });
  setaccio(nome, el.innerHTML);
  const bar = { innerHTML: '' };
  UI.renderTopbar(bar, { state: s, session });
  setaccio(`${nome} (barra)`, bar.innerHTML);
  return el.innerHTML;
};

/* ---------- una serata intera ---------- */
for (const conStagione of [false, true]) {
  let clock = 1e6; const tick = () => (clock += 1000);
  let s = S.newGame(`inglese${conStagione}`, 'host');
  const host = { uid: 'host', mode: 'room', code: 'AB12' };
  const io = { uid: 'io', mode: 'room', code: 'AB12' };
  const locale = { uid: 'host', mode: 'local', code: 'LOCALE' };
  disegna('lobby vuota', s, host);
  disegna('lobby locale', s, locale);
  s = S.joinGame(s, 'io', 'Diego');
  s = S.joinGame(s, 'host', 'Agre');
  s = S.aggiungiBot(s, 'ada');
  s = S.aggiungiBot(s, 'bruno');
  if (conStagione) s = S.setFormato(s, true);
  s = { ...s, albo: [{ seed: 'ieri', champion: 't1', runnerUp: 't2', championChi: 'Diego', runnerUpChi: 'Agre', championName: 'Bulls', runnerUpName: 'Jazz', rePronostici: 'Agre', wins: '4-2', mvp: 'Michael Jordan', serie: [{ a: 'Diego', b: 'Agre', va: 4, vb: 2 }, { a: 'Ada', b: 'Diego', va: 4, vb: 1 }] }] };
  s = S.daiBonus(s, s.seats.io);
  core.applicaNomi(s.seed, s.nomi, S.personeAlTavolo(s));
  disegna('lobby piena (chi ospita)', s, host);
  disegna('lobby (seduto)', s, io);
  disegna('lobby (fuori)', s, { uid: 'altro', mode: 'room', code: 'AB12' });

  s = S.startAuction(s, tick());
  disegna('asta', s, io);
  disegna('asta (chi ospita)', s, host);
  s = S.placeBid(s, s.seats.io, 2, tick());
  disegna('asta con offerta', s, io);
  UI.ui.manualOpen = true;
  disegna('asta a mano', s, host);
  UI.ui.manualOpen = false;
  s = S.pauseAuction(s, tick());
  disegna('asta in pausa', s, host);
  s = S.resumeAuction(s, tick());
  const IN = S.attive(s);
  let g = 0;
  while (s.phase === 'auction' && g++ < 4000) {
    const k = IN.filter((t) => S.slotsLeft(s, t) > 0)[g % IN.length] || IN.find((t) => S.slotsLeft(s, t) > 0);
    if (!k) break;
    s = S.placeBid(s, k, Math.max(1, Math.min(S.maxBid(s, k), 1 + ((g * 7) % 23))), tick());
    s = S.resolveLot(s, tick());
  }
  disegna('squadre', s, io);
  UI.ui.editLineup = s.seats.io;
  disegna('squadre (modifica)', s, io);
  UI.ui.editLineup = null;
  UI.ui.scheda = s.teams[s.seats.io].roster[0];
  disegna('scheda giocatore', s, io);
  UI.ui.scheda = null;
  if (conStagione) {
    s = S.giocaStagione(s, E.giriStagione(IN.length));
    disegna('dopo la stagione', s, host);
  }
  const T = {};
  for (const k of IN) T[k] = E.buildTeam(k, s.lineups[k], s.tactics[k]);
  const st = conStagione ? UI.stagioneFromState(s) : null;
  s = S.toPlayoffs(s, st ? E.tabelloneDaStagione(T, st.cls, s.seed) : E.componiTabellone(T, s.seed));
  disegna('playoff, prima di gara 1 (seduto)', s, io);
  disegna('playoff, prima di gara 1 (chi ospita)', s, host);
  disegna('playoff, prima di gara 1 (locale)', s, locale);
  // pronostici di tutti
  for (const x of SR.ordineSerie(s, T).filter((y) => y.a && y.b && y.giocate === 0)) {
    const q = P.quoteSerie(T[x.a], T[x.b], x.seed);
    for (const k of IN) {
      const p = P.pronosticoBot(q);
      s = S.pronostica(S.pronostica(s, k, x.id, 'e', p.e), k, x.id, 'm', p.m);
    }
  }
  disegna('playoff, pronostici fatti', s, io);
  // gioca tutto seguendo "Avanti", e guarda ogni passaggio
  for (let passi = 0; passi < 30; passi++) {
    const x = SR.serieCorrente(s, T);
    if (!x.f.done) {
      s = x.id === 'third' ? S.advanceThird(s, 1) : S.advanceSeries(s, x.r, x.i, 1);
      disegna(`playoff ${x.id} gara ${x.giocate + 1}`, s, io);
      if (x.giocate === 2) { UI.ui.garaVista = { serie: x.id, g: 0, n: 3 }; disegna('gara vecchia', s, io); UI.ui.garaVista = null; }
      continue;
    }
    disegna(`riepilogo ${x.id} (chi ospita)`, s, host);
    disegna(`riepilogo ${x.id}`, s, io);
    const strade = SR.dopo(s, T, x);
    if (!strade.length) break;
    const st0 = strade[0];
    s = st0.id === 'third' ? S.vaiASerie(S.openThird(s, st0.a, st0.b), 'third') : S.vaiASerie(s, st0.id);
  }
  const fine = disegna('serata finita', s, host);
  ok(/Champion/.test(fine), `la serata ${conStagione ? 'con stagione ' : ''}si chiude con il campione`);
  setaccio('rivela', UI.rivelaCampione(s));
  const d = datiCard(s, T);
  setaccio('card', [d.squadra, d.soprannome, d.finale, d.testo, ...d.riquadri.flatMap((r) => [r.tit, r.nome, r.riga]), ...d.classifica.map((r) => r.roast)].join('\n'));
}

// Le stringhe d'errore e di rete non passano dal disegno: si controllano qui.
setaccio('fase sconosciuta', (() => { const el = { innerHTML: '' }; UI.render(el, { state: { phase: 'boh' }, session: { uid: 'x', mode: 'room' } }); return el.innerHTML; })());

for (const r of trovate.values()) console.log(`  italiano rimasto → ${r}`);
ok(trovate.size === 0, 'nessuna scritta italiana in tutta la serata', `${trovate.size} righe`);
console.log(fails ? `\n${fails} problemi.\n` : '\nVersione inglese pulita.\n');
process.exit(fails ? 1 : 0);
