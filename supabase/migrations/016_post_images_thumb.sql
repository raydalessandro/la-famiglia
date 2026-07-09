-- ═══ THUMBNAIL PER LE FOTO DEI POST (Affinamento A3) ═══
-- Il feed mostrava le foto originali (1920px, 200KB–1MB l'una) dentro
-- anteprime alte 160px: 10 post × 4 foto = molti MB scaricati su
-- mobile per niente. Da ora il client genera all'upload DUE versioni
-- (thumb ~480px + full 1920px) e il feed usa la thumb; il lightbox
-- continua a usare l'originale.
--
-- `thumb_url` è NULLABLE: i post caricati prima di questa migration
-- non hanno la thumb e il client fa fallback su image_url
-- (`thumb_url ?? image_url`). Nessun backfill necessario.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.

ALTER TABLE post_images ADD COLUMN IF NOT EXISTS thumb_url TEXT;
