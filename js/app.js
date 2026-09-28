// app.js — avvio, risoluzione della stanza, un solo handler per tutti i click.

import { loadData, TEAM_KEYS } from './core.js';
import { simSeries } from './engine.js';
import * as S from './state.js';
import { openRoom, makeRoomCode, cloudAvailable, now } from './net.js';
import { render, renderTopbar, tickClock, ui, teamsFromState, pickBracket, esc } from './ui.js';

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
    <p class="muted mb">Asta a crediti, quintetti, playoff simulati. Quattro squadre, 50 crediti, 5 giocatori a testa.</p>
    ${errMsg ? `<div class="banner err">${esc(errMsg)}</div>` : ''}
    <div class="card">
      <h3 class="mb">Crea una partita</h3>
      <p class="small muted mb">Generi un codice e lo passi agli altri tre.</p>
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
  const ctx = { state, session };
  renderTopbar(topbar, ctx);
  render(root, ctx);
  tickClock(state);
}

function fatal(err) {
  console.error(err);
  root.innerHTML = `<div class="banner err"><b>Qualcosa non va.</b><br>${esc(err.message)}</div>`;
}

/* ==========================================================
   Cronometro dell'asta
   ========================================================== */

function startClock() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    if (!state || state.phase !== 'auction') return;
    const left = tickClock(state);
    // Solo chi ospita chiude il lotto: se lo facessero tutti, quattro
    // transazioni contemporanee proverebbero ad assegnare lo stesso giocatore.
    if (left !== null && left <= 0 && state.host === session.uid) {
      session.apply((s) => (s.auction.running && s.auction.deadline <= now() ? S.resolveLot(s, now()) : undefined));
    }
  }, 250);
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
      case 'seat': {
        const nick = (document.getElementById('nick')?.value || '').trim();
        if (!nick) return flash('Scrivi il tuo nome prima di scegliere la squadra.', true);
        ui.nickname = nick;
        localStorage.setItem('nbaf:nick', nick);
        await session.apply((s) => {
          if (S.seatTaken(s, team) && s.seats[session.uid] !== team) return undefined;
          return S.takeSeat(S.leaveSeat(s, session.uid), session.uid, nick, team);
        });
        break;
      }

      case 'start-auction':
        await session.apply((s) => (s.phase === 'lobby' ? S.startAuction(s, now()) : undefined));
        break;

      /* --- asta --- */
      case 'bid': {
        const amt = Number(el.dataset.amt);
        const ok = await session.apply((s) => {
          if (!S.canBid(s, team, amt)) return undefined;
          return S.placeBid(s, team, amt, now());
        });
        if (!ok) flash('Rilancio non valido: qualcuno ti ha preceduto.', true);
        break;
      }

      case 'resolve':
        await session.apply((s) => (s.auction.running ? S.resolveLot(s, now()) : undefined));
        break;

      case 'pass':
        await session.apply((s) => (s.phase === 'auction' ? S.passLot(s, now()) : undefined));
        break;

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

      case 'to-lineups':
        await session.apply((s) => S.toLineups(s));
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

      case 'to-tactics':
        await session.apply((s) => (S.lineupsReady(s) ? S.toTactics(s) : undefined));
        break;

      /* --- playoff --- */
      case 'to-playoffs': {
        if (!S.tacticsReady(state)) return flash('Servono primo violino, secondo violino e strategia per tutte e quattro.', true);
        const T = teamsFromState(state);
        const { semis, reasons } = pickBracket(T);
        await session.apply((s) => S.toPlayoffs(s, semis, reasons));
        break;
      }

      case 'reveal-s1': await session.apply((s) => S.revealSemi(s, 's1')); break;
      case 'reveal-s2': await session.apply((s) => S.revealSemi(s, 's2')); break;
      case 'reveal-third': await session.apply((s) => S.revealThird(s)); break;

      case 'open-final': {
        const T = teamsFromState(state);
        const po = state.po;
        const r1 = simSeries(T[po.s1.a], T[po.s1.b], po.s1.seed);
        const r2 = simSeries(T[po.s2.a], T[po.s2.b], po.s2.seed);
        const l1 = r1.winner === po.s1.a ? po.s1.b : po.s1.a;
        const l2 = r2.winner === po.s2.a ? po.s2.b : po.s2.a;
        await session.apply((s) => S.openFinal(s, r1.winner, r2.winner, l1, l2));
        break;
      }

      case 'next-final-game':
        await session.apply((s) => (s.po?.final && s.po.final.gamesPlayed < 7 ? S.advanceFinal(s) : undefined));
        break;

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
  const patch = { 'set-v1': { v1: v }, 'set-v2': { v2: v }, 'set-strat': { strategy: v } }[el.dataset.act];
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
