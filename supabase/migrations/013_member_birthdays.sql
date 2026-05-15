-- ═══ MEMBER BIRTHDAYS / COMPLEANNI ═══
-- Aggiunge la data di nascita ai membri per supportare la feature
-- "compleanni": banner sul feed + notifica push il giorno del
-- compleanno. Driver: la famiglia ha dimenticato il compleanno di
-- una zia, e Famiglia esiste anche per evitare questo.
--
-- Tipo `DATE` (non `TIMESTAMPTZ`): vogliamo il giorno calendariale,
-- non un istante. "Marco è nato il 12 maggio 1973" non ha senso con
-- ore/timezone — ogni anno il banner deve partire alle 00:00 ora
-- locale della famiglia. Niente NOT NULL: campo opzionale, alcuni
-- membri (specie chi ha aderito tardi) potrebbero non volerla
-- inserire subito.
--
-- Index composito su (extract(month), extract(day)) con
-- `WHERE birth_date IS NOT NULL`: l'API `GET /api/birthdays/today`
-- (e il cron giornaliero) deve trovare "tutti i membri con
-- compleanno MM-DD = oggi" indipendentemente dall'anno. La query
-- diventa:
--   WHERE extract(month from birth_date) = $1
--     AND extract(day   from birth_date) = $2
-- L'index sul campo computato consente lookup O(log n) invece di un
-- full scan riga per riga. Il filtro parziale esclude le righe NULL
-- dall'index e tiene la struttura piccola.
--
-- Nota: lo snippet originale in HANDOFF.md proponeva
-- `to_char(birth_date, 'MM-DD')` ma `to_char(date, text)` non e`
-- IMMUTABLE (dipende da `lc_time`) e Postgres rifiuta l'index con
-- ERROR 42P17. `extract(month|day from date)` invece e` IMMUTABLE
-- ed e` la forma canonica per questo pattern in Postgres. Scelta
-- approvata dall'utente prima della migration.
--
-- Niente RLS / publication realtime da toccare: la `birth_date` è
-- una colonna su una tabella esistente (`members`) le cui policy
-- erano gia` stabilite. La data di nascita viene mostrata come
-- parte normale del profilo membro: chi vede il profilo vedrà
-- anche il compleanno (modello attualmente adottato per `name`,
-- `bio`, ecc.).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
--
-- Nota: il cron Vercel + endpoint `/api/cron/birthday-notifications`
-- e l'UI (Settings date picker, banner feed) sono in PR separate.

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS birth_date DATE;

CREATE INDEX IF NOT EXISTS idx_members_birthday
  ON members (
    extract(month from birth_date),
    extract(day   from birth_date)
  )
  WHERE birth_date IS NOT NULL;
