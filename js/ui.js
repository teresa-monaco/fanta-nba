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

export const ui = {
  nickname: localStorage.getItem('nbaf:nick') || '',
  selSlot: null,      // { team, slot } in fase quintetti
  banner: null,
  manualOpen: false,
  numSquadre: 4,      // solo in modalita locale: quante squadre gioca chi ospita
  editLineup: null,   // squadra con il quintetto sbloccato per la modifica
  allIn: null,        // { team, at } — All in armato, valido finché l'offerta non cambia
  bidTeam: null,      // chi ospita molte squadre: per quale sta rilanciando adesso
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
    + resetZone(ctx);
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

function viewLobby({ state: s, session }) {
  const isHost = s.host === session.uid;
  const local = session.mode === 'local';

  // Chi e dentro, nell'ordine in cui e arrivato. La squadra non si sceglie:
  // viene assegnata, cosi non si perdono cinque minuti a contrattare i colori.
  const dentro = TEAM_KEYS.filter((k) => S.seatTaken(s, k)).map((k) => {
    const mine = s.seats[session.uid] === k;
    return `<div class="strip t-${k}">
      <span class="dot"></span>
      <span class="nm">${TEAM_NAMES[k]}</span>
      <span class="grow"></span>
      <span class="small">${esc(S.nameOfSeat(s, k))}${mine ? ' <span class="tiny muted">(tu)</span>' : ''}</span>
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

  return `
    <h1>Fanta NBA</h1>
    <p class="muted mb">Asta a crediti, quintetti, playoff simulati. Da 2 a 12 squadre, 50 crediti a testa, 5 giocatori ciascuna.</p>

    ${local ? `
      <div class="card">
        <h3 class="mb">Modalità locale</h3>
        <p class="small muted">Firebase non è configurato: la partita gira su questo solo schermo.
        Per giocare ognuno dal proprio telefono servono 3 minuti di setup — vedi SETUP.md.</p>
      </div>
      ${sceltaLocale}` : `
      <div class="card">
        <h3>Codice stanza: <span class="code-pill">${esc(session.code)}</span></h3>
        <p class="small muted mt">Gli altri aprono lo stesso link e inseriscono questo codice. Si gioca in 2, 3, 4, 6, 8, 10 o 12: si parte con chi c'è.</p>
        <button class="sm ghost mt" data-act="copy-link">Copia il link della stanza</button>
      </div>

      <div class="card">
        ${sonoDentro ? `
          <div class="row spread">
            <h3>Sei dentro</h3>
            <button class="sm ghost" data-act="leave">Esci</button>
          </div>
          <p class="small muted mt">Ti è stata assegnata <b>${TEAM_NAMES[s.seats[session.uid]]}</b>.</p>
        ` : `
          <label class="field"><span>Il tuo nome</span>
            <input id="nick" value="${esc(ui.nickname)}" placeholder="il tuo nome" maxlength="14" autocomplete="off">
          </label>
          ${pieno
            ? '<p class="small muted">Tutte le squadre sono già assegnate: puoi guardare.</p>'
            : '<button class="primary wide" data-act="join">Entra in partita</button>'}
        `}
      </div>

      ${dentro ? `<div class="card tight">
        <p class="tiny muted mb">In partita (${n})</p>${dentro}
      </div>` : '<p class="small muted center mb">Ancora nessuno dentro.</p>'}`}

    ${sceltaFormato}

    ${isHost ? `
      <button class="primary wide" data-act="start-auction" ${S.numeroValido(n) ? '' : 'disabled'}>
        Inizia l'asta${S.numeroValido(n) ? ` con ${n} squadre` : ''}
      </button>
      ${S.numeroValido(n) ? '' : `<p class="small muted center mt">Siete in ${n}: si gioca in 2, 3, 4, 6, 8, 10 o 12. Sopra i quattro servono numeri pari, altrimenti mezzo tabellone salta il primo turno.</p>`}
    ` : `<p class="small muted center">In attesa che ${esc(s.names[s.host] || 'chi ospita')} avvii l'asta...</p>`}
    ${alboCard(s)}
  `;
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
      <button class="sm ghost" data-act="pass">Salta</button>
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

  return `
    <div class="card lot">
      <div class="lot-head">
        <div>
          <div class="eyebrow">In asta ora</div>
          <div class="nm">${esc(p.n)}</div>
          <div class="meta">${p.pos}${p.alt?.length ? ' / ' + p.alt.join('/') : ''} · ${esc(arc?.label || p.arc)} · ${esc(p.tm)}, ${p.era}</div>
        </div>
        <div class="ovr"><b>${p.ovr}</b><i>Overall</i></div>
      </div>
      <div class="attrs">${attrs}</div>
      ${hostBar}
    </div>

    <div class="card bidbox ${paused ? 'paused' : ''}">
      <div class="bid-info">
        <div class="bidnow">${bid ? bid.amount : 0}<small> crediti</small></div>
        <div class="bidder">${bid ? `offerta di <b>${TEAM_NAMES[bid.team]}</b>` : '<span class="muted">nessuna offerta</span>'}</div>
      </div>
      <div class="clock" id="clock">--</div>
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

// La tua squadra: crediti, slot, rosa e quanto puoi spingere. Sta sopra gli
// avversari perché mentre decidi se puntare guardi il tuo budget, non il loro.
function myTeamCard(s, k, bid) {
  const D = db();
  const t = s.teams[k];
  const left = S.slotsLeft(s, k);
  const max = S.maxBid(s, k);
  const leader = bid && bid.team === k;
  const chips = t.roster.map((id) => D.byId[id]).filter(Boolean)
    .map((p) => `<span class="chip">${esc(p.n)} <b>${p.ovr}</b></span>`).join('')
    + Array.from({ length: left }, () => '<span class="chip empty">libero</span>').join('');

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
    <div class="chips">${chips}</div>
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

  return `<div class="bidbar-spacer ${bidders.length > 3 ? 'tall' : ''}"></div><div class="bidbar">${picker}${mostra.map((k) => {
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

    return `<div class="bidrow">${tag}${step(1)}${step(2)}${step(3)}${allIn}</div>`;
  }).join('')}</div>`;
}

function auctionLog(s, D) {
  const rows = s.auction.log.slice().reverse().slice(0, 30).map((l) =>
    `<div><span>${esc(D.byId[l.playerId]?.n || l.playerId)}</span><span class="muted">${TEAM_NAMES[l.team]} · ${l.price}</span></div>`)
    .join('') || '<div class="muted">Nessun acquisto.</div>';
  return `<details class="card tight"><summary>Acquisti (${s.auction.log.length})</summary><div class="log mt">${rows}</div></details>`;
}

export function tickClock(s) {
  const el = document.getElementById('clock');
  if (!el) return null;
  if (s.auction.paused) {
    el.textContent = `fermo a ${Math.ceil((s.auction.remaining ?? 0) / 1000)}s`;
    el.classList.remove('hot');
    el.classList.add('frozen');
    return null;
  }
  el.classList.remove('frozen');
  if (!s.auction.running || !s.auction.deadline) { el.textContent = 'in attesa'; return null; }
  const left = Math.max(0, s.auction.deadline - now());
  const sec = Math.ceil(left / 1000);
  el.textContent = sec > 0 ? `${sec}s` : 'chiuso';
  el.classList.toggle('hot', sec <= 5);
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
      if (!p) return `<div class="slot"><span class="pos">${sl}</span><span class="nm muted">vuoto</span></div>`;
      const off = p.pos !== sl && !(p.alt || []).includes(sl);
      const sel = ui.selSlot && ui.selSlot.team === k && ui.selSlot.slot === sl;
      const attivo = editLineup && canEdit;
      return `<button class="slot ${sel ? 'sel' : ''}" ${attivo ? `data-act="pick-slot" data-team="${k}" data-slot="${sl}"` : 'disabled'}>
        <span class="pos">${sl}</span>
        <span class="nm">${esc(p.n)}${off ? ' <span class="warn">fuori ruolo</span>' : ''}</span>
        <span class="ov">${p.ovr}</span>
      </button>`;
    }).join('');

    const roster = s.teams[k].roster.map((id) => D.byId[id]).filter(Boolean);
    const opt = (sel, exclude) => roster.filter((p) => p.id !== exclude)
      .map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.n)} (${p.ovr})</option>`).join('');

    return `<div class="card t-${k} ${mia ? 'mine' : ''}">
      <div class="row spread">
        <h3><span class="dot" style="display:inline-block;margin-right:7px"></span>${TEAM_NAMES[k]}${mia ? ' <span class="tiny muted">(tu)</span>' : ''}</h3>
        ${canEdit ? `<button class="sm ghost" data-act="toggle-lineup" data-team="${k}">${editLineup ? 'Fatto' : 'Modifica'}</button>` : ''}
      </div>
      ${identity ? `<p class="identita">${esc(identity)}</p>` : ''}
      <div class="slots mt">${slots}</div>
      ${editLineup ? '<p class="tiny muted mt">Tocca due caselle per scambiarle.</p>' : ''}
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

        <span class="lbl-mini">Ritmo</span>
        <div class="ritmo">
          ${Object.entries(RITMI).map(([id, v]) => `<button class="rbtn ${t.ritmo === id ? 'on' : ''}"
            ${canEdit ? `data-act="set-ritmo" data-team="${k}" data-v="${id}"` : 'disabled'}>${esc(v.label)}</button>`).join('')}
        </div>
        <p class="tiny muted mb">${esc(RITMI[t.ritmo]?.desc || '')}</p>

        ${coachPicker(s, k, t, canEdit)}
      </div>
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

  return `
    ${testa}
    ${cards}
    ${isHost ? azione : '<p class="small muted center">In attesa di chi ospita.</p>'}
  `;
}

// Gli allenatori li sblocca la rosa: uno per giocatore, quello della sua
// squadra in quell'epoca. Ognuno e un patto, quindi accanto al nome sta
// scritto cosa da e cosa toglie — altrimenti si sceglie a caso.
function coachPicker(s, k, t, canEdit) {
  const liberi = S.allenatoriDi(s.teams[k].roster);
  if (!liberi.length) return '';
  const sel = liberi.find((c) => c.id === t.coach) || null;
  return `
    <span class="lbl-mini">Allenatore <i class="tiny muted">— sbloccati dai tuoi giocatori</i></span>
    <div class="coaches">
      ${liberi.map((c) => `<button class="cbtn ${c.id === t.coach ? 'on' : ''}"
        ${canEdit ? `data-act="set-coach" data-team="${k}" data-v="${c.id}"` : 'disabled'}>
        <b>${esc(c.n)}</b><span>${esc(c.label)}</span><i>via ${esc(c.da)}</i>
      </button>`).join('')}
    </div>
    ${sel ? `<p class="tiny muted">${esc(sel.desc)} ${esc(effettoInParole(sel))}</p>` : ''}`;
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

function viewPlayoffs({ state: s, session }) {
  const isHost = s.host === session.uid;
  const T = teamsFromState(s);
  const po = s.po;
  const turni = costruisciBracket(po, T);
  const tot = turni.length;
  const conTeste = po.teste > 0;

  let out = `<h2>Playoff</h2>
    <div class="card tight">
      <p class="tiny muted mb">${po.n} squadre · ${turni.reduce((a, r) => a + r.length, 0)} serie</p>
      ${po.reasons.map((r) => `<p class="small muted" style="margin-bottom:6px">${esc(r)}</p>`).join('')}
    </div>`;

  // Chi salta il primo turno, detto una volta e chiaramente.
  if (conTeste) {
    out += `<div class="card tight center"><p class="small">
      <span class="muted">Salta${po.teste > 1 ? 'no' : ''} il preliminare:</span>
      <b>${po.ordine.slice(0, po.teste).map((k) => esc(TEAM_NAMES[k])).join(', ')}</b></p></div>`;
  }

  let campione = null;
  for (let r = 0; r < tot; r++) {
    const ultimo = r === tot - 1;
    const passo = ultimo ? S.PASSO_FINALE : S.PASSO_SEMI;
    const nome = nomeTurno(r, tot, conTeste);
    const round = turni[r];

    // Un turno si apre solo quando il precedente e chiuso: senza, mostrerebbe
    // caselle vuote e il tasto "Vai" su una serie senza partecipanti.
    const precedenteChiuso = r === 0 || turni[r - 1].every((m) => m.res?.done);
    if (!precedenteChiuso) break;

    if (ultimo && round[0]?.res?.done) {
      const m = round[0];
      const W = m.res.winner === m.a ? T[m.a] : T[m.b];
      campione = m.res;
      out += `<div class="champ"><div class="t">Campione</div><div class="n">${esc(W.name)}</div>
        <div class="small" style="font-weight:700">${Math.max(m.res.wins.a, m.res.wins.b)}-${Math.min(m.res.wins.a, m.res.wins.b)} nella serie</div></div>`;
    }

    round.forEach((m, i) => {
      const titolo = round.length > 1 ? `${nome} ${i + 1}` : nome;
      out += serieCard(titolo, T[m.a], T[m.b], m.res, m, passo, isHost, `avanza:${r}:${i}`);
    });
  }

  // Finalina: solo se il penultimo turno aveva due serie, cioe due eliminate.
  if (campione) {
    const semi = turni[tot - 2];
    if (semi && semi.length === 2) {
      if (po.third) {
        const t3 = simSeriesUpTo(T[po.third.a], T[po.third.b], po.third.seed, po.third.gamesPlayed);
        out += serieCard('Finale 3° / 4° posto', T[po.third.a], T[po.third.b], t3, po.third, S.PASSO_SEMI, isHost, 'avanza-third');
      } else if (isHost) {
        out += `<button class="wide ghost" data-act="open-third">Giocare anche la finale 3°/4° posto?</button>`;
      }
    } else if (semi && semi.length === 1) {
      const p = semi[0];
      const terzo = p.res.winner === p.a ? p.b : p.a;
      out += `<div class="card tight center"><p class="small">
        <span class="muted">Terzo posto:</span> <b>${esc(TEAM_NAMES[terzo])}</b>,
        <span class="muted">eliminato in semifinale.</span></p></div>`;
    }
    out += alboCard(s);
    // Il tasto per ricominciare lo mette resetZone(), in fondo a ogni schermata.
  }
  return out;
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

// Una sola carta per tutte le serie: cambia solo di quante gare si avanza
// a ogni tocco. Semifinali e finalina due, Finals una.
function serieCard(titolo, A, B, f, meta, passo, isHost, act) {
  if (!A || !B || !f) {
    return `<div class="card"><div class="series-hdr"><div>
      <div class="tiny muted" style="text-transform:uppercase;letter-spacing:.08em;font-weight:800">${esc(titolo)}</div>
      <div class="vs muted">in attesa del turno precedente</div></div></div></div>`;
  }
  const n = meta.gamesPlayed;
  const etichetta = passo === 1
    ? `Vai — Gara ${n + 1}`
    : (n === 0 ? 'Vai — le prime due gare' : `Vai — Gare ${n + 1} e ${n + 2}`);

  const games = f.games.map((g) => gameBlock(A, B, g)).join('')
    || '<p class="small muted center" style="padding:12px 0">Non è ancora iniziata.</p>';

  const coda = f.done
    ? `<div class="mvp"><div class="t">MVP della serie</div>
         <div class="n">${esc(f.mvp.n)}</div>
         <div class="small muted">${f.mvp.ppg.toFixed(1)} punti · ${f.mvp.rpg.toFixed(1)} rimbalzi · ${f.mvp.apg.toFixed(1)} assist di media</div></div>
       <div class="why"><h3 style="margin:14px 0 8px">Perché ha vinto ${esc(f.winner === A.key ? A.name : B.name)}</h3>
         <ul>${explainSeries(A, B, f).map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>
       ${refertoCard(A, B, f)}`
    : (isHost
      ? `<button class="primary wide mt" data-act="${act}">${etichetta}</button>`
      : '<p class="small muted center mt">In attesa di chi ospita.</p>');

  return `<div class="card">
    <div class="series-hdr mb">
      <div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:.08em;font-weight:800">${esc(titolo)}</div>
        <div class="vs">${A.name} <span class="muted">vs</span> ${B.name}</div></div>
      <div class="score-big">${f.wins.a}-${f.wins.b}</div>
    </div>
    <p class="tiny muted mb">${esc(teamIdentity(A))} &nbsp;·&nbsp; ${esc(teamIdentity(B))}</p>
    ${games}
    ${coda}
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

function gameBlock(A, B, g) {
  const aWon = g.scoreA > g.scoreB;
  const box = [...g.boxA.map((l) => ({ ...l, t: A.name })), ...g.boxB.map((l) => ({ ...l, t: B.name }))]
    .sort((x, y) => y.pts - x.pts).slice(0, 5);
  return `<div class="game">
    <div class="line">
      <span class="gname">Gara ${g.n}${g.ot ? ' · OT' : ''}</span>
      <span class="res"><span class="${aWon ? 'w' : ''}">${A.name} ${g.scoreA}</span> — <span class="${aWon ? '' : 'w'}">${g.scoreB} ${B.name}</span></span>
    </div>
    <div class="story">${esc(narrateGame(A, B, g))}</div>
    <details class="box"><summary>Box score</summary>
      <table>${box.map((l) => `<tr><td class="n">${esc(l.n)}</td><td class="muted tiny">${esc(l.t)}</td>
        <td class="num">${l.pts}</td><td class="num">${l.reb}</td><td class="num">${l.ast}</td></tr>`).join('')}</table>
      <div class="tiny" style="margin-top:4px">punti · rimbalzi · assist</div>
    </details>
  </div>`;
}

export { esc };
