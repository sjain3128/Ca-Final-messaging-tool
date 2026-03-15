import React, { useEffect, useRef, useState, useCallback } from "react";

// ── Supabase ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://xzpvciyypdkysiyiqyhs.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6cHZjaXl5cGRreXNpeWlxeWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NzEzNzIsImV4cCI6MjA4OTA0NzM3Mn0.9Hee31MysL6VxJh9iDaFMBQGbduCChpy8J92mFQFnMM";

const sbH = {
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Prefer: "return=representation",
};

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts, headers: { ...sbH, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  const t = await res.text();
  return t ? JSON.parse(t) : [];
}

const fetchMessages = () => sbFetch("/messages?select=*&order=created_at.desc");
const fetchThread   = (mid) => sbFetch(`/thread_messages?message_id=eq.${mid}&select=*&order=created_at.asc`);
const insertMessage = (p) => sbFetch("/messages", { method: "POST", body: JSON.stringify(p) }).then(r => r[0]);
const insertThread  = (p) => sbFetch("/thread_messages", { method: "POST", body: JSON.stringify(p) }).then(r => r[0]);
const markReplied     = (id) => sbFetch(`/messages?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "Replied" }) });
const deleteMessage   = (id) => sbFetch(`/messages?id=eq.${id}`, { method: "DELETE" });
const deleteThread    = (mid) => sbFetch(`/thread_messages?message_id=eq.${mid}`, { method: "DELETE" });

async function uploadAudio(blob, filename) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/audio-notes/${filename}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": blob.type || "audio/webm",
    },
    body: blob,
  });
  if (!res.ok) throw new Error("Audio upload failed");
  return `${SUPABASE_URL}/storage/v1/object/public/audio-notes/${filename}`;
}

async function uploadFile(file, filename) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/audio-notes/${filename}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!res.ok) throw new Error("File upload failed");
  return `${SUPABASE_URL}/storage/v1/object/public/audio-notes/${filename}`;
}

// ── FIX #1 — Attempt options auto-filtered by current date ───────────────────
function getAttempts() {
  const now = new Date();
  const options = [];
  for (let yr = 2026; yr <= 2030; yr++) {
    const y = String(yr).slice(2);
    // May attempt — hide after 1 June of that year
    if (now < new Date(`${yr}-06-01`)) options.push(`May ${y}`);
    // Sept attempt — hide after 1 Oct of that year
    if (now < new Date(`${yr}-10-01`)) options.push(`Sept ${y}`);
    // Jan attempt of next year — hide after 1 Feb of next year
    if (now < new Date(`${yr + 1}-02-01`)) options.push(`Jan ${yr + 1 - 2000}`);
  }
  return options.length ? options : ["May 26"];
}

// ── Inbox password ────────────────────────────────────────────────────────────
const INBOX_PASSWORD   = "cafinal2026";
const LOCK_SESSION_KEY = "ca-inbox-unlocked";
const MAX_LOCK_TRIES   = 5;
const LOCKOUT_MS       = 5 * 60 * 1000;

// ── Utilities ─────────────────────────────────────────────────────────────────
const MAX_FILE_MB = 50; // increased to 50 MB for PDFs and large files
const STUDENT_SESSION_KEY = "ca-student-session";

function timeLabel(iso) {
  const d = iso ? new Date(iso) : new Date();
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function formatBytes(b) {
  if (!b) return "";
  const s = ["B","KB","MB"];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), 2);
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${s[i]}`;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const Icons = {
  Send:      () => <Icon d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />,
  Mic:       () => <Icon d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />,
  Stop:      () => <Icon d="M3 3h18v18H3z" />,
  Attach:    () => <Icon d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.42 16.41a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
  Inbox:     () => <Icon d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 17.76 4H6.24a2 2 0 0 0-1.79 1.11z" />,
  Lock:      () => <Icon d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />,
  Shield:    () => <Icon d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  File:      () => <Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" />,
  Image:     () => <Icon d="M21 15l-5-5L5 21M21 3H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />,
  Search:    () => <Icon d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />,
  Check:     () => <Icon d="M20 6L9 17l-5-5" />,
  Trash:     () => <Icon d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />,
  Refresh:   () => <Icon d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />,
  Headphone: () => <Icon d="M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />,
  Eye:       () => <Icon d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />,
  EyeOff:    () => <Icon d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />,
  LogOut:    () => <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
};

// ── CSS ───────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  :root {
    --ink:#0f172a; --ink2:#475569; --ink3:#94a3b8;
    --surface:#fff; --surface2:#f8fafc; --surface3:#f1f5f9; --border:#e2e8f0;
    --accent:#1d4ed8; --accent2:#3b82f6;
    --green:#16a34a; --green-bg:#dcfce7;
    --amber:#d97706; --amber-bg:#fef3c7;
    --red:#dc2626; --red-bg:#fee2e2;
    --radius:16px; --radius-sm:10px;
    --shadow:0 1px 3px rgba(0,0,0,.07),0 4px 16px rgba(0,0,0,.06);
    --shadow-lg:0 8px 32px rgba(0,0,0,.10);
  }
  body { font-family:'DM Sans',sans-serif; background:#f0f4f8; color:var(--ink); }
  .portal-root { min-height:100vh; padding:32px 20px; }
  .main { max-width:1100px; margin:0 auto; display:flex; flex-direction:column; gap:24px; }

  .header { max-width:1100px; margin:0 auto 32px; display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:12px; }
  .header-title { font-family:'DM Serif Display',serif; font-size:clamp(22px,4vw,32px); line-height:1.2; }
  .header-sub { font-size:13px; color:var(--ink2); margin-top:4px; }

  .badge { display:inline-flex; align-items:center; gap:5px; padding:4px 12px; border-radius:999px; font-size:12px; font-weight:500; }
  .badge-green { background:var(--green-bg); color:var(--green); }
  .badge-blue  { background:#dbeafe; color:var(--accent); }
  .badge-gray  { background:var(--surface3); color:var(--ink2); }
  .badge-amber { background:var(--amber-bg); color:var(--amber); }
  .badge-red   { background:var(--red-bg); color:var(--red); }

  .hero-grid { display:grid; grid-template-columns:1.3fr 0.7fr; gap:20px; }
  @media(max-width:768px){ .hero-grid{ grid-template-columns:1fr; } }
  .card { background:var(--surface); border-radius:var(--radius); box-shadow:var(--shadow); overflow:hidden; }
  .card-dark { background:#0f172a; color:white; }
  .card-body { padding:32px; }
  .card-body-sm { padding:24px; }
  .hero-headline { font-family:'DM Serif Display',serif; font-size:clamp(20px,3vw,28px); line-height:1.35; color:white; margin:16px 0 12px; }
  .hero-sub { font-size:14px; color:#94a3b8; line-height:1.6; }
  .hero-features { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:24px; }
  @media(max-width:600px){ .hero-features{ grid-template-columns:1fr; } }
  .hero-feat { background:rgba(255,255,255,.07); border-radius:var(--radius-sm); padding:14px; }
  .hero-feat-title { font-size:13px; font-weight:600; display:flex; align-items:center; gap:6px; color:white; }
  .hero-feat-desc { font-size:12px; color:#94a3b8; margin-top:6px; line-height:1.5; }
  .stats-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:16px; }
  .stat-box { background:var(--surface2); border-radius:var(--radius-sm); padding:14px; }
  .stat-num { font-family:'DM Serif Display',serif; font-size:26px; }
  .stat-label { font-size:12px; color:var(--ink2); margin-top:2px; }

  .tabs-bar { display:flex; gap:4px; background:var(--surface3); border-radius:12px; padding:4px; width:fit-content; }
  .tab-btn { padding:8px 20px; border-radius:9px; border:none; background:transparent; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:500; color:var(--ink2); cursor:pointer; transition:all .15s; display:flex; align-items:center; gap:6px; }
  .tab-btn.active { background:var(--surface); color:var(--ink); box-shadow:0 1px 4px rgba(0,0,0,.1); }

  .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media(max-width:600px){ .form-grid{ grid-template-columns:1fr; } }
  .field { display:flex; flex-direction:column; gap:6px; }
  .label { font-size:13px; font-weight:500; color:var(--ink); }
  .input,.select,.textarea { font-family:'DM Sans',sans-serif; font-size:14px; color:var(--ink); background:var(--surface2); border:1.5px solid var(--border); border-radius:var(--radius-sm); padding:10px 14px; outline:none; transition:border-color .15s; width:100%; }
  .input:focus,.select:focus,.textarea:focus { border-color:var(--accent2); background:white; }
  .textarea { resize:vertical; min-height:90px; line-height:1.6; }

  .btn { display:inline-flex; align-items:center; gap:7px; padding:10px 20px; border-radius:var(--radius-sm); border:none; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:500; cursor:pointer; transition:all .15s; }
  .btn-primary { background:var(--accent); color:white; }
  .btn-primary:hover { background:#1e40af; }
  .btn-primary:disabled { opacity:.5; cursor:not-allowed; }
  .btn-outline { background:white; color:var(--ink); border:1.5px solid var(--border); }
  .btn-outline:hover { border-color:var(--ink3); background:var(--surface2); }
  .btn-danger { background:var(--red-bg); color:var(--red); border:none; }
  .btn-danger:hover { background:#fca5a5; }
  .btn-ghost { background:transparent; color:var(--ink2); border:none; padding:6px 8px; }
  .btn-ghost:hover { background:var(--surface3); }

  .attach-row { display:flex; align-items:center; justify-content:space-between; gap:8px; background:var(--surface2); border:1.5px solid var(--border); border-radius:var(--radius-sm); padding:10px 14px; }
  .audio-player { width:100%; margin-top:6px; height:36px; border-radius:8px; }
  .image-preview { width:100%; max-height:160px; object-fit:cover; border-radius:8px; margin-top:6px; }
  .rec-dot { width:8px; height:8px; border-radius:50%; background:var(--red); animation:blink 1s infinite; display:inline-block; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }

  /* inbox */
  .inbox-layout { display:grid; grid-template-columns:340px 1fr; gap:20px; align-items:start; }
  @media(max-width:900px){ .inbox-layout{ grid-template-columns:1fr; } }
  .convo-list { display:flex; flex-direction:column; gap:6px; max-height:600px; overflow-y:auto; }
  .convo-item { display:flex; align-items:flex-start; gap:10px; padding:14px; border-radius:var(--radius-sm); border:1.5px solid var(--border); background:white; cursor:pointer; transition:all .15s; text-align:left; width:100%; }
  .convo-item:hover { border-color:var(--accent2); }
  .convo-item.active { background:#0f172a; border-color:#0f172a; color:white; }
  .convo-item.active .convo-sub { color:#94a3b8; }
  .convo-avatar { width:38px; height:38px; border-radius:50%; background:var(--accent2); color:white; display:flex; align-items:center; justify-content:center; font-weight:600; font-size:15px; flex-shrink:0; }
  .convo-name { font-weight:600; font-size:14px; }
  .convo-sub { font-size:12px; color:var(--ink2); margin-top:2px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .convo-meta { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
  .convo-time { font-size:11px; color:var(--ink3); white-space:nowrap; margin-left:auto; }

  /* chat thread */
  .chat-thread { height:400px; overflow-y:auto; padding:16px 40px; background:var(--surface2); display:flex; flex-direction:column; gap:12px; }
  .msg-row { display:flex; flex-direction:column; }
  .msg-row.mine { align-items:flex-end; }
  .msg-row.theirs { align-items:flex-start; }
  .msg-sender { font-size:11px; font-weight:600; color:var(--ink3); margin-bottom:3px; padding:0 4px; }
  .bubble { max-width:80%; padding:10px 14px; border-radius:14px; font-size:13px; line-height:1.6; word-break:break-word; }
  .bubble-student { background:white; border:1.5px solid var(--border); }
  .bubble-you { background:#0f172a; color:white; }
  .bubble-time { font-size:11px; margin-top:4px; opacity:.5; }

  /* reply bar */
  .reply-bar { display:flex; align-items:flex-end; gap:8px; padding:12px 16px; border-top:1.5px solid var(--border); background:white; }
  .reply-input { flex:1; font-family:'DM Sans',sans-serif; font-size:14px; color:var(--ink); background:var(--surface2); border:1.5px solid var(--border); border-radius:var(--radius-sm); padding:10px 14px; outline:none; resize:none; min-height:42px; max-height:120px; line-height:1.5; transition:border-color .15s; }
  .reply-input:focus { border-color:var(--accent2); background:white; }
  .send-btn { width:42px; height:42px; border-radius:50%; background:var(--accent); color:white; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .15s; }
  .send-btn:hover { background:#1e40af; }
  .send-btn:disabled { opacity:.5; cursor:not-allowed; }

  /* student live chat */
  .student-chat { display:flex; flex-direction:column; height:calc(100vh - 300px); min-height:480px; background:var(--surface); border-radius:var(--radius); box-shadow:var(--shadow); overflow:hidden; }
  .student-chat-header { padding:16px 20px; background:#0f172a; color:white; display:flex; align-items:center; gap:12px; }
  .student-chat-messages { flex:1; overflow-y:auto; padding:16px 40px; background:var(--surface2); display:flex; flex-direction:column; gap:12px; }

  /* toast */
  .toast { position:fixed; bottom:24px; right:24px; padding:12px 20px; border-radius:var(--radius-sm); font-size:14px; font-weight:500; box-shadow:var(--shadow-lg); z-index:999; animation:slideup .3s ease; }
  .toast-success { background:#0f172a; color:white; }
  .toast-error { background:var(--red); color:white; }
  @keyframes slideup { from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1} }
  .spinner { width:18px; height:18px; border:2px solid rgba(255,255,255,.3); border-top-color:white; border-radius:50%; animation:spin .7s linear infinite; }
  @keyframes spin { to{ transform:rotate(360deg); } }

  .search-wrap { position:relative; }
  .search-icon { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--ink3); pointer-events:none; }
  .search-input { padding-left:36px !important; }
  .empty { padding:48px 24px; text-align:center; color:var(--ink2); font-size:14px; }

  /* lock */
  .lock-overlay { display:flex; align-items:center; justify-content:center; min-height:420px; }
  .lock-card { background:var(--surface); border-radius:var(--radius); box-shadow:var(--shadow-lg); padding:48px 40px; max-width:400px; width:100%; text-align:center; }
  .lock-icon-ring { width:72px; height:72px; border-radius:50%; background:#0f172a; display:flex; align-items:center; justify-content:center; margin:0 auto 20px; color:white; }
  .lock-title { font-family:'DM Serif Display',serif; font-size:24px; color:var(--ink); margin-bottom:6px; }
  .lock-sub { font-size:13px; color:var(--ink2); margin-bottom:28px; line-height:1.6; }
  .lock-input-wrap { position:relative; margin-bottom:4px; }
  .lock-input { width:100%; padding:13px 44px 13px 16px; border:2px solid var(--border); border-radius:var(--radius-sm); font-family:'DM Sans',sans-serif; font-size:15px; color:var(--ink); background:var(--surface2); outline:none; text-align:center; letter-spacing:3px; transition:border-color .15s,background .15s; }
  .lock-input::placeholder { letter-spacing:1px; }
  .lock-input:focus { border-color:var(--accent2); background:white; }
  .lock-input.shake { animation:shake .35s ease; border-color:var(--red)!important; background:var(--red-bg)!important; }
  .lock-toggle { position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:var(--ink3); padding:4px; display:flex; align-items:center; }
  .lock-btn { width:100%; padding:13px; background:#0f172a; color:white; border:none; border-radius:var(--radius-sm); font-family:'DM Sans',sans-serif; font-size:15px; font-weight:600; cursor:pointer; transition:background .15s; margin-top:12px; }
  .lock-btn:hover { background:#1e293b; }
  .lock-btn:disabled { opacity:.5; cursor:not-allowed; }
  .lock-error { font-size:13px; color:var(--red); font-weight:500; margin-top:10px; min-height:18px; }
  .lock-hint { font-size:12px; color:var(--ink3); margin-top:20px; line-height:1.6; }
  .attempts-left { display:inline-block; background:var(--amber-bg); color:var(--amber); border-radius:999px; padding:2px 10px; font-size:12px; font-weight:600; margin-top:8px; }
  @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-9px)} 40%{transform:translateX(9px)} 60%{transform:translateX(-6px)} 80%{transform:translateX(5px)} }
  .unlock-banner { display:flex; align-items:center; justify-content:space-between; gap:12px; background:#0f172a; color:white; border-radius:var(--radius-sm); padding:10px 16px; margin-bottom:16px; font-size:13px; flex-wrap:wrap; }
  .unlock-banner-left { display:flex; align-items:center; gap:8px; }
  .lock-out-screen { display:flex; align-items:center; justify-content:center; min-height:420px; }
  .lock-out-card { background:var(--red-bg); border:1.5px solid #fca5a5; border-radius:var(--radius); padding:40px 32px; max-width:380px; width:100%; text-align:center; }
  .lock-out-title { font-family:'DM Serif Display',serif; font-size:22px; color:var(--red); margin:16px 0 8px; }
  .lock-out-sub { font-size:13px; color:#991b1b; line-height:1.6; }

  .success-box { text-align:center; padding:48px 32px; }
  .success-icon { width:56px; height:56px; background:var(--green-bg); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; color:var(--green); }
  hr { border:none; border-top:1px solid var(--border); margin:20px 0; }
  .error-text { font-size:13px; color:var(--red); font-weight:500; }
  .flex { display:flex; } .flex-wrap { flex-wrap:wrap; } .items-center { align-items:center; }
  .gap-8{gap:8px} .gap-12{gap:12px}
  .mt-4{margin-top:4px} .mt-8{margin-top:8px} .mt-12{margin-top:12px}
  .mt-16{margin-top:16px} .mt-20{margin-top:20px} .mt-24{margin-top:24px}
  .text-sm{font-size:13px} .text-xs{font-size:12px}
  .text-muted{color:var(--ink2)} .font-semibold{font-weight:600}
`;

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return <div className={`toast toast-${type}`}>{msg}</div>;
}

// ── Quote preview (shown inside bubble when replying to a message) ────────────
function QuotePreview({ quoted, isMine }) {
  if (!quoted) return null;
  const label = quoted.sender === "mentor" ? "You" : (quoted.sender_label || "Student");
  const preview = quoted.text
    ? quoted.text.slice(0, 80) + (quoted.text.length > 80 ? "…" : "")
    : quoted.audio_url ? "🎤 Voice note"
    : quoted.image_url ? "🖼 Image"
    : quoted.file_url  ? "📄 File"
    : "Message";
  return (
    <div style={{
      borderLeft: `3px solid ${isMine ? "rgba(255,255,255,.5)" : "var(--accent2)"}`,
      paddingLeft: 8, marginBottom: 6,
      background: isMine ? "rgba(255,255,255,.1)" : "var(--surface3)",
      borderRadius: "0 6px 6px 0", padding: "5px 8px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: isMine ? "#93c5fd" : "var(--accent)", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, opacity: .8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {preview}
      </div>
    </div>
  );
}

// ── Message Bubble with swipe-to-reply ────────────────────────────────────────
function MsgBubble({ msg, isMine, onReply, allMsgs }) {
  const isPdf    = msg.file_url && msg.file_url.toLowerCase().includes(".pdf");
  const touchRef = useRef(null);
  const rowRef   = useRef(null);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);

  // Find quoted message object
  const quoted = msg.reply_to_id ? allMsgs?.find(m => m.id === msg.reply_to_id) : null;

  // ── Touch swipe (mobile) ──
  const onTouchStart = (e) => {
    touchRef.current = { x: e.touches[0].clientX, triggered: false };
    setSwiping(true);
  };
  const onTouchMove = (e) => {
    if (!touchRef.current) return;
    const dx = e.touches[0].clientX - touchRef.current.x;
    // swipe right on "theirs", swipe left on "mine" — both trigger reply
    const dir = isMine ? -1 : 1;
    const clamped = Math.max(0, Math.min(60, dx * dir));
    setSwipeX(clamped * dir);
    if (clamped > 40 && !touchRef.current.triggered) {
      touchRef.current.triggered = true;
      if (navigator.vibrate) navigator.vibrate(30);
      onReply(msg);
    }
  };
  const onTouchEnd = () => {
    setSwipeX(0); setSwiping(false); touchRef.current = null;
  };

  // ── Mouse hover reply button (desktop) ──
  const [hovered, setHovered] = useState(false);

  return (
    <div
      ref={rowRef}
      className={`msg-row ${isMine ? "mine" : "theirs"}`}
      style={{ position: "relative", paddingLeft: isMine ? 0 : 36, paddingRight: isMine ? 36 : 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="msg-sender">{isMine ? "You" : (msg.sender_label || "Student")}</div>

      {/* Reply button — left side for "theirs", right side for "mine" */}
      <button
        onClick={() => onReply(msg)}
        title="Reply to this message"
        style={{
          position: "absolute",
          top: "50%",
          transform: "translateY(-50%)",
          ...(isMine ? { right: 0 } : { left: 0 }),
          background: hovered ? "var(--surface3)" : "transparent",
          border: hovered ? "1.5px solid var(--border)" : "1.5px solid transparent",
          borderRadius: "50%",
          width: 28, height: 28,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
          color: hovered ? "var(--accent2)" : "transparent",
          transition: "all .15s",
          zIndex: 2,
          flexShrink: 0,
        }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" />
          <path d="M13 21l-4-4 4-4" />
          <path d="M9 17h8a2 2 0 0 0 2-2v-3" />
        </svg>
      </button>

      <div
        className={`bubble ${isMine ? "bubble-you" : "bubble-student"}`}
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? "none" : "transform .2s ease",
        }}
      >
        {/* Quoted message preview */}
        {quoted && <QuotePreview quoted={quoted} isMine={isMine} />}

        {msg.text && <div>{msg.text}</div>}
        {msg.audio_url && (
          <audio controls src={msg.audio_url}
            style={{ width: 220, height: 34, marginTop: msg.text ? 8 : 0, display: "block" }} />
        )}
        {msg.image_url && (
          <img src={msg.image_url} alt="attachment"
            style={{ maxWidth: 220, borderRadius: 8, marginTop: msg.text ? 8 : 0, display: "block" }} />
        )}
        {msg.file_url && (
          <a href={msg.file_url} target="_blank" rel="noreferrer" download
            style={{
              display: "flex", alignItems: "center", gap: 8, marginTop: msg.text ? 8 : 0,
              background: isMine ? "rgba(255,255,255,.12)" : "var(--surface3)",
              border: `1px solid ${isMine ? "rgba(255,255,255,.2)" : "var(--border)"}`,
              borderRadius: 8, padding: "8px 12px", textDecoration: "none",
              color: isMine ? "white" : "var(--accent)", fontSize: 13, fontWeight: 500,
            }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d={isPdf
                ? "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6M9 9h1"
                : "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"} />
            </svg>
            {isPdf ? "Download PDF" : "Download file"}
          </a>
        )}
        <div className="bubble-time">{timeLabel(msg.created_at)}</div>
      </div>
    </div>
  );
}

// ── Reply preview bar (shown above input when replying to a message) ──────────
function ReplyBar({ replyTo, onCancel, allMsgs }) {
  if (!replyTo) return null;
  const label = replyTo.sender === "mentor" ? "You" : (replyTo.sender_label || "Student");
  const preview = replyTo.text
    ? replyTo.text.slice(0, 100)
    : replyTo.audio_url ? "🎤 Voice note"
    : replyTo.image_url ? "🖼 Image"
    : replyTo.file_url  ? "📄 File"
    : "Message";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 14px", background: "#f0f7ff",
      borderTop: "1.5px solid var(--accent2)",
      borderLeft: "4px solid var(--accent2)",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", marginBottom: 2 }}>
          Replying to {label}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {preview}
        </div>
      </div>
      <button onClick={onCancel}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink3)",
          fontSize: 18, lineHeight: 1, padding: "2px 4px", flexShrink: 0 }}>
        ×
      </button>
    </div>
  );
}

// ── STUDENT PORTAL (router between form and chat) ─────────────────────────────
function StudentPortal({ onToast }) {
  const [session, setSession] = useState(() => {
    try { const s = sessionStorage.getItem(STUDENT_SESSION_KEY); return s ? JSON.parse(s) : null; }
    catch { return null; }
  });

  if (session) {
    return <StudentChat session={session} onToast={onToast}
      onEnd={() => { sessionStorage.removeItem(STUDENT_SESSION_KEY); setSession(null); }} />;
  }
  return <StudentForm onToast={onToast} onSession={(s) => {
    sessionStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(s));
    setSession(s);
  }} />;
}

// ── STUDENT FORM (first message) ──────────────────────────────────────────────
function StudentForm({ onToast, onSession }) {
  const attempts = getAttempts();
  const [name, setName]       = useState("");
  const [attempt, setAttempt] = useState(attempts[0] || "");
  const [topic, setTopic]     = useState("Preparation strategy");
  const [message, setMessage] = useState("");
  const [atts, setAtts]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [isRec, setIsRec]     = useState(false);
  const recRef  = useRef(null);
  const chunks  = useRef([]);
  const fileRef = useRef(null);

  const addFile = (e) => {
    const files = Array.from(e.target.files || []);
    const big = files.find(f => f.size > MAX_FILE_MB * 1024 * 1024);
    if (big) { setError(`Each file must be under ${MAX_FILE_MB} MB`); return; }
    setAtts(p => [...p, ...files.map(f => ({
      id: `${Date.now()}-${f.name}`, name: f.name,
      kind: f.type.startsWith("image/") ? "image" : "file",
      size: formatBytes(f.size), url: URL.createObjectURL(f), file: f,
    }))]);
    setError(""); e.target.value = "";
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        setAtts(p => [...p, {
          id: `${Date.now()}-voice`, name: `voice-${Date.now()}.webm`,
          kind: "audio", size: "Voice note", url: URL.createObjectURL(blob), file: blob,
        }]);
        stream.getTracks().forEach(t => t.stop());
      };
      rec.start(); recRef.current = rec; setIsRec(true);
    } catch { setError("Microphone access denied. Upload an audio file instead."); }
  };

  const stopRec = () => { recRef.current?.stop(); recRef.current = null; setIsRec(false); };

  const submit = async () => {
    const hasAudio = atts.some(a => a.kind === "audio");
    const hasText  = message.trim().length > 0;
    // FIX #2: allow audio-only OR text-only OR both — just need at least one
    if (!hasText && !hasAudio && atts.length === 0) {
      setError("Please type a message, record a voice note, or attach a file.");
      return;
    }
    setError(""); setLoading(true);
    try {
      const hasFile = atts.some(a => a.kind !== "audio");
      let mode = "Text";
      if (hasAudio && hasFile) mode = "Voice Note + File";
      else if (hasAudio) mode = "Voice Note";
      else if (atts.length) mode = "Text + File";

      const row = await insertMessage({
        student_name: name.trim() || "Anonymous Student",
        attempt, topic, mode,
        message: hasText ? message.trim() : "(Voice/File message)",
        status: "Unread",
      });

      // Upload audio to Supabase Storage
      let audioUrl = null;
      const audioAtt = atts.find(a => a.kind === "audio");
      if (audioAtt) {
        try { audioUrl = await uploadAudio(audioAtt.file, audioAtt.name); } catch (e) { console.warn("Audio upload failed:", e); }
      }

      // Upload image to Supabase Storage
      let imageUrl = null;
      const imageAtt = atts.find(a => a.kind === "image");
      if (imageAtt) {
        try {
          const ext = imageAtt.name.split(".").pop();
          const fname = `img-${Date.now()}.${ext}`;
          imageUrl = await uploadFile(imageAtt.file, fname);
        } catch (e) { console.warn("Image upload failed:", e); }
      }

      // Upload other file to Supabase Storage
      let fileUrl = null;
      const fileAtt = atts.find(a => a.kind === "file");
      if (fileAtt) {
        try {
          const ext = fileAtt.name.split(".").pop();
          const fname = `file-${Date.now()}.${ext}`;
          fileUrl = await uploadFile(fileAtt.file, fname);
        } catch (e) { console.warn("File upload failed:", e); }
      }

      // Save first thread message
      await insertThread({
        message_id: row.id,
        sender: "student",
        sender_label: name.trim() || "Anonymous Student",
        text: hasText ? message.trim() : null,
        audio_url: audioUrl,
        image_url: imageUrl,
        file_url: fileUrl,
      });

      onToast("Message sent!", "success");
      onSession({ messageId: row.id, studentName: name.trim() || "Anonymous Student" });
    } catch (err) {
      console.error(err);
      setError("Failed to send. Please try again.");
      onToast("Send failed.", "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="card">
      <div className="card-body">
        <div className="flex items-center gap-8" style={{ marginBottom: 20 }}>
          <span className="badge badge-green"><Icons.Lock /> Private portal</span>
          <span className="badge badge-blue">No personal number shared</span>
        </div>

        <div className="form-grid">
          <div className="field">
            <label className="label">Your name (optional)</label>
            <input className="input" placeholder="e.g. Riya S. or leave blank"
              value={name} onChange={e => setName(e.target.value)} />
          </div>
          {/* FIX #1: dynamic attempt list */}
          <div className="field">
            <label className="label">CA Final attempt</label>
            <select className="select" value={attempt} onChange={e => setAttempt(e.target.value)}>
              {attempts.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Topic</label>
            <select className="select" value={topic} onChange={e => setTopic(e.target.value)}>
              {["Preparation strategy","DT doubt","IDT doubt","FR doubt","SFM doubt",
                "Audit doubt","Law doubt","Study plan","Previous attempt review","Other"]
                .map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Voice note (optional)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {!isRec
                ? <button className="btn btn-outline" onClick={startRec}><Icons.Mic /> Record</button>
                : <button className="btn btn-danger" onClick={stopRec}><Icons.Stop /> Stop</button>}
              {isRec && <><span className="rec-dot" /><span className="text-sm" style={{ color: "var(--red)" }}>Recording…</span></>}
            </div>
          </div>
        </div>

        {/* FIX #2: message is optional */}
        <div className="field mt-16">
          <label className="label">
            Your message
            <span className="text-muted" style={{ fontWeight: 400, marginLeft: 6 }}>
              (optional — you can send just a voice note)
            </span>
          </label>
          <textarea className="textarea"
            placeholder="Type your doubt here, or just send a voice note above…"
            value={message} onChange={e => setMessage(e.target.value)} />
        </div>

        {atts.length > 0 && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="label">Attachments</div>
            {atts.map(att => (
              <div key={att.id} className="attach-row">
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  {att.kind === "audio" ? <Icons.Mic /> : att.kind === "image" ? <Icons.Image /> : <Icons.File />}
                  <div style={{ minWidth: 0 }}>
                    <div className="text-sm font-semibold"
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</div>
                    {att.kind === "audio" && <audio controls src={att.url} className="audio-player" />}
                    {att.kind === "image" && <img src={att.url} alt={att.name} className="image-preview" />}
                    {att.kind === "file"  && <div className="text-xs text-muted">{att.size}</div>}
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={() => setAtts(p => p.filter(a => a.id !== att.id))}>
                  <Icons.Trash />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <div className="error-text mt-8">{error}</div>}

        <div className="flex flex-wrap gap-8 mt-20">
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? <span className="spinner" /> : <Icons.Send />}
            {loading ? "Sending…" : "Send privately"}
          </button>
          <button className="btn btn-outline" onClick={() => fileRef.current?.click()}>
            <Icons.Attach /> Attach PDF / file
          </button>
          <input ref={fileRef} type="file" multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" style={{ display: "none" }} onChange={addFile} />
        </div>
      </div>
    </div>
  );
}

// ── FIX #4 — STUDENT LIVE CHAT (continues after first message) ───────────────
function StudentChat({ session, onToast, onEnd }) {
  const [thread, setThread]     = useState([]);
  const [text, setText]         = useState("");
  const [sending, setSending]   = useState(false);
  const [isRec, setIsRec]       = useState(false);
  const [replyTo, setReplyTo]   = useState(null);
  const [stagedFile, setStagedFile] = useState(null); // { file, previewUrl, isImg, isPdf, name }
  const recRef = useRef(null);
  const chunks = useRef([]);
  const fileRef = useRef(null);
  const endRef  = useRef(null);

  const loadThread = useCallback(async () => {
    try { setThread(await fetchThread(session.messageId)); } catch {}
  }, [session.messageId]);

  useEffect(() => { loadThread(); }, [loadThread]);
  useEffect(() => { const id = setInterval(loadThread, 5000); return () => clearInterval(id); }, [loadThread]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread]);

  // Stage file instead of uploading immediately
  const stageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) { onToast(`Max ${MAX_FILE_MB} MB allowed`, "error"); return; }
    setStagedFile({
      file,
      previewUrl: URL.createObjectURL(file),
      isImg: file.type.startsWith("image/"),
      isPdf: file.type === "application/pdf",
      name: file.name,
      size: formatBytes(file.size),
    });
    e.target.value = "";
  };

  // Send text + staged file together
  const sendAll = async () => {
    const hasText = text.trim().length > 0;
    const hasFile = !!stagedFile;
    if (!hasText && !hasFile) return;
    setSending(true);
    try {
      let imageUrl = null, fileUrl = null;
      if (stagedFile) {
        onToast("Uploading… please wait ⏳", "success");
        const ext = stagedFile.name.split(".").pop();
        const fname = `student-file-${Date.now()}.${ext}`;
        const uploaded = await uploadFile(stagedFile.file, fname);
        if (stagedFile.isImg) imageUrl = uploaded;
        else fileUrl = uploaded;
      }
      const row = await insertThread({
        message_id: session.messageId, sender: "student",
        sender_label: session.studentName,
        text: hasText ? text.trim() : null,
        audio_url: null, image_url: imageUrl, file_url: fileUrl,
        reply_to_id: replyTo ? replyTo.id : null,
      });
      setThread(p => [...p, row]);
      setText(""); setStagedFile(null); setReplyTo(null);
      onToast(stagedFile ? (stagedFile.isPdf ? "PDF sent! ✅" : "File sent! ✅") : "", "success");
    } catch { onToast("Send failed. Try again.", "error"); }
    finally { setSending(false); }
  };

  const sendText = async () => {
    if (!text.trim() && !stagedFile) return;
    await sendAll();
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        setSending(true);
        try {
          const fname = `student-voice-${Date.now()}.webm`;
          const audioUrl = await uploadAudio(blob, fname);
          const row = await insertThread({
            message_id: session.messageId, sender: "student",
            sender_label: session.studentName, text: null,
            audio_url: audioUrl, image_url: null, file_url: null,
            reply_to_id: replyTo ? replyTo.id : null,
          });
          setThread(p => [...p, row]); setReplyTo(null);
          onToast("Voice note sent!", "success");
        } catch { onToast("Failed to send voice note", "error"); }
        finally { setSending(false); }
      };
      rec.start(); recRef.current = rec; setIsRec(true);
    } catch { onToast("Microphone access denied", "error"); }
  };

  const stopRec = () => { recRef.current?.stop(); recRef.current = null; setIsRec(false); };

  const canSend = text.trim().length > 0 || !!stagedFile;

  return (
    <div className="student-chat">
      <div className="student-chat-header">
        <div className="convo-avatar" style={{ background: "#334155" }}>
          {session.studentName[0].toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{session.studentName}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
            Your private conversation · mentor replies appear here every few seconds
          </div>
        </div>
        <button className="btn btn-ghost" style={{ color: "#94a3b8", fontSize: 12 }} onClick={onEnd}>
          New conversation
        </button>
      </div>

      <div className="student-chat-messages">
        {thread.length === 0 && (
          <div className="empty">Your message was sent! Waiting for a reply…</div>
        )}
        {thread.map(msg => (
          <MsgBubble key={msg.id} msg={msg} isMine={msg.sender === "student"}
            onReply={setReplyTo} allMsgs={thread} />
        ))}
        <div ref={endRef} />
      </div>

      {/* Staged file preview — shown above input bar */}
      {stagedFile && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 14px", background: "#f0f7ff",
          borderTop: "1.5px solid var(--accent2)",
        }}>
          <div style={{ fontSize: 13 }}>
            {stagedFile.isImg ? "🖼" : stagedFile.isPdf ? "📄" : "📎"}
          </div>
          {stagedFile.isImg && (
            <img src={stagedFile.previewUrl} alt="preview"
              style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {stagedFile.name}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink3)" }}>{stagedFile.size} · Ready to send</div>
          </div>
          <button onClick={() => setStagedFile(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink3)", fontSize: 18, padding: "2px 4px" }}>
            ×
          </button>
        </div>
      )}

      {/* Reply-to preview bar */}
      <ReplyBar replyTo={replyTo} onCancel={() => setReplyTo(null)} />

      {/* Input bar */}
      <div className="reply-bar">
        {!isRec
          ? <button className="btn btn-ghost" style={{ padding: 8, flexShrink: 0 }} onClick={startRec}
              title="Record voice note"><Icons.Mic /></button>
          : <button className="btn btn-danger" style={{ padding: 8, flexShrink: 0 }} onClick={stopRec}>
              <Icons.Stop />
            </button>}
        {isRec
          ? <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
              <span className="rec-dot" />
              <span className="text-sm" style={{ color: "var(--red)" }}>Recording… tap Stop to send</span>
            </div>
          : <textarea className="reply-input" rows={1}
              placeholder={stagedFile ? "Add a message with your file… (optional)" : "Continue the conversation… (Enter to send)"}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }}
            />
        }
        <button className="btn btn-ghost" style={{ padding: 8, flexShrink: 0 }}
          onClick={() => fileRef.current?.click()} title="Attach PDF or file"><Icons.Attach /></button>
        <input ref={fileRef} type="file"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
          style={{ display: "none" }} onChange={stageFile} />
        {!isRec && (
          <button className="send-btn" onClick={sendAll} disabled={sending || !canSend}>
            {sending ? <span className="spinner" /> : <Icons.Send />}
          </button>
        )}
      </div>
    </div>
  );
}

// ── INBOX LOCK ────────────────────────────────────────────────────────────────
function InboxLock({ onUnlock }) {
  const [pw, setPw]     = useState("");
  const [show, setShow] = useState(false);
  const [error, setErr] = useState("");
  const [shake, setShake] = useState(false);
  const [tries, setTries] = useState(() => {
    try { return parseInt(sessionStorage.getItem("ca-lock-attempts") || "0", 10); } catch { return 0; }
  });
  const [lockedUntil, setLockedUntil] = useState(() => {
    try { return parseInt(sessionStorage.getItem("ca-lock-until") || "0", 10); } catch { return 0; }
  });
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const isOut  = Date.now() < lockedUntil;
  const remain = Math.ceil((lockedUntil - Date.now()) / 1000);

  const unlock = () => {
    if (isOut) return;
    if (pw === INBOX_PASSWORD) {
      try { sessionStorage.setItem(LOCK_SESSION_KEY, "1"); sessionStorage.setItem("ca-lock-attempts", "0"); } catch {}
      onUnlock();
    } else {
      const n = tries + 1; setTries(n);
      try { sessionStorage.setItem("ca-lock-attempts", String(n)); } catch {}
      setShake(true); setTimeout(() => setShake(false), 400); setPw("");
      if (n >= MAX_LOCK_TRIES) {
        const u = Date.now() + LOCKOUT_MS; setLockedUntil(u);
        try { sessionStorage.setItem("ca-lock-until", String(u)); } catch {}
        setErr("");
      } else {
        setErr(`Incorrect. ${MAX_LOCK_TRIES - n} attempt${MAX_LOCK_TRIES - n === 1 ? "" : "s"} left.`);
      }
    }
  };

  if (isOut) return (
    <div className="lock-out-screen">
      <div className="lock-out-card">
        <div style={{ fontSize: 40 }}>🔒</div>
        <div className="lock-out-title">Access blocked</div>
        <div className="lock-out-sub">Too many incorrect attempts. Wait <strong>{remain}s</strong>.</div>
      </div>
    </div>
  );

  return (
    <div className="lock-overlay">
      <div className="lock-card">
        <div className="lock-icon-ring"><Icons.Lock /></div>
        <div className="lock-title">Mentor Inbox</div>
        <div className="lock-sub">This area is private. Enter your password to view student messages.</div>
        <div className="lock-input-wrap">
          <input ref={ref} className={`lock-input${shake ? " shake" : ""}`}
            type={show ? "text" : "password"} placeholder="Enter password"
            value={pw} onChange={e => { setPw(e.target.value); setErr(""); }}
            onKeyDown={e => { if (e.key === "Enter") unlock(); }}
            autoComplete="current-password" />
          <button className="lock-toggle" onClick={() => setShow(s => !s)}>
            {show ? <Icons.EyeOff /> : <Icons.Eye />}
          </button>
        </div>
        {error && <div className="lock-error">{error}</div>}
        {tries > 0 && !error && (
          <span className="attempts-left">{MAX_LOCK_TRIES - tries} attempt{MAX_LOCK_TRIES - tries === 1 ? "" : "s"} remaining</span>
        )}
        <button className="lock-btn" onClick={unlock} disabled={!pw}>Unlock Inbox</button>
        <div className="lock-hint">🔐 Only you know this password. Students cannot see this tab.</div>
      </div>
    </div>
  );
}

// ── MENTOR INBOX ──────────────────────────────────────────────────────────────
function MentorInbox({ onToast }) {
  const [messages, setMessages] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [thread, setThread]     = useState([]);
  const [reply, setReply]       = useState("");
  const [search, setSearch]     = useState("");
  const [filter, setFilter]     = useState("all");
  const [loading, setLoading]   = useState(true);
  const [sending, setSending]   = useState(false);
  const [isRec, setIsRec]       = useState(false);
  const [replyTo, setReplyTo]   = useState(null);
  const [stagedFile, setStagedFile] = useState(null); // staged file preview before sending
  const [confirmDelete, setConfirmDelete] = useState(null);
  const recRef  = useRef(null);
  const chunks  = useRef([]);
  const fileRef = useRef(null);
  const endRef  = useRef(null);

  const loadMessages = useCallback(async () => {
    try {
      const data = await fetchMessages();
      setMessages(data);
      if (!activeId && data.length) setActiveId(data[0].id);
    } catch { onToast("Could not load messages", "error"); }
    finally { setLoading(false); }
  }, [activeId, onToast]);

  useEffect(() => { loadMessages(); }, []);

  useEffect(() => {
    if (!activeId) return;
    setStagedFile(null);
    setReplyTo(null);
    fetchThread(activeId).then(setThread).catch(() => {});
  }, [activeId]);

  // Poll every 5s for student follow-up messages
  useEffect(() => {
    if (!activeId) return;
    const id = setInterval(() => fetchThread(activeId).then(setThread).catch(() => {}), 5000);
    return () => clearInterval(id);
  }, [activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  const sendReply = async () => {
    const hasText = reply.trim().length > 0;
    const hasFile = !!stagedFile;
    if (!hasText && !hasFile || !activeId) return;
    setSending(true);
    try {
      let imageUrl = null, fileUrl = null;
      if (stagedFile) {
        onToast("Uploading… please wait ⏳", "success");
        const ext = stagedFile.name.split(".").pop();
        const fname = `mentor-file-${Date.now()}.${ext}`;
        const uploaded = await uploadFile(stagedFile.file, fname);
        if (stagedFile.isImg) imageUrl = uploaded;
        else fileUrl = uploaded;
      }
      const row = await insertThread({
        message_id: activeId, sender: "mentor", sender_label: "Mentor",
        text: hasText ? reply.trim() : null,
        audio_url: null, image_url: imageUrl, file_url: fileUrl,
        reply_to_id: replyTo ? replyTo.id : null,
      });
      await markReplied(activeId);
      setThread(p => [...p, row]);
      setMessages(p => p.map(m => m.id === activeId ? { ...m, status: "Replied" } : m));
      setReply(""); setStagedFile(null); setReplyTo(null);
      onToast("Sent! ✅", "success");
    } catch { onToast("Failed to send", "error"); }
    finally { setSending(false); }
  };

  const stageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) { onToast(`Max ${MAX_FILE_MB} MB allowed`, "error"); return; }
    setStagedFile({
      file,
      previewUrl: URL.createObjectURL(file),
      isImg: file.type.startsWith("image/"),
      isPdf: file.type === "application/pdf",
      name: file.name,
      size: formatBytes(file.size),
    });
    e.target.value = "";
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        setSending(true);
        try {
          const fname = `mentor-${Date.now()}.webm`;
          const audioUrl = await uploadAudio(blob, fname);
          const row = await insertThread({
            message_id: activeId, sender: "mentor", sender_label: "Mentor",
            text: null, audio_url: audioUrl, image_url: null, file_url: null,
            reply_to_id: replyTo ? replyTo.id : null,
          });
          await markReplied(activeId);
          setThread(p => [...p, row]);
          setMessages(p => p.map(m => m.id === activeId ? { ...m, status: "Replied" } : m));
          setReplyTo(null);
          onToast("Voice reply sent!", "success");
        } catch { onToast("Voice reply failed", "error"); }
        finally { setSending(false); }
      };
      rec.start(); recRef.current = rec; setIsRec(true);
    } catch { onToast("Microphone access denied", "error"); }
  };

  const stopRec = () => { recRef.current?.stop(); recRef.current = null; setIsRec(false); };

  const deleteConvo = async (id) => {
    try {
      await deleteThread(id);
      await deleteMessage(id);
      setMessages(p => p.filter(m => m.id !== id));
      if (activeId === id) { setActiveId(null); setThread([]); }
      setConfirmDelete(null);
      onToast("Conversation deleted", "success");
    } catch { onToast("Failed to delete", "error"); }
  };

  const filtered = messages.filter(m => {
    const q = search.toLowerCase();
    const matchSearch = !q || [m.student_name, m.topic, m.attempt, m.message, m.mode]
      .some(v => String(v || "").toLowerCase().includes(q));
    const matchFilter = filter === "all" || m.status === "Unread";
    return matchSearch && matchFilter;
  });

  const active = messages.find(m => m.id === activeId);
  const unread = messages.filter(m => m.status === "Unread").length;

  return (
    <div className="inbox-layout">
      {/* Sidebar */}
      <div className="card">
        <div className="card-body-sm">
          <div className="flex items-center gap-8" style={{ marginBottom: 12 }}>
            <Icons.Inbox />
            <span className="font-semibold" style={{ fontSize: 16 }}>Private Inbox</span>
            <span className="badge badge-blue" style={{ marginLeft: "auto" }}>{unread} unread</span>
          </div>
          <div className="search-wrap" style={{ marginBottom: 10 }}>
            <span className="search-icon"><Icons.Search /></span>
            <input className="input search-input" placeholder="Search…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Filter tabs — All / Unread */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button onClick={() => setFilter("all")}
              style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1.5px solid", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", transition: "all .15s",
                background: filter === "all" ? "#0f172a" : "white",
                color: filter === "all" ? "white" : "var(--ink2)",
                borderColor: filter === "all" ? "#0f172a" : "var(--border)" }}>
              All ({messages.length})
            </button>
            <button onClick={() => setFilter("unread")}
              style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1.5px solid", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", transition: "all .15s",
                background: filter === "unread" ? "var(--amber-bg)" : "white",
                color: filter === "unread" ? "var(--amber)" : "var(--ink2)",
                borderColor: filter === "unread" ? "var(--amber)" : "var(--border)" }}>
              Unread ({unread})
            </button>
          </div>

          <div style={{ marginBottom: 10 }}>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 8px" }} onClick={loadMessages}>
              <Icons.Refresh /> Refresh
            </button>
          </div>

          {loading
            ? <div className="empty">Loading…</div>
            : filtered.length === 0
              ? <div className="empty">{filter === "unread" ? "No unread messages 🎉" : "No messages yet."}</div>
              : <div className="convo-list">
                  {filtered.map(m => (
                    <div key={m.id} style={{ position: "relative" }}>
                      <button
                        className={`convo-item${activeId === m.id ? " active" : ""}`}
                        style={{ paddingRight: 40 }}
                        onClick={() => setActiveId(m.id)}>
                        <div className="convo-avatar">{(m.student_name || "A")[0].toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="convo-name">{m.student_name || "Anonymous"}</div>
                          <div className="convo-sub">{m.message}</div>
                          <div className="convo-meta">
                            <span className="badge badge-gray">{m.attempt}</span>
                            <span className="badge badge-gray">{m.topic}</span>
                            <span className={`badge ${m.status === "Unread" ? "badge-amber" : "badge-green"}`}>
                              {m.status}
                            </span>
                          </div>
                        </div>
                        <div className="convo-time">{timeLabel(m.created_at)}</div>
                      </button>
                      {/* Delete button */}
                      <button
                        title="Delete conversation"
                        onClick={e => { e.stopPropagation(); setConfirmDelete(m.id); }}
                        style={{ position: "absolute", top: 10, right: 8, background: "none", border: "none",
                          cursor: "pointer", color: "var(--ink3)", padding: 4, borderRadius: 6,
                          display: "flex", alignItems: "center" }}
                        onMouseEnter={e => e.currentTarget.style.color = "var(--red)"}
                        onMouseLeave={e => e.currentTarget.style.color = "var(--ink3)"}>
                        <Icons.Trash />
                      </button>
                    </div>
                  ))}
                </div>
          }

          {/* Delete confirmation popup */}
          {confirmDelete && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 50,
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ background: "white", borderRadius: 16, padding: "32px 28px", maxWidth: 340,
                width: "90%", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,.15)" }}>
                <div style={{ width: 48, height: 48, background: "var(--red-bg)", borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px", color: "var(--red)" }}>
                  <Icons.Trash />
                </div>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, marginBottom: 8 }}>
                  Delete conversation?
                </div>
                <div style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 24, lineHeight: 1.6 }}>
                  This will permanently delete this student's conversation and all messages. This cannot be undone.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btn-outline" style={{ flex: 1 }}
                    onClick={() => setConfirmDelete(null)}>Cancel</button>
                  <button className="btn btn-danger" style={{ flex: 1, background: "var(--red)", color: "white" }}
                    onClick={() => deleteConvo(confirmDelete)}>Yes, delete</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chat panel — FIX #3 shows full thread with audio/images */}
      <div className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!active
          ? <div className="empty">Select a conversation to view and reply.</div>
          : <>
              <div style={{ padding: "20px 24px 16px", borderBottom: "1.5px solid var(--border)" }}>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20 }}>
                  {active.student_name || "Anonymous"}
                </div>
                <div className="text-sm text-muted mt-4">
                  {active.attempt} · {active.topic} · {active.mode}
                </div>
                <div className="flex gap-8 mt-8">
                  <span className={`badge ${active.status === "Unread" ? "badge-amber" : "badge-green"}`}>
                    {active.status}
                  </span>
                  <span className="text-xs text-muted" style={{ alignSelf: "center" }}>
                    Auto-refreshes every 5s
                  </span>
                </div>
              </div>

              {/* Full thread */}
              <div className="chat-thread">
                {thread.length === 0
                  ? <div style={{ color: "var(--ink2)", fontSize: 13, textAlign: "center", paddingTop: 20 }}>
                      No thread messages yet.
                    </div>
                  : thread.map(msg => (
                      <MsgBubble key={msg.id} msg={msg} isMine={msg.sender === "mentor"}
                        onReply={setReplyTo} allMsgs={thread} />
                    ))
                }
                <div ref={endRef} />
              </div>

              {/* Reply-to preview bar */}
              <ReplyBar replyTo={replyTo} onCancel={() => setReplyTo(null)} />

              {/* Staged file preview */}
              {stagedFile && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 14px", background: "#f0f7ff",
                  borderTop: "1.5px solid var(--accent2)",
                }}>
                  <div style={{ fontSize: 13 }}>
                    {stagedFile.isImg ? "🖼" : stagedFile.isPdf ? "📄" : "📎"}
                  </div>
                  {stagedFile.isImg && (
                    <img src={stagedFile.previewUrl} alt="preview"
                      style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {stagedFile.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink3)" }}>{stagedFile.size} · Ready to send</div>
                  </div>
                  <button onClick={() => setStagedFile(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink3)", fontSize: 18, padding: "2px 4px" }}>
                    ×
                  </button>
                </div>
              )}

              {/* Reply bar */}
              <div className="reply-bar">
                {!isRec
                  ? <button className="btn btn-ghost" style={{ padding: 8, flexShrink: 0 }}
                      onClick={startRec} title="Voice reply"><Icons.Mic /></button>
                  : <button className="btn btn-danger" style={{ padding: 8, flexShrink: 0 }}
                      onClick={stopRec}><Icons.Stop /></button>}
                {isRec
                  ? <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="rec-dot" />
                      <span className="text-sm" style={{ color: "var(--red)" }}>Recording voice reply…</span>
                    </div>
                  : <textarea className="reply-input" rows={1}
                      placeholder={stagedFile ? "Add a message with your file… (optional)" : "Reply to student… (Enter to send, Shift+Enter = new line)"}
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                    />
                }
                <button className="btn btn-ghost" style={{ padding: 8, flexShrink: 0 }}
                  onClick={() => fileRef.current?.click()} title="Attach file"><Icons.Attach /></button>
                <input ref={fileRef} type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                  style={{ display: "none" }} onChange={stageFile} />
                {!isRec && (
                  <button className="send-btn" onClick={sendReply}
                    disabled={sending || (!reply.trim() && !stagedFile)}>
                    {sending ? <span className="spinner" /> : <Icons.Send />}
                  </button>
                )}
              </div>
            </>
        }
      </div>
    </div>
  );
}

// ── APP ROOT ──────────────────────────────────────────────────────────────────
export default function CAFinalPortal() {
  const [tab, setTab]           = useState("student");
  const [toast, setToast]       = useState(null);
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem(LOCK_SESSION_KEY) === "1"; } catch { return false; }
  });

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type, key: Date.now() });
  }, []);

  const lock = () => {
    try { sessionStorage.removeItem(LOCK_SESSION_KEY); } catch {}
    setUnlocked(false); setTab("student");
  };

  return (
    <>
      <style>{css}</style>
      <div className="portal-root">
        <div className="main">
          <div className="header">
            <div>
              <div className="header-title">CA Final Private Messaging Portal</div>
              <div className="header-sub">Two-way chat · Voice notes · Locked inbox · Powered by Supabase</div>
            </div>
            <span className="badge badge-green"><Icons.Shield /> Live</span>
          </div>

          <div className="hero-grid">
            <div className="card card-dark">
              <div className="card-body">
                <div className="flex flex-wrap gap-8">
                  <span className="badge" style={{ background: "rgba(255,255,255,.1)", color: "white" }}>
                    <Icons.Lock /> Private portal
                  </span>
                  <span className="badge" style={{ background: "rgba(74,222,128,.15)", color: "#86efac" }}>
                    No WhatsApp needed
                  </span>
                </div>
                <div className="hero-headline">CA Final students message you privately — full two-way chat.</div>
                <div className="hero-sub">
                  Students send text, voice notes, and files. You reply from your locked inbox.
                  The conversation continues until the doubt is fully resolved.
                </div>
                <div className="hero-features">
                  <div className="hero-feat">
                    <div className="hero-feat-title"><Icons.Lock /> Privacy first</div>
                    <div className="hero-feat-desc">Your number and email stay hidden from every student.</div>
                  </div>
                  <div className="hero-feat">
                    <div className="hero-feat-title"><Icons.Headphone /> Voice or text</div>
                    <div className="hero-feat-desc">Send a voice note alone, or type — neither is required if the other is present.</div>
                  </div>
                  <div className="hero-feat">
                    <div className="hero-feat-title"><Icons.Inbox /> Live 2-way chat</div>
                    <div className="hero-feat-desc">Students continue the conversation after your reply until resolved.</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-body">
                <div className="font-semibold" style={{ fontSize: 16, marginBottom: 6 }}>Your portal is live</div>
                <div className="text-sm text-muted">All messages in Supabase. Chat auto-refreshes every 5 seconds.</div>
                <div className="stats-grid">
                  <div className="stat-box"><div className="stat-num">✓</div><div className="stat-label">Supabase connected</div></div>
                  <div className="stat-box"><div className="stat-num">↺</div><div className="stat-label">Auto-refreshing</div></div>
                  <div className="stat-box"><div className="stat-num"><Icons.Shield /></div><div className="stat-label">Inbox locked</div></div>
                  <div className="stat-box"><div className="stat-num"><Icons.Inbox /></div><div className="stat-label">2-way chat</div></div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="tabs-bar">
              <button className={`tab-btn${tab === "student" ? " active" : ""}`} onClick={() => setTab("student")}>
                Student view
              </button>
              <button className={`tab-btn${tab === "mentor" ? " active" : ""}`} onClick={() => setTab("mentor")}>
                {unlocked ? <Icons.Inbox /> : <Icons.Lock />} Your inbox
              </button>
            </div>
          </div>

          {tab === "student" && <StudentPortal onToast={showToast} />}
          {tab === "mentor" && (
            unlocked
              ? <>
                  <div className="unlock-banner">
                    <div className="unlock-banner-left"><Icons.Shield /> Inbox unlocked — only visible to you</div>
                    <button className="btn btn-ghost" style={{ color: "#94a3b8", fontSize: 13, padding: "4px 10px" }} onClick={lock}>
                      <Icons.LogOut /> Lock inbox
                    </button>
                  </div>
                  <MentorInbox onToast={showToast} />
                </>
              : <InboxLock onUnlock={() => setUnlocked(true)} />
          )}
        </div>
      </div>
      {toast && <Toast key={toast.key} msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </>
  );
}
