# F2 — Fondamenta

**Obiettivo.** Un pacchetto che legge un repository TypeScript ed estrae le *unità* (funzioni, metodi, arrow function con nome) con tipi risolti, proprietà toccate, chiamate e ID stabili.

**Stato.** In corso.

- F2-01: fatto. Pacchetto ESM con entry point `paralog` (`dist/index.js`), `paralog/mcp` (`dist/mcp.js`, per ora solo `serverInfo`) e bin `paralog` (`--version`, `--help`; codici di uscita 0/1/2). TypeScript 6 strict, Vitest 5, ESLint 10 con typescript-eslint `strictTypeChecked`, rollup con `rollup-plugin-dts`. `AGENTS.md`, `CLAUDE.md`, `CONVENTIONS.md` scritti da zero (SAT non era disponibile nella sessione: da riallineare). CI GitHub Actions: `verify` su Node 22 e 26, job `smoke` su Node 22. `npm run smoke` impacchetta il tarball, lo installa in un progetto pulito e prova CLI ed entry point (anticipa F6-03).
- Nessuna dipendenza di runtime ancora: ts-morph entra con F2-03.

## Decisioni

- ts-morph sopra la Compiler API; un `Project` per tsconfig, riusato.
- L'ID di un'unità non dipende dalle righe: `<path relativo>#<nome qualificato>:<kind>` (es. `src/users/user.service.ts#UserService.deactivate:method`). Le righe servono per le evidenze.
- Discovery minima: i tsconfig (anche con project references e workspace pnpm/npm/yarn), niente analisi delle dipendenze dei package.

## Task

### F2-01 Scaffold del pacchetto
- **Stima**: M
- **Dipendenze**: F1-01
- **Descrizione**: pacchetto singolo con entry point `paralog`, `paralog/mcp` e bin `paralog`; TypeScript strict, Vitest, ESLint, rollup come SAT; `AGENTS.md`, `CLAUDE.md`, `CONVENTIONS.md` adattati da SAT; CI GitHub Actions con `verify` su Node 22 e 26.
- **Criteri di accettazione**: `npm run verify` passa in CI; `npx paralog --version` funziona da `npm pack`.

### F2-02 Discovery dei progetti
- **Stima**: S
- **Dipendenze**: F2-01
- **Descrizione**: trovare i tsconfig dalla root (workspace, project references); escludere test, file generati e `node_modules` con glob configurabili (`paralog.config.json`).
- **Criteri di accettazione**: test su un repository con monorepo pnpm e project references della fixture; i test sono esclusi di default.

### F2-03 Estrazione delle unità
- **Stima**: L
- **Dipendenze**: F2-02
- **Descrizione**: `CodeUnit { id, name, kind, file, startLine, endLine, signature, paramTypes, returnType, touchedProperties, calls, literals, statements, bodyHash }`. `touchedProperties` risolte al tipo che le dichiara (`User.status`, non `status`); `calls` risolte al simbolo di destinazione; `literals` = stringhe e numeri non banali (messaggi d'errore, codici).
- **Criteri di accettazione**: test di estrazione su casi scelti (classi, overload, arrow function esportate, generics, metodi statici); tutte le unità della fixture estratte.

### F2-04 ID stabili
- **Stima**: S
- **Dipendenze**: F2-03
- **Descrizione**: verificare e documentare quando un ID cambia.
- **Criteri di accettazione**: test: spostare righe, riordinare metodi o cambiare il corpo non cambia l'ID; rinominare o spostare in un altro file lo cambia (documentato nel README).

### F2-05 Cache per file
- **Stima**: M
- **Dipendenze**: F2-03
- **Descrizione**: `.paralog/cache/` con le unità per file indicizzate dall'hash del contenuto e dalla versione dell'estrattore; invalidazione quando cambia un tipo importato (hash delle dichiarazioni dipendenti).
- **Criteri di accettazione**: la seconda esecuzione senza modifiche è almeno 5 volte più veloce; modificare un'interfaccia condivisa riestrae i file che la usano.

### F2-06 `paralog units` e prestazioni
- **Stima**: S
- **Dipendenze**: F2-03, F1-04
- **Descrizione**: comando di debug che stampa le unità in JSON; misura su tutti i repository di F1-04.
- **Criteri di accettazione**: tempi e memoria nello stato della fase; obiettivo sotto i 60 s e 2 GB a freddo sul repository più grande.
