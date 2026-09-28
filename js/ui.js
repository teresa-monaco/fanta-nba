// ui.js — rendering. Nessun framework: template string + un solo handler
// delegato sui click. Lo stato transitorio della UI (nickname in digitazione,
// slot selezionato per lo scambio) vive qui, fuori dallo stato condiviso.

import { db, SLOTS, SLOT_LABEL, TEAM_KEYS, TEAM_NAMES, STRATEGIES, ROSTER_SIZE, START_CREDITS } from './core.js';
import { buildTeam, simSeries, simSeriesUpTo, pickBracket } from './engine.js';
import { narrateGame, explainSeries, teamIdentity } from './narrator.js';
import * as S from './state.js';
import { now } from './net.js';

export const ui = {
  nickname: localStorage.getItem('nbaf:nick') || '',
  selSlot: null,      // { team, slot } in fase quintetti
  selTeam: null,      // squadra mostrata nelle schermate per-squadra
  banner: null,
  manualOpen: false,
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
      case 'lineups': body = viewLineups(ctx); break;
      case 'tactics': body = viewTactics(ctx); break;
      case 'playoffs': body = viewPlayoffs(ctx); break;
      default: body = `<div class="card">Fase sconosciuta: ${esc(s.phase)}</div>`;
    }
  } catch (err) {
    body = `<div class="banner err"><b>Errore di rendering.</b><br>${esc(err.message)}</div>`;
    console.error(err);
  }
  root.innerHTML = (ui.banner ? `<div class="banner${ui.banner.err ? ' err' : ''}">${esc(ui.banner.text)}</div>` : '') + body;
}

export function renderTopbar(el, ctx) {
  const { session } = ctx;
  el.innerHTML = `
    <div class="brand">FANTA<span>NBA</span></div>
    <div class="row">
      ${session.mode === 'local' ? '<span class="tag">modalità locale</span>' : ''}
      <span class="code-pill">${esc(session.code)}</span>
    </div>`;
}

/* ==========================================================
   1. Lobby
   ========================================================== */

function viewLobby({ state: s, session }) {
  const isHost = s.host === session.uid;
  const local = session.mode === 'local';

  const seats = TEAM_KEYS.map((k) => {
    const who = S.nameOfSeat(s, k);
    const mine = s.seats[session.uid] === k;
    return `
      <button class="seat t-${k} ${who ? 'taken' : ''}" data-act="seat" data-team="${k}">
        <div class="nm"><span class="dot"></span>${TEAM_NAMES[k]}</div>
        <div class="who">${who ? esc(who) + (mine ? ' (tu)' : '') : 'libera'}</div>
      </button>`;
  }).join('');

  const taken = Object.keys(s.seats).length;

  return `
    <h1>Fanta NBA</h1>
    <p class="muted mb">Asta a crediti, quintetti, playoff simulati. Quattro squadre, 50 crediti a testa, 5 giocatori ciascuna.</p>

    ${local ? `
      <div class="card">
        <h3 class="mb">Modalità locale</h3>
        <p class="small muted">Firebase non è configurato, quindi la partita gira su questo solo schermo: gestisci tu tutte e quattro le squadre.
        Per giocare ognuno dal proprio telefono servono 3 minuti di setup — vedi SETUP.md.</p>
      </div>` : `
      <div class="card">
        <h3>Codice stanza: <span class="code-pill">${esc(session.code)}</span></h3>
        <p class="small muted mt">Gli altri aprono lo stesso link e inseriscono questo codice. Chi non prende posto guarda e basta; le squadre senza nessuno seduto le gestisce chi ospita.</p>
        <button class="sm ghost mt" data-act="copy-link">Copia il link della stanza</button>
      </div>
      <div class="card">
        <label class="field"><span>Il tuo nome</span>
          <input id="nick" value="${esc(ui.nickname)}" placeholder="Diego" maxlength="14" autocomplete="off">
        </label>
        <p class="small muted mb">Scegli la tua squadra:</p>
        <div class="seats">${seats}</div>
      </div>`}

    ${isHost ? `
      <button class="primary wide" data-act="start-auction">Inizia l'asta</button>
      ${!local && taken < 4 ? `<p class="small muted center mt">${taken} squadre su 4 hanno un giocatore seduto. Puoi iniziare comunque: le altre le gestisci tu.</p>` : ''}
    ` : `<p class="small muted center">In attesa che ${esc(s.names[s.host] || 'chi ospita')} avvii l'asta...</p>`}
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
      ${isHost ? '<button class="primary wide mt" data-act="to-lineups">Vai ai quintetti</button>' : ''}</div>`;
  }

  const arc = D.archetypes[p.arc];
  const bid = s.auction.bid;

  const attrs = Object.entries(ATTR_LABELS).map(([k, lbl]) => `
    <div class="attr"><div class="lbl"><span>${lbl}</span><b>${p.attrs[k]}</b></div>
      <div class="bar"><i style="width:${p.attrs[k]}%"></i></div></div>`).join('');

  // Le squadre che chi guarda puo far rilanciare: la sua, oppure tutte
  // quelle senza nessuno seduto se e lui a ospitare.
  const controllable = TEAM_KEYS.filter((k) => k === myTeam || (isHost && !S.seatTaken(s, k)));
  const bidders = controllable.filter((k) => S.slotsLeft(s, k) > 0);

  const bidUi = bidders.map((k) => {
    const min = bid ? bid.amount + 1 : 1;
    const max = S.maxBid(s, k);
    const steps = [min, min + 1, min + 3, max].filter((v, i, a) => v <= max && v >= min && a.indexOf(v) === i);
    const isLeader = bid && bid.team === k;
    return `
      <div class="strip t-${k} ${isLeader ? 'leading' : ''}">
        <span class="dot"></span>
        <span class="nm">${TEAM_NAMES[k]}</span>
        <span class="cr">${s.teams[k].credits}</span>
        <span class="grow"></span>
        ${isLeader ? '<span class="tag">in testa</span>' :
          (max < min ? '<span class="tag">fuori budget</span>' :
            steps.map((v) => `<button class="sm" data-act="bid" data-team="${k}" data-amt="${v}">${v}</button>`).join(''))}
      </div>`;
  }).join('');

  const strips = TEAM_KEYS.map((k) => {
    const t = s.teams[k];
    const names = t.roster.map((id) => D.byId[id]?.n).filter(Boolean).join(' · ') || '—';
    return `<div class="strip t-${k}">
      <span class="dot"></span>
      <div class="grow" style="min-width:0">
        <div class="row spread"><span class="nm">${TEAM_NAMES[k]}</span>
          <span><span class="cr">${t.credits}</span> <span class="tiny muted">cr · ${t.roster.length}/${ROSTER_SIZE}</span></span></div>
        <div class="ros">${esc(names)}</div>
      </div></div>`;
  }).join('');

  const log = s.auction.log.slice().reverse().slice(0, 30).map((l) =>
    `<div><span>${esc(D.byId[l.playerId]?.n || l.playerId)}</span><span class="muted">${TEAM_NAMES[l.team]} · ${l.price}</span></div>`).join('') || '<div class="muted">Nessun acquisto.</div>';

  return `
    <div class="card lot">
      <div class="ovr">${p.ovr} OVR</div>
      <div class="nm">${esc(p.n)}</div>
      <div class="meta">${p.pos}${p.alt?.length ? ' / ' + p.alt.join('/') : ''} · ${esc(arc?.label || p.arc)} · ${esc(p.tm)}, ${p.era}</div>
      <div class="attrs">${attrs}</div>
    </div>

    <div class="card bidbox">
      <div class="bidnow">${bid ? bid.amount : 0}<small> crediti</small></div>
      <div class="bidder">${bid ? `offerta di <b>${TEAM_NAMES[bid.team]}</b>` : '<span class="muted">nessuna offerta</span>'}</div>
      <div class="clock" id="clock">--</div>
      ${bidders.length ? `<div class="mt">${bidUi}</div>` : '<p class="small muted mt">Nessuna squadra che gestisci può rilanciare su questo lotto.</p>'}
    </div>

    ${isHost ? `
      <div class="card tight">
        <div class="row wrap">
          <button class="sm" data-act="resolve">Chiudi il lotto</button>
          <button class="sm ghost" data-act="pass">Salta giocatore</button>
          <button class="sm ghost" data-act="toggle-manual">${ui.manualOpen ? 'Chiudi' : 'Assegna a mano'}</button>
        </div>
        ${ui.manualOpen ? `
          <div class="mt">
            <p class="tiny muted mb">Scavalca l'asta: assegna ${esc(p.n)} al prezzo che decidi tu.</p>
            <div class="row">
              <select id="m-team" class="grow">${TEAM_KEYS.filter((k) => S.slotsLeft(s, k) > 0)
                .map((k) => `<option value="${k}">${TEAM_NAMES[k]} (${s.teams[k].credits} cr)</option>`).join('')}</select>
              <input id="m-price" type="number" min="1" value="${bid?.amount || 1}" style="width:88px">
              <button class="sm primary" data-act="manual-award">OK</button>
            </div>
          </div>` : ''}
      </div>` : ''}

    <div class="card tight">${strips}</div>
    <details class="card tight"><summary>Acquisti (${s.auction.log.length})</summary><div class="log mt">${log}</div></details>
  `;
}

export function tickClock(s) {
  const el = document.getElementById('clock');
  if (!el) return null;
  if (!s.auction.running || !s.auction.deadline) { el.textContent = 'in pausa'; return null; }
  const left = Math.max(0, s.auction.deadline - now());
  const sec = Math.ceil(left / 1000);
  el.textContent = sec > 0 ? `${sec}s` : 'chiuso';
  el.classList.toggle('hot', sec <= 5);
  return left;
}

/* ==========================================================
   3. Quintetti
   ========================================================== */

function viewLineups({ state: s, session }) {
  const D = db();
  const isHost = s.host === session.uid;
  const cards = TEAM_KEYS.map((k) => {
    const canEdit = s.seats[session.uid] === k || (isHost && !S.seatTaken(s, k));
    const slots = SLOTS.map((sl) => {
      const p = D.byId[s.lineups[k][sl]];
      if (!p) return `<div class="slot"><span class="pos">${sl}</span><span class="nm muted">vuoto</span></div>`;
      const off = p.pos !== sl && !(p.alt || []).includes(sl);
      const sel = ui.selSlot && ui.selSlot.team === k && ui.selSlot.slot === sl;
      return `<button class="slot ${sel ? 'sel' : ''}" ${canEdit ? `data-act="pick-slot" data-team="${k}" data-slot="${sl}"` : 'disabled'}>
        <span class="pos">${sl}</span>
        <span class="nm">${esc(p.n)}${off ? ' <span class="warn">fuori ruolo</span>' : ''}</span>
        <span class="ov">${p.ovr}</span>
      </button>`;
    }).join('');
    return `<div class="card t-${k}">
      <div class="row spread mb"><h3><span class="dot" style="display:inline-block;margin-right:6px"></span>${TEAM_NAMES[k]}</h3>
        ${canEdit ? '<button class="sm ghost" data-act="auto-lineup" data-team="' + k + '">Ricalcola</button>' : ''}</div>
      <div class="slots">${slots}</div>
    </div>`;
  }).join('');

  return `
    <h2>Quintetti</h2>
    <p class="muted small mb">Assegnati in automatico cercando il minor numero di adattamenti. Tocca due caselle per scambiarle. "Fuori ruolo" significa che quel giocatore gioca in un posto che non sa fare: costa in attacco e in difesa.</p>
    ${cards}
    ${isHost ? `<button class="primary wide" data-act="to-tactics" ${S.lineupsReady(s) ? '' : 'disabled'}>Passa alle impostazioni tattiche</button>` : '<p class="small muted center">In attesa di chi ospita.</p>'}
  `;
}

/* ==========================================================
   4. Tattica
   ========================================================== */

function viewTactics({ state: s, session }) {
  const D = db();
  const isHost = s.host === session.uid;

  const cards = TEAM_KEYS.map((k) => {
    const canEdit = s.seats[session.uid] === k || (isHost && !S.seatTaken(s, k));
    const t = s.tactics[k];
    const roster = s.teams[k].roster.map((id) => D.byId[id]).filter(Boolean);
    const opt = (sel, exclude) => roster.filter((p) => p.id !== exclude)
      .map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.n)} (${p.ovr})</option>`).join('');

    let identity = '';
    try {
      if (S.lineupsReady(s) && t.v1 && t.v2) identity = teamIdentity(buildTeam(k, s.lineups[k], t));
    } catch { /* quintetto non ancora valido */ }

    return `<div class="card t-${k}">
      <h3 class="mb"><span class="dot" style="display:inline-block;margin-right:6px"></span>${TEAM_NAMES[k]}</h3>
      ${identity ? `<p class="tiny muted mb">${esc(identity)}</p>` : ''}
      <label class="field"><span>Primo violino</span>
        <select data-act="set-v1" data-team="${k}" ${canEdit ? '' : 'disabled'}>${opt(t.v1, t.v2)}</select></label>
      <label class="field"><span>Secondo violino</span>
        <select data-act="set-v2" data-team="${k}" ${canEdit ? '' : 'disabled'}>${opt(t.v2, t.v1)}</select></label>
      <label class="field"><span>Strategia offensiva</span>
        <select data-act="set-strat" data-team="${k}" ${canEdit ? '' : 'disabled'}>
          ${Object.entries(STRATEGIES).map(([id, v]) => `<option value="${id}" ${t.strategy === id ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
        </select></label>
      <p class="tiny muted">${esc(STRATEGIES[t.strategy]?.desc || '')}</p>
    </div>`;
  }).join('');

  return `
    <h2>Impostazioni tattiche</h2>
    <p class="muted small mb">Queste scelte pesano davvero: la strategia cambia chi prende i tiri, quanto è imprevedibile la squadra e quali difese la mettono in crisi.</p>
    ${cards}
    ${isHost ? `<button class="primary wide" data-act="to-playoffs" ${S.tacticsReady(s) ? '' : 'disabled'}>Componi le semifinali</button>` : '<p class="small muted center">In attesa di chi ospita.</p>'}
  `;
}

/* ==========================================================
   5. Playoff
   ========================================================== */

export function teamsFromState(s) {
  const out = {};
  for (const k of TEAM_KEYS) out[k] = buildTeam(k, s.lineups[k], s.tactics[k]);
  return out;
}

function viewPlayoffs({ state: s, session }) {
  const isHost = s.host === session.uid;
  const T = teamsFromState(s);
  const po = s.po;

  const s1 = po.s1.revealed ? simSeries(T[po.s1.a], T[po.s1.b], po.s1.seed) : null;
  const s2 = po.s2.revealed ? simSeries(T[po.s2.a], T[po.s2.b], po.s2.seed) : null;

  let out = `<h2>Playoff</h2>
    <div class="card tight">${po.reasons.map((r) => `<p class="small muted" style="margin-bottom:6px">${esc(r)}</p>`).join('')}</div>`;

  out += seriesCard('Semifinale 1', T[po.s1.a], T[po.s1.b], s1, isHost, 'reveal-s1');
  out += seriesCard('Semifinale 2', T[po.s2.a], T[po.s2.b], s2, isHost, 'reveal-s2');

  if (s1 && s2 && !po.final) {
    out += isHost
      ? `<button class="primary wide" data-act="open-final">Apri le Finals</button>`
      : `<p class="small muted center">In attesa di chi ospita.</p>`;
  }

  if (po.final) {
    const A = T[po.final.a], B = T[po.final.b];
    const f = simSeriesUpTo(A, B, po.final.seed, po.final.gamesPlayed);
    out += finalCard(A, B, f, po.final, isHost);

    if (f.done) {
      const third = po.third.revealed
        ? simSeries(T[po.third.a], T[po.third.b], po.third.seed) : null;
      out += seriesCard('Finale 3° / 4° posto', T[po.third.a], T[po.third.b], third, isHost, 'reveal-third');
    }
  }
  return out;
}

function seriesCard(title, A, B, series, isHost, act) {
  const head = `<div class="series-hdr mb">
      <div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:.08em;font-weight:800">${esc(title)}</div>
        <div class="vs">${A.name} <span class="muted">vs</span> ${B.name}</div></div>
      ${series ? `<div class="score-big">${series.wins.a}-${series.wins.b}</div>` : ''}
    </div>
    <p class="tiny muted mb">${esc(teamIdentity(A))} &nbsp;·&nbsp; ${esc(teamIdentity(B))}</p>`;

  if (!series) {
    return `<div class="card">${head}
      ${isHost ? `<button class="primary wide" data-act="${act}">Simula la serie</button>`
        : '<p class="small muted center">In attesa di chi ospita.</p>'}</div>`;
  }

  const games = series.games.map((g) => gameBlock(A, B, g)).join('');
  const W = series.winner === A.key ? A : B;
  const why = explainSeries(A, B, series);

  return `<div class="card">${head}
    ${games}
    <div class="mvp"><div class="t">MVP della serie</div>
      <div class="n">${esc(series.mvp.n)}</div>
      <div class="small muted">${series.mvp.ppg.toFixed(1)} punti · ${series.mvp.rpg.toFixed(1)} rimbalzi · ${series.mvp.apg.toFixed(1)} assist di media</div></div>
    <div class="why"><h3 style="margin:14px 0 8px">Perché ha vinto ${esc(W.name)}</h3>
      <ul>${why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>
  </div>`;
}

function finalCard(A, B, f, meta, isHost) {
  let out = '';
  if (f.done) {
    const W = f.winner === A.key ? A : B;
    out += `<div class="champ"><div class="t">Campione</div><div class="n">${esc(W.name)}</div>
      <div class="small" style="font-weight:700">${f.wins.a}-${f.wins.b} nella serie</div></div>`;
  }

  const games = f.games.map((g) => gameBlock(A, B, g)).join('') ||
    '<p class="small muted center" style="padding:14px 0">Le Finals non sono ancora iniziate.</p>';

  out += `<div class="card">
    <div class="series-hdr mb">
      <div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:.08em;font-weight:800">Finals</div>
        <div class="vs">${A.name} <span class="muted">vs</span> ${B.name}</div></div>
      <div class="score-big">${f.wins.a}-${f.wins.b}</div>
    </div>
    ${games}
    ${f.done ? `
      <div class="mvp"><div class="t">MVP delle Finals</div>
        <div class="n">${esc(f.mvp.n)}</div>
        <div class="small muted">${f.mvp.ppg.toFixed(1)} punti · ${f.mvp.rpg.toFixed(1)} rimbalzi · ${f.mvp.apg.toFixed(1)} assist di media</div></div>
      <div class="why"><h3 style="margin:14px 0 8px">Perché ha vinto ${esc(f.winner === A.key ? A.name : B.name)}</h3>
        <ul>${explainSeries(A, B, f).map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>`
      : (isHost ? `<button class="primary wide mt" data-act="next-final-game">Vai — ${meta.gamesPlayed === 0 ? 'Gara 1' : 'Gara ' + (meta.gamesPlayed + 1)}</button>`
        : '<p class="small muted center mt">In attesa di chi ospita.</p>')}
  </div>`;
  return out;
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

export { pickBracket, esc };
