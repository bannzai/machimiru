import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

/** documents/PROJECT.md の中で、外部データの提供元とライセンスの表を持つ節の見出し。 */
const dataSourcesHeading = "## データの出典";

/**
 * documents/PROJECT.md「データの出典」の表を HTML 文字列にして返す。表は同節を正とし、出典ページに同じ内容を出すために読む。
 * ビルド時に呼ぶ前提で、呼び出すページは force-static にする (実行時にファイルを読む経路を作らない)。
 * 節や表が見つからない時は例外にする (出典を表示しないままビルドを通さないため)。
 */
export async function renderDataSourceTable(): Promise<string> {
  const projectDocument = await readFile(path.join(process.cwd(), "documents", "PROJECT.md"), "utf8");
  const sectionStart = projectDocument.indexOf(`\n${dataSourcesHeading}\n`);
  if (sectionStart === -1) {
    throw new Error(`documents/PROJECT.md に「${dataSourcesHeading}」の節がありません`);
  }
  const sectionBody = projectDocument.slice(sectionStart + dataSourcesHeading.length + 2);
  const nextSectionStart = sectionBody.search(/^## /m);
  // 節の中の表の行だけを出す。表の前の説明は、リポジトリで表を更新する人に向けた文のため出さない
  const tableRows = (nextSectionStart === -1 ? sectionBody : sectionBody.slice(0, nextSectionStart))
    .split("\n")
    .filter((line) => line.startsWith("|"));
  if (tableRows.length === 0) {
    throw new Error(`documents/PROJECT.md の「${dataSourcesHeading}」に表がありません`);
  }
  return marked.parse(tableRows.join("\n"), { async: false });
}
