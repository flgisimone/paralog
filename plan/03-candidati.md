# F3 — Candidati deterministici

**Obiettivo.** Da tutte le unità, ottenere una lista corta di coppie candidate che contenga quasi tutte le sovrapposizioni vere, senza IA e senza confrontare tutte le coppie.

**Stato.** Fatta. Note di implementazione:

- **Dati in più dall'estrattore** (`EXTRACTOR_VERSION` 3): `domainTypes` (tipi del progetto nella firma, scartando `Promise`, array, unioni e argomenti generici), `nodes` (dimensione del corpo in nodi AST) e `shape` (conteggi delle coppie padre→figlio di tipi di nodo, senza nomi né valori).
- **F3-01, segnali** (`src/candidates/signals.ts`, `names.ts`):
  - `types`, `properties`, `calls`, `literals` e `names` sono Jaccard pesati con l'IDF del repository, quindi una caratteristica rara condivisa vale più di una comune. `types` unisce i tipi della firma e quelli delle proprietà toccate.
  - Le proprietà della classe che contiene l'unità (servizi iniettati) non contano.
  - `shape` è il coseno fra le forme.
  - Ogni candidato salva segnali e cose in comune (`shared`).
  - I sinonimi sono 26 gruppi generici: da quelli scritti all'inizio ho tolto le parole scelte pensando alla fixture (`usable`, `segment`, `dunning`…).
- **F3-02, filtro delle coppie**: indice invertito su tipi, proprietà, chiamate, letterali e token del nome. Le chiavi presenti in più di max(20, 2% delle unità) sono ignorate. Una coppia si confronta solo se condivide due chiavi, oppure una chiave rara (in al massimo 5 unità).

  | Repository | Coppie confrontate |
  |---|---|
  | excalidraw | 0,90% |
  | hoppscotch | 0,53% |
  | zod | 0,90% |
  | trpc | 2,0% (piccolo, molti pacchetti simili) |

  Sulla fixture nessuna sovrapposizione è persa dal filtro (test).
- **F3-03, esclusioni**: getter, setter, costruttori, unità sotto i 15 nodi, coppie che implementano lo stesso membro di interfaccia o classe astratta, coppie con chiamata diretta. Nessun near-miss "strategia" o "mapper" fra i primi 100 (test).
- **F3-04, embedding**: fatto il codice, **manca la misura**.
  - Ci sono `Embedder`, l'adattatore `OpenAICompatibleEmbedder` (anche per Ollama), la cache per `bodyHash` e la ricerca dei 5 vicini, aggiunti alle coppie confrontate con il segnale `embedding` (peso 0,2, gli altri segnali scalati a 0,8).
  - Si configurano in `paralog.config.json`; la chiave API passa solo da una variabile d'ambiente.
  - Testato con un server HTTP locale. La recall "con e senza embedding" va misurata in locale con un modello vero, come le modalità semantiche di F1-06.
- **F3-05, ranking**: somma pesata con pesi fissati a priori (proprietà 0,25, chiamate 0,2, tipi 0,15, letterali 0,15, forma 0,15, nomi 0,1). La metà di taratura era già al 100% entro i primi 50, quindi non c'era niente da ottimizzare e i pesi non sono stati toccati. Risultati sulla fixture (`npm run bench`):

  | K | Recall | Metà di taratura | Metà di verifica | Near-miss nei primi K |
  |---|---|---|---|---|
  | 10 | 32% | 38,5% | 25% | 1 |
  | 25 | 64% | 76,9% | 50% | 1 |
  | 50 | 76% | 100% | 50% | 5 |
  | 100 | 96% | 100% | **91,7%** | 5 |
  | 200 | 100% | 100% | 100% | 6 |

  Criterio rispettato (≥ 90% sulla metà di verifica con K = 100 < 200). Il caso più difficile è `shipping-price` (177° posto): la versione in core prende pesi in grammi e non tipi di dominio, e le soglie in admin stanno in una costante fuori dalla funzione. Il near-miss più alto è `onOrderPaid ~ onOrderShipped` (1° posto): due gestori di eventi che differiscono solo per il messaggio. Lo deve scartare il giudizio di F4.
- **F3-06**: `paralog candidates [path]` con output per il terminale (segnali e cose in comune), `--json` nel formato dello scorer, `--limit`. `npm run bench` senza `--run` genera la run di paralog sulle fixture (`benchmarks/run.ts`) e la valuta. Tempo dei candidati, cache calda esclusa: 0,5–1,2 s sui repository reali.
- **Prime impressioni sui repository reali** (actual): al primo posto una duplicazione vera (`createCategoryGroup` identica in `budget/envelope.ts` e `budget/tracking.ts`); poi wrapper di API scritti con lo stesso schema, che il giudizio dovrà classificare.
- **Fixture**: aggiunto il near-miss `reserve-release` (operazioni opposte su `StockService`), emerso dal ranking e non annotato.

## Decisioni

- Ogni segnale è spiegabile e salvato con il candidato: diventa parte delle evidenze di F4.
- Le esclusioni sono la difesa principale contro i falsi positivi: polimorfismo voluto, adattatori, getter.
- Gli embedding sono opzionali e spenti di default; i candidati devono funzionare senza.

## Task

### F3-01 Segnali
- **Stima**: M
- **Dipendenze**: F2-03
- **Descrizione**: per una coppia di unità: tipi di dominio condivisi in parametri e ritorno; Jaccard delle proprietà toccate; Jaccard delle chiamate; somiglianza dei nomi (token camelCase, piccola lista di sinonimi: get/fetch/load/find, remove/delete/deactivate/close); letterali in comune; forma dell'AST normalizzata.
- **Criteri di accettazione**: test per segnale con coppie positive e near-miss della fixture.

### F3-02 Blocking
- **Stima**: M
- **Dipendenze**: F3-01
- **Descrizione**: indice invertito per tipo di dominio, proprietà toccata e letterale; si confrontano solo le unità che condividono almeno una chiave; chiavi troppo comuni (es. `id`, `Logger`) pesate o ignorate.
- **Criteri di accettazione**: sul repository più grande le coppie confrontate sono meno dell'1% di quelle possibili; nessun caso della fixture perso per colpa del blocking.

### F3-03 Esclusioni
- **Stima**: S
- **Dipendenze**: F3-01
- **Descrizione**: escludere unità banali (sotto N istruzioni), getter/setter, overload, coppie che implementano lo stesso metodo della stessa interfaccia o classe astratta, coppie fra un'unità e la sua chiamata diretta, test; tutto configurabile.
- **Criteri di accettazione**: nessun near-miss di tipo "strategia" o "mapper" della fixture nei primi K candidati.

### F3-04 Embedding opzionali
- **Stima**: M
- **Dipendenze**: F3-01
- **Descrizione**: interfaccia `Embedder` con adattatore OpenAI-compatibile (Ollama in locale); embedding del corpo normalizzato; cache per `bodyHash`; ricerca dei vicini per aggiungere candidati al blocking.
- **Criteri di accettazione**: il benchmark riporta recall con e senza embedding; spento se non configurato.

### F3-05 Ranking
- **Stima**: S
- **Dipendenze**: F3-01, F3-02, F1-05
- **Descrizione**: punteggio pesato dei segnali; pesi scelti sulla fixture e verificati sui repository reali (attenzione a non adattarli troppo alla fixture: metà dei casi riservata alla verifica).
- **Criteri di accettazione**: recall@K ≥ 90% sulla metà di verifica della fixture con K tale da restare sotto i 200 candidati.

### F3-06 `paralog candidates`
- **Stima**: S
- **Dipendenze**: F3-05
- **Descrizione**: comando che stampa i candidati con i segnali, in terminale e JSON nel formato dello scorer.
- **Criteri di accettazione**: `npm run bench` lo usa; output stabile fra due esecuzioni.
