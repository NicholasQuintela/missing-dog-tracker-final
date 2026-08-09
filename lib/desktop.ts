export const IS_DESKTOP_BUILD = process.env.NEXT_PUBLIC_DESKTOP_APP === "1"

declare global {
  interface Window {
    petAlertDesktop?: {
      isDesktop: boolean
      openSecureAuth: () => Promise<
        | { ok: true; accessToken: string; refreshToken: string }
        | { ok: false; error: string }
      >
      clearAuthSession: () => Promise<{ ok: boolean; error?: string }>
    }
  }
}
