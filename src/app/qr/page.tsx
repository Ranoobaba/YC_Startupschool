import type { Metadata } from "next"
import QRCode from "qrcode"

import { SITE_URL } from "@/config/site"

export const metadata: Metadata = {
  title: "Scan to join",
  description: "Point a phone camera here to open the Startup School Hub.",
}

export default async function QrPage() {
  // Rendered as SVG so it stays sharp on a laptop screen held up across a table
  // or blown up on a poster.
  const svg = await QRCode.toString(SITE_URL, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#16140f", light: "#ffffff" },
  })

  const host = SITE_URL.replace(/^https?:\/\//, "")

  return (
    <div className="fade-up mx-auto flex max-w-lg flex-col items-center pt-6 text-center">
      <p className="mb-4 flex items-center gap-2.5 font-mono text-[13px] font-medium tracking-[0.1em] text-muted uppercase">
        <span className="sq" aria-hidden />
        Startup School Hub
      </p>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Scan to see every alternative session.
      </h1>
      <p className="mt-3 text-muted">
        Your badge isn&apos;t checked at the door. See what else is running
        during every round — and who else is here.
      </p>

      <div
        className="mt-8 w-full max-w-[320px] rounded-xl border border-line bg-white p-5 [&>svg]:h-auto [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      <p className="mt-5 font-mono text-[15px] font-medium break-all">{host}</p>
      <p className="mt-6 text-sm text-muted">
        Made by Syed Rayyan Ali · not affiliated with Y&nbsp;Combinator
      </p>
    </div>
  )
}
