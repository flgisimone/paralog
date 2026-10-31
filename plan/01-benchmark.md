# F1 — Benchmark

**Obiettivo.** Prima di scrivere euristiche, sapere come si misura il successo: una fixture con sovrapposizioni note, repository reali con commit fissati, uno scorer ripetibile e una baseline dei tool esistenti.

**Stato.** In corso.

- F1-01: repository con README e LICENSE MIT pronto; `package.json` è a `0.0.1`. Manca la pubblicazione su npm, a cura del maintainer (`npm publish` dalla root: pubblica README, LICENSE e la CLI con solo `--version`/`--help`). Dopo la pubblicazione la versione di sviluppo passa a `0.0.2` (o resta non pubblicata fino alla 0.1.0).
- F1-02: fatto. `benchmarks/schema.ts` (tipi, `validateAnnotations`, `validateLabels`) e `benchmarks/schema/*.schema.json` (draft 2020-12, validati con ajv). Oltre allo schema: ID univoci fra overlap e near-miss, membri distinti nello stesso caso, percorsi relativi e normalizzati. `labels/<repo>.json` richiede anche lo `sha` del commit analizzato. Test in `benchmarks/schema.test.ts`.

## Decisioni

- Sulla fixture si misurano precision e recall; sui repository reali solo la precision, perché il totale delle sovrapposizioni reali non è noto.
- I casi negativi (codice simile che **non** è una sovrapposizione) valgono quanto quelli positivi: implementazioni della stessa interfaccia, adattatori fra livelli, mapper DTO, test.
- Il benchmark è nel repository (`benchmarks/`) e diventa pubblico con F7.

## Task

### F1-01 Riservare il nome
- **Stima**: S
- **Dipendenze**: —
- **Descrizione**: verificare `github.com/paralog`; creare il repository; pubblicare `paralog@0.0.1` su npm con solo README (una frase, "work in progress", link al repository) e LICENSE.
- **Criteri di accettazione**: `npm view paralog version` restituisce `0.0.1`; il repository esiste con README e LICENSE MIT.

### F1-02 Formato delle annotazioni
- **Stima**: S
- **Dipendenze**: —
- **Descrizione**: `benchmarks/schema.ts` e JSON Schema: `Overlap { id, kind: "semantic_duplication" | "responsibility_overlap", members: { file, symbol }[], difficulty: 1–4, rationale }` e `NearMiss { id, members, reason }`. Etichette dei risultati sui repository reali: `labels/<repo>.json` con `true | false | unsure` per finding id.
- **Criteri di accettazione**: test che validano file corretti e rifiutano quelli sbagliati.

### F1-03 Fixture sintetica
- **Stima**: L
- **Dipendenze**: F1-02
- **Descrizione**: `benchmarks/fixtures/shop`: piccola app TS (circa 40 file, 2 package) con 25 sovrapposizioni inserite a difficoltà crescente (1: nomi diversi; 2: struttura diversa, ciclo contro `reduce`; 3: classe contro funzioni, package diversi; 4: regola sparsa in due passi) e 15 near-miss (strategie della stessa interfaccia, mapper, validazioni simili su domini diversi).
- **Criteri di accettazione**: `tsc --strict` passa; ogni caso è annotato; almeno 5 casi per livello di difficoltà.

### F1-04 Repository reali
- **Stima**: L
- **Dipendenze**: F1-02
- **Descrizione**: scegliere 6–8 repository TypeScript open source di dimensioni diverse (5k–150k righe; backend NestJS/Express, frontend, librerie, monorepo) con licenza compatibile; fissare lo SHA; script che li clona in `benchmarks/.repos/` (ignorato da git). Includere un progetto proprio (oneoffice) se possibile.
- **Criteri di accettazione**: `benchmarks/real/repos.json` con URL, SHA, licenza, righe; `npm run bench:fetch` li scarica.

### F1-05 Scorer
- **Stima**: M
- **Dipendenze**: F1-02
- **Descrizione**: `npm run bench` legge i risultati di una run (`candidates.json`, `findings.json`) e calcola: recall@K dei candidati, precision e recall dei finding sulla fixture, per livello di difficoltà, falsi positivi sui near-miss, precision sui repository reali dalle etichette, costo in token e tempo. Output JSON e tabella markdown.
- **Criteri di accettazione**: test con predizioni finte di cui si conosce il punteggio; due run sugli stessi input danno lo stesso output.

### F1-06 Baseline dei tool esistenti
- **Stima**: S
- **Dipendenze**: F1-03, F1-05
- **Descrizione**: eseguire jscpd e la modalità di duplicazione più permissiva di Fallow sulla fixture; convertire i risultati nel formato dello scorer.
- **Criteri di accettazione**: recall per livello di difficoltà dei due tool nello stato della fase. È il numero che paralog deve battere ai livelli 2–4.
