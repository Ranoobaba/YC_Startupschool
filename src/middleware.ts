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
  if (!isGated(request)) return

  // Redirect explicitly rather than calling auth.protect(): protect() answers a
  // signed-out request with 404, which reads as "this page doesn't exist"
  // instead of "sign in to see it".
  const { userId, redirectToSignIn } = await auth()
  if (!userId) {
    return redirectToSignIn({ returnBackUrl: request.url })
  }
})

export const config = {
  // Clerk needs CLERK_SECRET_KEY at runtime; the edge runtime does not receive
  // it, so the middleware runs on Node.
  runtime: "nodejs",
  matcher: [
    // Everything except Next internals and static files, unless in a search param.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
}
