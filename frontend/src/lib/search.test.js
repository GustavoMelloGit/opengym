import { describe, it, expect } from 'vitest'
import { fuzzySearch, normalize } from './search.js'

const EX = [
  { n: 'barbell bench press', pt: 'supino reto com barra', tg: 'pectorals', eq: 'barbell' },
  { n: 'dumbbell incline bench press', pt: 'supino inclinado com halteres', tg: 'pectorals', eq: 'dumbbell' },
  { n: 'cable pulldown', pt: 'puxada no cabo', tg: 'lats', eq: 'cable' },
  { n: 'pull-up', pt: 'barra fixa', tg: 'lats', eq: 'body weight' },
  { n: 'dumbbell biceps curl', pt: 'rosca bíceps com halteres', tg: 'biceps', eq: 'dumbbell' },
  { n: 'lateral raise', pt: 'elevação lateral', tg: 'delts', eq: 'dumbbell' },
  { n: 'barbell row', pt: 'remada curvada com barra', tg: 'upper back', eq: 'barbell' },
  { n: 'my stretch', pt: 'my stretch', tg: 'hamstrings', eq: 'body weight', desc: 'the one the physio showed me' }
]
const fields = e => ({ names: [e.n, e.pt], tags: [e.tg, e.eq], text: e.desc })
const find = q => fuzzySearch(EX, q, fields).map(e => e.n)

describe('normalize', () => {
  it('drops accents, case and punctuation', () => {
    expect(normalize('Elevação  Lateral')).toBe('elevacao lateral')
    expect(normalize('Pull-Up (wide)')).toBe('pull up wide')
  })
})

describe('fuzzySearch', () => {
  it('returns the list untouched for an empty query', () => {
    expect(fuzzySearch(EX, '  ', fields)).toBe(EX)
  })

  it('ignores accents in either direction', () => {
    expect(find('elevacao')).toEqual(['lateral raise'])
    expect(find('bíceps')).toContain('dumbbell biceps curl')
  })

  it('takes words in any order and cut short', () => {
    expect(find('press bench')[0]).toBe('barbell bench press')
    expect(find('benc pre')).toEqual(['barbell bench press', 'dumbbell incline bench press'])
  })

  it('forgives a typo', () => {
    expect(find('bicpes')).toContain('dumbbell biceps curl')
    expect(find('supnio')).toEqual(['barbell bench press', 'dumbbell incline bench press'])
    expect(find('tirceps')).toEqual([])   // nothing with triceps here, and biceps is two letters off
  })

  it('does not guess on very short words', () => {
    expect(find('rox')).toEqual([])
  })

  it('matches words split or glued differently', () => {
    expect(find('pull down')).toEqual(['cable pulldown'])
    expect(find('pullup')).toEqual(['pull-up'])
  })

  it('searches the name in the app language too', () => {
    expect(find('remada')).toEqual(['barbell row'])
  })

  it('finds by body part or equipment, below name hits', () => {
    expect(find('lats').sort()).toEqual(['cable pulldown', 'pull-up'])
    expect(find('barbell').slice(0, 2).sort()).toEqual(['barbell bench press', 'barbell row'])
  })

  it('puts the exact name first, then the shorter names', () => {
    expect(find('remada curvada com barra')[0]).toBe('barbell row')
    expect(find('remada curvda com bara')[0]).toBe('barbell row')
    expect(find('supino')).toEqual(['barbell bench press', 'dumbbell incline bench press'])
  })

  it('falls back to the items matching most words when none match them all', () => {
    expect(find('puxada frente')).toEqual(['cable pulldown'])
  })

  it('ranks name starts above words found later in the name', () => {
    expect(find('dumbbell')[0]).toMatch(/^dumbbell/)
  })

  it('searches a custom description only on an exact substring', () => {
    expect(find('physio')).toEqual(['my stretch'])
    expect(find('phyiso')).toEqual([])
  })
})
