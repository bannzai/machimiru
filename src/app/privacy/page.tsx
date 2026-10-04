import type { Metadata } from "next";
import { renderLegalDocument } from "@/lib/legalDocument";
import { siteName } from "@/lib/site";

// 原文をビルド時に読むため、実行時にファイルを読む動的な描画にしない
export const dynamic = "force-static";

/** プライバシーポリシーページのタイトルと説明文。 */
export const metadata: Metadata = {
  title: `プライバシーポリシー | ${siteName}`,
  description: `${siteName} のプライバシーポリシー`,
};

/** プライバシーポリシーページ。content/legal/privacy.md を HTML にして出す。 */
export default async function PrivacyPage() {
  return <main dangerouslySetInnerHTML={{ __html: await renderLegalDocument("privacy") }} />;
}
