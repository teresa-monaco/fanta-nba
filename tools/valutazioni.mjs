// valutazioni.mjs — quello che il bot pensa dei giocatori, in una pagina da
// leggere e correggere.
//
//   node tools/valutazioni.mjs [uscita.html]
//
// Serve a una cosa sola: la valutazione e l'unico pezzo che non si puo
// verificare da soli. Che una formula sia coerente lo dicono i test; che dica
// cose sensate di pallacanestro lo dice solo chi la pallacanestro la guarda.
// Qui c'e tutto in chiaro, con accanto l'overall, per poter dire "questo e
// sbagliato" senza leggere una riga di codice.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rj = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const core = await import('../js/core.js');
const D = core.installData(rj('data/players.json'), rj('data/archetypes.json'), rj('data/coaches.json'));
const Bot = await import('../js/bot.js');
const { SLOTS } = core;

const uscita = process.argv[2] || join(root, '.tmp', 'valutazioni.html');
try { mkdirSync(dirname(uscita), { recursive: true }); } catch { /* c'e gia */ }

/* ---------- I numeri ---------- */

Bot.installaRiserve();
const vuota = D.players.map((p) => ({ p, v: Bot.valorePer([], p.id) })).sort((a, b) => b.v - a.v);
const vMin = vuota[vuota.length - 1].v, vMax = vuota[0].v;

// Quanto conta il ruolo: a rosa vuota, il valore medio per posizione.
const perRuolo = {};
for (const sl of SLOTS) {
  const q = vuota.filter((x) => x.p.pos === sl);
  perRuolo[sl] = { n: q.length, medio: q.reduce((a, b) => a + b.v, 0) / q.length,
    top: q.slice(0, 3) };
}

// L'effetto contesto: lo stesso giocatore con la rosa vuota, con un compagno
// dello stesso ruolo, con uno di ruolo diverso.
const contesto = [];
for (const sl of SLOTS) {
  const stessi = D.players.filter((p) => p.pos === sl).sort((a, b) => b.ovr - a.ovr);
  const altro = D.players.find((p) => p.pos !== sl && p.ovr >= 95);
  if (stessi.length < 2 || !altro) continue;
  const [primo, secondo] = stessi;
  contesto.push({
    chi: secondo, sl,
    solo: Bot.valorePer([], secondo.id),
    conDoppione: Bot.valorePer([primo.id], secondo.id),
    conAltro: Bot.valorePer([altro.id], secondo.id),
    doppione: primo, altro,
  });
}

// Gli archetipi, dal piu al meno premiato. E qui che vivono le sorprese: un
// giocatore forte con un archetipo che il motore non ama resta indietro
// qualunque sia il suo overall.
const perArc = {};
for (const x of vuota) {
  const a = (perArc[x.p.arc] = perArc[x.p.arc] || { n: 0, somma: 0, ovr: 0, top: null });
  a.n++; a.somma += x.v; a.ovr += x.p.ovr;
  if (!a.top || x.v > a.top.v) a.top = x;
}
const clsArc = Object.entries(perArc).map(([a, s]) => ({
  a, n: s.n, medio: s.somma / s.n, ovrMedio: s.ovr / s.n, top: s.top,
})).sort((x, y) => y.medio - x.medio);

// Dove il bot e piu lontano dall'intuito: valore alto con overall basso, e
// viceversa. Sono le righe su cui serve davvero un occhio umano.
const rangoV = new Map(vuota.map((x, i) => [x.p.id, i + 1]));
const pos_ = (id) => rangoV.get(id);
const perOvr = D.players.slice().sort((a, b) => b.ovr - a.ovr);
const rangoO = new Map(perOvr.map((p, i) => [p.id, i + 1]));
const scarti = D.players.map((p) => ({
  p, v: Bot.valorePer([], p.id), rv: rangoV.get(p.id), ro: rangoO.get(p.id),
  d: rangoO.get(p.id) - rangoV.get(p.id),
}));
const sopravvalutati = scarti.slice().sort((a, b) => b.d - a.d).slice(0, 14);
const sottovalutati = scarti.slice().sort((a, b) => a.d - b.d).slice(0, 14);

/* ---------- La pagina ---------- */

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const barra = (v) => {
  const q = Math.max(0, Math.min(1, (v - vMin) / (vMax - vMin)));
  return `<span class="bar"><i style="width:${(q * 100).toFixed(0)}%"></i></span>`;
};
const riga = (x, i) => `<tr>
  <td class="num">${i + 1}</td>
  <td class="nm">${esc(x.p.n)}</td>
  <td class="pos">${x.p.pos}</td>
  <td class="ovr">${x.p.ovr}</td>
  <td class="val">${x.v.toFixed(0)}</td>
  <td class="b">${barra(x.v)}</td>
</tr>`;

const tabella = (righe, da = 0) => `<table>
  <thead><tr><th></th><th>Giocatore</th><th>Ruolo</th><th>OVR</th><th>Valore<br><span style="font-weight:400;letter-spacing:0;text-transform:none">punti rating</span></th><th></th></tr></thead>
  <tbody>${righe.map((x, i) => riga(x, da + i)).join('')}</tbody></table>`;

const html = `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cosa pensa il bot</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700&display=swap">
<style>
:root {
  --bg:#0c0d11; --surface:#14161d; --surface-2:#1c2030; --line:#262b39; --line-2:#333a4d;
  --text:#fff; --muted:#9aa3b2; --muted-2:#c6cddb; --red:#e01b2e; --gold:#ffd166;
  --ok:#34d399; --bad:#ff5a6a; --cond:'Saira Condensed','Arial Narrow',sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font:400 16px/1.55 Barlow,sans-serif;padding:0 0 60px;overflow-x:hidden}
.wrap{max-width:980px;margin:0 auto;padding:22px 16px}
h1{font:800 32px/1.05 var(--cond);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px}
h2{font:800 20px var(--cond);letter-spacing:1.4px;text-transform:uppercase;margin:34px 0 4px;color:var(--gold)}
h2:first-of-type{margin-top:22px}
p.sub{color:var(--muted);font-size:14px;margin-bottom:14px;max-width:70ch}
p.sub b{color:var(--muted-2)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:3px;padding:12px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:14px}
th{font:700 9.5px var(--cond);letter-spacing:1.8px;text-transform:uppercase;color:var(--muted);text-align:left;padding:0 6px 7px}
td{padding:6px;border-top:1px solid var(--line);vertical-align:middle}
td.num{color:var(--muted);font:700 12px var(--cond);width:26px;text-align:right}
td.nm{font-weight:600}
td.pos{font:800 11px var(--cond);letter-spacing:1.2px;color:var(--muted);width:34px}
td.ovr{font:800 15px var(--cond);color:var(--muted-2);width:38px;text-align:right}
td.val{font:800 16px var(--cond);color:var(--gold);width:48px;text-align:right}
td.b{width:34%}
.bar{display:block;height:7px;background:var(--surface-2);border-radius:4px;overflow:hidden}
.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--red),var(--gold))}
.due{display:grid;gap:12px}
@media(min-width:800px){.due{grid-template-columns:1fr 1fr}}
.ruoli{display:grid;gap:8px}
.ruolo{display:flex;align-items:baseline;gap:10px;padding:8px 10px;background:var(--surface-2);border-radius:3px}
.ruolo b{font:800 14px var(--cond);letter-spacing:1.4px;width:32px}
.ruolo .m{font:800 17px var(--cond);color:var(--gold);width:52px;text-align:right}
.ruolo .q{font-size:12.5px;color:var(--muted);flex:1}
.ctx td.d{font:800 15px var(--cond);text-align:right;width:56px}
.giu{color:var(--bad)} .su{color:var(--ok)}
.nota{border-left:3px solid var(--gold);padding:10px 12px;background:var(--surface-2);
  font-size:14px;color:var(--muted-2);border-radius:0 3px 3px 0;margin:12px 0}
.nota b{color:var(--text)}
</style></head>
<body><div class="wrap">

<h1>Cosa pensa il bot dei giocatori</h1>
<p class="sub">È l'unica parte che non posso verificare da solo: una formula coerente può dire
benissimo cose assurde di pallacanestro. Dimmi quali righe sono sbagliate.</p>

<div class="nota"><b>Il valore NON sono crediti.</b> È di quanto migliora la squadra se lo aggiungi,
misurato in <b>punti di rating del motore</b>: si fa giocare la stessa rosa con e senza di lui,
riempiendo gli altri posti con riserve di livello minimo.
<br><br>
Per darti la scala: il divario medio di rating fra due squadre complete a fine asta è
<b>13 punti</b>. Qui i valori vanno da ${vMin.toFixed(0)} a ${vMax.toFixed(0)}, perché misurano
il salto da <i>una riserva scarsa</i> a <i>lui</i> — non da un giocatore normale a lui.
Il confronto fra giocatori regge (è lo stesso metro per tutti); la cifra presa da sola no.
<br><br>
Quanto il bot poi <b>paga</b> è un'altra cosa, e dipende dalla cassa e da quanti posti restano
agli avversari: nella partita vera valutava Sengun 48 punti, era disposto a spendere fino a
19 crediti, e l'ha preso a 4.</div>

<h2>I trenta che valgono di più</h2>
<p class="sub">A rosa vuota, cioè prima di qualunque considerazione di ruolo già coperto.</p>
<div class="card">${tabella(vuota.slice(0, 30))}</div>

<h2>I quindici che valgono di meno</h2>
<p class="sub">Da qui il bot non passa: sono i giocatori che non prenderebbe mai sopra 1 credito.</p>
<div class="card">${tabella(vuota.slice(-15), vuota.length - 15)}</div>

<h2>Quanto conta il ruolo</h2>
<p class="sub">Valore medio per posizione. Se un ruolo domina, il bot comprerà sempre lì —
e va verificato che sia una verità del gioco e non un difetto della formula.</p>
<div class="card"><div class="ruoli">
${SLOTS.map((sl) => `<div class="ruolo">
  <b>${sl}</b>
  <span class="m">${perRuolo[sl].medio.toFixed(1)}</span>
  <span class="q">${perRuolo[sl].n} giocatori · i migliori: ${perRuolo[sl].top.map((x) => `${esc(x.p.n)} ${x.v.toFixed(0)}`).join(' · ')}</span>
</div>`).join('')}
</div></div>

<h2>L'effetto del ruolo già coperto</h2>
<p class="sub">Lo stesso giocatore, valutato tre volte: da solo, con un compagno del suo stesso ruolo,
e con un fuoriclasse di ruolo diverso. <b>Il valore deve crollare nella colonna di mezzo</b>: se non lo fa,
il bot comprerebbe due centri e li manderebbe in campo fuori posizione.</p>
<div class="card"><table class="ctx">
<thead><tr><th>Giocatore</th><th>Da solo</th><th>Con un doppione</th><th>Con altro ruolo</th></tr></thead>
<tbody>${contesto.map((c) => `<tr>
  <td class="nm">${esc(c.chi.n)} <span class="pos">${c.sl}</span></td>
  <td class="d">${c.solo.toFixed(0)}</td>
  <td class="d ${c.conDoppione < c.solo ? 'giu' : 'su'}">${c.conDoppione.toFixed(0)}</td>
  <td class="d">${c.conAltro.toFixed(0)}</td>
</tr>`).join('')}</tbody></table>
<p class="sub" style="margin:10px 0 0">Doppione = il miglior giocatore dello stesso ruolo. Altro ruolo = un 95+ di posizione diversa.</p>
</div>

<h2>Gli archetipi, dal più al meno premiato</h2>
<p class="sub">È qui che vivono quasi tutte le sorprese. Un giocatore forte con un archetipo che il motore
non ama resta indietro qualunque sia il suo overall — <b>Kobe è 24° non perché sia Kobe, ma perché è un
iso-scorer</b>. Se una riga in fondo a questa tabella ti sembra ingiusta, si corregge il profilo
dell'archetipo in <code>data/archetypes.json</code> e cambiano tutti i giocatori che lo usano.</p>
<div class="card"><table>
<thead><tr><th>Archetipo</th><th>Quanti</th><th>OVR medio</th><th>Valore medio</th><th>Il migliore</th></tr></thead>
<tbody>${clsArc.map((c) => `<tr>
  <td class="nm">${esc(c.a)}</td>
  <td class="num">${c.n}</td>
  <td class="ovr">${c.ovrMedio.toFixed(1)}</td>
  <td class="val" style="color:${c.medio >= 0 ? 'var(--gold)' : 'var(--bad)'}">${c.medio.toFixed(1)}</td>
  <td class="nm" style="font-weight:400;color:var(--muted-2)">${esc(c.top.p.n)} <span class="pos">${pos_(c.top.p.id)}°</span></td>
</tr>`).join('')}</tbody></table></div>

<h2>Dove il bot non la pensa come te</h2>
<p class="sub">Le righe da guardare per prime: il divario fra il posto in classifica per overall e
quello per valore. <b>Sono le scelte che a un occhio umano sembreranno sbagliate</b> — a volte perché lo sono.</p>
<div class="due">
  <div class="card">
    <h3 style="font:800 13px var(--cond);letter-spacing:1.6px;text-transform:uppercase;color:var(--ok);margin-bottom:8px">Il bot li vuole più di quanto dica l'overall</h3>
    <table><thead><tr><th>Giocatore</th><th>OVR</th><th>per overall</th><th>per valore</th></tr></thead>
    <tbody>${sottovalutati.map((x) => `<tr>
      <td class="nm">${esc(x.p.n)} <span class="pos">${x.p.pos}</span></td>
      <td class="ovr">${x.p.ovr}</td><td class="num">${x.ro}°</td>
      <td class="val">${x.rv}°</td></tr>`).join('')}</tbody></table>
  </div>
  <div class="card">
    <h3 style="font:800 13px var(--cond);letter-spacing:1.6px;text-transform:uppercase;color:var(--bad);margin-bottom:8px">Il bot li snobba nonostante l'overall</h3>
    <table><thead><tr><th>Giocatore</th><th>OVR</th><th>per overall</th><th>per valore</th></tr></thead>
    <tbody>${sopravvalutati.map((x) => `<tr>
      <td class="nm">${esc(x.p.n)} <span class="pos">${x.p.pos}</span></td>
      <td class="ovr">${x.p.ovr}</td><td class="num">${x.ro}°</td>
      <td class="val">${x.rv}°</td></tr>`).join('')}</tbody></table>
  </div>
</div>

<div class="nota" style="margin-top:26px">Come si correggono. Se una valutazione è sbagliata,
quasi sempre la colpa non è del bot ma dei dati: si cambia l'<b>archetipo</b> del giocatore, il suo
<b>overall</b>, oppure gli si mette un <b>mod</b> su un singolo attributo (vedi il README).
Il bot legge gli stessi numeri che legge il motore, quindi correggere qui corregge anche le partite.</div>

</div></body></html>`;

writeFileSync(uscita, html, 'utf8');
console.log(`\n  valutazioni in ${uscita}`);
console.log(`  ${D.players.length} giocatori, valore da ${vMin.toFixed(0)} a ${vMax.toFixed(0)}`);
console.log(`  media per ruolo: ${SLOTS.map((sl) => `${sl} ${perRuolo[sl].medio.toFixed(0)}`).join('  ')}\n`);
