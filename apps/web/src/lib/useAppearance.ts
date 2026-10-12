import {useEffect,useState} from 'react'
import type {AppearanceTheme} from '@/components/ThemeToggle'
export const readAppearance=():AppearanceTheme=>{try{return localStorage.getItem('formforge-theme')==='dark'?'dark':'light'}catch{return 'light'}}
export function useAppearance(){
 const [theme,setTheme]=useState<AppearanceTheme>(readAppearance)
 useEffect(()=>{const sync=(event:Event)=>setTheme(event instanceof CustomEvent && (event.detail==='dark'||event.detail==='light') ? event.detail : readAppearance());window.addEventListener('storage',sync);window.addEventListener('formforge-theme-change',sync);return()=>{window.removeEventListener('storage',sync);window.removeEventListener('formforge-theme-change',sync)}},[])
 useEffect(()=>{document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#111b20':'#f7f8fa')},[theme])
 const toggleTheme=()=>{const next=theme==='dark'?'light':'dark';setTheme(next);try{localStorage.setItem('formforge-theme',next)}catch{/* Appearance still works for this visit. */}window.dispatchEvent(new CustomEvent('formforge-theme-change',{detail:next}));}
 return {theme,toggleTheme}
}
