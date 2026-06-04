"use client";

import Link from "next/link";
import { useUnreadMessageCount } from "@/hooks/useUnreadMessageCount";

export default function MessagesNavLink({
  className = "",
  children = "Messages",
}) {
  const count = useUnreadMessageCount();

  return (
    <Link
      href="/messages"
      className={`relative inline-flex items-center ${className}`}
    >
      {children}
      {count > 0 && (
        <span
          className="absolute -top-2 -right-2 min-w-[1.125rem] h-[1.125rem] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none shadow-lg"
          aria-label={`${count} unread message${count === 1 ? "" : "s"}`}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
