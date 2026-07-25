import { describe, expect, it } from 'vitest'

import { diffContent, diffLines } from '@/content/webContentDiff'

describe('diffLines (Task 3D web-content diff)', () => {
  it('marks every line equal when the two texts are identical', () => {
    const result = diffLines('a\nb\nc', 'a\nb\nc')
    expect(result.every((l) => l.type === 'equal')).toBe(true)
    expect(result.map((l) => l.text)).toEqual(['a', 'b', 'c'])
  })

  it('detects a single added line', () => {
    const result = diffLines('a\nc', 'a\nb\nc')
    expect(result.filter((l) => l.type === 'added').map((l) => l.text)).toEqual(['b'])
    expect(result.filter((l) => l.type === 'removed')).toHaveLength(0)
  })

  it('detects a single removed line', () => {
    const result = diffLines('a\nb\nc', 'a\nc')
    expect(result.filter((l) => l.type === 'removed').map((l) => l.text)).toEqual(['b'])
    expect(result.filter((l) => l.type === 'added')).toHaveLength(0)
  })

  it('emits removed-then-added for a replaced line (unified order)', () => {
    const result = diffLines('hello world', 'hello there')
    expect(result.map((l) => `${l.type}:${l.text}`)).toEqual([
      'removed:hello world',
      'added:hello there',
    ])
  })

  it('carries 1-based before/after line numbers', () => {
    const result = diffLines('a\nb', 'a\nB')
    const equal = result.find((l) => l.type === 'equal')
    expect(equal).toMatchObject({ text: 'a', beforeLine: 1, afterLine: 1 })
  })

  it('handles empty inputs (all added / all removed)', () => {
    expect(diffLines('', 'x').filter((l) => l.type === 'added')).toHaveLength(1)
    // '' splits to [''] so an empty→'x' is one removed '' + one added 'x'.
    const removedToEmpty = diffLines('x', '')
    expect(removedToEmpty.some((l) => l.type === 'removed' && l.text === 'x')).toBe(true)
  })
})

describe('diffContent (Task 3D field diff)', () => {
  it('returns a FieldDiff per field with correct changed flags', () => {
    const before = { name: 'home', title: 'Welcome', content: 'Line one\nLine two' }
    const after = { name: 'home', title: 'Welcome (v2)', content: 'Line one\nLine two' }
    const diff = diffContent(before, after)
    expect(diff.map((d) => d.field)).toEqual(['name', 'title', 'content'])

    const name = diff.find((d) => d.field === 'name')!
    const title = diff.find((d) => d.field === 'title')!
    const content = diff.find((d) => d.field === 'content')!
    expect(name.changed).toBe(false)
    expect(title.changed).toBe(true)
    expect(content.changed).toBe(false)
  })

  it('treats absent fields as empty strings (no crash)', () => {
    const diff = diffContent({}, { title: 'x' })
    expect(diff.find((d) => d.field === 'title')!.changed).toBe(true)
    expect(diff.find((d) => d.field === 'name')!.changed).toBe(false)
  })
})
