# F3 — Candidati deterministici

**Obiettivo.** Da tutte le unità, ottenere una lista corta di coppie candidate che contenga quasi tutte le sovrapposizioni vere, senza IA e senza confrontare tutte le coppie.

**Stato.** Da iniziare.

## Decisioni

- Ogni segnale è spiegabile e salvato con il candidato: diventa parte delle evidenze di F4.
- Le esclusioni sono la difesa principale contro i falsi positivi: polimorfismo voluto, adattatori, getter.
- Gli embedding sono opzionali e spenti di default; i candidati devono funzionare senza.

## Task

### F3-01 Segnali
- **Stima**: M
- **Dipendenze**: F2-03
- **Descrizione**: per una coppia di unità: tipi di dominio condivisi in parametri e ritorno; Jaccard delle proprietà toccate; Jaccard delle chiamate; somiglianza dei nomi (token camelCase, piccola lista di sinonimi: get/fetch/load/find, remove/delete/deactivate/close); letterali in comune; forma dell'AST normalizzata.
- **Criteri di accettazione**: test per segnale con coppie positive e near-miss della fixture.

### F3-02 Blocking
- **Stima**: M
- **Dipendenze**: F3-01
- **Descrizione**: indice invertito per tipo di dominio, proprietà toccata e letterale; si confrontano solo le unità che condividono almeno una chiave; chiavi troppo comuni (es. `id`, `Logger`) pesate o ignorate.
- **Criteri di accettazione**: sul repository più grande le coppie confrontate sono meno dell'1% di quelle possibili; nessun caso della fixture perso per colpa del blocking.

### F3-03 Esclusioni
- **Stima**: S
- **Dipendenze**: F3-01
- **Descrizione**: escludere unità banali (sotto N istruzioni), getter/setter, overload, coppie che implementano lo stesso metodo della stessa interfaccia o classe astratta, coppie fra un'unità e la sua chiamata diretta, test; tutto configurabile.
- **Criteri di accettazione**: nessun near-miss di tipo "strategia" o "mapper" della fixture nei primi K candidati.

### F3-04 Embedding opzionali
- **Stima**: M
- **Dipendenze**: F3-01
- **Descrizione**: interfaccia `Embedder` con adattatore OpenAI-compatibile (Ollama in locale); embedding del corpo normalizzato; cache per `bodyHash`; ricerca dei vicini per aggiungere candidati al blocking.
- **Criteri di accettazione**: il benchmark riporta recall con e senza embedding; spento se non configurato.

### F3-05 Ranking
- **Stima**: S
- **Dipendenze**: F3-01, F3-02, F1-05
- **Descrizione**: punteggio pesato dei segnali; pesi scelti sulla fixture e verificati sui repository reali (attenzione a non adattarli troppo alla fixture: metà dei casi riservata alla verifica).
- **Criteri di accettazione**: recall@K ≥ 90% sulla metà di verifica della fixture con K tale da restare sotto i 200 candidati.

### F3-06 `paralog candidates`
- **Stima**: S
- **Dipendenze**: F3-05
- **Descrizione**: comando che stampa i candidati con i segnali, in terminale e JSON nel formato dello scorer.
- **Criteri di accettazione**: `npm run bench` lo usa; output stabile fra due esecuzioni.
