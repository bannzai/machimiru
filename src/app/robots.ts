import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** /robots.txt の中身。すべてのページのクロールを許可し、sitemap の場所を示す。 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
}
