import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'CSIRT Investigate | DFIR workspace',description:'Collaborative incident response, evidence and CSIRT investigation reports.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'},other:{google:'notranslate'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" translate="no" className="notranslate"><body lang="en" translate="no" className="notranslate">{children}</body></html>}
