import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "FlowChat 智能助手",
  description: "基于 Next.js 15 + Supabase + SiliconFlow 构建的实时流式 AI 聊天应用，支持多会话管理、Markdown 渲染、深色模式及完整的错误处理机制。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
  <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
    <body className="min-h-full flex flex-col">
      <ClerkProvider>{children}</ClerkProvider>
    </body>
  </html>
);
}
