import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Church,
  Users,
  CalendarCheck,
  Megaphone,
  Network,
  ArrowRight,
  Check,
} from "lucide-react";
import heroImg from "@/assets/landing-hero.jpg";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f7f5f0] text-slate-900">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-[#f7f5f0]/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white">
              <Church className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Shepherd</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
            <a href="#features" className="hover:text-slate-900">
              Features
            </a>
            <a href="#how" className="hover:text-slate-900">
              How it works
            </a>
            <a href="#faq" className="hover:text-slate-900">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/auth/login"
              className="hidden text-sm text-slate-600 hover:text-slate-900 sm:inline"
            >
              Sign in
            </Link>
            <Link to="/auth/signup">
              <Button size="sm" className="bg-slate-900 hover:bg-slate-800">
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/60 px-3 py-1 text-xs text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Built with church teams, for church teams
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-slate-900 md:text-5xl lg:text-6xl">
              The quiet workspace
              <br />
              behind every service.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-600">
              Shepherd helps church admins and department leads keep track of
              workers, attendance, and communication — without the spreadsheet
              chaos. So Sunday morning feels like Sunday morning.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/auth/signup">
                <Button className="bg-slate-900 px-5 hover:bg-slate-800">
                  Start free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/auth/login">
                <Button variant="outline" className="border-slate-300 bg-white">
                  Sign in
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              No credit card. Free for churches under 50 workers.
            </p>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-amber-100/60 to-slate-200/40 blur-2xl" />
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)]">
              <img
                src={heroImg}
                alt="Church community fellowship after service"
                width={1024}
                height={1024}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-slate-200 bg-white/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-6 text-xs uppercase tracking-widest text-slate-500">
          <span>Trusted by teams at</span>
          <span>Grace Assembly</span>
          <span>House on the Rock</span>
          <span>Redeemed Chapel</span>
          <span>Cornerstone Fellowship</span>
          <span>City Light Church</span>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-widest text-amber-700">
            What's inside
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            Everything a growing church actually needs.
          </h2>
          <p className="mt-3 text-slate-600">
            No feature bloat. Just the tools your admins reach for every week.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Users,
              title: "Worker directory",
              body: "One place for every worker's profile, department, and role — searchable and always current.",
            },
            {
              icon: CalendarCheck,
              title: "Attendance you'll trust",
              body: "Track service attendance without paper sheets. See streaks, gaps, and month-over-month at a glance.",
            },
            {
              icon: Network,
              title: "Departments & organogram",
              body: "Visualize leadership at a glance. Reassign workers in seconds when teams shift.",
            },
            {
              icon: Megaphone,
              title: "Announcements",
              body: "Send updates to the whole church or a single department. Workers see them the moment they sign in.",
            },
            {
              icon: Check,
              title: "Profile completeness",
              body: "A gentle nudge — not a nag — that helps workers keep their own information up to date.",
            },
            {
              icon: Church,
              title: "Role-aware access",
              body: "Church admins, department admins, and workers each see exactly what they need. Nothing more.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-16 px-6 py-24 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-amber-700">
              How it works
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Set up on a Saturday.
              <br />
              Ready by Sunday.
            </h2>
            <p className="mt-4 text-slate-600">
              Shepherd is intentionally simple. Your first admin can invite
              department leads, and department leads can bring their workers
              on board — all in the same afternoon.
            </p>
          </div>
          <ol className="space-y-6">
            {[
              {
                n: "01",
                t: "Create your church",
                b: "Add your church name and invite your first department admins.",
              },
              {
                n: "02",
                t: "Bring in your teams",
                b: "Department leads add workers, assign roles, and set the weekly service schedule.",
              },
              {
                n: "03",
                t: "Run your first Sunday",
                b: "Check attendance from a phone in the back of the sanctuary. That's it.",
              },
            ].map((s) => (
              <li key={s.n} className="flex gap-4 border-l-2 border-amber-500/60 pl-5">
                <div>
                  <div className="text-xs font-medium tracking-widest text-amber-700">
                    {s.n}
                  </div>
                  <h3 className="mt-1 text-base font-semibold text-slate-900">{s.t}</h3>
                  <p className="mt-1 text-sm text-slate-600">{s.b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Testimonial */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-amber-700">
          A word from a pastor
        </p>
        <blockquote className="mt-6 font-serif text-2xl leading-relaxed text-slate-800 md:text-3xl">
          "We stopped chasing our ushers with a WhatsApp group. Shepherd gave
          our team back their evenings."
        </blockquote>
        <div className="mt-6 text-sm text-slate-500">
          Pastor Ade — Cornerstone Fellowship, Lagos
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">Common questions</h2>
          <dl className="mt-10 divide-y divide-slate-200">
            {[
              {
                q: "Is Shepherd really free for small churches?",
                a: "Yes. Under 50 workers, forever. Larger churches unlock team-wide features on a simple monthly plan.",
              },
              {
                q: "Do our workers need to install anything?",
                a: "No. Shepherd runs in the browser on phones, tablets, and laptops.",
              },
              {
                q: "Who can see a worker's information?",
                a: "Only the church admin, that worker's department admin, and the worker themself.",
              },
            ].map((f) => (
              <div key={f.q} className="py-5">
                <dt className="text-base font-medium text-slate-900">{f.q}</dt>
                <dd className="mt-2 text-sm text-slate-600">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="rounded-2xl bg-slate-900 px-8 py-16 text-center text-white md:px-16">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            A calmer Sunday starts on Monday.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-slate-300">
            Bring your workers, departments, and attendance into one place —
            in the time it takes to make coffee.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/auth/signup">
              <Button className="bg-white px-6 text-slate-900 hover:bg-slate-100">
                Create your church
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/auth/login">
              <Button
                variant="outline"
                className="border-slate-700 bg-transparent text-white hover:bg-slate-800 hover:text-white"
              >
                Sign in
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-[#f7f5f0]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Church className="h-4 w-4" />
            <span>Shepherd © {new Date().getFullYear()}</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-slate-900">
              Privacy
            </a>
            <a href="#" className="hover:text-slate-900">
              Terms
            </a>
            <a href="#" className="hover:text-slate-900">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
