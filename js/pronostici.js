// pronostici.js — come finisce la serie, e chi segna di piu. A quote.
//
// Prima di gara 1 ognuno al tavolo — anche chi la serie la gioca: quintetti e
// tattiche sono gia bloccati, nessuno puo influenzare niente — sceglie due
// cose: l'esito (4-0 ... 0-4) e il miglior marcatore della serie. Se
// indovina prende la QUOTA come punti: 4-1 a 4,40 vale 4,40 punti, il
// favorito a 1,50 ne vale 1,50. Una regola sola per tutto, e chi rischia
// sulla sorpresa viene pagato per il rischio.
//
// LE QUOTE SONO ONESTE. Il risultato vero sta tutto nel seme della serie: le
// quote non lo guardano mai. Si gioca la stessa serie QUATTROCENTO volte su
// semi diversi e si conta quante volte esce ogni esito e ogni marcatore. La
// quota e l'inverso di quella frequenza. Stessi semi su ogni telefono,
// quindi stesse quote per tutti, senza salvarle da nessuna parte.
//
// Nel database finisce solo la scelta. I punti si ricavano dai risultati e
// dalle quote, che si ricalcolano come tutto il resto.

import { db } from './core.js';
import { simSeriesUpTo } from './engine.js';
import { ordineSerie } from './serie.js';

export const N_SIM = 400;
export const QUOTA_MIN = 1.05;
// Il tetto: sotto il 2% di probabilita la quota vera sarebbe 80, 200, 1000.
// Chi la indovina vince comunque tanto, ma non da solo la classifica.
export const QUOTA_MAX = 50;
export const ESITI = ['4-0', '4-1', '4-2', '4-3', '0-4', '1-4', '2-4', '3-4'];

const quota = (p) => (p <= 0 ? QUOTA_MAX : Math.round(Math.min(QUOTA_MAX, Math.max(QUOTA_MIN, 1 / p)) * 100) / 100);

// Il miglior marcatore di una serie gia giocata: TUTTI quelli col totale piu
// alto. A pari punti vince chi li ha scelti, come al bar.
export function marcatoriDi(f) {
  const tot = {};
  for (const g of f?.games || []) for (const l of [...g.boxA, ...g.boxB]) tot[l.id] = (tot[l.id] || 0) + (l.pts || 0);
  const max = Math.max(0, ...Object.values(tot));
  return { tot, top: Object.keys(tot).filter((id) => tot[id] === max && max > 0) };
}

export const esitoDi = (f) => (f?.done ? `${f.wins.a}-${f.wins.b}` : null);

// Calcolarle costa una quindicina di millisecondi, e la schermata si
// ridisegna a ogni cambio di stato: si tengono da parte, per serie e
// quintetti. Durante i playoff i quintetti non cambiano piu.
const cache = new Map();

export function quoteSerie(A, B, seed) {
  const chiave = `${seed}|${A.key}:${A.five.map((p) => p.id).join('.')}|${B.key}:${B.five.map((p) => p.id).join('.')}`;
  const c = cache.get(chiave);
  if (c) return c;
  const esiti = Object.fromEntries(ESITI.map((e) => [e, 0]));
  const marc = {};
  for (let i = 0; i < N_SIM; i++) {
    const f = simSeriesUpTo(A, B, `${seed}:q${i}`, 7);
    esiti[esitoDi(f)]++;
    const { top } = marcatoriDi(f);
    for (const id of top) marc[id] = (marc[id] || 0) + 1 / top.length;
  }
  const D = db();
  const out = {
    esiti: Object.fromEntries(ESITI.map((e) => [e, { p: esiti[e] / N_SIM, q: quota(esiti[e] / N_SIM) }])),
    marcatori: [...A.five.map((p) => [p, A.key]), ...B.five.map((p) => [p, B.key])].map(([p, team]) => ({
      id: p.id, n: p.n, team, ovr: D.byId[p.id]?.ovr ?? p.ovr,
      p: (marc[p.id] || 0) / N_SIM, q: quota((marc[p.id] || 0) / N_SIM),
    })).sort((x, y) => x.q - y.q || y.ovr - x.ovr),
  };
  if (cache.size > 200) cache.clear();
  cache.set(chiave, out);
  return out;
}

// Quanto vale un pronostico a serie chiusa, mercato per mercato.
export function puntiDi(p, f, quote) {
  if (!p || !f?.done || !quote) return { e: 0, m: 0 };
  const e = p.e && p.e === esitoDi(f) ? quote.esiti[p.e]?.q || 0 : 0;
  const m = p.m && marcatoriDi(f).top.includes(p.m)
    ? quote.marcatori.find((x) => x.id === p.m)?.q || 0 : 0;
  return { e, m };
}

const arrot = (x) => Math.round(x * 100) / 100;

// La classifica della serata: solo chi ha pronosticato almeno una volta. A
// parita di punti conta chi ha preso piu pronostici.
export function classificaPronostici(s, T) {
  const pron = s?.po?.pron || {};
  const righe = {};
  for (const x of ordineSerie(s, T)) {
    const scelte = pron[x.id];
    if (!scelte || !x.a || !x.b) continue;
    const quote = quoteSerie(T[x.a], T[x.b], x.seed);
    for (const [chi, p] of Object.entries(scelte)) {
      if (!p?.e && !p?.m) continue; // vecchio formato: non si conta
      const r = (righe[chi] ||= { key: chi, punti: 0, presi: 0, fatti: 0, chiusi: 0 });
      r.fatti++;
      if (!x.f?.done) continue;
      r.chiusi++;
      const pt = puntiDi(p, x.f, quote);
      r.punti = arrot(r.punti + pt.e + pt.m);
      r.presi += (pt.e ? 1 : 0) + (pt.m ? 1 : 0);
    }
  }
  return Object.values(righe).sort((a, b) => b.punti - a.punti || b.presi - a.presi || a.key.localeCompare(b.key));
}

// Il re dei pronostici, se c'e: il primo, ma solo se e uno e se ha preso
// qualcosa. A pari punti e pari presi non si incorona nessuno.
export function reDeiPronostici(cl) {
  if (!cl?.length || cl[0].punti <= 0) return null;
  const pari = cl[1] && cl[1].punti === cl[0].punti && cl[1].presi === cl[0].presi;
  return pari ? null : cl[0];
}

// IL PRONOSTICO DI UN BOT. Pesca in proporzione alle probabilita: quasi
// sempre il favorito, ogni tanto la sorpresa, come farebbe una persona che
// legge la lavagna. Non guarda il motore: saprebbe gia come finisce.
export function pronosticoBot(quote, rnd = Math.random) {
  const pesca = (voci) => {
    const tot = voci.reduce((a, v) => a + v.p, 0);
    if (tot <= 0) return voci[0];
    let x = rnd() * tot;
    for (const v of voci) { x -= v.p; if (x <= 0) return v; }
    return voci[voci.length - 1];
  };
  const e = pesca(ESITI.map((k) => ({ k, p: quote.esiti[k].p }))).k;
  const m = pesca(quote.marcatori).id;
  return { e, m };
}
