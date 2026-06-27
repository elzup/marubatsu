// shared/messages.ts (Zod) から asyncapi.yaml を生成する。
// 実行: npm run gen:asyncapi
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { stringify } from 'yaml'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { ZodTypeAny } from 'zod'
import {
  tapSchema,
  readySchema,
  resetSchema,
  stateMessageSchema,
  joinedMessageSchema,
  presenceMessageSchema,
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
    title: 'speed-marubatsu WebSocket API',
    version: '2.0.0',
    description:
      'リアルタイム連打マルバツ。/ws?room=xxx で接続し、ready/tap を送って state を受け取る。',
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
        tap: { $ref: '#/components/messages/Tap' },
        ready: { $ref: '#/components/messages/Ready' },
        reset: { $ref: '#/components/messages/Reset' },
        state: { $ref: '#/components/messages/State' },
        joined: { $ref: '#/components/messages/Joined' },
        presence: { $ref: '#/components/messages/Presence' },
      },
    },
  },
  operations: {
    sendAction: {
      action: 'send',
      channel: { $ref: '#/channels/ws' },
      summary: 'クライアント → サーバ: スタート / マスを連打 / リセット',
      messages: [
        { $ref: '#/channels/ws/messages/ready' },
        { $ref: '#/channels/ws/messages/tap' },
        { $ref: '#/channels/ws/messages/reset' },
      ],
    },
    receiveState: {
      action: 'receive',
      channel: { $ref: '#/channels/ws' },
      summary: 'サーバ → クライアント: 席の割り当て・在席・最新盤面の同期',
      messages: [
        { $ref: '#/channels/ws/messages/joined' },
        { $ref: '#/channels/ws/messages/presence' },
        { $ref: '#/channels/ws/messages/state' },
      ],
    },
  },
  components: {
    messages: {
      Tap: {
        name: 'tap',
        title: 'マスを連打する',
        payload: payload(tapSchema),
      },
      Ready: {
        name: 'ready',
        title: 'スタートを押す (両者で同時スタート)',
        payload: payload(readySchema),
      },
      Reset: {
        name: 'reset',
        title: 'リセット',
        payload: payload(resetSchema),
      },
      State: {
        name: 'state',
        title: '盤面の同期',
        payload: payload(stateMessageSchema),
      },
      Joined: {
        name: 'joined',
        title: '席の割り当て (X=1P / O=2P / null=観戦)',
        payload: payload(joinedMessageSchema),
      },
      Presence: {
        name: 'presence',
        title: '1P/2P の在席',
        payload: payload(presenceMessageSchema),
      },
    },
  },
}

const outPath = fileURLToPath(new URL('../asyncapi.yaml', import.meta.url))
const banner =
  '# 自動生成ファイル。編集せず shared/messages.ts を直して npm run gen:asyncapi。\n'
writeFileSync(outPath, banner + stringify(doc))
console.log('generated', outPath)
