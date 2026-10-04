import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { templateCatalog } from './templateCatalog'

describe('public template assets', () => {
  for (const template of templateCatalog) it(`${template.id} is valid accessible SVG`, () => {
    const svg = readFileSync(new URL(`../../public/templates/${template.id}.svg`, import.meta.url), 'utf8')
    const dom = new JSDOM(svg, { contentType: 'image/svg+xml' })
    expect(dom.window.document.querySelector('title')?.textContent).toBe(template.name)
    expect(dom.window.document.querySelectorAll('polygon').length).toBeGreaterThan(0)
    dom.window.close()
  })
})
