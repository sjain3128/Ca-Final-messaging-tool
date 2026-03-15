// sw.js — Service Worker for background push notifications
// Place this file in the PUBLIC folder (same level as index.html)

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

// Handle push notifications sent from Supabase Edge Function
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "CA Final Portal";
  const options = {
    body: data.body || "You have a new message",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "ca-portal-notif",
    renotify: true,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Clicking notification opens the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(event.notification.data.url || "/");
    })
  );
});

// Background sync — poll for new messages every 30s when app is closed
// Uses periodic background sync if available, falls back to message-based polling
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "ca-poll") {
    event.waitUntil(pollForNewMessages());
  }
});

async function pollForNewMessages() {
  try {
    const cache = await caches.open("ca-poll-state");
    const stateResp = await cache.match("state");
    const state = stateResp ? await stateResp.json() : {};

    if (!state.supabaseUrl || !state.anonKey) return;

    const headers = {
      apikey: state.anonKey,
      Authorization: `Bearer ${state.anonKey}`,
    };

    // Check for new mentor messages for student
    if (state.role === "student" && state.messageId) {
      const url = `${state.supabaseUrl}/rest/v1/thread_messages?message_id=eq.${state.messageId}&sender=eq.mentor&order=created_at.desc&limit=1`;
      const res = await fetch(url, { headers });
      const rows = await res.json();
      if (rows.length > 0 && rows[0].created_at !== state.lastMentorMsgAt) {
        await self.registration.showNotification("New reply from your mentor 📩", {
          body: rows[0].text || "Voice/file message",
          icon: "/icon-192.png",
          tag: "mentor-reply",
          data: { url: "/" },
        });
        state.lastMentorMsgAt = rows[0].created_at;
        await cache.put("state", new Response(JSON.stringify(state)));
      }
    }

    // Check for new student messages for mentor
    if (state.role === "mentor") {
      const url = `${state.supabaseUrl}/rest/v1/messages?status=eq.Unread&order=created_at.desc&limit=1`;
      const res = await fetch(url, { headers });
      const rows = await res.json();
      if (rows.length > 0 && rows[0].created_at !== state.lastStudentMsgAt) {
        await self.registration.showNotification(`New message from ${rows[0].student_name || "a student"} 📬`, {
          body: rows[0].message || "New message received",
          icon: "/icon-192.png",
          tag: "student-msg",
          data: { url: "/" },
        });
        state.lastStudentMsgAt = rows[0].created_at;
        await cache.put("state", new Response(JSON.stringify(state)));
      }
    }
  } catch (e) {
    console.warn("SW poll error:", e);
  }
}

// Listen for state updates from the app
self.addEventListener("message", async (event) => {
  if (event.data?.type === "UPDATE_STATE") {
    const cache = await caches.open("ca-poll-state");
    await cache.put("state", new Response(JSON.stringify(event.data.state)));
  }
  if (event.data?.type === "POLL_NOW") {
    await pollForNewMessages();
  }
});
