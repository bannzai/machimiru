import Link from "next/link";
import { contactEmail, siteDescription, siteName } from "@/lib/site";

/** トップページ。サービスの説明と、法務ページ・問い合わせ先への導線を出す。 */
export default function TopPage() {
  return (
    <main>
      <h1>{siteName}</h1>
      <p>{siteDescription}</p>
      <nav aria-label="このサイトについて">
        <ul>
          <li>
            <Link href="/terms/">利用規約</Link>
          </li>
          <li>
            <Link href="/privacy/">プライバシーポリシー</Link>
          </li>
          <li>
            お問い合わせ: <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          </li>
        </ul>
      </nav>
    </main>
  );
}
