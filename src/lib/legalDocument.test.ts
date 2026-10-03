import { describe, expect, it } from "vitest";
import { renderLegalDocument } from "./legalDocument";
import { contactEmail } from "./site";

describe("renderLegalDocument", () => {
  it.each([
    ["terms", "利用規約"],
    ["privacy", "プライバシーポリシー"],
  ] as const)("%s を見出しと問い合わせ先つきの HTML にする", async (name, heading) => {
    const html = await renderLegalDocument(name);
    expect(html).toContain(`<h1>${heading}</h1>`);
    expect(html).toContain(contactEmail);
  });
});
