"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-8">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold text-red-300">PickleFlow error</h1>
        <p className="text-slate-400 text-sm">
          {error.message ?? "Something went wrong loading this page."}
        </p>
        <p className="text-xs text-slate-500">
          Tournament data is saved in data/pickleflow-store.json — nothing was deleted.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-2 bg-cyan-500 text-black font-semibold rounded-lg text-sm"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-slate-700 rounded-lg text-sm font-semibold"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
