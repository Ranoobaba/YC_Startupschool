export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-bg-warm">
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
        <p className="text-sm font-medium">
          Made by{" "}
          <a
            href="https://github.com/Ranoobaba"
            className="text-orange-dark underline underline-offset-4"
          >
            Syed Rayyan Ali
          </a>
        </p>
        <p className="mt-1 text-sm text-muted">
          Not affiliated with Y&nbsp;Combinator or Startup School. This is an
          independent community project — the official program lives at{" "}
          <a
            href="https://www.startupschool.org"
            className="underline underline-offset-4"
          >
            startupschool.org
          </a>
          .
        </p>
      </div>
    </footer>
  )
}
