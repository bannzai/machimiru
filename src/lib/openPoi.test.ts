import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openPoiSearchLimit, openPoiSearchTimeoutMs, openPoiSearchUrl, searchOpenPoi } from "./openPoi";

// 2026-10-05 に三鷹駅周辺 (bbox=139.5546,35.6967,139.5666,35.7087) を「公園」で検索した実際の応答。e2e の撮影でも使う
const parkResponse = JSON.parse(
  readFileSync(path.join(process.cwd(), "e2e", "fixtures", "openpoi", "park.json"), "utf8"),
) as { count: number; results: Record<string, unknown>[] };

const mitakaStationBoundingBox: [number, number, number, number] = [139.5546, 35.6967, 139.5666, 35.7087];

/** fetch を、body を status で返すものに置き換え、呼ばれた URL を記録するモックを返す。 */
function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openPoiSearchUrl", () => {
  it("キーワード・小数 5 桁の bbox・件数の上限を渡す", () => {
    const url = new URL(openPoiSearchUrl("公園", [139.554600001, 35.6967, 139.5666, 35.7087]));
    expect(url.origin + url.pathname).toBe("https://api.openpoiapi.com/v1/search");
    expect(url.searchParams.get("q")).toBe("公園");
    expect(url.searchParams.get("bbox")).toBe("139.55460,35.69670,139.56660,35.70870");
    expect(url.searchParams.get("limit")).toBe(String(openPoiSearchLimit));
  });

  it("経度・緯度の範囲を超えた bbox (世界規模まで縮小した地図) を範囲に収める", () => {
    const url = new URL(openPoiSearchUrl("公園", [-250, -95, 400, 95]));
    expect(url.searchParams.get("bbox")).toBe("-180.00000,-90.00000,180.00000,90.00000");
  });
});

describe("searchOpenPoi", () => {
  it("応答の施設を、ライセンスと帰属表示を含めてそのまま返す", async () => {
    const fetchMock = stubFetch(200, parkResponse);
    const { facilities, isTruncated } = await searchOpenPoi("公園", mitakaStationBoundingBox);
    expect(fetchMock).toHaveBeenCalledWith(
      openPoiSearchUrl("公園", mitakaStationBoundingBox),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(facilities).toHaveLength(parkResponse.results.length);
    expect(facilities[0]).toEqual(parkResponse.results[0]);
    expect(facilities.every((facility) => facility.licenses.length > 0 && facility.attributions.length > 0)).toBe(true);
    expect(isTruncated).toBe(false);
  });

  it("座標の無い施設 (lat・lng が空文字) を除く", async () => {
    stubFetch(200, {
      count: 2,
      results: [{ ...parkResponse.results[0], lat: "", lng: "" }, parkResponse.results[1]],
    });
    const { facilities } = await searchOpenPoi("公園", mitakaStationBoundingBox);
    expect(facilities).toEqual([parkResponse.results[1]]);
  });

  it("件数が上限に達した時は isTruncated を返す", async () => {
    stubFetch(200, { ...parkResponse, count: openPoiSearchLimit });
    expect((await searchOpenPoi("公園", mitakaStationBoundingBox)).isTruncated).toBe(true);
  });

  it("HTTP のエラーは状態コードを含めて例外にする", async () => {
    stubFetch(429, { message: "Too Many Requests" });
    await expect(searchOpenPoi("公園", mitakaStationBoundingBox)).rejects.toThrow("HTTP 429");
  });

  it("応答が無いまま待つ時間を過ぎた時は、待った秒数を含めて例外にする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        throw new DOMException("signal timed out", "TimeoutError");
      }),
    );
    await expect(searchOpenPoi("公園", mitakaStationBoundingBox)).rejects.toThrow(
      `${openPoiSearchTimeoutMs / 1000} 秒待っても応答がありませんでした`,
    );
  });

  it("通信の失敗は短い文言の例外にする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(searchOpenPoi("公園", mitakaStationBoundingBox)).rejects.toThrow("通信に失敗しました");
  });

  it("形式の合わない応答は例外にする", async () => {
    stubFetch(200, { results: "unexpected" });
    await expect(searchOpenPoi("公園", mitakaStationBoundingBox)).rejects.toThrow("応答の形式が想定と違います");
  });
});
