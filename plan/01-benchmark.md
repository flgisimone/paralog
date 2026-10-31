# F1 — Benchmark

**Obiettivo.** Prima di scrivere euristiche, sapere come si misura il successo: una fixture con sovrapposizioni note, repository reali con commit fissati, uno scorer ripetibile e una baseline dei tool esistenti.

**Stato.** In corso: fatti F1-02, F1-03, F1-05; F1-06 parziale; F1-01 attende la pubblicazione su npm; F1-04 da fare.

- F1-01: repository con README e LICENSE MIT pronto; `package.json` è a `0.0.1`. Manca la pubblicazione su npm, a cura del maintainer (`npm publish` dalla root: pubblica README, LICENSE e la CLI con solo `--version`/`--help`). Dopo la pubblicazione la versione di sviluppo passa a `0.0.2` (o resta non pubblicata fino alla 0.1.0).
- F1-02: fatto. `benchmarks/schema.ts` (tipi, `validateAnnotations`, `validateLabels`) e `benchmarks/schema/*.schema.json` (draft 2020-12, validati con ajv). Oltre allo schema: ID univoci fra overlap e near-miss, membri distinti nello stesso caso, percorsi relativi e normalizzati. `labels/<repo>.json` richiede anche lo `sha` del commit analizzato. Test in `benchmarks/schema.test.ts`.
- F1-03: fatto. `benchmarks/fixtures/shop`: workspace pnpm con `packages/core` (dominio e servizi) e `packages/admin` (back office che importa `@shop/core` via `paths`), 47 file, 102 unità. 25 sovrapposizioni (difficoltà 1: 5, 2: 8, 3: 6, 4: 6; 17 `semantic_duplication`, 8 `responsibility_overlap`; i casi di livello 4 hanno tre membri) e 15 near-miss (strategie della stessa interfaccia, classe astratta, mapper, delega fra livelli, operazioni opposte, validazioni e parser su domini diversi). `benchmarks/fixtures.test.ts` verifica: annotazioni valide, `--strict` senza errori in entrambi i package, un'unità estratta per ogni membro annotato. Da tenere presente per F3-05: la fixture è stata scritta dalla stessa persona (o agente) che scriverà le euristiche, quindi la metà di verifica va scelta prima di guardare i segnali.
- F1-05: fatto. `benchmarks/score.ts` (funzioni pure), `benchmarks/bench.ts` (`npm run bench -- --run <dir> [--all]`, con tsx), formati `candidates.json` e `findings.json` in `benchmarks/schema/`. Struttura della run, metriche e regola di corrispondenza in `benchmarks/README.md`. Regola: una coppia o un finding colpisce un caso se almeno due membri distinti ne fanno parte; per i casi di livello 4 vale quindi anche la coppia dei due passi dello stesso package (concessione da rivedere se gonfia la recall). Test con predizioni finte dal punteggio noto, con un oracolo sulla fixture (precision e recall 100%) e con due esecuzioni che danno lo stesso output.
- F1-06: fatto per le modalità lessicali e strutturali; **mancano le modalità semantiche**. `npm run bench:baselines` (`benchmarks/baselines.ts`) lancia i tool con versione fissata via npx, collega ogni frammento duplicato alle unità che lo intersecano e valuta le coppie come candidati (ordinate per token o similarità) e come finding confermati. Risultati sulla fixture `shop` (recall dei finding per difficoltà; la precision è quella dei finding sulla fixture):

  | Tool e impostazioni | Coppie | Recall | D1 | D2 | D3 | D4 | Precision | FP su near-miss |
  |---|---|---|---|---|---|---|---|---|
  | jscpd 5.4.2 `--mode weak --min-tokens 10 --min-lines 3 --ignore-identifiers --ignore-literals` | 234 | 36% | 2/5 | 3/8 | 1/6 | 3/6 | 3,8% | 8 |
  | jscpd 5.4.2 `--similarity=0.5 --kind similar` (Type-3, AST) | 8 | 0% | 0/5 | 0/8 | 0/6 | 0/6 | 0% | 3 |
  | fallow 3.38.1 `dupes --mode semantic --min-tokens 10 --min-lines 3` | 295 | 24% | 2/5 | 1/8 | 1/6 | 2/6 | 2,0% | 13 |

  Con soglie così basse i successi sono quasi sempre frammenti corti e generici (la firma e il `return` iniziale), non il riconoscimento della logica: la precision resta sotto il 4%. Il numero da battere ai livelli 2–4 per i rilevatori lessicali è quindi basso.
- **Scoperta del 31/10/2026, da gestire prima di F3**: jscpd 5.x ha `--semantic` (cloni Type-4 con embedding del corpo delle funzioni, modello locale CodeRankEmbed o API OpenAI-compatibile) e fallow 3.x ha `similar-code` ("semantic implementation overlap", modello locale jina-embeddings-v2-base-code, con candidati "non verificati" da far giudicare all'agente). È lo stesso spazio di paralog. Qui non si possono eseguire (huggingface.co è bloccato dal proxy della sessione cloud): vanno lanciati in locale e aggiunti a `BASELINES` in `benchmarks/baselines.ts`. Sono loro il riferimento vero: se superano paralog ai livelli 2–4 senza LLM, il gate di F4 va rivisto. Vedi anche [00-analisi.md](00-analisi.md).

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
