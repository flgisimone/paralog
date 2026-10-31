# 00 — Analisi di partenza

Analisi del 31/10/2026 sull'idea iniziale (allora "CodeDNA"): ha senso, ma solo ridotta alla duplicazione semantica e alle responsabilità sovrapposte.

## Il buco nel mercato

Due servizi che implementano la stessa responsabilità di business con codice diverso sono invisibili ai tool esistenti. I rilevatori di cloni, anche nelle modalità "semantiche", trovano codice con variabili rinominate, non due implementazioni diverse della stessa regola. I tool deterministici non possono farlo per definizione; quelli basati su LLM descrivono il codice invece di giudicarlo.

Il vantaggio tecnico di paralog: con la Compiler API ha i tipi risolti. Due funzioni che prendono un `User`, toccano gli stessi campi e restituiscono lo stesso tipo sono candidati forti, e questo segnale manca ai tool basati su tree-sitter.

## Concorrenti

| Tool | Licenza | Cosa copre | Cosa lascia a paralog |
|---|---|---|---|
| [Fallow](https://github.com/fallow-rs) | MIT (runtime a pagamento) | Dead code, cicli, cloni (fino a variabili rinominate), complessità, confini architetturali, health score, MCP; Rust, nessuna IA | Duplicazione di responsabilità con implementazioni diverse |
| [CodeScene MCP + ACE](https://codescene.io/docs/developer-tools/mcp/codescene-mcp-server.html) | Commerciale | Code Health, loop analizza → rifattorizza → verifica; ACE solo C++, Java, C# | TypeScript, open source, semantica |
| [GitNexus](https://github.com/sec-js/gitnexus) | MIT | Knowledge graph, impact analysis, rename, wiki via MCP | Giudizio sulle sovrapposizioni |
| dependency-cruiser, knip, madge, jscpd | Open source | Regole di dipendenza, dead code, cicli, copia-incolla | — (si usano accanto, non si rifanno) |

### Aggiornamento del 31/10/2026 (F1-06)

La tabella sopra è superata su un punto: **jscpd 5.x** ha una modalità `--semantic` (cloni Type-4: embedding dei corpi delle funzioni, modello locale o API) e **Fallow 3.x** ha `fallow similar-code` (sovrapposizioni semantiche fra funzioni con un modello di embedding locale; i candidati sono "non verificati" e l'agente li giudica). Il buco nel mercato si restringe: entrambi propongono coppie simili, nessuno dei due (per quanto si vede dalla documentazione) usa i tipi risolti né verifica le evidenze di un giudizio. Il vantaggio da dimostrare con il benchmark diventa: precision più alta a parità di recall grazie ai tipi, alle proprietà toccate e alla verifica delle evidenze, e copertura dei casi di livello 3–4 (responsabilità sparse in più funzioni) che un confronto fra coppie di embedding non vede. Le due modalità vanno misurate in locale (F1-06).

## Punti critici dell'idea iniziale e risposta nel piano

| Punto critico | Risposta |
|---|---|
| Scope da azienda (18 punti nella DoD della v0.1, 7 fasi prima del valore) | Un solo problema; valore misurabile a fine F4 |
| "Evidence validation" che controlla solo l'esistenza delle righe citate | Evidenze + supporto deterministico (F4-03); i non verificati sono nascosti |
| Duplicazione cercata su riassunti gerarchici, confronto quadratico | Imbuto: candidati deterministici con blocking (F3), LLM solo sulle coppie (F4) |
| Verifica semantica circolare, score globale non riproducibile | Nessun health score; cache dei verdetti; stabilità misurata (F4-08) |
| Refactoring "deterministico" che in realtà scrive codice con un LLM | paralog non modifica file; l'agente corregge, paralog verifica (F5) |
| Modelli locali deboli nel ragionamento | Benchmark per modello, pubblicati (F4-07, F7-01) |
| Invalidazione incrementale delle conclusioni globali | Cache per coppia di `bodyHash`: una coppia si rigiudica solo se cambia uno dei due corpi (F4-06) |
| Ricostruire discovery, grafo e detector statici | Fuori scope: Fallow e dependency-cruiser |
