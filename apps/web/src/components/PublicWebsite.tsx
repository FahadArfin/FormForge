import {lazy,Suspense,useState} from 'react'
import {ArrowRight,Box,FolderOpen,Play,Search,Users} from 'lucide-react'
import {findTemplates,templateCatalog} from '@/lib/templateCatalog'
import {useAppearance} from '@/lib/useAppearance'
import {AppNavigation} from './AppNavigation'
import {ThemeToggle} from './ThemeToggle'
import './PublicHome.css'
const PublicDemo=lazy(()=>import('./PublicDemo').then(m=>({default:m.PublicDemo})))
const destinations=[
 {id:'community',title:'Community',description:'Explore ideas. Make them yours.',Icon:Users},
 {id:'studio',title:'Studio',description:'Bring your ideas to life in 3D.',Icon:Box},
 {id:'projects',title:'My projects',description:'Pick up where you left off.',Icon:FolderOpen},
] as const
function Home(){
 return <div className="public-home">
  <section className="home-welcome" aria-labelledby="home-heading"><h1 id="home-heading">What will you <span>make</span> today?</h1></section>
  <nav className="home-destinations" aria-label="Choose where to go">{destinations.map(({id,title,description,Icon})=><a key={id} className={`home-destination home-destination-${id}`} href={`#${id}`} aria-labelledby={`home-${id}-title`} aria-describedby={`home-${id}-description`}><span className="home-destination-icon"><Icon size={32} strokeWidth={1.7} aria-hidden="true"/></span><h2 id={`home-${id}-title`}>{title}</h2><p id={`home-${id}-description`}>{description}</p><ArrowRight className="home-destination-arrow" size={19} aria-hidden="true"/></a>)}</nav>
 </div>
}
export function PublicWebsite({templatesOnly=false}:{templatesOnly?:boolean}){
 const {theme,toggleTheme}=useAppearance()
 const [query,setQuery]=useState(''),[category,setCategory]=useState('All'),[demo,setDemo]=useState(false)
 const templates=findTemplates(query,category)
 return <div className={`public-site${templatesOnly?'':' public-home-site'}`} data-appearance={theme}><a className="skip-link" href="#public-main" onClick={e=>{e.preventDefault();document.getElementById('public-main')?.focus()}}>Skip to content</a>
  <AppNavigation><a href="#templates" aria-current={templatesOnly?'page':undefined}>Templates</a><ThemeToggle theme={theme} onToggle={toggleTheme}/></AppNavigation>
  <main id="public-main" tabIndex={-1}>
   {!templatesOnly?<Home/>:<>
    <section className="public-library" aria-labelledby="template-heading"><div className="public-section-heading"><div><span className="public-eyebrow">START WITH SOMETHING USEFUL</span><h1 id="template-heading">Editable templates</h1><p>Real geometry you can change. All dimensions are examples; physical print testing is pending.</p></div><button className="public-secondary" onClick={()=>setDemo(true)}><Play size={16}/> Try the interactive demo</button></div>
     <div className="public-filters"><label className="public-search"><Search size={18}/><span className="sr-only">Search templates</span><input type="search" placeholder="Try spacer, cable, enclosure…" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Category<select value={category} onChange={e=>setCategory(e.target.value)}>{['All',...new Set(templateCatalog.map(t=>t.category))].map(c=><option key={c}>{c}</option>)}</select></label></div>
     <p className="public-results" role="status">{templates.length} editable templates</p>
     {!templates.length&&<div className="public-empty"><p>No templates match that search.</p><button className="public-secondary" onClick={()=>{setQuery('');setCategory('All')}}>Show all templates</button></div>}
     <div className="public-template-grid">{templates.map(item=><article key={item.id} className="public-template"><a className="template-image" href={`#templates?template=${item.id}`} aria-label={`Preview ${item.name}`}><img src={`/templates/${item.id}.svg`} loading="lazy" alt={`${item.name} evaluated geometry`} width="600" height="400"/></a><div className="template-copy"><div className="template-meta"><span>{item.category}</span><span>{item.level}</span></div><h2>{item.name}</h2><p>{item.description}</p><strong className="template-dimensions">{item.dimensions}</strong><details><summary>Editing & print notes</summary><ol>{item.steps.map(step=><li key={step}>{step}</li>)}</ol><p>{item.printNote}</p><small>Physical print evidence: pending. Render shows the digital design.</small></details><a className="template-open" href={`#templates?template=${item.id}`} aria-label={`View ${item.name} template and customize`}>View template & customize <ArrowRight size={16}/></a></div></article>)}</div>
    </section>
    <section className="public-workflow"><div><span className="public-eyebrow">YOUR DESIGN STAYS EDITABLE</span><h2>Choose. Adjust. Inspect. Print.</h2><p>Keep the shapes and dimensions behind your model, so the next change is easier.</p></div><ol><li><span>01</span><strong>Start with a part</strong><p>Use a template, bring your mesh, or build from shapes.</p></li><li><span>02</span><strong>Make it fit</strong><p>Edit dimensions, compare clearances and record a tested fit.</p></li><li><span>03</span><strong>Check the handoff</strong><p>Review size, placement and potential overhangs before export.</p></li></ol></section>
    <section className="public-storage"><Box size={26}/><div><h2>Know where your work is saved.</h2><p>Projects and recovery copies stay in this browser. Download an editable backup for a separate copy, or sign in to save an explicit cloud snapshot. STL and 3MF exports go to your slicer for supports and printer settings.</p></div><a className="public-secondary" href="#projects">Open My projects</a></section>
   </>}
  </main>{templatesOnly&&<footer className="public-footer"><strong>PrintLab</strong><span>Made for curious minds.</span><a href="#templates">Explore editable templates <ArrowRight size={15} aria-hidden="true"/></a></footer>}
  {demo&&<Suspense fallback={<div className="public-demo-loading" role="status">Loading the interactive demo… <button onClick={()=>setDemo(false)}>Cancel</button></div>}><PublicDemo onClose={()=>setDemo(false)}/></Suspense>}
 </div>
}
