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

const comment = (id: string, author: string, body: string, rating = 5): CommunityComment => ({ id, author, avatar: author.slice(0, 2).toUpperCase(), body, rating, likes: Math.floor(Number(id.replace(/\D/g, '')) % 17), createdAt: '2 days ago', replies: [] })

export const communitySeed: CommunityModel[] = [
  {
    id: 'desk-dock', title: 'Modular Desk Dock System', creator: 'Nora Makes', creatorHandle: '@noramakes', creatorAvatar: 'NM', image: '/community/modular-desk-dock.png', gallery: ['/community/modular-desk-dock.png', '/community/hex-tool-wall.png'],
    description: 'A snap-fit desk organizer that grows with your setup. Includes phone, pen, cable and tray modules with print-in-place alignment keys.', category: 'Organization', tags: ['modular', 'desk', 'snap-fit', 'multicolor'], license: 'Standard Digital File License', likes: 2840, boosts: 412, downloads: 12700, makes: 684, rating: 4.9, reviewCount: 328, printTime: '5h 24m', filamentGrams: 138, colors: ['#7186b8', '#8d91ff', '#d8dbe8'], createdAt: '2026-08-02',
    comments: [comment('c11', 'Jon Prints', 'The tolerances were perfect on my P1S. I printed the tray in PETG and the dock in PLA.', 5), { ...comment('c12', 'MinaLab', 'Could you add a wider watch charger insert?', 4), replies: [comment('c121', 'Nora Makes', 'Yes — I added it to the next remix pack. Thanks for the dimensions!')] }],
  },
  {
    id: 'sea-turtle', title: 'Articulated Sea Turtle', creator: 'Loop Studio', creatorHandle: '@loopstudio', creatorAvatar: 'LS', image: '/community/articulated-sea-turtle.png', gallery: ['/community/articulated-sea-turtle.png', '/community/spiral-planter.png'],
    description: 'Friendly print-in-place turtle with smooth articulated flippers and a two-color shell pattern. No supports required.', category: 'Toys & Games', tags: ['articulated', 'print-in-place', 'animal', 'ams'], license: 'Creative Commons Attribution', likes: 6120, boosts: 906, downloads: 29400, makes: 2200, rating: 4.8, reviewCount: 741, printTime: '3h 18m', filamentGrams: 72, colors: ['#45a89a', '#f07b61', '#f2e5c8'], createdAt: '2026-07-28',
    comments: [comment('c21', 'PrintDad', 'My kids immediately asked for a whole family. Great articulation.', 5)],
  },
  {
    id: 'hex-wall', title: 'Hex Workshop Wall', creator: 'BuildGrid', creatorHandle: '@buildgrid', creatorAvatar: 'BG', image: '/community/hex-tool-wall.png', gallery: ['/community/hex-tool-wall.png', '/community/modular-desk-dock.png'],
    description: 'A parametric hex wall system for tools, parts and electronics. Every holder locks with a quarter turn and can be remixed.', category: 'Tools', tags: ['workshop', 'wall', 'parametric', 'storage'], license: 'Creative Commons Attribution-ShareAlike', likes: 3730, boosts: 518, downloads: 18600, makes: 1130, rating: 4.9, reviewCount: 456, printTime: '7h 42m', filamentGrams: 212, colors: ['#454955', '#f28b43', '#dfe2e5'], createdAt: '2026-07-19',
    comments: [comment('c31', 'AdaFab', 'The quarter-turn connector is much stronger than the clips I was using.', 5)],
  },
  {
    id: 'spiral-planter', title: 'Twisted Spiral Planter', creator: 'Soft Geometry', creatorHandle: '@softgeometry', creatorAvatar: 'SG', image: '/community/spiral-planter.png', gallery: ['/community/spiral-planter.png', '/community/articulated-sea-turtle.png'],
    description: 'A lightweight spiral planter with hidden drainage and a matching saucer. Designed to show off silk and gradient filament.', category: 'Home & Garden', tags: ['planter', 'vase', 'spiral', 'decor'], license: 'Standard Digital File License', likes: 1980, boosts: 264, downloads: 8900, makes: 432, rating: 4.7, reviewCount: 198, printTime: '6h 05m', filamentGrams: 154, colors: ['#6e4cc6', '#a66de0', '#c392ee'], createdAt: '2026-07-11',
    comments: [comment('c41', 'TerraPrint', 'Looks excellent in purple-green coextrusion filament.', 5)],
  },
]

export const communityCategories = ['Trending', 'New & Notable', 'Organization', 'Toys & Games', 'Tools', 'Home & Garden', 'Art', 'Electronics', 'Replacement Parts']

export function loadCommunityModels() {
  try {
    const value = localStorage.getItem('formforge-community-models')
    if (value) return [...(JSON.parse(value) as CommunityModel[]), ...communitySeed]
  } catch { /* start from curated models */ }
  return communitySeed
}

export function savePublishedModels(models: CommunityModel[]) {
  localStorage.setItem('formforge-community-models', JSON.stringify(models.filter((model) => model.creatorHandle === '@you')))
}
