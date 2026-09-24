// cron から叩かれる定期処理の雛形。
// service role キーで動くので RLS をバイパスし、全ユーザーの行を処理できる。
//
// デプロイ: supabase functions deploy scheduled-job

import { createClient } from 'jsr:@supabase/supabase-js@2'

interface ItemData {
  id: string
  title: string
  status: string
  lastCheckedAt?: string
  lastError?: string
  [k: string]: unknown
}

/** Expo Push は1リクエストに最大100件まで積める */
const PUSH_CHUNK = 100

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: rows, error } = await db.from('items').select('id, user_id, data')
  if (error) return new Response(error.message, { status: 500 })

  const pushes: { to: string; title: string; body: string }[] = []
  let matched = 0

  for (const row of rows ?? []) {
    const item = row.data as ItemData
    if (item.status !== 'watching') continue
    const now = new Date().toISOString()

    // === ここに判定処理を書く ===
    const hit = false
    if (!hit) {
      await db.from('items').update({ data: { ...item, lastCheckedAt: now } }).eq('id', row.id)
      continue
    }

    matched++
    const message = `${item.title} が条件を満たしました`
    await db
      .from('items')
      .update({ data: { ...item, status: 'found', lastCheckedAt: now } })
      .eq('id', row.id)

    // 1ユーザーが複数端末を持ちうるので user_id で引く
    const { data: tokens } = await db
      .from('push_tokens')
      .select('token')
      .eq('user_id', row.user_id)
    for (const t of tokens ?? []) {
      pushes.push({ to: t.token, title: item.title, body: message })
    }
  }

  // Expo Push はまとめて送れる。失敗はレシートで確認する（後述）
  for (let i = 0; i < pushes.length; i += PUSH_CHUNK) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pushes.slice(i, i + PUSH_CHUNK).map((p) => ({ ...p, sound: 'default' }))),
    })
  }

  return Response.json({ checked: rows?.length ?? 0, matched, pushed: pushes.length })
})
