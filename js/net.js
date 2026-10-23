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
import { tr } from './lingua.js';

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
    if (snap.exists()) throw new Error(tr(`La stanza ${code} esiste già. Riprova con un altro codice.`, `Room ${code} already exists. Try another code.`));
    await f.set(roomRef, { ...initialState, host: uid });
  } else if (!snap.exists()) {
    throw new Error(tr(`Nessuna partita con il codice ${code}.`, `No game with code ${code}.`));
  }

  const unsub = f.onValue(roomRef, (s) => {
    const v = s.val();
    if (v) onState(hydrate(v));
  });

  // LE REAZIONI VIAGGIANO A PARTE, sotto reazioni/CODICE e non dentro la
  // stanza: ogni cambio della stanza ridisegna la pagina a tutti, e una
  // pioggia di emoji la farebbe ridisegnare di continuo. Si ascoltano solo
  // quelle arrivate da adesso in poi, e ognuna si cancella da sola dopo
  // dieci secondi: lo storico delle emoji non serve a nessuno.
  const reazRef = f.ref(rdb, `reazioni/${code}`);
  const ascoltatori = new Set();
  const unsubReaz = f.onChildAdded(f.query(reazRef, f.orderByChild('t'), f.startAt(now() - 2000)), (snap) => {
    const r = snap.val();
    if (r) for (const cb of ascoltatori) cb(r);
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
    reagisci(e) {
      const nuova = f.push(reazRef, { e, uid, t: now() });
      setTimeout(() => { f.remove(nuova).catch(() => {}); }, 10000);
    },
    onReazione(cb) { ascoltatori.add(cb); return () => ascoltatori.delete(cb); },
    // LO STORICO PER NOME, fuori dalle stanze: vale fra serate con codici
    // diversi. Una riga per serata e per persona, con la serata come chiave:
    // scriverla due volte non conta doppio.
    async scriviStorico(voci) {
      await Promise.all(voci.map((v) => f.set(f.ref(rdb, `storico/${chiaveSicura(v.nome)}/serate/${chiaveSicura(v.seed)}`), { ...v.dati, nome: v.nome })));
    },
    async leggiStorico(nomi) {
      const out = {};
      await Promise.all(nomi.map(async (n) => {
        const snap = await f.get(f.ref(rdb, `storico/${chiaveSicura(n)}/serate`));
        out[n] = snap.exists() ? Object.values(snap.val()) : [];
      }));
      return out;
    },
    close() { unsub(); unsubReaz(); },
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
  const ascoltatori = new Set();

  return {
    mode: 'local',
    uid: 'local',
    code: code || 'LOCALE',
    // Su un solo schermo la reazione torna subito a chi l'ha mandata.
    reagisci(e) { for (const cb of ascoltatori) cb({ e, uid: 'local', t: Date.now() }); },
    // Su un solo schermo non c'e uno storico fra serate: niente da salvare.
    async scriviStorico() {},
    async leggiStorico() { return {}; },
    onReazione(cb) { ascoltatori.add(cb); return () => ascoltatori.delete(cb); },
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

// Una chiave del database non puo contenere . # $ [ ] / e niente spazi: il
// nome si normalizza cosi, e "Diego" e " diego " diventano la stessa persona.
export function chiaveSicura(x) {
  return String(x ?? '').trim().toLowerCase().replace(/[.#$[\]/\s]+/g, '_') || '_';
}

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
