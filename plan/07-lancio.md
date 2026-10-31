# F7 — Lancio e feedback

**Obiettivo.** Far arrivare paralog a chi ne ha bisogno con un argomento verificabile (il benchmark) e scegliere le fasi successive dai feedback, non dalle ipotesi.

**Stato.** Da iniziare dopo F6.

## Decisioni

- Il benchmark pubblico è il contenuto del lancio: numeri riproducibili, anche quelli sfavorevoli.
- Le fasi dopo F7 nascono da richieste di almeno due persone.

## Task

### F7-01 Benchmark pubblico
- **Stima**: M
- **Dipendenze**: F6-05
- **Descrizione**: `benchmarks/` documentato; articolo con la tabella per modello e il confronto con jscpd e Fallow di F1-06 ai livelli di difficoltà 2–4.
- **Criteri di accettazione**: chiunque riproduce i numeri con `npm run bench` e le proprie chiavi.

### F7-02 Post e community
- **Stima**: M
- **Dipendenze**: F7-01
- **Descrizione**: post su Dev.to, r/typescript, Show HN, community di Claude Code e MCP; un caso reale con prima e dopo.
- **Criteri di accettazione**: post pubblicati e collegati in `plan/metriche.md`.

### F7-03 Metriche e triage
- **Stima**: S
- **Dipendenze**: F7-02
- **Descrizione**: `plan/metriche.md` con download settimanali, stelle, issue, falsi positivi segnalati; triage settimanale dei falsi positivi (ognuno diventa un near-miss nella fixture).
- **Criteri di accettazione**: registro aggiornato per quattro settimane.

### F7-04 Scelta delle fasi successive
- **Stima**: S
- **Dipendenze**: F7-03
- **Descrizione**: candidati: drift fra snapshot (sovrapposizioni nuove per release), regole di responsabilità ("la logica di fatturazione sta solo in `billing/`"), verifica dei refactoring di un agente (la sovrapposizione è sparita senza crearne altre), supporto JavaScript.
- **Criteri di accettazione**: decisione scritta in README con le richieste che la motivano.
