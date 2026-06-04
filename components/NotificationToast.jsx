"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TOAST_EVENT } from "@/lib/inbox-events";

export default function NotificationToast() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let timer = null;

    function onToast(e) {
      const { message, href } = e.detail ?? {};
      if (!message) return;
      setToast({ message, href });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setToast(null), 5000);
    }

    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!toast) return null;

  const inner = (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 shadow-2xl max-w-sm">
      <p className="text-sm font-semibold text-white">{toast.message}</p>
      {toast.href && (
        <p className="text-xs text-cyan-400 mt-1">Tap to open</p>
      )}
    </div>
  );

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-[9999] pb-[env(safe-area-inset-bottom)]">
      {toast.href ? (
        <Link href={toast.href} onClick={() => setToast(null)}>
          {inner}
        </Link>
      ) : (
        inner
      )}
    </div>
  );
}
