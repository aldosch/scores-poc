import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Live Scores",
  description: "Near-realtime sports scores POC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
