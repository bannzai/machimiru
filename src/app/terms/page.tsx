import type { Metadata } from "next";
import { renderLegalDocument } from "@/lib/legalDocument";
import { siteName } from "@/lib/site";

// 原文をビルド時に読むため、実行時にファイルを読む動的な描画にしない
export const dynamic = "force-static";

/** 利用規約ページのタイトルと説明文。 */
export const metadata: Metadata = {
  title: `利用規約 | ${siteName}`,
  description: `${siteName} の利用規約`,
};

/** 利用規約ページ。content/legal/terms.md を HTML にして出す。 */
export default async function TermsPage() {
  return <main dangerouslySetInnerHTML={{ __html: await renderLegalDocument("terms") }} />;
}
