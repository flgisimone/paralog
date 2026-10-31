# F4 — Giudizio e gate di precisione

**Obiettivo.** Un LLM giudica ogni coppia candidata guardando il codice reale; paralog verifica le evidenze e mostra solo i finding sostenuti. A fine fase si decide se il progetto continua.

**Stato.** Da iniziare.

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
