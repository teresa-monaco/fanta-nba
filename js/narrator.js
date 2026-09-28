// narrator.js — trasforma i numeri del motore in italiano leggibile.
//
// Regola di ferro: il narratore NON inventa nulla. Ogni frase nasce da un
// fattore che il motore ha davvero calcolato o da una riga di box score reale.
// Se il testo dice "ha vinto a rimbalzo", il vantaggio a rimbalzo esiste nei dati.

import { makeRng } from './core.js';

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

/* ---------- Frasi per fattore ---------- */
// {T} = squadra, {O} = avversario, più i campi in data.

const FACTOR_LINES = {
  'fuori-ruolo': [
    'Il quintetto di {T} chiede a qualcuno di fare un mestiere che non è il suo ({names}), e in una serie lunga si paga.',
    '{T} manda in campo giocatori fuori posizione ({names}): ogni possesso costa un po\' più del dovuto.',
  ],
  'no-spacing': [
    'Il campo di {T} è chiuso: con {shooters} tiratori veri la difesa avversaria può affollare il pitturato senza rischi.',
    'Nessuno da rispettare oltre l\'arco per {T}, e il pitturato si intasa a ogni penetrazione.',
  ],
  'spacing-totale': [
    'Con {shooters} tiratori in campo {T} allarga la difesa fino a spezzarla: sempre una linea di passaggio aperta.',
    '{T} tiene quattro uomini oltre l\'arco e il ferro resta libero per chi taglia.',
  ],
  'no-playmaker': [
    'A {T} manca una mano che organizzi: il miglior passatore è a {best}, e nei momenti duri l\'attacco si blocca.',
    'Senza un vero regista {T} vive di iniziative individuali, e quando non entrano non c\'è un piano B.',
  ],
  'troppe-bocche': [
    'Troppe bocche da sfamare in {T}: il pallone è uno solo e qualcuno resta fermo a guardare.',
    'In {T} ci sono più giocatori che pretendono la palla di quanti possano averla, e il ritmo ne risente.',
  ],
  'ferro-scoperto': [
    'Il ferro di {T} è indifeso: chi arriva in area trova solo aria e appoggia.',
    'Nessun protettore del canestro in {T}, e ogni penetrazione avversaria diventa due punti facili.',
  ],
  'quintetto-piccolo': [
    '{T} è troppo piccolo: perde centimetri ovunque e paga sui secondi tiri.',
    'La taglia di {T} non regge l\'urto, e sotto canestro diventa un problema costante.',
  ],
  'violino-sbagliato': [
    'La palla va a {chosen} quando il miglior realizzatore in campo è {best}: {T} si toglie punti da sola.',
    '{T} costruisce su {chosen}, ma è {best} quello che segna con più facilità — una scelta che costa.',
  ],
  'star-usage': [
    '{player} prende in mano l\'attacco e lo porta dove vuole.',
    'Tutto passa da {player}, e finché regge il braccio {T} non ha bisogno di altro.',
  ],
  'star-contenuta': [
    'La difesa perimetrale avversaria toglie ossigeno alla prima opzione: {T} diventa prevedibile.',
    'Con un attacco che dipende da un solo uomo, {T} trova una difesa costruita apposta per fermarlo.',
  ],
  'iso-talento': [
    'I due violini di {T} si creano il tiro da soli, e questo tiene in piedi l\'attacco anche nelle serate storte.',
    '{T} va di uno contro uno e il talento individuale basta a produrre punti.',
  ],
  'iso-ritmo': [
    'L\'isolamento rallenta {T} e regala alla difesa avversaria il tempo di prepararsi.',
  ],
  'pnr-coppia': [
    'Il pick and roll di {T} funziona: ogni blocco costringe la difesa a scegliere, e ogni scelta è sbagliata.',
    'La coppia nel pick and roll di {T} produce vantaggio a ripetizione.',
  ],
  'pnr-difesa-lenta': [
    'La difesa avversaria è lenta nei cambi e {T} la attacca esattamente lì.',
  ],
  'post-peso': [
    'In post {T} ha peso vero: la difesa deve raddoppiare e il resto viene da sé.',
    'Il lungo di {T} impone il suo gioco spalle a canestro e detta i tempi.',
  ],
  'post-muro': [
    'Il post-up di {T} sbatte contro un ferro protetto: i tiri arrivano, ma contestati.',
    'Attaccare il pitturato avversario è la cosa più difficile che {T} potesse scegliere di fare.',
  ],
  'post-scarichi': [
    'Sui raddoppi {T} scarica fuori e i tiratori puniscono.',
  ],
  'ferro-atletismo': [
    '{T} attacca il canestro senza sosta: falli subiti, lunetta, difesa avversaria in bonus.',
  ],
  'ferro-muro': [
    'Il canestro avversario è presidiato e {T} torna indietro con troppi tiri respinti.',
  ],
  'tre-volume': [
    '{T} alza il volume da tre e quando la retina si apre il vantaggio scappa in pochi minuti.',
    'Il perimetro di {T} è una minaccia continua: la difesa non può concedere niente.',
  ],
  'tr-atletismo': [
    '{T} corre ogni pallone recuperato e trova canestri facili prima che la difesa si schieri.',
  ],
  'tr-pesantezza': [
    'Il quintetto avversario è troppo pesante per reggere il ritmo di {T}: nel finale le gambe cedono.',
  ],
  'motion-armonia': [
    'Il motion rimette ordine in {T}: la palla gira e nessuno resta fermo ad aspettare il suo turno.',
  ],
  'motion-lettura': [
    'Tagli, letture e gioco senza palla: {T} trova tiri aperti senza chiederli a nessuno in particolare.',
  ],
  'motion-un-creatore': [
    'Il motion di {T} gira a vuoto: con un solo creatore il movimento produce passaggi, non vantaggi.',
  ],
  'df-lungo': [
    'Il lungo di {T} calamita la difesa e apre tutto il resto.',
  ],
  'df-tiro': [
    'Quando la palla esce dal pitturato, i tiratori di {T} sono già pronti.',
  ],
  'df-incompleto': [
    'Il dentro-fuori di {T} funziona a metà: manca uno dei due pezzi del meccanismo.',
  ],
  'ho-tiro': [
    'Le consegne liberano i tiratori di {T} in movimento, ed è lì che nasce il vantaggio.',
  ],
  'ho-lettura': [
    'I lunghi di {T} leggono bene sulle consegne e il gioco scorre.',
  ],
  'eq-solido': [
    '{T} non ha un\'arma spaventosa, ma nemmeno un buco da attaccare: è un avversario scomodo per chiunque.',
  ],
  'rimbalzi': [
    '{T} domina i tabelloni (+{diff} di indice a rimbalzo) e si regala secondi tiri a volontà.',
    'Ogni tiro sbagliato tende a tornare nelle mani di {T}: a rimbalzo non c\'è partita.',
  ],
  'taglia': [
    '{T} è più grossa di {diff} gradini di stazza e lo fa pesare sotto canestro per tutta la serie.',
  ],
  'spacing-diff': [
    '{T} gioca con il campo molto più aperto, e la differenza si vede nella qualità dei tiri.',
  ],
  'difesa-perimetro': [
    'Sul perimetro {T} difende molto meglio, e le guardie avversarie faticano a trovare spazio.',
  ],
};

/* ---------- Cronaca di una singola gara ---------- */

const OPEN_BLOWOUT = [
  'Gara mai in discussione.',
  'Nessuna partita: chiusa prima dell\'ultimo quarto.',
  'Dominio dall\'inizio alla fine.',
];
const OPEN_CONTROL = [
  'Partita controllata, senza vera paura.',
  'Vantaggio costruito nel terzo quarto e amministrato.',
  'Gestione lucida dopo un avvio equilibrato.',
];
const OPEN_CLOSE = [
  'Partita in equilibrio fino agli ultimi possessi.',
  'Si decide tutto nel finale.',
  'Punto a punto per tre quarti, poi lo strappo decisivo.',
];
const OPEN_THRILLER = [
  'Finale al cardiopalma.',
  'Decisa all\'ultimo possesso.',
  'Una gara che poteva finire in entrambi i modi.',
];

export function narrateGame(A, B, g) {
  const rng = makeRng(`${A.key}-${B.key}-g${g.n}-${g.scoreA}-${g.scoreB}`);
  const aWon = g.scoreA > g.scoreB;
  const W = aWon ? A : B, L = aWon ? B : A;
  const wBox = aWon ? g.boxA : g.boxB;
  const lBox = aWon ? g.boxB : g.boxA;

  let opener;
  if (g.margin >= 16) opener = pick(OPEN_BLOWOUT, rng);
  else if (g.margin >= 9) opener = pick(OPEN_CONTROL, rng);
  else if (g.margin >= 4) opener = pick(OPEN_CLOSE, rng);
  else opener = pick(OPEN_THRILLER, rng);
  if (g.ot) opener = g.ot > 1 ? `Doppio supplementare.` : `Si va all'overtime.`;

  const top = wBox.slice().sort((x, y) => y.pts - x.pts)[0];
  const topL = lBox.slice().sort((x, y) => y.pts - x.pts)[0];
  const dime = wBox.slice().sort((x, y) => y.ast - x.ast)[0];
  const glass = wBox.slice().sort((x, y) => y.reb - x.reb)[0];

  const bits = [`${top.n} porta ${top.pts} punti a ${W.name}`];
  if (dime.id !== top.id && dime.ast >= 7) bits.push(`${dime.n} smista ${dime.ast} assist`);
  if (glass.id !== top.id && glass.reb >= 11) bits.push(`${glass.n} prende ${glass.reb} rimbalzi`);
  const second = `${bits.join(', ')}.`;

  const third = topL.pts >= 28
    ? `A ${L.name} non basta un ${topL.n} da ${topL.pts} punti.`
    : `${L.name} non trova mai il possesso che riapre la gara.`;

  return `${opener} ${second} ${third}`;
}

/* ---------- Perché ha vinto la serie ---------- */

export function explainSeries(A, B, series) {
  const winnerKey = series.winner;
  const W = winnerKey === A.key ? A : B;
  const L = winnerKey === A.key ? B : A;
  const rng = makeRng(`why-${A.key}-${B.key}-${series.wins.a}-${series.wins.b}`);

  // Un fattore conta a favore di chi ha vinto se è un suo vantaggio
  // o uno svantaggio dell'avversario.
  const scored = (series.matchup?.factors || []).map((f) => {
    const helpsWinner = (f.side === winnerKey && f.delta > 0) || (f.side !== winnerKey && f.delta < 0);
    return { ...f, weight: Math.abs(f.delta) * (helpsWinner ? 1 : 0.45), helpsWinner };
  })
    .filter((f) => Math.abs(f.delta) > 0.4 && !f.varianceOnly)
    .sort((x, y) => y.weight - x.weight);

  const out = [];
  const used = new Set();
  for (const f of scored) {
    if (out.length >= 5) break;
    if (used.has(f.key)) continue;
    const pool = FACTOR_LINES[f.key];
    if (!pool) continue;
    used.add(f.key);
    const subject = f.side === A.key ? A : B;
    const other = f.side === A.key ? B : A;
    let line = pick(pool, rng)
      .replaceAll('{T}', subject.name)
      .replaceAll('{O}', other.name);
    for (const [k, v] of Object.entries(f.data || {})) {
      line = line.replaceAll(`{${k}}`, Array.isArray(v) ? v.join(', ') : String(v));
    }
    out.push(line);
  }

  if (!out.length) out.push(`${W.name} è semplicemente più forte su quasi ogni voce: non serve cercare una spiegazione tattica.`);
  return out;
}

/* ---------- Riga sintetica di un profilo squadra ---------- */

export function teamIdentity(T) {
  const tags = [];
  if (T.shooters >= 4) tags.push('spacing totale');
  else if (T.shooters <= 1) tags.push('campo chiuso');
  if (T.size >= 18) tags.push('quintetto pesante');
  else if (T.size <= 12) tags.push('small ball');
  if (T.rimProtect >= 88) tags.push('ferro blindato');
  else if (T.rimProtect < 76) tags.push('ferro scoperto');
  if (T.perimD >= 82) tags.push('difesa perimetrale d\'élite');
  if (T.playmaking >= 86) tags.push('regia di alto livello');
  else if (T.playmaking < 72) tags.push('poca regia');
  if (T.usageTotal > 355) tags.push('troppe stelle');
  return tags.length ? tags.join(' · ') : 'profilo equilibrato';
}
