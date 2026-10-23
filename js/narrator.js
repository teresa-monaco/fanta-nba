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

import { makeRng, hashStr, STRATEGIES } from './core.js';
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

/* ---------- La cronaca: roasting pesante ---------- */
// Si sfotte chi gioca al tavolo ({W} vince, {L} perde: sono i nomi di chi ha
// fatto l'asta) e il personaggio dei campioni in campo (Iverson e
// l'allenamento, Shaq e i liberi). Ogni battuta parte da un dato vero della
// gara: punteggio, chi ha segnato, chi ha scelto cosa. Mai fatti inventati.

const OPEN_BLOWOUT = EN ? ENG.OPEN_BLOWOUT : [
  '{W} vince di {m}. {L} ha costruito questa squadra in quaranta secondi d\'asta e si vede: anche un aspirapolvere ha più idee offensive.',
  '{L} perde di {m} e guarda il tabellone come se fosse colpa del tabellone.',
  'Più {m} per {W}. A {L} hanno chiesto un commento: ha risposto che stava provando un quintetto. Lo prova da tre serate.',
  '{W} di {m}. Qualcuno tolga la squadra a {L}: è un pericolo per sé e per gli altri.',
  'Finisce con {m} punti di scarto. {L} a metà partita ha chiesto il cambio di squadra. Respinto.',
  '{W} ha giocato a pallacanestro. {L} ha partecipato, e nemmeno tanto.',
];
const OPEN_CONTROL = EN ? ENG.OPEN_CONTROL : [
  '{W} la gestisce con tutta la cura che {L} non ha messo nell\'asta.',
  'Mai in discussione. {L} ci ha creduto per quattro minuti, poi ha mollato con dignità. Senza dignità, in realtà.',
  '{W} in controllo dall\'inizio. {L} in controllo di niente, come al solito.',
  'Vittoria comoda di {W}. {L} si consola dicendo che "la squadra c\'è". Non c\'è.',
  '{W} la porta a casa senza sudare. {L} suda, ma per l\'imbarazzo.',
];
const OPEN_CLOSE = EN ? ENG.OPEN_CLOSE : [
  'Equilibrio per tre quarti, poi {L} si è ricordato di essere {L}.',
  '{L} ci ha creduto davvero, ed è questo che fa tenerezza. {W} un po\' meno, ma ha vinto.',
  'Combattuta, finché {W} ha deciso di smettere di giocare col cibo.',
  'Per un attimo {L} è sembrato un general manager. Poi {W} ha segnato e l\'illusione è finita.',
];
const OPEN_THRILLER = EN ? ENG.OPEN_THRILLER : [
  'Decisa all\'ultimo possesso. {W} festeggia, {L} stanotte riguarda la partita e la rosa e piange per entrambe.',
  'Due punti. Due. {L} li cercherà nei cassetti per anni, mentre {W} li ha già spesi.',
  'Finale da infarto: a {W} il batticuore, a {L} l\'infarto vero.',
  'Si decide su un possesso, e {L} come sempre lo mette in mano alla persona sbagliata. {W} ringrazia.',
];
const OPEN_OT = EN ? ENG.OPEN_OT : [
  'Supplementare: nessuno dei due voleva vincerla. {L} perché non saprebbe cosa farsene, {W} perché ci è arrivato per sbaglio.',
  'Quaranta minuti non bastano a {L} per capire come si chiude una partita. Nemmeno quarantacinque: vince {W}.',
  'Overtime. {W} e {L} hanno fatto di tutto per perderla, {L} con più talento.',
];
const OPEN_2OT = EN ? ENG.OPEN_2OT : [
  'Doppio supplementare. {L} voleva soffrire il più a lungo possibile, ed è stato accontentato da {W}.',
  'Cinquanta minuti per perdere una partita che {L} aveva già perso all\'asta. Vince {W}, per sfinimento.',
];
const STELLA = EN ? ENG.STELLA : [
  '{p} ne mette {n} per {W}, che per una volta ha comprato qualcuno che sa giocare.',
  '{n} punti di {p}: {W} ha speso bene i crediti, e il mondo è ancora sotto shock.',
  '{p} ne fa {n} e {W} si prende i meriti. Come se l\'avesse allenato lui.',
  '{p} timbra {n} punti per {W}. Gli avversari lo marcavano come si marca un amico al bar: da lontano.',
  '{n} punti di {p}. {W} lo guarda segnare come si guarda un investimento azzeccato per sbaglio.',
];
const STELLA_PERDE = EN ? ENG.STELLA_PERDE : [
  '{p} ne mette {n} e {L} perde lo stesso: l\'unico acquisto giusto dell\'asta, circondato da quattro errori.',
  '{n} punti di {p}. {L} gli ha costruito attorno una squadra che non meritava nemmeno di guardarlo.',
  '{p} ne fa {n}. Gli altri quattro di {L} erano lì per le foto.',
  '{p} ne fa {n} e a fine partita chiede la cessione. Lontano da {L}, possibilmente.',
  'Un uomo solo e quattro comparse: {p} ne fa {n}, {L} perde e dà la colpa agli arbitri.',
];
const PERDE_PIATTO = EN ? ENG.PERDE_PIATTO : [
  '{L} non ha mai trovato il possesso buono, perché all\'asta non l\'ha comprato.',
  'A {L} è mancato tutto, a partire da un general manager.',
  '{L} ha giocato come ha fatto l\'asta: male, ma con convinzione.',
  'Di {L} resteranno il silenzio in panchina e le risate in tribuna.',
  '{L} in campo c\'era. Purtroppo.',
  'La partita di {L} andrebbe studiata nei corsi per general manager, alla voce "cosa non fare".',
  'Qualcuno spieghi a {L} che il quintetto si sceglie con la testa, non tirando i dadi.',
];
const ASSIST = EN ? ENG.ASSIST : [
  '{p} serve {n} assist a compagni che non li meritavano. Uno l\'ha scelto {L}... no, aspetta, è di {W}. Si nota lo stesso.',
  '{n} assist di {p}: vede passaggi che a {L} non verrebbero in mente nemmeno con la moviola.',
  '{p} apparecchia {n} volte. Gli altri mangiano, {L} guarda.',
];
const RIMBALZI = EN ? ENG.RIMBALZI : [
  '{p} prende {n} rimbalzi. {L} in tutta l\'asta ne ha presi meno, ma di decisioni giuste.',
  '{n} rimbalzi di {p}: sotto canestro ha messo il cartello "proprietà privata".',
  '{p} ripulisce i tabelloni: {n} rimbalzi. Quelli di {L} guardavano la palla salire, paganti.',
];
const VIOLINO = EN ? ENG.VIOLINO : [
  '{L} ha dato la palla a {v} come primo violino. Il migliore dei suoi è stato {p}: dettagli che un general manager nota. Non {L}.',
  'Primo violino di {L}: {v}. Il migliore in campo dei suoi: {p}. Due righe che spiegano la sconfitta meglio di un\'ora di analisi.',
];
const SCELTA = EN ? ENG.SCELTA : [
  '{L} aveva scelto "{s}". Coraggioso. Sbagliato, ma coraggioso.',
  'Il piano di {L} era "{s}". Il piano è durato fino alla palla a due.',
  '"{s}", diceva la lavagna di {L}. I giocatori non l\'hanno letta, ed è stato il loro momento migliore.',
];

// Le battute sul personaggio: scattano quando quel giocatore e il migliore
// della sua squadra. Gli altri prendono la battuta generica.
const PERSONA = EN ? ENG.PERSONA : {
  'Allen Iverson': {
    vince: [
      '{p} ne mette {n} per {W}, poi chiede se domani c\'è allenamento. Allenamento? Stiamo parlando di allenamento?',
      '{n} punti di {p} per {W}, quasi tutti presi da solo: passare la palla è roba da gente alta.',
    ],
    perde: [
      '{p} ne fa {n} e {L} perde lo stesso. Lui comunque all\'allenamento di domani non ci va.',
    ],
  },
  'Michael Jordan': {
    vince: [
      '{p} ne mette {n} per {W} e se la lega al dito lo stesso, anche se ha vinto.',
      '{n} punti di {p} per {W}. Qualcuno lo ha provocato nel riscaldamento: non provocate {p}.',
    ],
    perde: [
      '{p} ne fa {n} e perde. Ha guardato i compagni scelti da {L} con la faccia di chi se la lega al dito. {L}, preparati.',
    ],
  },
  'Kobe Bryant': {
    vince: [
      '{p} prende tiri come se fossero gratis: {n} punti per {W}, e per sbaglio anche un passaggio.',
    ],
    perde: [
      '{p} ne fa {n} con più tiri che compagni. {L} applaude lo stesso, perché di basket ne capisce quanto di aste.',
    ],
  },
  'Shaquille O\'Neal': {
    vince: [
      '{p} ne mette {n} per {W} senza mai allontanarsi più di un metro dal ferro. Ai tiri liberi però il palazzetto si copre gli occhi.',
    ],
    perde: [
      '{p} ne fa {n} e {L} perde: in lunetta ha deciso di fare beneficenza.',
    ],
  },
  'James Harden': {
    vince: [
      '{p} ne mette {n} per {W}, metà dalla lunetta: nessuno lo ha toccato davvero, ma l\'arbitro ha visto la sua faccia e ha avuto pietà.',
    ],
    perde: [
      '{p} ne fa {n} e {L} perde lo stesso. Ha chiesto un fallo anche sulla sirena finale.',
    ],
  },
  'Carmelo Anthony': {
    vince: [
      '{p} ne mette {n} per {W} e difende zero: almeno è coerente.',
    ],
    perde: [
      '{p} ne fa {n}, la difesa la lascia a casa. {L} ha speso i crediti per guardarlo marcare l\'aria.',
    ],
  },
  'Russell Westbrook': {
    vince: [
      '{p} chiude con {n} punti per {W} e la solita voglia di fare tutto da solo, anche le cose sbagliate.',
    ],
    perde: [
      '{p} ne mette {n}: statistiche bellissime per una squadra che ha perso. Come il curriculum di {L}.',
    ],
  },
  'Stephen Curry': {
    vince: [
      '{p} ne mette {n} per {W} e si gira prima che la palla entri. Maleducato, ma efficace.',
    ],
    perde: [
      '{p} ne fa {n} e perde: da solo non basta neanche lui, soprattutto con i compagni scelti da {L}.',
    ],
  },
  'LeBron James': {
    vince: [
      '{p} ne mette {n} per {W} e fa anche da general manager, visto che {W} ne avrebbe bisogno.',
    ],
    perde: [
      '{p} ne fa {n} e perde. Entro l\'estate chiederà la cessione. Lontano da {L}.',
    ],
  },
  'Kevin Durant': {
    vince: [
      '{p} ne mette {n} per {W} senza alzare lo sguardo, poi apre un profilo falso per farsi i complimenti da solo.',
    ],
    perde: [
      '{p} ne fa {n} e perde. Stanotte apre un profilo falso per difendere {L}. Sarà l\'unico.',
    ],
  },
  'Kawhi Leonard': {
    vince: [
      '{p} ne mette {n} per {W} senza cambiare espressione. Nessuno sa se sia contento. Nemmeno lui.',
    ],
    perde: [
      '{p} ne fa {n}, poi salta le prossime due per precauzione. {L} lo capisce: anche lui si risparmierebbe.',
    ],
  },
  'Giannis Antetokounmpo': {
    vince: [
      '{p} ne mette {n} per {W} arrivando al ferro in due passi da metà campo.',
    ],
    perde: [
      '{p} ne fa {n} e perde: ai liberi ci mette così tanto che {L} fa in tempo a sbagliare un\'altra asta.',
    ],
  },
  'Kareem Abdul-Jabbar': {
    vince: [
      '{p} ne mette {n} per {W} col gancio cielo: nessuno lo stoppa da cinquant\'anni.',
    ],
    perde: [
      '{p} ne fa {n} col gancio cielo e {L} perde: il gancio era bello, il resto della squadra no.',
    ],
  },
  'Hakeem Olajuwon': {
    vince: [
      '{p} ne mette {n} per {W} col Dream Shake: il suo difensore sta ancora girando su se stesso.',
    ],
    perde: [
      '{p} ne fa {n} e perde: i suoi compagni hanno fatto il Dream Shake anche in difesa, girando a vuoto.',
    ],
  },
  'Dirk Nowitzki': {
    vince: [
      '{p} ne mette {n} per {W} su una gamba sola. L\'altra la usa per prendere in giro chi lo marca.',
    ],
    perde: [
      '{p} ne fa {n} su una gamba. {L} perde su tutte e due.',
    ],
  },
  'Larry Bird': {
    vince: [
      '{p} ne mette {n} per {W}, e prima della palla a due aveva già detto agli avversari da dove avrebbe tirato.',
    ],
    perde: [
      '{p} ne fa {n} e perde, e adesso deve spiegare a tutti perché ha accettato di giocare per {L}.',
    ],
  },
  'Magic Johnson': {
    vince: [
      '{p} ne mette {n} per {W} sorridendo, che è il modo più umiliante di battere qualcuno.',
    ],
    perde: [
      '{p} ne fa {n} e sorride lo stesso. {L} un po\' meno.',
    ],
  },
  'Joel Embiid': {
    vince: [
      '{p} ne mette {n} per {W} ed è in dubbio per la prossima. Come sempre.',
    ],
    perde: [
      '{p} ne fa {n} e perde. Domani è in dubbio, come sempre, e {L} non sa più se sperarci.',
    ],
  },
  'Nikola Jokic': {
    vince: [
      '{p} ne mette {n} per {W} con la faccia di chi vorrebbe già essere alle corse dei cavalli.',
    ],
    perde: [
      '{p} ne fa {n} e perde. Non gliene importa niente: stasera ci sono i cavalli.',
    ],
  },
};

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

// Da tre a cinque frasi: apertura sul punteggio, il migliore di chi vince,
// chi perde; poi, quando c'e materia, una battuta su un dato (assist,
// rimbalzi, il violino sbagliato) e una sulla scelta tattica di chi perde.
// In gara 7 in fondo arriva Fabio.
export function narrateGame(A, B, g) {
  const aWon = g.scoreA > g.scoreB;
  const W = aWon ? A : B, L = aWon ? B : A;
  const wBox = aWon ? g.boxA : g.boxB;
  const lBox = aWon ? g.boxB : g.boxA;
  // Sfasamento stabile per serie: due serie diverse non partono dalla stessa frase.
  const off = hashStr(A.key + B.key + A.tactics.strategy) % 7;
  const n = g.n ?? 1;
  const riempi = (s, p = {}) => s.replaceAll('{W}', W.name).replaceAll('{L}', L.name)
    .replaceAll('{m}', String(g.margin)).replaceAll('{p}', p.n ?? '').replaceAll('{n}', String(p.num ?? ''))
    .replaceAll('{v}', p.v ?? '').replaceAll('{s}', p.s ?? '');

  let apri;
  if (g.ot >= 2) apri = OPEN_2OT;
  else if (g.ot) apri = OPEN_OT;
  else if (g.margin >= 16) apri = OPEN_BLOWOUT;
  else if (g.margin >= 9) apri = OPEN_CONTROL;
  else if (g.margin >= 4) apri = OPEN_CLOSE;
  else apri = OPEN_THRILLER;
  const frasi = [riempi(ruota(apri, n, off))];

  const top = wBox.slice().sort((x, y) => y.pts - x.pts)[0];
  const topL = lBox.slice().sort((x, y) => y.pts - x.pts)[0];
  const pv = PERSONA[top.n]?.vince;
  frasi.push(riempi(ruota(pv || STELLA, n, off), { n: top.n, num: top.pts }));

  const pp = PERSONA[topL.n]?.perde;
  frasi.push(topL.pts >= 28 || pp
    ? riempi(ruota(pp || STELLA_PERDE, n, off), { n: topL.n, num: topL.pts })
    : riempi(ruota(PERDE_PIATTO, n, off)));

  // Le battute in piu, solo se c'e il dato che le giustifica. Ogni giocatore
  // compare una volta sola: senza il controllo usciva "Sabonis apparecchia 11
  // volte, 20 rimbalzi di Sabonis".
  const citati = new Set([top.id, topL.id]);
  const extra = [];
  const dime = wBox.slice().sort((x, y) => y.ast - x.ast)[0];
  const glass = [...wBox, ...lBox].sort((x, y) => y.reb - x.reb)[0];
  if (dime.ast >= 10 && !citati.has(dime.id)) { citati.add(dime.id); extra.push(riempi(ruota(ASSIST, n, off + 1), { n: dime.n, num: dime.ast })); }
  else if (glass.reb >= 16 && !citati.has(glass.id)) { citati.add(glass.id); extra.push(riempi(ruota(RIMBALZI, n, off + 2), { n: glass.n, num: glass.reb })); }
  const v1 = L.five.find((p) => p.id === L.tactics.v1);
  if (v1 && v1.id !== topL.id && topL.pts - (lBox.find((x) => x.id === v1.id)?.pts ?? 0) >= 10) {
    extra.push(riempi(ruota(VIOLINO, n, off), { n: topL.n, v: v1.n }));
  }
  const nomeStrategia = STRATEGIES[L.tactics.strategy]?.label;
  if (nomeStrategia) extra.push(riempi(ruota(SCELTA, n, off + 3), { s: nomeStrategia }));

  // Quante in piu: zero, una o due, a seconda della gara (sempre la stessa
  // per la stessa gara, su ogni telefono). In gara 7 una sola: c'e Fabio.
  const quante = Math.min(extra.length, n >= 7 ? 1 : hashStr(g.scoreA + ':' + g.scoreB + W.key) % 3);
  frasi.push(...extra.slice(0, quante));

  // Gara 7: il commento se la prende con Fabio, che con questa partita non
  // c'entra niente. E il punto.
  if (n >= 7) frasi.push(ruota(FABIO, hashStr(g.scoreA + '-' + g.scoreB + A.key), off));
  return frasi.join(' ');
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
