"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import ChatNotifications from "@/components/ChatNotifications";
import NotificationToast from "@/components/NotificationToast";

export default function AppShell({
  children,
  mainClassName = "p-4 sm:p-6 lg:p-8",
}) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  return (
    <div className="pf-shell">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      {navOpen && (
        <button
          type="button"
          className="pf-nav-backdrop"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      )}

      <div className="pf-main-column">
        <header className="pf-mobile-header">
          <button
            type="button"
            className="pf-mobile-menu-btn"
            aria-label="Open menu"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            Menu
          </button>
          <span className="pf-mobile-brand">PickleFlow</span>
        </header>

        <main className={`pf-main ${mainClassName}`.trim()}>
          {children}
        </main>
      </div>

      <ChatNotifications />
      <NotificationToast />
    </div>
  );
}
