// serie.js — una serie alla volta.
//
// I playoff aprivano tutte le serie di un turno insieme: due semifinali, due
// tabelloni, due tasti, e chi non ospitava doveva scorrere fra l'una e
// l'altra per capire dove si era. In quattro — che e come si gioca quasi
// sempre — e meglio una serie sola per volta, guardata davvero: la
// semifinale 1, poi la 2, poi la finale.
//
// Qui solo l'ordine e il "dove siamo". Nello stato c'e un campo solo,
// po.corrente, che chi ospita sposta con "Avanti" a serie chiusa: cosi il
// riepilogo resta a schermo finche il tavolo non ha finito di commentarlo.

import { costruisciBracket, simSeriesUpTo, nomeTurno } from './engine.js';

// Tutte le serie nell'ordine in cui si giocano. La finalina, se chi ospita
// l'ha voluta, va PRIMA della finale: la serata si chiude sul campione, non
// su chi arriva terzo.
export function ordineSerie(s, T) {
  if (!s?.po) return [];
  const turni = costruisciBracket(s.po, T);
  const tot = turni.length;
  const conTeste = s.po.teste > 0;
  const out = [];
  turni.forEach((round, r) => round.forEach((m) => {
    const nome = nomeTurno(r, tot, conTeste);
    out.push({
      id: `${m.r}-${m.i}`, r: m.r, i: m.i, a: m.a, b: m.b, seed: m.seed,
      giocate: m.gamesPlayed || 0, f: m.res,
      titolo: round.length > 1 ? `${nome} ${m.i + 1}` : nome,
      finale: r === tot - 1,
    });
  }));
  const t = s.po.third;
  if (t && T[t.a] && T[t.b]) {
    const x = {
      id: 'third', a: t.a, b: t.b, seed: t.seed, giocate: t.gamesPlayed || 0,
      f: simSeriesUpTo(T[t.a], T[t.b], t.seed, t.gamesPlayed), titolo: 'Finale 3° / 4° posto', finale: false,
    };
    out.splice(out.length - 1, 0, x);
  }
  return out;
}

// La serie a schermo. Se lo stato la dice, quella. Le stanze aperte prima di
// questo cambio non hanno il campo: si prende la prima non ancora chiusa, che
// e quella che avrebbe giocato chiunque.
export function serieCorrente(s, T, ordine = ordineSerie(s, T)) {
  const scelta = ordine.find((x) => x.id === s?.po?.corrente && x.a && x.b);
  if (scelta) return scelta;
  return ordine.find((x) => x.a && x.b && !x.f?.done) || ordine[ordine.length - 1] || null;
}

// Dove si va da qui, a serie chiusa. Di solito una strada sola; dopo
// l'ultima semifinale due, se le eliminate sono due e la finalina non c'e
// ancora: giocarla o andare dritti in finale. Vuoto dopo la finale.
export function dopo(s, T, x, ordine = ordineSerie(s, T)) {
  if (!x?.f?.done || x.finale) return [];
  const idx = ordine.findIndex((y) => y.id === x.id);
  const prossima = ordine.slice(idx + 1).find((y) => y.a && y.b);
  if (!prossima) return [];
  const strade = [{ id: prossima.id, titolo: prossima.titolo }];
  if (prossima.finale && !s.po.third && x.id !== 'third') {
    const semi = ordine.filter((y) => y.r === prossima.r - 1);
    if (semi.length === 2 && semi.every((y) => y.f?.done)) {
      const [p, q] = semi.map((y) => (y.f.winner === y.a ? y.b : y.a));
      strade.unshift({ id: 'third', titolo: 'Finale 3° / 4° posto', a: p, b: q });
    }
  }
  return strade;
}
