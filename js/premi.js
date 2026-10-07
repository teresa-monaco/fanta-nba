// premi.js — i premi di fine serata.
//
// Servono a dare un finale alla serata oltre al campione, e soprattutto a
// legare l'asta al risultato: chi ha pagato 33 crediti un giocatore che poi
// ha fatto undici punti a partita deve sentirselo dire. E' materiale da chat
// di gruppo, ed e il motivo per cui esiste.
//
// Tutto si ricava da quello che c'e gia: i box score delle gare (che il
// motore ricalcola dal seme, uguali su ogni telefono) e i prezzi pagati
// all'asta. Niente si salva nel database.

import { db } from './core.js';
import { costruisciBracket, simSeriesUpTo } from './engine.js';

// Minimo di gare per contare come MVP: almeno una serie intera. Senza, un
// giocatore uscito al primo turno con quattro partite buone batterebbe chi ne
// ha giocate diciassette fino al titolo.
const GARE_MINIME = 4;

// Il bidone si cerca solo fra chi e costato qualcosa: un giocatore preso a
// un credito che rende poco e un riempitivo, non un errore.
const PREZZO_BIDONE = 10;

// Tutte le serie giocate, finalina compresa.
function tutteLeSerie(s, T) {
  const turni = costruisciBracket(s.po, T);
  const serie = turni.flat().filter((m) => m.res && m.a && m.b)
    .map((m) => ({ A: T[m.a], B: T[m.b], f: m.res }));
  const t = s.po?.third;
  if (t && T[t.a] && T[t.b]) {
    serie.push({ A: T[t.a], B: T[t.b], f: simSeriesUpTo(T[t.a], T[t.b], t.seed, t.gamesPlayed) });
  }
  return serie;
}

export function premiSerata(s, T) {
  const D = db();
  if (!s?.po) return [];

  // Le cifre di ognuno su tutti i playoff.
  const conto = {};
  for (const { A, B, f } of tutteLeSerie(s, T)) {
    for (const g of f.games) {
      const righe = [...g.boxA.map((l) => ({ ...l, team: A.key })), ...g.boxB.map((l) => ({ ...l, team: B.key }))];
      for (const l of righe) {
        const c = (conto[l.id] ||= { id: l.id, n: l.n, team: l.team, pts: 0, reb: 0, ast: 0, g: 0 });
        c.pts += l.pts || 0; c.reb += l.reb || 0; c.ast += l.ast || 0; c.g++;
      }
    }
  }
  const gioc = Object.values(conto);
  if (!gioc.length) return [];

  const prezzo = {};
  for (const l of s.auction?.log || []) prezzo[l.playerId] = l.price;

  const premi = [];
  const media = (c, k) => c[k] / c.g;

  // MVP dei playoff: la somma di punti, rimbalzi e assist a partita, su
  // almeno una serie intera.
  const candidati = gioc.filter((c) => c.g >= GARE_MINIME);
  const mvp = (candidati.length ? candidati : gioc)
    .slice().sort((a, b) => (media(b, 'pts') + media(b, 'reb') + media(b, 'ast'))
      - (media(a, 'pts') + media(a, 'reb') + media(a, 'ast')))[0];
  if (mvp) {
    premi.push({
      chiave: 'mvp', titolo: 'MVP dei playoff', id: mvp.id, nome: mvp.n, team: mvp.team,
      riga: `${media(mvp, 'pts').toFixed(1)} punti, ${media(mvp, 'reb').toFixed(1)} rimbalzi, ${media(mvp, 'ast').toFixed(1)} assist in ${mvp.g} gare`,
    });
  }

  // Capocannoniere e re dei rimbalzi: la MEDIA a partita, non il totale. Col
  // totale vinceva chi arrivava in fondo e giocava piu gare: 400 punti in 10
  // gare battevano 399 in 9, e non e il migliore realizzatore della serata,
  // e quello che ha giocato di piu. Fra chi ha giocato almeno una serie
  // intera, come per l'MVP; a pari media, chi ha giocato di piu.
  const perMedia = (k) => (candidati.length ? candidati : gioc).slice()
    .sort((a, b) => media(b, k) - media(a, k) || b.g - a.g)[0];
  const cap = perMedia('pts');
  if (cap) {
    premi.push({
      chiave: 'punti', titolo: 'Capocannoniere', id: cap.id, nome: cap.n, team: cap.team,
      riga: `${media(cap, 'pts').toFixed(1)} punti a partita (${cap.pts} in ${cap.g} gare)`,
    });
  }

  const rimb = perMedia('reb');
  if (rimb) {
    premi.push({
      chiave: 'rimbalzi', titolo: 'Re dei rimbalzi', id: rimb.id, nome: rimb.n, team: rimb.team,
      riga: `${media(rimb, 'reb').toFixed(1)} rimbalzi a partita (${rimb.reb} in ${rimb.g} gare)`,
    });
  }

  // IL COLPO DELL'ASTA: tanto giocatore per pochi crediti. Si misura quanto
  // sta sopra la soglia minima di overall per ogni credito speso, cosi un 96
  // preso a 1 batte un 98 pagato 37 — che e esattamente il punto.
  const comprati = Object.entries(prezzo)
    .map(([id, p]) => ({ id, p, pl: D.byId[id] }))
    .filter((x) => x.pl && x.p >= 1);
  const colpo = comprati.slice()
    .sort((a, b) => ((b.pl.ovr - 84) / b.p) - ((a.pl.ovr - 84) / a.p) || b.pl.ovr - a.pl.ovr)[0];
  if (colpo) {
    const chi = Object.keys(s.teams || {}).find((k) => s.teams[k].roster?.includes(colpo.id));
    premi.push({
      chiave: 'colpo', titolo: 'Il colpo dell\'asta', id: colpo.id, nome: colpo.pl.n, team: chi,
      riga: `overall ${colpo.pl.ovr}, pagato ${colpo.p} ${colpo.p === 1 ? 'credito' : 'crediti'}`,
    });
  }

  // IL BIDONE: il piu caro che ha reso meno. Fra chi e costato almeno dieci
  // crediti, il rapporto peggiore fra prezzo e produzione a partita.
  const cari = gioc
    .filter((c) => (prezzo[c.id] || 0) >= PREZZO_BIDONE)
    .map((c) => ({ c, p: prezzo[c.id], resa: media(c, 'pts') + media(c, 'reb') + media(c, 'ast') }));
  const bidone = cari.slice().sort((a, b) => (b.p / (b.resa + 1)) - (a.p / (a.resa + 1)))[0];
  if (bidone && bidone.c.id !== mvp?.id) {
    premi.push({
      chiave: 'bidone', titolo: 'Il bidone', id: bidone.c.id, nome: bidone.c.n, team: bidone.c.team,
      riga: `pagato ${bidone.p} crediti, ${media(bidone.c, 'pts').toFixed(1)} punti a partita`,
    });
  }

  return premi;
}
