import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "scores-poc back",
  description: "Internal scores API",
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
