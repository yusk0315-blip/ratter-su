/* sw.js - PWA Service Worker */
const CACHE_NAME = "ratter-su-v1";

// 先にキャッシュしたい最低限（存在しないファイルがあっても失敗しないようにしています）
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./sw.js",
  "./icon-192.png",
  "./icon-512.png"
];

// インストール：事前キャッシュ
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // addAll だと1つでも404で全部失敗するので、1件ずつ安全に追加
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (e) {
            // 404などは無視（例：icon-512.png 未作成でも動く）
          }
        })
      );

      self.skipWaiting();
    })()
  );
});

// アクティベート：古いキャッシュ削除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null))
      );
      self.clients.claim();
    })()
  );
});

// 取得戦略：
// - HTMLナビゲーションは「ネット優先（ダメならキャッシュ）」
// - それ以外のGETは「キャッシュ優先＋裏で更新（stale-while-revalidate）」
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // GET以外は触らない
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 同一オリジンのみ処理（GitHub Pages等でもOK）
  if (url.origin !== self.location.origin) return;

  // ページ遷移（アドレスバーから開く/再読み込み等）
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put("./index.html", fresh.clone()); // 常に最新を保持
          return fresh;
        } catch (e) {
          const cached = await caches.match("./index.html");
          return cached || new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  // 静的ファイル：キャッシュ優先＋更新
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const cache = await caches.open(CACHE_NAME);

      const fetchPromise = fetch(req)
        .then((fresh) => {
          cache.put(req, fresh.clone());
          return fresh;
        })
        .catch(() => null);

      // キャッシュがあれば即返し、裏で更新
      if (cached) {
        fetchPromise; // no-wait
        return cached;
      }

      // キャッシュがなければネット
      const fresh = await fetchPromise;
      return fresh || new Response("Offline", { status: 503 });
    })()
  );
});
