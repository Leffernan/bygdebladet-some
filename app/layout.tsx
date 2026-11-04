import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Bygdebladet SoMe',description:'Redaksjonell godkjenningskø for Facebook og Instagram.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="nb"><body>{children}</body></html>;}
