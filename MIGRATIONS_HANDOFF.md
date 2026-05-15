# Handoff — migration Fase 6 (sessione del 2026-05-15, parte 2)

> ⚠️ **FILE TEMPORANEO.** Una volta completate tutte e 3 le migration,
> **cancella questo file** prima dell'ultimo commit
> (`rm MIGRATIONS_HANDOFF.md && git add -A && git commit -m "chore: rimuovi handoff completato"`).
>
> Questo file ti riconosci: sei la stessa sessione che ha appena
> fixato il bug VAPID push. Il file precedente (`PUSH_FIX_HANDOFF.md`)
> è stato rinominato — task nuova, stesso pattern.

## Status precedente — fix VAPID ✅ completato

Keys VAPID rigenerate, sostituite su Vercel (Production + Preview),
redeploy fatto, toggle Notifiche rifatto sui device. La notifica di
prova arriva. PR #35/#36/#37 mergiate su main.

L'endpoint `/api/push/diagnostic` resta in produzione: in futuro,
se le push smettono di nuovo, è il primo posto dove guardare.

## Task ora

Eseguire **una alla volta** le migration di Fase 6 documentate in
`HANDOFF.md` (sezione "Fase 6 — Da fare (richiede modifiche al DB)"):

1. **6.4 — Bookmark / salva post** → migration `012_post_bookmarks.sql`
2. **6.5 — Compleanni** → migration `013_member_birthdays.sql` (+ cron
   Vercel, ma quello è separato)
3. **6.6 — Mention @utente** → migration `014_mentions.sql`

Lo schema SQL completo per ognuna è già scritto in `HANDOFF.md` nelle
relative sezioni (6.4, 6.5, 6.6). Non inventare schema nuovi — usa
quelli, sono stati approvati dall'utente.

### Sequenza per ogni migration

1. Leggi la sezione corrispondente in `HANDOFF.md`.
2. Crea il file SQL in `supabase/migrations/NNN_nome.sql` copiando lo
   schema dall'HANDOFF.
3. **Esegui la migration tramite MCP Supabase** (hai il connettore
   configurato in questa sessione). Verifica che tabelle / indici /
   policy RLS / publication realtime siano applicati senza errori.
4. Aggiorna `PRODUCTION_CHANGELOG.md` con una entry datata
   `2026-05-15` che documenta la migration applicata in produzione
   (segui il formato delle entry esistenti — newest first, riga
   "What to apply on production" con il comando o "applicata via MCP").
5. **STOP**: commit del SQL + changelog su un branch dedicato
   (es. `claude/6.4-bookmark-migration`), apri PR, fermati e chiedi
   conferma all'utente prima di procedere a 6.5.

### Cosa NON fare

- **NON costruire API routes né UI in autonomia.** Le sezioni 6.4–6.6
  in HANDOFF.md descrivono anche API e UI, ma quelle sono task separate
  che l'utente vuole revisionare. La tua task in questo file è SOLO la
  migration SQL + entry changelog. Stop lì.
- **NON modificare env Vercel/Supabase.** History: una sessione passata
  ha rotto le VAPID toccando le env in autonomia, fixato oggi. Se serve
  una nuova env per il cron 6.5, fermati e chiedi.
- **NON eseguire migration multiple in un colpo solo.** Una alla volta,
  con commit + PR + check-point utente in mezzo. Le migration sono
  irreversibili in produzione e vogliamo controllo.
- **NON forzare schema diversi** da quelli scritti in HANDOFF.md. Se
  vedi un problema con lo schema proposto (es. tipo errato, indice
  mancante), segnala all'utente prima di modificare.
- **NON rinominare o eliminare file esistenti** non strettamente
  necessari alla migration.
- **NON mergiare i branch in main.** Solo PR aperta, utente mergia
  manualmente.

### Branch policy

- Un branch per ogni voce (6.4, 6.5, 6.6). Niente refactor o "già che
  ci sono" in mezzo.
- Nome: `claude/6.4-bookmark-migration`, `claude/6.5-birthdays-migration`,
  `claude/6.6-mentions-migration`.
- Commit conciso, focus sul perché (segui il pattern dei commit recenti
  del repo).

### Verifica post-migration

Tramite MCP Supabase, dopo aver eseguito la migration:
- Tabella creata? (es. `select 1 from post_bookmarks limit 0` → 0 rows)
- Indici creati? (`select indexname from pg_indexes where tablename = 'post_bookmarks'`)
- RLS attiva se prevista? (`select polname from pg_policies where tablename = '…'`)
- Realtime publication aggiornata se prevista? (`select * from pg_publication_tables where pubname = 'supabase_realtime' and tablename = '…'`)

Includi questi check nel commit message o in un commento del PR così
l'utente può confermare lo stato senza accedere a Supabase manualmente.

## Quando hai finito 6.4

1. PR aperta su GitHub.
2. Commit message + descrizione PR riassumono cosa è stato fatto.
3. NIENTE merge — lascia all'utente.
4. STOP. Non procedere a 6.5 finché l'utente non te lo conferma.

## Dopo tutte e 3

Cancella questo file:
```bash
rm MIGRATIONS_HANDOFF.md
git add -A
git commit -m "chore: rimuovi handoff migration completate"
git push
```
