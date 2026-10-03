// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@formforge/model'
import { communitySeed, loadCommunityModels, savePublishedModels, saveShowcaseModel, saveCommunityComments, readCommunitySet, saveCommunitySet, applyCommunityReactions, readCommunityRoute, communityRouteHash, type CommunityModel } from './community'

const showcase = (id: string, projectId: string, title = 'Desk stand'): CommunityModel => ({ ...structuredClone(communitySeed[0]!), id, title, creator: 'You', creatorHandle: '@you', document: { ...createDocument(title), id: projectId }, comments: [], likes: 0, boosts: 0, reviewCount: 0 })
beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('local showcase persistence', () => {
  it('updates a source project in place while retaining its identity and local comments', () => {
    const original = showcase('original-entry', 'project-a')
    original.comments = [{ id: 'feedback', author: 'You', avatar: 'YO', body: 'Keep this note', likes: 0, createdAt: 'Yesterday' }]
    original.reviewCount = 1
    savePublishedModels([original, showcase('other-entry', 'project-b')])
    const updated = saveShowcaseModel(showcase('new-temporary-id', 'project-a', 'Revised stand'))
    const reloaded = loadCommunityModels().filter((model) => model.creatorHandle === '@you')
    expect(updated.id).toBe('original-entry')
    expect(reloaded).toHaveLength(2)
    expect(reloaded.find((model) => model.id === 'original-entry')).toMatchObject({ title: 'Revised stand', reviewCount: 1, comments: [{ body: 'Keep this note' }] })
    expect(reloaded.find((model) => model.id === 'other-entry')?.document?.id).toBe('project-b')
  })

  it('keeps projects with the same name separate and preserves legacy duplicate entries', () => {
    savePublishedModels([showcase('older-copy', 'project-a'), showcase('latest-copy', 'project-a')])
    saveShowcaseModel(showcase('third-project', 'project-c'))
    expect(loadCommunityModels().filter((model) => model.creatorHandle === '@you').map((model) => model.id)).toEqual(['third-project', 'older-copy', 'latest-copy'])
  })

  it('leaves the previous saved showcase recoverable when an update exceeds storage capacity', () => {
    savePublishedModels([showcase('original-entry', 'project-a')])
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new DOMException('Full', 'QuotaExceededError') })
    expect(() => saveShowcaseModel(showcase('replacement', 'project-a', 'Unsaved changes'))).toThrow('Full')
    expect(loadCommunityModels().find((model) => model.id === 'original-entry')?.title).toBe('Desk stand')
  })

  it('restores local comments and nested replies on inspiration items after reloading', () => {
    const model = structuredClone(communitySeed[0]!)
    model.comments[0]!.replies = [{ id: 'local-reply', author: 'You', avatar: 'YO', body: 'My measurements', likes: 0, createdAt: 'Today' }]
    model.comments.unshift({ id: 'local-note', author: 'You', avatar: 'YO', body: 'Try this next', likes: 0, createdAt: 'Today' })
    model.reviewCount += 1
    saveCommunityComments(model)
    expect(loadCommunityModels().find((item) => item.id === model.id)?.comments).toEqual(model.comments)
    expect(communitySeed[0]!.comments.some((item) => item.id === 'local-note')).toBe(false)
  })

  it('reports failed comment saves and leaves earlier comments intact', () => {
    const model = structuredClone(communitySeed[0]!)
    saveCommunityComments(model)
    model.comments.unshift({ id: 'unsaved', author: 'You', avatar: 'YO', body: 'Do not lose my draft', likes: 0, createdAt: 'Today' })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new DOMException('Full', 'QuotaExceededError') })
    expect(() => saveCommunityComments(model)).toThrow('Full')
    expect(loadCommunityModels().find((item) => item.id === model.id)?.comments.some((item) => item.id === 'unsaved')).toBe(false)
  })

  it('preserves an existing collection if its next write fails', () => {
    localStorage.setItem('formforge-collected', '["desk-dock"]')
    const next = new Set(['desk-dock', 'sea-turtle'])
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new DOMException('Full', 'QuotaExceededError') })
    expect(() => saveCommunitySet('formforge-collected', next)).toThrow('Full')
    expect([...readCommunitySet('formforge-collected')]).toEqual(['desk-dock'])
  })

  it('reconstructs reaction totals after reload without changing the stored base counts', () => {
    const model = showcase('mine', 'project-a')
    model.likes = 3
    savePublishedModels([model])
    saveCommunitySet('formforge-liked', new Set(['mine']))
    const displayed = applyCommunityReactions(loadCommunityModels(), readCommunitySet('formforge-liked'), new Set())
    expect(displayed.find((item) => item.id === 'mine')?.likes).toBe(4)
    expect(loadCommunityModels().find((item) => item.id === 'mine')?.likes).toBe(3)
    expect(applyCommunityReactions(loadCommunityModels(), new Set(), new Set()).find((item) => item.id === 'mine')?.likes).toBe(3)
  })
})

describe('community detail routes', () => {
  it('restores an encoded detail and its search context from a reloadable URL', () => {
    const route = readCommunityRoute('#community?model=my%2Fstand&q=bracket+%26+bolt&category=Tools&page=collections&sort=Newest')
    expect(route).toEqual({ modelId: 'my/stand', query: 'bracket & bolt', category: 'Tools', page: 'collections', sort: 'Newest' })
    expect(readCommunityRoute(communityRouteHash(route))).toEqual(route)
  })
  it('normalizes unknown filters and preserves useful search text', () => {
    expect(readCommunityRoute('#community?page=unknown&category=unknown&sort=unknown&q=desk')).toEqual({ modelId: null, query: 'desk', category: 'Trending', page: 'discover', sort: 'Trending' })
  })
})
