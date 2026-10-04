import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sitePagePaths, siteUrl } from "@/lib/site";
import robots from "./robots";
import sitemap from "./sitemap";

// ~/.agents/skills/landing-page-builder/scripts/verify-lp.sh と同じ検査 (title・description・OGP・JSON-LD・GitHub へのリンクの不在) を、
// next build が書き出した各ページの HTML に対して行う。make check と CI は build-web の後に test を実行する
const builtPageDirectory = path.join(process.cwd(), ".next", "server", "app");

/** 公開する各ページのパスと、next build が書き出したそのページの HTML のファイル。 */
const builtPages = sitePagePaths.map((pagePath) => ({
  pagePath,
  htmlFile: path.join(builtPageDirectory, pagePath === "/" ? "index.html" : `${pagePath.replaceAll("/", "")}.html`),
}));

/** html の中の、name 属性か property 属性が key の meta 要素の content を返す。無い時は undefined を返す。 */
function metaContent(html: string, key: string): string | undefined {
  return [...html.matchAll(/<meta\s[^>]*>/g)]
    .map(([tag]) => tag)
    .find((tag) => tag.includes(`name="${key}"`) || tag.includes(`property="${key}"`))
    ?.match(/content="([^"]*)"/)?.[1];
}

/** html の中の JSON-LD (type が application/ld+json の script 要素) を、それぞれ JSON として読んで返す。 */
function jsonLdDocuments(html: string): unknown[] {
  return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(([, json]) => JSON.parse(json));
}

describe.each(builtPages)("$pagePath の HTML", ({ htmlFile }) => {
  const html = existsSync(htmlFile) ? readFileSync(htmlFile, "utf8") : "";

  it("next build が書き出している (無い時は make build-web を先に実行する)", () => {
    expect(existsSync(htmlFile), htmlFile).toBe(true);
  });

  it("title と、検索結果・SNS のカードの説明文・画像を持つ", () => {
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    for (const key of ["description", "og:title", "og:description", "og:image", "twitter:card"]) {
      expect(metaContent(html, key), key).toBeTruthy();
    }
    expect(metaContent(html, "og:image")).toMatch(new RegExp(`^${siteUrl}/opengraph-image`));
  });

  it("GitHub へのリンクを含まない", () => {
    expect(html).not.toMatch(/(?:https?:)?\/\/(?:www\.)?github\.com/i);
  });
});

describe("トップページの HTML", () => {
  const html = existsSync(builtPages[0].htmlFile) ? readFileSync(builtPages[0].htmlFile, "utf8") : "";

  it("Schema.org の @context と @type を持つ JSON-LD を持つ", () => {
    expect(jsonLdDocuments(html)).toContainEqual(
      expect.objectContaining({ "@context": "https://schema.org", "@type": "WebSite", url: `${siteUrl}/` }),
    );
  });
});

describe("sitemap", () => {
  it("公開する各ページを絶対 URL で載せる", () => {
    expect(sitemap().map(({ url }) => url)).toEqual([
      `${siteUrl}/`,
      `${siteUrl}/sources/`,
      `${siteUrl}/terms/`,
      `${siteUrl}/privacy/`,
    ]);
  });
});

describe("robots", () => {
  it("すべてのページのクロールを許可し、sitemap の絶対 URL を示す", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" }, sitemap: `${siteUrl}/sitemap.xml` });
  });
});
