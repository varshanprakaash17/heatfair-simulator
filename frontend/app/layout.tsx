import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HeatFair — Climate-aware workplace policy simulation",
  description:
    "HeatFair helps organizations simulate how real climate conditions interact with workplace policies, protecting outdoor workers while balancing income and operational needs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-mist-100 text-ink antialiased">{children}</body>
    </html>
  );
}
