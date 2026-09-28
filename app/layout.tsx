import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The AI Files: Decode the Crime",
  description: "Tech investigation challenge platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
