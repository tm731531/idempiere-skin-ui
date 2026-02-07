import { describe, it, expect } from 'vitest'
import { escapeODataString } from '../utils'

describe('escapeODataString', () => {
  it('returns empty string for falsy input', () => {
    expect(escapeODataString('')).toBe('')
  })

  it('escapes single quotes', () => {
    expect(escapeODataString("O'Brien")).toBe("O''Brien")
  })

  it('removes dangerous characters', () => {
    expect(escapeODataString('test<script>')).toBe('testscript')
    expect(escapeODataString('a{b}c')).toBe('abc')
    expect(escapeODataString('a|b')).toBe('ab')
    expect(escapeODataString('a\\b')).toBe('ab')
    expect(escapeODataString('a^b')).toBe('ab')
    expect(escapeODataString('a~b')).toBe('ab')
    expect(escapeODataString('a[b]c')).toBe('abc')
    expect(escapeODataString('a`b')).toBe('ab')
  })

  it('trims whitespace', () => {
    expect(escapeODataString('  hello  ')).toBe('hello')
  })

  it('handles combined escaping', () => {
    expect(escapeODataString("  O'Brien <admin>  ")).toBe("O''Brien admin")
  })

  it('passes through safe strings unchanged', () => {
    expect(escapeODataString('A123456789')).toBe('A123456789')
    expect(escapeODataString('王小明')).toBe('王小明')
  })
})
