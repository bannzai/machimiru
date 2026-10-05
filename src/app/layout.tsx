import type { Metadata } from "next";
import { siteDescription, siteName, siteTitle, siteUrl } from "@/lib/site";
import { CloudflareWebAnalyticsBeacon } from "./CloudflareWebAnalyticsBeacon";
import "./globals.css";

/**
 * 全ページの既定のタイトル・説明文と、検索結果・SNS のカードの情報。各ページの metadata がタイトルと説明文を上書きする。
 * OGP 画像は同じディレクトリの opengraph-image.tsx が全ページに付ける。
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  // og:title・og:description は、各ページの title・description から Next.js が埋める
  openGraph: { type: "website", siteName, locale: "ja_JP" },
  twitter: { card: "summary_large_image" },
};

/** 全ページ共通の枠。アクセス解析の beacon を body の末尾に置く。 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        {children}
        <CloudflareWebAnalyticsBeacon />
      </body>
    </html>
  );
}
