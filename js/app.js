// app.js — avvio, risoluzione della stanza, un solo handler per tutti i click.

import { loadData, TEAM_KEYS, TEAM_NAMES, applicaNomi } from './core.js';
import { simSeriesUpTo, componiTabellone, costruisciBracket, giriStagione, tabelloneDaStagione, RITMI } from './engine.js';
import * as S from './state.js';
import { openRoom, makeRoomCode, cloudAvailable, now } from './net.js';
import { render, renderTopbar, tickClock, ui, teamsFromState, stagioneFromState, esc } from './ui.js';
import { sblocca, commutaAudio, tic, martelletto, nuovoLotto } from './suono.js';

const root = document.getElementById('app');
const topbar = document.getElementById('topbar');

let session = null;
let state = null;
let clockTimer = null;

/* ==========================================================
   Avvio
   ========================================================== */

boot().catch(fatal);

async function boot() {
  await loadData();

  const params = new URLSearchParams(location.search);
  const code = (params.get('r') || '').toUpperCase().trim();

  if (!cloudAvailable()) return start({ code: 'LOCALE', create: true });
  if (code) return start({ code, create: false }).catch((e) => landing(e.message));
  landing();
}

function landing(errMsg) {
  root.innerHTML = `
    <h1>Fanta NBA</h1>
    <p class="muted mb">Asta a crediti, quintetti, playoff simulati. Da 2 a 12 squadre, 50 crediti, 5 giocatori a testa.</p>
    ${errMsg ? `<div class="banner err">${esc(errMsg)}</div>` : ''}
    <div class="card">
      <h3 class="mb">Crea una partita</h3>
      <p class="small muted mb">Generi un codice e lo passi agli altri.</p>
      <button class="primary wide" data-act="create-room">Crea la stanza</button>
    </div>
    <div class="card">
      <h3 class="mb">Entra in una partita</h3>
      <div class="row">
        <input id="join-code" placeholder="CODICE" maxlength="4"
               style="text-transform:uppercase;letter-spacing:4px;font-weight:800" autocomplete="off">
        <button data-act="join-room">Entra</button>
      </div>
    </div>`;
  topbar.innerHTML = '<div class="brand">FANTA<span>NBA</span></div>';
}

async function start({ code, create }) {
  session = await openRoom({
    code, create,
    initialState: S.newGame(`${code}-${Date.now()}`, null),
    onState: (s) => { state = s; paint(); },
  });
  if (create && cloudAvailable()) history.replaceState({}, '', `?r=${code}`);
  paint(); // il primo onState puo arrivare prima che session sia assegnata
  startClock();
}

function paint() {
  if (!state || !session) return;
  // I nomi girano a ogni partita e si estraggono dal seed: vanno rimessi a
  // posto prima di disegnare, perche il seed cambia con "Nuova partita".
  applicaNomi(state.seed);
  const ctx = { state, session };
  renderTopbar(topbar, ctx);
  render(root, ctx);
  tickClock(state);
  suoniDiStato();
  seguiLaPartita();
  tieniIlPosto();
  registraAlbo();
}

// Scegliere un allenatore ridisegna la schermata, e la striscia tornerebbe
// da capo: avresti scorso fino al quinto, toccato "Scegli", e ti ritroveresti
// a guardare il primo. Dopo ogni ridisegno la carta scelta si rimette dov'era.
function tieniIlPosto() {
  for (const strip of root.querySelectorAll('[data-coach-strip]')) {
    const scelta = strip.querySelector('[data-coach-scelto]');
    if (scelta) strip.scrollLeft = scelta.offsetLeft - strip.offsetLeft;
  }
}

// Chi guarda e basta restava fermo su gara 1 mentre il tavolo era a gara 6:
// le gare nuove si aprono sotto e spingono giu la pagina, e senza scrollare
// non te ne accorgi. Quando il conto delle gare scoperte cresce, l'ultima si
// porta in vista da sola. Solo quando CRESCE: altrimenti a ogni ridisegno
// strapperebbe via la pagina da sotto le dita.
let gareViste = null;

function seguiLaPartita() {
  if (state.phase !== 'playoffs') { gareViste = null; return; }
  const tot = (state.po?.turni || []).flat().reduce((s, m) => s + (m.gamesPlayed || 0), 0)
    + (state.po?.third?.gamesPlayed || 0);
  const prima = gareViste;
  gareViste = tot;
  if (prima === null || tot <= prima) return;
  // La serie ancora aperta e quella da leggere. Se sono tutte chiuse, l'ultima
  // in ordine di tabellone: e li che e appena successo qualcosa.
  const tutte = root.querySelectorAll('[data-ultima-gara]');
  const el = root.querySelector('[data-ultima-gara="viva"]') || tutte[tutte.length - 1];
  if (el?.scrollIntoView) {
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { el.scrollIntoView(); }
  }
}

// L'albo si scrive da se quando le Finals si chiudono. Il risultato non sta
// nel database (c'e solo il seed), quindi va ricalcolato qui e poi salvato.
// Lo fa solo chi ospita, e l'inserimento e idempotente sul seed: qualunque
// strada porti a questo punto, la partita finisce nell'albo una volta sola.
async function registraAlbo() {
  if (!state.po?.turni?.length || state.host !== session.uid) return;
  try {
    const T = teamsFromState(state);
    // La finale e l'unica serie dell'ultimo turno, qualunque sia il formato.
    const turni = costruisciBracket(state.po, T);
    const f = turni[turni.length - 1]?.[0];
    const r = f?.res;
    if (!r?.done) return;
    if ((state.albo || []).some((e) => e.seed === f.seed)) return;
    const perdente = r.winner === f.a ? f.b : f.a;
    const voce = {
      seed: f.seed,
      quando: Date.now(),
      champion: r.winner,
      championName: TEAM_NAMES[r.winner],
      runnerUp: perdente,
      runnerUpName: TEAM_NAMES[perdente],
      wins: `${Math.max(r.wins.a, r.wins.b)}-${Math.min(r.wins.a, r.wins.b)}`,
      mvp: r.mvp?.n || null,
      roster: T[r.winner].five.map((p) => p.n),
      squadre: state.po.n,
    };
    await session.apply((s) => S.recordAlbo(s, voce));
  } catch (err) {
    console.error('albo:', err);
  }
}

function fatal(err) {
  console.error(err);
  root.innerHTML = `<div class="banner err"><b>Qualcosa non va.</b><br>${esc(err.message)}</div>`;
}

/* ==========================================================
   iOS: tenere la barra dei rilanci sopra la toolbar di Safari
   ========================================================== */

// Su iOS "position: fixed; bottom: 0" si ancora al viewport di LAYOUT, che si
// estende dietro la barra degli indirizzi: i tasti finivano tagliati a metà.
// env(safe-area-inset-bottom) non basta, copre solo la tacca del gesto.
// La differenza fra innerHeight e il viewport VISIBILE dice di quanto alzarla.
function syncViewportInset() {
  const vv = window.visualViewport;
  if (!vv) return;
  const nascosto = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  document.documentElement.style.setProperty('--vv-bottom', `${nascosto}px`);
}

if (typeof window !== 'undefined' && window.visualViewport) {
  const vv = window.visualViewport;
  vv.addEventListener('resize', syncViewportInset);
  vv.addEventListener('scroll', syncViewportInset);
  // Dopo la rotazione Safari assesta la toolbar con qualche frame di ritardo.
  window.addEventListener('orientationchange', () => setTimeout(syncViewportInset, 300));
  syncViewportInset();
}

/* ==========================================================
   Cronometro dell'asta
   ========================================================== */

let ultimoTic = null;   // secondo su cui abbiamo gia suonato
let ultimoLotto = null; // indice del lotto gia annunciato

function startClock() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    if (!state || state.phase !== 'auction') { ultimoTic = null; return; }
    const left = tickClock(state);
    if (state.auction.paused) return; // il cronometro è fermo per tutti

    // Un tic per ogni secondo degli ultimi cinque, una volta sola.
    if (left !== null && left > 0) {
      const sec = Math.ceil(left / 1000);
      if (sec <= 5 && sec !== ultimoTic) { ultimoTic = sec; tic(sec); }
    }

    // Solo chi ospita chiude il lotto: se lo facessero tutti, quattro
    // transazioni contemporanee proverebbero ad assegnare lo stesso giocatore.
    if (left !== null && left <= 0 && state.host === session.uid) {
      session.apply((s) => (s.auction.running && s.auction.deadline <= now() ? S.resolveLot(s, now()) : undefined));
    }
  }, 250);
}

// Il suono segue lo STATO, non il click: cosi lo sentono tutti e quattro,
// non solo chi ha premuto il tasto.
let ultimiAcquisti = null;

function suoniDiStato() {
  if (!state || state.phase !== 'auction') { ultimoLotto = null; ultimiAcquisti = null; return; }
  const idx = state.auction.idx;
  const acquisti = state.auction.log.length;
  if (ultimoLotto === null) { ultimoLotto = idx; ultimiAcquisti = acquisti; return; } // muti all'ingresso

  if (idx !== ultimoLotto) {
    // Se il registro degli acquisti e cresciuto il lotto e stato aggiudicato,
    // altrimenti e stato saltato e il martelletto non ha senso.
    if (acquisti > ultimiAcquisti) martelletto();
    ultimoLotto = idx;
    ultimiAcquisti = acquisti;
    ultimoTic = null;
    setTimeout(() => nuovoLotto(), 430);
  }
}

/* ==========================================================
   Azioni
   ========================================================== */

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const team = el.dataset.team;
  ui.banner = null;
  sblocca(); // iOS tiene l'audio sospeso finché non c'è un gesto dell'utente

  // "avanza:2:0" = turno 2, serie 0. I turni sono variabili, quindi la serie
  // si indirizza con la posizione invece che con un nome fisso.
  if (act.startsWith('avanza:')) {
    const [, r, i] = act.split(':').map(Number);
    const ultimo = r === (state.po?.turni?.length ?? 1) - 1;
    await session.apply((s) => S.advanceSeries(s, r, i, ultimo ? S.PASSO_FINALE : S.PASSO_SEMI));
    return;
  }

  try {
    switch (act) {
      /* --- landing --- */
      case 'create-room':
        el.disabled = true;
        await start({ code: makeRoomCode(), create: true });
        break;

      case 'join-room': {
        const c = (document.getElementById('join-code')?.value || '').toUpperCase().trim();
        if (c.length !== 4) return flash('Il codice è di 4 caratteri.', true);
        el.disabled = true;
        try { await start({ code: c, create: false }); }
        catch (e) { el.disabled = false; landing(e.message); }
        break;
      }

      case 'copy-link':
        await navigator.clipboard.writeText(`${location.origin}${location.pathname}?r=${session.code}`);
        flash('Link copiato.');
        break;

      /* --- lobby --- */
      // Non si sceglie la squadra: si entra e te ne viene data una.
      case 'join': {
        const nick = (document.getElementById('nick')?.value || '').trim();
        if (!nick) return flash('Scrivi il tuo nome per entrare.', true);
        ui.nickname = nick;
        localStorage.setItem('nbaf:nick', nick);
        const ok = await session.apply((s) => S.joinGame(s, session.uid, nick));
        if (!ok) flash('Tutte le squadre sono gia assegnate.', true);
        break;
      }

      // Serve davvero: se entrate in cinque nessuno puo iniziare, e senza
      // questo tasto uno dovrebbe chiudere la scheda per liberare il posto.
      case 'leave':
        await session.apply((s) => (s.phase === 'lobby' ? S.leaveSeat(s, session.uid) : undefined));
        break;

      case 'num-squadre':
        ui.numSquadre = Number(el.dataset.n);
        paint();
        break;

      case 'start-auction': {
        // In locale le squadre le sceglie chi ospita; in stanza sono quelle sedute.
        const inGioco = session.mode === 'local'
          ? TEAM_KEYS.slice(0, ui.numSquadre || 4)
          : null;
        const ok = await session.apply((s) => (s.phase === 'lobby' ? S.startAuction(s, now(), inGioco) : undefined));
        if (!ok) flash('Numero di squadre non ammesso: si gioca in 2, 3, 4, 6, 8, 10 o 12.', true);
        break;
      }

      /* --- asta --- */
      case 'bid': {
        const amt = Number(el.dataset.amt);
        ui.allIn = null;
        const ok = await session.apply((s) => {
          if (!S.canBid(s, team, amt)) return undefined;
          return S.placeBid(s, team, amt, now());
        });
        if (!ok) flash('Rilancio non valido: qualcuno ti ha preceduto.', true);
        break;
      }

      // Chi ospita molte squadre sceglie prima per chi sta rilanciando.
      case 'pick-team':
        ui.bidTeam = team;
        ui.allIn = null;
        paint();
        break;

      // Primo tocco arma, secondo conferma. L'armamento decade da solo appena
      // qualcun altro rilancia, così non offri alla cieca su un prezzo vecchio.
      case 'arm-allin':
        ui.allIn = { team, at: state.auction.bid ? state.auction.bid.amount : 0 };
        paint();
        break;

      case 'toggle-audio':
        commutaAudio();
        paint();
        break;

      case 'toggle-pause':
        await session.apply((s) => (s.auction.paused ? S.resumeAuction(s, now()) : S.pauseAuction(s, now())));
        break;

      case 'resolve':
        await session.apply((s) => (s.auction.running ? S.resolveLot(s, now()) : undefined));
        break;

      case 'pass': {
        // Scartare con un'offerta valida sul tavolo butta via quell'offerta:
        // vale una conferma, perché non si torna indietro.
        const b = state.auction.bid;
        if (b && !confirm(`Saltare? L'offerta di ${b.amount} di ${S.TEAM_NAMES[b.team]} viene annullata e il giocatore non va a nessuno.`)) break;
        await session.apply((s) => (s.phase === 'auction' ? S.passLot(s, now()) : undefined));
        break;
      }

      case 'toggle-manual':
        ui.manualOpen = !ui.manualOpen;
        paint();
        break;

      case 'manual-award': {
        const t = document.getElementById('m-team')?.value;
        const price = Number(document.getElementById('m-price')?.value);
        if (!t || !Number.isFinite(price) || price < 0) return flash('Prezzo non valido.', true);
        const pid = S.currentPlayerId(state);
        const ok = await session.apply((s) => {
          if (price > s.teams[t].credits) return undefined;
          return S.award(s, pid, t, price, now());
        });
        ui.manualOpen = false;
        if (!ok) flash('Assegnazione rifiutata: budget insufficiente o rosa piena.', true);
        else paint();
        break;
      }

      case 'to-squadra':
        await session.apply((s) => S.toSquadra(s));
        break;

      // Il quintetto e in sola lettura: si sblocca solo se lo si chiede.
      case 'toggle-lineup':
        ui.editLineup = ui.editLineup === team ? null : team;
        ui.selSlot = null;
        paint();
        break;

      /* --- quintetti --- */
      case 'pick-slot': {
        const slot = el.dataset.slot;
        const sel = ui.selSlot;
        if (sel && sel.team === team && sel.slot !== slot) {
          ui.selSlot = null;
          await session.apply((s) => S.swapSlots(s, team, sel.slot, slot));
        } else {
          ui.selSlot = sel && sel.team === team && sel.slot === slot ? null : { team, slot };
          paint();
        }
        break;
      }

      case 'auto-lineup':
        await session.apply((s) => ({
          ...s,
          lineups: { ...s.lineups, [team]: S.autoLineup(s.teams[team].roster) },
        }));
        break;


      /* --- allenatore (il ritmo e uno slider: vive nell'handler change) --- */
      case 'set-coach':
        await session.apply((s) => S.setTactics(s, team, { coach: el.dataset.v }));
        break;

      // Le frecce spostano la striscia di una carta. Non tocca lo stato
      // condiviso: guardare gli allenatori non e sceglierli.
      case 'coach-scorri': {
        const strip = document.getElementById(`coaches-${team}`);
        const carta = strip?.querySelector('.ccard');
        if (strip && carta) strip.scrollBy({ left: Number(el.dataset.dir) * (carta.offsetWidth + 10), behavior: 'smooth' });
        break;
      }

      /* --- formato e stagione regolare --- */
      case 'formato':
        await session.apply((s) => S.setFormato(s, el.dataset.con === '1'));
        break;

      case 'gioca-stagione': {
        if (!S.squadraReady(state)) return flash('Servono primo violino, secondo violino e strategia per ogni squadra.', true);
        const giri = giriStagione(S.attive(state).length);
        const ok = await session.apply((s) => S.giocaStagione(s, giri));
        if (!ok) flash('La stagione regolare è già stata giocata.', true);
        break;
      }

      /* --- playoff --- */
      case 'to-playoffs': {
        if (!S.squadraReady(state)) return flash('Servono primo violino, secondo violino e strategia per ogni squadra.', true);
        // Con la stagione regolare il tabellone si semina dalla classifica e
        // nessuno salta un turno; senza, le teste di serie si sorteggiano.
        const st = stagioneFromState(state);
        const tab = st
          ? tabelloneDaStagione(teamsFromState(state), st.cls, state.seed)
          : componiTabellone(teamsFromState(state), state.seed);
        await session.apply((s) => S.toPlayoffs(s, tab));
        break;
      }

      case 'avanza-third':
        await session.apply((s) => S.advanceThird(s, S.PASSO_SEMI));
        break;

      // Il tabellone ha un numero variabile di turni: la serie si identifica
      // con turno e posizione, non con un nome fisso.
      case 'open-third': {
        const turni = costruisciBracket(state.po, teamsFromState(state));
        const semi = turni[turni.length - 2];
        if (!semi || semi.length !== 2) break;
        const perdenti = semi.map((m) => (m.res.winner === m.a ? m.b : m.a));
        await session.apply((s) => S.openThird(s, perdenti[0], perdenti[1]));
        break;
      }

      case 'new-game': {
        if (!confirm('Ricominciare da capo?\n\nLa partita in corso viene cancellata: asta, quintetti e playoff.')) break;
        if (session.mode === 'local') {
          // In locale lo stato vive in localStorage: si cancella e si ricarica.
          session.reset();
          location.reload();
        } else {
          // In stanza l'azzeramento vale per tutti, ma le sedie restano assegnate.
          await session.apply((s) => (s.host === session.uid ? S.resetGame(s, `${session.code}-${Date.now()}`) : undefined));
        }
        break;
      }


      default: break;
    }
  } catch (err) {
    console.error(err);
    flash(err.message, true);
  }
});

document.addEventListener('change', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const team = el.dataset.team;
  const v = el.value;
  // Il ritmo e una barra: il valore e l'indice, non il nome. Si scrive sullo
  // stato al rilascio (change) e non a ogni pixel (input), o si manderebbero
  // venti scritture al database per una sola scelta.
  const patch = el.dataset.act === 'set-ritmo'
    ? { ritmo: Object.keys(RITMI)[Number(v)] }
    : { 'set-v1': { v1: v }, 'set-v2': { v2: v }, 'set-strat': { strategy: v } }[el.dataset.act];
  if (!patch) return;
  await session.apply((s) => S.setTactics(s, team, patch));
});

function flash(text, err = false) {
  ui.banner = { text, err };
  paint();
  setTimeout(() => { if (ui.banner?.text === text) { ui.banner = null; paint(); } }, 3500);
}

// Utile per correggere i dati dalla console senza toccare il codice.
window.FANTA = {
  get state() { return state; },
  get session() { return session; },
  TEAM_KEYS,
};
