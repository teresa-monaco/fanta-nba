// anteprima.mjs — genera una pagina sola con le schermate VERE dell'app,
// affiancate in cornici da telefono, per guardarle prima di pubblicare.
//
//   node tools/anteprima.mjs [file-di-uscita.html]
//
// Non e un mockup: fa girare ui.js sul serio e incolla l'HTML che produce,
// con il CSS vero del gioco. Se una schermata e rotta, qui si vede rotta.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const uscita = process.argv[2] || join(root, '.tmp', 'anteprima.html');

/* ---------- Minimo DOM finto, come in domtest ---------- */
const store = new Map();
const mkEl = (id) => ({
  id, innerHTML: '', value: '', disabled: false, textContent: '',
  dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
  closest: () => null, querySelector: () => null, querySelectorAll: () => [], scrollIntoView() {},
});
const els = { app: mkEl('app'), topbar: mkEl('topbar') };
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
};
globalThis.document = {
  getElementById: (id) => els[id] ?? null, addEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  documentElement: { style: { setProperty() {} } },
};
globalThis.location = { search: '?local=1', origin: 'https://x.test', pathname: '/', reload() {} };
globalThis.confirm = () => true;
globalThis.history = { replaceState() {} };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.innerHeight = 844;
globalThis.visualViewport = { height: 844, offsetTop: 0, addEventListener() {} };
globalThis.fetch = async (url) => ({ ok: true, json: async () => readJson(String(url).replace(/^\.\//, '')) });

const core = await import('../js/core.js');
core.installData(readJson('data/players.json'), readJson('data/archetypes.json'), readJson('data/coaches.json'));
const S = await import('../js/state.js');
const { render, renderTopbar, ui } = await import('../js/ui.js');
const { buildTeam, componiTabellone, giriStagione, tabelloneDaStagione, simStagione } = await import('../js/engine.js');
const { TEAM_KEYS } = core;

/* ---------- Una partita finta, portata dove serve ---------- */

let clock = 1e6;
const tick = () => (clock += 1000);
const sessione = (uid) => ({ uid, code: 'DEMO', mode: 'room' });

function partita(quante, conStagione = false) {
  let s = S.newGame('anteprima', 'host');
  if (conStagione) s = S.setFormato(s, true);
  for (let i = 0; i < quante; i++) s = S.joinGame(s, i === 0 ? 'host' : 'u' + i, ['Diego', 'Fabio', 'Steve', 'Agre', 'Marco', 'Luca'][i] || 'P' + i);
  return s;
}

function compraTutto(s) {
  let g = 0;
  while (s.phase === 'auction' && g++ < 400) {
    const k = S.attive(s).filter((t) => S.slotsLeft(s, t) > 0)[g % S.attive(s).length]
      || S.attive(s).find((t) => S.slotsLeft(s, t) > 0);
    if (!k) break;
    s = S.placeBid(s, k, Math.max(1, Math.min(S.maxBid(s, k), 3 + (g % 7))), tick());
    s = S.resolveLot(s, tick());
  }
  return s;
}

const schermate = [];
const cattura = (titolo, nota, s, uid) => {
  core.applicaNomi(s.seed);
  const ctx = { state: s, session: sessione(uid) };
  renderTopbar(els.topbar, ctx);
  render(els.app, ctx);
  schermate.push({ titolo, nota, topbar: els.topbar.innerHTML, body: els.app.innerHTML });
};

/* 1. Asta, dal telefono di chi gioca */
{
  let s = partita(4);
  s = S.startAuction(s, tick(), TEAM_KEYS.slice(0, 4));
  // Qualche acquisto, cosi le caselle di ruolo hanno dentro qualcosa.
  for (let i = 0; i < 7; i++) {
    const k = S.attive(s)[i % 4];
    s = S.placeBid(s, k, 3 + i, tick());
    s = S.resolveLot(s, tick());
  }
  s = S.placeBid(s, TEAM_KEYS[1], 6, tick());
  cattura('Asta', 'Caselle di ruolo invece di cinque "libero" uguali, e il cronometro anche nella barra in basso.', s, 'host');
}

/* 2. Le squadre: tutte le impostazioni tecniche */
{
  let s = compraTutto(S.startAuction(partita(4), tick(), TEAM_KEYS.slice(0, 4)));
  cattura('Le squadre', 'Ritmo come barra da scorrere, allenatori con il testo riscritto.', s, 'host');
}

/* 3. Stagione regolare */
{
  let s = compraTutto(S.startAuction(partita(6, true), tick(), TEAM_KEYS.slice(0, 6)));
  s = S.giocaStagione(s, giriStagione(6));
  cattura('Stagione regolare', 'La classifica, con chi passa e chi resta fuori.', s, 'host');
}

/* 4. Playoff a meta: gare vecchie richiuse */
{
  let s = compraTutto(S.startAuction(partita(4), tick(), TEAM_KEYS.slice(0, 4)));
  const T = {};
  for (const k of S.attive(s)) T[k] = buildTeam(k, s.lineups[k], s.tactics[k]);
  s = S.toPlayoffs(s, componiTabellone(T, s.seed));
  for (let i = 0; i < 3; i++) { s = S.advanceSeries(s, 0, 0, S.PASSO_GARA); s = S.advanceSeries(s, 0, 1, S.PASSO_GARA); }
  cattura('Playoff in corso', 'Le gare gia lette si richiudono a una riga: la pagina non scappa piu in basso.', s, 'host');
}

/* 5. Serie chiusa: cronaca, perche ha vinto, referto */
{
  let s = compraTutto(S.startAuction(partita(4), tick(), TEAM_KEYS.slice(0, 4)));
  const T = {};
  for (const k of S.attive(s)) T[k] = buildTeam(k, s.lineups[k], s.tactics[k]);
  s = S.toPlayoffs(s, componiTabellone(T, s.seed));
  for (let r = 0; r < s.po.turni.length; r++) {
    for (let i = 0; i < s.po.turni[r].length; i++) {
      for (let x = 0; x < 10; x++) s = S.advanceSeries(s, r, i, S.PASSO_GARA);
    }
  }
  cattura('Serie chiusa', 'MVP, perche ha vinto, e sotto il referto tattico (aperto qui per farlo vedere).', s, 'host');
}

/* ---------- La pagina ---------- */

const css = readFileSync(join(root, 'css/style.css'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fanta NBA — anteprima</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700&display=swap">
<style>
${css}

/* --- solo per l'anteprima: cornici affiancate --- */
body.anteprima { padding: 0; background: #07080c; }
.ap-head { max-width: 1100px; margin: 0 auto; padding: 26px 18px 6px; }
.ap-head h1 { font: 800 30px/1.05 var(--cond); letter-spacing: .5px; text-transform: uppercase; margin: 0 0 6px; }
.ap-head p { color: var(--muted); font-size: 14px; max-width: 62ch; margin: 0; }
.ap-griglia {
  max-width: 1100px; margin: 0 auto; padding: 18px;
  display: grid; gap: 26px; grid-template-columns: 1fr;
}
@media (min-width: 760px) { .ap-griglia { grid-template-columns: 1fr 1fr; } }
@media (min-width: 1180px) { .ap-griglia { grid-template-columns: 1fr 1fr 1fr; } }
/* La cornice deve essere larga come un telefono vero, o l'anteprima mente:
   alla prima prova usciva dallo schermo e si vedeva mezza interfaccia. */
html, body.anteprima { overflow-x: hidden; }
.ap-box { min-width: 0; }
.ap-titolo { font: 800 13px var(--cond); letter-spacing: 2.4px; text-transform: uppercase; color: var(--gold); }
.ap-nota { color: var(--muted); font-size: 12.5px; margin: 3px 0 10px; line-height: 1.4; }
.ap-tel {
  width: 100%; max-width: 380px; margin: 0 auto;
  border: 1px solid var(--line-2); border-radius: 22px; overflow: hidden;
  background: var(--bg); box-shadow: 0 16px 40px rgba(0,0,0,.55);
  height: 720px; display: flex; flex-direction: column;
}
.ap-tel .topbar { position: static; }
/* In verticale scorre, in orizzontale no: dentro l'app niente deve sbordare
   (le strisce che scorrono hanno il proprio overflow). */
.ap-scroll { overflow-y: auto; overflow-x: hidden; flex: 1; padding: 0 14px 14px; min-width: 0; }
/* La barra dei rilanci e fixed nell'app: qui va ancorata alla cornice. */
.ap-tel .bidbar { position: sticky; bottom: 0; left: auto; right: auto; }
.ap-tel .bidbar-spacer { display: none; }
</style></head>
<body class="anteprima">
<div class="ap-head">
  <h1>Fanta NBA — cosa cambia</h1>
  <p>Schermate vere, generate dal codice: non sono disegni. Guardale e dimmi cosa tenere.
     La barra dei rilanci nell'app e fissa in fondo allo schermo; qui e ancorata alla cornice.</p>
</div>
<div class="ap-griglia">
${schermate.map((s) => `  <div class="ap-box">
    <div class="ap-titolo">${s.titolo}</div>
    <div class="ap-nota">${s.nota}</div>
    <div class="ap-tel">
      <header class="topbar">${s.topbar}</header>
      <main class="ap-scroll">${s.body}</main>
    </div>
  </div>`).join('\n')}
</div>
<script>
  // Nell'anteprima i blocchi richiudibili si aprono, cosi si vede tutto.
  document.querySelectorAll('details').forEach((d) => { d.open = true; });
</script>
</body></html>`;

writeFileSync(uscita, html, 'utf8');
console.log(`\n  ${schermate.length} schermate in ${uscita}`);
for (const s of schermate) console.log(`    · ${s.titolo}`);
console.log('');
