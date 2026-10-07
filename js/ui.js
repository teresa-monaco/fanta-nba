// ui.js — rendering. Nessun framework: template string + un solo handler
// delegato sui click. Lo stato transitorio della UI (nickname in digitazione,
// slot selezionato per lo scambio) vive qui, fuori dallo stato condiviso.

import { db, SLOTS, SLOT_LABEL, TEAM_KEYS, TEAM_NAMES, STRATEGIES, ROSTER_SIZE, START_CREDITS } from './core.js';
import { buildTeam, simSeriesUpTo, costruisciBracket, nomeTurno,
  simStagione, giriStagione, potenzaSotto, RITMI, refertoTattico } from './engine.js';
import { narrateGame, explainSeries, teamIdentity, verdettoReferto } from './narrator.js';
import * as S from './state.js';
import { now } from './net.js';
import { audioAcceso } from './suono.js';
import { avatarSVG } from './avatar.js';
import { ID_BOT, BOT } from './bot.js';
import { premiSerata } from './premi.js';
import { quoteSerie, classificaPronostici, puntiDi, reDeiPronostici, marcatoriDi } from './pronostici.js';
import { ordineSerie, serieCorrente, dopo } from './serie.js';

export const ui = {
  nickname: localStorage.getItem('nbaf:nick') || '',
  selSlot: null,      // { team, slot } in fase quintetti
  banner: null,
  manualOpen: false,
  numSquadre: 4,      // solo in modalita locale: quante squadre gioca chi ospita
  editLineup: null,   // squadra con il quintetto sbloccato per la modifica
  allIn: null,        // { team, at } — All in armato, valido finché l'offerta non cambia
  bidTeam: null,      // chi ospita molte squadre: per quale sta rilanciando adesso
  scheda: null,       // id del giocatore di cui e aperta la scheda: cosa mia, non condivisa
  garaVista: null,    // { serie, g, n }: la gara toccata su un pallino, finche non ne arriva una nuova
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ATTR_LABELS = { sco: 'Realizzazione', tre: 'Tiro da 3', pla: 'Playmaking', reb: 'Rimbalzi', dif: 'Protezione ferro', dpe: 'Difesa perimetro', atl: 'Atletismo', usg: 'Palla richiesta' };

/* ==========================================================
   Entry point
   ========================================================== */

export function render(root, ctx) {
  const { state: s } = ctx;
  let body = '';
  try {
    switch (s.phase) {
      case 'lobby': body = viewLobby(ctx); break;
      case 'auction': body = viewAuction(ctx); break;
      case 'squadra': body = viewSquadra(ctx); break;
      case 'playoffs': body = viewPlayoffs(ctx); break;
      default: body = `<div class="card">Fase sconosciuta: ${esc(s.phase)}</div>`;
    }
  } catch (err) {
    body = `<div class="banner err"><b>Errore di rendering.</b><br>${esc(err.message)}</div>`;
    console.error(err);
  }
  root.innerHTML =
    (ui.banner ? `<div class="banner${ui.banner.err ? ' err' : ''}">${esc(ui.banner.text)}</div>` : '')
    + body
    + resetZone(ctx)
    + schedaGiocatore();
}

// La scheda di un giocatore, aperta toccando il suo overall. Scegliere
// quintetto, violini e allenatore senza poter vedere i numeri voleva dire
// sceglierli a memoria: il tiro da tre e la protezione del ferro decidono
// quali strategie funzionano, ed erano visibili solo durante l'asta.
//
// Quale scheda e aperta sta in `ui`, non nello stato condiviso: e una cosa
// mia, gli altri non devono vedere i miei popup aprirsi.
function schedaGiocatore() {
  if (!ui.scheda) return '';
  const D = db();
  const p = D.byId[ui.scheda];
  if (!p) return '';
  const arc = D.archetypes[p.arc];
  const tess = Object.entries(ATTR_LABELS).map(([kk, lbl]) => `
    <div class="attr"><div class="lbl"><span>${lbl}</span><b>${p.attrs[kk]}</b></div>
      <div class="bar"><i style="width:${p.attrs[kk]}%"></i></div></div>`).join('');

  return `<div class="velo" data-act="chiudi-scheda">
    <div class="scheda-pop" role="dialog" aria-label="Statistiche di ${esc(p.n)}">
      <div class="jumbo">
        <div class="tabellina">
          <span>${p.pos}${p.alt?.length ? ' / ' + p.alt.join('/') : ''} · ${esc(p.tm)} ${p.era}</span>
          <span>OVR ${p.ovr}</span>
        </div>
        <div class="pop-nome">${esc(p.n)}</div>
        <div class="pop-arc">${esc(arc?.label || p.arc)}</div>
        <div class="attrs">${tess}</div>
      </div>
      <button class="primary wide mt" data-act="chiudi-scheda">Chiudi</button>
    </div>
  </div>`;
}

// Un unico punto per ricominciare, in fondo a ogni schermata a partita
// avviata. Sta qui e non solo nella barra in alto perche un tasto piccolo
// e grigio fra un'etichetta e un codice non lo trova nessuno.
function resetZone({ state: s, session }) {
  if (!s || s.host !== session.uid || s.phase === 'lobby') return '';
  const ultimo = s.po?.turni?.[s.po.turni.length - 1]?.[0];
  const finita = (ultimo?.gamesPlayed ?? 0) >= 4;
  return `<div class="reset-zone">
    <button class="${finita ? 'primary' : 'ghost'} wide" data-act="new-game">
      ${finita ? 'Nuova partita' : 'Ricomincia da capo'}
    </button>
    <p class="tiny muted center" style="margin-top:8px">
      Cancella asta, quintetti e playoff${session.mode === 'local' ? '' : '. Le squadre assegnate restano'}.
    </p>
  </div>`;
}

export function renderTopbar(el, ctx) {
  const { session, state: s } = ctx;
  // Solo chi ospita puo azzerare, e mai dalla lobby (non c'e niente da azzerare).
  const canReset = s && s.host === session.uid && s.phase !== 'lobby';
  el.innerHTML = `
    <div class="brand">FANTA<span>NBA</span></div>
    <div class="row">
      ${session.mode === 'local' ? '<span class="tag">modalità locale</span>' : ''}
      <button class="sm ghost" data-act="toggle-audio" aria-label="${audioAcceso() ? 'Disattiva' : 'Attiva'} i suoni"
              title="${audioAcceso() ? 'Suoni attivi' : 'Suoni spenti'}">${audioAcceso() ? '&#9834;' : '&#9834;&#822;'}</button>
      ${canReset ? '<button class="sm ghost" data-act="new-game">Nuova</button>' : ''}
      <span class="code-pill">${esc(session.code)}</span>
    </div>`;
}

/* ==========================================================
   1. Lobby
   ========================================================== */

// Le lettere a paletta, come stringa. Il tabellone nasce gia scritto: se lo
// riempisse il javascript dopo il disegno ci sarebbe un istante di vuoto.
// Sta qui e non in app.js perche la usano tutte e due.
export function flapHTML(testo) {
  return String(testo).toUpperCase().split('')
    .map((c) => `<span>${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');
}

function viewLobby({ state: s, session }) {
  const isHost = s.host === session.uid;
  const local = session.mode === 'local';

  // Chi e dentro, nell'ordine in cui e arrivato. La squadra non si sceglie:
  // viene assegnata, cosi non si perdono cinque minuti a contrattare i colori.
  const dentro = TEAM_KEYS.filter((k) => S.seatTaken(s, k)).map((k) => {
    const mine = s.seats[session.uid] === k;
    const bot = s.bots?.[k];
    return `<div class="strip t-${k}">
      <span class="dot"></span>
      <span class="nm" data-nome-team="${k}">${esc(TEAM_NAMES[k])}</span>
      <span class="grow"></span>
      <span class="small">${esc(S.nameOfSeat(s, k))}${mine ? ' <span class="tiny muted">(tu)</span>' : ''}
        ${bot ? `<span class="tag bot">bot</span>` : ''}</span>
      ${bot && isHost ? `<button class="sm ghost" data-act="togli-bot" data-team="${k}">Togli</button>` : ''}
    </div>`;
  }).join('');

  const n = local ? (ui.numSquadre || 4) : Object.keys(s.seats).length;
  const sonoDentro = !!s.seats[session.uid];
  const pieno = Object.keys(s.seats).length >= TEAM_KEYS.length;

  const sceltaLocale = !local ? '' : `
    <div class="card">
      <h3 class="mb">Quante squadre</h3>
      <p class="small muted mb">Su questo schermo le gestisci tutte tu.</p>
      <div class="row">
        ${S.NUMERI_SQUADRE.map((v) => `<button class="${n === v ? 'primary' : ''} grow" data-act="num-squadre" data-n="${v}">${v}</button>`).join('')}
      </div>
    </div>`;

  // Il formato. Con un numero che non e potenza di due la stagione regolare
  // toglie anche il sorteggio delle teste di serie: non e solo un di piu.
  const giri = S.numeroValido(n) ? giriStagione(n) : 1;
  const q = S.numeroValido(n) ? potenzaSotto(n) : n;
  const sceltaFormato = !isHost ? `
    <p class="small muted center mb">Formato: ${s.conStagione ? 'stagione regolare + playoff' : 'solo playoff'}.</p>` : `
    <div class="card">
      <h3 class="mb">Formato</h3>
      <div class="row">
        <button class="${s.conStagione ? '' : 'primary'} grow" data-act="formato" data-con="0">Solo playoff</button>
        <button class="${s.conStagione ? 'primary' : ''} grow" data-act="formato" data-con="1">Stagione + playoff</button>
      </div>
      <p class="small muted mt">${s.conStagione
        ? `Tutti contro tutti${giri > 1 ? ` (${giri} giri)` : ''}, ${(n - 1) * giri} partite a testa, poi i playoff.
           ${q < n ? `Le prime ${q} passano, le ultime ${n - q} restano fuori.` : 'Passano tutte: la classifica decide gli accoppiamenti.'}
           Le tattiche si possono ritoccare a stagione finita.`
        : `Si va dritti al tabellone.${q < n ? ` In ${n}, ${n - q} squadre salteranno il primo turno per sorteggio.` : ''}`}</p>
    </div>`;

  // IL TABELLONE DELL'ATTESA. Era l'ultima schermata rimasta a card grigie,
  // in mezzo a un gioco che ovunque parla per tabelloni. Qui il numero che
  // conta e quanti siete, e il nome della propria squadra e proprio la cosa
  // che si sta guardando mentre si aspetta: va sulle lettere a paletta, e
  // quando lo cambi si ribaltano.
  const mia = s.seats[session.uid];
  const insegna = local ? 'Modalità locale' : `Stanza ${esc(session.code)}`;

  const dentroAlTabellone = !mia ? `
      <p class="tiny muted center" style="letter-spacing:1.6px;margin-bottom:6px">
        ${pieno ? 'Tutte le squadre sono assegnate' : 'Entra e ti viene assegnata una squadra'}</p>
      ${pieno ? '<p class="small muted center">Puoi guardare.</p>' : `
        <div class="row" style="max-width:420px;margin:0 auto">
          <input id="nick" class="grow" value="${esc(ui.nickname)}" placeholder="il tuo nome" maxlength="14" autocomplete="off">
          <button class="primary" data-act="join">Entra</button>
        </div>`}` : `
      <p class="tiny muted center" style="letter-spacing:1.6px;margin-bottom:6px">La tua squadra</p>
      <div class="flap" data-nome-team="${mia}">${flapHTML(TEAM_NAMES[mia])}</div>
      <div class="row center" style="justify-content:center;margin-top:9px">
        <button class="sm" data-act="cambia-nome" title="Te ne dà un'altra: il nome non si scrive, si pesca">Cambia</button>
        <button class="sm ghost" data-act="leave">Esci</button>
      </div>`;

  return `
    <div class="jumbo lobby-jumbo">
      <div class="insegna">${insegna}</div>
      <div class="tabellina">
        <span>${n} ${n === 1 ? 'squadra' : 'squadre'} dentro</span>
        <span>50 crediti · 5 giocatori</span>
      </div>
      ${dentroAlTabellone}
    </div>

    ${local ? `
      <p class="tiny muted center mb">Firebase non è configurato: la partita gira su questo solo schermo.
      Per giocare ognuno dal proprio telefono servono 3 minuti di setup — vedi SETUP.md.</p>
      ${sceltaLocale}` : `
      <div class="row mb" style="justify-content:center">
        <button class="sm ghost" data-act="copy-link">Copia il link della stanza</button>
      </div>

      ${dentro ? `<div class="card tight">
        <p class="tiny muted mb">Al tavolo (${n})</p>${dentro}
        ${isHost ? botCard(s, n) : ''}
      </div>` : `<div class="card tight">
        <p class="small muted center">Ancora nessuno dentro.</p>
        ${isHost ? botCard(s, n) : ''}
      </div>`}`}

    ${sceltaFormato}
    ${alboCard(s)}
    ${rivalitaCard(s, session)}

    <div class="azione-spacer"></div>
    <div class="azione-fissa">
      ${isHost ? `
        <button class="primary wide" data-act="start-auction" ${S.numeroValido(n) ? '' : 'disabled'}>
          Inizia l'asta${S.numeroValido(n) ? ` con ${n} squadre` : ''}
        </button>
        ${S.numeroValido(n) ? '' : `<p class="tiny muted center mt">Siete in ${n}: si gioca in 2, 3, 4, 6, 8, 10 o 12.</p>`}
      ` : `<p class="small muted center">In attesa che ${esc(s.names[s.host] || 'chi ospita')} avvii l'asta...</p>`}
    </div>
  `;
}

// Il tasto che serve quando siete in tre e volete giocare in quattro. Dice
// anche quanti ne mancano al prossimo numero valido, perche "aggiungi un bot"
// senza sapere a cosa serve non lo tocca nessuno.
function botCard(s, n) {
  const quanti = S.botDi(s).length;
  const pieno = Object.keys(s.seats).length >= TEAM_KEYS.length;
  const finiti = quanti >= ID_BOT.length;
  const ok = S.numeroValido(n);
  // Il prossimo numero di squadre valido raggiungibile aggiungendo bot.
  const prossimo = S.NUMERI_SQUADRE.find((v) => v > n);
  const mancano = prossimo ? prossimo - n : 0;

  return `<div class="bot-zona">
    <div class="row spread">
      <span class="tiny muted">${quanti ? `${quanti} bot in partita` : 'Manca qualcuno?'}</span>
      <button class="sm" data-act="aggiungi-bot" ${pieno || finiti ? 'disabled' : ''}>Aggiungi un bot</button>
    </div>
    <p class="tiny muted mt">${finiti
      ? `I bot disponibili sono ${ID_BOT.length}, e ci sono già tutti.`
      : ok
        ? `Siete in ${n} e si può giocare. ${mancano ? `Con ${mancano} bot in più si gioca in ${prossimo}.` : ''}`
        : `Siete in ${n}: servono ${mancano} bot per arrivare a ${prossimo} e far partire il tabellone.`}</p>
  </div>`;
}

/* ==========================================================
   2. Asta
   ========================================================== */

function viewAuction({ state: s, session }) {
  const D = db();
  const isHost = s.host === session.uid;
  const pid = S.currentPlayerId(s);
  const p = pid ? D.byId[pid] : null;
  const myTeam = s.seats[session.uid] || null;

  if (!p) {
    return `<div class="card center"><h2>Asta conclusa</h2>
      <p class="muted small">Non ci sono più lotti disponibili.</p>
      ${isHost ? '<button class="primary wide mt" data-act="to-squadra">Vai alle squadre</button>' : ''}</div>`;
  }

  const arc = D.archetypes[p.arc];
  const bid = s.auction.bid;

  const attrs = Object.entries(ATTR_LABELS).map(([k, lbl]) => `
    <div class="attr"><div class="lbl"><span>${lbl}</span><b>${p.attrs[k]}</b></div>
      <div class="bar"><i style="width:${p.attrs[k]}%"></i></div></div>`).join('');

  const paused = !!s.auction.paused;

  // Comandi del banditore: dentro il blocco del giocatore, subito sotto le
  // valutazioni, cioè dove si sta già guardando mentre si decide.
  // Le due azioni sono opposte, quindi le etichette lo devono dire:
  // una ASSEGNA a chi è in testa, l'altra BUTTA VIA il giocatore.
  // Senza offerte "aggiudica" non ha senso e sparisce.
  const hostBar = !isHost ? '' : `
    <div class="host-bar">
      <button class="sm ${paused ? 'primary' : 'ghost'}" data-act="toggle-pause"
              title="${paused ? 'Riprendi' : 'Ferma'} il cronometro">${paused ? '&#9654;' : '&#9632;'}</button>
      ${bid ? `<button class="sm" data-act="resolve">Assegna</button>` : ''}
      <button class="sm ghost" data-act="toggle-manual">${ui.manualOpen ? 'Annulla' : 'Assegna a mano'}</button>
    </div>
    ${ui.manualOpen ? `
      <div class="manual">
        <p class="tiny muted mb">Scavalca l'asta: ${esc(p.n)} al prezzo che decidi tu.</p>
        <div class="row">
          <select id="m-team" class="grow">${S.attive(s).filter((k) => S.slotsLeft(s, k) > 0)
            .map((k) => `<option value="${k}">${TEAM_NAMES[k]} — max ${S.maxBid(s, k)}</option>`).join('')}</select>
          <input id="m-price" type="number" min="0" value="${bid?.amount || 1}" style="width:84px">
          <button class="sm primary" data-act="manual-award">OK</button>
        </div>
      </div>` : ''}`;

  // Le squadre che chi guarda può far rilanciare: la sua, oppure tutte
  // quelle senza nessuno seduto se è lui a ospitare.
  const controllable = S.attive(s).filter((k) => k === myTeam || (isHost && !S.seatTaken(s, k)));
  const bidders = controllable.filter((k) => S.slotsLeft(s, k) > 0);

  // Oltre le sei squadre le rose sparirebbero comunque sotto lo scroll: si
  // tengono solo crediti e slot, i nomi restano nel registro degli acquisti.
  const fitto = S.attive(s).length > 6;

  const compact = (k) => {
    const t = s.teams[k];
    const names = t.roster.map((id) => D.byId[id]?.n).filter(Boolean).join(' · ') || '—';
    const leader = bid && bid.team === k;
    return `<div class="strip t-${k} ${leader ? 'leading' : ''}">
      <span class="dot"></span>
      <div class="grow" style="min-width:0">
        <div class="row spread"><span class="nm">${TEAM_NAMES[k]}</span>
          <span><span class="cr">${t.credits}</span> <span class="tiny muted">cr · ${t.roster.length}/${ROSTER_SIZE}</span></span></div>
        ${fitto ? '' : `<div class="ros">${esc(names)}</div>`}
      </div></div>`;
  };

  // Il numero del lotto sul tabellone: dice a che punto e l'asta senza dover
  // contare le righe del registro.
  const quanti = s.auction.order?.length || 0;
  const fatti = s.auction.log.length + (s.auction.unsold?.length || 0);

  return `
    <div class="jumbo lotto-jumbo">
      <div class="tabellina">
        <span>Lotto ${fatti + 1}</span>
        <span>${S.skipRimasti(s)} skip al tavolo</span>
      </div>
      ${pallina(p, arc)}
      <div class="ovr-riga"><span>Overall</span><b>${p.ovr}</b></div>
      <div class="attrs">${attrs}</div>
    </div>

    ${hostBar ? `<div class="card tight">${hostBar}</div>` : ''}

    <div class="card bidbox ${paused ? 'paused' : ''}" data-bidbox>
      <div class="bid-info">
        <div class="bidnow">${bid ? bid.amount : 0}<small> crediti</small></div>
        <div class="bidder">${bid ? `offerta di <b>${TEAM_NAMES[bid.team]}</b>` : '<span class="muted">nessuna offerta</span>'}</div>
      </div>
      <div class="clock" data-clock>--</div>
    </div>

    ${myTeam ? myTeamCard(s, myTeam, bid) : ''}

    <div class="card tight">
      ${myTeam ? '<p class="tiny muted mb">Gli avversari</p>' : ''}
      ${S.attive(s).filter((k) => k !== myTeam).map(compact).join('')}
    </div>

    ${auctionLog(s, D)}
    ${bidBar(s, bidders, bid, paused)}
  `;
}

// La pallina del draft che si apre sul nome. La classe "aperto" la mette e la
// toglie app.js leggendo il tempo che manca: e uno stato condiviso, non
// un'animazione locale, cosi chi entra a meta lotto vede la scheda scoperta.
// Tre righe e basta: dove gioca e da dove viene, come si chiama, che
// giocatore e. Tutto il resto stava anche nel blocco sotto, e su un telefono
// leggere due volte la stessa cosa e solo scroll in piu.
function pallina(p, arc) {
  return `<div class="lotto" data-lotto>
    <div class="sfera">
      <div class="mezzo su"></div><div class="cuc"></div><div class="mezzo giu"></div>
      <div class="scheda">
        <div class="ruolo">${p.pos}${p.alt?.length ? ' / ' + p.alt.join('/') : ''} · ${esc(p.tm)} ${p.era}</div>
        <div class="nome">${esc(p.n)}</div>
        <div class="arche">${esc(arc?.label || p.arc)}</div>
      </div>
    </div>
  </div>`;
}

// IL MEZZO CAMPO. Cinque righe una sotto l'altra dicono chi gioca; il campo
// dice anche DOVE, e quel "dove" e meta della decisione — un centro schierato
// da playmaker si vede a colpo d'occhio invece di doverlo leggere.
//
// Le pedine usano la stessa azione delle caselle (pick-slot): sono due modi
// di toccare la stessa cosa, non due funzioni diverse che possono divergere.
// E' disegnato in SVG, quindi nessuna immagine da scaricare e si adatta da
// solo ai telefoni stretti.
const POSTI = {
  C: [50, 22], PF: [24, 38], SF: [76, 40], SG: [20, 66], PG: [52, 82],
};

function campo(s, k, attivo) {
  const D = db();
  const lu = s.lineups[k] || {};
  const pedine = SLOTS.map((sl) => {
    const p = D.byId[lu[sl]];
    const [x, y] = POSTI[sl];
    const sel = ui.selSlot && ui.selSlot.team === k && ui.selSlot.slot === sl;
    const fuori = p && p.pos !== sl && !(p.alt || []).includes(sl);
    const t = s.tactics[k] || {};
    const v = p && p.id === t.v1 ? '1°' : (p && p.id === t.v2 ? '2°' : '');
    return `<button class="pedina ${sel ? 'scelta' : ''} ${fuori ? 'fuori' : ''}"
      style="left:${x}%;top:${y}%"
      ${attivo ? `data-act="pick-slot" data-team="${k}" data-slot="${sl}"` : 'disabled'}>
      <i data-v="${v}">${sl}</i>
      <span>${p ? esc(cognome(p.n)) : '—'}</span>
    </button>`;
  }).join('');

  return `<div class="campo ${attivo ? 'vivo' : ''}">
    <svg viewBox="0 0 300 250" aria-hidden="true">
      <rect width="300" height="250" fill="#10251c"/>
      <g fill="none" stroke="#3f7a63" stroke-width="2">
        <path d="M4 6h292v238"/><path d="M4 6v238h292"/>
        <rect x="110" y="6" width="80" height="94"/>
        <circle cx="150" cy="100" r="34"/>
        <path d="M28 6v34a122 122 0 0 0 244 0V6"/>
        <path d="M128 22h44" stroke-width="3"/>
      </g>
      <circle cx="150" cy="31" r="7" fill="none" stroke="#e07a3a" stroke-width="2.5"/>
    </svg>
    ${pedine}
  </div>`;
}

// Sul campo c'e spazio per una parola: il cognome basta a riconoscerlo.
function cognome(n) {
  const p = String(n).trim().split(/\s+/);
  return p.length > 1 ? p.slice(1).join(' ') : p[0];
}

// La tua squadra: crediti, slot, rosa e quanto puoi spingere. Sta sopra gli
// avversari perché mentre decidi se puntare guardi il tuo budget, non il loro.
function myTeamCard(s, k, bid) {
  const D = db();
  const t = s.teams[k];
  const left = S.slotsLeft(s, k);
  const max = S.maxBid(s, k);
  const leader = bid && bid.team === k;
  // Cinque caselle con il ruolo scritto sopra, non cinque "libero" uguali:
  // durante l'asta la domanda vera e "chi mi manca", e un posto vuoto
  // etichettato PG la risponde da solo.
  const prov = S.slotProvvisori(t.roster);
  const chips = SLOTS.map((sl) => {
    const p = D.byId[prov[sl]];
    if (!p) return `<div class="rslot vuoto"><span class="pos">${sl}</span><span class="nm">—</span></div>`;
    const fuori = p.pos !== sl && !(p.alt || []).includes(sl);
    return `<div class="rslot ${fuori ? 'adattato' : ''}">
      <span class="pos">${sl}</span>
      <span class="nm">${esc(p.n)}</span>
      <span class="ov">${p.ovr}</span>
    </div>`;
  }).join('');

  return `<div class="card mine t-${k}">
    <div class="row spread">
      <h3><span class="dot" style="display:inline-block;margin-right:7px"></span>${TEAM_NAMES[k]} <span class="tiny muted">(tu)</span></h3>
      ${leader ? '<span class="tag lead">sei in testa</span>' : ''}
    </div>
    <div class="mine-nums">
      <div><b>${t.credits}</b><span>crediti</span></div>
      <div><b>${t.roster.length}/${ROSTER_SIZE}</b><span>giocatori</span></div>
      <div><b>${max}</b><span>puoi arrivare a</span></div>
    </div>
    <div class="rslots">${chips}</div>
    ${left > 0 && max < (bid ? bid.amount + 1 : 1)
      ? '<p class="tiny warn-txt">Qui non puoi rilanciare: devi tenere crediti per gli slot che ti restano.</p>' : ''}
  </div>`;
}

// Barra fissa in fondo: un tasto dominante per il rilancio minimo, due
// scorciatoie relative all'offerta attuale, e il selettore per la cifra esatta.
// I numeri sui tasti piccoli sono QUANTO SOPRA l'offerta corrente, non l'importo.
function bidBar(s, bidders, bid, paused) {
  if (!bidders.length) return '';
  const cur = bid ? bid.amount : 0;
  const minBid = cur + 1;

  // Chi ospita da solo può avere in mano dodici squadre: una riga di tasti a
  // testa sarebbe una barra più alta dello schermo, che coprirebbe il lotto in
  // asta. Oltre le tre, si sceglie prima la squadra e si rilancia per quella.
  let picker = '';
  let mostra = bidders;
  if (bidders.length > 3) {
    const sel = bidders.includes(ui.bidTeam) ? ui.bidTeam : bidders[0];
    mostra = [sel];
    picker = `<div class="bidpick">${bidders.map((k) => {
      const esaurito = S.maxBid(s, k) < minBid && !(bid && bid.team === k);
      return `<button class="pickchip t-${k} ${k === sel ? 'on' : ''} ${esaurito ? 'out' : ''}"
                data-act="pick-team" data-team="${k}">
        <span class="dot"></span>${TEAM_NAMES[k]}<b>${s.teams[k].credits}</b>
      </button>`;
    }).join('')}</div>`;
  }

  return `<div class="bidbar-spacer ${bidders.length > 3 ? 'tall' : ''}"></div><div class="bidbar"><div class="bidbar-clock ${paused ? 'paused' : ''}"><span data-clock>--</span></div>${picker}${mostra.map((k) => {
    const max = S.maxBid(s, k);
    const leader = bid && bid.team === k;
    const tag = bidders.length > 1 ? `<span class="who t-${k}"><span class="dot"></span>${TEAM_NAMES[k]}</span>` : '';

    if (paused) return `<div class="bidrow">${tag}<div class="flatnote">Cronometro fermo</div></div>`;
    if (leader) return `<div class="bidrow">${tag}<div class="flatnote lead">Sei in testa a ${cur}</div></div>`;
    if (max < minBid) return `<div class="bidrow">${tag}<div class="flatnote">Budget esaurito per questo lotto</div></div>`;

    // Sul tasto: di quanto rilanci. Sotto, piccolo: dove finisce l'offerta.
    const step = (n) => (cur + n <= max
      ? `<button class="bidbtn" data-act="bid" data-team="${k}" data-amt="${cur + n}">+${n}<small>${cur + n}</small></button>`
      : `<button class="bidbtn" disabled>+${n}</button>`);

    // All in svuota il budget in un tocco: serve una seconda conferma, ma
    // inline e non con una finestra, perché il cronometro intanto corre.
    const armed = ui.allIn && ui.allIn.team === k && ui.allIn.at === cur;
    const allIn = max >= minBid
      ? `<button class="bidbtn allin ${armed ? 'armed' : ''}"
                 data-act="${armed ? 'bid' : 'arm-allin'}" data-team="${k}" data-amt="${max}">
           ${armed ? 'Sicuro?' : 'All in'}<small>${max}</small>
         </button>`
      : '';

    return `<div class="bidrow">${tag}${step(1)}${step(2)}${step(3)}${allIn}${skipBtn(s, bidders, k)}</div>`;
  }).join('')}</div>`;
}

// Saltare un giocatore e una decisione del tavolo, non di chi ospita: il
// lotto salta solo se lo rifiutano tutti quelli che potrebbero comprarlo.
//
// STA FRA I TASTI DI RILANCIO, non in una riga sua. E' un'alternativa al
// rilanciare — o lo compri o lo butti — e come riga a se prendeva spazio
// sopra la piega a scapito dei valori del giocatore. Solo il simbolo e il
// conteggio: la spiegazione lunga la si legge una volta e poi da fastidio.
function skipBtn(s, bidders, k) {
  if (s.auction.paused) return '';
  const votanti = S.puoVotare(s);
  if (!votanti.includes(k)) return '';
  const voti = Object.keys(s.auction.skipVoti || {}).filter((x) => votanti.includes(x));
  const rimasti = S.skipRimasti(s);
  if (rimasti <= 0) {
    return `<button class="bidbtn skip" disabled title="Skip finiti: questo giocatore va comprato">&#9197;<small>0</small></button>`;
  }
  const hoVotato = !!s.auction.skipVoti?.[k];
  return `<button class="bidbtn skip ${hoVotato ? 'on' : ''}" data-act="vota-skip" data-team="${k}"
    title="${hoVotato ? 'Ritira il voto' : 'Vota per saltarlo'}: serve l'accordo di tutti. ${rimasti} skip rimasti">
    &#9197;<small>${voti.length}/${votanti.length}</small></button>`;
}

function auctionLog(s, D) {
  const rows = s.auction.log.slice().reverse().slice(0, 30).map((l) =>
    `<div><span>${esc(D.byId[l.playerId]?.n || l.playerId)}</span><span class="muted">${TEAM_NAMES[l.team]} · ${l.price}</span></div>`)
    .join('') || '<div class="muted">Nessun acquisto.</div>';
  return `<details class="card tight"><summary>Acquisti (${s.auction.log.length})</summary><div class="log mt">${rows}</div></details>`;
}

// Il cronometro vive in DUE punti: nel riquadro offerte e nella barra fissa
// in basso. Il secondo e quello che conta davvero — decidi se rilanciare
// guardando i tasti, e i tasti stanno in fondo: senza il conto alla rovescia
// li accanto stavi scegliendo alla cieca.
export function tickClock(s) {
  const els = document.querySelectorAll('[data-clock]');
  if (!els.length) return null;
  const scrivi = (testo, hot, frozen) => els.forEach((el) => {
    el.textContent = testo;
    el.classList.toggle('hot', hot);
    el.classList.toggle('frozen', frozen);
  });

  if (s.auction.paused) {
    scrivi(`fermo a ${Math.ceil((s.auction.remaining ?? 0) / 1000)}s`, false, true);
    return null;
  }
  if (!s.auction.running || !s.auction.deadline) { scrivi('in attesa', false, false); return null; }
  const left = Math.max(0, s.auction.deadline - now());
  // Il tempo della pallina e in piu: durante l'apertura il cronometro resta
  // fermo sul massimo invece di mostrare sedici secondi su quindici.
  const sec = Math.min(S.BID_SECONDS, Math.ceil(left / 1000));
  scrivi(sec > 0 ? `${sec}s` : 'chiuso', sec <= 5, false);
  return left;
}

/* ==========================================================
   3. La tua squadra — quintetto (spiegato) + tattica, in un passaggio
   ========================================================== */

function viewSquadra({ state: s, session }) {
  const D = db();
  const isHost = s.host === session.uid;
  const myTeam = s.seats[session.uid] || null;
  // La propria squadra per prima: e quella su cui si deve decidere.
  const ordine = myTeam ? [myTeam, ...S.attive(s).filter((k) => k !== myTeam)] : S.attive(s);

  const cards = ordine.map((k) => {
    const mia = k === myTeam;
    const canEdit = mia || (isHost && !S.seatTaken(s, k));
    const t = s.tactics[k];
    const editLineup = ui.editLineup === k;

    // Il profilo del quintetto: e questo il motivo per cui la schermata esiste.
    let identity = '';
    let prof = null;
    try {
      prof = buildTeam(k, s.lineups[k], t);
      identity = teamIdentity(prof);
    } catch { /* quintetto non ancora valido */ }

    const slots = SLOTS.map((sl) => {
      const p = D.byId[s.lineups[k][sl]];
      if (!p) return `<div class="slot-riga"><div class="slot"><span class="pos">${sl}</span><span class="nm muted">vuoto</span></div></div>`;
      const off = p.pos !== sl && !(p.alt || []).includes(sl);
      const sel = ui.selSlot && ui.selSlot.team === k && ui.selSlot.slot === sl;
      const attivo = editLineup && canEdit;
      // L'overall e un tasto a parte, fuori da quello dello scambio: due
      // pulsanti annidati non si possono fare, e qui sono due azioni diverse
      // — uno sposta il giocatore, l'altro apre la sua scheda.
      return `<div class="slot-riga">
        <button class="slot ${sel ? 'sel' : ''}" ${attivo ? `data-act="pick-slot" data-team="${k}" data-slot="${sl}"` : 'disabled'}>
          <span class="pos">${sl}</span>
          <span class="nm">${esc(p.n)}${off ? ' <span class="warn">fuori ruolo</span>' : ''}</span>
        </button>
        <button class="ovbtn" data-act="scheda" data-pid="${p.id}"
                title="Le statistiche di ${esc(p.n)}">${p.ovr}</button>
      </div>`;
    }).join('');

    const roster = s.teams[k].roster.map((id) => D.byId[id]).filter(Boolean);
    const opt = (sel, exclude) => roster.filter((p) => p.id !== exclude)
      .map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.n)} (${p.ovr})</option>`).join('');

    // L'overall della squadra: la media dei cinque. E' il numero che si
    // cerca per primo guardando una rosa, e senza toccava farlo a mente.
    const rosaOvr = SLOTS.map((sl) => D.byId[s.lineups[k][sl]]).filter(Boolean);
    const mediaOvr = rosaOvr.length
      ? (rosaOvr.reduce((a, p) => a + p.ovr, 0) / rosaOvr.length) : 0;

    const confermata = S.haConfermato(s, k);

    return `<div class="card t-${k} ${mia ? 'mine' : ''} ${confermata ? 'pronta' : ''}">
      <div class="row spread">
        <h3><span class="dot" style="display:inline-block;margin-right:7px"></span>${TEAM_NAMES[k]}${mia ? ' <span class="tiny muted">(tu)</span>' : ''}</h3>
        ${confermata ? '<span class="tag ok">pronta</span>' : ''}
        ${canEdit ? `<button class="sm ghost" data-act="toggle-lineup" data-team="${k}">${editLineup ? 'Fatto' : 'Modifica'}</button>` : ''}
      </div>
      ${rosaOvr.length ? `<div class="ovr-squadra">
        <span>Overall squadra</span><b>${mediaOvr.toFixed(1)}</b>
        <span class="tiny muted">media dei ${rosaOvr.length}</span>
      </div>` : ''}
      ${identity ? `<p class="identita">${esc(identity)}</p>` : ''}
      ${campo(s, k, editLineup && canEdit)}
      <div class="slots mt">${slots}</div>
      ${editLineup ? '<p class="tiny muted mt">Tocca due pedine, o due caselle, per scambiarle.</p>' : ''}
      <div class="tattica">
        <div class="row">
          <label class="field grow"><span>Primo violino</span>
            <select data-act="set-v1" data-team="${k}" ${canEdit ? '' : 'disabled'}>${opt(t.v1, t.v2)}</select></label>
          <label class="field grow"><span>Secondo violino</span>
            <select data-act="set-v2" data-team="${k}" ${canEdit ? '' : 'disabled'}>${opt(t.v2, t.v1)}</select></label>
        </div>
        <label class="field"><span>Strategia offensiva</span>
          <select data-act="set-strat" data-team="${k}" ${canEdit ? '' : 'disabled'}>
            ${Object.entries(STRATEGIES).map(([id, v]) => `<option value="${id}" ${t.strategy === id ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
          </select></label>
        <p class="tiny muted mb">${esc(STRATEGIES[t.strategy]?.desc || '')}</p>

        ${ritmoSlider(k, t, canEdit)}

        ${coachPicker(s, k, t, canEdit)}
      </div>
      ${canEdit ? `<button class="conferma ${confermata ? 'fatta' : ''}" data-act="conferma-pronto" data-team="${k}"
        title="${confermata ? 'Tocca per ripensarci' : 'Dice a chi ospita che hai finito'}">
        ${confermata ? '&#10003; Ready' : 'Ready'}
      </button>` : ''}
    </div>`;
  }).join('');

  const n = S.attive(s).length;
  const giri = giriStagione(n);
  const st = stagioneFromState(s);
  const pronte = S.squadraReady(s);

  // Tre stati diversi per lo stesso schermo: prima della stagione, dopo la
  // stagione (con la classifica in cima e le tattiche ancora ritoccabili),
  // e senza stagione del tutto.
  let testa, azione;
  if (s.conStagione && !st) {
    testa = `<h2>Le squadre</h2>
      <p class="muted small mb">Prima della stagione regolare: ${giri > 1 ? `girone di ${giri} giri` : 'tutti contro tutti'},
      ${(n - 1) * giri} partite a testa. Dopo potrai ritoccare le tattiche prima dei playoff.</p>`;
    azione = `<button class="primary wide" data-act="gioca-stagione" ${pronte ? '' : 'disabled'}>
      Gioca la stagione regolare</button>`;
  } else if (st) {
    testa = `<h2>Stagione regolare</h2>
      ${classificaCard(s, st)}
      <h2 class="mt">Ritocca le tattiche</h2>
      <p class="muted small mb">La classifica è chiusa e non cambia più. Quello che scegli adesso vale per i playoff:
      hai visto come è andata, puoi correggere violini e strategia.</p>`;
    azione = `<button class="primary wide" data-act="to-playoffs" ${pronte ? '' : 'disabled'}>Ai playoff</button>`;
  } else {
    testa = `<h2>Le squadre</h2>
      <p class="muted small mb">Il quintetto lo assegna l'app cercando il minor numero di adattamenti: qui serve a capire cosa hai comprato. La strategia invece la scegli tu, e pesa: cambia chi prende i tiri e quali difese ti mettono in crisi.</p>`;
    azione = `<button class="primary wide" data-act="to-playoffs" ${pronte ? '' : 'disabled'}>Componi il tabellone</button>`;
  }

  // IL TASTO STA IN UNA BARRA FISSA, non in fondo alla pagina. Con quattro
  // squadre le schede sono lunghissime: si leggeva la classifica in cima e
  // poi bisognava scorrere oltre quattro quintetti, quattro campi e quattro
  // allenatori per trovare "Ai playoff". Cosi resta sempre sotto il pollice,
  // come i tasti di rilancio durante l'asta.
  // IL CONTO DI CHI HA FINITO, in cima e appiccicato: con quattro squadre si
  // scorre a lungo, e chi ospita deve sapere se sta aspettando qualcuno
  // senza doversi rifare tutta la pagina per contare i bordi verdi.
  const pronti = S.quantiPronti(s);
  const mancano = S.attive(s).filter((k) => !S.haConfermato(s, k));
  const contatore = `<div class="conta-pronti ${pronti === n ? 'tutti' : ''}">
    <b>${pronti}/${n}</b>
    <span>${pronti === n ? 'tutti pronti' : `in attesa di ${mancano.map((k) => esc(TEAM_NAMES[k])).join(', ')}`}</span>
  </div>`;

  // L'azione sta in una barra fissa, non in fondo alla pagina. Con quattro
  // squadre le schede sono lunghissime: si leggeva la classifica in cima e
  // poi bisognava scorrere oltre quattro quintetti, quattro campi e quattro
  // allenatori per trovare "Ai playoff". Cosi resta sempre sotto il pollice,
  // come i tasti di rilancio durante l'asta.
  //
  // Le conferme NON bloccano: chi ospita vede il conto e decide se aspettare
  // un distratto o partire lo stesso. Se fermassero i playoff, uno che si
  // allontana dal telefono bloccherebbe la serata di tutti.
  return `
    ${testa}
    ${contatore}
    ${cards}
    <div class="azione-spacer"></div>
    <div class="azione-fissa">
      ${isHost ? `${azione}${pronti < n && pronte ? `<p class="tiny muted center mt">${n - pronti} ${n - pronti === 1 ? 'squadra non ha' : 'squadre non hanno'} ancora confermato. Puoi andare lo stesso.</p>` : ''}`
    : `<p class="small muted center">In attesa di chi ospita.</p>`}
    </div>
  `;
}

// Il ritmo non e una scelta fra quattro scatole separate: e un'unica manopola
// che va da "partita corta" a "senza freni". Una barra lo dice da sola, e
// mostra anche quanto sei lontano dagli estremi.
function ritmoSlider(k, t, canEdit) {
  const ids = Object.keys(RITMI);
  const i = Math.max(0, ids.indexOf(t.ritmo));
  const v = RITMI[ids[i]];
  return `
    <span class="lbl-mini">Ritmo <i class="tiny muted">— ${esc(v.label.toLowerCase())}</i></span>
    <div class="ritmo-slider">
      <input type="range" min="0" max="${ids.length - 1}" step="1" value="${i}"
             class="rslider" aria-label="Ritmo"
             ${canEdit ? `data-act="set-ritmo" data-team="${k}"` : 'disabled'}>
      <div class="rtacche">${ids.map((id, j) => `<span class="${j === i ? 'on' : ''}">${esc(RITMI[id].label)}</span>`).join('')}</div>
    </div>
    <p class="tiny muted mb">${esc(v.desc)}</p>`;
}

// Gli allenatori li sblocca la rosa: uno per giocatore, quello della sua
// squadra in quell'epoca. Ognuno e un patto, quindi accanto al nome sta
// scritto cosa da e cosa toglie — altrimenti si sceglie a caso.
// Cinque allenatori con nome, identita, effetto e provenienza sono troppo da
// leggere tutti insieme: si finiva per sceglierne uno a caso. Uno alla volta,
// con la faccia, si scorre col dito e si legge solo quello che si guarda.
function coachPicker(s, k, t, canEdit) {
  const liberi = S.allenatoriDi(s.teams[k].roster);
  if (!liberi.length) return '';

  const carte = liberi.map((c, i) => {
    const scelto = c.id === t.coach;
    // Impaginazione in verticale: faccia su una riga sua, poi il testo a
    // tutta larghezza. Affiancati, su un telefono il testo finiva in una
    // colonna da una parola per riga.
    return `<article class="ccard ${scelto ? 'on' : ''}" ${scelto ? 'data-coach-scelto' : ''}>
      <div class="ctesta">
        <div class="cface">${avatarSVG(c, 72)}</div>
        <span class="cconta">${i + 1}/${liberi.length}</span>
      </div>
      <div class="cinfo">
        <b>${esc(c.n)}</b>
        <span class="cid">${esc(c.label)}</span>
        <p class="cdesc">${esc(c.desc)}</p>
        <p class="ceff">${esc(effettoInParole(c))}</p>
        <p class="cvia">sbloccato da ${esc(c.da)}</p>
      </div>
      ${canEdit
        ? `<button class="csel ${scelto ? 'on' : ''}" data-act="set-coach" data-team="${k}" data-v="${c.id}">
             ${scelto ? 'Scelto' : 'Scegli'}</button>`
        : `<div class="csel ${scelto ? 'on' : ''}">${scelto ? 'Scelto' : ''}</div>`}
    </article>`;
  }).join('');

  return `
    <div class="row spread" style="align-items:baseline">
      <span class="lbl-mini">Allenatore <i class="tiny muted">— dai tuoi giocatori</i></span>
      ${liberi.length > 1 ? `<span class="cfrecce">
        <button class="cfr" data-act="coach-scorri" data-team="${k}" data-dir="-1" aria-label="Allenatore precedente">‹</button>
        <button class="cfr" data-act="coach-scorri" data-team="${k}" data-dir="1" aria-label="Allenatore successivo">›</button>
      </span>` : ''}
    </div>
    <div class="cstrip" id="coaches-${k}" data-coach-strip>${carte}</div>`;
}

// L'effetto in chiaro. Un allenatore che non dice cosa fa e un bonus cieco.
function effettoInParole(c) {
  const N = { sco: 'realizzazione', tre: 'tiro da 3', pla: 'playmaking', reb: 'rimbalzi',
    dif: 'protezione ferro', dpe: 'difesa perimetro', atl: 'atletismo', usg: 'palla richiesta' };
  const e = c.eff || {};
  const parti = [];
  const elenco = (obj, chi) => Object.entries(obj || {})
    .map(([a, v]) => `${v > 0 ? '+' : ''}${v} ${N[a] || a}${chi}`);
  parti.push(...elenco(e.attr, ' a tutti'));
  parti.push(...elenco(e.star, ' al primo violino'));
  parti.push(...elenco(e.altri, ' agli altri'));
  if (e.poss) parti.push(`${e.poss > 0 ? '+' : ''}${e.poss} possessi`);
  if (e.var) parti.push(e.var < 0 ? 'più solida' : 'più imprevedibile');
  return parti.length ? `(${parti.join(', ')})` : '';
}

// La classifica: la parte piu da fantasy league del gioco. Chi e dentro e chi
// e fuori si vede a colpo d'occhio, perche e l'unica cosa che conta davvero.
function classificaCard(s, st) {
  const q = potenzaSotto(S.attive(s).length);
  const righe = st.cls.map((r, i) => {
    const dentro = i < q;
    const diff = r.diff > 0 ? `+${r.diff}` : String(r.diff);
    return `<tr class="${dentro ? '' : 'out'}">
      <td class="pos">${r.pos}</td>
      <td class="sq"><span class="dot t-${r.k}"></span>${TEAM_NAMES[r.k]}</td>
      <td class="rec"><b>${r.w}</b>-${r.l}</td>
      <td class="diff">${diff}</td>
      <td class="esito">${dentro ? '<span class="tag in">playoff</span>' : '<span class="tag fuori">fuori</span>'}</td>
    </tr>`;
  }).join('');

  const pari = st.cls.filter((r) => r.appaiata).length;
  return `<div class="card tight">
    <table class="classifica">
      <thead><tr><th></th><th>Squadra</th><th>V-S</th><th>Diff</th><th></th></tr></thead>
      <tbody>${righe}</tbody>
    </table>
    <p class="tiny muted mt">${st.gare.length} gare, ${st.perSquadra} a testa${
      pari ? ` · ${pari} posti a pari vittorie, decisi da scontro diretto e differenza canestri` : ''}.</p>
    ${calendarioCard(st)}
  </div>`;
}

function calendarioCard(st) {
  const righe = st.gare.map((g) => {
    const vinceA = g.vince === g.a;
    return `<div><span>${TEAM_NAMES[g.a]} <b class="${vinceA ? 'w' : ''}">${g.sa}</b> – <b class="${vinceA ? '' : 'w'}">${g.sb}</b> ${TEAM_NAMES[g.b]}</span>
      <span class="muted">${g.ot ? `${g.ot} ts` : ''}</span></div>`;
  }).join('');
  return `<details class="mt"><summary class="tiny">Tutti i risultati (${st.gare.length})</summary>
    <div class="log mt">${righe}</div></details>`;
}

/* ==========================================================
   5. Playoff
   ========================================================== */

export function teamsFromState(s) {
  const out = {};
  for (const k of S.attive(s)) out[k] = buildTeam(k, s.lineups[k], s.tactics[k]);
  return out;
}

// La classifica non sta nel database: si ricalcola dalla fotografia di
// quintetti e tattiche con cui la stagione e stata giocata. Cosi ritoccare le
// tattiche per i playoff non riscrive risultati gia visti.
export function stagioneFromState(s) {
  if (!s.stagione) return null;
  const keys = S.attive(s);
  const T = {};
  for (const k of keys) T[k] = buildTeam(k, s.stagione.lineups[k], s.stagione.tactics[k]);
  return simStagione(T, keys, s.stagione.seedBase, s.stagione.giri);
}

// I PLAYOFF, UNA SERIE ALLA VOLTA. Le serie di un turno erano aperte tutte
// insieme, ognuna con il suo tabellone e il suo tasto, e chi non ospitava
// doveva scorrere fra l'una e l'altra per capire dove si era. Adesso a
// schermo c'e solo la serie in corso, e in cima resta quello che cambia: il
// tabellone della serie, la gara appena giocata. Chi non ospita puo non
// toccare niente e vedere scorrere la serie da li.
function viewPlayoffs({ state: s, session }) {
  const isHost = s.host === session.uid;
  const T = teamsFromState(s);
  const po = s.po;
  const turni = costruisciBracket(po, T);
  const tot = turni.length;
  const conTeste = po.teste > 0;
  const ordine = ordineSerie(s, T);
  const x = serieCorrente(s, T, ordine);
  const finale = turni[tot - 1]?.[0];
  const finita = !!finale?.res?.done && !!x?.finale;
  let out = '';

  // A serata finita il campione sta in cima: e il momento piu alto, e la card
  // da mandare in chat si prende da li.
  if (finita) {
    out += bannerCampione(finale, T);
    out += '<button class="primary wide condividi" data-act="condividi-card">Condividi la serata</button>';
    out += premiCard(premiSerata(s, T));
  }

  out += strisciaTorneo(ordine, T, x?.id, finale);
  if (x?.a && x?.b && x.f) out += serieInCorso(s, session, x, T, isHost, ordine);
  out += pronosticiCard(s, T, session);

  if (finita) {
    const semi = turni[tot - 2];
    if (semi && semi.length === 1 && !po.third) {
      const p = semi[0];
      const terzo = p.res.winner === p.a ? p.b : p.a;
      out += `<div class="card tight center"><p class="small">
        <span class="muted">Terzo posto:</span> <b>${esc(TEAM_NAMES[terzo])}</b>,
        <span class="muted">eliminato in semifinale.</span></p></div>`;
    }
    // Il tabellone completo torna a fine serata, come riassunto del torneo.
    out += tabellonePlayoff(turni, T, conTeste);
    out += alboCard(s);
    out += rivalitaCard(s, session);
  }

  // Il perche degli accoppiamenti: utile la prima volta, poi ingombra.
  out += `<details class="po-info"><summary>${po.n} squadre · ${turni.reduce((a, r) => a + r.length, 0)} serie
    ${conTeste ? `· salta${po.teste > 1 ? 'no' : ''} il preliminare ${po.ordine.slice(0, po.teste).map((k) => esc(TEAM_NAMES[k])).join(', ')}` : ''}</summary>
    ${po.reasons.map((r) => `<p class="small muted" style="margin-top:6px">${esc(r)}</p>`).join('')}
  </details>`;
  return out;
}

// LA STRISCIA DEL TORNEO. Il tabellone completo stava in cima e si mangiava
// mezzo schermo; durante le gare serve solo sapere dove si e. Una riga
// sottile, la serie in corso accesa, e con tante squadre scorre di lato.
function strisciaTorneo(ordine, T, ora, finale) {
  const chip = ordine.map((x) => {
    const f = x.f;
    const conto = !!(f && x.giocate);
    const riga = (k, w) => (k && T[k]
      ? `<span class="ts-sq t-${k} ${f?.done ? (f.winner === k ? 'vince' : 'perde') : ''}"><span class="dot"></span><span class="nm">${esc(T[k].name)}</span><b>${conto ? w : ''}</b></span>`
      : '<span class="ts-sq vuota"><span class="nm">da decidere</span></span>');
    return `<div class="ts-chip ${x.id === ora ? 'ora' : ''} ${f?.done ? 'chiusa' : ''}">
      <span class="ts-tit">${esc(x.titolo)}</span>${riga(x.a, f?.wins.a)}${riga(x.b, f?.wins.b)}</div>`;
  }).join('');
  const W = finale?.res?.done ? T[finale.res.winner] : null;
  const camp = `<div class="ts-chip ts-oro ${W ? 'chiusa' : ''}"><span class="ts-tit">Campione</span>
    ${W ? `<span class="ts-sq t-${W.key} vince"><span class="dot"></span><span class="nm">${esc(W.name)}</span></span>` : '<span class="ts-sq vuota"><span class="nm">?</span></span>'}</div>`;
  return `<div class="torneo">${chip}${camp}</div>`;
}

// La serie in corso: tabellone, poi quello che serve adesso. Prima di gara 1
// i quintetti e la lavagna dei pronostici; dopo, la gara appena giocata, che
// si sovrascrive a ogni gara nuova — interessa quella, non le precedenti.
function serieInCorso(s, session, x, T, isHost, ordine) {
  const A = T[x.a], B = T[x.b], f = x.f;
  const n = f.games.length;
  const quote = quoteSerie(A, B, x.seed);
  // La gara a schermo: quella toccata su un pallino, ma solo finche non ne
  // arriva una nuova — allora si torna da soli all'ultima.
  const v = ui.garaVista;
  const idx = v && v.serie === x.id && v.n === n && v.g >= 0 && v.g < n ? v.g : n - 1;

  let out = `<div class="card serie attiva" id="serie-${esc(x.id)}" data-serie-attiva="${esc(x.id)}">`;
  out += serieBoard(x.titolo, A, B, f, idx);
  if (n === 0) {
    out += confronto(A, B);
    out += lavagna(s, session, x, A, B, quote);
  } else {
    out += pannelloGara(A, B, f.games[idx], idx, n);
  }
  if (f.done) out += riepilogo(s, x, A, B, f, quote, T);
  out += azioniSerie(s, session, x, T, isHost, ordine);
  out += '</div>';
  if (n > 0 && !f.done) out += pronosticiSerie(s, x, A, B, f, quote);
  if (n > 0) out += `<details class="confronto-wrap"><summary>I quintetti a confronto</summary>${confronto(A, B)}</details>`;
  return out;
}

// IL TABELLONE DELLA SERIE. In cima il punteggio grande della gara a
// schermo: e li che il numero sale quando si scopre una gara nuova. I sette
// pallini sono le gare: del colore di chi l'ha vinta, e toccandone uno il
// riquadro sotto mostra quella gara.
function serieBoard(titolo, A, B, f, idx) {
  const n = f.games.length;
  const g = f.games[idx] || null;
  const g7 = (f.wins.a === 3 && f.wins.b === 3) || n === 7;
  const dots = Array.from({ length: 7 }, (_, i) => {
    const gi = f.games[i];
    if (!gi) return '<i class="vuoto"></i>';
    const k = gi.scoreA > gi.scoreB ? A.key : B.key;
    return `<button class="pal t-${k} ${i === idx ? 'sel' : ''}" data-act="vedi-gara" data-g="${i}" aria-label="Gara ${i + 1}"></button>`;
  }).join('');
  const lato = (X, pt, vinto) => `<div class="sq t-${X.key}">
      <div class="pt ${vinto ? 'vince' : ''}" ${g ? `data-pt="${pt}"` : ''}>${g ? pt : '—'}</div>
      <div class="nm">${esc(X.name)}</div></div>`;
  return `<div class="jumbo serie-jumbo ${g7 ? 'gara7' : ''}">
    <div class="tabellina"><span>${esc(titolo)}</span>
      <span>${f.done ? 'chiusa' : (g7 ? 'GARA 7' : (n ? `gara ${n} di 7` : 'si parte'))}</span></div>
    <div class="pallini" aria-label="${f.wins.a} a ${f.wins.b}">${dots}</div>
    <div class="punteggio" ${g ? `data-gara="${idx + 1}"` : ''}>
      ${lato(A, g?.scoreA, g && g.scoreA > g.scoreB)}
      <div class="serie-conto">${f.wins.a}<span>-</span>${f.wins.b}</div>
      ${lato(B, g?.scoreB, g && g.scoreB > g.scoreA)}
    </div>
  </div>`;
}

// I due quintetti, ruolo per ruolo: e da qui che si sceglie il pronostico.
function confronto(A, B) {
  const D = db();
  const per = (X) => Object.fromEntries(X.five.map((p) => [p.slot, p]));
  const a = per(A), b = per(B);
  const ovr = (p) => (p ? D.byId[p.id]?.ovr ?? '' : '');
  const media = (X) => (X.five.reduce((t, p) => t + (D.byId[p.id]?.ovr || 0), 0) / X.five.length).toFixed(1);
  const righe = SLOTS.map((sl) => `<div class="cf-riga">
      <span class="cf-n">${a[sl] ? esc(a[sl].n) : ''}</span><b class="cf-o">${ovr(a[sl])}</b>
      <span class="cf-pos">${sl}</span>
      <b class="cf-o">${ovr(b[sl])}</b><span class="cf-n destra">${b[sl] ? esc(b[sl].n) : ''}</span>
    </div>`).join('');
  return `<div class="confronto">
    <div class="cf-testa"><span class="t-${A.key}"><span class="dot"></span>${esc(A.name)} <i>${media(A)}</i></span>
      <span class="t-${B.key} destra"><i>${media(B)}</i> ${esc(B.name)}<span class="dot"></span></span></div>
    ${righe}
  </div>`;
}

// "4-1" e scritto dal punto di vista del tabellone (prima squadra a
// sinistra). Per le persone si dice chi vince: "Lakers 4-1".
function esitoDetto(e, A, B) {
  const [wa, wb] = e.split('-').map(Number);
  return wa > wb ? `${A.name} ${wa}-${wb}` : `${B.name} ${wb}-${wa}`;
}

const fq = (q) => q.toFixed(2);

// LA LAVAGNA. Prima l'esito della serie, poi il miglior marcatore, ognuno
// con la sua quota. Un tocco per mercato, e si cambia idea finche non parte
// gara 1. Chi non e seduto al tavolo (la modalita locale) vede le quote ma
// non pronostica: su un telefono solo non avrebbe senso.
function lavagna(s, session, x, A, B, quote) {
  const mia = s.seats?.[session.uid];
  const puo = !!(mia && S.attive(s).includes(mia));
  const io = puo ? (s.po.pron?.[x.id]?.[mia] || {}) : {};
  const tasto = (campo, valore, etichetta, q, sel, cls = '') => (puo
    ? `<button class="qb ${cls} ${sel ? 'sel' : ''}" data-act="pronostico" data-serie="${esc(x.id)}" data-campo="${campo}" data-valore="${esc(valore)}"><span class="qe">${etichetta}</span><b>${fq(q)}</b></button>`
    : `<span class="qb fermo ${cls}"><span class="qe">${etichetta}</span><b>${fq(q)}</b></span>`);
  const esiti = (X, lista) => `<div class="lv-riga t-${X.key}">
      <span class="nm"><span class="dot"></span>${esc(X.name)}</span>
      <div class="lv-q">${lista.map((e) => {
        const [wa, wb] = e.split('-').map(Number);
        return tasto('e', e, `${Math.max(wa, wb)}-${Math.min(wa, wb)}`, quote.esiti[e].q, io.e === e);
      }).join('')}</div></div>`;
  const marcatori = quote.marcatori.map((m) => tasto('m', m.id,
    `<span class="dot t-${m.team}"></span>${esc(m.n)}`, m.q, io.m === m.id, 'mc')).join('');

  const scelte = s.po.pron?.[x.id] || {};
  const altri = Object.keys(scelte).filter((k) => k !== mia && (scelte[k]?.e || scelte[k]?.m));
  const chi = (k) => esc(S.nameOfSeat(s, k) || TEAM_NAMES[k]);
  return `<div class="lavagna">
    <div class="lv-testa"><span>${puo ? 'Il tuo pronostico' : 'Le quote della serie'}</span>
      <span class="tiny muted">${puo ? 'si chiude a gara 1' : ''}</span></div>
    <div class="lv-tit">Come finisce</div>
    ${esiti(A, ['4-0', '4-1', '4-2', '4-3'])}
    ${esiti(B, ['0-4', '1-4', '2-4', '3-4'])}
    <div class="lv-tit">Miglior marcatore della serie</div>
    <div class="lv-marc">${marcatori}</div>
    ${puo ? '<p class="tiny muted mt">Se indovini prendi la quota come punti.</p>' : ''}
    ${altri.length ? `<p class="tiny muted mt">Hanno pronosticato: ${altri.map(chi).join(', ')} — le scelte si scoprono a gara 1.</p>` : ''}
  </div>`;
}

// La gara a schermo: chi ha segnato di piu, il racconto, il box score. Se e
// una gara vecchia (toccata su un pallino) lo dice, e si torna all'ultima.
function pannelloGara(A, B, g, idx, n) {
  const vecchia = idx < n - 1;
  const top = (box) => box.slice().sort((p, q) => q.pts - p.pts).slice(0, 3)
    .map((l) => `${esc(l.n)} <b>${l.pts}</b>`).join(' · ');
  const box = [...g.boxA.map((l) => ({ ...l, t: A })), ...g.boxB.map((l) => ({ ...l, t: B }))]
    .sort((p, q) => q.pts - p.pts);
  return `<div class="gara-pan ${vecchia ? 'vecchia' : ''}">
    ${vecchia ? `<div class="vista-vecchia"><span>Stai guardando gara ${idx + 1}</span>
      <button class="sm ghost" data-act="vedi-gara" data-g="">Torna a gara ${n}</button></div>` : ''}
    <div class="gp-tit">Gara ${idx + 1}${g.ot ? ' · supplementari' : ''}</div>
    <div class="migliori">
      <div class="t-${A.key}"><span class="dot"></span>${top(g.boxA)}</div>
      <div class="t-${B.key}"><span class="dot"></span>${top(g.boxB)}</div>
    </div>
    <p class="story">${esc(narrateGame(A, B, g))}</p>
    <details class="box"><summary>Box score</summary>
      <table>${box.map((l) => `<tr><td class="n"><span class="dot t-${l.t.key}"></span>${esc(l.n)}</td>
        <td class="num">${l.pts}</td><td class="num">${l.reb}</td><td class="num">${l.ast}</td></tr>`).join('')}</table>
      <div class="tiny" style="margin-top:4px">punti · rimbalzi · assist</div>
    </details>
  </div>`;
}

// I pronostici della serie, scoperti da gara 1 in poi. A serie chiusa ognuno
// ha il suo esito e i punti presi.
function pronosticiSerie(s, x, A, B, f, quote) {
  const scelte = s.po.pron?.[x.id] || {};
  const chi = Object.keys(scelte).filter((k) => scelte[k]?.e || scelte[k]?.m);
  if (!chi.length) return '';
  const nome = (k) => esc(S.nameOfSeat(s, k) || TEAM_NAMES[k]);
  const righe = chi.map((k) => {
    const p = scelte[k];
    const pt = f.done ? puntiDi(p, f, quote) : null;
    const voce = (testo, q, preso) => (testo
      ? `<span class="pv ${pt ? (preso ? 'preso' : 'mancato') : ''}">${esc(testo)} <i>${fq(q)}</i>${pt && preso ? ` <b>+${fq(preso)}</b>` : ''}</span>`
      : '<span class="pv vuoto">—</span>');
    const m = p.m ? quote.marcatori.find((y) => y.id === p.m) : null;
    return `<div class="pv-riga"><span class="pv-chi">${nome(k)}</span>
      ${voce(p.e ? esitoDetto(p.e, A, B) : '', p.e ? quote.esiti[p.e].q : 0, pt?.e)}
      ${voce(m ? m.n : '', m ? m.q : 0, pt?.m)}</div>`;
  }).join('');
  return `<div class="pron-serie"><div class="lv-tit">I pronostici di questa serie</div>${righe}</div>`;
}

// IL RIEPILOGO, a serie chiusa: chi passa, MVP, miglior marcatore, chi ha
// preso i pronostici. Resta a schermo finche chi ospita non preme Avanti:
// tutti vedono i punti nello stesso momento.
function riepilogo(s, x, A, B, f, quote, T) {
  const W = f.winner === A.key ? A : B;
  const wv = Math.max(f.wins.a, f.wins.b), wp = Math.min(f.wins.a, f.wins.b);
  const { tot, top } = marcatoriDi(f);
  const marc = top.map((id) => quote.marcatori.find((m) => m.id === id)).filter(Boolean);
  const e = `${f.wins.a}-${f.wins.b}`;
  return `<div class="riepilogo t-${W.key}">
    <div class="rp-tit">${x.finale ? 'Campione' : (x.id === 'third' ? 'Terzo posto' : 'Passa il turno')}</div>
    <div class="rp-n"><span class="dot"></span>${esc(W.name)} <span class="rp-c">${wv}-${wp}</span></div>
    <div class="rp-voci">
      <div><span>MVP della serie</span><b>${esc(f.mvp.n)}</b>
        <i>${f.mvp.ppg.toFixed(1)} punti · ${f.mvp.rpg.toFixed(1)} rimbalzi · ${f.mvp.apg.toFixed(1)} assist</i></div>
      <div><span>Miglior marcatore</span><b>${marc.map((m) => esc(m.n)).join(' e ')}</b>
        <i>${tot[top[0]]} punti${marc[0] ? ` · era a ${fq(marc[0].q)}` : ''}</i></div>
      <div><span>Esito</span><b>${esc(esitoDetto(e, A, B))}</b><i>era a ${fq(quote.esiti[e].q)}</i></div>
    </div>
    ${pronosticiSerie(s, x, A, B, f, quote)}
    <details class="why"><summary>Perché ha vinto ${esc(W.name)}</summary>
      <ul>${explainSeries(A, B, f).map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>
    ${refertoCard(A, B, f)}
  </div>`;
}

// Chi non ha ancora pronosticato: solo le persone, i bot lo fanno da soli.
function mancanoPronostici(s, session, x) {
  if (session.mode === 'local') return [];
  const scelte = s.po.pron?.[x.id] || {};
  return S.attive(s).filter((k) => !s.bots?.[k] && S.seatTaken(s, k) && !scelte[k]?.e && !scelte[k]?.m)
    .map((k) => S.nameOfSeat(s, k) || TEAM_NAMES[k]);
}

// I tasti di chi ospita, sotto la gara. Gli altri non devono toccare niente.
function azioniSerie(s, session, x, T, isHost, ordine) {
  const f = x.f, n = f.games.length;
  if (f.done) {
    const strade = dopo(s, T, x, ordine);
    if (!strade.length) return '';
    if (!isHost) return '<p class="small muted center mt">Si passa alla prossima quando chi ospita preme Avanti.</p>';
    return strade.map((st) => `<button class="${st.id === 'third' ? 'ghost' : 'primary'} wide mt" data-act="avanti-serie"
        data-next="${esc(st.id)}" ${st.a ? `data-a="${st.a}" data-b="${st.b}"` : ''}>${st.id === 'third'
        ? 'Prima la finale 3° / 4° posto' : `Avanti: ${esc(st.titolo)}`}</button>`).join('');
  }
  if (!isHost) return '<p class="small muted center mt">In attesa di chi ospita.</p>';
  // Prima di gara 1 il tasto dice chi non ha ancora pronosticato. Non blocca:
  // un telefono in tasca non deve fermare la serata.
  const mancano = n === 0 ? mancanoPronostici(s, session, x) : [];
  const nota = mancano.length ? ` · ${mancano.length === 1 ? 'ne manca 1' : `ne mancano ${mancano.length}`}` : '';
  const dati = `data-serie="${esc(x.id)}" data-mancano="${esc(mancano.join(', '))}"`;
  return `<button class="primary wide mt" data-act="simula-gara" ${dati}>Simula gara ${n + 1}${nota}</button>
    ${mancano.length ? `<p class="tiny muted mancano">Non hanno ancora pronosticato: ${mancano.map(esc).join(', ')}</p>` : ''}
    <button class="sm ghost wide mt" data-act="simula-serie" ${dati}>Simula tutta la serie</button>`;
}

// IL TABELLONE DEI PLAYOFF. Una colonna per turno, e i vincitori che
// avanzano si vedono passare da una colonna all'altra.
//
// Niente linee di collegamento, di proposito: con le teste di serie chi
// salta il preliminare entra direttamente al turno dopo, quindi l'albero non
// e un binario perfetto e delle linee disegnate a regola direbbero cose
// false. Le colonne distribuite in altezza si leggono lo stesso.
//
// Da quando si gioca una serie alla volta sta in fondo, a serata finita: e il
// riassunto del torneo. Durante le gare in cima c'e la striscia sottile.
function tabellonePlayoff(turni, T, conTeste) {
  const tot = turni.length;
  const colonne = turni.map((round, r) => {
    const celle = round.map((m) => {
      const A = m.a ? T[m.a] : null;
      const B = m.b ? T[m.b] : null;
      const f = m.res;
      const esito = f?.done ? (f.winner === m.a ? 'a' : 'b') : null;
      const riga = (X, w, lato) => (X
        ? `<div class="br-sq t-${X.key} ${esito === lato ? 'vince' : (esito ? 'perde' : '')}">
             <span class="dot"></span><span class="nm">${esc(X.name)}</span><b>${f ? w : ''}</b></div>`
        : '<div class="br-sq vuota"><span class="nm">da decidere</span></div>');
      return `<div class="br-cella ${f?.done ? 'chiusa' : ''}">
        ${riga(A, f?.wins.a, 'a')}${riga(B, f?.wins.b, 'b')}
      </div>`;
    }).join('');
    return `<div class="br-col"><div class="br-tit">${esc(nomeTurno(r, tot, conTeste))}</div>
      <div class="br-celle">${celle}</div></div>`;
  }).join('');

  // In fondo al tabellone, il campione: e la casella a cui porta tutto.
  const fin = turni[tot - 1]?.[0];
  const W = fin?.res?.done ? T[fin.res.winner] : null;
  const ultima = `<div class="br-col br-campione"><div class="br-tit">Campione</div>
    <div class="br-celle"><div class="br-cella br-oro ${W ? 'chiusa' : ''}">
      ${W ? `<div class="br-sq t-${W.key} vince"><span class="dot"></span><span class="nm">${esc(W.name)}</span></div>`
        : '<div class="br-sq vuota"><span class="nm">?</span></div>'}
    </div></div></div>`;

  return `<div class="jumbo br-jumbo">
    <div class="tabellina"><span>Tabellone playoff</span><span>${W ? 'concluso' : 'in corso'}</span></div>
    <div class="bracket">${colonne}${ultima}</div>
  </div>`;
}

// Un trofeo disegnato, non un'emoji: le emoji cambiano da telefono a
// telefono, e il momento del campione deve essere uguale per tutti.
function trofeo(dim = 64) {
  return `<svg class="trofeo" width="${dim}" height="${dim}" viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="oro" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#ffe7a3"/><stop offset=".5" stop-color="#ffd166"/><stop offset="1" stop-color="#c9921f"/>
    </linearGradient></defs>
    <path d="M18 8h28v14c0 9-6 16-14 16s-14-7-14-16z" fill="url(#oro)"/>
    <path d="M18 12H9c0 8 4 13 10 14M46 12h9c0 8-4 13-10 14" fill="none" stroke="#ffd166" stroke-width="3" stroke-linecap="round"/>
    <rect x="28" y="38" width="8" height="10" fill="#c9921f"/>
    <rect x="20" y="48" width="24" height="7" rx="1.5" fill="url(#oro)"/>
    <path d="M24 13c1 6 3 10 7 12" stroke="#fff6d6" stroke-width="2" fill="none" opacity=".7" stroke-linecap="round"/>
  </svg>`;
}

// I premi di fine serata. Il bidone ha il suo colore: e l'unico premio che
// nessuno vuole vincere, e deve sembrarlo.
function premiCard(premi) {
  if (!premi.length) return '';
  const ICONA = { mvp: '&#9733;', punti: '&#9673;', rimbalzi: '&#9650;', colpo: '&#10003;', bidone: '&#10007;' };
  return `<div class="premi">
    <div class="premi-tit">Premi della serata</div>
    ${premi.map((p) => `<div class="premio ${p.chiave === 'bidone' ? 'bidone' : ''} ${p.team ? `t-${p.team}` : ''}">
      <span class="pr-ic">${ICONA[p.chiave] || '&#9733;'}</span>
      <div class="pr-testo">
        <span class="pr-tit">${esc(p.titolo)}</span>
        <span class="pr-nome">${esc(p.nome)}${p.team ? ` <span class="pr-sq">${esc(TEAM_NAMES[p.team] || '')}</span>` : ''}</span>
        <span class="pr-riga">${esc(p.riga)}</span>
      </div>
    </div>`).join('')}
  </div>`;
}

// Il banner del campione, in cima alla pagina a finale chiusa.
function bannerCampione(m, T) {
  const W = m.res.winner === m.a ? T[m.a] : T[m.b];
  const L = W.key === m.a ? T[m.b] : T[m.a];
  const wv = Math.max(m.res.wins.a, m.res.wins.b), wp = Math.min(m.res.wins.a, m.res.wins.b);
  return `<div class="champ t-${W.key}">
    ${trofeo(56)}
    <div class="t">Campione</div>
    <div class="n">${esc(W.name)}</div>
    <div class="small">${wv}-${wp} su ${esc(L.name)}${m.res.mvp ? ` · MVP delle Finals ${esc(m.res.mvp.n)}` : ''}</div>
    <div class="rosa">${(W.five || []).map((p) => esc(p.n)).join(' · ')}</div>
  </div>`;
}

// Il momento del campione a schermo intero. Lo apre app.js UNA volta, nel
// momento in cui la finale si chiude: non sta dentro render() perche ogni
// ridisegno lo cancellerebbe, e perche deve vederlo chi era a tavola in quel
// momento, non chi rientra in stanza un'ora dopo.
export function rivelaCampione(s) {
  const T = teamsFromState(s);
  const turni = costruisciBracket(s.po, T);
  const m = turni[turni.length - 1]?.[0];
  if (!m?.res?.done) return '';
  const W = m.res.winner === m.a ? T[m.a] : T[m.b];
  const L = W.key === m.a ? T[m.b] : T[m.a];
  const wv = Math.max(m.res.wins.a, m.res.wins.b), wp = Math.min(m.res.wins.a, m.res.wins.b);
  // Coriandoli: posizioni e ritardi fissati dal seme della finale, cosi
  // sono gli stessi su ogni telefono invece di cambiare a ogni apertura.
  let h = 0;
  for (const c of String(m.seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296);
  const COL = ['#ffd166', '#e01b2e', '#34d399', '#6ee7ff', '#ffffff'];
  const pezzi = Array.from({ length: 42 }, () => {
    const x = (rnd() * 100).toFixed(1), d = (rnd() * 1.6).toFixed(2), t = (2.4 + rnd() * 1.6).toFixed(2);
    const r = Math.floor(rnd() * 360), c = COL[Math.floor(rnd() * COL.length)];
    return `<i style="left:${x}%;animation-delay:${d}s;animation-duration:${t}s;background:${c};transform:rotate(${r}deg)"></i>`;
  }).join('');
  return `<div class="rivela t-${W.key}" data-act="chiudi-rivela" role="dialog" aria-label="Campione: ${esc(W.name)}">
    <div class="coriandoli">${pezzi}</div>
    <div class="rivela-box">
      ${trofeo(96)}
      <div class="t">Campione</div>
      <div class="n">${esc(W.name)}</div>
      <div class="small">${wv}-${wp} su ${esc(L.name)}</div>
      ${m.res.mvp ? `<div class="mvp-r">MVP delle Finals<b>${esc(m.res.mvp.n)}</b></div>` : ''}
      <div class="rosa">${(W.five || []).map((p) => esc(p.n)).join(' · ')}</div>
      <p class="tiny muted mt">tocca per chiudere</p>
    </div>
  </div>`;
}

// Il referto: quanto sono valse le scelte tecniche, in punti a partita.
// Senza questo nessuna delle cinque scelte si impara mai — si tirano a caso
// per sempre e tanto valeva non chiederle. Sta chiuso in un <details> perche
// e la parte che si legge dopo, non durante.
function refertoCard(A, B, f) {
  const blocchi = [A, B].map((T) => {
    const O = T === A ? B : A;
    let ref;
    try { ref = refertoTattico(T, O); } catch { return ''; }
    const haVinto = f.winner === T.key;
    const pt = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`;

    const righe = ref.voci.map((v) => `<tr class="${v.eraGiusta ? 'giusta' : ''}">
      <td class="dim">${esc(v.etichetta)}</td>
      <td class="scelta">${esc(v.scelto)}</td>
      <td class="val ${v.ininfluente ? '' : (v.valore >= 0 ? 'su' : 'giu')}">${v.ininfluente ? '—' : pt(v.valore)}</td>
      <td class="alt">${v.ininfluente
        ? 'qui valeva uguale qualunque cosa'
        : (v.eraGiusta
          ? '<span class="ok">la migliore</span>'
          : `meglio <b>${esc(v.migliore)}</b> <span class="muted">${pt(v.quantoMeglio)}</span>`)}</td>
    </tr>`).join('');

    return `<div class="ref-blocco t-${T.key}">
      <div class="row spread"><span class="nm"><span class="dot"></span>${esc(T.name)}</span></div>
      <p class="small mb">${esc(verdettoReferto(ref, haVinto))}</p>
      <table class="referto"><tbody>${righe}</tbody></table>
    </div>`;
  }).join('');

  return `<details class="referto-wrap mt"><summary>Il referto — hanno pagato le tue scelte?</summary>
    <p class="tiny muted mt">Punti a partita rispetto a scegliere a caso, contro <i>questo</i> avversario.
    Contro un altro le risposte cambiano.</p>
    ${blocchi}</details>`;
}

/* ---------- Pronostici ---------- */

// La classifica dei pronostici della serata. Compare dal primo pronostico; a
// serata finita il primo e il re dei pronostici, se e uno solo.
function pronosticiCard(s, T, session) {
  const cl = classificaPronostici(s, T);
  // Prima che si chiuda una serie sarebbe una fila di zeri.
  if (!cl.some((r) => r.chiusi > 0)) return '';
  const mia = s.seats?.[session.uid];
  const finita = ordineSerie(s, T).every((x) => !x.a || !x.b || x.f?.done);
  const re = finita ? reDeiPronostici(cl) : null;
  const righe = cl.map((r, n) => `<div class="pron-cl ${r.key === mia ? 'io' : ''}">
      <span class="pos">${n + 1}</span>
      <span class="nm">${esc(S.nameOfSeat(s, r.key) || TEAM_NAMES[r.key])}</span>
      <span class="tiny muted">${r.presi} pres${r.presi === 1 ? 'o' : 'i'} su ${r.chiusi * 2}</span>
      <b>${r.punti.toFixed(2)}</b>
    </div>`).join('');
  return `<div class="card pronostici">
    <h3 class="mb">${re ? `Re dei pronostici: ${esc(S.nameOfSeat(s, re.key) || TEAM_NAMES[re.key])}` : 'Classifica pronostici'}</h3>
    ${righe}
    <p class="tiny muted mt">Ogni pronostico indovinato vale la sua quota.</p>
  </div>`;
}

/* ---------- Rivalita ---------- */

// Chi ha battuto chi, su tutte le serate. Sta accanto all'albo: l'albo dice
// chi vince, questa dice CONTRO CHI — che e quello di cui si parla davvero a
// tavola fra una serata e l'altra.
export function rivalitaCard(s, session) {
  const { coppie, persone } = S.rivalita(s.albo);
  if (!coppie.length) return '';
  const mio = session ? s.names?.[session.uid] : null;
  const io = mio ? persone[mio] : null;
  const righe = coppie.slice(0, 8).map((c) => `<div class="riv-riga">
      <span class="riv-n ${c.va > c.vb ? 'vince' : ''} ${c.a === mio ? 'io' : ''}">${esc(c.a)}</span>
      <b class="riv-c">${c.va}<i>-</i>${c.vb}</b>
      <span class="riv-n destra ${c.vb > c.va ? 'vince' : ''} ${c.b === mio ? 'io' : ''}">${esc(c.b)}</span>
    </div>`).join('');
  return `<div class="card rivalita">
    <h3 class="mb">Rivalità</h3>
    ${io?.bestiaNera ? `<p class="bestia">La tua bestia nera: <b>${esc(io.bestiaNera.nome)}</b>
      <span class="muted">— ${io.bestiaNera.vinte}-${io.bestiaNera.perse} nelle serie</span></p>` : ''}
    ${righe}
    <p class="tiny muted mt">Serie vinte fra persone, su tutte le serate.</p>
  </div>`;
}

/* ---------- Albo d'oro ---------- */

export function alboCard(s) {
  const albo = (s.albo || []).slice().reverse();
  if (!albo.length) return '';
  const cl = S.classifica(s).filter((t) => t.titoli || t.finali);

  // I nomi girano a ogni partita, la sedia no: senza il nome di chi ci sta
  // seduto la classifica fra le serate non direbbe piu a chi appartiene.
  const righe = cl.map((t) => `<div class="albo-riga t-${t.key}">
      <span class="dot"></span>
      <span class="nm">${esc(S.nameOfSeat(s, t.key) || t.nome)}</span>
      ${S.nameOfSeat(s, t.key) ? `<span class="tiny muted">oggi ${esc(t.nome)}</span>` : ''}
      <span class="grow"></span>
      <b>${t.titoli}</b><span class="tiny muted">${t.titoli === 1 ? 'titolo' : 'titoli'}</span>
      <span class="tiny muted">· ${t.finali} final${t.finali === 1 ? 'e' : 'i'}</span>
    </div>`).join('');

  const storia = albo.slice(0, 8).map((e) => `<div>
      <span>${esc(e.championName)} <span class="muted">b. ${esc(e.runnerUpName)} ${e.wins}</span></span>
      <span class="muted tiny">${esc(e.mvp || '')}</span>
    </div>`).join('');

  return `<div class="card">
    <h3 class="mb">Albo d'oro</h3>
    <div class="albo">${righe}</div>
    <details class="mt"><summary>Le ${albo.length} partite giocate</summary>
      <div class="log mt">${storia}</div></details>
  </div>`;
}

export { esc };
