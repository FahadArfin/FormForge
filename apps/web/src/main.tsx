import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SiteRoot } from './SiteRoot'
import './styles.css'
import './workspace.css'
import './precision.css'
import './public.css'

let initialTheme='light'
try{initialTheme=localStorage.getItem('formforge-theme')==='dark'?'dark':'light'}catch{/* Public browsing works when device storage is blocked. */}
document.documentElement.dataset.theme = initialTheme
document.documentElement.style.colorScheme = initialTheme

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SiteRoot />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'))
}
