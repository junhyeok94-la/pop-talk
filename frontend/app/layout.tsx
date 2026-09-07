import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/components/QueryProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "POP TALK — AI 영화 추천",
  description:
    "자연어로 취향과 상황을 설명하면 AI가 검증한 영화를 추천해주는 팝톡(Pop Talk) 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-100 dark:bg-zinc-950">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
