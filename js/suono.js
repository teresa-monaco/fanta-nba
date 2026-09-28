// suono.js — segnali acustici dell'asta, generati dal browser.
//
// Perche serve: durante un'asta dal vivo si guardano in faccia gli altri, non
// lo schermo. Senza un segnale si perdono lotti senza accorgersene.
//
// Niente file audio: due oscillatori e una busta di volume. Zero download,
// zero latenza, funziona offline.
//
// Su iOS l'audio parte SOSPESO finche non c'e un gesto dell'utente: la prima
// cosa che chiunque tocca e un bottone, quindi ci si aggancia a quello.

let ctx = null;
let acceso = true;
try { acceso = localStorage.getItem('nbaf:audio') !== 'off'; } catch { /* ignora */ }

export function audioAcceso() { return acceso; }

export function commutaAudio() {
  acceso = !acceso;
  try { localStorage.setItem('nbaf:audio', acceso ? 'on' : 'off'); } catch { /* ignora */ }
  if (acceso) { sblocca(); beep(880, 0.06, 0.18); }
  return acceso;
}

// Va chiamata da dentro un gestore di eventi, altrimenti iOS la ignora.
export function sblocca() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}

function beep(freq, durata, volume = 0.22, tipo = 'sine') {
  if (!acceso || !ctx || ctx.state !== 'running') return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tipo;
    osc.frequency.value = freq;
    // Attacco e rilascio morbidi: un'onda tagliata di netto fa "click".
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durata);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + durata + 0.02);
  } catch { /* l'audio non deve mai rompere il gioco */ }
}

/* ---------- I tre segnali ---------- */

// Ultimi secondi: un tic secco, piu acuto man mano che ci si avvicina.
export function tic(secondiRimasti) {
  beep(660 + (5 - secondiRimasti) * 90, 0.07, 0.16, 'square');
}

// Lotto aggiudicato: due note discendenti, come un martelletto.
export function martelletto() {
  beep(520, 0.11, 0.26);
  setTimeout(() => beep(330, 0.22, 0.24), 90);
}

// Nuovo giocatore all'asta: una nota breve verso l'alto.
export function nuovoLotto() {
  beep(500, 0.07, 0.14);
  setTimeout(() => beep(750, 0.10, 0.14), 70);
}
