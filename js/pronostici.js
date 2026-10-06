// pronostici.js — chi non gioca una serie la pronostica.
//
// Il problema che risolve e il tempo morto: chi esce in semifinale passa il
// resto della serata a guardare due telefoni che non sono il suo. Con un
// pronostico in tasca la finale degli altri torna a interessargli.
//
// Si pronostica chi vince E in quante gare, prima che si giochi gara 1. Il
// vincente da 1 punto, le gare esatte altri 2: indovinare "Bulls in 4" vale
// tre volte "Bulls", perche e tre volte piu difficile. Pronostica chiunque
// sia al tavolo e non giochi QUELLA serie — al primo turno quindi anche chi
// e ancora in corsa, sulle serie degli altri.
//
// Nel database finisce solo la scelta. Chi ha indovinato si ricava dai
// risultati, che il motore ricalcola dal seme come tutto il resto.

import { db } from './core.js';
import { costruisciBracket, simSeriesUpTo } from './engine.js';

export const PUNTI_VINCENTE = 1;
export const PUNTI_GARE = 2;

// Tutte le serie del tabellone, finalina compresa, con quante gare sono gia
// state scoperte: la finestra del pronostico e "zero gare giocate".
export function serieDelTabellone(s, T) {
  if (!s?.po) return [];
  const out = [];
  costruisciBracket(s.po, T).forEach((round) => round.forEach((m) => {
    out.push({ id: `${m.r}-${m.i}`, a: m.a, b: m.b, giocate: m.gamesPlayed || 0, f: m.res });
  }));
  const t = s.po.third;
  if (t && T[t.a] && T[t.b]) {
    out.push({ id: 'third', a: t.a, b: t.b, giocate: t.gamesPlayed || 0,
      f: simSeriesUpTo(T[t.a], T[t.b], t.seed, t.gamesPlayed) });
  }
  return out;
}

// Una serie si pronostica quando si sa chi la gioca e non e ancora iniziata.
export const aperta = (x) => !!(x.a && x.b && x.f && x.giocate === 0);

// Quanto vale un pronostico a serie chiusa: 0, 1 o 3.
export function puntiDi(p, f) {
  if (!p || !f?.done || p.v !== f.winner) return 0;
  return PUNTI_VINCENTE + (p.g === f.games.length ? PUNTI_GARE : 0);
}

// La classifica: solo chi ha pronosticato almeno una volta. A parita di punti
// conta chi ha preso piu risultati esatti, poi chi ha sbagliato meno.
export function classificaPronostici(s, T) {
  const pron = s?.po?.pron || {};
  const righe = {};
  for (const x of serieDelTabellone(s, T)) {
    for (const [chi, p] of Object.entries(pron[x.id] || {})) {
      const r = (righe[chi] ||= { key: chi, punti: 0, giusti: 0, esatti: 0, fatti: 0, chiusi: 0 });
      r.fatti++;
      if (!x.f?.done) continue;
      r.chiusi++;
      const pt = puntiDi(p, x.f);
      r.punti += pt;
      if (pt) r.giusti++;
      if (pt > PUNTI_VINCENTE) r.esatti++;
    }
  }
  return Object.values(righe).sort((a, b) =>
    b.punti - a.punti || b.esatti - a.esatti || (a.chiusi - a.giusti) - (b.chiusi - b.giusti) || a.key.localeCompare(b.key));
}

// IL PRONOSTICO DI UN BOT. Non usa il motore: saprebbe gia come finisce,
// perche il risultato sta tutto nel seme. Guarda quello che vedono tutti —
// l'overall medio dei due quintetti — e ci mette del suo, come chiunque.
const ovrMedio = (X) => {
  const D = db();
  const v = (X?.five || []).map((p) => D.byId[p.id]?.ovr ?? p.ovr).filter((n) => n > 0);
  return v.length ? v.reduce((a, n) => a + n, 0) / v.length : 0;
};

export function pronosticoBot(A, B, rnd = Math.random) {
  const d = ovrMedio(A) - ovrMedio(B);
  // Due punti di overall medio in piu fanno una favorita netta, non certa:
  // anche i bot ogni tanto puntano sulla sorpresa.
  const pA = 1 / (1 + Math.exp(-d * 0.9));
  const v = rnd() < pA ? A.key : B.key;
  const scarto = Math.abs(d);
  // Chi punta sulla sorpresa la vede lunga: nessuno pronostica la squadra
  // piu debole che vince in quattro.
  const sorpresa = (v === A.key) !== (d >= 0);
  const coppia = sorpresa || scarto <= 1.5 ? [6, 7] : (scarto > 3 ? [4, 5] : [5, 6]);
  return { v, g: coppia[rnd() < 0.5 ? 0 : 1] };
}
