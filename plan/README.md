# Backlog — paralog

paralog trova la logica di business duplicata e le responsabilità sovrapposte in un repository TypeScript, anche quando il codice è scritto in modo diverso. Lo usano lo sviluppatore dalla CLI e il suo agente IA via MCP, prima di scrivere codice nuovo e dopo averlo scritto. L'analisi di partenza è in [00-analisi.md](00-analisi.md).

Il nome viene dalla genetica: un *paralogo* è un gene duplicato nello stesso genoma che poi diverge, con forma diversa e funzione simile. È il caso `UserService.deactivate()` / `AccountManager.closeAccount()`.

paralog è uno **strato semantico** sopra gli strumenti deterministici: non ricostruisce grafo delle dipendenze, cicli, dead code o metriche di complessità, che Fallow, dependency-cruiser e knip fanno già meglio. paralog **non modifica file**: trova, spiega e verifica; l'agente corregge con i suoi strumenti.

| Entry point | Contenuto | Chi lo usa |
|---|---|---|
| `paralog` | `analyze(options)`: unità, candidati, finding | Script, test, integrazioni |
| `paralog/mcp` | Server MCP su stdio: `paralog_check`, `paralog_finding`, `paralog_similar` | Agenti IA |
| `paralog` (bin) | `check`, `candidates`, `units`, `init`, `hook`, `mcp`; report terminale, JSON, SARIF, markdown; baseline | Sviluppatore, CI |

## Decisioni

| Tema | Decisione | Motivo |
|---|---|---|
| Nome | **paralog**; libero su npm e PyPI il 31/10/2026, su crates.io solo un segnaposto 0.0.0 di un log broker | CodeDNA era già usato (`codedna` su PyPI, Codna nello stesso spazio); il paralogo descrive il problema (scelta del 31/10/2026) |
| Posizionamento | Solo duplicazione semantica e responsabilità sovrapposte; niente detector statici, health score globale o refactoring automatico | Fallow, CodeScene e GitNexus coprono già il resto; il valore unico è qui ([00-analisi.md](00-analisi.md)) |
| Precisione | Meglio un finding mancato che un falso positivo: i finding senza evidenze verificate non si mostrano di default | Lezione di SAT F22 (258 falsi positivi su 446 su oneoffice); con un LLM a giudicare il rischio è più alto |
| Benchmark prima del codice | F1 costruisce fixture, repository reali e scorer prima di ogni euristica | Senza misure non si può dichiarare precisione né scegliere i pesi |
| Gate di sopravvivenza | A fine F4: precision ≥ 70% sui repository reali con almeno un modello, altrimenti stop o ripensamento | Sotto questa soglia gli sviluppatori smettono di leggere i finding |
| Architettura a imbuto | Candidati deterministici (tipi, proprietà, chiamate, nomi, letterali, embedding opzionali), poi l'LLM giudica solo le coppie con il codice reale | Il confronto di tutte le coppie è quadratico; i riassunti gerarchici perdono i dettagli che contano |
| Evidenze | Un finding è *confermato* solo se le righe citate esistono **e** i segnali deterministici lo sostengono; altrimenti *non verificato* | Evidenza esistente non vuol dire conclusione corretta |
| IA | Il giudizio richiede un provider configurato esplicitamente; `paralog candidates` funziona senza IA; nessun codice inviato senza configurazione | Local-first; nessuna sorpresa sulla privacy |
| Provider | Anthropic e OpenAI-compatibile (copre Ollama, OpenRouter, vLLM); chiavi solo da variabili d'ambiente, mai salvate | Due adattatori coprono quasi tutto |
| File | paralog non scrive nel codice dell'utente; scrive solo `.paralog/` (cache, ultima esecuzione) e, con `init`, la sezione in `AGENTS.md` e le configurazioni MCP | Come SAT: l'agente corregge con i suoi permessi |
| Pacchetto | Un solo pacchetto npm con più entry point, non un monorepo | Come SAT; il monorepo da 15 package dell'idea iniziale costava mesi |
| Parsing | ts-morph sopra la TypeScript Compiler API | Tipi risolti: il segnale che i tool basati su tree-sitter non hanno |
| MCP | Server su stdio avviato da `paralog mcp`, sola lettura | Non serve un dev server come in SAT; è il trasporto che tutti gli agenti supportano |
| Strumenti | Gli stessi di SAT: Vitest, ESLint con typescript-eslint, TypeScript 6, rollup; `npm run verify`, `bench`, `smoke` | Un solo modo di lavorare fra i progetti |
| Node | Minimo 22 (`engines`), sviluppo e CI su Node 26 | Come SAT |
| Lingua | Inglese per CLI, messaggi, README e prompt; italiano per `plan/` | Come SAT |
| Rilascio | 0.0.1 segnaposto subito (F1-01); **0.1.0** solo dopo il gate di F4 e la fase F6; semver, `CHANGELOG.md`, pubblica il maintainer | Una prima impressione rumorosa non si recupera |
| Licenza | MIT | Come SAT |
| Dopo F7 | Drift fra snapshot, regole architetturali, verifica dei refactoring degli agenti: solo se richiesti da almeno due persone | Regola di SAT F16 |

## Fasi

| # | File | Obiettivo | Dipende da |
|---|---|---|---|
| — | [00-analisi.md](00-analisi.md) | Validazione dell'idea: concorrenti, buco nel mercato, punti critici | — |
| F1 | [01-benchmark.md](01-benchmark.md) | Nome riservato, formato delle annotazioni, fixture con sovrapposizioni inserite, repository reali, scorer, baseline | — |
| F2 | [02-fondamenta.md](02-fondamenta.md) | Pacchetto, CI, discovery dei tsconfig, estrazione delle unità con tipi e ID stabili, cache | F1-01 |
| F3 | [03-candidati.md](03-candidati.md) | Segnali deterministici, blocking, ranking, esclusioni; `paralog candidates` | F1, F2 |
| F4 | [04-giudizio.md](04-giudizio.md) | Provider, prompt di giudizio, verifica delle evidenze, cluster, costi; **gate di precisione** | F3 |
| F5 | [05-ciclo-agente.md](05-ciclo-agente.md) | Report e SARIF, differenze con l'ultima esecuzione, baseline, MCP, `paralog_similar`, `init --claude`, hook | F4 superata |
| F6 | [06-pronto-da-provare.md](06-pronto-da-provare.md) | README, demo, smoke dal tarball, documenti del repository, **0.1.0** | F5 |
| F7 | [07-lancio.md](07-lancio.md) | Risultati del benchmark pubblici, post, metriche, triage dei feedback | F6 |

```
F1 ─► F3 ─► F4 ══gate══► F5 ─► F6 ─► F7
F2 ─┘
```

F1 e F2 vanno avanti in parallelo dopo F1-01. Se il gate di F4 non passa, F5–F7 non partono: si torna a F3 o si chiude il progetto, e la decisione si scrive qui.

## Formato dei task

Ogni task ha questi campi:

- **ID** nel formato `F<fase>-<nn>`, univoco.
- **Stima**: **S** fino a mezza giornata, **M** 1–2 giorni, **L** 3–5 giorni (da spezzare se cresce).
- **Dipendenze**: ID di altri task.
- **Descrizione**: cosa fare e dove (cartelle e file indicativi).
- **Criteri di accettazione**: verificabili, con un test quando possibile.

Ogni file di fase ha in testa l'**Obiettivo** e lo **Stato** (con le note di implementazione quando la fase è chiusa), poi le **Decisioni** e i **Task**.

## Flusso di lavoro

- Una fase per branch: `fase/f<n>-<slug>`, da `develop`.
- `npm run verify` prima di ogni commit; `npm run bench` prima del merge di F3, F4 e di ogni fase che tocca candidati o giudizio.
- A fine fase: stato aggiornato nel file della fase, merge `--no-ff` su `develop`, push di `develop` e del branch di fase.
- Una sessione di lavoro per fase (`AGENTS.md`).

## Definition of Done

Vale `CONVENTIONS.md`. In più, per ogni task:

- I segnali e le regole nuovi o cambiati hanno test sia sul caso da trovare sia sui casi simili da non segnalare.
- Se il task tocca candidati o giudizio, `npm run bench` non peggiora precision né recall rispetto a `develop` (o il peggioramento è motivato nello stato della fase).
- Le opzioni e i default sono documentati nel README.
- I cambi di comportamento sono in `CHANGELOG.md`.
- `npm run verify` passa.
