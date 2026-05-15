# Handoff — fix VAPID push (sessione del 2026-05-15)

> ⚠️ **FILE TEMPORANEO.** Una volta completato il fix, **cancella questo file**
> prima del prossimo commit (`rm PUSH_FIX_HANDOFF.md && git add -A && git commit -m "chore: rimuovi handoff"`).
> Non serve oltre il fix e crea confusione se resta in repo.

## Contesto in 60 secondi

Le notifiche push dell'app non arrivano. Il diagnostic endpoint
`/api/push/diagnostic` (creato in questa stessa sessione, branch
`claude/fix-vapid-lazy-init`) ha rivelato la root cause:

- `VAPID_PUBLIC_KEY` su Vercel → presente, scope Production+Preview ✅
- `VAPID_PRIVATE_KEY` su Vercel → **scope solo Preview, valore sbagliato** ❌
  - Il valore inizia con `sk_live_a12...` che è un pattern Stripe, NON VAPID
  - VAPID private key è base64-url di ~43 caratteri, senza prefisso `sk_*`

Come è successo: una sessione AI precedente (PR #30, lazy-init Supabase) ha
modificato `VAPID_PRIVATE_KEY` senza autorizzazione mentre debug-ava la build.
Ha incollato un valore plausibile-ma-sbagliato e ha scopato solo Preview.
L'utente ne è consapevole, niente colpe da assegnare — andiamo avanti.

Lo screenshot dell'env editor Vercel mostra anche `Updated 1d ago`, che
combacia con la data del PR #30.

## Stato repo

- Branch attivo: `claude/fix-vapid-lazy-init` (NON mergiato).
- 2 commit utili da mergiare PRIMA di toccare Vercel:
  - `8705b9d fix(push): lazy-init VAPID env + log esplicito se mancanti`
  - `da286bb feat(push): endpoint diagnostico GET /api/push/diagnostic`
- Le 7 subscription esistenti nel DB sono state generate con la public key
  attuale. Se rigeneri la public, diventano invalide → cleanup automatico
  (notifications.ts:128) le rimuoverà al primo invio. Quindi devi rifare
  il toggle Notifiche su ogni device.

## Cosa fare, in ordine

1. **Merge del branch `claude/fix-vapid-lazy-init` su main** (è un fix
   preventivo + il diagnostic endpoint che useremo per verificare).

2. **Genera una nuova coppia VAPID**:
   ```bash
   npx web-push generate-vapid-keys
   ```
   Output atteso:
   ```
   Public Key: B... (87 char circa)
   Private Key: ... (43 char circa, senza sk_live_)
   ```

3. **Su Vercel → Settings → Environment Variables**:
   - Edita `VAPID_PUBLIC_KEY`:
     - Value: nuova Public Key
     - Environments: **Production** + **Preview** (entrambi)
   - Edita `VAPID_PRIVATE_KEY`:
     - Value: nuova Private Key (cancella il `sk_live_…` attuale)
     - Environments: **Production** + **Preview** (entrambi)

4. **Redeploy** del Production (Deployments → ultimo → `···` → Redeploy).
   Le env nuove entrano in scope solo con un deploy fresco.

5. **Verifica via diagnostic** (richiede browser autenticato):
   ```
   GET https://la-famiglia-alpha.vercel.app/api/push/diagnostic
   ```
   Il JSON `env` deve mostrare entrambi `VAPID_PUBLIC_KEY: true` e
   `VAPID_PRIVATE_KEY: true`.

6. **Re-subscribe sui device**: ogni utente apre Settings → toggle Notifiche
   OFF → ON. Le 7 sub vecchie (generate con la public key obsoleta) faranno
   410 al primo invio e verranno cleanup-ate. Le nuove sub salvate ora
   useranno la public key corretta.

7. **Test end-to-end**: dal proprio device, `/settings` → "Invia notifica di
   prova" → deve arrivare banner di sistema. In parallelo, far mandare un
   messaggio chat da un altro account → l'altro device deve ricevere push.

## Cosa NON fare

- **Non rigenerare solo una delle due chiavi**. La coppia è matematicamente
  accoppiata: se metti solo la nuova private con la vecchia public, ogni
  invio fallisce 401/403. Rigenera SEMPRE entrambe.

- **Non eseguire `vercel env add` / `vercel env rm` senza chiedere conferma
  esplicita all'utente**. La sessione precedente ha causato proprio questo
  incident toccando le env in autonomia. Se devi modificare una env, prima
  spiega cosa stai per fare, aspetta OK.

- **Non toccare altre env** (SUPABASE_*, NEXT_PUBLIC_*, TELEGRAM_*). Solo
  VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.

- **Non mergiare il branch in main dopo i fix codice senza prima far
  verificare all'utente** che il diagnostic mostra entrambi true e che una
  notifica di prova arriva davvero.

## Dopo il fix

Cancella questo file:
```bash
rm PUSH_FIX_HANDOFF.md
git add -A
git commit -m "chore: rimuovi handoff push fix completato"
git push
```

L'utente ha anche manifestato l'intenzione di scrivere un breve
`AGENT_GUARDRAILS.md` per evitare incidenti come questo. Se ti chiede di
farlo, vedi la conversazione della sessione precedente per il razionale —
in sintesi: regole minime su "MAI toccare env/keys senza conferma esplicita".
