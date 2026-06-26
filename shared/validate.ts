// クライアントから届くメッセージは信用できない (untrusted)。
// 「なんだか分からない値 (unknown)」を受け取り、本当に正しい Action か
// 手作業で確かめる。正しければ Action を、ダメなら null を返す。
//
// 以前は zod スキーマで検証していたが、何をチェックしているかが
// 読んですぐ分かるよう、ここでは素の if 文で書いている。
import type { Action } from './types'

// 壊れた JSON 文字列を渡されても落ちないように包む。
// パースできなければ undefined を返す (中身の検証は parseAction に任せる)。
export const tryParse = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

// 受け取った値が正しい Action かを 1 つずつ確かめる。
export const parseAction = (value: unknown): Action | null => {
  // まずオブジェクトであること
  if (typeof value !== 'object' || value === null) return null
  const data = value as Record<string, unknown>

  // reset: type が 'reset' ならそれだけで OK
  if (data.type === 'reset') {
    return { type: 'reset' }
  }

  // move: type が 'move' かつ index が 0〜8 の整数であること
  if (data.type === 'move') {
    const index = data.index
    const isValidIndex =
      typeof index === 'number' &&
      Number.isInteger(index) &&
      index >= 0 &&
      index <= 8
    return isValidIndex ? { type: 'move', index } : null
  }

  // どちらでもなければ不正
  return null
}
