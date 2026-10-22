// analisi.js — perche ha vinto, detto con i numeri.
//
// Il "perche ha vinto" di prima traduceva i fattori del motore in frasi
// generiche ("ha piu spacing"), senza nomi e senza pesi: non si capiva QUALE
// giocatore e QUALE scelta avessero deciso la serie. Questa e la spiegazione
// che darebbe uno che ha letto il motore: chi partiva favorito e di quanto,
// i due o tre fattori che hanno pesato di piu con i giocatori e gli
// attributi che li hanno prodotti, quello che remava contro, e cosa avrebbe
// cambiato la panchina.
//
// Niente di inventato: ogni nome e ogni numero viene dagli stessi calcoli che
// il motore ha fatto per giocare la serie.

import { STRATEGIES } from './core.js';
import { refertoTattico, RITMI } from './engine.js';
import { EN, tr } from './lingua.js';

const num = (x, cifre = 1) => (EN ? x.toFixed(cifre) : x.toFixed(cifre).replace('.', ','));
const segno = (x) => `${x >= 0 ? '+' : '−'}${num(Math.abs(x))}`;

// I fattori che nascono dalla strategia scelta: per questi si dice anche
// quale strategia, perche e una scelta e non un dato della rosa.
const DI_STRATEGIA = /^(star-|iso-|pnr-|post-|ferro-atletismo|ferro-muro|tre-|tr-|motion-|df-|ho-|eq-)/;

const top = (T, attr, n = 1, filtro = () => true) => T.five.filter(filtro)
  .slice().sort((x, y) => y.attrs[attr] - x.attrs[attr]).slice(0, n);
const lunghi = (p) => ['PF', 'C'].includes(p.slot);
const NOME_ATTR = EN
  ? { sco: 'scoring', tre: 'three-point', pla: 'playmaking', reb: 'rebounding', dif: 'rim protection', dpe: 'perimeter defense', atl: 'athleticism', usg: 'usage' }
  : { sco: 'realizzazione', tre: 'tiro da tre', pla: 'playmaking', reb: 'rimbalzi',
    dif: 'protezione del ferro', dpe: 'difesa perimetrale', atl: 'atletismo', usg: 'palla richiesta' };
const elenco = (ps, attr) => ps.map((p) => `${p.n} (${NOME_ATTR[attr]} ${p.attrs[attr]})`).join(tr(' e ', ' and '));
const tiratori = (T) => T.five.filter((p) => p.attrs.tre >= 75);

// Il dettaglio di un fattore: QUALI giocatori, con QUALI numeri.
function dettaglio(f, T, O) {
  const d = f.data || {};
  switch (f.key) {
    case 'fuori-ruolo': return (d.names || []).join(', ');
    case 'no-spacing': {
      const t = tiratori(T);
      return t.length ? tr(`l'unico tiratore vero è ${elenco(t, 'tre')}`, `the only real shooter is ${elenco(t, 'tre')}`) : tr('nessuno tira sopra 75 da tre', 'nobody shoots above 75 from three');
    }
    case 'spacing-totale': return `${tiratori(T).length} ${tr('tiratori', 'shooters')}: ${elenco(tiratori(T), 'tre')}`;
    case 'no-playmaker': return tr(`il miglior passatore è ${elenco(top(T, 'pla'), 'pla')}`, `the best passer is ${elenco(top(T, 'pla'), 'pla')}`);
    case 'troppe-bocche': return tr(`${elenco(top(T, 'usg', 3), 'usg')} vogliono tutti la palla`, `${elenco(top(T, 'usg', 3), 'usg')} all want the ball`);
    case 'ferro-scoperto': return tr(`a difendere il ferro c'è ${elenco(top(T, 'dif'), 'dif')}`, `guarding the rim is ${elenco(top(T, 'dif'), 'dif')}`);
    case 'anello-debole': return tr(`${d.worst} e chi come lui sta sotto 89 di overall`, `${d.worst} and the others below 89 overall`);
    case 'quintetto-piccolo': return tr(`${T.five.find((p) => p.slot === 'C')?.n || 'il centro'} da centro`, `${T.five.find((p) => p.slot === 'C')?.n || 'the center'} at center`);
    case 'violino-sbagliato': return tr(`la palla va a ${d.chosen}, il miglior realizzatore è ${d.best}`, `the ball goes to ${d.chosen}, the best scorer is ${d.best}`);
    case 'star-usage': return tr(`${elenco(top(T, 'sco'), 'sco')} con la palla in mano`, `${elenco(top(T, 'sco'), 'sco')} with the ball in his hands`);
    case 'star-contenuta': return tr(`${elenco(top(O, 'dpe'), 'dpe')} sul perimetro`, `${elenco(top(O, 'dpe'), 'dpe')} on the perimeter`);
    case 'iso-talento': return tr(`${elenco(top(T, 'sco', 2), 'sco')} uno contro uno`, `${elenco(top(T, 'sco', 2), 'sco')} one-on-one`);
    case 'iso-ritmo': return tr(`${elenco(top(O, 'dpe'), 'dpe')} in difesa individuale`, `${elenco(top(O, 'dpe'), 'dpe')} in man-to-man defense`);
    case 'pnr-coppia': return tr(`${elenco(top(T, 'pla'), 'pla')} col lungo ${elenco(top(T, 'sco', 1, lunghi), 'sco')}`, `${elenco(top(T, 'pla'), 'pla')} with the big man ${elenco(top(T, 'sco', 1, lunghi), 'sco')}`);
    case 'pnr-difesa-lenta': return tr(`nei cambi ci sono ${elenco(O.five.slice().sort((x, y) => x.attrs.atl - y.attrs.atl).slice(0, 2), 'atl')}`, `switching are ${elenco(O.five.slice().sort((x, y) => x.attrs.atl - y.attrs.atl).slice(0, 2), 'atl')}`);
    case 'post-peso': case 'df-lungo': return tr(`${elenco(top(T, 'sco', 1, lunghi), 'sco')} spalle a canestro`, `${elenco(top(T, 'sco', 1, lunghi), 'sco')} with his back to the basket`);
    case 'post-muro': case 'ferro-muro': return tr(`a protezione del ferro c'è ${elenco(top(O, 'dif'), 'dif')}`, `protecting the rim is ${elenco(top(O, 'dif'), 'dif')}`);
    case 'post-scarichi': case 'tre-volume': case 'df-tiro': case 'ho-tiro': {
      return elenco(top(T, 'tre', 2), 'tre');
    }
    case 'df-incompleto': return tiratori(T).length < 2 ? `${tr('tiratori veri', 'real shooters')}: ${tiratori(T).length}` : tr('manca un lungo che segna', 'no big man who scores');
    case 'ho-lettura': return tr(`${elenco(top(T, 'pla', 1, lunghi), 'pla')} è il lungo che riceve e smista`, `${elenco(top(T, 'pla', 1, lunghi), 'pla')} is the big who catches and distributes`);
    case 'ferro-atletismo': case 'tr-atletismo': return elenco(top(T, 'atl', 2), 'atl');
    case 'tr-pesantezza': return tr(`${elenco(top(O, 'reb', 2, lunghi), 'reb')} da rincorrere`, `${elenco(top(O, 'reb', 2, lunghi), 'reb')} trying to keep up`);
    case 'motion-lettura': case 'motion-armonia': return tr(`${elenco(top(T, 'pla', 2), 'pla')} a far girare la palla`, `${elenco(top(T, 'pla', 2), 'pla')} moving the ball`);
    case 'motion-un-creatore': return tr(`crea solo ${elenco(top(T, 'pla'), 'pla')}`, `only ${elenco(top(T, 'pla'), 'pla')} creates`);
    case 'rimbalzi': return `${elenco(top(T, 'reb'), 'reb')} ${tr('contro', 'against')} ${elenco(top(O, 'reb'), 'reb')}`;
    case 'taglia': return tr(`${elenco(top(T, 'reb', 2, lunghi), 'reb')} sotto canestro`, `${elenco(top(T, 'reb', 2, lunghi), 'reb')} under the basket`);
    case 'spacing-diff': return tr(`${tiratori(T).length} tiratori veri contro ${tiratori(O).length}`, `${tiratori(T).length} real shooters against ${tiratori(O).length}`);
    case 'difesa-perimetro': return `${elenco(top(T, 'dpe'), 'dpe')} ${tr('contro', 'against')} ${elenco(top(O, 'dpe'), 'dpe')}`;
    case 'ritmo-corsa': case 'ritmo-lento': case 'ritmo-freno':
    {
      const r = (RITMI[T.tactics.ritmo]?.label || T.tactics.ritmo || '').toLowerCase();
      return tr(`ritmo ${r}`, `${r} pace`);
    }
    default: return '';
  }
}

const ARTICOLO = EN ? { strategy: 'the ', ritmo: 'the ', coach: 'the ', v1: 'the ' } : { strategy: 'la ', ritmo: 'il ', coach: "l'", v1: 'il ' };

const PIU_PESANTE = tr('Il fattore più pesante della serie. ', 'The heaviest factor of the series. ');

function frase(f, T, O, piuPesante) {
  const strat = DI_STRATEGIA.test(f.key) ? `, ${tr('giocando', 'playing')} ${STRATEGIES[T.tactics.strategy]?.label || tr('la sua strategia', 'its strategy')}` : '';
  const det = dettaglio(f, T, O);
  const testa = piuPesante ? PIU_PESANTE : '';
  return `${testa}${T.name}${strat} — ${f.label.toLowerCase()}${det ? `: ${det}` : ''} (${segno(f.delta)}).`;
}

// pA: la probabilita che A vincesse la serie, dalle stesse simulazioni delle
// quote (la passa chi chiama, che le ha gia).
// opts.quadro = false toglie la prima voce: nel riepilogo lo dice gia la
// barra "sulla carta" nel tabellone.
export function analisiSerie(A, B, f, pA, opts = {}) {
  const W = f.winner === A.key ? A : B;
  const L = W === A ? B : A;
  const m = f.matchup || {};
  const out = [];

  // 1. Il quadro: chi partiva favorito, e da dove veniva il vantaggio.
  if (opts.quadro !== false && typeof pA === 'number' && m.offA != null) {
    const pW = Math.round((W === A ? pA : 1 - pA) * 100);
    const fav = pW >= 50 ? W : L;
    const pFav = Math.max(pW, 100 - pW);
    const attacco = tr(`${A.name} attaccava a ${Math.round(m.offA)} contro la difesa da ${Math.round(m.defB)}, ${B.name} a ${Math.round(m.offB)} contro ${Math.round(m.defA)}`,
      `${A.name}'s offense rated ${Math.round(m.offA)} against a defense of ${Math.round(m.defB)}, ${B.name}'s ${Math.round(m.offB)} against ${Math.round(m.defA)}`);
    out.push(fav === W
      ? tr(`Sulla carta passava ${W.name} ${pFav} volte su 100: ${attacco}. Pronostico rispettato.`, `On paper ${W.name} advanced ${pFav} times out of 100: ${attacco}. As predicted.`)
      : tr(`Sulla carta passava ${L.name} ${pFav} volte su 100: ${attacco}. ${W.name} ha ribaltato il pronostico: capita ${100 - pFav} volte su 100.`, `On paper ${L.name} advanced ${pFav} times out of 100: ${attacco}. ${W.name} pulled off the upset: it happens ${100 - pFav} times out of 100.`));
  }

  // 2. I fattori che hanno pesato, a favore di chi ha vinto. Un fattore aiuta
  //    chi ha vinto se e un suo vantaggio o un difetto dell'avversario.
  const fattori = (m.factors || []).filter((x) => !x.infoOnly && !x.varianceOnly && Math.abs(x.delta) >= 0.8)
    .map((x) => ({ ...x, aiuta: (x.side === W.key) === (x.delta > 0) }));
  const massimo = fattori.reduce((mx, x) => Math.max(mx, Math.abs(x.delta)), 0);
  const aFavore = fattori.filter((x) => x.aiuta).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 3);
  for (const x of aFavore) {
    const T = x.side === A.key ? A : B;
    out.push(frase(x, T, T === A ? B : A, Math.abs(x.delta) === massimo));
  }

  // 3. Quello che remava contro, se pesava davvero.
  const contro = fattori.filter((x) => !x.aiuta && Math.abs(x.delta) >= 1.5)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))[0];
  if (contro) {
    const T = contro.side === A.key ? A : B;
    out.push(`${tr('Remava contro', 'Working against')} ${W.name}: ${frase(contro, T, T === A ? B : A, Math.abs(contro.delta) === massimo).replace(PIU_PESANTE, '')}`);
  }

  // 4. La panchina: cosa avrebbe cambiato, per chi ha perso e per chi ha vinto.
  const panchina = (T, O, haVinto) => {
    let ref;
    try { ref = refertoTattico(T, O); } catch { return null; }
    const voci = ref.voci.filter((v) => !v.ininfluente);
    const errore = voci.filter((v) => !v.eraGiusta).sort((x, y) => y.quantoMeglio - x.quantoMeglio)[0];
    const colpo = voci.filter((v) => v.eraGiusta).sort((x, y) => y.valore - x.valore)[0];
    if (!haVinto) {
      if (errore && errore.quantoMeglio >= 0.5) {
        return tr(`Dalla panchina: a ${T.name} conveniva ${errore.migliore} come ${errore.etichetta.toLowerCase()} invece di ${errore.scelto}, ${segno(errore.quantoMeglio)} punti a partita.`,
          `From the bench: ${T.name} should have gone with ${errore.migliore} as ${errore.etichetta.toLowerCase()} instead of ${errore.scelto}, ${segno(errore.quantoMeglio)} points per game.`);
      }
      return tr(`Le scelte di ${T.name} erano quelle giuste: il problema era la rosa, non la panchina.`, `${T.name}'s choices were the right ones: the problem was the roster, not the bench.`);
    }
    if (colpo && colpo.valore >= 1) {
      return tr(`${T.name} ha azzeccato ${ARTICOLO[colpo.campo] || ''}${colpo.etichetta.toLowerCase()}: ${colpo.scelto} valeva ${segno(colpo.valore)} punti a partita rispetto a scegliere a caso.`,
        `${T.name} got ${ARTICOLO[colpo.campo] || ''}${colpo.etichetta.toLowerCase()} right: ${colpo.scelto} was worth ${segno(colpo.valore)} points per game compared to a random pick.`);
    }
    return null;
  };
  for (const r of [panchina(L, W, false), panchina(W, L, true)]) if (r) out.push(r);

  return out;
}
