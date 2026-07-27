"use client"
import { useEffect, useRef } from "react"

declare global { interface Window { turnstile?: { render:(el:HTMLElement,opts:Record<string,unknown>)=>string; reset:(id?:string)=>void; remove:(id:string)=>void } } }

type Props={ onToken:(token:string|null)=>void }
export function CaptchaWidget({onToken}:Props){
 const ref=useRef<HTMLDivElement|null>(null); const widgetId=useRef<string|null>(null); const siteKey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
 useEffect(()=>{ if(!siteKey)return; const render=()=>{if(ref.current&&window.turnstile&&!widgetId.current)widgetId.current=window.turnstile.render(ref.current,{sitekey:siteKey,callback:(t:string)=>onToken(t),"expired-callback":()=>onToken(null),"error-callback":()=>onToken(null)})}; if(window.turnstile)render(); else {const s=document.createElement("script");s.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";s.async=true;s.defer=true;s.onload=render;document.head.appendChild(s)} return()=>{if(widgetId.current&&window.turnstile)window.turnstile.remove(widgetId.current)}},[onToken,siteKey])
 if(!siteKey)return <p className="text-xs text-muted-foreground">CAPTCHA will activate after the Turnstile site key is added in Vercel.</p>
 return <div ref={ref}/>
}
