// bot-arena.mjs — i bot giocano davvero, e si guarda quanto valgono.
//
//   node tools/bot-arena.mjs
//
// Fa due cose. Verifica che un bot possa portare a termine una partita intera
// senza rompere una regola — e la prova che il pezzo funziona end-to-end,
// perche muove gli stessi reducer che muove chi ospita. E misura quanto sono
// forti: un bot che perde sempre non serve, uno che vince sempre nemmeno.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const core = await import('../js/core.js');
const D = core.installData(readJson('data/players.json'), readJson('data/archetypes.json'), readJson('data/coaches.json'));
const S = await import('../js/state.js');
const E = await import('../js/engine.js');
const Bot = await import('../js/bot.js');
const { TEAM_KEYS, STRATEGIES, ROSTER_SIZE, SLOTS } = core;

let fails = 0;
const male = (msg, extra = '') => { console.log(`  ROTTO  ${msg}${extra ? ' — ' + extra : ''}`); fails++; };

let clock = 1e6;
const tick = () => (clock += 400);

/* ---------- Gli avversari finti, per il confronto ---------- */
// Gli ultimi due sono i soli che contano davvero: i primi tre offrono cifre
// basse, e contro di loro un bot tirchio sembra bravo perche i prezzi restano
// bassi comunque. E' contro chi PAGA che si vede se un tetto e sbagliato.
const UMANI = {
  'compra i nomi grossi': (p) => Math.round((p.ovr - 85) * 2.8),
  'spende uguale su tutti': (p, s, k) => (S.slotsLeft(s, k) > 0 ? 9 : 0),
  'prima tira, poi spende': (p, s, k) => (S.slotsLeft(s, k) >= 3 ? 4 : 16),
  // Chi sa giocare: paga i fuoriclasse una fetta grossa di cassa, perche sa
  // che in due gli ultimi posti si riempiono con gli avanzi.
  'paga i fuoriclasse': (p, s, k) => {
    const left = S.slotsLeft(s, k);
    if (left <= 0) return 0;
    const max = S.maxBid(s, k);
    if (p.ovr >= 95) return Math.round(max * 0.6);
    if (p.ovr >= 91) return Math.round(max * 0.35);
    if (p.ovr >= 88) return Math.round(max * 0.18);
    return left >= 3 ? 2 : Math.round(max * 0.5);
  },
};

/* ---------- Una partita intera ---------- */

// `chi` mappa la chiave squadra a un bot ('ada'...) o a uno stile umano.
function partita(seed, chi) {
  const keys = Object.keys(chi);
  let s = S.newGame(seed, 'host');
  // La sedia la sceglie chi entra, non il chiamante: si prende nota di chi
  // ha preso cosa. Alla prima stesura si assegnava lo stesso stile a tutti
  // gli umani, e con uno stile inesistente non offrivano mai: ogni lotto
  // passava invenduto e l'asta non si chiudeva.
  const ruolo = {};
  for (const k of keys) {
    const prima = new Set(Object.values(s.seats));
    if (Bot.BOT[chi[k]]) {
      const dopo = S.aggiungiBot(s, chi[k]);
      if (!dopo) { male('aggiungiBot rifiutato', k); continue; }
      s = dopo;
    } else {
      s = S.joinGame(s, 'u' + k, 'Umano ' + k);
    }
    const nuova = Object.values(s.seats).find((x) => !prima.has(x));
    if (nuova) ruolo[nuova] = chi[k];
  }
  const inGioco = S.attive(s);
  if (inGioco.length !== keys.length) male('squadre in gioco sbagliate', `${inGioco.length}/${keys.length}`);
  for (const k of inGioco) {
    if (!s.bots?.[k] && !UMANI[ruolo[k]]) male('stile umano sconosciuto', `${k}: ${ruolo[k]}`);
  }

  s = S.startAuction(s, tick(), inGioco);
  if (s.phase !== 'auction') { male('asta non partita'); return null; }

  const memoria = {};
  let g = 0;
  while (s.phase === 'auction' && g++ < 4000) {
    const pid = S.currentPlayerId(s);
    if (!pid) break;
    const p = D.byId[pid];

    // Un giro di offerte. IL TEMPO DEVE AVANZARE anche quando nessuno
    // rilancia: i bot hanno un tempo di reazione, e se l'orologio sta fermo
    // non si svegliano mai. Alla prima stesura del test succedeva questo, e
    // ogni lotto passava invenduto.
    let momento = clock;
    let fermiDa = 0;
    for (let giro = 0; giro < 30 && fermiDa < 6; giro++) {
      momento += 700;
      let mosso = false;
      for (const k of inGioco) {
        let q = null;
        if (s.bots?.[k]) {
          q = Bot.offerta(s, k, S, momento, memoria);
        } else {
          const stile = UMANI[ruolo[k]];
          if (stile) {
            const v = Math.min(S.maxBid(s, k), Math.max(0, stile(p, s, k)));
            if (v >= 1) q = v;
          }
        }
        if (q != null && S.canBid(s, k, q)) { s = S.placeBid(s, k, q, tick()); mosso = true; }
      }
      fermiDa = mosso ? 0 : fermiDa + 1;
    }
    clock = momento;
    s = S.resolveLot(s, tick());

    // Le regole valgono anche per i bot: si controlla a ogni lotto.
    for (const k of inGioco) {
      const t = s.teams[k];
      if (t.credits < 0) male('credito negativo', k);
      if (t.roster.length > ROSTER_SIZE) male('rosa oltre i cinque', k);
      const left = ROSTER_SIZE - t.roster.length;
      if (left > 0 && t.credits < left) male('regola di riserva violata dal bot', k);
    }
    const tutti = inGioco.flatMap((k) => s.teams[k].roster);
    if (new Set(tutti).size !== tutti.length) male('stesso giocatore a due squadre');
  }

  if (s.phase !== 'squadra') { male('asta non chiusa', `fase ${s.phase}`); return null; }
  for (const k of inGioco) {
    if (s.teams[k].roster.length !== ROSTER_SIZE) male('rosa incompleta a fine asta', k);
  }

  // Tattiche: i bot le decidono da soli, gli umani a caso.
  for (const k of inGioco) {
    if (s.bots?.[k]) {
      const best = Bot.tatticaBot(s, k, S);
      if (!best) {
        const t = s.teams[k];
        male('il bot non decide la tattica',
          `${k} ${Bot.BOT[s.bots[k]].nome}: ${t.roster.length}/5 in rosa, ${t.credits} crediti`);
        continue;
      }
      if (!SLOTS.every((sl) => best.lu[sl])) male('quintetto del bot incompleto', k);
      s = { ...s, lineups: { ...s.lineups, [k]: best.lu } };
      const prima = s;
      s = S.setTactics(s, k, best.tac);
      if (s === prima) male('tattica del bot rifiutata dallo stato', `${k}: ${JSON.stringify(best.tac)}`);
    } else {
      const strategie = Object.keys(STRATEGIES);
      const rng = core.makeRng(seed + k);
      s = S.setTactics(s, k, { strategy: strategie[Math.floor(rng() * strategie.length)] });
    }
  }
  if (!S.squadraReady(s)) male('non si puo passare ai playoff');

  const T = {};
  for (const k of inGioco) T[k] = E.buildTeam(k, s.lineups[k], s.tactics[k]);
  const tab = E.componiTabellone(T, seed);
  s = S.toPlayoffs(s, tab);
  for (let r = 0; r < s.po.turni.length; r++) {
    for (let i = 0; i < s.po.turni[r].length; i++) {
      for (let x = 0; x < 10; x++) s = S.advanceSeries(s, r, i, S.PASSO_SEMI);
    }
  }
  const bracket = E.costruisciBracket(s.po, T);
  const finale = bracket[bracket.length - 1][0];
  return { campione: finale.res.winner, ruolo, s, inGioco };
}

// I crediti lasciati in tasca a fine asta. E la spia che alla prima stesura
// mancava: il bot vinceva abbastanza contro avversari deboli e nessuno si
// accorgeva che ne spendeva meno della meta.
function inTasca(r, chi) {
  const k = r.inGioco.find((x) => (chi === 'bot' ? r.s.bots?.[x] : !r.s.bots?.[x]));
  return k ? r.s.teams[k].credits : 0;
}

/* ==========================================================
   1. Un bot arriva in fondo senza rompere niente?
   ========================================================== */
console.log('\n1. UNA PARTITA INTERA CON I BOT\n');
{
  const r = partita('arena-uno', { a: 'ada', b: 'compra i nomi grossi', c: 'cleo', d: 'spende uguale su tutti' });
  if (r) {
    console.log(`  quattro squadre, due bot: campione ${core.TEAM_NAMES[r.campione]}`);
    for (const k of r.inGioco) {
      const rosa = r.s.teams[k].roster.map((id) => D.byId[id].n).join(', ');
      const t = r.s.tactics[k];
      console.log(`    ${(r.s.bots?.[k] ? 'BOT ' + Bot.BOT[r.s.bots[k]].nome : 'umano').padEnd(9)}`
        + ` ${String(50 - r.s.teams[k].credits).padStart(2)} crediti — ${rosa}`);
      console.log(`              ${STRATEGIES[t.strategy].label} · ${t.ritmo}`
        + ` · ${t.coach ? D.coachById[t.coach].n : 'nessun allenatore'}`);
    }
  }
  console.log(fails === 0 ? '\n  Nessuna regola violata.' : `\n  ${fails} problemi.`);
}

/* ==========================================================
   2. Quanto sono forti, uno per uno
   ========================================================== */
console.log('\n2. OGNI BOT CONTRO OGNI STILE  (40 serie per casella, uno contro uno)\n');
const stili = Object.keys(UMANI);
console.log('  bot      ' + stili.map((s) => s.slice(0, 13).padStart(15)).join('') + '     media   in tasca');
console.log('  ' + '-'.repeat(10 + stili.length * 15 + 10));

for (const b of Bot.ID_BOT) {
  const celle = []; let somma = 0, tasca = 0, conta = 0;
  for (const st of stili) {
    let v = 0, n = 0;
    for (let i = 0; i < 40; i++) {
      const r = partita(`${b}-${st}-${i}`, { x: b, y: st });
      if (!r) continue;
      n++; conta++; tasca += inTasca(r, 'bot');
      if (r.s.bots?.[r.campione]) v++;
    }
    const pc = n ? v / n * 100 : 0;
    celle.push(`${pc.toFixed(0)}%`.padStart(15));
    somma += pc;
  }
  const media = somma / stili.length;
  console.log(`  ${Bot.BOT[b].nome.padEnd(8)} ${celle.join('')}   ${media.toFixed(0).padStart(6)}%`
    + `   ${(tasca / conta).toFixed(0).padStart(6)}`);
}
console.log('\n  L\'ultima colonna sono i crediti rimasti in tasca a fine asta, su 50.');
console.log('  Sopra i 12 il bot sta giocando con meno budget di quello che ha.');

console.log('\n  E\' la colonna che somiglia di piu a una persona vera, quindi e quella che');
console.log('  conta per chi gioca. Devono stare vicini fra loro: un bot che perde sempre');
console.log('  non e un avversario, e un modo lungo di vincere.\n');

/* ==========================================================
   2b. Uno contro uno, ogni coppia
   ==========================================================

   E' il confronto che conta. La media contro gli stili simulati nasconde il
   divario: contro un avversario che offre nove crediti fissi sembrano tutti
   bravi. Qui ognuno affronta ognuno, e si vede chi regge davvero. */
console.log('\n2b. OGNI BOT CONTRO OGNI ALTRO BOT  (50 serie per coppia)\n');
{
  const N = 50;
  const vinte = {}; const giocate = {};
  for (const b of Bot.ID_BOT) { vinte[b] = 0; giocate[b] = 0; }
  const griglia = {};
  for (const a of Bot.ID_BOT) {
    griglia[a] = {};
    for (const b of Bot.ID_BOT) {
      if (a === b) { griglia[a][b] = null; continue; }
      let v = 0, n = 0;
      for (let i = 0; i < N; i++) {
        const r = partita(`${a}-vs-${b}-${i}`, { x: a, y: b });
        if (!r) continue;
        n++;
        // aggiungiBot sceglie la sedia in ordine: la prima e di `a`.
        const chiVince = r.s.bots[r.campione];
        if (chiVince === a) v++;
      }
      griglia[a][b] = n ? v / n * 100 : 0;
      vinte[a] += v; giocate[a] += n;
    }
  }
  const nomi = Bot.ID_BOT.map((b) => Bot.BOT[b].nome);
  console.log('           ' + nomi.map((n) => n.padStart(9)).join('') + '     media');
  console.log('  ' + '-'.repeat(11 + nomi.length * 9 + 10));
  for (const a of Bot.ID_BOT) {
    const celle = Bot.ID_BOT.map((b) => (griglia[a][b] === null ? '—'.padStart(9)
      : `${griglia[a][b].toFixed(0)}%`.padStart(9)));
    const media = giocate[a] ? vinte[a] / giocate[a] * 100 : 0;
    console.log(`  ${Bot.BOT[a].nome.padEnd(9)}${celle.join('')}   ${media.toFixed(0).padStart(6)}%`);
  }
  // Ogni coppia si gioca nei due ordini di sedia, e le due caselle dovrebbero
  // sommare a cento. Ne misura una decina di meno, sempre: in questo banco di
  // prova le squadre offrono in ordine fisso, quindi chi sta nella prima sedia
  // rilancia per primo e si lascia superare di un credito. E' un difetto del
  // banco, non del gioco — nell'app i bot si svegliano a tempi diversi. Vale
  // per tutte le righe allo stesso modo, quindi confrontarle resta lecito: e
  // l'altezza assoluta della tabella a essere bassa di qualche punto. Il
  // controllo serve a sapere se quel difetto cresce.
  let somma = 0, coppie = 0;
  for (let i = 0; i < Bot.ID_BOT.length; i++) {
    for (let j = i + 1; j < Bot.ID_BOT.length; j++) {
      somma += griglia[Bot.ID_BOT[i]][Bot.ID_BOT[j]] + griglia[Bot.ID_BOT[j]][Bot.ID_BOT[i]];
      coppie++;
    }
  }
  const sedia = somma / coppie;
  console.log(`\n  Peso della sedia: le caselle speculari sommano a ${sedia.toFixed(0)} invece di 100`);
  console.log('  (chi offre per primo si fa superare di un credito — difetto del banco).');
  if (sedia < 80 || sedia > 110) male('la sedia conta troppo', `somma ${sedia.toFixed(0)}`);

  const medie = Bot.ID_BOT.map((b) => (giocate[b] ? vinte[b] / giocate[b] * 100 : 0));
  console.log(`  Divario fra il migliore e il peggiore: ${(Math.max(...medie) - Math.min(...medie)).toFixed(0)} punti.`);
  console.log('  Sotto i 15 sono avversari dello stesso livello con teste diverse;');
  console.log('  sopra i 25 due di loro sono li solo per perdere.');
}

console.log('\n3. I QUATTRO BOT FRA LORO  (120 tornei in quattro)\n');
{
  const titoli = {}; const st = {};
  for (const b of Bot.ID_BOT) st[b] = { n: 0, ovr: 0, top: 0, caro: 0, spesi: 0, quinto: 0 };
  for (let i = 0; i < 120; i++) {
    const r = partita('tutti-' + i, { a: 'ada', b: 'bruno', c: 'cleo', d: 'dino' });
    if (!r) continue;
    const chi = r.s.bots[r.campione];
    titoli[chi] = (titoli[chi] || 0) + 1;
    // Che rosa hanno costruito. E' la domanda che chiude le discussioni sul
    // perche uno perde: se compra peggio o se schiera peggio.
    for (const k of r.inGioco) {
      const id = r.s.bots[k]; if (!id) continue;
      const ovr = r.s.teams[k].roster.map((x) => D.byId[x].ovr).sort((a, b) => b - a);
      const prezzi = (r.s.auction.log || []).filter((v) => v.team === k).map((v) => v.price);
      const a = st[id];
      a.n++; a.ovr += ovr.reduce((x, y) => x + y, 0) / ovr.length;
      a.top += ovr[0]; a.quinto += ovr[ovr.length - 1];
      a.caro += prezzi.length ? Math.max(...prezzi) : 0;
      a.spesi += 50 - r.s.teams[k].credits;
    }
  }
  console.log('  bot        titoli   ovr medio   il migliore   il quinto   sul piu caro   spesi');
  console.log('  ' + '-'.repeat(76));
  for (const b of Bot.ID_BOT) {
    const a = st[b]; const n = a.n || 1;
    console.log(`  ${Bot.BOT[b].nome.padEnd(9)} ${String(titoli[b] || 0).padStart(4)}`
      + `   ${(a.ovr / n).toFixed(1).padStart(9)}   ${(a.top / n).toFixed(1).padStart(11)}`
      + `   ${(a.quinto / n).toFixed(1).padStart(9)}   ${(a.caro / n).toFixed(0).padStart(12)}`
      + `   ${(a.spesi / n).toFixed(0).padStart(5)}`);
  }
  console.log('\n  Con quattro squadre la quota equa e 30 titoli.');
}

/* ==========================================================
   4. Quanto costano al telefono di chi ospita
   ==========================================================

   Misura nuova, e serve da quando calcolano tutti e quattro. I bot li guida
   un device solo: se il conto di un tetto dura mezzo secondo, con quattro bot
   ogni lotto l'asta va a scatti su chi ospita e su nessun altro — un difetto
   che nessuna partita di prova farebbe vedere, perche i test non hanno una
   interfaccia da ridisegnare. */
console.log('\n4. QUANTO CI METTONO A PENSARE\n');
{
  let s = S.newGame('tempi', 'host');
  for (const b of Bot.ID_BOT) s = S.aggiungiBot(s, b);
  const keys = S.attive(s);
  s = S.startAuction(s, tick(), keys);

  const pid = S.currentPlayerId(s);
  let t0 = performance.now();
  for (const k of keys) Bot.BOT[s.bots[k]].tetto(s, k, pid, S);
  const perLotto = performance.now() - t0;

  // Una rosa piena per ognuno, per misurare la scelta della tattica.
  const memoria = {};
  let g = 0;
  while (s.phase === 'auction' && g++ < 4000) {
    let momento = clock, fermiDa = 0;
    for (let giro = 0; giro < 30 && fermiDa < 6; giro++) {
      momento += 700;
      let mosso = false;
      for (const k of keys) {
        const q = Bot.offerta(s, k, S, momento, memoria);
        if (q != null && S.canBid(s, k, q)) { s = S.placeBid(s, k, q, tick()); mosso = true; }
      }
      fermiDa = mosso ? 0 : fermiDa + 1;
    }
    clock = momento;
    s = S.resolveLot(s, tick());
  }

  t0 = performance.now();
  for (const k of keys) Bot.tatticaBot(s, k, S);
  const perTattica = performance.now() - t0;

  console.log(`  tutti e quattro decidono un'offerta:  ${perLotto.toFixed(0)} ms`);
  console.log(`  tutti e quattro scelgono la tattica:  ${perTattica.toFixed(0)} ms`);
  console.log('\n  Il primo si paga a ogni lotto, una ventina di volte: sopra i 400 ms');
  console.log('  l\'asta va a scatti per chi ospita. Il secondo si paga una volta sola,');
  console.log('  su una schermata dove si sta gia leggendo: li ci sta fino a due secondi.');
  console.log('  Un telefono e circa quattro volte piu lento di questa macchina.');
  if (perLotto > 400) male('offerte troppo lente', `${perLotto.toFixed(0)} ms per lotto`);
  if (perTattica > 2000) male('scelta tattica troppo lenta', `${perTattica.toFixed(0)} ms`);
}

console.log(fails === 0 ? '\nTutto in regola.\n' : `\n${fails} PROBLEMI.\n`);
process.exit(fails === 0 ? 0 : 1);
