# F4 — Giudizio e gate di precisione

**Obiettivo.** Un LLM giudica ogni coppia candidata guardando il codice reale; paralog verifica le evidenze e mostra solo i finding sostenuti. A fine fase si decide se il progetto continua.

**Stato.** Codice fatto (F4-01 … F4-06, strumenti di F4-07 e F4-08); **manca il gate**, che richiede modelli veri ed etichette a mano. Note di implementazione:

- **Cambio a una decisione**: "temperatura 0" non è più possibile sui modelli Anthropic attuali (Opus 5.5, Sonnet 5.5, Haiku 5.5 rifiutano `temperature` con un 400, e il pensiero non si disattiva su Opus 5.5). L'adattatore Anthropic usa `effort: medium` e nessun parametro di campionamento; l'adattatore OpenAI-compatibile manda `temperature: 0`. La stabilità quindi non si impone: si misura (F4-08).
- **F4-01, provider** (`src/judge/providers.ts`):
  - `AIProvider { id, generate }`.
  - `AnthropicProvider` usa l'SDK ufficiale (`@anthropic-ai/sdk`, unica nuova dipendenza di runtime) con output strutturato (`output_config.format`, JSON Schema), retry e timeout dell'SDK, e `fallbacks: "default"` sui modelli che lo accettano (su un rifiuto l'API ripete la richiesta su un modello di riserva; il modello effettivo si registra nel finding).
  - `OpenAICompatibleProvider` usa `fetch` su `/chat/completions` con `response_format: json_schema` (Ollama, vLLM, OpenRouter), retry con backoff esponenziale su 429/5xx/rete e timeout.
  - Chiave solo da variabile d'ambiente, mai nei messaggi d'errore (test). Concorrenza con `mapWithConcurrency`. Senza sezione `ai` non parte nessuna richiesta (test con `fetch` spiato).
- **F4-02, prompt** (`src/judge/prompt.ts`, `PROMPT_VERSION` 1):
  - Contenuto: codice delle due unità con numeri di riga del file, definizioni dei tipi del progetto usati (al massimo 8, 40 righe ciascuno; da qui le `TypeDeclaration` aggiunte all'estrazione), chiamanti a un passo, segnali di F3 presentati come motivo della selezione e non come prova.
  - Il codice sta fra `<code>` e `</code>` e il prompt di sistema dice di ignorare le istruzioni che contiene.
  - Output validato due volte: dallo schema lato API e da `parseVerdict` lato client.
  - Il test di regressione su 10 coppie usa **risposte scritte a mano** (`tests/fixtures/recorded-verdicts.json`), non registrate da un modello: verificano parsing e verifica delle evidenze. Vanno sostituite con registrazioni vere alla prima esecuzione con un provider.
- **F4-03, verifica delle evidenze** (`src/judge/evidence.ts`):
  - Ogni intervallo deve stare dentro l'unità citata.
  - Un'affermazione è sostenuta se una caratteristica condivisa trovata da F3 (proprietà, chiamata, letterale, tipo) compare, come testo, nelle righe citate di entrambe le unità.
  - `confirmed` richiede almeno un'affermazione, tutti gli intervalli validi e almeno metà delle affermazioni sostenute (`minSupport` 0,5); `different` e `intentional_variant` diventano `rejected`.
  - Lo scorer conta già i finding persi così (`unverifiedHits`).
- **F4-04, gruppi**: le coppie confermate si uniscono finché il supporto comune a tutte non è vuoto; una catena A~B, B~C per motivi diversi resta in due finding (test).
- **F4-05, finding** (`src/judge/findings.ts`):
  - ID = hash degli ID delle unità ordinati.
  - Gravità per distanza: stessa cartella `low`, cartelle diverse `medium`, package diversi `high`; un livello in meno sotto i 60 nodi in totale.
  - `kind` è `semantic_duplication` se tutte le coppie sono `same_responsibility`, altrimenti `responsibility_overlap`.
- **F4-06, costi e cache**:
  - `--max-pairs` (50), `--budget` in token stimati (caratteri/4 più 600 di output), `--dry-run`.
  - Cache dei verdetti in `.paralog/cache/verdicts.json` per (versione del prompt, provider e modello, `bodyHash` A, `bodyHash` B). Le righe delle evidenze sono salvate relative all'inizio dell'unità, così spostare il codice nel file non invalida il verdetto (test).
  - Costo stimato: circa 1.500 token per coppia, quindi 50 coppie con Opus 5.5 sono meno di un dollaro per repository.
- **CLI e libreria**: `paralog check [path]` (testo, `--json`, `--all`) e `analyze(options)` (`src/analyze.ts`). Codici di uscita: 0, oppure 2 per errori; i limiti (codice 1) arrivano con F5-01.
- **F4-07 e F4-08, strumenti pronti, esecuzione da fare**:
  - `npm run bench -- --ai benchmarks/ai/<modello>.json --real` produce i finding su fixture e repository reali; le configurazioni pronte sono `claude-opus` (punta), `claude-haiku` (economico) e `ollama-qwen` (locale).
  - `npm run bench:label` etichetta a mano i finding confermati dei reali.
  - `npm run bench:stability` giudica tre volte le stesse coppie.
  - Procedura in `benchmarks/README.md`. Nessuna esecuzione in questa sessione: niente chiavi né modello locale nel container.

## Decisioni

- Il codice è un dato, non un'istruzione: il prompt lo racchiude e dice al modello di ignorare istruzioni nei commenti e nelle stringhe.
- Temperatura 0, output strutturato con schema; verdetti in cache per `(bodyHash A, bodyHash B, modello, versione del prompt)`.
- Stati di un finding: `confirmed` (mostrato), `unverified` (nascosto, visibile con `--all`), `rejected`.
- **Gate**: precision ≥ 70% sui repository reali con almeno un modello e stabilità dei verdetti ≥ 90%. Se non passa, si scrive in [README.md](README.md) cosa si prova (segnali, prompt, esclusioni) o se si chiude.

## Task

### F4-01 Provider
- **Stima**: M
- **Dipendenze**: F2-01
- **Descrizione**: interfaccia `AIProvider { id, generate(request, schema) }`; adattatori Anthropic e OpenAI-compatibile; configurazione in `paralog.config.json`, chiave solo da variabile d'ambiente; concorrenza limitata, retry con backoff, timeout.
- **Criteri di accettazione**: test con provider finto; nessuna richiesta di rete senza provider configurato (test); la chiave non compare in log né errori.

### F4-02 Prompt di giudizio
- **Stima**: M
- **Dipendenze**: F4-01, F3-06
- **Descrizione**: input: codice completo delle due unità con numeri di riga, definizioni dei tipi usati, chiamanti a un passo, segnali di F3. Output: `verdict: same_responsibility | partial_overlap | different | intentional_variant`, `sharedResponsibility` (una frase), `differences`, `evidence: { claim, linesA, linesB }[]`, `suggestion` (dove dovrebbe vivere la logica unica).
- **Criteri di accettazione**: output validato contro lo schema; test di regressione con verdetti registrati su 10 coppie della fixture.

### F4-03 Verifica delle evidenze
- **Stima**: M
- **Dipendenze**: F4-02
- **Descrizione**: ogni intervallo di righe deve stare dentro l'unità citata; ogni affermazione deve avere un supporto deterministico (proprietà, chiamate, letterali o tipi in comune nelle righe citate). `confirmed` solo con evidenze valide e supporto sopra soglia.
- **Criteri di accettazione**: test con evidenze inventate o fuori unità → `unverified`; il benchmark riporta quanti finding passano da confermati a non verificati.

### F4-04 Cluster
- **Stima**: S
- **Dipendenze**: F4-03
- **Descrizione**: unire coppie confermate in gruppi (A~B, B~C) solo se A e C hanno almeno un supporto in comune; un finding per gruppo.
- **Criteri di accettazione**: test su catene vere e su catene spurie (A~B e B~C per motivi diversi).

### F4-05 Modello dei finding
- **Stima**: S
- **Dipendenze**: F4-04
- **Descrizione**: `Finding { id, kind, status, members, sharedResponsibility, evidence, signals, severity, model }`; ID = hash degli ID delle unità ordinati; gravità da dimensione e distanza (package diversi > stesso file).
- **Criteri di accettazione**: ID uguale fra due esecuzioni senza modifiche; test sulla gravità.

### F4-06 Costi e cache
- **Stima**: S
- **Dipendenze**: F4-02
- **Descrizione**: budget di token per esecuzione (`--max-pairs`, `--budget`), cache dei verdetti, stima dei costi prima di partire (`--dry-run`).
- **Criteri di accettazione**: la seconda esecuzione senza modifiche non chiama il modello; `--dry-run` stampa coppie e token stimati.

### F4-07 Valutazione e gate
- **Stima**: L
- **Dipendenze**: F4-05, F1-04
- **Descrizione**: eseguire il benchmark con tre modelli (uno di punta, uno economico, uno locale via Ollama); etichettare a mano i finding confermati sui repository reali (true / false / unsure, con "unsure" escluso dal calcolo ma riportato).
- **Criteri di accettazione**: tabella per modello (precision reale, precision e recall sulla fixture per difficoltà, falsi positivi sui near-miss, costo, tempo) nello stato della fase; decisione del gate scritta in README.

### F4-08 Stabilità
- **Stima**: S
- **Dipendenze**: F4-05
- **Descrizione**: tre esecuzioni senza cache sugli stessi input; misurare quante coppie cambiano verdetto.
- **Criteri di accettazione**: stabilità ≥ 90% riportata per modello.
