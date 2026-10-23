// card.js — la serata in un'immagine, da mandare nella chat di gruppo.
//
// Era un poster del campione (quintetto e prezzi pagati): celebrava chi
// aveva vinto e degli altri non diceva niente, quindi in chat non faceva
// ridere nessuno. Adesso e una pagella: la classifica finale con una frase
// cattiva per ogni persona vera al tavolo (i bot non si sfottono), la
// classifica dei pronostici, e in fondo MVP, colpo e bidone. Ogni frase
// parte da un dato vero della serata.
//
// Due pezzi separati di proposito. datiCard() raccoglie cosa scrivere ed e
// pura: si prova senza browser. disegnaCard() la stende su un canvas e non
// decide niente.

import { db, TEAM_NAMES, NOMI_SQUADRA } from './core.js';
import { costruisciBracket } from './engine.js';
import { premiSerata } from './premi.js';
import { classificaPronostici, quoteSerie } from './pronostici.js';
import { ordineSerie } from './serie.js';
import { nameOfSeat } from './state.js';
import { tr } from './lingua.js';

export const LARGHEZZA = 1080;
export const ALTEZZA = 1350;

const ESITI_A = ['4-0', '4-1', '4-2', '4-3'];

// La frase per una persona, dalla piu cattiva che i dati permettono.
function roastDi(r) {
  if (r.pos === 1) return r.favoritoInFinale
    ? tr('Campione, ma partiva favorito: complimenti per il coraggio.', 'Champion, but he was the favorite: what courage.')
    : tr('Campione da sfavorito: fortuna sfacciata, e lo sa.', 'Champion as the underdog: pure luck, and he knows it.');
  if (r.sorpresa) return tr(`Era favorito al ${r.sorpresa}% e ha perso. Talento raro.`, `He was the ${r.sorpresa}% favorite and lost. A rare talent.`);
  if (r.bidone) return tr(`${r.bidone.prezzo} crediti per ${r.bidone.n}. Bruciarli sarebbe stato più utile.`, `${r.bidone.prezzo} credits for ${r.bidone.n}. Burning them would have been more useful.`);
  if (r.avanzati >= 10) return tr(`Ha chiuso l'asta con ${r.avanzati} crediti in tasca. Se li porterà nella tomba.`, `Finished the auction with ${r.avanzati} credits in his pocket. He'll take them to the grave.`);
  if (r.ultimo) return tr('Ultimo. Anche i bot lo guardano dall\'alto.', 'Last. Even the bots look down on him.');
  if (r.pronFlop) return tr(`0 pronostici presi su ${r.pronFlop}: tirando a caso avrebbe fatto meglio.`, `0 predictions right out of ${r.pronFlop}: guessing at random would have done better.`);
  if (r.pos === 2) return tr('Secondo: il primo dei perdenti. Glielo ricorderemo.', 'Second: the first of the losers. We\'ll remind him.');
  return tr(`${r.pos}° posto. Presente, e basta.`, `${r.pos}th place. Present, and that's it.`);
}

export function datiCard(s, T) {
  if (!s?.po) return null;
  const turni = costruisciBracket(s.po, T);
  const fin = turni[turni.length - 1]?.[0];
  if (!fin?.res?.done) return null;
  const D = db();
  const W = T[fin.res.winner];
  const L = T[fin.res.winner === fin.a ? fin.b : fin.a];
  const chi = (k) => nameOfSeat(s, k) || TEAM_NAMES[k] || '';
  const prezzo = {};
  for (const l of s.auction?.log || []) prezzo[l.playerId] = l.price;
  const premi = premiSerata(s, T);
  const premio = (k) => premi.find((p) => p.chiave === k) || null;

  // LA CLASSIFICA FINALE: campione, finalista, poi chi ha vinto e perso la
  // finalina, poi gli altri per turno di eliminazione e serie vinte.
  const serie = ordineSerie(s, T).filter((x) => x.a && x.b && x.f?.done);
  const info = {};
  for (const k of Object.keys(T)) info[k] = { key: k, turno: -1, vinte: 0, sorpresa: 0 };
  for (const x of serie) {
    const turno = x.id === 'third' ? -0.5 : x.r;
    const pA = ESITI_A.reduce((tot, e) => tot + quoteSerie(T[x.a], T[x.b], x.seed).esiti[e].p, 0);
    for (const [k, p] of [[x.a, pA], [x.b, 1 - pA]]) {
      const r = info[k];
      if (!r) continue;
      if (x.id !== 'third') r.turno = Math.max(r.turno, turno);
      if (x.f.winner === k) r.vinte++;
      else if (p >= 0.65) r.sorpresa = Math.max(r.sorpresa, Math.round(p * 100));
      if (x.id === 'third') r.finalina = x.f.winner === k ? 1 : 2;
      if (x.finale) r.pFinale = p;
    }
  }
  const ordine = Object.values(info).filter((r) => r.turno >= 0 || r.finalina).sort((a, b) =>
    (b.key === W.key) - (a.key === W.key) || (b.key === L.key) - (a.key === L.key)
    || (a.finalina || 9) - (b.finalina || 9) || b.turno - a.turno || b.vinte - a.vinte);
  const pron = classificaPronostici(s, T);
  const umano = (k) => !s.bots?.[k];
  const classifica = ordine.map((r, i) => {
    const b = premio('bidone');
    const p = pron.find((x) => x.key === r.key);
    const fatti = {
      pos: i + 1, ultimo: i === ordine.length - 1 && ordine.length > 2,
      favoritoInFinale: r.key === W.key && (r.pFinale ?? 0) >= 0.5,
      sorpresa: r.key === W.key ? 0 : r.sorpresa,
      bidone: b && b.team === r.key ? { n: b.nome, prezzo: prezzo[b.id] } : null,
      avanzati: s.teams?.[r.key]?.credits ?? 0,
      pronFlop: p && p.chiusi > 0 && p.presi === 0 ? p.chiusi * 2 : 0,
    };
    return { pos: i + 1, key: r.key, nome: chi(r.key), umano: umano(r.key), roast: umano(r.key) ? roastDi(fatti) : '' };
  });

  // In fondo sempre tutti e tre: MVP, colpo e bidone.
  const diChi = (p) => (p.team && chi(p.team) ? ` · ${chi(p.team)}` : '');
  const riquadri = [];
  if (fin.res.mvp) riquadri.push({ tit: tr('MVP delle Finals', 'Finals MVP'), nome: fin.res.mvp.n, riga: tr(`${fin.res.mvp.ppg.toFixed(1)} punti a partita`, `${fin.res.mvp.ppg.toFixed(1)} points per game`) });
  const colpo = premio('colpo');
  if (colpo) {
    const pz = prezzo[colpo.id];
    riquadri.push({ tit: tr('Il colpo dell\'asta', 'Steal of the auction'), nome: colpo.nome, team: colpo.team,
      riga: tr(`ovr ${D.byId[colpo.id]?.ovr} per ${pz} ${pz === 1 ? 'credito' : 'crediti'}${diChi(colpo)}`, `ovr ${D.byId[colpo.id]?.ovr} for ${pz} ${pz === 1 ? 'credit' : 'credits'}${diChi(colpo)}`) });
  }
  const b = premio('bidone');
  if (b) riquadri.push({ tit: tr('Il bidone', 'The bust'), nome: b.nome, team: b.team, brutto: true,
    riga: tr(`pagato ${prezzo[b.id]} crediti${diChi(b)}`, `paid ${prezzo[b.id]} credits${diChi(b)}`) });

  const wv = Math.max(fin.res.wins.a, fin.res.wins.b), wp = Math.min(fin.res.wins.a, fin.res.wins.b);
  const sopr = NOMI_SQUADRA[W.key] && NOMI_SQUADRA[W.key] !== W.name ? NOMI_SQUADRA[W.key] : '';
  return {
    key: W.key, squadra: W.name, soprannome: sopr,
    finale: `${wv}-${wp} ${tr('su', 'over')} ${L.name}`,
    classifica,
    pronostici: pron.filter((p) => p.chiusi > 0).map((p) => ({ nome: chi(p.key), punti: p.punti })),
    riquadri: riquadri.slice(0, 3),
    testo: tr(`Fanta NBA — Campione: ${W.name}${sopr ? ` (${sopr})` : ''}, ${wv}-${wp} su ${L.name}. Ultimo: ${classifica[classifica.length - 1]?.nome || '—'}.`,
      `Fanta NBA — Champion: ${W.name}${sopr ? ` (${sopr})` : ''}, ${wv}-${wp} over ${L.name}. Last: ${classifica[classifica.length - 1]?.nome || '—'}.`),
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

// La frase di roasting va a capo su due righe; se non basta si accorcia.
function righeDi(ctx, testo, maxW, px, quante) {
  ctx.font = `500 ${px}px "Barlow", sans-serif`;
  const parole = testo.split(' ');
  const out = [];
  let riga = '';
  for (const w of parole) {
    const prova = riga ? `${riga} ${w}` : w;
    if (ctx.measureText(prova).width <= maxW || !riga) riga = prova;
    else { out.push(riga); riga = w; }
  }
  if (riga) out.push(riga);
  if (out.length > quante) {
    out.length = quante;
    let ultima = out[quante - 1];
    while (ultima.length > 1 && ctx.measureText(`${ultima}…`).width > maxW) ultima = ultima.slice(0, -1);
    out[quante - 1] = `${ultima}…`;
  }
  return out;
}

const spazio = (ctx, px) => { if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`; };

export function disegnaCard(ctx, d, colori = {}) {
  const C = { bg: '#0c0d11', surf: '#14161d', line: '#262b39', muted: '#9aa3b2', muted2: '#c6cddb', gold: '#ffd166', bad: '#ff5a6a', ...colori };
  const tc = C[d.key] || C.gold;
  const W = LARGHEZZA, H = ALTEZZA, mx = 60;

  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const luce = ctx.createLinearGradient(0, 0, 0, 340);
  luce.addColorStop(0, tc); luce.addColorStop(1, C.bg);
  ctx.globalAlpha = 0.32; ctx.fillStyle = luce; ctx.fillRect(0, 0, W, 340); ctx.globalAlpha = 1;
  ctx.fillStyle = tc; ctx.fillRect(0, 0, W, 10);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left'; ctx.fillStyle = C.gold; spazio(ctx, 6);
  scriviIn(ctx, 'FANTA NBA', mx, 74, 400, 30);
  ctx.textAlign = 'right'; ctx.fillStyle = C.muted; spazio(ctx, 3);
  scriviIn(ctx, tr('IL VERDETTO DELLA SERATA', 'THE NIGHT\'S VERDICT'), W - mx, 74, 560, 24, 700);

  // Il campione in una riga: trofeo piccolo, nome, finale.
  ctx.save();
  ctx.translate(mx - 6, 104); ctx.scale(1.6, 1.6);
  const oro = ctx.createLinearGradient(0, 8, 0, 55);
  oro.addColorStop(0, '#ffe7a3'); oro.addColorStop(0.5, '#ffd166'); oro.addColorStop(1, '#c9921f');
  ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.stroke(new Path2D(MANICI));
  for (const [p, f] of TROFEO) { ctx.fillStyle = f === 'oro' ? oro : f; ctx.fill(new Path2D(p)); }
  ctx.restore();
  const tx = mx + 120, tw = W - mx - tx;
  ctx.textAlign = 'left';
  ctx.fillStyle = C.gold; spazio(ctx, 8); scriviIn(ctx, tr('CAMPIONE', 'CHAMPION'), tx, 146, tw, 26);
  ctx.fillStyle = '#ffffff'; spazio(ctx, 1); scriviIn(ctx, d.squadra.toUpperCase(), tx, 212, tw, 68);
  ctx.fillStyle = C.muted2; spazio(ctx, 0);
  scriviIn(ctx, `${d.finale}${d.soprannome ? ` · ${d.soprannome}` : ''}`, tx, 252, tw, 28, 500, 'Barlow');

  // La classifica, con la frase per ogni persona.
  let y = 290;
  ctx.fillStyle = C.line; ctx.fillRect(mx, y, W - 2 * mx, 2);
  y += 46;
  ctx.textAlign = 'left'; ctx.fillStyle = C.muted; spazio(ctx, 5);
  scriviIn(ctx, tr('LA CLASSIFICA', 'THE STANDINGS'), mx, y, 500, 22, 700);
  y += 16;
  const n = d.classifica.length || 1;
  const rowH = Math.min(118, Math.floor(620 / n));
  const gap = 8, quante = rowH >= 100 ? 2 : 1;
  for (const r of d.classifica) {
    const h = rowH - gap;
    ctx.fillStyle = C.surf; ctx.fillRect(mx, y, W - 2 * mx, h);
    ctx.fillStyle = C[r.key] || C.muted; ctx.fillRect(mx, y, 6, h);
    ctx.textAlign = 'left';
    ctx.fillStyle = r.pos === 1 ? C.gold : C.muted2; spazio(ctx, 0);
    scriviIn(ctx, String(r.pos), mx + 24, y + Math.min(52, h - 14), 56, Math.min(46, h - 14));
    const nx = mx + 92, nw = W - mx - 24 - nx;
    ctx.fillStyle = '#ffffff'; spazio(ctx, 1);
    if (r.roast) {
      scriviIn(ctx, r.nome.toUpperCase(), nx, y + Math.min(42, h * 0.45), nw, Math.min(34, h * 0.36));
      const righe = righeDi(ctx, r.roast, nw, Math.min(23, h * 0.24), quante);
      ctx.fillStyle = C.muted2; spazio(ctx, 0);
      righe.forEach((riga, j) => { ctx.font = `500 ${Math.min(23, h * 0.24)}px "Barlow", sans-serif`; ctx.fillText(riga, nx, y + Math.min(42, h * 0.45) + (j + 1) * Math.min(28, h * 0.28)); });
    } else {
      scriviIn(ctx, r.nome.toUpperCase(), nx, y + h / 2 + 12, nw, Math.min(34, h * 0.4));
    }
    y += rowH;
  }

  // I pronostici, in una riga.
  if (d.pronostici?.length) {
    y += 34;
    ctx.textAlign = 'left'; ctx.fillStyle = C.muted; spazio(ctx, 4);
    scriviIn(ctx, tr('PRONOSTICI', 'PREDICTIONS'), mx, y, 260, 22, 700);
    ctx.fillStyle = C.muted2; spazio(ctx, 0);
    scriviIn(ctx, d.pronostici.map((p) => `${p.nome} ${p.punti.toFixed(1)}`).join(' · '), mx + 230, y, W - 2 * mx - 230, 26, 600, 'Barlow');
  }

  // MVP, colpo, bidone.
  const nq = d.riquadri.length;
  if (nq) {
    const gq = 20, top = 1110, hq = 170;
    const w = (W - 2 * mx - gq * (nq - 1)) / nq;
    d.riquadri.forEach((r, i) => {
      const x = mx + i * (w + gq);
      ctx.fillStyle = C.surf; ctx.fillRect(x, top, w, hq);
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
