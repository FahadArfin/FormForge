import { describe, expect, it } from 'vitest'
import { cadTools, searchCommands } from './cadToolCatalog'

describe('CAD command discovery', () => {
  it('finds existing tools using maker language and precise destinations', () => {
    for (const [query, id] of [['writing', 'text'], ['reference photo', 'image'], ['workplane', 'workplane'], ['enclosure', 'recipes'], ['angle', 'annotations'], ['material', 'material'], ['variant', 'parameters']]) {
      expect(searchCommands(cadTools, query!)[0]?.id).toBe(id)
    }
  })
  it('matches each query word, ignores accents/case, and ranks a label before aliases', () => {
    const items = [{ name: 'Text label', group: 'Create', keywords: 'engrave' }, { name: 'Engrave', group: 'Create', keywords: 'text label' }]
    expect(searchCommands(items, 'ÉNGRAVE')[0]?.name).toBe('Engrave')
    expect(searchCommands(items, 'text nonsense')).toEqual([])
  })
})
