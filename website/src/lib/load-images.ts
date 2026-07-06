// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Image preloader. Generic React/UI game code — lives in website/src/lib/ so
// it can be extracted into oss-framework once mature.

/** Load a record of name → URL into name → decoded HTMLImageElement. */
export async function loadImages<K extends string>(
  urls: Record<K, string>,
): Promise<Record<K, HTMLImageElement>> {
  const entries = await Promise.all(
    (Object.entries(urls) as [K, string][]).map(async ([name, url]) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return [name, image] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<K, HTMLImageElement>;
}
