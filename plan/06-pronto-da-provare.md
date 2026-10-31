# F6 — Pronto da provare e 0.1.0

**Obiettivo.** Uno sviluppatore che non conosce paralog lo installa, lo prova su un esempio e sul suo repository in cinque minuti, e sa cosa viene mandato al modello.

**Stato.** Da iniziare dopo F5.

## Decisioni

- Il messaggio: *"paralog finds the business logic your codebase already has twice, and tells your agent before it writes it a third time."*
- Il README dice chiaramente cosa paralog non fa e che cosa arriva al modello.
- Si pubblica la **0.1.0** solo quando lo smoke test dal tarball passa in CI.

## Task

### F6-01 README
- **Stima**: M
- **Dipendenze**: F5-07
- **Descrizione**: messaggio, quick start (`npx paralog init --claude`, `npx paralog check`), esempio di finding, tabella delle configurazioni degli agenti, opzioni, "What goes to the model", "What paralog does not do" (non è un linter, non misura complessità, non modifica file, non garantisce di trovare tutto), risultati del benchmark per modello.
- **Criteri di accettazione**: rilettura da parte di una persona che non conosce il progetto.

### F6-02 Esempio e demo
- **Stima**: M
- **Dipendenze**: F1-03
- **Descrizione**: `examples/shop` derivato dalla fixture, da clonare con `npx degit`; GIF o registrazione del terminale riproducibile da script (come `npm run media` in SAT): check, finding, agente che usa `paralog_similar`.
- **Criteri di accettazione**: lo script rigenera le immagini; l'esempio funziona con un provider locale.

### F6-03 Smoke test dal tarball
- **Stima**: S
- **Dipendenze**: F2-01
- **Descrizione**: `npm run smoke`: `npm pack`, installazione in una copia pulita dell'esempio, `paralog candidates` (senza IA) e `paralog --help`; in CI su Node 22.
- **Criteri di accettazione**: job `smoke` verde.

### F6-04 Documenti del repository
- **Stima**: S
- **Dipendenze**: —
- **Descrizione**: LICENSE nel pacchetto, CONTRIBUTING, SECURITY (prompt injection, chiavi), CHANGELOG, template delle issue con un template "falso positivo" che chiede i due frammenti di codice.
- **Criteri di accettazione**: file presenti; `files` di `package.json` corretto.

### F6-05 Pubblicazione 0.1.0
- **Stima**: S
- **Dipendenze**: F6-01, F6-02, F6-03, F6-04
- **Descrizione**: versione, CHANGELOG, tag; pubblicazione su npm a cura del maintainer.
- **Criteri di accettazione**: `npx paralog@0.1.0 --version` funziona in un progetto pulito.
