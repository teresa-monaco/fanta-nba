// app.js — avvio, risoluzione della stanza, un solo handler per tutti i click.

import { loadData, TEAM_KEYS, TEAM_NAMES, applicaNomi, NOMI_SQUADRE } from './core.js';
import { simSeriesUpTo, componiTabellone, costruisciBracket, giriStagione, tabelloneDaStagione, RITMI } from './engine.js';
import * as S from './state.js';
import { openRoom, makeRoomCode, cloudAvailable, now } from './net.js';
import { render, renderTopbar, tickClock, ui, teamsFromState, stagioneFromState, esc, flapHTML, rivelaCampione } from './ui.js';
import { sblocca, commutaAudio, tic, martelletto, nuovoLotto } from './suono.js';
import * as BotAI from './bot.js';
import { serieDelTabellone, aperta, pronosticoBot } from './pronostici.js';
import { datiCard, disegnaCard, LARGHEZZA, ALTEZZA } from './card.js';

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

// Le lettere a paletta su un tabellone gia a schermo: una per volta da
// sinistra, o sarebbe un lampeggio invece di un tabellone che gira.
function scriviFlap(box, testo, animare) {
  if (!box) return;
  box.innerHTML = flapHTML(testo);
  if (!animare) return;
  box.querySelectorAll('span').forEach((s, i) => setTimeout(() => s.classList.add('gira'), i * 45));
}

// Il tabellone della schermata d'ingresso vive di suo: due squadre e i
// ventiquattro secondi che scorrono. Non e decorazione — i nomi sono quelli
// veri che puoi ricevere, quindi si impara cosa aspettarsi prima di entrare.
let vetrinaTimer = null;
let sfida = null;

function pescaNome(fuori) {
  const liberi = NOMI_SQUADRE.filter((n) => n !== fuori);
  return liberi[Math.floor(Math.random() * liberi.length)];
}

function fermaVetrina() {
  if (vetrinaTimer) { clearInterval(vetrinaTimer); vetrinaTimer = null; }
}

function avviaVetrina() {
  fermaVetrina();
  let sec = 24;
  vetrinaTimer = setInterval(() => {
    const casaEl = document.getElementById('flap-casa');
    const ospEl = document.getElementById('flap-ospiti');
    // Se la schermata e cambiata il tabellone non c'e piu: si spegne da solo
    // invece di lasciare un timer acceso a vuoto.
    if (!casaEl || !ospEl) { fermaVetrina(); return; }
    if (sec <= 1) {
      sec = 24;
      sfida = { casa: pescaNome(sfida.ospiti), ospiti: null };
      sfida.ospiti = pescaNome(sfida.casa);
      scriviFlap(casaEl, sfida.casa, true);
      scriviFlap(ospEl, sfida.ospiti, true);
    } else sec -= 1;
    const nEl = document.getElementById('clock24');
    if (nEl) nEl.textContent = sec;
  }, 1000);
}

function landing(errMsg) {
  const casa = pescaNome(null);
  sfida = { casa, ospiti: pescaNome(casa) };
  root.innerHTML = `
    ${errMsg ? `<div class="banner err">${esc(errMsg)}</div>` : ''}
    <div class="jumbo">
      <div class="insegna">Fanta NBA</div>
      <div class="pannelli">
        <div class="pan casa">
          <div class="lab">Casa</div>
          <div class="flap mini" id="flap-casa">${flapHTML(sfida.casa)}</div>
        </div>
        <div class="clock24"><div class="n" id="clock24">24</div><div class="lab">sec</div></div>
        <div class="pan ospiti">
          <div class="lab">Ospiti</div>
          <div class="flap mini" id="flap-ospiti">${flapHTML(sfida.ospiti)}</div>
        </div>
      </div>
    </div>
    <p class="small muted center mt">Asta a crediti, quintetti, playoff simulati.
      Da 2 a 12 squadre, 50 crediti e 5 giocatori a testa.</p>
    <button class="primary wide mt" data-act="create-room">Crea la stanza</button>
    <div class="oppure">oppure</div>
    <div class="row">
      <input id="join-code" placeholder="CODICE" maxlength="4" class="grow"
             style="text-transform:uppercase;letter-spacing:4px;font-weight:800" autocomplete="off">
      <button data-act="join-room">Entra</button>
    </div>`;
  topbar.innerHTML = '<div class="brand">FANTA<span>NBA</span></div>';
  avviaVetrina();
}

async function start({ code, create }) {
  fermaVetrina();   // si esce dalla schermata d'ingresso: il tabellone non serve piu
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
  // In coda arrivano i cambi fatti a mano in lobby, che stanno nello stato.
  applicaNomi(state.seed, state.nomi);
  const ctx = { state, session };
  renderTopbar(topbar, ctx);
  render(root, ctx);
  effettiNomi();
  tornaInCima();
  effettoPallina();
  effettoSuperato();
  tickClock(state);
  suoniDiStato();
  // Anche a ogni ridisegno, non solo sul timer: cosi un bot reagisce subito
  // a un cambiamento di stato invece di aspettare il prossimo giro.
  guidaBot();
  seguiLaPartita();
  momentoCampione();
  tieniIlPosto();
  registraAlbo();
}

// IL MOMENTO DEL CAMPIONE. Si apre una volta sola, nel momento in cui la
// finale si chiude, a schermo intero sopra tutto il resto.
//
// Vive fuori da render(), appeso al body: dentro la pagina il primo
// ridisegno lo cancellerebbe. E si apre solo sul PASSAGGIO da "finale
// aperta" a "finale chiusa": chi rientra in stanza un'ora dopo trova il
// banner in cima, non una festa che non ha visto succedere.
let finaleVista = null;
let rivelaTimer = null;

function chiudiRivela() {
  if (rivelaTimer) { clearTimeout(rivelaTimer); rivelaTimer = null; }
  document.querySelectorAll('.rivela').forEach((el) => el.remove());
}

// LA CARD DELLA SERATA. Dal telefono si apre la condivisione di sistema, e
// l'immagine va dritta in WhatsApp o dove si vuole; dal computer, che quella
// finestra non ce l'ha, si scarica. I font sono gia quelli della pagina: si
// aspetta solo che siano pronti, o il canvas scriverebbe in Arial.
async function condividiSerata() {
  const d = datiCard(state, teamsFromState(state));
  if (!d) return;
  try {
    await Promise.all(['800 40px "Saira Condensed"', '700 40px "Saira Condensed"', '500 30px Barlow', '600 30px Barlow']
      .map((f) => document.fonts?.load?.(f)));
  } catch { /* si disegna lo stesso, col font di riserva */ }
  const cv = document.createElement('canvas');
  cv.width = LARGHEZZA; cv.height = ALTEZZA;
  // I colori delle squadre si leggono dal CSS: stanno li e solo li.
  const st = getComputedStyle(document.documentElement);
  const colori = {};
  for (const k of TEAM_KEYS) { const c = st.getPropertyValue(`--${k}`).trim(); if (c) colori[k] = c; }
  disegnaCard(cv.getContext('2d'), d, colori);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  if (!blob) return flash('Non sono riuscito a creare l\'immagine.', true);
  const nome = `fanta-nba-${d.squadra.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  const file = new File([blob], nome, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text: d.testo }); return; }
    catch (e) { if (e?.name === 'AbortError') return; /* altrimenti si scarica */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  flash('Immagine salvata.');
}

function momentoCampione() {
  if (!state || state.phase !== 'playoffs' || !state.po) { finaleVista = null; return; }
  let chiusa = false;
  try {
    const T = teamsFromState(state);
    const turni = costruisciBracket(state.po, T);
    chiusa = !!turni[turni.length - 1]?.[0]?.res?.done;
  } catch { return; }
  const prima = finaleVista;
  finaleVista = chiusa;
  if (prima !== false || !chiusa) return;   // solo sul passaggio, mai all'ingresso

  const html = rivelaCampione(state);
  if (!html || typeof document.body?.insertAdjacentHTML !== 'function') return;
  chiudiRivela();
  document.body.insertAdjacentHTML('beforeend', html);
  // Si chiude da sola dopo un po', se nessuno tocca: un telefono lasciato sul
  // tavolo non deve restare bloccato su una festa.
  rivelaTimer = setTimeout(chiudiRivela, 9000);
}

// CAMBIANDO SCHERMATA SI TORNA IN CIMA.
//
// Lo schermo nero di due secondi passando ai playoff non era una
// simulazione lenta — misurata, costa tre millisecondi. Era lo scroll: la
// schermata delle squadre in quattro e lunghissima, quella dei playoff no, e
// il browser si tiene la posizione. Ci si ritrovava sotto la fine del
// contenuto, cioe sul fondo vuoto della pagina, finche non si scorreva su.
//
// Solo quando la FASE cambia: a ogni ridisegno strapperebbe via la pagina da
// sotto le dita mentre la si sta leggendo.
let faseVista = null;

function tornaInCima() {
  if (state.phase === faseVista) return;
  faseVista = state.phase;
  // Il ripiego chiamava la stessa funzione che era appena fallita, quindi
  // rilanciava fuori dal catch: una riga di cortesia che poteva far cadere
  // tutto il disegno. Si controlla prima che esista.
  if (typeof window.scrollTo !== 'function') return;
  try { window.scrollTo({ top: 0, behavior: 'auto' }); }
  catch { try { window.scrollTo(0, 0); } catch { /* vecchi browser: pazienza */ } }
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
  // Solo i punteggi della gara appena scoperta, e il tabellone della SUA
  // serie: sono gli unici dove qualcosa e cambiato. Con due semifinali
  // aperte, far ripartire anche l'altra sarebbe un tabellone impazzito.
  el?.querySelectorAll?.('[data-pt]').forEach(contaPunteggio);
  el?.closest?.('.card.serie')?.querySelectorAll('.serie-jumbo [data-pt]')
    .forEach(contaPunteggio);
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
    // Per le rivalita fra serate servono TUTTE le serie, non solo la finale,
    // e col nome di chi giocava invece della sedia: le sedie possono cambiare
    // padrone da una serata all'altra, le persone no. Chi ospita e il nome
    // scritto in lobby; un bot si chiama come si chiama.
    const chi = (k) => S.nameOfSeat(state, k) || TEAM_NAMES[k];
    const serie = turni.flat().filter((m) => m.res?.done && m.a && m.b)
      .map((m) => ({ a: chi(m.a), b: chi(m.b), va: m.res.wins.a, vb: m.res.wins.b }));
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
      championChi: chi(r.winner),
      runnerUpChi: chi(perdente),
      serie,
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
    // I bot vanno mossi PRIMA delle uscite anticipate qui sotto. Stavano in
    // fondo, e cosi non si muovevano mai fuori dall'asta: nella fase delle
    // squadre restavano fermi senza scegliere la tattica, e la partita si
    // bloccava li. Non sono un pezzo del cronometro, non devono dipenderne.
    guidaBot();

    if (!state || state.phase !== 'auction') { ultimoTic = null; return; }

    // Il tempo si legge dallo STATO, il disegno e un'altra cosa. Prima si
    // leggeva dal valore di ritorno di tickClock, che vale null quando non
    // trova l'elemento del cronometro: bastava un ridisegno storto e chi
    // ospita smetteva di chiudere i lotti, in silenzio.
    const left = S.tempoRimasto(state, now());
    tickClock(state);
    effettoPallina();   // l'apertura dipende dal tempo, quindi va seguita a ogni tic
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

/* ==========================================================
   I bot
   ==========================================================

   Li muove SOLO chi ospita, per lo stesso motivo per cui solo lui chiude i
   lotti: se li muovessero tutti i device, quattro browser proverebbero a
   rilanciare per lo stesso bot. Passano dagli stessi reducer di tutti gli
   altri — canBid, la regola di riserva, il tetto — quindi non possono fare
   niente che non sia permesso anche a una persona. */

const memoriaBot = {};   // per bot: il lotto gia valutato e quando si sveglia
let botOccupato = false; // una scrittura alla volta, o si accavallano
const serieViste = { firma: null, T: null, lista: [] }; // per i pronostici dei bot

async function guidaBot() {
  if (!state || !session || state.host !== session.uid || botOccupato) return;
  const squadreBot = S.botDi(state).filter((k) => S.attive(state).includes(k));
  if (!squadreBot.length) return;

  botOccupato = true;
  try {
    if (state.phase === 'auction') {
      // Uno per giro: due rilanci nello stesso istante si annullerebbero a
      // vicenda nella transazione, e si vedrebbe.
      for (const k of squadreBot) {
        const q = BotAI.offerta(state, k, S, Date.now(), memoriaBot);
        if (q == null) continue;
        await session.apply((s) => (S.canBid(s, k, q) ? S.placeBid(s, k, q, now()) : undefined));
        return;
      }
      // Nessun bot vuole rilanciare: quelli a cui il giocatore non interessa
      // votano per saltarlo, se no il tavolo non arriverebbe mai
      // all'unanimita e il lotto finirebbe sempre assegnato d'ufficio.
      for (const k of squadreBot) {
        if (!BotAI.vuoleSaltare(state, k, S, memoriaBot)) continue;
        if (state.auction.skipVoti?.[k]) continue;
        await session.apply((s) => S.votaSkip(s, k, now()));
        return;
      }
    } else if (state.phase === 'squadra') {
      for (const k of squadreBot) {
        // Si rifa solo se e cambiato qualcosa da cui dipende la risposta.
        const firma = S.attive(state).map((o) => `${state.teams[o].roster.join('.')}`).join('|');
        const m = memoriaBot[k] || (memoriaBot[k] = {});
        if (m.firmaTattica === firma) continue;
        const best = BotAI.tatticaBot(state, k, S);
        if (!best) continue;
        // Anche i bot dicono quando hanno finito, nello stesso momento in
        // cui applicano la tattica: senza, il conto in cima direbbe per
        // sempre "in attesa di Ada" e chi ospita aspetterebbe un telefono
        // che non esiste.
        const ok = await session.apply((s) => {
          let x = { ...s, lineups: { ...s.lineups, [k]: best.lu } };
          x = S.setTactics(x, k, best.tac);
          return S.confermaPronto(x, k, true) || x;
        });
        if (ok) m.firmaTattica = firma;
        break;
      }
    } else if (state.phase === 'playoffs' && state.po) {
      // Anche i bot pronosticano, o la classifica dei pronostici in una
      // serata con due persone e due bot sarebbe una gara a due. Prima un
      // controllo da niente: se tutte le serie sono partite non c'e niente
      // da pronosticare, e non si ricalcola il tabellone a ogni tic.
      const po = state.po;
      const daIniziare = po.turni.some((round) => round.some((m) => !m.gamesPlayed))
        || (po.third && !po.third.gamesPlayed);
      if (!daIniziare) return;
      // Il tabellone si ricalcola solo quando una serie avanza: il cronometro
      // gira quattro volte al secondo e le serie si rigiocherebbero ogni volta.
      const firma = `${state.seed}|${po.turni.map((r) => r.map((m) => m.gamesPlayed).join('.')).join('|')}|${po.third?.gamesPlayed ?? '-'}`;
      if (serieViste.firma !== firma) {
        serieViste.T = teamsFromState(state);
        serieViste.lista = serieDelTabellone(state, serieViste.T);
        serieViste.firma = firma;
      }
      const T = serieViste.T;
      for (const x of serieViste.lista) {
        if (!aperta(x)) continue;
        for (const k of squadreBot) {
          if (k === x.a || k === x.b || po.pron?.[x.id]?.[k]) continue;
          // Ognuno ci pensa un attimo, e non tutti nello stesso istante.
          const m = memoriaBot[k] || (memoriaBot[k] = {});
          const chiave = `pron:${state.seed}:${x.id}`;
          if (!m[chiave]) { m[chiave] = Date.now() + 700 + Math.random() * 2300; continue; }
          if (Date.now() < m[chiave]) continue;
          const p = pronosticoBot(T[x.a], T[x.b]);
          await session.apply((s) => S.pronostica(s, k, x.id, x.a, x.b, p.v, p.g));
          return;
        }
      }
    }
  } catch (err) {
    console.error('bot:', err);
  } finally {
    botOccupato = false;
  }
}

// LE ANIMAZIONI DI CAMBIAMENTO VANNO ACCESE DA QUI, non dal CSS.
// render() riscrive tutto l'HTML a ogni ridisegno: una regola CSS attaccata
// all'elemento ripartirebbe anche quando quel nome e rimasto identico, e si
// vedrebbero i nomi ballare da soli. Si confronta con il giro precedente,
// esattamente come gia fa suoniDiStato() per i suoni.
let nomiVisti = null;

function effettiNomi() {
  const ora = {};
  for (const k of TEAM_KEYS) ora[k] = TEAM_NAMES[k];
  // Al primo disegno non e cambiato niente: si prende nota e basta, o
  // all'ingresso in stanza partirebbero tutte insieme.
  if (nomiVisti) {
    for (const k of TEAM_KEYS) {
      if (ora[k] === nomiVisti[k]) continue;
      document.querySelectorAll(`[data-nome-team="${k}"]`).forEach((el) => {
        // Sul tabellone il nome e fatto di palette che si ribaltano; altrove
        // e una riga di testo che scorre. Stesso marcatore, due modi di
        // dire la stessa cosa a seconda di dove sta scritto.
        if (el.classList.contains('flap')) scriviFlap(el, ora[k], true);
        else el.classList.add('scambia');
      });
    }
  }
  nomiVisti = ora;
}

// La pallina si apre leggendo il tempo che manca, non un timer locale: e uno
// stato condiviso. Va rimessa a ogni ridisegno e a ogni tic, perche render()
// riscrive l'HTML e la classe se ne andrebbe con il resto.
function effettoPallina() {
  const el = root.querySelector('[data-lotto]');
  if (!el) return;
  el.classList.toggle('aperto', !S.inRivelazione(state, now()));
}

// Ti hanno superato. Prima te ne accorgevi solo se stavi fissando il numero.
// Lampeggia solo a CHI e stato scavalcato: a chi ha appena rilanciato non
// serve, e a chi sta guardando e basta nemmeno.
let offertaVista = null;

function effettoSuperato() {
  if (!state || state.phase !== 'auction') { offertaVista = null; return; }
  const mia = state.seats[session.uid];
  const bid = state.auction.bid;
  const firma = `${state.auction.idx}:${bid ? bid.team + ':' + bid.amount : '-'}`;
  const prima = offertaVista;
  offertaVista = { firma, team: bid?.team ?? null };
  if (!prima || prima.firma === firma) return;
  // Ero io in testa e adesso non piu: e' stato un sorpasso.
  if (!mia || prima.team !== mia || bid?.team === mia) return;
  const box = root.querySelector('[data-bidbox]');
  if (box) { box.classList.remove('superato'); void box.offsetWidth; box.classList.add('superato'); }
}

// IL PUNTEGGIO SALE invece di comparire, ma solo sulla gara appena scoperta:
// far ripartire tutti i punteggi a ogni ridisegno sarebbe un tabellone
// impazzito. Dura settecento millisecondi e parte forte per poi frenare —
// un contatore lineare sembra rotto.
//
// Il numero finale e gia nel markup: se questa funzione non gira, o se si e
// chiesto meno movimento, si legge il risultato invece di due zeri.
const MENO_MOVIMENTO = typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

function contaPunteggio(el) {
  const fine = Number(el.dataset.pt);
  if (!Number.isFinite(fine) || MENO_MOVIMENTO) return;
  const t0 = performance.now();
  el.classList.add('conta');
  const passo = (ora) => {
    // Il ridisegno ha buttato via questo elemento: si smette invece di
    // scrivere su un nodo che non e piu nella pagina.
    if (!el.isConnected) return;
    const k = Math.min(1, (ora - t0) / 700);
    el.textContent = Math.round(fine * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(passo);
    else el.classList.remove('conta');
  };
  requestAnimationFrame(passo);
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
    await session.apply((s) => S.advanceSeries(s, r, i, S.PASSO_GARA));
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

      // Il nome della squadra non si scrive, si pesca: e' un modo di passare
      // i secondi mentre gli altri entrano. Sempre la propria sedia, mai
      // quella di un altro, e solo finche si e in lobby.
      case 'cambia-nome':
        await session.apply((s) => S.cambiaNome(s, s.seats[session.uid]));
        break;

      // La scheda di un giocatore: si apre toccando il suo overall nel
      // quintetto. Non passa dallo stato condiviso — e una cosa mia, gli
      // altri non devono vedere i miei popup aprirsi e chiudersi.
      case 'scheda':
        ui.scheda = el.dataset.pid;
        paint();
        return;

      case 'chiudi-scheda':
        // Solo se si tocca il velo o il tasto, non la scheda stessa.
        if (el.dataset.act !== 'chiudi-scheda') return;
        ui.scheda = null;
        paint();
        return;

      // Una serie finita si apre e si richiude. Lo stato sta in `ui`, non
      // nello stato condiviso: e una cosa mia, e deve sopravvivere ai
      // ridisegni — se un'altra serie avanza, quella che stavo leggendo non
      // deve richiudersi da sola.
      case 'apri-serie': {
        const id = el.dataset.serie;
        if (ui.serieAperte.has(id)) ui.serieAperte.delete(id); else ui.serieAperte.add(id);
        paint();
        document.getElementById(`serie-${id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        return;
      }

      // Dal tabellone alla serie: un tocco su una casella ci scorre sopra.
      case 'vai-serie': {
        const id = el.dataset.serie;
        document.getElementById(`serie-${id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        return;
      }

      case 'chiudi-rivela':
        chiudiRivela();
        return;

      case 'condividi-card':
        el.disabled = true;
        try { await condividiSerata(); } finally { el.disabled = false; }
        return;

      // Si cambia idea quante volte si vuole, finche la serie non parte.
      case 'pronostico': {
        const d = el.dataset;
        const ok = await session.apply((s) => S.pronostica(s, s.seats[session.uid], d.serie, d.a, d.b, d.v, Number(d.g)));
        if (!ok) flash('La serie è già iniziata: pronostici chiusi.', true);
        return;
      }

      // "Ho finito": un segnale a chi ospita, non un vincolo. Si puo
      // ritirare, perche cambiare idea dopo aver visto le altre squadre e
      // esattamente quello che si fa.
      case 'conferma-pronto':
        await session.apply((s) => S.confermaPronto(s, el.dataset.team));
        return;

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
      case 'aggiungi-bot':
        if (!await session.apply((s) => S.aggiungiBot(s))) flash('Non si possono aggiungere altri bot.', true);
        break;

      case 'togli-bot':
        await session.apply((s) => S.togliBot(s, team));
        break;

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

      // Il "Salta" unilaterale di chi ospita non esiste piu: saltare e una
      // decisione del tavolo (data-act="vota-skip"). Il caso resta solo per
      // le stanze aperte prima dell'aggiornamento, dove un telefono non
      // ancora ricaricato potrebbe mandarlo.
      case 'pass': {
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


      // Chi ospita gestisce anche le squadre senza nessuno seduto: il voto
      // vale per tutte quelle che controlla, o non si arriverebbe mai
      // all'unanimita in una stanza con sedie vuote.
      case 'vota-skip': {
        const mie = S.puoVotare(state).filter((k) => k === S.teamOf(state, session.uid)
          || (state.host === session.uid && !S.seatTaken(state, k)));
        for (const k of (mie.length ? mie : [team])) {
          await session.apply((s) => S.votaSkip(s, k, now()));
        }
        break;
      }

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
        await session.apply((s) => S.advanceThird(s, S.PASSO_GARA));
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
  // In modalita locale la schermata d'ingresso non si vede mai: si entra
  // dritti nella stanza. Senza questo aggancio il collaudo non potrebbe
  // controllarla, ed e la prima cosa che vede chi apre il gioco.
  landing,
  fermaVetrina,
};
