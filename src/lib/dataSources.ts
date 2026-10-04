import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

/** documents/PROJECT.md の中で、外部データの提供元とライセンスの表を持つ節の見出し。 */
const dataSourcesHeading = "## データの出典";

/**
 * documents/PROJECT.md「データの出典」の表を、データ 1 行ごとの見出しと定義リスト (列の見出しと値) の HTML 文字列にして返す。
 * 表は同節を正とし、出典ページに同じ内容を出すために読む。表のまま出すと、モバイル幅で提供元・ライセンスの列が画面の外に出るため、行ごとに縦に並べる。
 * ビルド時に呼ぶ前提で、呼び出すページは force-static にする (実行時にファイルを読む経路を作らない)。
 * 節や表が見つからない時は例外にする (出典を表示しないままビルドを通さないため)。
 */
export async function renderDataSources(): Promise<string> {
  const projectDocument = await readFile(path.join(process.cwd(), "documents", "PROJECT.md"), "utf8");
  const sectionStart = projectDocument.indexOf(`\n${dataSourcesHeading}\n`);
  if (sectionStart === -1) {
    throw new Error(`documents/PROJECT.md に「${dataSourcesHeading}」の節がありません`);
  }
  const sectionBody = projectDocument.slice(sectionStart + dataSourcesHeading.length + 2);
  const nextSectionStart = sectionBody.search(/^## /m);
  // 節の中の表の行だけを読む。表の前の説明は、リポジトリで表を更新する人に向けた文のため出さない
  const [headerCells, , ...dataRows] = (nextSectionStart === -1 ? sectionBody : sectionBody.slice(0, nextSectionStart))
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map(tableRowCells);
  if (!headerCells || dataRows.length === 0) {
    throw new Error(`documents/PROJECT.md の「${dataSourcesHeading}」に表がありません`);
  }
  return dataRows
    .map(
      ([dataName, ...cells]) =>
        `<section><h2>${renderInline(dataName)}</h2><dl>${cells
          .map((cell, index) => `<dt>${renderInline(headerCells[index + 1])}</dt><dd>${renderInline(cell)}</dd>`)
          .join("")}</dl></section>`,
    )
    .join("");
}

/** markdown の表の 1 行 (`| a | b |`) を、前後の空白を除いたセルの文字列の配列にして返す。 */
function tableRowCells(tableRow: string): string[] {
  return tableRow
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** markdown のセルの文字列 (リンク・URL を含む) を、インラインの HTML 文字列にして返す。 */
function renderInline(markdown: string): string {
  return marked.parseInline(markdown, { async: false });
}
