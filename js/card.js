// card.js — la serata in un'immagine, da mandare nella chat di gruppo.
//
// La partita si gioca fra amici e il risultato finisce in chat: uno
// screenshot della pagina taglia, e dice poco a chi non c'era. Questa e una
// locandina fatta apposta — campione, quintetto con i prezzi pagati, MVP, il
// colpo dell'asta — in formato verticale, quello che le chat mostrano meglio.
//
// Due pezzi separati di proposito. datiCard() raccoglie cosa scrivere ed e
// pura: si prova senza browser. disegnaCard() la stende su un canvas e non
// decide niente.

import { db, SLOTS, TEAM_NAMES } from './core.js';
import { costruisciBracket } from './engine.js';
import { premiSerata } from './premi.js';
import { classificaPronostici, reDeiPronostici } from './pronostici.js';
import { nameOfSeat } from './state.js';

export const LARGHEZZA = 1080;
export const ALTEZZA = 1350;

export function datiCard(s, T) {
  if (!s?.po) return null;
  const turni = costruisciBracket(s.po, T);
  const fin = turni[turni.length - 1]?.[0];
  if (!fin?.res?.done) return null;
  const D = db();
  const W = T[fin.res.winner];
  const L = T[fin.res.winner === fin.a ? fin.b : fin.a];
  const chi = (k) => nameOfSeat(s, k) || '';

  const prezzo = {};
  for (const l of s.auction?.log || []) prezzo[l.playerId] = l.price;
  const rosa = SLOTS.map((sl) => {
    const p = D.byId[s.lineups?.[W.key]?.[sl]];
    return p ? { pos: sl, n: p.n, ovr: p.ovr, tm: `${p.tm || ''} ${p.era || ''}`.trim(), prezzo: prezzo[p.id] ?? null } : null;
  }).filter(Boolean);

  const premi = premiSerata(s, T);
  const premio = (k) => premi.find((p) => p.chiave === k) || null;
  const re = reDeiPronostici(classificaPronostici(s, T));

  // Tre riquadri in fondo. Il terzo e il re dei pronostici se c'e, se no il
  // bidone: in chat fa ridere quanto il campione.
  const riquadri = [];
  if (fin.res.mvp) riquadri.push({ tit: 'MVP delle Finals', nome: fin.res.mvp.n, riga: `${fin.res.mvp.ppg.toFixed(1)} punti a partita` });
  // Colpo e bidone possono essere di chiunque, non del campione: la riga dice
  // di chi, o in chat non si capisce con chi prendersela.
  const diChi = (p) => (p.team && chi(p.team) ? ` · ${chi(p.team)}` : '');
  const colpo = premio('colpo');
  if (colpo) {
    const pz = prezzo[colpo.id];
    riquadri.push({ tit: 'Il colpo dell\'asta', nome: colpo.nome, team: colpo.team,
      riga: `ovr ${D.byId[colpo.id]?.ovr} per ${pz} ${pz === 1 ? 'credito' : 'crediti'}${diChi(colpo)}` });
  }
  if (re) riquadri.push({ tit: 'Re dei pronostici', nome: chi(re.key) || TEAM_NAMES[re.key], riga: `${re.punti.toFixed(2)} punti, ${re.presi} ${re.presi === 1 ? 'pronostico preso' : 'pronostici presi'}` });
  else if (premio('bidone')) {
    const b = premio('bidone');
    riquadri.push({ tit: 'Il bidone', nome: b.nome, team: b.team, brutto: true,
      riga: `pagato ${prezzo[b.id]} crediti${diChi(b)}` });
  }

  const wv = Math.max(fin.res.wins.a, fin.res.wins.b), wp = Math.min(fin.res.wins.a, fin.res.wins.b);
  return {
    key: W.key, squadra: W.name, chi: chi(W.key),
    finale: `${wv}-${wp} su ${L.name}${chi(L.key) ? ` (${chi(L.key)})` : ''}`,
    rosa, riquadri: riquadri.slice(0, 3),
    testo: `Fanta NBA — Campione: ${W.name}${chi(W.key) ? ` di ${chi(W.key)}` : ''}, ${wv}-${wp} su ${L.name}.`,
  };
}

// Il trofeo, con gli stessi tracciati di quello disegnato nella pagina.
const TROFEO = [
  ['M18 8h28v14c0 9-6 16-14 16s-14-7-14-16z', 'oro'],
  ['M28 38h8v10h-8z', '#c9921f'],
  ['M21.5 48h21a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-21a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5z', 'oro'],
];
const MANICI = 'M18 12H9c0 8 4 13 10 14M46 12h9c0 8-4 13-10 14';

// Una riga che non sta nella larghezza si rimpicciolisce invece di uscire
// dall'immagine: i nomi delle squadre vanno da "Heat" a "Supersonics 1996".
function scriviIn(ctx, testo, x, y, maxW, px, peso = 800, font = 'Saira Condensed') {
  let p = px;
  do { ctx.font = `${peso} ${p}px "${font}", "Arial Narrow", sans-serif`; p -= 2; }
  while (p > 12 && ctx.measureText(testo).width > maxW);
  ctx.fillText(testo, x, y);
}

const spazio = (ctx, px) => { if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`; };

export function disegnaCard(ctx, d, colori = {}) {
  const C = { bg: '#0c0d11', surf: '#14161d', line: '#262b39', muted: '#9aa3b2', muted2: '#c6cddb', gold: '#ffd166', bad: '#ff5a6a', ...colori };
  const tc = C[d.key] || C.gold;
  const W = LARGHEZZA, H = ALTEZZA, mx = 60;

  // Fondo, e la luce del colore della squadra che scende dall'alto.
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const luce = ctx.createLinearGradient(0, 0, 0, 640);
  luce.addColorStop(0, tc); luce.addColorStop(1, C.bg);
  ctx.globalAlpha = 0.38; ctx.fillStyle = luce; ctx.fillRect(0, 0, W, 640); ctx.globalAlpha = 1;
  ctx.fillStyle = tc; ctx.fillRect(0, 0, W, 10);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left'; ctx.fillStyle = C.gold; spazio(ctx, 6);
  scriviIn(ctx, 'FANTA NBA', mx, 74, 400, 30);
  ctx.textAlign = 'right'; ctx.fillStyle = C.muted; spazio(ctx, 3);
  scriviIn(ctx, 'SERATA FINITA', W - mx, 74, 400, 24, 700);

  // Il trofeo, scalato dal disegno 64x64.
  ctx.save();
  ctx.translate(W / 2 - 80, 104); ctx.scale(2.5, 2.5);
  const oro = ctx.createLinearGradient(0, 8, 0, 55);
  oro.addColorStop(0, '#ffe7a3'); oro.addColorStop(0.5, '#ffd166'); oro.addColorStop(1, '#c9921f');
  ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.stroke(new Path2D(MANICI));
  for (const [p, f] of TROFEO) { ctx.fillStyle = f === 'oro' ? oro : f; ctx.fill(new Path2D(p)); }
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = C.gold; spazio(ctx, 12);
  scriviIn(ctx, 'CAMPIONE', W / 2, 330, W - 2 * mx, 38);
  ctx.fillStyle = '#ffffff'; spazio(ctx, 2);
  scriviIn(ctx, d.squadra.toUpperCase(), W / 2, 448, W - 2 * mx, 118);
  ctx.fillStyle = tc; spazio(ctx, 3);
  if (d.chi) scriviIn(ctx, `DI ${d.chi.toUpperCase()}`, W / 2, 506, W - 2 * mx, 40, 700);
  ctx.fillStyle = C.muted2; spazio(ctx, 0);
  scriviIn(ctx, d.finale, W / 2, 560, W - 2 * mx, 34, 500, 'Barlow');

  // Il quintetto, con quanto e costato: e la parte che fa discutere.
  let y = 632;
  ctx.fillStyle = C.line; ctx.fillRect(mx, y, W - 2 * mx, 2);
  y += 52;
  ctx.textAlign = 'left'; ctx.fillStyle = C.muted; spazio(ctx, 5);
  scriviIn(ctx, 'IL QUINTETTO', mx, y, 400, 24, 700);
  ctx.textAlign = 'right';
  scriviIn(ctx, 'OVR · PAGATO', W - mx, y, 400, 24, 700);
  y += 20;
  for (const p of d.rosa) {
    y += 72;
    ctx.fillStyle = C.surf; ctx.fillRect(mx, y - 50, W - 2 * mx, 64);
    ctx.fillStyle = tc; ctx.fillRect(mx, y - 50, 6, 64);
    ctx.textAlign = 'left';
    ctx.fillStyle = C.gold; spazio(ctx, 2); scriviIn(ctx, p.pos, mx + 26, y - 6, 70, 28);
    // Nome e squadra d'epoca devono finire prima dell'overall (a 780): la
    // squadra si accorcia, e se non c'e posto si toglie — il nome resta.
    ctx.fillStyle = '#ffffff'; spazio(ctx, 1); scriviIn(ctx, p.n.toUpperCase(), mx + 108, y - 6, 440, 40);
    const dopoNome = mx + 108 + Math.min(440, ctx.measureText(p.n.toUpperCase()).width) + 16;
    if (780 - dopoNome >= 70) { ctx.fillStyle = C.muted; spazio(ctx, 0); scriviIn(ctx, p.tm, dopoNome, y - 6, 780 - dopoNome, 24, 500, 'Barlow'); }
    ctx.textAlign = 'right';
    ctx.fillStyle = C.muted2; scriviIn(ctx, p.prezzo == null ? '—' : `${p.prezzo} cr`, W - mx - 24, y - 6, 120, 30, 700);
    ctx.fillStyle = C.gold; scriviIn(ctx, String(p.ovr), W - mx - 160, y - 6, 80, 40);
  }

  // I riquadri dei premi, in fila.
  const n = d.riquadri.length;
  if (n) {
    const gap = 20, top = 1100, h = 170;
    const w = (W - 2 * mx - gap * (n - 1)) / n;
    d.riquadri.forEach((r, i) => {
      const x = mx + i * (w + gap);
      ctx.fillStyle = C.surf; ctx.fillRect(x, top, w, h);
      ctx.fillStyle = r.brutto ? C.bad : (C[r.team] || C.gold); ctx.fillRect(x, top, w, 6);
      ctx.textAlign = 'left';
      ctx.fillStyle = r.brutto ? C.bad : C.gold; spazio(ctx, 3);
      scriviIn(ctx, r.tit.toUpperCase(), x + 22, top + 50, w - 44, 22, 800);
      ctx.fillStyle = '#ffffff'; spazio(ctx, 1);
      scriviIn(ctx, r.nome.toUpperCase(), x + 22, top + 100, w - 44, 38);
      ctx.fillStyle = C.muted2; spazio(ctx, 0);
      scriviIn(ctx, r.riga, x + 22, top + 140, w - 44, 22, 500, 'Barlow');
    });
  }

  ctx.textAlign = 'center'; ctx.fillStyle = C.muted; spazio(ctx, 2);
  scriviIn(ctx, 'teresa-monaco.github.io/fanta-nba', W / 2, H - 30, W - 2 * mx, 24, 600, 'Barlow');
}
