/* This worker deliberately does not cache authenticated pages or API data. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    /* Show a neutral fallback. */
  }
  event.waitUntil(
    self.registration.showNotification("SchwesterLib", {
      body:
        typeof data.body === "string"
          ? data.body
          : "Es gibt eine neue Mitteilung. Öffne SchwesterLib für die Details.",
      icon: "/icon-192.png",
      tag: typeof data.tag === "string" ? data.tag : "schwesterlib",
      data: { url: "/dashboard" },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = new URL("/dashboard", self.location.origin).href;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.navigate(url);
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
