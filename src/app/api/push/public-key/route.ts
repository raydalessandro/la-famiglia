import { NextResponse } from 'next/server'

// GET /api/push/public-key → { data: { key: string } }
//
// La VAPID public key serve al client per chiamare PushManager.subscribe().
// Non è un secret (per definizione la chiave pubblica è esposta), ma la
// serviamo via API invece di esporre la env var con prefisso NEXT_PUBLIC_
// così l'env esistente (VAPID_PUBLIC_KEY senza prefix, lato server) non
// va duplicata in produzione.
//
// Endpoint pubblico — il middleware non lo blocca perché vive sotto
// /api/auth/... no, vive sotto /api/push. Devo verificare PUBLIC_PATHS
// nel middleware. In realtà, anche senza essere pubblico, l'utente
// loggato lo chiamerà — è il primo step dell'attivazione push. Tutta
// la UI live solo per utenti autenticati.

export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY
  if (!key) {
    return NextResponse.json(
      { data: null, error: 'Notifiche push non configurate sul server' },
      { status: 500 },
    )
  }
  return NextResponse.json({ data: { key }, error: null })
}
