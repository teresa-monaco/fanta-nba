// narrator.js — trasforma i numeri del motore in italiano cattivo.
//
// Regola di ferro, invariata: il narratore NON inventa nulla. Ogni battuta
// nasce da un fattore che il motore ha davvero calcolato o da una riga di box
// score reale. Il sarcasmo sta nel COME si dice, mai nel COSA: se il testo
// sfotte il tuo spacing, quel buco nello spacing esiste nei numeri.
//
// Tono: roasting. Si prende in giro la squadra, la scelta tattica e la
// prestazione in campo — mai la persona.

import { makeRng, hashStr } from './core.js';

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

/* ---------- Frasi per fattore ---------- */
// {T} = squadra, {O} = avversario, più i campi in data.

const FACTOR_LINES = {
  'fuori-ruolo': [
    '{T} schiera {names}: è come chiedere al pasticcere di rifare l\'impianto elettrico. Funziona finché non tocchi niente.',
    '{names}. Qualcuno in {T} sta facendo un mestiere che non ha mai fatto, e lo si capisce a ogni singolo possesso.',
    'In {T} c\'è chi gioca fuori ruolo ({names}) con l\'espressione di chi spera che nessuno se ne accorga. Se ne sono accorti tutti.',
  ],
  'no-spacing': [
    '{T} ha {shooters} tiratori veri: la difesa avversaria poteva parcheggiare un pullman in area e nessuno avrebbe protestato.',
    'Il campo di {T} è così stretto che i compagni si pestano i piedi a vicenda. Gli avversari difendono in quattro metri quadri e si annoiano.',
    '{T} attacca come se il tiro da tre non fosse ancora stato inventato. Nel 2026. Con questo roster.',
  ],
  'spacing-totale': [
    'Con {shooters} tiratori in campo {T} allarga la difesa fino a strapparla. Ogni chiusura lascia scoperto qualcun altro, e {T} lo trova sempre.',
    '{T} tiene quattro uomini oltre l\'arco: difendere diventa un esercizio di scelta fra quale disastro subire.',
  ],
  'no-playmaker': [
    'Il miglior passatore di {T} arriva a {best}. Tradotto: l\'attacco è una collezione di improvvisazioni, alcune involontarie.',
    'Nessuno in {T} sa organizzare niente. Quando il primo piano fallisce non c\'è un secondo piano, c\'è un tiro a caso.',
    '{T} gioca senza regia. Nei momenti duri la palla gira finché qualcuno, per stanchezza, tira.',
  ],
  'troppe-bocche': [
    'In {T} ci sono più giocatori che pretendono la palla di quanti palloni esistano. I palloni, ricordiamolo, sono uno.',
    '{T} ha comprato cinque prime opzioni e adesso deve spiegare a quattro di loro che non lo sono.',
    'Troppe stelle in {T}: ognuno aspetta il suo turno con la faccia di chi non ha nessuna intenzione di aspettarlo.',
  ],
  'ferro-scoperto': [
    'Il ferro di {T} è sorvegliato quanto una porta lasciata aperta. Si entra, si appoggia, si ringrazia.',
    'In area {T} offre servizio al tavolo. Gli avversari ordinano, {T} serve.',
    '{T} protegge il canestro con l\'entusiasmo di chi ha già finito il turno.',
  ],
  'anello-debole': [
    'Gli avversari hanno capito subito chi era il punto debole di {T} e hanno passato la serie ad attaccare {worst}.',
    '{T} ha una stella e poi il vuoto: {n} giocatori sotto il livello, e in campo ci vanno tutti e cinque.',
    'In {T} la difesa avversaria sceglie dove andare: sceglie {worst}, ogni volta.',
  ],
  'quintetto-piccolo': [
    '{T} è talmente piccola che a rimbalzo si organizza per collette.',
    'Il quintetto di {T} vince ogni sfida di velocità e perde tutto quello che si svolge sopra i tre metri.',
    'Sotto canestro {T} non difende: assiste.',
  ],
  'violino-sbagliato': [
    '{T} dà la palla a {chosen} mentre {best} guarda. Una scelta coraggiosa, nel senso peggiore del termine.',
    'La prima opzione di {T} è {chosen}. La prima opzione di {T} dovrebbe essere {best}. Queste due righe spiegano la serie.',
    'Qualcuno in {T} ha deciso che a segnare fosse {chosen}. Nessuno ha avuto il cuore di dirglielo.',
  ],
  'star-usage': [
    '{player} si prende tutto. Gli altri quattro sono in campo per ragioni prevalentemente decorative.',
    'Tutto passa da {player}: un piano eccellente finché funziona, e un problema serio trenta secondi dopo.',
    '{player} gioca, {T} guarda. Ogni tanto va bene così.',
  ],
  'star-contenuta': [
    'Difendere {T} è semplice: togli la palla a uno e gli altri quattro si mettono a studiare il parquet.',
    'Un attacco con una sola idea ha incontrato una difesa costruita apposta per quell\'idea. Indovinate com\'è finita.',
  ],
  'iso-talento': [
    'I due violini di {T} si creano il tiro da soli, il che è comodo, visto che nessun altro glielo creerebbe mai.',
    '{T} va di uno contro uno e vince col talento quello che non vince con le idee.',
  ],
  'iso-ritmo': [
    'L\'isolamento rallenta {T} al punto che la difesa avversaria ha il tempo di schierarsi, respirare e prendere appunti.',
  ],
  'pnr-coppia': [
    'Il pick and roll di {T} costringe la difesa a scegliere a ogni blocco. Tutte le scelte disponibili sono sbagliate.',
    'La coppia nel pick and roll di {T} produce vantaggi con la regolarità di un elettrodomestico.',
  ],
  'pnr-difesa-lenta': [
    'La difesa avversaria cambia sui blocchi con i tempi della burocrazia. {T} attacca esattamente lì.',
  ],
  'post-peso': [
    'In post {T} ha peso vero: la difesa deve raddoppiare, e raddoppiando si spacca da sola.',
    'Il lungo di {T} si è preso il pitturato e ha cambiato la serratura.',
  ],
  'post-muro': [
    '{T} ha scelto di attaccare il pitturato meglio protetto in campo. Complimenti per il coraggio, condoglianze per il risultato.',
    'Ogni tentativo in post di {T} finisce contro un muro. Non metaforicamente: proprio contro un muro.',
  ],
  'post-scarichi': [
    'Sul raddoppio {T} scarica fuori e i tiratori fanno il resto. Semplice, antico, letale.',
  ],
  'ferro-atletismo': [
    '{T} attacca il canestro senza sosta: falli, lunetta, difesa avversaria in bonus prima dell\'intervallo.',
  ],
  'ferro-muro': [
    '{T} torna indietro con più tiri respinti che canestri. A un certo punto smetti di provarci, ma {T} non ha smesso.',
  ],
  'tre-volume': [
    '{T} tira da tre finché la retina chiede pietà.',
    'Il perimetro di {T} obbliga a uscire su tutti. Uscire su tutti, con questa difesa, non è un\'opzione realistica.',
  ],
  'tr-atletismo': [
    '{T} corre ogni pallone recuperato e segna prima che gli altri abbiano finito di lamentarsi con l\'arbitro.',
  ],
  'tr-pesantezza': [
    'Il quintetto avversario è troppo pesante per stare dietro a {T}. Nel finale non correvano più: camminavano.',
  ],
  'motion-armonia': [
    'Il motion rimette ordine in {T}: la palla gira e nessuno resta fermo a covare rancore.',
  ],
  'motion-lettura': [
    'Tagli, letture, gioco senza palla: {T} trova tiri aperti senza doverli chiedere a nessuno in particolare.',
  ],
  'motion-un-creatore': [
    'Il motion di {T} è un gran movimento di palla che non porta da nessuna parte. Coreografia, non pallacanestro.',
  ],
  'df-lungo': [
    'Il lungo di {T} calamita la difesa e apre tutto il resto, spesso senza nemmeno toccare la palla.',
  ],
  'df-tiro': [
    'Quando la palla esce dal pitturato, i tiratori di {T} sono già lì che aspettano da un pezzo.',
  ],
  'df-incompleto': [
    'Il dentro-fuori di {T} funziona a metà, perché {T} ha comprato metà del meccanismo.',
  ],
  'ho-tiro': [
    'Le consegne liberano i tiratori di {T} in movimento, ed è lì che la difesa avversaria smette di esistere.',
  ],
  'ho-lettura': [
    'I lunghi di {T} leggono bene sulle consegne. Non capita spesso, godiamocelo.',
  ],
  'eq-solido': [
    '{T} non spaventa nessuno e non regala niente: la squadra più noiosa da guardare e la più scomoda da affrontare.',
  ],
  'rimbalzi': [
    '{T} vince i tabelloni con {diff} punti di scarto: gioca con due possessi in più a quarto mentre gli altri guardano il pallone salire.',
    'A rimbalzo {T} fa quello che vuole. Gli avversari partecipano in qualità di pubblico pagante.',
  ],
  'taglia': [
    '{T} è più grossa di {diff} gradini di stazza. In area non è una partita, è un sopruso.',
  ],
  'spacing-diff': [
    '{T} gioca con il campo aperto, gli altri in un corridoio. Stessa partita, due sport diversi.',
  ],
  'difesa-perimetro': [
    'Le guardie avversarie hanno passato la serie a cercare un varco contro {T}. Non c\'era.',
  ],
};

/* ---------- Aperture, per quanto è finita male ---------- */

const OPEN_BLOWOUT = [
  'Roba imbarazzante.',
  'Chiamiamola partita, se serve a farvi stare meglio.',
  'Finita durante il riscaldamento, il resto era burocrazia.',
  'In campo c\'era una squadra sola, e non è stato difficile capire quale.',
  'Hanno smesso di contare nel terzo quarto per pietà.',
  'Un allenamento a ranghi contrapposti, ma con una squadra sola.',
];
const OPEN_CONTROL = [
  'Mai in discussione, mai divertente.',
  'Gestita con la noia di chi sapeva già come finiva.',
  'Un controllo talmente tranquillo da risultare maleducato.',
  'Vantaggio preso, vantaggio amministrato, nessuno si è fatto male.',
  'Il classico +12 che sembra sempre +4 e non lo è mai stato.',
];
const OPEN_CLOSE = [
  'Equilibrio, finché qualcuno si è ricordato di saper giocare a pallacanestro.',
  'Sembrava una partita vera, poi il finale ha rimesso le cose al loro posto.',
  'Punto a punto per tre quarti, poi lo strappo di chi aveva più argomenti.',
  'Tirata, combattuta e alla fine decisa da chi era semplicemente meglio attrezzato.',
];
const OPEN_THRILLER = [
  'Decisa all\'ultimo possesso, come piace a chi non ha il cuore delicato.',
  'Un finale così bello che quasi dispiace per chi ha perso. Quasi.',
  'Poteva finire in entrambi i modi. È finita nel modo peggiore per uno dei due.',
  'Due punti di scarto e una notte insonne in omaggio.',
  'Si decide su un possesso, e il possesso va storto a uno solo dei due.',
  'Di quelle che si rivedono, se si ha il coraggio.',
];
const OPEN_OT = [
  'Supplementare, perché nessuno dei due era capace di chiuderla.',
  'Quaranta minuti non sono bastati a stabilire chi fosse meno peggio.',
  'Overtime: entrambe hanno fatto di tutto per perderla nei tempi regolamentari.',
];
const OPEN_2OT = [
  'Doppio supplementare. A un certo punto diventa accanimento.',
  'Due overtime: nessuna delle due voleva vincere, ma una ha dovuto.',
];

/* ---------- Chiusure sul perdente ---------- */

const LOSER_WITH_STAR = [
  'A {L} non basta un {p} da {n} punti, e fa quasi tenerezza.',
  '{p} ne mette {n} e {L} perde lo stesso: quando si dice sprecare una serata.',
  '{n} punti di {p} buttati nel cestino insieme al resto della prestazione di {L}.',
  '{p} fa la sua parte con {n} punti, gli altri quattro di {L} un po\' meno.',
  '{n} di {p}: a {L} serviva un secondo uomo, e non si è presentato.',
];
const LOSER_FLAT = [
  '{L} non ha mai trovato il possesso buono. Forse perché in rosa non ce l\'ha.',
  '{L} ha provato tutto. Tutto, in questo caso, era poco.',
  'Di {L} si ricorderà soprattutto il silenzio in panchina.',
  '{L} non è mai stata in partita, e verso metà terzo quarto ha smesso di fingere.',
  'A {L} è mancato tutto, a partire dalle idee.',
  '{L} ha giocato come se il risultato fosse già stato deciso altrove.',
];

/* ---------- Frasi intermedie: anche queste con varianti ---------- */

const PUNTI = [
  '{p} ne mette {n} per {T}',
  '{n} punti di {p} per {T}',
  '{p} chiude a quota {n} per {T}',
  '{T} si aggrappa ai {n} punti di {p}',
  '{T} passa con i {n} punti di {p}',
  '{p} timbra {n} punti e {T} ringrazia',
];
const ASSIST = [
  '{p} smista {n} assist',
  '{p} serve {n} assist a gente che non se li meritava',
  '{n} assist di {p}, con la palla che gira come si deve',
  '{p} apparecchia {n} volte',
  '{n} assist di {p}, che vede cose che gli altri non vedono',
];
const RIMBALZI = [
  '{p} prende {n} rimbalzi',
  '{p} si prende {n} rimbalzi senza trovare opposizione',
  '{n} rimbalzi di {p}, praticamente da solo',
  '{p} ripulisce i tabelloni: {n} rimbalzi',
  '{n} rimbalzi di {p}, che sotto canestro decide lui',
];

// Dentro una serie le varianti RUOTANO invece di essere pescate a caso:
// pescando, la stessa frase usciva tre volte su sette e si notava subito.
const ruota = (arr, n, off = 0) => arr[(n + off) % arr.length];

/* ---------- Cronaca di una singola gara ---------- */

export function narrateGame(A, B, g) {
  const aWon = g.scoreA > g.scoreB;
  const W = aWon ? A : B, L = aWon ? B : A;
  const wBox = aWon ? g.boxA : g.boxB;
  const lBox = aWon ? g.boxB : g.boxA;
  // Sfasamento stabile per serie: due serie diverse non partono dalla stessa frase.
  const off = hashStr(A.key + B.key + A.tactics.strategy) % 7;
  const n = g.n ?? 1;

  let opener;
  if (g.ot >= 2) opener = ruota(OPEN_2OT, n, off);
  else if (g.ot) opener = ruota(OPEN_OT, n, off);
  else if (g.margin >= 16) opener = ruota(OPEN_BLOWOUT, n, off);
  else if (g.margin >= 9) opener = ruota(OPEN_CONTROL, n, off);
  else if (g.margin >= 4) opener = ruota(OPEN_CLOSE, n, off);
  else opener = ruota(OPEN_THRILLER, n, off);

  const top = wBox.slice().sort((x, y) => y.pts - x.pts)[0];
  const topL = lBox.slice().sort((x, y) => y.pts - x.pts)[0];
  const dime = wBox.slice().sort((x, y) => y.ast - x.ast)[0];
  const glass = wBox.slice().sort((x, y) => y.reb - x.reb)[0];

  const riempi = (t, p, num) => t.replaceAll('{p}', p).replaceAll('{n}', String(num)).replaceAll('{T}', W.name);
  const bits = [riempi(ruota(PUNTI, n, off), top.n, top.pts)];
  if (dime.id !== top.id && dime.ast >= 7) bits.push(riempi(ruota(ASSIST, n, off + 1), dime.n, dime.ast));
  if (glass.id !== top.id && glass.reb >= 11) bits.push(riempi(ruota(RIMBALZI, n, off + 2), glass.n, glass.reb));
  const second = `${bits.join(', ')}.`;

  const third = topL.pts >= 28
    ? ruota(LOSER_WITH_STAR, n, off).replaceAll('{L}', L.name).replaceAll('{p}', topL.n).replaceAll('{n}', String(topL.pts))
    : ruota(LOSER_FLAT, n, off).replaceAll('{L}', L.name);

  return `${opener} ${second} ${third}`;
}

/* ---------- Perché ha vinto la serie ---------- */

export function explainSeries(A, B, series) {
  const winnerKey = series.winner;
  const W = winnerKey === A.key ? A : B;
  const rng = makeRng(`why-${A.key}-${B.key}-${series.wins.a}-${series.wins.b}`);

  // Un fattore conta a favore di chi ha vinto se è un suo vantaggio
  // o uno svantaggio dell'avversario.
  const scored = (series.matchup?.factors || []).map((f) => {
    const helpsWinner = (f.side === winnerKey && f.delta > 0) || (f.side !== winnerKey && f.delta < 0);
    return { ...f, weight: Math.abs(f.delta) * (helpsWinner ? 1 : 0.45), helpsWinner };
  })
    .filter((f) => Math.abs(f.delta) > 0.4 && !f.varianceOnly)
    .sort((x, y) => y.weight - x.weight);

  const rendi = (f) => {
    const pool = FACTOR_LINES[f.key];
    if (!pool) return null;
    const subject = f.side === A.key ? A : B;
    const other = f.side === A.key ? B : A;
    let line = pick(pool, rng).replaceAll('{T}', subject.name).replaceAll('{O}', other.name);
    for (const [k, v] of Object.entries(f.data || {})) {
      line = line.replaceAll(`{${k}}`, Array.isArray(v) ? v.join(', ') : String(v));
    }
    return line;
  };

  // Sotto il titolo "perche ha vinto X" possono stare SOLO i motivi che hanno
  // aiutato X. Prima ci finivano anche i vantaggi dello sconfitto e i difetti
  // del vincitore, senza avversativa: sembrava che il testo si contraddicesse.
  const out = [];
  const used = new Set();
  for (const f of scored.filter((x) => x.helpsWinner)) {
    if (out.length >= 4) break;
    if (used.has(f.key)) continue;
    const line = rendi(f);
    if (!line) continue;
    used.add(f.key);
    out.push(line);
  }

  // Un solo motivo CONTRARIO, e solo se marcato come tale: "ha vinto nonostante".
  // Detto cosi aggiunge, invece di contraddire.
  const contro = scored.find((x) => !x.helpsWinner && !used.has(x.key) && FACTOR_LINES[x.key] && Math.abs(x.delta) > 1.5);
  if (contro) {
    const line = rendi(contro);
    if (line) out.push(`${pick(['E ha vinto lo stesso:', 'Nonostante tutto questo:', 'Il bello è che non è bastato:'], rng)} ${line.charAt(0).toLowerCase()}${line.slice(1)}`);
  }

  if (!out.length) {
    out.push(pick([
      `${W.name} è più forte praticamente ovunque. Non serve una spiegazione tattica, serve un'asta migliore.`,
      `Nessun dettaglio da analizzare: ${W.name} ha semplicemente più giocatori bravi. Succede.`,
    ], rng));
  }
  return out;
}

/* ---------- Riga sintetica di un profilo squadra ---------- */

export function teamIdentity(T) {
  const tags = [];
  if (T.shooters >= 4) tags.push('spacing totale');
  else if (T.shooters <= 1) tags.push('campo chiuso');
  if (T.size >= 18) tags.push('quintetto pesante');
  else if (T.size <= 12) tags.push('small ball');
  if (T.rimProtect >= 85) tags.push('ferro blindato');
  else if (T.rimProtect < 55) tags.push('ferro scoperto');
  if (T.perimD >= 72) tags.push('difesa perimetrale d\'élite');
  if (T.playmaking >= 86) tags.push('regia di alto livello');
  else if (T.playmaking < 64) tags.push('poca regia');
  if (T.usageTotal > 390) tags.push('troppe stelle');
  return tags.length ? tags.join(' · ') : 'profilo equilibrato';
}
