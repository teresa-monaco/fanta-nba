// net.js — sincronizzazione dello stato fra i device.
//
// Due modalità, stessa interfaccia:
//   - "cloud": Firebase Realtime Database + login anonimo. Stanze vere.
//   - "local": tutto in memoria + localStorage. Un solo schermo, zero setup.
// Il resto dell'app non sa quale delle due è attiva.
//
// Le scritture passano tutte da una transazione, quindi due rilanci simultanei
// non possono sovrascriversi a vicenda: il secondo rilegge lo stato aggiornato
// e il reducer decide se è ancora valido.

import { firebaseConfig } from './firebase-config.js';
import { hydrate } from './state.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';
let fb = null;          // moduli Firebase caricati
let serverOffset = 0;   // differenza fra orologio locale e server

export const now = () => Date.now() + serverOffset;

export function makeRoomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // niente I/O/0/1, si dettano male
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export function cloudAvailable() {
  // ?local=1 forza la modalità a un solo schermo anche con Firebase configurato:
  // serve per giocare da soli, per provare offline e per i test automatici.
  try {
    if (new URLSearchParams(location.search).has('local')) return false;
  } catch { /* fuori dal browser non esiste location: si prosegue */ }
  return !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.databaseURL);
}

async function loadFirebase() {
  if (fb) return fb;
  const [app, auth, dbm] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-database.js`),
  ]);
  fb = { ...app, ...auth, ...dbm };
  return fb;
}

/* ==========================================================
   Sessione
   ========================================================== */

export async function openRoom({ code, create, initialState, onState }) {
  if (!cloudAvailable()) return openLocal({ code, initialState, onState });

  const f = await loadFirebase();
  const app = f.initializeApp(firebaseConfig);
  const auth = f.getAuth(app);
  const cred = await f.signInAnonymously(auth);
  const uid = cred.user.uid;
  const rdb = f.getDatabase(app);

  // Allinea l'orologio: il cronometro dell'asta deve scadere insieme per tutti.
  f.onValue(f.ref(rdb, '.info/serverTimeOffset'), (snap) => {
    serverOffset = snap.val() || 0;
  });

  const roomRef = f.ref(rdb, `rooms/${code}`);
  const snap = await f.get(roomRef);

  if (create) {
    if (snap.exists()) throw new Error(`La stanza ${code} esiste già. Riprova con un altro codice.`);
    await f.set(roomRef, { ...initialState, host: uid });
  } else if (!snap.exists()) {
    throw new Error(`Nessuna partita con il codice ${code}.`);
  }

  const unsub = f.onValue(roomRef, (s) => {
    const v = s.val();
    if (v) onState(hydrate(v));
  });

  return {
    mode: 'cloud',
    uid,
    code,
    async apply(reducer) {
      const res = await f.runTransaction(roomRef, (cur) => {
        if (!cur) return cur;
        const next = reducer(hydrate(cur));
        return next === undefined ? cur : scrub(next);
      });
      return res.committed;
    },
    close() { unsub(); },
  };
}

function openLocal({ code, initialState, onState }) {
  const KEY = `nbaf:${code || 'local'}`;
  let state = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = hydrate(JSON.parse(raw));
  } catch { /* localStorage può essere bloccato: si riparte da zero */ }
  if (!state) state = hydrate({ ...initialState, host: 'local' });

  const push = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignora */ }
    onState(state);
  };
  queueMicrotask(push);

  return {
    mode: 'local',
    uid: 'local',
    code: code || 'LOCALE',
    async apply(reducer) {
      const next = reducer(state);
      if (next === undefined || next === state) return false;
      state = next;
      push();
      return true;
    },
    close() {},
    reset() {
      try { localStorage.removeItem(KEY); } catch { /* ignora */ }
    },
  };
}

/* ==========================================================
   Sanificazione per Realtime Database
   ========================================================== */

// RTDB cancella le chiavi con valore undefined e rifiuta i NaN. I null sono
// leciti ma equivalgono a una cancellazione: hydrate() li rimette al ritorno.
function scrub(v) {
  if (v === undefined) return null;
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) continue;
      out[k] = scrub(val);
    }
    return out;
  }
  return v;
}
