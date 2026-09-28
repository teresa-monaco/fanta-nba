# Fanta NBA

Asta a crediti fra quattro squadre, costruzione dei quintetti, playoff simulati.
Gira interamente nel browser: niente installazione, niente server, niente account.

Trasposizione web delle regole di `NBA gioco regole.txt`, con una differenza
voluta: l'asta non è più a voce con un segnapunti, è un'asta vera a rilanci con
ognuno sul proprio telefono.

---

## Come si gioca

**0. Chi gioca.** Da **2 a 4 squadre**. Si scrive il nome e la squadra viene
assegnata: non si sceglie, così non si perdono cinque minuti a contrattare i
colori. Chi ospita fa partire con quanti ci sono.

**1. Asta.** Ogni squadra parte con **50 crediti** e deve comprare **5 giocatori**.
Il sistema estrae un giocatore dal pool (260 nomi, picco NBA 2K fra 85 e 100),
parte un cronometro e si rilancia. Ogni rilancio rimette il timer a 8 secondi:
chi resta in testa allo scadere se lo porta a casa.

C'è una **regola di riserva** automatica: non puoi spendere tanto da non
poterti più permettere gli slot che ti restano. Se ti mancano 3 giocatori,
almeno 3 crediti restano bloccati. Nessuno rimane a secco.

Chi ospita può sempre scavalcare l'asta e assegnare un giocatore a mano al
prezzo che decide — utile se vi mettete d'accordo a voce.

**2. Le squadre.** Una schermata sola. Il quintetto lo assegna l'app
minimizzando gli adattamenti — serve a **capire cosa hai comprato**, non a
decidere: sopra c'è il profilo in chiaro (*spacing totale, ferro scoperto,
troppe stelle*). Se proprio vuoi correggerlo c'è "Modifica". Sotto scegli
**primo violino**, **secondo violino** e una delle 11 **strategie offensive**.

**3. Playoff.** Il tabellone cambia col numero di squadre:

| Squadre | Formato |
|---|---|
| 4 | due semifinali → Finals → finalina 3°/4° |
| 3 | il bye alla finale si **sorteggia**, gli altri due giocano la semifinale; chi la perde è terzo |
| 2 | solo le Finals |

Con quattro, le semifinali si accoppiano cercando il **contrasto stilistico
massimo** e l'app spiega perché. Le serie si scoprono **due gare alla volta**;
le **Finals una gara alla volta**, premendo "Vai" — così la tensione sale invece
di restare piatta.

**4. Albo d'oro.** Ogni partita conclusa resta: campione, quintetto, MVP. Più
una classifica fra voi. Sopravvive a "Nuova partita".

---

## Modalità locale e modalità stanza

| | Locale | Stanza |
|---|---|---|
| Serve configurare qualcosa | No | Firebase, 3 minuti una volta sola |
| Chi comanda | Una persona sola, su un solo schermo | Ognuno dal proprio telefono |
| Rilanci | Li digita chi ospita | Li fa ognuno per sé, in tempo reale |

Finché `js/firebase-config.js` esporta `null`, parte la modalità locale.
Per accendere le stanze → **[SETUP.md](SETUP.md)**.

Nelle stanze, le squadre su cui **nessuno si è seduto** le gestisce chi ospita:
si può giocare anche in tre, o in due.

**Limite da conoscere:** è chi ospita a far scattare la chiusura dei lotti (se
lo facessero tutti e quattro i device, quattro transazioni simultanee
proverebbero ad assegnare lo stesso giocatore). Quindi se chi ospita chiude il
tab, l'asta si ferma finché non riapre. Lo stato è salvo sul database, non si
perde niente: basta che torni.

---

## Provarlo sul tuo computer

I moduli ES non funzionano aprendo il file con doppio clic (il browser blocca
`file://`). Serve un server locale, una riga:

```bash
cd nba-fantasy
python -m http.server 8000     # oppure:  npx serve .
```

Poi apri `http://localhost:8000`.

---

## Pubblicarlo su GitHub Pages

Non c'è build: si pubblica quello che c'è.

1. Crea un repository (pubblico, se vuoi Pages gratis) e caricaci questa cartella
2. Repository → **Settings** → **Pages**
3. *Source*: **Deploy from a branch** · *Branch*: `main` · *Folder*: `/ (root)`
4. Dopo un minuto il sito è su `https://<tuo-utente>.github.io/<repo>/`

Dal telefono, "Aggiungi alla schermata Home" lo installa come un'app.

---

## Come funziona dentro

```
index.html            pagina unica
css/style.css         stile, mobile-first
data/players.json     260 giocatori
data/archetypes.json  20 archetipi → attributi
js/core.js            RNG deterministico, derivazione attributi, costanti
js/engine.js          motore di simulazione (profili, matchup, serie, bracket)
js/narrator.js        cronaca e "perché ha vinto", generati dai fattori
js/state.js           stato condiviso e regole (asta, budget, fasi)
js/net.js             sincronizzazione: Firebase oppure locale
js/ui.js              rendering delle cinque schermate
js/app.js             avvio e gestione dei click
tools/                test e diagnostiche (vedi sotto)
```

**Il motore è deterministico.** Stesso seed, stessa partita. È il trucco che
tiene sincronizzati i device: sul database finisce solo il *seed* della serie,
mai i risultati — ogni telefono ricalcola da sé le stesse identiche gare. Lo
stato condiviso resta di pochi KB e due schermi non possono mai divergere.

**Il narratore non inventa.** Ogni frase nasce da un fattore che il motore ha
davvero calcolato o da una riga di box score reale. Se il testo dice "ha vinto
a rimbalzo", quel vantaggio esiste nei numeri.

---

## Rinominare le squadre

Una riga sola, in `js/core.js`:

```js
export const TEAM_NAMES = { t1: 'USZ', t2: 'FollowTheLeader', t3: 'Volta Reno', t4: 'R4cist' };
```

Le chiavi `t1…t4` sono **posizioni**, non nomi: reggono i colori in CSS
(`.t-t1` … `.t-t4`) e le partite già salvate. Cambia solo i valori, mai le chiavi.

## Modificare i giocatori

`data/players.json`, una riga per giocatore:

```json
{ "id": "jordan", "n": "Michael Jordan", "ovr": 99, "pos": "SG",
  "alt": ["SF"], "arc": "all-around-star", "era": "1990s", "tm": "Bulls" }
```

Gli otto attributi **non si scrivono a mano**. Funziona come in 2K: l'**archetipo**
dice *che giocatore è* (un profilo assoluto 0-100 in `data/archetypes.json`),
l'**overall** dice *quanto è bravo* e scala quel profilo. Un'ancora difensiva
ha davvero 20 di tiro da 3 e 97 di protezione del ferro; un tiratore ha l'opposto.

Se un giocatore ti sembra sbagliato, cambia il suo `ovr` o il suo `arc`. Se
sbagliata ti sembra un'intera *categoria* di giocatori, correggi il profilo
dell'archetipo: cambia tutti quelli che lo usano in un colpo solo.

### Quando l'archetipo non basta: `mod`

Alcuni giocatori sfuggono alla loro categoria. Jason Kidd era un playmaker puro
che rimbalzava come un'ala; Penny Hardaway molto meno di quanto dica il suo.
Per questi c'è una via di fuga, uno scostamento sul singolo attributo:

```json
{ "id": "kidd", ..., "arc": "floor-general", "mod": { "reb": 23 } }
```

Vale per qualunque attributo (`sco tre pla reb dif dpe atl usg`), in positivo o
in negativo, e si applica al profilo **prima** che l'overall lo scali. Usalo per
le eccezioni, non per aggiustare tutti: se ti serve su mezza categoria, il
problema è il profilo dell'archetipo. Un test controlla che le chiavi esistano
davvero (un refuso verrebbe ignorato in silenzio) e che nessuna correzione sia
così grande da svuotare l'archetipo.

> Attenzione: cambiare i profili sposta le soglie interne del motore
> (cosa conta come "tiratore", quando scatta "ferro scoperto"). Dopo una
> modifica sostanziale lancia `node tools/calibra.mjs` per vedere dove cadono
> i valori e `node tools/balance.mjs` per controllare che le serie restino
> plausibili.

> **Onestà sui dati:** gli overall sono **ricostruzioni plausibili**, non i
> rating ufficiali 2K. Non esiste una fonte gratuita e scaricabile di quei dati.
> Se una valutazione vi sembra sbagliata, probabilmente lo è: correggetela.

---

## Test

```bash
node tools/selftest.mjs    # dati, distribuzioni, statistiche, determinismo, testi
node tools/flowtest.mjs    # 200 partite intere: nessuna regola deve rompersi
node tools/domtest.mjs     # l'app vera attraverso tutte e cinque le schermate
node tools/balance.mjs     # diagnostica di taratura (non fallisce mai)
node tools/fairness.mjs    # le quattro sedie valgono uguale? (non fallisce mai)
node tools/spread.mjs      # quanto sono varie le valutazioni
node tools/calibra.mjs     # dove cadono i valori, per scegliere le soglie del motore
node tools/audit-gioco.mjs # le scelte che il gioco chiede contano davvero?
node tools/bye.mjs         # con tre squadre, quanto vale saltare la semifinale

node tools/checkfirebase.mjs   # parla col progetto vero: login anonimo, regole, scrittura
```

`checkfirebase` è quello da lanciare quando il multiplayer non va: dice quale
dei tre pezzi (database, login anonimo, regole) è fuori posto, invece di
lasciarti indovinare guardando la console del browser.

Per giocare da solo su un unico schermo anche con Firebase attivo, apri il sito
con **`?local=1`** in fondo all'indirizzo.

`selftest` non verifica solo che il codice giri: verifica che i risultati siano
**plausibili**. Che esistano sia gli sweep sia le gare 7, che il 4-3 non domini,
che lo scarto medio somigli a quello vero, che nessuno segni 70 punti.

### Taratura del motore

Due costanti in `js/engine.js` governano tutto:

```js
const RATING_WEIGHT = 0.0047;  // quanto pesa il divario di forza
const GAME_SIGMA    = 8.5;     // quanto pesa il caso
```

Alzare `RATING_WEIGHT` rende il gioco più prevedibile, alzare `GAME_SIGMA` più
casuale. Con i valori attuali, fra squadre di pari valore la favorita vince circa
il 62% delle singole gare, e le serie finiscono così:

| | qui | playoff NBA reali |
|---|---|---|
| 4-0 | 21% | ~13% |
| 4-1 | 31% | ~25% |
| 4-2 | 27% | ~32% |
| 4-3 | 21% | ~30% |

Restano un po' più sbrigative dei playoff veri, ed è corretto così: qui le
squadre sono cinque giocatori senza panchina, sorteggiati da un'asta, con
differenze di fit molto più larghe di quelle fra due teste di serie NBA.
Se le volete più combattute, alzate `GAME_SIGMA` e rilanciate `tools/balance.mjs`.
