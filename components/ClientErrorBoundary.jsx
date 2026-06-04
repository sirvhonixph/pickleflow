"use client";

import { Component } from "react";
import Link from "next/link";

export default class ClientErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("UI error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 space-y-3">
          <h2 className="text-lg font-bold text-red-300">Something went wrong</h2>
          <p className="text-sm text-slate-300">
            {this.state.error.message ?? "The page crashed while rendering."}
          </p>
          <p className="text-xs text-slate-500">
            Your tournament data is still saved on the server. Try refreshing, or
            go back to the dashboard.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-cyan-500 text-black font-semibold rounded-lg text-sm"
            >
              Refresh page
            </button>
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-slate-700 rounded-lg text-sm font-semibold"
            >
              Dashboard
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
