import type { Metadata } from "next"
import { DesktopLoginClient } from "@/components/desktop-login-client"

export const metadata: Metadata = {
  title: "Desktop Sign In — Pet Alert PH",
  description: "Lightweight secure authentication for the Pet Alert PH Windows desktop app.",
  robots: { index: false, follow: false },
}

export default function DesktopLoginPage() {
  return <DesktopLoginClient />
}
