import type { Metadata } from "next"
import { Figtree, IBM_Plex_Mono } from "next/font/google"

import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { SITE_URL } from "@/config/site"

import "./globals.css"

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
})

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Startup School Hub — schedules, students, answers",
    template: "%s — Startup School Hub",
  },
  description:
    "A community hub for YC Startup School participants: every session (including the ones you'd miss), a directory of fellow students, and answers about who's building what. Made by Syed Rayyan Ali — not affiliated with Y Combinator.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${figtree.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-10 pb-24 sm:px-8">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  )
}
