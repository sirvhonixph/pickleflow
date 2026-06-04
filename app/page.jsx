"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-purple-500/10 to-green-500/10 blur-3xl"></div>

      <nav className="relative z-10 flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-12 py-4 sm:py-6">
        <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-cyan-400 to-green-400 bg-clip-text text-transparent shrink-0">
          PickleFlow
        </h1>

        <div className="flex gap-2 sm:gap-4">
          <Link
            href="/login"
            className="px-3 sm:px-5 py-2 rounded-lg border border-cyan-500 hover:bg-cyan-500/20 transition text-sm sm:text-base"
          >
            Login
          </Link>

          <Link
            href="/register"
            className="px-3 sm:px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 hover:opacity-90 transition text-sm sm:text-base"
          >
            Register
          </Link>
        </div>
      </nav>

      <section className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-24 pb-20">
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold leading-tight">
          The Ultimate
          <span className="block bg-gradient-to-r from-cyan-400 via-purple-400 to-green-400 bg-clip-text text-transparent">
            Pickleball Platform
          </span>
        </h1>

        <p className="mt-8 max-w-3xl text-lg md:text-xl text-gray-300">
          Manage tournaments, automate open play, track live scores,
          livestream matches, connect with players, and grow your pickleball
          community all in one place.
        </p>

        <div className="flex flex-wrap justify-center gap-4 mt-10">
          <Link
            href="/register"
            className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 font-semibold text-lg"
          >
            Get Started
          </Link>

          <Link
            href="/login"
            className="px-8 py-4 rounded-xl border border-cyan-500 font-semibold text-lg hover:bg-cyan-500/10"
          >
            Login
          </Link>
        </div>
      </section>

      <section className="relative z-10 px-6 lg:px-20 py-16">
        <h2 className="text-4xl font-bold text-center mb-12">
          Everything You Need
        </h2>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <h3 className="text-xl font-semibold mb-3">
              Tournament Management
            </h3>
            <p className="text-gray-400">
              Create and manage tournaments with brackets, categories, and
              player registration.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <h3 className="text-xl font-semibold mb-3">
              Open Play Automation
            </h3>
            <p className="text-gray-400">
              Automatic player rotation, matchmaking, and court assignment.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <h3 className="text-xl font-semibold mb-3">Live Scoring</h3>
            <p className="text-gray-400">
              Real-time score updates synchronized across players and viewers.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <h3 className="text-xl font-semibold mb-3">Livestream & Chat</h3>
            <p className="text-gray-400">
              Watch matches live and engage through community chat.
            </p>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-6 lg:px-20 py-16">
        <h2 className="text-4xl font-bold text-center mb-12">Upcoming Events</h2>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="p-6 rounded-2xl bg-white/5 border border-cyan-500/30">
            <h3 className="text-2xl font-bold">
              Davao Open Pickleball Tournament
            </h3>
            <p className="text-gray-400 mt-2">June 15, 2026 • Tournament</p>
            <p className="mt-4">Registration Fee: ₱500</p>
            <button className="mt-5 px-5 py-3 rounded-lg bg-cyan-500 text-black font-semibold">
              View Event
            </button>
          </div>

          <div className="p-6 rounded-2xl bg-white/5 border border-purple-500/30">
            <h3 className="text-2xl font-bold">Friday Night Open Play</h3>
            <p className="text-gray-400 mt-2">June 20, 2026 • Open Play</p>
            <p className="mt-4">Registration Fee: ₱200</p>
            <button className="mt-5 px-5 py-3 rounded-lg bg-purple-500 font-semibold">
              Join Event
            </button>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-8 text-center text-gray-500">
          © 2026 PickleFlow. Play. Compete. Connect.
        </div>
      </footer>
    </main>
  );
}
