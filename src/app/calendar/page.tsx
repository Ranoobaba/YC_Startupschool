import { permanentRedirect } from "next/navigation"

// The schedule and the calendar were two views of the same data, which is how
// a timezone bug survived in one of them. There is now one page.
export default function CalendarPage() {
  permanentRedirect("/schedule")
}
