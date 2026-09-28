# Accendere le stanze multiplayer

Serve una volta sola, sono circa 3 minuti. Costo: **zero**, nessuna carta di
credito richiesta. Senza questo, il gioco funziona lo stesso ma su un solo
schermo.

---

## Perché serve

Un sito su GitHub Pages è fatto solo di file: non può ricordare niente. Se voi
quattro aprite la stessa pagina, ognuno ha la sua copia isolata e scollegata.
Serve un posto condiviso dove vive lo stato della partita — chi ha rilanciato,
i budget, i roster — che tutti leggono e scrivono insieme.

**Firebase Realtime Database** è quel posto: quando uno scrive, gli altri vedono
il cambiamento in un decimo di secondo senza ricaricare. Il piano gratuito
(*Spark*) dà 1 GB di dati e 10 GB di traffico al mese, e **non va in sleep**.
Una vostra partita pesa qualche KB: siete tre ordini di grandezza sotto i limiti.

**Il login anonimo** suona peggio di quello che è. Firebase vuole sapere "chi"
sta scrivendo per applicare le regole di sicurezza. Il login anonimo assegna a
ogni browser un identificativo casuale in automatico: niente email, niente
password, niente registrazione. Apri il sito e sei già dentro, non te ne accorgi
nemmeno. Serve solo a impedire che un estraneo cancelli la partita.

---

## I passi

### 1. Crea il progetto

[console.firebase.google.com](https://console.firebase.google.com) → accedi con
un account Google (va bene uno personale) → **Crea un progetto** → nome, per
esempio `nba-fantasy` → Google Analytics puoi disattivarlo, non serve.

### 2. Crea il database

Menu di sinistra → **Build** → **Realtime Database** → **Crea database**.

- Regione: **europe-west1** (Belgio) — la più vicina
- Modalità: **test** per ora, la stringiamo al passo 4

> Attenzione: deve essere **Realtime Database**, non Firestore. Sono due prodotti
> diversi e questo gioco usa il primo. Se hai creato Firestore per sbaglio,
> lascialo lì e crea anche l'altro.

### 3. Attiva il login anonimo

**Build** → **Authentication** → **Inizia** → scheda **Sign-in method** →
**Anonimo** → attiva → salva.

Se salti questo passo, il gioco si apre ma nessuno riesce a scrivere.

### 4. Metti le regole di sicurezza

Torna su **Realtime Database** → scheda **Regole** → incolla questo e pubblica:

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": "auth != null",
        ".write": "auth != null",
        ".validate": "newData.hasChildren(['phase', 'teams'])"
      }
    }
  }
}
```

Cosa dicono: si può leggere e scrivere solo dentro `rooms/<codice>`, solo se si
è autenticati (cioè se si è passati dal login anonimo), e solo se quello che si
scrive somiglia a una partita.

**Limite da conoscere:** chiunque conosca il codice di 4 caratteri può entrare e
giocare. Le combinazioni sono circa un milione e le stanze vive sono pochissime,
quindi per una partita fra amici va benissimo — ma non è un segreto crittografico.
Non metteteci niente di personale.

La modalità test del passo 2 scade dopo 30 giorni e smette di funzionare senza
preavviso: **fai davvero questo passo**, non rimandarlo.

### 5. Registra l'app e copia la config

Ingranaggio ⚙ in alto a sinistra → **Impostazioni progetto** → scorri fino a
**Le tue app** → icona **`</>`** (Web) → dai un nome → **Registra app**.

Firebase mostra un blocco così:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "nba-fantasy-a1b2c.firebaseapp.com",
  databaseURL: "https://nba-fantasy-a1b2c-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "nba-fantasy-a1b2c",
  storageBucket: "nba-fantasy-a1b2c.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};
```

Apri `js/firebase-config.js` e sostituisci l'ultima riga con quel blocco,
cambiando `const` in `export const`:

```js
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  ...
};
```

> Se manca la riga `databaseURL`, vuol dire che il passo 2 non è andato a buon
> fine: il database non esiste ancora. Torna indietro e crealo.

### 6. Pubblica

Fai push su GitHub. Apri il sito: adesso vedi "Crea la stanza" invece della
modalità locale. Chi crea passa il link agli altri tre, ognuno sceglie la sua
squadra, si parte.

---

## Sulle chiavi pubbliche

Quelle sette righe finiscono nel JavaScript che chiunque visiti il sito può
leggere. **È normale e voluto:** le chiavi web di Firebase identificano il
progetto, non autorizzano niente. Non sono una password e non c'è nulla da
nascondere. La sicurezza vera sta nelle regole del passo 4 — quelle sì contano.

---

## Problemi frequenti

| Sintomo | Causa quasi certa |
|---|---|
| Resta in modalità locale | `firebase-config.js` esporta ancora `null`, oppure manca `databaseURL` |
| "Permission denied" nella console | Login anonimo non attivato (passo 3) |
| Tutto funziona, poi smette dopo settimane | Regole in modalità test scadute (passo 4) |
| "Nessuna partita con il codice" | Codice sbagliato, o la stanza è stata creata su un altro progetto Firebase |
| I rilanci non arrivano agli altri | Guardate la console del browser: se l'errore parla di `databaseURL`, avete creato Firestore invece del Realtime Database |

---

## Manutenzione

Le stanze restano nel database per sempre. Non è un problema di spazio (pesano
KB), ma ogni tanto puoi fare pulizia: **Realtime Database** → **Dati** → elimina
il nodo `rooms`. Cancella solo le partite vecchie, non la configurazione.
