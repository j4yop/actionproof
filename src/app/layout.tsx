import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ActionProof — prove the action happened",
  description: "A deterministic, fail-closed verifier for browser-agent evidence.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
