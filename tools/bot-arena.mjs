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
      const dopo = S.aggiungiBot(s);
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

console.log('\n  Ada e l\'unica che calcola: deve vincere spesso ma non sempre.');
console.log('  Gli altri tre devono restare intorno alla meta, o non sono avversari');
console.log('  ma vittime — e giocare contro un bot che perde sempre non diverte.\n');

/* ==========================================================
   3. I bot fra loro
   ========================================================== */
console.log('3. I QUATTRO BOT FRA LORO  (60 tornei in quattro)\n');
{
  const titoli = {};
  for (let i = 0; i < 60; i++) {
    const r = partita('tutti-' + i, { a: 'ada', b: 'bruno', c: 'cleo', d: 'dino' });
    if (!r) continue;
    const chi = r.s.bots[r.campione];
    titoli[chi] = (titoli[chi] || 0) + 1;
  }
  for (const b of Bot.ID_BOT) {
    const n = titoli[b] || 0;
    console.log(`  ${Bot.BOT[b].nome.padEnd(8)} ${String(n).padStart(2)} titoli  ${'#'.repeat(n)}`);
  }
  console.log('\n  Con quattro squadre la quota equa e 15.');
}

console.log(fails === 0 ? '\nTutto in regola.\n' : `\n${fails} PROBLEMI.\n`);
process.exit(fails === 0 ? 0 : 1);
