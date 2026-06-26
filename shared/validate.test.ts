// 受信データ検証 (parseAction) のテスト。
// クライアントは信用できないので、正しい入力は通し、おかしな入力は
// すべて null で弾けることを確認する。
import { describe, it, expect } from 'vitest'
import { parseAction, tryParse } from './validate'

describe('parseAction: 正しい Action だけを通す', () => {
  it('正しい move を受け入れる', () => {
    expect(parseAction({ type: 'move', index: 0 })).toEqual({
      type: 'move',
      index: 0,
    })
    expect(parseAction({ type: 'move', index: 8 })).toEqual({
      type: 'move',
      index: 8,
    })
  })

  it('正しい reset を受け入れる', () => {
    expect(parseAction({ type: 'reset' })).toEqual({ type: 'reset' })
  })

  it('範囲外・非整数の index は弾く', () => {
    expect(parseAction({ type: 'move', index: -1 })).toBeNull()
    expect(parseAction({ type: 'move', index: 9 })).toBeNull()
    expect(parseAction({ type: 'move', index: 1.5 })).toBeNull()
    expect(parseAction({ type: 'move', index: '0' })).toBeNull()
    expect(parseAction({ type: 'move' })).toBeNull()
  })

  it('未知の type やオブジェクト以外は弾く', () => {
    expect(parseAction({ type: 'attack' })).toBeNull()
    expect(parseAction({})).toBeNull()
    expect(parseAction(null)).toBeNull()
    expect(parseAction('move')).toBeNull()
    expect(parseAction(42)).toBeNull()
  })
})

describe('tryParse: 壊れた JSON でも落ちない', () => {
  it('正しい JSON はパースする', () => {
    expect(tryParse('{"type":"reset"}')).toEqual({ type: 'reset' })
  })

  it('壊れた JSON は undefined を返す', () => {
    expect(tryParse('{not json')).toBeUndefined()
    expect(tryParse('')).toBeUndefined()
  })
})
