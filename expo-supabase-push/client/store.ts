// クライアント側の永続化。匿名サインインで得た auth.uid() を所有者にする。
//
// 落とし穴: supabase-js は window が無い環境（テストの node ランナー等）では
// セッションをメモリに持つ。インスタンスごとに別の匿名ユーザーになってしまうので、
// storage を明示的に渡すこと。

import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface Session {
  db: SupabaseClient
  /** RLS の所有者キー */
  userId: string
  /** Push の宛先は端末単位なので別に持つ */
  deviceId: string
}

const DEVICE_KEY = 'app.device-id'

/**
 * 匿名サインインしてセッションを作る。
 * 2回目以降は AsyncStorage の保存済みセッションを再利用するので、
 * user_id は同じ端末で一貫する。
 */
export async function createSession(url: string, anonKey: string): Promise<Session | undefined> {
  const db = createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })

  let userId: string | undefined
  try {
    const { data: got } = await db.auth.getSession()
    userId = got.session?.user?.id
    if (!userId) {
      const { data, error } = await db.auth.signInAnonymously()
      if (error) throw error
      userId = data.user?.id
    }
  } catch (e) {
    console.warn('anonymous sign-in failed:', e)
    return undefined // 呼び出し側でローカル保存にフォールバックする
  }
  if (!userId) return undefined

  let deviceId = await AsyncStorage.getItem(DEVICE_KEY)
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    await AsyncStorage.setItem(DEVICE_KEY, deviceId)
  }
  return { db, userId, deviceId }
}

/** Expo Push トークンを保存する。サーバーはこれを宛先に使う */
export async function savePushToken(s: Session, token: string): Promise<void> {
  const { error } = await s.db.from('push_tokens').upsert({
    device_id: s.deviceId,
    user_id: s.userId,
    token,
    updated_at: new Date().toISOString(),
  })
  if (error) console.warn('savePushToken', error.message)
}
