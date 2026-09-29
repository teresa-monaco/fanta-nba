# Fanta NBA

Asta a crediti fra 2 e 12 squadre, costruzione dei quintetti, playoff simulati.
Gira interamente nel browser: niente installazione, niente server, niente account.

Trasposizione web delle regole di `NBA gioco regole.txt`, con una differenza
voluta: l'asta non è più a voce con un segnapunti, è un'asta vera a rilanci con
ognuno sul proprio telefono.

---

## Come si gioca

**0. Chi gioca.** Si gioca in **2, 3, 4, 6, 8, 10 o 12**. Sopra i quattro solo
numeri pari: con 5, 7 o 9 metà del tabellone salterebbe il primo turno e
smetterebbe di somigliare a un torneo. Si scrive il nome e la squadra viene
assegnata — non si sceglie, così non si perdono cinque minuti a contrattare i
colori. Chi ospita fa partire con quanti ci sono.

**1. Asta.** Ogni squadra parte con **50 crediti** e deve comprare **5 giocatori**.
Il sistema estrae un giocatore dal pool (225 nomi, picco NBA 2K fra 85 e 100),
parte un cronometro e si rilancia. Ogni rilancio rimette il timer a 8 secondi:
chi resta in testa allo scadere se lo porta a casa.

C'è una **regola di riserva** automatica: non puoi spendere tanto da non
poterti più permettere gli slot che ti restano. Se ti mancano 3 giocatori,
almeno 3 crediti restano bloccati. Nessuno rimane a secco.

Chi ospita può sempre scavalcare l'asta e assegnare un giocatore a mano al
prezzo che decide — utile se vi mettete d'accordo a voce.

**2. Le squadre.** Una schermata sola, con tutte le impostazioni tecniche:

1. **Quintetto** — lo assegna l'app minimizzando gli adattamenti. Serve a
   *capire cosa hai comprato*, non a decidere: sopra c'è il profilo in chiaro
   (*spacing totale, ferro scoperto, troppe stelle*). Correggibile da "Modifica".
2. **Primo e secondo violino**
3. **Strategia offensiva** — una delle 11
4. **Ritmo** — lento, medio, veloce, run and gun
5. **Allenatore** — lo sbloccano i giocatori che hai comprato

Il **ritmo** non è uno scambio fra attacco e difesa. Misurato su 6.000 partite,
togliere 3 all'attacco e darne 3 alla difesa lascia le vittorie al 51% esatto:
cambia solo il punteggio finale, non chi vince. Quello che il ritmo sposta
davvero è la **varianza**: meno possessi, meno tempo perché la squadra più forte
dimostri di esserlo. Con 14 possessi in meno la sfavorita passa dal 24% al 27%
(divario 20 punti) e dal 32% al 34% (divario 8). Quindi qui c'è un numero solo,
i possessi, e il vantaggio o lo svantaggio di correre nasce dalla **tua rosa**
(gambe e tiratori per correre, un dominatore uno contro uno per rallentare) e da
**chi hai davanti**: rallentare toglie il campo aperto solo a chi la transizione
la cerca. Il ritmo reale della partita è la media delle due volontà, *pesata da
chi lo controlla* — non puoi correre se l'altro rimbalza e risale a passo d'uomo.

L'**allenatore** te lo porta ogni giocatore: quello della sua squadra nella sua
epoca. Con Ginóbili in rosa hai Popovich, senza no. Cinque giocatori di cinque
squadre diverse sbloccano cinque allenatori (succede all'83% delle rose). Ogni
allenatore è un **patto**, mai un regalo: Phil Jackson dà +7 in realizzazione al
primo violino e toglie 2 a tutti gli altri; Popovich dà +4 in playmaking a tutti
e ne toglie 5 alla stella. Un bonus senza costo non sarebbe una scelta, sarebbe
il calcolo di quale numero è più grande.

Le tre scelte pesano in ordine (`node tools/tattica.mjs`): **strategia 3.5
punti** di vittorie fra la migliore e la peggiore, **ritmo 2.7**, **allenatore
1.6**. La strategia resta il piatto, il resto è contorno — altrimenti la serata
la deciderebbe chi ha pescato il nome giusto all'asta invece di chi ha scelto
meglio. Nessuna delle tre ha una risposta giusta sempre: il ritmo migliore
cambia con la rosa (34% lento, 31% medio, 19% veloce, 17% run and gun) e così
l'allenatore (fra il 4% e il 18% a seconda dell'archetipo).

**2-bis. Stagione regolare (opzionale).** Si sceglie in lobby: *solo playoff*
oppure *stagione + playoff*. Con la stagione si gioca un girone all'italiana a
gara secca — tanti giri quanti servono perche ognuna faccia **una decina di
partite** — e ne esce una classifica con record e differenza canestri. Passano
le prime 2, 4 o 8; le altre sono fuori. A stagione finita **le tattiche si
possono ritoccare**: hai visto come e andata, correggi prima dei playoff.

Costa meno di quanto sembri, perche toglie serie invece di aggiungerne: in
dodici si passa da 11 serie a 7. E il vantaggio della testa di serie sparisce,
perche non salta il turno piu nessuno.

| Squadre | Giri | Gare a testa | Passano | Serie: solo playoff -> con stagione |
|---|---|---|---|---|
| 3 | 5 | 10 | 2 | 2 -> 1 |
| 4 | 3 | 9 | 4 | 3 -> 3 |
| 6 | 2 | 10 | 4 | 5 -> 3 |
| 8 | 1 | 7 | 8 | 7 -> 7 |
| 10 | 1 | 9 | 8 | 9 -> 7 |
| 12 | 1 | 11 | 8 | 11 -> 7 |

Con 2, 4 e 8 squadre non elimina nessuno: serve solo a seminare gli
accoppiamenti (la prima contro l'ultima qualificata) e a dare una classifica.

**3. Playoff.** Eliminazione diretta. Senza stagione regolare il tabellone si
arrotonda alla potenza di due superiore e i posti che avanzano diventano
**teste di serie sorteggiate** che saltano il primo turno:

| Squadre | Teste | Struttura | Serie | Durata |
|---|---|---|---|---|
| 2 | – | Finale | 1 | ~4 min |
| 3 | 1 | Preliminare → Finale | 2 | ~7 min |
| 4 | – | Semifinali → Finale | 3 | ~10 min |
| 6 | 2 | Preliminare → Semifinali → Finale | 5 | ~15 min |
| 8 | – | Quarti → Semifinali → Finale | 7 | ~20 min |
| 10 | 6 | Preliminare → Quarti → Semifinali → Finale | 9 | ~25 min |
| 12 | 4 | Preliminare → Quarti → Semifinali → Finale | 11 | ~30 min |

La durata include l'asta, che cresce col numero di squadre (5 acquisti a testa).

Le serie si scoprono **due gare alla volta**, la **finale una gara alla volta** —
così la tensione sale invece di restare piatta. Chi gioca contro chi dal secondo
turno in poi **non è salvato nel database**: viene dedotto dai risultati, che
sono identici per tutti perché il motore è deterministico.

**3-bis. Il referto.** A serie chiusa, sotto il "perché ha vinto", si apre il
referto: quanto sono valse davvero le tue scelte, **in punti a partita**, per
entrambe le squadre. Per ognuna delle quattro — strategia, ritmo, allenatore,
primo violino — dice quanto hai guadagnato rispetto a scegliere a caso e quale
sarebbe stata la migliore *contro quell'avversario*. Dove la differenza è sotto
il quarto di punto non suggerisce niente: scrive che valeva uguale qualunque
cosa, invece di consigliare Drummond al posto di Doncic per +0.0.

```
Sucio                                             ha perso
  −1.2 a partita, ma su allenatore hai proprio sbagliato:
  con Don Nelson erano +2.6 punti in più. Ogni singola partita.

  Strategia       Isolamento        −0.5   meglio Transizione (+2.1)
  Ritmo           Lento             −0.5   meglio Medio (+1.3)
  Allenatore      Flip Saunders     −0.8   meglio Don Nelson (+2.6)
  Primo violino   Zach LaVine       +0.7   la migliore
```

Serve a una cosa sola: senza, le scelte si tirano a caso per sempre e tanto
valeva non chiederle. Il 3% dei referti è perfetto, in media c'è quasi un paio
di correzioni utili per squadra.

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
lo facessero tutti i device, altrettante transazioni simultanee proverebbero ad
assegnare lo stesso giocatore). Quindi se chi ospita chiude il
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
data/players.json     225 giocatori
data/archetypes.json  20 archetipi → attributi
data/coaches.json     65 allenatori, 10 archetipi di effetto
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

I nomi **girano a ogni partita**: si estraggono dal seed, quindi ogni telefono
rimescola con lo stesso seme e arriva alla stessa assegnazione, senza che
niente finisca nel database. La sedia invece resta: `t3` è sempre la stessa
persona, cambia solo l'etichetta — e per questo l'albo d'oro mostra il nome di
chi gioca, non quello della squadra di stasera.

Per cambiarli si tocca una lista sola, in `js/core.js`:

```js
export const NOMI_SQUADRE = ['Pornland', 'Volta Reno FC', "m johnson's son", ...]; // 12
```

Le chiavi `t1…t12` sono **posizioni**, non nomi: reggono i colori in CSS
(`.t-t1` … `.t-t12`), le sedie e le partite già salvate. Non si toccano.
I nomi sono dieci e le sedie dodici: nella partita a dodici le ultime due
riprendono un nome con il `II` dietro.

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
node tools/flowtest.mjs    # 210 partite intere, tutti i formati x solo-playoff e con-stagione
node tools/domtest.mjs     # l'app vera attraverso tutte e cinque le schermate
node tools/balance.mjs     # diagnostica di taratura (non fallisce mai)
node tools/fairness.mjs    # le quattro sedie valgono uguale? (non fallisce mai)
node tools/spread.mjs      # quanto sono varie le valutazioni
node tools/calibra.mjs     # dove cadono i valori, per scegliere le soglie del motore
node tools/audit-gioco.mjs # le scelte che il gioco chiede contano davvero?
node tools/tattica.mjs     # ritmo e allenatori: contano, e contano il giusto?
node tools/bye.mjs         # con tre squadre, quanto vale saltare la semifinale
node tools/partite.mjs     # gioca migliaia di serie e cerca incoerenze nei testi
node tools/audit-bug.mjs   # i casi storti: giro dal database, azzeramenti, chi entra ed esce
node tools/formati.mjs     # struttura e durata di ogni formato
node tools/teste.mjs       # quanto vale saltare il primo turno, per formato

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
const RATING_WEIGHT = 0.0030;  // quanto pesa il divario di forza
const GAME_SIGMA    = 8.5;     // quanto pesa il caso
```

Alzare `RATING_WEIGHT` rende il gioco più prevedibile, alzare `GAME_SIGMA` più
casuale. Con i valori attuali la sfavorita vince la serie una volta su quattro
(24%), lo scarto medio è di 10.8 punti (NBA ~11) e le serie finiscono così:

| | qui | playoff NBA reali |
|---|---|---|
| 4-0 | 17% | ~13% |
| 4-1 | 33% | ~25% |
| 4-2 | 27% | ~32% |
| 4-3 | 23% | ~30% |

Restano un po' più sbrigative dei playoff veri, ed è corretto così: qui le
squadre sono cinque giocatori senza panchina, sorteggiati da un'asta, con
differenze di fit molto più larghe di quelle fra due teste di serie NBA.
Se le volete più combattute, alzate `GAME_SIGMA` e rilanciate `tools/balance.mjs`.
