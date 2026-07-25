import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

// Signed-in-only areas. Verification (is this person actually in the program?)
// is enforced per page, since it needs the profile row, not just a session.
const isGated = createRouteMatcher([
  "/schedule(.*)",
  "/ask(.*)",
  "/admin(.*)",
  "/verify(.*)",
  "/calendar(.*)",
  "/onboarding(.*)",
])

export default clerkMiddleware(async (auth, request) => {
  if (isGated(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Everything except Next internals and static files, unless in a search param.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
}
