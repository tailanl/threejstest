import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "铁甲战棋 - 三维回合制战棋游戏",
  description: "基于Three.js的三维回合制战棋游戏，指挥现代化合成旅，包含10种单位、10种地形、战术与战略双模式。",
  keywords: ["战棋", "策略游戏", "Three.js", "回合制", "合成旅", "军事"],
  authors: [{ name: "铁甲战棋" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "铁甲战棋",
    description: "基于Three.js的三维回合制战棋游戏",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
