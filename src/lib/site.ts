/** サービス名。 */
export const siteName = "machimiru";

/** トップページの見出しの下と OGP 画像に出す、サービスを一言で表す文言。検索需要の調査で需要があった「子育てしやすい街」の語彙を使う。 */
export const siteCatchphrase = "東京で子育てしやすい街を地図で探す";

/** トップページのタイトル。検索結果と SNS のカードに出る。 */
export const siteTitle = `${siteName} | ${siteCatchphrase}`;

/** 検索結果・SNS のカードに出すサービスの説明。 */
export const siteDescription =
  "遠くから東京へ引っ越す子育て世帯のために、子育てしやすい街を地図で探して比べるサービス。気になる区市町村や町丁を地図で選んで、住む街の候補を絞れます。";

/** 問い合わせ先として公開するサポート用のメールアドレス (法務ドキュメント content/legal/*.md に書いた窓口と同じ)。 */
export const contactEmail = "bannzai.app@gmail.com";

// 公開 URL は配信の設定で決まるため、配信のビルドだけが環境変数 SITE_URL で渡す (documents/PROJECT.md「インフラ構成」)。
// 未設定・空のビルド (PR の CI・ローカル。workflow の未登録の変数は空文字で渡る) は、next start・next dev が配信する既定の URL を使う
/** OGP・sitemap・robots・JSON-LD の絶対 URL の基点になる公開 URL。 */
export const siteUrl = process.env.SITE_URL || "http://localhost:3000";

/** sitemap に載せる各ページのパス。next.config.ts の trailingSlash に合わせて末尾に / を付ける。 */
export const sitePagePaths = ["/", "/sources/", "/terms/", "/privacy/"];

/** トップページに埋め込む構造化データ (Schema.org の WebSite)。 */
export const siteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteName,
  url: new URL("/", siteUrl).toString(),
  description: siteDescription,
  inLanguage: "ja",
};
