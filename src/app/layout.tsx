import type { Metadata } from "next";
import { siteDescription, siteName } from "@/lib/site";
import { CloudflareWebAnalyticsBeacon } from "./CloudflareWebAnalyticsBeacon";
import "./globals.css";

/** 全ページの既定のタイトルと説明文。各ページの metadata が上書きする。 */
export const metadata: Metadata = {
  title: siteName,
  description: siteDescription,
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
