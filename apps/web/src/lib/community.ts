import type { ModelDocument } from '@formforge/model'

export interface CommunityComment {
  id: string
  author: string
  avatar: string
  body: string
  rating?: number
  likes: number
  createdAt: string
  replies?: CommunityComment[]
}

export interface CommunityModel {
  id: string
  title: string
  creator: string
  creatorHandle: string
  creatorAvatar: string
  image: string
  gallery: string[]
  description: string
  category: string
  tags: string[]
  license: string
  likes: number
  boosts: number
  downloads: number
  makes: number
  rating: number
  reviewCount: number
  printTime: string
  filamentGrams: number
  colors: string[]
  createdAt: string
  remixOf?: string
  document?: ModelDocument
  comments: CommunityComment[]
}

const sampleConcepts: CommunityModel[] = [
  {
    id: 'desk-dock', title: 'Modular Desk Dock System', creator: 'Nora Makes', creatorHandle: '@noramakes', creatorAvatar: 'NM', image: '/community/modular-desk-dock.png', gallery: ['/community/modular-desk-dock.png', '/community/hex-tool-wall.png'],
    description: 'A concept illustration of a modular desk organizer with spaces for a phone, pens, cables and small items. No geometry or tested fit is attached.', category: 'Organization', tags: ['modular', 'desk', 'snap-fit', 'multicolor'], license: 'Standard Digital File License', likes: 0, boosts: 0, downloads: 0, makes: 0, rating: 0, reviewCount: 0, printTime: 'Not estimated', filamentGrams: 0, colors: ['#7186b8', '#8d91ff', '#d8dbe8'], createdAt: '2026-08-02',
    comments: [],
  },
  {
    id: 'sea-turtle', title: 'Articulated Sea Turtle', creator: 'Loop Studio', creatorHandle: '@loopstudio', creatorAvatar: 'LS', image: '/community/articulated-sea-turtle.png', gallery: ['/community/articulated-sea-turtle.png', '/community/spiral-planter.png'],
    description: 'A concept illustration of a colorful turtle with segmented flippers and a patterned shell. Articulation, supports and printability have not been tested.', category: 'Toys & Games', tags: ['articulated', 'print-in-place', 'animal', 'ams'], license: 'Creative Commons Attribution', likes: 0, boosts: 0, downloads: 0, makes: 0, rating: 0, reviewCount: 0, printTime: 'Not estimated', filamentGrams: 0, colors: ['#45a89a', '#f07b61', '#f2e5c8'], createdAt: '2026-07-28',
    comments: [],
  },
  {
    id: 'hex-wall', title: 'Hex Workshop Wall', creator: 'BuildGrid', creatorHandle: '@buildgrid', creatorAvatar: 'BG', image: '/community/hex-tool-wall.png', gallery: ['/community/hex-tool-wall.png', '/community/modular-desk-dock.png'],
    description: 'A concept illustration of a hexagonal wall organizer for tools and parts. No editable connectors or tested load capacity are included.', category: 'Tools', tags: ['workshop', 'wall', 'parametric', 'storage'], license: 'Creative Commons Attribution-ShareAlike', likes: 0, boosts: 0, downloads: 0, makes: 0, rating: 0, reviewCount: 0, printTime: 'Not estimated', filamentGrams: 0, colors: ['#454955', '#f28b43', '#dfe2e5'], createdAt: '2026-07-19',
    comments: [],
  },
  {
    id: 'spiral-planter', title: 'Twisted Spiral Planter', creator: 'Soft Geometry', creatorHandle: '@softgeometry', creatorAvatar: 'SG', image: '/community/spiral-planter.png', gallery: ['/community/spiral-planter.png', '/community/articulated-sea-turtle.png'],
    description: 'A concept illustration of a spiral planter with a matching saucer. Drainage, wall thickness and material suitability are unverified.', category: 'Home & Garden', tags: ['planter', 'vase', 'spiral', 'decor'], license: 'Standard Digital File License', likes: 0, boosts: 0, downloads: 0, makes: 0, rating: 0, reviewCount: 0, printTime: 'Not estimated', filamentGrams: 0, colors: ['#6e4cc6', '#a66de0', '#c392ee'], createdAt: '2026-07-11',
    comments: [],
  },
]

export const communitySeed: CommunityModel[] = sampleConcepts.map(model=>({...model,creator:'PrintLab concept',creatorHandle:'@printlab-concept',creatorAvatar:'PL',license:'Concept illustration only; no model file license',likes:0,boosts:0,downloads:0,makes:0,rating:0,reviewCount:0,printTime:'Not estimated',filamentGrams:0,comments:[]}))

export const communityCategories = ['Trending', 'New & Notable', 'Organization', 'Toys & Games', 'Tools', 'Home & Garden', 'Art', 'Electronics', 'Replacement Parts']

export function loadCommunityModels() {
  let models = communitySeed
  try {
    const value = localStorage.getItem('formforge-community-models')
    if (value) models = [...(JSON.parse(value) as CommunityModel[]), ...communitySeed]
  } catch { /* start from curated models */ }
  const comments = readCommentStore()
  return models.map((model) => comments[model.id] ? { ...model, ...comments[model.id] } : model)
}

export function savePublishedModels(models: CommunityModel[]) {
  localStorage.setItem('formforge-community-models', JSON.stringify(models.filter((model) => model.creatorHandle === '@you')))
}

/** Persist before returning, so callers only show a successful update after storage accepts it. */
export function saveShowcaseModel(incoming: CommunityModel) {
  const models = loadCommunityModels()
  const existing = models.find((model) => model.creatorHandle === '@you' && (model.id === incoming.id || (incoming.document && model.document?.id === incoming.document.id)))
  const saved = existing ? { ...incoming, id: existing.id, createdAt: existing.createdAt, comments: existing.comments, reviewCount: existing.reviewCount, rating: existing.rating, likes: existing.likes, boosts: existing.boosts } : incoming
  savePublishedModels(existing ? models.map((model) => model.id === existing.id ? saved : model) : [saved, ...models])
  return saved
}

type CommentStore = Record<string, Pick<CommunityModel, 'comments' | 'reviewCount'>>
function readCommentStore(): CommentStore {
  try {
    const value = JSON.parse(localStorage.getItem('formforge-community-comments') ?? '{}') as CommentStore
    return value && !Array.isArray(value) && typeof value === 'object' ? value : {}
  } catch { return {} }
}

export function saveCommunityComments(model: CommunityModel) {
  const previous = readCommentStore()
  localStorage.setItem('formforge-community-comments', JSON.stringify({ ...previous, [model.id]: { comments: model.comments, reviewCount: model.reviewCount } }))
}

export function readCommunitySet(key: string) {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [])
  } catch { return new Set<string>() }
}

export function saveCommunitySet(key: string, value: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...value]))
  return new Set(value)
}

export function applyCommunityReactions(models: CommunityModel[], liked: Set<string>, boosted: Set<string>) {
  return models.map((model) => ({ ...model, likes: model.likes + Number(liked.has(model.id)), boosts: model.boosts + Number(boosted.has(model.id)) }))
}

export type CommunityPage = 'discover' | 'profile' | 'collections' | 'history'
export type CommunitySort = 'Trending' | 'Newest' | 'Most downloaded'
export interface CommunityRoute { modelId: string | null; query: string; category: string; page: CommunityPage; sort: CommunitySort }

export function readCommunityRoute(hash: string): CommunityRoute {
  const params = new URLSearchParams(hash.split('?')[1] ?? '')
  const page = params.get('page')
  const sort = params.get('sort')
  const category = params.get('category') ?? 'Trending'
  return {
    modelId: params.get('model') || null,
    query: params.get('q') ?? '',
    category: communityCategories.includes(category) ? category : 'Trending',
    page: page === 'profile' || page === 'collections' || page === 'history' ? page : 'discover',
    sort: sort === 'Newest' || sort === 'Most downloaded' ? sort : 'Trending',
  }
}

export function communityRouteHash(route: CommunityRoute) {
  const params = new URLSearchParams()
  if (route.modelId) params.set('model', route.modelId)
  if (route.query) params.set('q', route.query)
  if (route.category !== 'Trending') params.set('category', route.category)
  if (route.page !== 'discover') params.set('page', route.page)
  if (route.sort !== 'Trending') params.set('sort', route.sort)
  return `#community${params.size ? `?${params}` : ''}`
}
