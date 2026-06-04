import "./globals.css";

export const metadata = {
  title: "PickleFlow — Pickleball Platform",
  description: "Tournaments, open play, live courts, and player management",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
