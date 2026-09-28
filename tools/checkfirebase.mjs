// checkfirebase.mjs — verifica dal vivo che il progetto Firebase sia pronto.
//
// Controlla i tre pezzi che devono funzionare insieme, nell'ordine in cui
// li usa il gioco: login anonimo, scrittura autenticata, regole che bloccano
// chi non è autenticato. Crea una stanza di prova e la cancella.
//
//   node tools/checkfirebase.mjs

import { firebaseConfig } from '../js/firebase-config.js';

if (!firebaseConfig?.databaseURL) {
  console.log('\nfirebase-config.js non è configurato: il gioco resta in modalità locale.\n');
  process.exit(1);
}

const DB = firebaseConfig.databaseURL.replace(/\/$/, '');
const ROOM = 'ZZTEST';
let fails = 0;
const ok = (c, label, extra = '') => {
  console.log(`  ${c ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  if (!c) fails++;
};

console.log(`\nProgetto: ${firebaseConfig.projectId}`);
console.log(`Database: ${DB}\n`);

/* 1. Login anonimo */
let idToken = null, uid = null;
try {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) },
  );
  const j = await r.json();
  if (j.idToken) { idToken = j.idToken; uid = j.localId; }
  ok(!!idToken, 'login anonimo attivo', idToken ? `utente ${uid.slice(0, 8)}…` : (j.error?.message || 'errore sconosciuto'));
  if (!idToken && j.error?.message === 'ADMIN_ONLY_OPERATION') {
    console.log('        → Authentication → Sign-in method → abilita "Anonimo" (SETUP.md, passo 3)');
  }
} catch (e) {
  ok(false, 'login anonimo attivo', e.message);
}

/* 2. Il database risponde */
try {
  const r = await fetch(`${DB}/.json?shallow=true`);
  ok(r.status === 200 || r.status === 401, 'il Realtime Database esiste e risponde', `HTTP ${r.status}`);
  if (r.status === 404) console.log('        → creato Firestore invece del Realtime Database? (SETUP.md, passo 2)');
} catch (e) {
  ok(false, 'il Realtime Database esiste e risponde', e.message);
}

/* 3. Le regole bloccano chi non è autenticato */
try {
  const r = await fetch(`${DB}/rooms/${ROOM}.json`, {
    method: 'PUT', body: JSON.stringify({ phase: 'lobby', teams: {} }),
  });
  const locked = r.status === 401 || r.status === 403;
  ok(locked, 'le regole bloccano le scritture non autenticate',
    locked ? 'protetto' : `HTTP ${r.status} — chiunque può scrivere`);
  if (!locked) {
    console.log('        → sei ancora in "modalità test": incolla le regole di SETUP.md, passo 4.');
    console.log('        → la modalità test scade da sola dopo 30 giorni e il gioco smette di funzionare.');
    await fetch(`${DB}/rooms/${ROOM}.json`, { method: 'DELETE' });
  }
} catch (e) {
  ok(false, 'le regole bloccano le scritture non autenticate', e.message);
}

/* 4. Scrittura e lettura autenticate (è quello che fa il gioco) */
if (idToken) {
  const payload = { phase: 'lobby', teams: { t1: { credits: 50 } }, host: uid };
  try {
    const w = await fetch(`${DB}/rooms/${ROOM}.json?auth=${idToken}`, { method: 'PUT', body: JSON.stringify(payload) });
    ok(w.ok, 'un utente anonimo può creare una stanza', `HTTP ${w.status}`);
    if (!w.ok) console.log('        →', (await w.text()).slice(0, 160));

    const g = await fetch(`${DB}/rooms/${ROOM}.json?auth=${idToken}`);
    const back = await g.json();
    ok(back?.phase === 'lobby' && back?.teams?.t1?.credits === 50,
      'e rileggere quello che ha scritto');

    const d = await fetch(`${DB}/rooms/${ROOM}.json?auth=${idToken}`, { method: 'DELETE' });
    ok(d.ok, 'e cancellarla (stanza di prova rimossa)');
  } catch (e) {
    ok(false, 'scrittura autenticata', e.message);
  }

  /* 5. La regola di validazione respinge dati che non sono una partita */
  try {
    const r = await fetch(`${DB}/rooms/${ROOM}.json?auth=${idToken}`, { method: 'PUT', body: JSON.stringify({ spazzatura: 1 }) });
    ok(!r.ok, 'la validazione respinge dati che non sono una partita',
      r.ok ? 'accettati: manca la riga .validate nelle regole' : 'respinti');
    if (r.ok) await fetch(`${DB}/rooms/${ROOM}.json?auth=${idToken}`, { method: 'DELETE' });
  } catch { /* non bloccante */ }
}

console.log(fails === 0
  ? '\nFirebase è pronto: le stanze multiplayer funzionano.\n'
  : `\n${fails} controlli da sistemare — vedi SETUP.md.\n`);
console.log('Nota: questo test ha creato un utente anonimo nel progetto. È innocuo;\n' +
  'se vuoi, lo cancelli da Authentication → Users.\n');
process.exit(fails === 0 ? 0 : 1);
