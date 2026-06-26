// shared/messages.ts (Zod) から asyncapi.yaml を生成する。
// 実行: npm run gen:asyncapi
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { stringify } from 'yaml'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { ZodTypeAny } from 'zod'
import {
  moveSchema,
  resetSchema,
  serverMessageSchema,
} from '../shared/messages'

// Zod → JSON Schema (asyncapi に埋め込めるよう $schema キーは落とす)
const payload = (schema: ZodTypeAny) => {
  // $refStrategy:'none' で全サブスキーマをインライン展開する。
  // (payload 単体ルート基準の内部 $ref が AsyncAPI 文書では壊れるため)
  const json = zodToJsonSchema(schema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Record<string, unknown>
  delete json.$schema
  return json
}

const doc = {
  asyncapi: '3.0.0',
  info: {
    title: 'marubatsu WebSocket API',
    version: '2.0.0',
    description:
      'リアルタイム・ルーム制マルバツ。/ws?room=xxx で接続し、Action を送って state を受け取る。',
  },
  servers: {
    local: { host: 'localhost:3001', protocol: 'ws', pathname: '/ws' },
  },
  channels: {
    ws: {
      address: '/ws',
      parameters: {
        room: {
          description: 'ルーム名 (省略時 lobby)。同名は同じ盤面を共有する。',
        },
      },
      messages: {
        move: { $ref: '#/components/messages/Move' },
        reset: { $ref: '#/components/messages/Reset' },
        state: { $ref: '#/components/messages/State' },
      },
    },
  },
  operations: {
    sendAction: {
      action: 'send',
      channel: { $ref: '#/channels/ws' },
      summary: 'クライアント → サーバ: 手を打つ / リセット',
      messages: [
        { $ref: '#/channels/ws/messages/move' },
        { $ref: '#/channels/ws/messages/reset' },
      ],
    },
    receiveState: {
      action: 'receive',
      channel: { $ref: '#/channels/ws' },
      summary: 'サーバ → クライアント: 最新盤面の同期',
      messages: [{ $ref: '#/channels/ws/messages/state' }],
    },
  },
  components: {
    messages: {
      Move: { name: 'move', title: 'マスに打つ', payload: payload(moveSchema) },
      Reset: {
        name: 'reset',
        title: 'リセット',
        payload: payload(resetSchema),
      },
      State: {
        name: 'state',
        title: '盤面の同期',
        payload: payload(serverMessageSchema),
      },
    },
  },
}

const outPath = fileURLToPath(new URL('../asyncapi.yaml', import.meta.url))
const banner =
  '# 自動生成ファイル。編集せず shared/messages.ts を直して npm run gen:asyncapi。\n'
writeFileSync(outPath, banner + stringify(doc))
console.log('generated', outPath)
