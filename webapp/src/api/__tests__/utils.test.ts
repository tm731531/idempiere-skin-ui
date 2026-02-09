import { describe, it, expect } from 'vitest'
import { escapeODataString, toIdempiereDateTime, toDateString, maxAppointmentDate, toLocaleDateLabel } from '../utils'

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

describe('toIdempiereDateTime', () => {
  it('formats using local time components (not UTC)', () => {
    // Create a date with known local time
    const d = new Date(2026, 1, 8, 9, 30, 45) // Feb 8 09:30:45 local
    expect(toIdempiereDateTime(d)).toBe('2026-02-08T09:30:45Z')
  })

  it('handles midnight local time', () => {
    const d = new Date(2026, 1, 8, 0, 0, 0) // Feb 8 00:00:00 local
    expect(toIdempiereDateTime(d)).toBe('2026-02-08T00:00:00Z')
  })

  it('pads single-digit values', () => {
    const d = new Date(2026, 0, 5, 3, 7, 9) // Jan 5 03:07:09 local
    expect(toIdempiereDateTime(d)).toBe('2026-01-05T03:07:09Z')
  })
})

describe('toDateString', () => {
  it('formats date as YYYY-MM-DD in local time', () => {
    const d = new Date(2026, 0, 5) // Jan 5 local
    expect(toDateString(d)).toBe('2026-01-05')
  })

  it('pads month and day', () => {
    const d = new Date(2026, 2, 9) // Mar 9
    expect(toDateString(d)).toBe('2026-03-09')
  })
})

describe('maxAppointmentDate', () => {
  it('returns a date 7 days from now', () => {
    const result = maxAppointmentDate()
    const now = new Date()
    const diffDays = Math.round((result.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    expect(diffDays).toBe(7)
  })
})

describe('toLocaleDateLabel', () => {
  it('returns 今天 for today', () => {
    expect(toLocaleDateLabel(new Date())).toBe('今天')
  })

  it('returns 明天 for tomorrow', () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    expect(toLocaleDateLabel(d)).toBe('明天')
  })

  it('returns formatted date with weekday for other dates', () => {
    const d = new Date()
    d.setDate(d.getDate() + 3)
    const result = toLocaleDateLabel(d)
    // Should match pattern like "2/15 (六)"
    expect(result).toMatch(/^\d{1,2}\/\d{1,2} \([日一二三四五六]\)$/)
  })
})
