import type { Metadata } from "next";
import { Sarabun } from "next/font/google";
import "./globals.css";

// Thai + Latin in one family. See docs/decision-log.md (2026-09-26, Font).
const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Quiz Loop",
  description:
    "เกมควิซสดสำหรับห้องเรียน ที่จบด้วยจุดที่ควรทบทวนและรอบทบทวนในคาบเดียว",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${sarabun.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
