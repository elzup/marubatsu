// WebSocket でやり取りする全メッセージの「正準」。
// ここの Zod スキーマから TS 型を導出し (型)、受信時の実行時検証にも使う (安全)。
// さらに scripts/gen-asyncapi.ts がここから asyncapi.yaml を生成する (ドキュメント)。
import { z } from 'zod'

export const markSchema = z.enum(['X', 'O'])
export const cellSchema = markSchema.nullable() // 空マスは null

export const gameStateSchema = z.object({
  board: z.array(cellSchema).length(9), // 9 マス (0〜8)
  turn: markSchema, // 次の手番
  winner: markSchema.nullable(), // 勝者 (未決着は null)
})

// --- クライアント → サーバ (untrusted: 受信時に必ず検証する) ---
export const moveSchema = z.object({
  type: z.literal('move'),
  index: z.number().int().min(0).max(8),
})
export const resetSchema = z.object({ type: z.literal('reset') })
export const actionSchema = z.discriminatedUnion('type', [
  moveSchema,
  resetSchema,
])

// --- サーバ → クライアント ---
export const stateMessageSchema = z.object({
  type: z.literal('state'),
  state: gameStateSchema,
})
// 参加時に割り当てられた席 (X=1P / O=2P / null=観戦)
export const joinedMessageSchema = z.object({
  type: z.literal('joined'),
  mark: markSchema.nullable(),
})
// 席の在席状況 (1P=X / 2P=O が埋まっているか)。接続/切断のたびに全員へ配信する。
// 観戦者の有無・人数は含めない。
export const presenceMessageSchema = z.object({
  type: z.literal('presence'),
  seats: z.object({ X: z.boolean(), O: z.boolean() }),
})
export const serverMessageSchema = z.discriminatedUnion('type', [
  stateMessageSchema,
  joinedMessageSchema,
  presenceMessageSchema,
])

export type Mark = z.infer<typeof markSchema>
export type Cell = z.infer<typeof cellSchema>
export type GameState = z.infer<typeof gameStateSchema>
export type Action = z.infer<typeof actionSchema>
export type ServerMessage = z.infer<typeof serverMessageSchema>

// 壊れた JSON を投げられても落ちないように包む (検証は schema.safeParse 側で行う)
export const tryJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}
