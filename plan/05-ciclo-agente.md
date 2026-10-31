# F5 — Ciclo dell'agente

**Obiettivo.** Lo sviluppatore e il suo agente usano paralog nel lavoro di ogni giorno: prima di scrivere ("esiste già?"), dopo aver scritto ("ho duplicato qualcosa?") e in CI ("questa PR aggiunge sovrapposizioni?").

**Stato.** Parte solo se il gate di F4 è passato.

## Decisioni

- Stesso ciclo collaudato in SAT: ID stabili, risposte che iniziano con risolti / nuovi / rimanenti, `init` idempotente, skill e hook per Claude Code, baseline in CI.
- Il server MCP è in sola lettura: non modifica file né esegue comandi.
- `paralog_similar` è la funzione di prevenzione: l'agente la chiama **prima** di scrivere una funzione nuova.

## Task

### F5-01 Report
- **Stima**: M
- **Dipendenze**: F4-05
- **Descrizione**: `paralog check [path]` con output terminale, `--json`, `--sarif`, `--markdown`; codici di uscita come `sat-check` (0 nei limiti, 1 oltre, 2 per errori); `--max-findings`.
- **Criteri di accettazione**: SARIF valido caricato in GitHub code scanning in un repository di prova.

### F5-02 Differenze con l'ultima esecuzione
- **Stima**: S
- **Dipendenze**: F5-01
- **Descrizione**: `.paralog/last.json`; ogni report inizia con "N resolved, N new, N remaining".
- **Criteri di accettazione**: test con una sovrapposizione rimossa e una aggiunta fra due esecuzioni.

### F5-03 Baseline
- **Stima**: S
- **Dipendenze**: F5-02
- **Descrizione**: `--baseline <file>` e `--update-baseline`: i finding nella baseline passano, i limiti contano solo i nuovi.
- **Criteri di accettazione**: esempio di workflow GitHub Actions nella documentazione; test end-to-end sulla fixture.

### F5-04 Server MCP
- **Stima**: M
- **Dipendenze**: F5-01
- **Descrizione**: `paralog mcp` su stdio. Tool: `paralog_check` (path o file cambiati), `paralog_finding` (id → sorgenti, evidenze, suggerimento), `paralog_similar` (simbolo o firma e descrizione di ciò che l'agente sta per scrivere → unità esistenti simili). Risorse `paralog://findings`, `paralog://findings/<id>`. Prompt `paralog-dedupe` e `paralog-audit`.
- **Criteri di accettazione**: test di integrazione con un client MCP; configurato e provato con Claude Code.

### F5-05 `paralog_similar`
- **Stima**: M
- **Dipendenze**: F5-04, F3-05
- **Descrizione**: dato del codice non ancora scritto (firma, tipi, descrizione) o un'unità esistente, cercare con i segnali di F3 (e gli embedding se configurati) e, opzionalmente, confermare con il giudizio di F4.
- **Criteri di accettazione**: sulla fixture, descrivere a parole 10 unità esistenti le trova fra i primi 3 risultati in almeno 8 casi.

### F5-06 Analisi incrementale per l'hook
- **Stima**: M
- **Dipendenze**: F2-05, F4-06
- **Descrizione**: dati i file cambiati, riestrarre solo quelli e confrontare solo le unità nuove o cambiate con l'indice; il giudizio solo per i primi candidati.
- **Criteri di accettazione**: sotto i 10 s su un repository medio con cache calda.

### F5-07 `paralog init`
- **Stima**: M
- **Dipendenze**: F5-04, F5-06
- **Descrizione**: come `sat-check init`: sezione paralog in `AGENTS.md` (quando chiamare `paralog_similar`, come leggere un finding, cosa non fare), puntatore in `CLAUDE.md`, server in `.mcp.json` e nelle configurazioni degli agenti presenti; `--claude` aggiunge una skill e un hook che esegue `paralog hook` dopo le modifiche a `.ts`/`.tsx`; `--dry-run`.
- **Criteri di accettazione**: idempotente (due esecuzioni = una); test sui file generati.
