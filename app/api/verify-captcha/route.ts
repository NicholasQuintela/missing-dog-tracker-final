import { NextResponse } from "next/server"
export async function POST(request:Request){
 const secret=process.env.TURNSTILE_SECRET_KEY
 if(!secret)return NextResponse.json({ok:false,error:"CAPTCHA server key is not configured."},{status:500})
 const {token}=await request.json()
 const form=new FormData(); form.append("secret",secret); form.append("response",token||"")
 const result=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:form}).then(r=>r.json()) as {success?:boolean}
 return NextResponse.json({ok:!!result.success},{status:result.success?200:400})
}
