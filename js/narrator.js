// narrator.js — trasforma i numeri del motore in italiano cattivo.
//
// Regola di ferro, invariata: il narratore NON inventa nulla. Ogni battuta
// nasce da un fattore che il motore ha davvero calcolato o da una riga di box
// score reale. Il sarcasmo sta nel COME si dice, mai nel COSA: se il testo
// sfotte il tuo spacing, quel buco nello spacing esiste nei numeri.
//
// Tono: roasting senza freni, quello delle battute di gara 7 su Fabio. Si
// sfotte chi ha costruito e schierato la squadra (l'asta, le scelte, la
// panchina) per nome. Il limite resta il gioco: niente fuori dal tavolo.

import { makeRng, hashStr } from './core.js';
import { EN } from './lingua.js';
import * as ENG from './narrator-en.js';

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

/* ---------- Frasi per fattore ---------- */
// {T} = squadra, {O} = avversario, più i campi in data.

const FACTOR_LINES = EN ? ENG.FACTOR_LINES : {
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
    '{T} ha comprato cinque prime opzioni. Adesso qualcuno deve spiegare a quattro di loro che hanno sbagliato squadra.',
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
    '{T} è talmente piccola che a rimbalzo fa la colletta. E perde lo stesso.',
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
    '{player} gioca, {T} guarda. Quattro giocatori pagati per assistere a una partita.',
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
    'A rimbalzo {T} fa quello che vuole. Gli avversari assistono, paganti.',
  ],
  'taglia': [
    '{T} è più grossa di {diff} gradini di stazza. In area non è una partita, è bullismo.',
  ],
  'spacing-diff': [
    '{T} gioca con il campo aperto, gli altri in un corridoio. Stessa partita, due sport diversi.',
  ],
  'difesa-perimetro': [
    'Le guardie avversarie hanno passato la serie a cercare un varco contro {T}. Non c\'era.',
  ],
};

/* ---------- Aperture, per quanto è finita male ---------- */
// Da qui in giu si sfotte chi ha COSTRUITO e SCHIERATO la squadra: {W} e {L}
// sono i nomi di chi siede al tavolo. Il tono e quello di gara 7 su Fabio.

const OPEN_BLOWOUT = EN ? ENG.OPEN_BLOWOUT : [
  '{L} ha fatto l\'asta da sobrio? Le prove dicono di no.',
  'Massacro. {L} dirà che stava solo provando un quintetto. Lo dice ogni volta.',
  '{W} vince, {L} chiede il cambio di squadra a metà terzo quarto. Respinto.',
  'Finita al primo timeout. {L} è rimasto in campo solo per contratto.',
  'Qualcuno tolga la squadra a {L}: è un pericolo per sé e per gli altri.',
  'Non è una sconfitta, è una denuncia. Contro {L}, per come ha fatto l\'asta.',
  '{W} ha giocato a pallacanestro. {L} ha partecipato.',
  'A fine partita {L} ha chiesto di non essere citato. Troppo tardi.',
  'Partita chiusa nel riscaldamento. Il resto è stato accanimento su {L}, e se l\'è meritato.',
];
const OPEN_CONTROL = EN ? ENG.OPEN_CONTROL : [
  '{W} gestisce la partita con tutta la cura che {L} non ha messo nell\'asta.',
  'Mai in discussione. {L} ci ha creduto per quattro minuti, poi ha mollato con dignità. Senza dignità, in realtà.',
  '{W} in controllo dall\'inizio. {L} in controllo di niente, come al solito.',
  'Vittoria comoda di {W}. {L} si consola dicendo che "la squadra c\'è". Non c\'è.',
  '{W} la porta a casa senza sudare. {L} suda, ma per l\'imbarazzo.',
  'Partita mai aperta: {L} aveva sbagliato la chiave già all\'asta.',
];
const OPEN_CLOSE = EN ? ENG.OPEN_CLOSE : [
  'Equilibrio per tre quarti, poi {L} si è ricordato di essere {L}.',
  '{L} ci ha creduto davvero. È questo che fa tenerezza.',
  'Combattuta, finché {W} ha deciso di smettere di giocare col cibo.',
  'Per un attimo {L} è sembrato un general manager. Poi è passato.',
  'Partita vera fino al quarto quarto, quando la rosa di {L} si è mostrata per quello che è.',
];
const OPEN_THRILLER = EN ? ENG.OPEN_THRILLER : [
  'Decisa all\'ultimo possesso. {L} stanotte riguarda la partita e la rosa, e piange per entrambe.',
  'Due punti. Due. {L} li cercherà nei cassetti per anni.',
  'Finale da infarto: a {W} il batticuore, a {L} l\'infarto vero.',
  'Si decide su un possesso, e {L} come sempre lo mette in mano alla persona sbagliata.',
  '{W} vince di un soffio. {L} perde di un soffio, che detto così sembra un complimento. Non lo è.',
  'Bellissima, per chiunque non tifi {L}.',
];
const OPEN_OT = EN ? ENG.OPEN_OT : [
  'Supplementare: {L} non è riuscito a perderla nei tempi regolamentari e ha chiesto altri cinque minuti.',
  'Quaranta minuti non bastano a {L} per capire come si chiude una partita. Nemmeno quarantacinque, si scoprirà.',
  'Overtime. {W} e {L} hanno fatto di tutto per perderla, {L} con più talento.',
  'Un supplementare regalato dalla panchina di {L}, che in panchina proprio non ci sa stare.',
];
const OPEN_2OT = EN ? ENG.OPEN_2OT : [
  'Doppio supplementare. {L} voleva soffrire il più a lungo possibile, ed è stato accontentato.',
  'Cinquanta minuti per perdere una partita che {L} aveva già perso all\'asta.',
  'Due overtime: a un certo punto {L} ha smesso di allenare e ha cominciato a pregare. Non ha funzionato.',
];

/* ---------- Chiusure sul perdente ---------- */

const LOSER_WITH_STAR = EN ? ENG.LOSER_WITH_STAR : [
  '{p} ne mette {n} e {L} perde lo stesso: l\'unico acquisto giusto dell\'asta, circondato da quattro errori.',
  '{n} punti di {p}. {L} gli ha costruito attorno una squadra che non meritava nemmeno di guardarlo.',
  '{p} ne fa {n}. Gli altri quattro di {L} erano lì per le foto.',
  '{p} ne fa {n} e a fine partita chiede la cessione. Lontano da {L}, possibilmente.',
  '{n} punti di {p} sprecati da {L}, che ha un talento raro: rovinare quello degli altri.',
  'Un uomo solo e quattro comparse: {p} ne fa {n}, {L} perde e dà la colpa agli arbitri.',
  '{p} timbra {n} punti. {L} timbra il cartellino e torna a sbagliare aste.',
];
const LOSER_FLAT = EN ? ENG.LOSER_FLAT : [
  '{L} non ha mai trovato il possesso buono, perché all\'asta non l\'ha comprato.',
  'A {L} è mancato tutto, a partire da un general manager.',
  '{L} ha giocato come ha fatto l\'asta: male, ma con convinzione.',
  'Di {L} resteranno il silenzio in panchina e le risate in tribuna.',
  '{L} in campo c\'era. Purtroppo.',
  '{L} ha reso un servizio alla partita: qualcuno doveva perderla, e si è offerto volontario.',
  'La partita di {L} andrebbe studiata nei corsi per general manager, alla voce "cosa non fare".',
  '{L} perde e ha già pronta la scusa. È la stessa della gara prima.',
  'Qualcuno spieghi a {L} che il quintetto si sceglie con la testa, non tirando i dadi.',
];

/* ---------- Frasi intermedie: anche queste con varianti ---------- */

const PUNTI = EN ? ENG.PUNTI : [
  '{p} ne mette {n} per {T}',
  '{n} punti di {p} per {T}',
  '{p} chiude a quota {n} per {T}',
  '{T} si aggrappa ai {n} punti di {p}',
  '{T} passa con i {n} punti di {p}',
  '{p} timbra {n} punti e {T} ringrazia',
];
const ASSIST = EN ? ENG.ASSIST : [
  '{p} smista {n} assist',
  '{p} serve {n} assist a gente che non se li meritava',
  '{n} assist di {p}, con la palla che gira come si deve',
  '{p} apparecchia {n} volte',
  '{n} assist di {p}, che vede cose che gli altri non vedono',
];
const RIMBALZI = EN ? ENG.RIMBALZI : [
  '{p} prende {n} rimbalzi',
  '{p} si prende {n} rimbalzi senza trovare opposizione',
  '{n} rimbalzi di {p}, praticamente da solo',
  '{p} ripulisce i tabelloni: {n} rimbalzi',
  '{n} rimbalzi di {p}, che sotto canestro decide lui',
];

/* ---------- Gara 7: si insulta Fabio ---------- */
// Easter egg. Compare SOLO in gara 7, e Fabio non c'entra niente con la
// partita: e esattamente il motivo per cui fa ridere. Non toccare la
// condizione, altrimenti diventa una battuta come tutte le altre.

const FABIO = EN ? ENG.FABIO : [
  'A proposito di niente: Fabio è imbarazzante come GM.',
  'Comunque Fabio è ubriaco.',
  'Da segnalare che Fabio, pur non giocando, sta perdendo lo stesso.',
  'Gara 7. Fabio avrebbe già perso in gara 4.',
  'Una partita così Fabio non la capirebbe nemmeno se gliela spiegassero due volte.',
  'Nota a margine: Fabio ha sbagliato l\'asta. Sì, anche questa volta.',
  'Che poi, uno bravo come Fabio a gara 7 non ci arriva proprio.',
  'Gara 7 vera. Fabio guarda da casa, e anche da lì sta facendo scelte discutibili.',
  'Nel frattempo Fabio sta ancora cercando di capire cosa sia il secondo violino.',
  'Sette gare. A Fabio ne sarebbero bastate tre per fare danni.',
  'Fabio non è in questa partita. È l\'unica cosa che ha fatto bene finora.',
  'PS: Fabio è ancora un pessimo general manager. Volevamo ricordarlo.',
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
  opener = opener.replaceAll('{W}', W.name).replaceAll('{L}', L.name);

  const top = wBox.slice().sort((x, y) => y.pts - x.pts)[0];
  const topL = lBox.slice().sort((x, y) => y.pts - x.pts)[0];
  const dime = wBox.slice().sort((x, y) => y.ast - x.ast)[0];
  const glass = wBox.slice().sort((x, y) => y.reb - x.reb)[0];

  const riempi = (t, p, num) => t.replaceAll('{p}', p).replaceAll('{n}', String(num)).replaceAll('{T}', W.name);
  // Ogni pezzo della frase deve parlare di un giocatore DIVERSO: senza questo
  // controllo usciva "Sabonis apparecchia 11 volte, 20 rimbalzi di Sabonis".
  const citati = new Set([top.id]);
  const bits = [riempi(ruota(PUNTI, n, off), top.n, top.pts)];
  if (!citati.has(dime.id) && dime.ast >= 7) {
    citati.add(dime.id);
    bits.push(riempi(ruota(ASSIST, n, off + 1), dime.n, dime.ast));
  }
  if (!citati.has(glass.id) && glass.reb >= 11) {
    citati.add(glass.id);
    bits.push(riempi(ruota(RIMBALZI, n, off + 2), glass.n, glass.reb));
  }
  const second = `${bits.join(', ')}.`;

  const third = topL.pts >= 28
    ? ruota(LOSER_WITH_STAR, n, off).replaceAll('{L}', L.name).replaceAll('{p}', topL.n).replaceAll('{n}', String(topL.pts))
    : ruota(LOSER_FLAT, n, off).replaceAll('{L}', L.name);

  // Gara 7: il commento se la prende con Fabio, che con questa partita non
  // c'entra niente. E il punto.
  const fabio = n >= 7 ? ` ${ruota(FABIO, hashStr(g.scoreA + '-' + g.scoreB + A.key), off)}` : '';

  return `${opener} ${second} ${third}${fabio}`;
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
    if (line) out.push(`${pick(EN ? ENG.CONTRO : ['E ha vinto lo stesso:', 'Nonostante tutto questo:', 'Il bello è che non è bastato:'], rng)} ${line.charAt(0).toLowerCase()}${line.slice(1)}`);
  }

  if (!out.length) {
    out.push(pick(EN ? ENG.NESSUN_MOTIVO(W.name) : [
      `${W.name} è più forte ovunque. Non serve una spiegazione tattica, serve rifare l'asta.`,
      `Niente da analizzare: ${W.name} ha comprato i giocatori bravi, gli altri hanno comprato il resto.`,
      `${W.name} ha vinto perché è più forte. Tutto qui. Nessuna genialata, nessun alibi.`,
    ], rng));
  }
  return out;
}

/* ---------- Il referto: verdetto sulle scelte tecniche ---------- */

// Una riga sola sopra la tabella. Deve dire in mezzo secondo se hai allenato
// o hai tirato a caso, ed e il punto dove il gioco insegna qualcosa.
export function verdettoReferto(ref, haVinto) {
  const contate = ref.voci.filter((v) => !v.ininfluente);
  const giuste = contate.filter((v) => v.eraGiusta).length;
  const tot = contate.length;
  const guadagno = ref.voci.reduce((s, v) => s + v.valore, 0);
  const peggiore = ref.voci.slice().sort((a, b) => b.quantoMeglio - a.quantoMeglio)[0];

  const pt = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`;
  if (EN) return ENG.verdettoReferto(ref, haVinto, pt);

  // Prima i casi estremi, poi quelli specifici, e solo alla fine il grigio.
  // L'ordine conta: senza, un −1.3 finiva sotto "non ha inciso".
  if (tot === 0) {
    return 'Contro questa squadra qualunque scelta valeva l\'altra. Potevi anche non presentarti in panchina.';
  }
  if (giuste === tot) {
    return haVinto
      ? `${tot} scelte su ${tot} azzeccate, ${pt(guadagno)} punti a partita. Per una volta, complimenti.`
      : `Le scelte erano tutte giuste (${pt(guadagno)} a partita) e hai perso lo stesso. Il problema è la rosa, non la panchina.`;
  }
  if (guadagno <= -2.5) {
    return `${pt(guadagno)} punti a partita: una monetina avrebbe fatto meglio. `
      + `Il disastro è ${peggiore.etichetta.toLowerCase()}, dove ${peggiore.migliore} valeva ${pt(peggiore.quantoMeglio)}.`;
  }
  if (peggiore.quantoMeglio >= 1.5) {
    return `${pt(guadagno)} a partita, ma su ${peggiore.etichetta.toLowerCase()} hai proprio sbagliato: `
      + `con ${peggiore.migliore} erano ${pt(peggiore.quantoMeglio)} punti in più. Ogni singola partita.`;
  }
  if (guadagno >= 2.5) {
    return `Hai allenato davvero: ${giuste} scelte su ${tot} erano le migliori, ${pt(guadagno)} punti a partita rispetto a tirare a caso.`;
  }
  if (guadagno >= 1) {
    return `${pt(guadagno)} punti a partita. Niente di memorabile, ma almeno non ti sei fatto male da solo.`;
  }
  if (guadagno <= -1) {
    return `${pt(guadagno)} punti a partita rispetto a scegliere a caso. Hai allenato contro te stesso.`;
  }
  return `${pt(guadagno)} punti a partita: la panchina non ha inciso, né in un senso né nell'altro.`;
}

/* ---------- Riga sintetica di un profilo squadra ---------- */

export function teamIdentity(T) {
  const I = EN ? ENG.IDENTITA : null;
  const tags = [];
  if (T.shooters >= 4) tags.push(I ? I.spacing : 'spacing totale');
  else if (T.shooters <= 1) tags.push(I ? I.murato : 'campo murato');
  if (T.size >= 18) tags.push(I ? I.pesante : 'quintetto pesante');
  else if (T.size <= 12) tags.push(I ? I.small : 'small ball');
  if (T.rimProtect >= 85) tags.push(I ? I.blindato : 'ferro blindato');
  else if (T.rimProtect < 55) tags.push(I ? I.aperta : 'area a porte aperte');
  if (T.perimD >= 72) tags.push(I ? I.perimetro : 'difesa perimetrale d\'élite');
  if (T.playmaking >= 86) tags.push(I ? I.regia : 'regia di alto livello');
  else if (T.playmaking < 64) tags.push(I ? I.nessuno : 'nessuno che sappia passarla');
  if (T.usageTotal > 390) tags.push(I ? I.stelle : 'troppe stelle e un pallone solo');
  return tags.length ? tags.join(' · ') : (I ? I.anonimo : 'profilo equilibrato, cioè anonimo');
}
