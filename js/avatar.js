// avatar.js — la faccia di un allenatore, disegnata da pochi tratti.
//
// Non e un ritratto e non prova a esserlo. Serve a riconoscere chi stai
// guardando mentre scorri: due allenatori di fila non devono sembrare la
// stessa persona. Le foto vere non si possono usare (sono di qualcun altro) e
// un avatar generato non ha bisogno di nessun file da scaricare.
//
// DUE SORGENTI, E SERVONO ENTRAMBE.
//
// La prima e il campo `look` nei dati: capelli, colore, barba, occhiali,
// incarnato. Sono i tratti che una persona nota per prima, e sono scritti a
// mano perche devono somigliare a quell'allenatore li.
//
// La seconda e l'identificativo dell'allenatore, da cui si tirano volto,
// naso, bocca, sopracciglia e orecchie. Questa e stata aggiunta dopo, e
// perche la prima da sola non bastava: misurato, 65 allenatori avevano solo
// 30 combinazioni di `look`, e le due piu frequenti — "corti,castano" e
// "corti,grigio" — coprivano 19 allenatori. Con il volto sempre uguale erano
// letteralmente la stessa faccia diciannove volte. Adesso i tratti scritti a
// mano restano quelli che comandano, e il resto della faccia li distingue
// comunque. Il sorteggio e fisso per identificativo: la stessa persona ha
// sempre la stessa faccia, su ogni telefono.

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

// Un dado fisso per allenatore: stessa persona, stessa faccia, ovunque.
function dadi(seme) {
  let h = hash(seme) || 1;
  return (n) => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return (h >>> 3) % n;
  };
}

// I tre tagli di volto. Non e vanita: la sagoma e la prima cosa che si
// distingue da lontano, molto prima del colore dei capelli.
const VOLTI = [
  // tondo
  { d: 'M36 17c11 0 20 9 20 22 0 14-9 23-20 23s-20-9-20-23c0-13 9-22 20-22z', w: 20, t: 17 },
  // lungo e stretto
  { d: 'M36 15c10 0 18 9 18 23 0 16-8 25-18 25s-18-9-18-25c0-14 8-23 18-23z', w: 18, t: 15 },
  // squadrato, mascella piena
  { d: 'M36 17c12 0 20 8 20 21 0 9-2 16-6 20-3 3-8 4-14 4s-11-1-14-4c-4-4-6-11-6-20 0-13 8-21 20-21z', w: 20, t: 17 },
];

export function avatarSVG(coach, size = 76) {
  const tratti = new Set(String(coach?.look || 'corti,castano').split(',').map((x) => x.trim()));
  const pelleNome = tratti.has('scura') ? 'scura' : (tratti.has('olivastra') ? 'olivastra' : 'chiara');
  const pelle = PELLE[pelleNome];
  const ombra = OMBRA[pelleNome];
  const colore = CAPELLI[[...tratti].find((t) => CAPELLI[t])] || CAPELLI.castano;
  const giacca = GIACCHE[hash(coach?.id || 'x') % GIACCHE.length];

  const d = dadi(coach?.id || coach?.n || 'x');
  const volto = VOLTI[d(VOLTI.length)];
  const naso = d(3);
  const bocca = d(3);
  const ciglia = d(3);
  const orecchie = d(4) > 0;          // tre volte su quattro
  // I capelli chiari raccontano un'eta, e l'eta si vede anche nelle pieghe.
  const anziano = colore === CAPELLI.bianco || colore === CAPELLI.grigio;

  const capelli = tratti.has('calvo') ? 'calvo'
    : tratti.has('rado') ? 'rado'
      : tratti.has('folti') ? 'folti'
        : tratti.has('riccio') ? 'riccio' : 'corti';

  // Occhi e sopracciglia si allargano col volto, o su una faccia stretta
  // finiscono sulle tempie.
  const ox = volto.w === 18 ? 7 : 8;      // mezza distanza fra gli occhi
  const sx = 36 - ox, dx = 36 + ox;

  /* --- capigliature --- */
  let testa = '';
  if (capelli === 'rado') {
    testa = `<path d="M${sx - 10} 34c0-9 5-14 9-15-1 5-1 9 0 13z" fill="${colore}"/>
             <path d="M${dx + 10} 34c0-9-5-14-9-15 1 5 1 9 0 13z" fill="${colore}"/>`;
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
    // La riga da un lato: e' un dettaglio minuscolo che cambia molto.
    const riga = d(2) ? 'M22 26c5-5 12-7 18-5' : 'M50 26c-5-5-12-7-18-5';
    testa = `<path d="M16 32c0-12 9-19 20-19s20 7 20 19c-3-7-10-10-20-10s-17 3-20 10z" fill="${colore}"/>
             <path d="${riga}" stroke="${pelle}" stroke-width="1.4" fill="none" opacity=".35"/>`;
  }

  /* --- barba, baffi, pizzetto --- */
  let peli = '';
  if (tratti.has('barba')) {
    peli += `<path d="M20 40c0 13 7 22 16 22s16-9 16-22c0 9-7 13-16 13s-16-4-16-13z" fill="${colore}" opacity=".95"/>`;
  }
  if (tratti.has('pizzetto')) {
    peli += `<path d="M30 50c2 3 10 3 12 0 1 4-2 8-6 8s-7-4-6-8z" fill="${colore}"/>`;
  }
  if (tratti.has('baffi')) {
    peli += `<path d="M27 46c3-2 6-2 9-1 3-1 6-1 9 1-3 2-6 2-9 1-3 1-6 1-9-1z" fill="${colore}"/>`;
  }

  /* --- naso: tre profili --- */
  const NASI = [
    `<path d="M36 37v7l-3 2" stroke="${ombra}" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="M36 37v6c0 1-2 2-4 2m8 0c-2 0-4-1-4-2" stroke="${ombra}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
    `<path d="M35 37c2 3 3 5 2 7l-3 1" stroke="${ombra}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  ];

  /* --- bocca: tre pieghe --- */
  const BOCCHE = [
    `<path d="M31 51q5 2 10 0" stroke="#8a4a42" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
    `<path d="M31 52q5 -2 10 0" stroke="#8a4a42" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
    `<path d="M31 51h10" stroke="#8a4a42" stroke-width="1.7" fill="none" stroke-linecap="round"/>`,
  ];

  /* --- sopracciglia: spessore e inclinazione --- */
  const CIGLIA = [
    `<path d="M${sx - 4} 33c2-1.5 6-1.5 8 0M${dx - 4} 33c2-1.5 6-1.5 8 0" stroke="${colore}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    `<path d="M${sx - 4} 34c2-2.5 6-2 8-.5M${dx - 4} 33.5c2-1.5 6-2 8 .5" stroke="${colore}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    `<path d="M${sx - 4} 32.5h8M${dx - 4} 32.5h8" stroke="${colore}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`,
  ];

  const pieghe = anziano
    ? `<g stroke="${ombra}" stroke-width="1.1" fill="none" opacity=".55" stroke-linecap="round">
         <path d="M26 27h20M28 24h16"/>
         <path d="M31 44c-1 3-1 6 0 8M41 44c1 3 1 6 0 8"/>
       </g>`
    : '';

  const occhiali = tratti.has('occhiali')
    ? (d(2)
      ? `<g fill="none" stroke="#2c3340" stroke-width="2">
           <circle cx="${sx}" cy="38" r="6"/><circle cx="${dx}" cy="38" r="6"/>
           <path d="M${sx + 6} 38h${dx - sx - 12}M${sx - 6} 37l-4-1M${dx + 6} 37l4-1"/>
         </g>`
      : `<g fill="none" stroke="#2c3340" stroke-width="2">
           <rect x="${sx - 6}" y="33.5" width="12" height="9" rx="1.5"/>
           <rect x="${dx - 6}" y="33.5" width="12" height="9" rx="1.5"/>
           <path d="M${sx + 6} 38h${dx - sx - 12}M${sx - 6} 36l-4-1M${dx + 6} 36l4-1"/>
         </g>`)
    : '';

  return `<svg class="avatar" viewBox="0 0 72 76" width="${size}" height="${size * 76 / 72}"
               role="img" aria-label="${(coach?.n || '').replace(/"/g, '')}">
    <rect width="72" height="76" rx="10" fill="#161a26"/>
    <path d="M6 76c2-13 12-18 30-18s28 5 30 18z" fill="${giacca}"/>
    <path d="M30 58l6 8 6-8 4 2-10 16-10-16z" fill="#e9edf3" opacity=".9"/>
    <path d="M34 60h4l2 6-4 4-4-4z" fill="#8f2230"/>
    ${orecchie ? `<ellipse cx="${36 - volto.w}" cy="41" rx="2.6" ry="4" fill="${pelle}"/>
                  <ellipse cx="${36 + volto.w}" cy="41" rx="2.6" ry="4" fill="${pelle}"/>` : ''}
    <path d="${volto.d}" fill="${pelle}"/>
    <path d="M${36 - volto.w} 40c0 6 2 12 5 16-4-5-6-11-6-16z" fill="${ombra}"/>
    ${testa}
    ${peli}
    ${pieghe}
    <ellipse cx="${sx}" cy="38" rx="2" ry="2.4" fill="#1b1f28"/>
    <ellipse cx="${dx}" cy="38" rx="2" ry="2.4" fill="#1b1f28"/>
    ${NASI[naso]}
    ${tratti.has('barba') || tratti.has('pizzetto') ? '' : BOCCHE[bocca]}
    ${CIGLIA[ciglia]}
    ${occhiali}
  </svg>`;
}
