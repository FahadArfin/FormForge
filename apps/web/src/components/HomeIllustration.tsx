import {useId} from 'react'

type IllustrationKind='community'|'studio'|'projects'

/** Small, decorative maker objects; the containing destination supplies its name. */
export function HomeIllustration({kind}:{kind:IllustrationKind}){
 const id=`home-art-${useId().replace(/:/g,'')}`
 const mint=`url(#${id}-mint)`,lilac=`url(#${id}-lilac)`,peach=`url(#${id}-peach)`,paper=`url(#${id}-paper)`
 return <svg className="home-illustration" viewBox="0 0 240 200" width="240" height="200" aria-hidden="true" focusable="false">
  <defs>
   <linearGradient id={`${id}-mint`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#D0F7DF"/><stop offset=".5" stopColor="#99D9BA"/><stop offset="1" stopColor="#62B593"/></linearGradient>
   <linearGradient id={`${id}-lilac`} x1="0" y1="0" x2=".85" y2="1"><stop stopColor="#E9DDFF"/><stop offset=".5" stopColor="#BFA8EA"/><stop offset="1" stopColor="#9580C3"/></linearGradient>
   <linearGradient id={`${id}-peach`} x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#FFE7C7"/><stop offset=".5" stopColor="#F3BC8F"/><stop offset="1" stopColor="#DE9568"/></linearGradient>
   <linearGradient id={`${id}-paper`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#FFFDF6"/><stop offset="1" stopColor="#DFE6DC"/></linearGradient>
  </defs>
  <ellipse cx="120" cy="174" rx="79" ry="9" fill="#586759" opacity=".09"/>
  {kind==='community'&&<>
   <path d="M87 149V82a37 37 0 0 1 74 0v67h-21V83a16 16 0 0 0-32 0v66Z" fill="#79B798"/>
   <path d="M78 145V78a37 37 0 0 1 74 0v67h-21V79a16 16 0 0 0-32 0v66Z" fill={mint}/>
   <path d="M84 81a31 31 0 0 1 62 0" fill="none" stroke="#E4FFEB" strokeWidth="3" strokeLinecap="round"/>
   <path d="M79 119h19m-19 6h19m-19 6h19m34-12h18m-18 6h18m-18 6h18" fill="none" stroke="#72B999" strokeWidth="1.5" opacity=".5"/>
   <path d="m56 109 25-9 24 17 1 33-26 19-26-12-10-27Z" fill="#DB9A70"/>
   <path d="m52 104 25-9 24 17 1 33-26 19-26-12-10-27Z" fill={peach}/>
   <path d="m62 117 13-5 12 9 1 17-13 9-13-6-6-13Z" fill="var(--home-wash, #F8F5EC)"/>
   <path d="m62 117 13-5 12 9 1 17-5 4-1-18-12-7-11 5Z" fill="#CA8D67"/>
   <path d="m46 120 8-12 21-8m-24 44 25 12 22-16" fill="none" stroke="#FFE8CE" strokeWidth="2" strokeLinecap="round" opacity=".8"/>
   <ellipse cx="161" cy="132" rx="35" ry="39" transform="rotate(21 161 132)" fill="#9073BA"/>
   <ellipse cx="156" cy="127" rx="35" ry="39" transform="rotate(21 156 127)" fill={lilac}/>
   <ellipse cx="156" cy="127" rx="17" ry="21" transform="rotate(21 156 127)" fill="#866EAD"/>
   <ellipse cx="159" cy="130" rx="15" ry="19" transform="rotate(21 159 130)" fill="var(--home-wash, #F8F5EC)"/>
   <path d="M129 119c3-16 15-26 28-26m-28 48c8 15 24 20 37 13" fill="none" stroke="#F1E6FF" strokeWidth="2.5" strokeLinecap="round" opacity=".8"/>
   <path d="m181 57 2-7m8 17 7-2" stroke="#B9A8D5" strokeWidth="3" strokeLinecap="round"/>
   <circle cx="57" cy="76" r="5" fill="#BEDBCC"/>
  </>}
  {kind==='studio'&&<>
   <path d="M94 145h59v19c0 9-59 9-59 0Z" fill="#7AAF96"/>
   <ellipse cx="123.5" cy="145" rx="29.5" ry="8" fill="#D9F3E2"/>
   <path d="M105 130h37v25c0 8-37 8-37 0Z" fill={mint}/>
   <ellipse cx="123.5" cy="130" rx="18.5" ry="5.5" fill="#DFF8E8"/>
   <path d="M97 158c15 5 39 5 53 0m-53 6c15 5 39 5 53 0m-42-23c9 3 21 3 31 0m-31 6c9 3 21 3 31 0" fill="none" stroke="#5EAC8C" strokeWidth="1.3" opacity=".6"/>
   <path d="M126 132V99" stroke="#68A88B" strokeWidth="10" strokeLinecap="round"/>
   <path d="M121 130V98" stroke="#A9DAB9" strokeWidth="8" strokeLinecap="round"/>
   <path d="M116 117c-18 0-25-10-23-23 16 1 27 9 23 23" fill={mint}/>
   <path d="M128 125c1-16 11-25 24-22-1 16-10 25-24 22" fill={mint}/>
   <path d="M121 47c-2-21 28-23 29-2 19-10 34 15 16 26 21 9 10 37-10 29 3 22-27 27-30 5-16 15-36-7-20-22-22-4-17-34 5-30-2-3 5-5 10-6Z" fill="#8F74BA"/>
   <path d="M116 42c-2-21 28-23 29-2 19-10 34 15 16 26 21 9 10 37-10 29 3 22-27 27-30 5-16 15-36-7-20-22-22-4-17-34 5-30 3-4 7-5 10-6Z" fill={lilac}/>
   <path d="M121 38c2-9 15-11 18-2m13 9c10-2 15 8 10 14M97 59c-5 7-1 15 7 16" fill="none" stroke="#F4EAFE" strokeWidth="3" strokeLinecap="round"/>
   <circle cx="132" cy="68" r="16" fill="#DDA474"/>
   <circle cx="129" cy="65" r="15" fill={peach}/>
   <path d="M120 60a10 10 0 0 1 12-5" fill="none" stroke="#FFF0D9" strokeWidth="2.5" strokeLinecap="round"/>
   <path d="m60 122 7 10 12-1-6 11 5 11-12-2-8 9-2-12-11-5 11-5Z" fill="#D29B75"/>
   <path d="m57 119 7 10 12-1-6 11 5 11-12-2-8 9-2-12-11-5 11-5Z" fill={peach}/>
   <path d="m181 109 8-2m-12 16 5 5" stroke="#D8B28D" strokeWidth="3" strokeLinecap="round"/>
   <circle cx="71" cy="78" r="5" fill="#B9DCCB"/>
  </>}
  {kind==='projects'&&<>
   <path d="M54 77c0-7 5-12 12-12h37l15 14h61c7 0 11 5 11 12v70c0 8-6 13-14 13H67c-8 0-13-5-13-13Z" fill="#86B69C"/>
   <path d="m82 49 78-10c6-1 10 3 11 9l12 103-94 12-13-104c-1-6 1-9 6-10" fill="#9C87C3"/>
   <path d="m78 45 78-10c6-1 10 3 11 9l12 103-94 12-13-104c-1-6 1-9 6-10" fill={lilac}/>
   <path d="m86 45 63-8" fill="none" stroke="#F1E6FF" strokeWidth="2" strokeLinecap="round"/>
   <path d="m65 66 76-12c6-1 10 3 11 9l13 90-91 14-16-91c-1-6 1-9 7-10" fill="#CED6C9"/>
   <path d="m61 62 76-12c6-1 10 3 11 9l13 90-91 14-16-91c-1-6 1-9 7-10" fill={paper}/>
   <path d="m78 116 44-7m-43 15 55-9" stroke="#B5C2B5" strokeWidth="2.5" strokeLinecap="round"/>
   <path d="m92 72 20-3 16 14-6 22-22 5-16-17Z" fill={peach}/>
   <path d="m92 72 13 14 23-3m-23 3-5 24" fill="none" stroke="#FFF0D8" strokeWidth="2" strokeLinejoin="round"/>
   <path d="m105 86 23-3-6 22-22 5Z" fill="#D9946C" opacity=".35"/>
   <path d="M48 109c-1-8 4-13 12-13h43c6 0 10 4 14 9h65c8 0 13 5 11 13l-10 44c-2 8-6 11-14 11H67c-8 0-12-4-13-12Z" fill={mint}/>
   <path d="M57 103h44c4 0 7 4 11 8h70" fill="none" stroke="#E5FAE9" strokeWidth="3" strokeLinecap="round"/>
   <path d="M60 156h118m-117 6h115" stroke="#64A987" strokeWidth="1.4" opacity=".45"/>
   <path d="m115 127 9-2 7 6-2 10-9 3-7-6Z" fill="#DFF4E2" opacity=".85"/>
   <circle cx="187" cy="67" r="11" fill={peach}/>
   <path d="m183 67 3 3 5-6" fill="none" stroke="#FFF6E6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
   <path d="m46 44 2 7m-11-1 6 4" stroke="#B9AAD5" strokeWidth="3" strokeLinecap="round"/>
  </>}
 </svg>
}
