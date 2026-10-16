// lingua.js — italiano o inglese.
//
// Un'app sola, due indirizzi: la versione inglese sta in /en/ (una pagina
// che carica gli stessi file, vedi en/index.html). Niente copia del codice:
// con una copia ogni modifica andrebbe fatta due volte, e prima o poi le due
// versioni smetterebbero di essere lo stesso gioco.
//
// La lingua si legge dall'indirizzo: /en/ o ?lang=en per l'inglese, tutto il
// resto italiano. Nel database non cambia niente: una stanza aperta in
// italiano si gioca anche dal link inglese, ognuno legge nella sua lingua.
//
// tr('testo', 'text') sta accanto a ogni scritta visibile: le due versioni
// restano una sotto l'altra e nessuna delle due si dimentica.

function leggiLingua() {
  try {
    const q = new URLSearchParams(globalThis.location?.search || '').get('lang');
    if (q) return q === 'en' ? 'en' : 'it';
    return /\/en(\/|$)/.test(globalThis.location?.pathname || '') ? 'en' : 'it';
  } catch {
    return 'it';
  }
}

export const LINGUA = leggiLingua();
export const EN = LINGUA === 'en';
export const tr = (it, en) => (EN ? en : it);

// Plurali: tr secco non basta quando il numero decide la parola.
export const pl = (n, it1, itN, en1, enN) => (n === 1 ? tr(it1, en1) : tr(itN, enN));
