import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

/** content/legal/ に置く法務ドキュメントのファイル名 (拡張子なし)。 */
export type LegalDocumentName = "terms" | "privacy";

/**
 * 法務ドキュメントの markdown を HTML 文字列にして返す。
 * ビルド時に呼ぶ前提で、呼び出すページは force-static にする (実行時にファイルを読む経路を作らない)。
 */
export async function renderLegalDocument(name: LegalDocumentName): Promise<string> {
  return marked.parse(await readFile(path.join(process.cwd(), "content", "legal", `${name}.md`), "utf8"), {
    async: false,
  });
}
