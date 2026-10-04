import type { MetadataRoute } from "next";
import { sitePagePaths, siteUrl } from "@/lib/site";

/** /sitemap.xml の中身。公開している各ページの絶対 URL を返す。 */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitePagePaths.map((pagePath) => ({ url: new URL(pagePath, siteUrl).toString() }));
}
