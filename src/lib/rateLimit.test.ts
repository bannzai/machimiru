import { describe, expect, it } from "vitest";
import { clientKeyOfRequest, createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  it("呼び出し元ごとに時間枠の中で limit 回まで許し、枠を過ぎると数え直す", () => {
    const isAllowed = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect([isAllowed("a", 0), isAllowed("a", 10), isAllowed("a", 20)]).toEqual([true, true, false]);
    // 別の呼び出し元は別に数える
    expect(isAllowed("b", 30)).toBe(true);
    // a の枠 (0〜999) を過ぎた
    expect(isAllowed("a", 1000)).toBe(true);
  });
});

describe("clientKeyOfRequest", () => {
  it.each([
    [{ "cf-connecting-ip": "203.0.113.1", "x-forwarded-for": "198.51.100.1" }, "203.0.113.1"],
    [{ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }, "198.51.100.1"],
    [{}, "unknown"],
  ])("%j の呼び出し元は %s", (headers, expected) => {
    expect(clientKeyOfRequest(new Request("http://localhost/api/conditions/", { headers }))).toBe(expected);
  });
});
