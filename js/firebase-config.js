// firebase-config.js
//
// Configurazione del progetto Firebase che ospita le stanze multiplayer.
//
// Queste chiavi sono PUBBLICHE per costruzione: finiscono nel JavaScript che
// chiunque visiti il sito può leggere. Identificano il progetto, non
// autorizzano niente. Non sono una password. La sicurezza vera sta nelle
// regole del Realtime Database — vedi SETUP.md, passo 4.
//
// Per tornare alla modalità locale (un solo schermo) senza toccare questo file,
// basta aprire il sito con ?local=1 in fondo all'indirizzo.

export const firebaseConfig = {
  apiKey: 'AIzaSyDKujGTAbtdB45u8SFzkqM4_VgaqLjv2GU',
  authDomain: 'nba-fantasy-1947b.firebaseapp.com',
  databaseURL: 'https://nba-fantasy-1947b-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'nba-fantasy-1947b',
  storageBucket: 'nba-fantasy-1947b.firebasestorage.app',
  messagingSenderId: '582943643217',
  appId: '1:582943643217:web:98e7d194aa8aa4d0528a70',
};
