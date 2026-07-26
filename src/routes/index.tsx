import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Church,
  Users,
  CalendarCheck,
  Megaphone,
  Network,
  ArrowRight,
  Check,
  Menu,
  X,
  Twitter,
  Instagram,
  Youtube,
} from "lucide-react";
import heroImg from "@/assets/landing-hero.jpg";
import {
  useScrollAnimation,
  useStaggerAnimation,
} from "@/hooks/use-scroll-animation";

/* ──────────── feature data ──────────── */
const features = [
  {
    icon: Users,
    title: "Worker directory",
    body: "One place for every worker's profile, department, and role — searchable and always current.",
    gradient: "from-amber-500 to-orange-600",
  },
  {
    icon: CalendarCheck,
    title: "Attendance you'll trust",
    body: "Track service attendance without paper sheets. See streaks, gaps, and month-over-month at a glance.",
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    icon: Network,
    title: "Departments & organogram",
    body: "Visualize leadership at a glance. Reassign workers in seconds when teams shift.",
    gradient: "from-sky-500 to-indigo-600",
  },
  {
    icon: Megaphone,
    title: "Announcements",
    body: "Send updates to the whole church or a single department. Workers see them the moment they sign in.",
    gradient: "from-violet-500 to-purple-600",
  },
  {
    icon: Check,
    title: "Profile completeness",
    body: "A gentle nudge — not a nag — that helps workers keep their own information up to date.",
    gradient: "from-rose-500 to-pink-600",
  },
  {
    icon: Church,
    title: "Role-aware access",
    body: "Church admins, department admins, and workers each see exactly what they need. Nothing more.",
    gradient: "from-amber-600 to-yellow-500",
  },
];

const steps = [
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
];

const faqs = [
  {
    q: "Is Harvesters really free for small churches?",
    a: "Yes. Under 50 workers, forever. Larger churches unlock team-wide features on a simple monthly plan.",
  },
  {
    q: "Do our workers need to install anything?",
    a: "No. Harvesters runs in the browser on phones, tablets, and laptops. No app store required.",
  },
  {
    q: "Who can see a worker's information?",
    a: "Only the church admin, that worker's department admin, and the worker themself. Privacy is built in.",
  },
  {
    q: "Can I import our existing spreadsheet?",
    a: "Absolutely. Upload a CSV and map your columns — workers will appear in seconds.",
  },
  {
    q: "How do I track attendance during a service?",
    a: "Open the attendance page on any device, tap the names of workers present, and save. It takes under a minute.",
  },
];

const trustChurches = [
  "Grace Assembly",
  "House on the Rock",
  "Redeemed Chapel",
  "Cornerstone Fellowship",
  "City Light Church",
];

const testimonials = [
  {
    quote: "Harvesters Church Management System gave our team back their evenings. We stopped chasing workers on WhatsApp.",
    author: "Pst Bolaji Idowu",
    role: "Lead Pastor, Harvesters International Christian Centre",
    initials: "PB",
  },
  {
    quote: "The attendance tracking is seamless. Our department leads now have accurate data right after every service.",
    author: "Pst Ade",
    role: "Resident Pastor, Harvesters Lekki",
    initials: "PA",
  },
  {
    quote: "Organizing our volunteers used to take hours of spreadsheet work. Now it takes minutes.",
    author: "Minister Joy",
    role: "Head of Ushering, Harvesters Ikeja",
    initials: "MJ",
  },
];

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

/* ──────────── component ──────────── */
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  const [activeTestimonial, setActiveTestimonial] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* scroll-animation refs */
  const featuresRef = useStaggerAnimation<HTMLDivElement>();
  const howRef = useScrollAnimation();
  const testimonialRef = useScrollAnimation();
  const faqRef = useScrollAnimation();
  const ctaRef = useScrollAnimation();

  return (
    <div className="min-h-screen bg-[#f7f5f0] text-slate-900 overflow-x-hidden">
      {/* ──── Nav ──── */}
      <header
        className={`sticky top-0 z-30 border-b bg-[#f7f5f0]/80 backdrop-blur-lg transition-shadow duration-300 ${
          scrolled
            ? "border-slate-200/80 shadow-[0_1px_12px_rgba(15,23,42,0.06)]"
            : "border-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-white shadow-sm overflow-hidden">
              <img src="/Harvester-icon.png" alt="Harvesters Icon" className="h-5 w-5 object-contain" />
            </div>
            <span className="text-sm font-bold tracking-tight">Harvesters Church Management System</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-500 md:flex">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="transition-colors hover:text-slate-900"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/auth/login"
              className="hidden text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 sm:inline"
            >
              Sign in
            </Link>
            <Link to="/auth/signup">
              <Button
                size="sm"
                className="bg-slate-900 px-4 text-white shadow-sm hover:bg-slate-800"
              >
                Get started
              </Button>
            </Link>

            {/* Mobile hamburger */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 bg-[#f7f5f0]">
                <div className="flex flex-col gap-6 pt-8">
                  <div className="flex items-center gap-2.5 px-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-white overflow-hidden">
                      <img src="/Harvester-icon.png" alt="Harvesters Icon" className="h-5 w-5 object-contain" />
                    </div>
                    <span className="text-sm font-bold">Harvesters Church Management System</span>
                  </div>
                  <nav className="flex flex-col gap-1">
                    {navLinks.map((l) => (
                      <SheetClose asChild key={l.href}>
                        <a
                          href={l.href}
                          className="rounded-md px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
                        >
                          {l.label}
                        </a>
                      </SheetClose>
                    ))}
                  </nav>
                  <hr className="border-slate-200" />
                  <div className="flex flex-col gap-2 px-2">
                    <Link to="/auth/login">
                      <Button
                        variant="outline"
                        className="w-full border-slate-300"
                      >
                        Sign in
                      </Button>
                    </Link>
                    <Link to="/auth/signup">
                      <Button className="w-full bg-slate-900 text-white hover:bg-slate-800">
                        Get started
                      </Button>
                    </Link>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* ──── Hero ──── */}
      <section className="relative mx-auto max-w-6xl px-6 pt-16 pb-20 md:pt-24 md:pb-28">
        {/* Decorative gradient orbs */}
        <div className="pointer-events-none absolute -top-32 -left-32 h-[480px] w-[480px] rounded-full bg-gradient-to-br from-amber-200/40 to-orange-100/20 blur-3xl animate-pulse-glow" />
        <div className="pointer-events-none absolute -right-24 top-20 h-[360px] w-[360px] rounded-full bg-gradient-to-br from-sky-200/30 to-indigo-100/20 blur-3xl animate-pulse-glow" style={{ animationDelay: "1.5s" }} />

        <div className="relative grid items-center gap-12 md:grid-cols-2">
          {/* Text side */}
          <div className="animate-fade-in-up">
            <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-slate-900 md:text-5xl lg:text-[3.5rem]">
              The quiet workspace
              <br />
              <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                behind every service.
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-600">
              Harvesters helps church admins and department leads keep track of
              workers, attendance, and communication — without the spreadsheet
              chaos. So Sunday morning feels like Sunday morning.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/auth/signup">
                <Button className="group bg-slate-900 px-6 shadow-md shadow-slate-900/10 transition-all hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-900/20">
                  Start free
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <Link to="/auth/login">
                <Button
                  variant="outline"
                  className="border-slate-300 bg-white/70 backdrop-blur hover:bg-white"
                >
                  Sign in
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              No credit card. Free for churches under 50 workers.
            </p>
          </div>

          {/* Image side */}
          <div className="relative animate-fade-in-scale" style={{ animationDelay: "0.2s" }}>
            <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-amber-200/50 via-orange-100/30 to-sky-100/40 blur-2xl animate-float" />
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_64px_-16px_rgba(15,23,42,0.2)]">
              <img
                src={heroImg}
                alt="Church community fellowship after service"
                width={1024}
                height={1024}
                className="h-full w-full object-cover"
              />
            </div>
            {/* Floating stat card */}
            <div className="absolute -bottom-5 -left-5 animate-fade-in-up rounded-xl border border-slate-200 bg-white/90 p-3.5 shadow-lg backdrop-blur" style={{ animationDelay: "0.6s" }}>
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                  <CalendarCheck className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">This month</div>
                  <div className="text-sm font-bold text-slate-900">96% attendance</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──── Trust strip ──── */}
      <section className="flex border-y border-slate-200/80 bg-white/50 py-6 overflow-hidden backdrop-blur-sm">
        <div className="flex w-max animate-marquee items-center gap-x-10">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex shrink-0 items-center gap-x-10 px-5">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-slate-400">
                Trusted by teams at
              </span>
              {trustChurches.map((c) => (
                <span
                  key={c}
                  className="shrink-0 text-sm font-semibold tracking-wide text-slate-400/80 transition-colors hover:text-slate-600"
                >
                  {c}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ──── Features ──── */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl animate-fade-in-up">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-700">
            What's inside
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
            Everything a growing church actually needs.
          </h2>
          <p className="mt-3 text-slate-600">
            No feature bloat. Just the tools your admins reach for every week.
          </p>
        </div>
        <div
          ref={featuresRef}
          className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative rounded-2xl border border-slate-200/80 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/60"
            >
              {/* Gradient accent line on hover */}
              <div className={`absolute inset-x-0 top-0 h-0.5 rounded-t-2xl bg-gradient-to-r ${f.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${f.gradient} text-white shadow-sm`}
              >
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ──── How it works ──── */}
      <section id="how" className="border-t border-slate-200 bg-white">
        <div
          ref={howRef}
          className="mx-auto grid max-w-6xl gap-16 px-6 py-24 md:grid-cols-2"
        >
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-amber-700">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
              Set up on a Saturday.
              <br />
              Ready by Sunday.
            </h2>
            <p className="mt-4 text-slate-600">
              Harvesters is intentionally simple. Your first admin can invite
              department leads, and department leads can bring their workers on
              board — all in the same afternoon.
            </p>
          </div>
          <ol className="space-y-8">
            {steps.map((s, i) => (
              <li key={s.n} className="flex gap-5">
                {/* Number circle */}
                <div className="flex flex-col items-center">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-sm font-bold text-white shadow-sm">
                    {s.n}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="mt-2 h-full w-px bg-gradient-to-b from-amber-300 to-transparent" />
                  )}
                </div>
                <div className="pb-2">
                  <h3 className="text-base font-bold text-slate-900">{s.t}</h3>
                  <p className="mt-1 text-sm text-slate-600">{s.b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ──── Testimonial ──── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#f7f5f0] via-amber-50/40 to-[#f7f5f0]" />
        <div
          ref={testimonialRef}
          className="relative mx-auto max-w-4xl px-6 py-24 text-center"
        >
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-700">
            What leaders are saying
          </p>
          <div className="relative mt-8 min-h-[300px] md:min-h-[220px]">
            {/* Decorative quotes */}
            <span className="absolute -top-8 -left-4 text-7xl font-bold leading-none text-amber-200/60 select-none md:-left-8 md:text-8xl">
              "
            </span>
            {testimonials.map((t, i) => (
              <div
                key={i}
                className={`absolute inset-0 flex flex-col justify-between transition-all duration-700 ease-in-out ${
                  i === activeTestimonial
                    ? "opacity-100 translate-x-0"
                    : i < activeTestimonial
                    ? "opacity-0 -translate-x-12"
                    : "opacity-0 translate-x-12"
                }`}
              >
                <blockquote className="font-serif-display text-2xl font-medium leading-relaxed text-slate-800 italic md:text-3xl lg:text-[2rem]">
                  {t.quote}
                </blockquote>
                <div className="mt-8 flex items-center justify-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-bold text-white shadow-sm">
                    {t.initials}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-slate-900">{t.author}</div>
                    <div className="text-xs text-slate-500">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination dots */}
          <div className="mt-8 flex justify-center gap-2">
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveTestimonial(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === activeTestimonial ? "w-6 bg-amber-500" : "w-2 bg-slate-300 hover:bg-slate-400"
                }`}
                aria-label={`Go to testimonial ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ──── FAQ ──── */}
      <section id="faq" className="border-t border-slate-200 bg-white">
        <div
          ref={faqRef}
          className="mx-auto max-w-3xl px-6 py-20"
        >
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-amber-700">
              FAQ
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Common questions
            </h2>
          </div>
          <Accordion type="single" collapsible className="mt-10">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border-slate-200">
                <AccordionTrigger className="text-left text-base font-semibold text-slate-900 hover:text-slate-700 hover:no-underline py-5">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-slate-600 pb-5">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ──── CTA ──── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div
          ref={ctaRef}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 px-8 py-16 text-center text-white shadow-2xl md:px-16 animate-gradient"
        >
          {/* Subtle pattern overlay */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(251,191,36,0.08),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(99,102,241,0.06),transparent_60%)]" />
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              A calmer Sunday starts on Monday.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-slate-300">
              Bring your workers, departments, and attendance into one place — in
              the time it takes to make coffee.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/auth/signup">
                <Button className="group bg-white px-6 text-slate-900 shadow-md transition-all hover:bg-slate-50 hover:shadow-lg">
                  Create your church
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <Link to="/auth/login">
                <Button
                  variant="outline"
                  className="border-slate-600 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                  Sign in
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ──── Footer ──── */}
      <footer className="border-t border-slate-200 bg-[#f7f5f0]">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* Brand */}
            <div className="lg:col-span-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-white overflow-hidden">
                  <img src="/Harvester-icon.png" alt="Harvesters Icon" className="h-5 w-5 object-contain" />
                </div>
                <span className="text-sm font-bold">Harvesters Church Management System</span>
              </div>
              <p className="mt-3 max-w-xs text-sm text-slate-500">
                The quiet workspace behind every service. Helping church teams
                stay organized so Sunday feels like Sunday.
              </p>
              <div className="mt-4 flex gap-3">
                <a
                  href="#"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
                  aria-label="Twitter"
                >
                  <Twitter className="h-3.5 w-3.5" />
                </a>
                <a
                  href="#"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
                  aria-label="Instagram"
                >
                  <Instagram className="h-3.5 w-3.5" />
                </a>
                <a
                  href="#"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
                  aria-label="YouTube"
                >
                  <Youtube className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Product
              </h4>
              <ul className="mt-3 space-y-2.5">
                <li><a href="#features" className="text-sm text-slate-600 transition-colors hover:text-slate-900">Features</a></li>
                <li><a href="#how" className="text-sm text-slate-600 transition-colors hover:text-slate-900">How it works</a></li>
                <li><a href="#faq" className="text-sm text-slate-600 transition-colors hover:text-slate-900">FAQ</a></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Company
              </h4>
              <ul className="mt-3 space-y-2.5">
                <li><a href="#" className="text-sm text-slate-600 transition-colors hover:text-slate-900">About</a></li>
                <li><a href="#" className="text-sm text-slate-600 transition-colors hover:text-slate-900">Blog</a></li>
                <li><a href="#" className="text-sm text-slate-600 transition-colors hover:text-slate-900">Careers</a></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Legal
              </h4>
              <ul className="mt-3 space-y-2.5">
                <li><a href="#" className="text-sm text-slate-600 transition-colors hover:text-slate-900">Privacy</a></li>
                <li><a href="#" className="text-sm text-slate-600 transition-colors hover:text-slate-900">Terms</a></li>
                <li><a href="#" className="text-sm text-slate-600 transition-colors hover:text-slate-900">Contact</a></li>
              </ul>
            </div>
          </div>

          <hr className="mt-10 border-slate-200" />
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <span>© {new Date().getFullYear()} Harvesters Church Management System. All rights reserved.</span>
            <span>Made with ♥ for the local church.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
