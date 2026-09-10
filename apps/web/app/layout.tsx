import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const headingFont = Geist({
  variable: "--font-heading-family",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono-family",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "SEO Maker",
  description: "Audit sites, generate SEO recommendations, and compare competitors.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${headingFont.variable} ${monoFont.variable}`}>
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
