// bot.js — giocatori finti, per quando siete in tre e volete giocare in
// quattro.
//
// COME FUNZIONANO. Un bot e una sedia occupata da nessuno. Li guida SOLO chi
// ospita, come gia succede per la chiusura dei lotti: se li guidassero tutti
// i device, quattro browser proverebbero a rilanciare per lo stesso bot.
//
// NON BARANO. Vedono esattamente quello che vedete voi — le rose altrui sono
// gia sullo schermo di tutti — e passano dagli stessi controlli: canBid, la
// regola di riserva, il tetto di spesa. Nessuna scorciatoia.
//
// SONO CINQUE E DIVERSI. Non per fare scena: cinque copie dello stesso bot
// ottimo renderebbero ogni asta identica. Nessuno dei cinque e il migliore
// in assoluto, ma nessuno e li solo per perdere.

import { db, allenatoriDi, hashStr, SLOTS, STRATEGIES, ROSTER_SIZE } from './core.js';
import { buildTeam, matchup, RITMI } from './engine.js';

/* ==========================================================
   Livello di sostituzione
   ==========================================================

   Per sapere quanto vale un giocatore PER QUESTA ROSA si completa la rosa con
   delle riserve e si guarda di quanto salgono attacco e difesa.

   Ci sono voluti tre tentativi.

   Il primo usava veri giocatori di fascia media, uno per ruolo. I piu
   preziosi risultavano tutti ala grande, e Jokic valeva PIU di prima se la
   rosa aveva gia Shaq: quella differenza non misurava il giocatore, misurava
   quale riempitivo gli capitava di sostituire.

   Il secondo usava UNA riserva sola, uguale in ogni ruolo, con gli attributi
   del decimo percentile di tutto il pool. Peggio: la protezione del ferro e
   una cosa da lunghi, quindi il decimo percentile su tutti i giocatori e il
   valore di una guardia. Quella riserva era un disastro sotto canestro in
   OGNI ruolo, e cosi qualunque centro — anche un 86 — sembrava salvare la
   squadra da un buco che nella realta non esiste: il quinto uomo e comunque
   un 85 vero. Risultato: nove dei primi quindici erano centri, e Brad
   Daugherty valeva quanto Michael Jordan.

   Il terzo dava a ogni ruolo una riserva con gli attributi MEDIANI dei
   giocatori di quel ruolo. Sembra giusto e non lo e: un giocatore che ha la
   mediana in TUTTO non ha punti deboli, e quindi e sopra la media vera —
   misurato, solo 14 guardie su 42 lo battevano su piu di meta attributi. E
   puniva i giocatori spigolosi: Wade, +12 in realizzazione e +34 in
   atletismo ma -47 nel tiro da tre, finiva 177esimo su 225.

   Il quarto, questo: si usano GIOCATORI VERI di fascia media, e se ne
   provano tre per ruolo mediando i risultati. Veri, quindi con i loro buchi;
   tre, perche uno solo porta le proprie stranezze nel confronto — ed era
   esattamente l'errore del primo tentativo. */

const ATTR = ['sco', 'tre', 'pla', 'reb', 'dif', 'dpe', 'atl', 'usg'];
const QUANTE_RISERVE = 3;
let riserveMesse = false;
let riserve = [];   // QUANTE_RISERVE squadre di riserve, una per confronto

export function installaRiserve() {
  const D = db();
  if (riserveMesse) return;
  // Attorno alla meta della classifica per ruolo: chi prenderesti davvero se
  // non comprassi niente di meglio.
  const PERC = [0.40, 0.50, 0.60];
  riserve = PERC.map((pc) => {
    const set = {};
    for (const sl of SLOTS) {
      const delRuolo = D.players.filter((p) => p.pos === sl).sort((a, b) => a.ovr - b.ovr);
      set[sl] = delRuolo[Math.floor(delRuolo.length * pc)]?.id || delRuolo[0]?.id;
    }
    return set;
  });
  riserveMesse = true;
}

// Disposizione provvisoria, la stessa che usa la schermata d'asta.
function disponi(ids) {
  const D = db();
  const out = Object.fromEntries(SLOTS.map((sl) => [sl, null]));
  const ps = (ids || []).map((id) => D.byId[id]).filter(Boolean);
  const resto = [];
  for (const p of ps) { if (!out[p.pos]) out[p.pos] = p.id; else resto.push(p); }
  const ancora = [];
  for (const p of resto) {
    const alt = (p.alt || []).find((sl) => !out[sl]);
    if (alt) out[alt] = p.id; else ancora.push(p);
  }
  for (const p of ancora) {
    const libero = SLOTS.find((sl) => !out[sl]);
    if (libero) out[libero] = p.id;
  }
  return out;
}

// Forza della rosa completata con UNA delle squadre di riserve.
function forzaCon(ids, set) {
  const D = db();
  const lu = disponi(ids);
  const usati = new Set(ids);
  for (const sl of SLOTS) {
    if (lu[sl]) continue;
    // Se la riserva di quel ruolo e gia in rosa (capita: sono giocatori
    // veri) se ne prende un'altra qualunque libera, o il confronto salta.
    let r = set[sl];
    if (!r || usati.has(r)) {
      r = D.players.find((p) => p.pos === sl && !usati.has(p.id))?.id;
    }
    if (!r) return null;
    lu[sl] = r;
    usati.add(r);
  }
  const ord = Object.values(lu).map((id) => D.byId[id]).sort((a, b) => b.attrs.sco - a.attrs.sco);
  try {
    const T = buildTeam('t1', lu, {
      v1: ord[0].id, v2: ord[1].id, strategy: 'equilibrato', ritmo: 'medio', coach: null,
    });
    return T.off + T.def;
  } catch { return null; }
}

// Media su tutte le squadre di riserve: una sola porterebbe le proprie
// stranezze dentro il confronto.
export function forzaRosa(ids) {
  installaRiserve();
  let somma = 0, n = 0;
  for (const set of riserve) {
    const f = forzaCon(ids, set);
    if (f !== null) { somma += f; n++; }
  }
  return n ? somma / n : 0;
}

// Chi puo giocare piu ruoli vale di piu, e il confronto su una rosa vuota da
// solo non lo vede: li ognuno prende la sua posizione naturale. Ma LeBron che
// fa SF, PF e PG riempie qualunque buco tu abbia, mentre uno da un ruolo solo
// lo riempie se ti serve e altrimenti ti costringe a spostare un altro.
// Il peso e piccolo di proposito: la versatilita e un di piu, non il motivo
// per cui compri un giocatore.
const BONUS_RUOLO = 0.9;

export function valorePer(rosa, id) {
  if (rosa.includes(id)) return -999;
  const D = db();
  const p = D.byId[id];
  const base = forzaRosa([...rosa, id]) - forzaRosa(rosa);
  const ruoli = 1 + ((p?.alt || []).length);
  return base + (ruoli - 1) * BONUS_RUOLO;
}

/* ==========================================================
   Le quattro teste
   ==========================================================

   Tutte e quattro ragionano allo stesso modo: stessa valutazione dei
   giocatori, stessa ricerca della tattica. Quello che cambia e il CARATTERE —
   quanto concentrano i soldi sui primi, se li spendono presto o tardi, quanto
   rischiano quando scelgono come giocare.

   E' un cambio, non la prima stesura. Prima calcolava solo Ada e gli altri
   tre andavano a formule grezze sull'overall. Misurato in bot-arena: Ada
   vinceva il 90% contro gli avversari simulati, Bruno il 69%, Dino il 64%,
   Cleo il 53% — e Cleo chiudeva l'asta con 45 crediti su 50 ancora in tasca.
   Non erano tre avversari diversi, erano tre modi di perdere.

   Perche differenziarli sul carattere e non sulla bravura: se due bot
   valutassero i giocatori in modo diverso, uno dei due li valuterebbe male —
   il valore di un giocatore per una rosa e una cosa sola. Sul prezzo e sul
   momento invece si puo davvero non essere d'accordo, e li nascono rose
   diverse da teste ugualmente competenti. */

// curva     quanto si concentra la spesa sui migliori, per fasce di rango:
//           [oltre il 95%, oltre l'85%, oltre il 70%, oltre il 45%, il resto]
// spinta    moltiplicatore secco sul tetto
// fretta    sopra 1 paga di piu a rosa vuota, sotto 1 tiene i soldi per dopo
// prudenza  in tattica: 0 guarda solo la media, 1 solo il caso peggiore
// gusti     preferenza a parita di conti, per non sembrare tutti lo stesso
const TRATTI = {
  ada: {
    curva: [2.6, 1.9, 1.3, 0.70, 0.25], spinta: 1.50, fretta: 1.00, prudenza: 0.50,
    gusti: {},
  },
  // La spinta e il totale, la curva e come lo distribuisce: sono due cose
  // diverse e all'inizio le avevo confuse. Bruno con la curva ripida E la
  // spinta alta spendeva 43 crediti su 50 e finiva con la rosa peggiore dei
  // quattro. Adesso resta il cacciatore di stelle — concentra quasi tutto sui
  // primi — ma proprio per questo deve avere meno da spendere.
  bruno: {
    curva: [3.4, 2.3, 1.05, 0.45, 0.18], spinta: 1.35, fretta: 1.15, prudenza: 0.20,
    gusti: { strategy: 'palla-star', ritmo: 'veloce' },
  },
  cleo: {
    curva: [1.9, 1.6, 1.30, 0.95, 0.45], spinta: 1.38, fretta: 0.85, prudenza: 0.80,
    gusti: { strategy: 'equilibrato', ritmo: 'lento' },
  },
  dino: {
    curva: [2.8, 2.05, 1.20, 0.60, 0.28], spinta: 1.52, fretta: 1.15, prudenza: 0.30,
    gusti: { strategy: 'transizione', ritmo: 'run-gun' },
  },
  // Il quinto non doveva somigliare a nessuno dei quattro. Lascia perdere i
  // fuoriclasse — sulla fascia altissima ha la curva piu bassa del gruppo —
  // e punta forte sulla seconda: quelli che costano meta e valgono quasi
  // uguale. Chi compra i nomi grossi gli lascia il campo libero proprio li.
  enzo: {
    curva: [1.3, 2.7, 1.70, 0.75, 0.30], spinta: 1.50, fretta: 0.95, prudenza: 0.60,
    gusti: { strategy: 'motion', ritmo: 'medio' },
  },
};

// Fino a quanto sale questo bot su questo giocatore. Il resto — riserva,
// slot, validita dell'offerta — lo impone lo stato, non il bot.
//
// I CREDITI SI SPALMANO SUI LOTTI CONTESI, NON SUGLI SLOT.
//
// La prima versione divideva la cassa per gli slot da riempire e finiva
// l'asta con 28 crediti su 50 in tasca, avendo lasciato un 96 a undici e un
// 89 a dieci. Sbagliava due cose insieme.
//
// La prima: quando l'avversario ha riempito la rosa, tutto quello che resta
// costa 1. Quindi i crediti non vanno divisi per i MIEI slot, ma per i lotti
// in cui qualcuno mi contendera ancora il giocatore. Gli ultimi posti si
// riempiono con gli avanzi, e vanno preventivati a 1.
//
// La seconda: misurava il valore come rapporto con la mediana. Ma i valori
// sono compresi fra 13 e 56 con mediana 31, quindi un 96 usciva "appena sopra
// la media" e il moltiplicatore restava a 1.1. Il rango fra i giocatori
// ancora liberi separa molto meglio il fuoriclasse dal riempitivo.
function tettoRagionato(st, k, pid, S, tr) {
  const D = db();
  const t = st.teams[k];
  const liberi = ROSTER_SIZE - t.roster.length;
  const max = S.maxBid(st, k);
  if (liberi <= 0 || max < 1) return 0;
  const v = valorePer(t.roster, pid);
  if (v <= 0) return Math.min(max, 1);

  const presi = new Set(S.attive(st).flatMap((x) => st.teams[x].roster));
  const restanti = D.players.filter((p) => !presi.has(p.id));
  const passo = Math.max(1, Math.ceil(restanti.length / 60));
  const valori = restanti.filter((_, i) => i % passo === 0)
    .map((p) => valorePer(t.roster, p.id)).sort((a, b) => a - b);
  const perc = valori.length ? valori.filter((x) => x < v).length / valori.length : 0.5;

  // Quanti lotti mi verranno ancora contesi: non piu di quanti slot restano
  // agli altri, e non piu dei miei. Oltre quelli si compra a 1.
  const slotAltrui = S.attive(st).filter((x) => x !== k)
    .reduce((a, x) => a + Math.max(0, ROSTER_SIZE - st.teams[x].roster.length), 0);
  const contesi = Math.max(1, Math.min(liberi, slotAltrui));
  const quota = max / contesi;

  const fascia = perc >= 0.95 ? 0 : perc >= 0.85 ? 1 : perc >= 0.70 ? 2 : perc >= 0.45 ? 3 : 4;
  const peso = tr.curva[fascia];

  // Presto o tardi. Chi ha fretta paga sopra la propria quota finche la rosa
  // e vuota e si accontenta in fondo; chi ha pazienza fa il contrario e
  // aspetta che gli altri restino senza cassa. A meta asta l'esponente e zero
  // e la fretta non conta: cambia QUANDO escono i soldi, non quanti.
  //
  // VALE SOLO SUI GIOCATORI CHE CONTANO, e la seconda stesura. Applicandola a
  // tutti, Dino pagava il premio da fretta su chiunque capitasse a inizio
  // asta — e l'ordine dei lotti e casuale, quindi era un premio pagato a caso.
  // Misurato: spendeva 39 crediti su 50, piu di tutti, e si ritrovava il
  // fuoriclasse piu scarso dei quattro (93.0 contro 94.6). Legata alla fascia
  // alta, "svuota la cassa subito" vuol dire quello che promette: si butta sul
  // primo fenomeno che passa, invece di buttarsi sul primo nome che passa.
  const fase = liberi / ROSTER_SIZE;            // 1 all'inizio, 0.2 in fondo
  const quando = fascia <= 2 ? Math.pow(tr.fretta, fase * 2 - 1) : 1;

  let tetto = Math.round(quota * peso * tr.spinta * quando);

  // I CREDITI CHE RESTANO IN TASCA A FINE ASTA NON VALGONO NIENTE, e piu ci
  // si avvicina alla fine piu la cosa pesa. Su un giocatore che vale davvero
  // si sale verso il massimo; su un riempitivo no, o sarebbe solo un modo
  // elaborato di buttare la cassa.
  const avidita = 1 - (liberi - 1) / (ROSTER_SIZE - 1);      // 0 a rosa vuota, 1 sull'ultimo posto
  const merita = Math.max(0, (perc - 0.45) / 0.55);          // 0 sotto la media, 1 in cima
  tetto = Math.round(tetto + (max - tetto) * avidita * merita);

  if (slotAltrui === 0) {
    // Nessuno me lo contende piu: tutto costa 1, pagare di piu e regalare.
    tetto = Math.min(max, 1);
  } else if (liberi === 1) {
    // L'ULTIMO POSTO SI ASPETTA, POI SI DA TUTTO.
    //
    // Prima qui il tetto era sempre il massimo, il che sembra giusto e non
    // lo e: con il tetto al massimo il bot offriva un credito sul PRIMO
    // giocatore che passava, se lo aggiudicava perche nessuno lo voleva, e
    // chiudeva l'asta con venti crediti in mano e un riempitivo in quintetto.
    // Una persona fa il contrario: tiene il posto libero finche non esce
    // quello giusto, e a quel punto spinge fino in fondo perche i crediti
    // risparmiati non se li porta da nessuna parte.
    //
    // Aspettare non costa quasi niente: i giocatori liberi sono centinaia e i
    // lotti continuano finche tutte le rose non sono piene. Si diventa di
    // bocca buona solo quando agli altri restano pochi posti, cioe quando
    // l'asta sta per chiudersi davvero.
    const esigente = slotAltrui > 2 ? 0.70 : 0;
    tetto = perc >= esigente ? max : 0;
  }
  return Math.max(0, Math.min(max, tetto));
}

// `attesa` e il tempo di reazione, in millisecondi: minimo quando il prezzo
// e ancora basso, massimo quando si e sul proprio limite.
//
// LE QUATTRO FORCHETTE SI SOMIGLIANO DI PROPOSITO. Da quando i bot ci
// ripensano a ogni rilancio, chi reagisce prima ha piu occasioni di
// rilanciare dentro gli stessi quindici secondi: il tempo di reazione era
// diventato un vantaggio competitivo. Misurato con le forchette larghe di
// prima (Dino 300-1100 contro Cleo 1800-3400), nel torneo a quattro Dino
// faceva 53 titoli su 120 e Cleo 12, con la quota equa a 30. I riflessi non
// devono decidere chi vince: le differenze stanno nei prezzi e nelle
// tattiche. Restano appena diverse solo perche entrino scaglionati.
function creaBot(id, nome, stile, attesa) {
  const tr = TRATTI[id];
  return { nome, stile, tr, attesa, tetto: (st, k, pid, S) => tettoRagionato(st, k, pid, S, tr) };
}

export const BOT = {
  ada: creaBot('ada', 'Ada', 'non sbaglia un prezzo e non si affeziona a nessuno', [700, 2400]),
  bruno: creaBot('bruno', 'Bruno', 'punta tutto su due fuoriclasse e riempie con gli avanzi', [600, 2100]),
  cleo: creaBot('cleo', 'Cleo', 'spende poco su tanti e aspetta che finiate i crediti', [800, 2600]),
  dino: creaBot('dino', 'Dino', 'svuota la cassa subito, prima che ci pensiate voi', [550, 2000]),
  enzo: creaBot('enzo', 'Enzo', 'vi lascia i fuoriclasse e si prende tutti i secondi', [700, 2300]),
};

export const ID_BOT = Object.keys(BOT);
export const uidBot = (k) => `bot:${k}`;
export const eBot = (uid) => String(uid || '').startsWith('bot:');

// Quale bot si siede adesso: uno a caso fra quelli ancora liberi.
//
// L'ORDINE ERA LEGATO AL SEME DELLA PARTITA, e sembrava abbastanza. Non lo
// era: dentro una stanza il seme non cambia mai, quindi chi rigioca sempre
// nello stesso codice si ritrovava sempre lo stesso avversario. In tre, con
// un bot solo aggiunto, voleva dire giocare ogni volta contro la stessa
// testa.
//
// Il caso qui e lecito perche il risultato si SALVA nello stato: non viene
// ricalcolato da nessuna parte, quindi non tocca la regola per cui la
// partita si rigioca identica dal seme. `rnd` serve solo ai test.
export function prossimoBot(st, rnd) {
  const usati = new Set(Object.values(st.bots || {}));
  const liberi = ID_BOT.filter((b) => !usati.has(b));
  if (!liberi.length) return null;   // finiti
  const r = typeof rnd === 'function' ? rnd() : Math.random();
  return liberi[Math.min(liberi.length - 1, Math.floor(r * liberi.length))];
}

/* ==========================================================
   Quanto offre, adesso
   ========================================================== */

// Quanto ci pensa prima di rispondere a questa cifra.
//
// SI RIPENSA A OGNI RILANCIO, non una volta per lotto. Prima ogni bot si
// svegliava una volta sola e da li in poi rilanciava a ogni istante fino al
// proprio limite: si buttavano tutti dentro nei primi secondi, il prezzo
// schizzava in un lampo e poi per dieci secondi non succedeva piu niente.
// Sembravano quattro macchine, perche lo erano.
//
// E si rallenta avvicinandosi al proprio limite. Rilanciare da 3 a 4 non
// costa pensiero; decidere se andare a 28 quando ti fermeresti a 30 si.
// L'esitazione sul finale e la cosa che rende la salita credibile.
function pensata(bot, quanto, tetto) {
  const [min, max] = bot.attesa;
  const vicino = tetto > 0 ? Math.min(1, quanto / tetto) : 1;
  const base = min + (max - min) * vicino;
  return base * (0.55 + Math.random() * 0.9);
}

// UNA SOLA DECISIONE SUL LOTTO, letta sia da chi offre sia da chi vota.
//
// Prima erano due, prese in due posti diversi, e si contraddicevano: con il
// tetto a 1 il bot offriva 1 (perche 1 >= 1) e insieme votava per saltare
// (perche il tetto era al minimo). Visto giocando: qualcuno punta nel primo
// secondo e subito dopo vota skip. Oltre a essere assurdo da guardare e
// sfruttabile — basta lasciarglielo a 1 e si ritrova in rosa un giocatore
// che aveva appena dichiarato di non volere.
//
// Adesso: se il tetto e al minimo il giocatore non lo vuole, e allora non
// offre affatto. L'unica eccezione e l'ultimo posto da riempire, dove
// chiunque e meglio di un buco: li non si salta e si compra.
function giudizio(st, k, S, memoria, pid) {
  const bot = BOT[st.bots?.[k]];
  const m = memoria[k] || (memoria[k] = {});
  if (m.lotto !== st.auction.idx) {
    m.lotto = st.auction.idx;
    // Il tetto si calcola una volta per lotto: per Ada sono un centinaio di
    // simulazioni, e non cambia mentre si rilancia.
    m.tetto = bot.tetto(st, k, pid, S);
    m.visto = -1;
    m.prossima = 0;
  }
  m.salta = m.tetto <= 1 && S.slotsLeft(st, k) > 1;
  // L'affondo: ultimo posto libero, giocatore voluto, e cassa da spendere.
  // Vedi offerta() per il perche non si sale un credito alla volta.
  m.affondo = S.slotsLeft(st, k) === 1 && m.tetto >= S.maxBid(st, k) && S.maxBid(st, k) > 3;
  return m;
}

// Ritorna l'importo da offrire, o null se questo bot per ora sta fermo.
// `momento` e un timestamp locale di chi ospita.
export function offerta(st, k, S, momento, memoria) {
  const bot = BOT[st.bots?.[k]];
  if (!bot || st.phase !== 'auction') return null;
  const a = st.auction;
  if (!a.running || a.paused) return null;
  const pid = S.currentPlayerId(st);
  if (!pid || S.slotsLeft(st, k) <= 0) return null;

  const cur = a.bid;
  if (cur && cur.team === k) return null;          // non si rilancia su se stessi
  const minimo = cur ? cur.amount + 1 : 1;

  // La pallina si sta ancora aprendo: nessuno ha visto chi e. Un bot che
  // offre prima che la scheda sia scoperta e un bot che bara.
  if (S.inRivelazione?.(st, momento)) return null;

  const m = giudizio(st, k, S, memoria, pid);
  if (m.salta) return null;                        // non lo vuole: non ci prova nemmeno
  if (m.tetto < minimo) return null;

  // Il prezzo si e mosso: si ricomincia a pensare da capo. Vale anche per il
  // primo sguardo al lotto, dove il prezzo passa da -1 a 0.
  const prezzo = cur ? cur.amount : 0;
  if (m.visto !== prezzo) {
    m.visto = prezzo;
    m.prossima = momento + pensata(bot, minimo, m.tetto);
  }
  if (momento < m.prossima) return null;

  // L'AFFONDO SULL'ULTIMO POSTO. Una volta sola per lotto, e solo qui.
  //
  // In un'asta al rialzo si paga quello che serve, non il proprio tetto: col
  // tetto al massimo ma offrendo un credito alla volta, il bot si aggiudicava
  // l'ultimo giocatore a 1 e chiudeva con venti crediti in mano. Tenerli non
  // serve a niente — non c'e nessun altro posto da riempire — mentre salire
  // un credito alla volta lascia aperta la porta a chi rilancia all'ultimo
  // secondo. Quindi si mette subito quasi tutto: costa zero e chiude la
  // questione. E' anche il motivo per cui ogni tanto un fuoriclasse va via a
  // ventiquattro quando ne valeva quindici.
  if (m.affondo && !m.affondato) {
    m.affondato = true;
    const max = S.maxBid(st, k);
    const secco = Math.max(minimo, Math.round(max * (0.82 + Math.random() * 0.18)));
    if (S.canBid(st, k, secco)) return secco;
  }
  return S.canBid(st, k, minimo) ? minimo : null;
}

// Un bot vota per saltare quando il giocatore non gli interessa davvero:
// il suo tetto e al minimo. Senza questo il tavolo non raggiungerebbe mai
// l'unanimita con dei bot in partita, e ogni lotto finirebbe assegnato
// d'ufficio a qualcuno.
export function vuoleSaltare(st, k, S, memoria) {
  const bot = BOT[st.bots?.[k]];
  if (!bot || st.phase !== 'auction') return false;
  const a = st.auction;
  if (!a.running || a.paused) return false;
  if (S.slotsLeft(st, k) <= 0) return false;
  const pid = S.currentPlayerId(st);
  if (!pid) return false;
  // Se sta gia conducendo lui, evidentemente lo vuole.
  if (a.bid?.team === k) return false;
  // La stessa decisione che usa offerta(): o si vuole il giocatore, o si
  // vota per saltarlo. Mai tutte e due.
  return giudizio(st, k, S, memoria, pid).salta;
}

/* ==========================================================
   La tattica
   ========================================================== */

function permutazioni(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const resto = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutazioni(resto)) out.push([arr[i], ...p]);
  }
  return out;
}

// A parita di conti, ognuno tira verso il basket che gli piace. Il numero e
// piccolo di proposito: sposta le scelte quasi pari e nient'altro, cosi il
// carattere si vede senza che nessuno giochi male apposta.
const GUSTO = 0.35;

// Prova le combinazioni e tiene quella che regge meglio contro TUTTE le
// strategie che gli avversari potrebbero scegliere, non solo contro quella
// che hanno adesso. Quanto pesi il caso peggiore rispetto alla media lo dice
// il carattere: Bruno rischia, Cleo si copre.
export function tatticaBot(st, k, S) {
  const D = db();
  const bot = BOT[st.bots?.[k]];
  const rosa = st.teams[k].roster;
  if (!bot || rosa.length < ROSTER_SIZE) return null;

  const tr = bot.tr;
  const ord = rosa.map((id) => D.byId[id]).sort((a, b) => b.attrs.sco - a.attrs.sco);
  const sbloccati = allenatoriDi(rosa);

  const avversari = [];
  for (const o of S.attive(st)) {
    if (o === k) continue;
    const ro = st.teams[o].roster;
    if (ro.length < ROSTER_SIZE) continue;
    const lo = st.lineups?.[o] && SLOTS.every((sl) => st.lineups[o][sl])
      ? st.lineups[o] : S.autoLineup(ro);
    const oo = ro.map((id) => D.byId[id]).sort((a, b) => b.attrs.sco - a.attrs.sco);
    for (const sv of Object.keys(STRATEGIES)) {
      try {
        avversari.push(buildTeam(o, lo, {
          v1: st.tactics[o]?.v1 || oo[0].id, v2: st.tactics[o]?.v2 || oo[1].id,
          strategy: sv, ritmo: st.tactics[o]?.ritmo || 'medio', coach: st.tactics[o]?.coach || null,
        }));
      } catch { /* quintetto non ancora valido */ }
    }
  }

  // Due passaggi, o sarebbero milioni di combinazioni: prima il quintetto
  // (120 disposizioni, tattica fissa), poi il resto sulle tre migliori.
  const base = { v1: ord[0].id, v2: ord[1].id, strategy: 'equilibrato', ritmo: 'medio', coach: null };
  const cls = [];
  for (const perm of permutazioni(rosa)) {
    const lu = {}; SLOTS.forEach((sl, i) => { lu[sl] = perm[i]; });
    try { const T = buildTeam(k, lu, base); cls.push({ lu, s: T.off + T.def }); } catch { /* disposizione non valida */ }
  }
  cls.sort((a, b) => b.s - a.s);

  const coach = [null, ...sbloccati.map((c) => c.id)];
  const v1c = ord.slice(0, 3).map((p) => p.id);
  const v2c = ord.slice(0, 4).map((p) => p.id);
  let best = null;
  for (const { lu } of cls.slice(0, 3)) {
    for (const v1 of v1c) for (const v2 of v2c) {
      if (v1 === v2) continue;
      for (const strategy of Object.keys(STRATEGIES)) {
        for (const ritmo of Object.keys(RITMI)) for (const c of coach) {
          const tac = { v1, v2, strategy, ritmo, coach: c };
          let T;
          try { T = buildTeam(k, lu, tac); } catch { continue; }
          let s;
          if (!avversari.length) s = T.off + T.def;
          else {
            let somma = 0, peggio = Infinity;
            for (const O of avversari) {
              const m = matchup(T, O);
              const d = (m.offA - m.defB) - (m.offB - m.defA);
              somma += d; if (d < peggio) peggio = d;
            }
            s = (somma / avversari.length) * (1 - tr.prudenza) + peggio * tr.prudenza;
            if (strategy === tr.gusti.strategy) s += GUSTO;
            if (ritmo === tr.gusti.ritmo) s += GUSTO;
          }
          if (!best || s > best.s) best = { s, lu, tac };
        }
      }
    }
  }
  return best;
}

export { hashStr };
