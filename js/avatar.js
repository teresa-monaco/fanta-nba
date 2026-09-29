// avatar.js — la faccia di un allenatore, disegnata da pochi tratti.
//
// Non e un ritratto e non prova a esserlo: sono capelli, colore, barba o
// baffi, occhiali e incarnato montati su una testa sempre uguale. Serve a
// riconoscere chi stai guardando mentre scorri, non a somigliargli. Le foto
// vere non si possono usare (sono di qualcun altro) e un avatar generato non
// ha bisogno di nessun file da scaricare.

const PELLE = { chiara: '#e8b58e', olivastra: '#c98d63', scura: '#7a4a2d' };
const OMBRA = { chiara: '#d09a71', olivastra: '#a9714b', scura: '#5e3720' };
const CAPELLI = {
  bianco: '#e9edf3', grigio: '#a8b0bd', scuro: '#241d1a',
  castano: '#5a3a24', biondo: '#c79a4e', rosso: '#a8462a',
};

// Le giacche girano sui colori delle squadre: due allenatori vicini nella
// lista non devono sembrare la stessa persona in due pose.
const GIACCHE = ['#2b3346', '#3a2f4d', '#1f3b3a', '#432a2a', '#24344f', '#3d3524'];

function hash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function avatarSVG(coach, size = 76) {
  const tratti = new Set(String(coach?.look || 'corti,castano').split(',').map((x) => x.trim()));
  const pelleNome = tratti.has('scura') ? 'scura' : (tratti.has('olivastra') ? 'olivastra' : 'chiara');
  const pelle = PELLE[pelleNome];
  const ombra = OMBRA[pelleNome];
  const colore = CAPELLI[[...tratti].find((t) => CAPELLI[t])] || CAPELLI.castano;
  const giacca = GIACCHE[hash(coach?.id || 'x') % GIACCHE.length];

  const capelli = tratti.has('calvo') ? 'calvo'
    : tratti.has('rado') ? 'rado'
      : tratti.has('folti') ? 'folti'
        : tratti.has('riccio') ? 'riccio' : 'corti';

  // --- capigliature ---
  let testa = '';
  if (capelli === 'rado') {
    // Stempiato: due chiazze ai lati, niente sopra.
    testa = `<path d="M17 34c0-9 5-14 9-15-1 5-1 9 0 13z" fill="${colore}"/>
             <path d="M55 34c0-9-5-14-9-15 1 5 1 9 0 13z" fill="${colore}"/>`;
  } else if (capelli === 'folti') {
    testa = `<path d="M15 33c0-14 9-22 21-22s21 8 21 22c0-6-8-9-21-9s-21 3-21 9z" fill="${colore}"/>
             <path d="M14 33c-1 8 1 13 2 13-2-7-1-11 0-14z" fill="${colore}"/>`;
  } else if (capelli === 'riccio') {
    testa = `<g fill="${colore}">
               <circle cx="22" cy="24" r="7"/><circle cx="31" cy="19" r="7.5"/>
               <circle cx="41" cy="19" r="7.5"/><circle cx="50" cy="24" r="7"/>
               <circle cx="26" cy="30" r="6"/><circle cx="46" cy="30" r="6"/>
             </g>`;
  } else if (capelli === 'corti') {
    testa = `<path d="M16 32c0-12 9-19 20-19s20 7 20 19c-3-7-10-10-20-10s-17 3-20 10z" fill="${colore}"/>`;
  }

  // --- barba, baffi, pizzetto ---
  let faccia = '';
  if (tratti.has('barba')) {
    faccia += `<path d="M20 40c0 13 7 22 16 22s16-9 16-22c0 9-7 13-16 13s-16-4-16-13z" fill="${colore}" opacity=".95"/>`;
  }
  if (tratti.has('pizzetto')) {
    faccia += `<path d="M30 50c2 3 10 3 12 0 1 4-2 8-6 8s-7-4-6-8z" fill="${colore}"/>`;
  }
  if (tratti.has('baffi')) {
    faccia += `<path d="M27 46c3-2 6-2 9-1 3-1 6-1 9 1-3 2-6 2-9 1-3 1-6 1-9-1z" fill="${colore}"/>`;
  }

  const occhiali = tratti.has('occhiali')
    ? `<g fill="none" stroke="#2c3340" stroke-width="2">
         <circle cx="28" cy="38" r="6"/><circle cx="44" cy="38" r="6"/>
         <path d="M34 38h4M22 37l-4-1M50 37l4-1"/>
       </g>`
    : '';

  return `<svg class="avatar" viewBox="0 0 72 76" width="${size}" height="${size * 76 / 72}"
               role="img" aria-label="${(coach?.n || '').replace(/"/g, '')}">
    <rect width="72" height="76" rx="10" fill="#161a26"/>
    <path d="M6 76c2-13 12-18 30-18s28 5 30 18z" fill="${giacca}"/>
    <path d="M30 58l6 8 6-8 4 2-10 16-10-16z" fill="#e9edf3" opacity=".9"/>
    <path d="M34 60h4l2 6-4 4-4-4z" fill="#8f2230"/>
    <ellipse cx="36" cy="40" rx="20" ry="22" fill="${pelle}"/>
    <path d="M16 40c0 6 2 12 5 16-4-5-6-11-6-16z" fill="${ombra}"/>
    ${testa}
    ${faccia}
    <ellipse cx="28" cy="38" rx="2" ry="2.4" fill="#1b1f28"/>
    <ellipse cx="44" cy="38" rx="2" ry="2.4" fill="#1b1f28"/>
    <path d="M26 33c2-1.5 5-1.5 7 0M39 33c2-1.5 5-1.5 7 0" stroke="${colore}" stroke-width="2" fill="none" stroke-linecap="round"/>
    ${occhiali}
  </svg>`;
}
