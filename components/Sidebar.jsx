"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const linkStyle = (active) => ({
  display: "block",
  boxSizing: "border-box",
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  textDecoration: "none",
  color: active ? "#000" : "#f8fafc",
  backgroundColor: active ? "rgb(6 182 212)" : "transparent",
});

const LOGOUT_STYLE = {
  display: "block",
  boxSizing: "border-box",
  width: "100%",
  marginTop: 32,
  padding: "12px 16px",
  borderRadius: 8,
  textDecoration: "none",
  color: "#fff",
  backgroundColor: "rgb(239 68 68)",
};

export default function Sidebar({ open = false, onClose }) {
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  }, [pathname]);

  const menuItems = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "Create Event", href: "/create-event" },
    { name: "Profile", href: "/profile" },
    { name: "Settings", href: "/settings" },
  ];

  return (
    <aside
      data-sidebar
      data-open={open ? "true" : "false"}
      className="pf-sidebar-panel"
    >
      <h1 className="pf-sidebar-title">PickleFlow</h1>

      <nav className="pf-sidebar-nav">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={linkStyle(pathname === item.href)}
            onClick={() => onClose?.()}
          >
            {item.name}
          </Link>
        ))}

        <Link href="/login" style={LOGOUT_STYLE} onClick={() => onClose?.()}>
          Logout
        </Link>
      </nav>
    </aside>
  );
}
