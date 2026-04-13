import "./globals.css";
import type { Metadata, Viewport } from "next";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";

export const metadata: Metadata = {
  title: "postit",
  description: "Invite-only curated content board. Link-only, LLM auto-categorized, no chat.",
  manifest: "/manifest.webmanifest",
  applicationName: "postit",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "postit",
  },
};

export const viewport: Viewport = {
  themeColor: "#312e81",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}
