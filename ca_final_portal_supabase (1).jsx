import React, { useEffect, useRef, useState, useCallback } from "react";

// ── Supabase client (no extra package needed – raw REST calls) ──────────────
const SUPABASE_URL = "https://xzpvciyypdkysiyiqyhs.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6cHZjaXl5cGRreXNpeWlxeWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NzEzNzIsImV4cCI6MjA4OTA0NzM3Mn0.9Hee31MysL6VxJh9iDaFMBQGbduCChpy8J92mFQFnMM";

const sbHeaders = {
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Prefer: "return=representation",
};

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: { ...sbHeaders, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// ── DB helpers ───────────────────────────────────────────────────────────────
async function fetchMessages() {
  return sbFetch("/messages?select=*&order=created_at.desc");
}

async function fetchReplies(messageId) {
  return sbFetch(`/replies?message_id=eq.${messageId}&select=*&order=created_at.asc`);
}

async function insertMessage(payload) {
  const rows = await sbFetch("/messages", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return rows[0];
}

async function insertReply(messageId, replyText) {
  const rows = await sbFetch("/replies", {
    method: "POST",
    body: JSON.stringify({ message_id: messageId, reply_text: replyText }),
  });
  return rows[0];
}

async function markReplied(messageId) {
  await sbFetch(`/messages?id=eq.${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "Replied" }),
  });
}

// ── Inbox password — change this to whatever you want ────────────────────────
const INBOX_PASSWORD = "cafinal2026";
const LOCK_SESSION_KEY = "ca-inbox-unlocked";

// ── Utilities ────────────────────────────────────────────────────────────────
const MAX_FILE_MB = 5;

function timeLabel(iso) {
  const d = iso ? new Date(iso) : new Date();
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function formatBytes(bytes) {
  if (!bytes) return "";
  const s = ["B", "KB", "MB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 2);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${s[i]}`;
}

// ── Icons (inline SVG so no extra dependencies) ──────────────────────────────
const Icon = ({ d, size = 18, stroke = "currentColor", ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke}
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d={d} />
  </svg>
);

const Icons = {
  Send: () => <Icon d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />,
  Mic: () => <Icon d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />,
  Stop: () => <Icon d="M3 3h18v18H3z" />,
  Attach: () => <Icon d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.42 16.41a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
  Inbox: () => <Icon d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 17.76 4H6.24a2 2 0 0 0-1.79 1.11z" />,
  Lock: () => <Icon d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />,
  Shield: () => <Icon d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  User: () => <Icon d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
  File: () => <Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" />,
  Image: () => <Icon d="M21 15l-5-5L5 21M21 3H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />,
  Search: () => <Icon d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />,
  Check: () => <Icon d="M20 6L9 17l-5-5" />,
  Trash: () => <Icon d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />,
  Download: () => <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />,
  Refresh: () => <Icon d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />,
  Headphone: () => <Icon d="M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />,
  Eye: () => <Icon d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />,
  EyeOff: () => <Icon d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />,
  LogOut: () => <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
};

// ── CSS ───────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --ink: #0f172a;
    --ink2: #475569;
    --ink3: #94a3b8;
    --surface: #ffffff;
    --surface2: #f8fafc;
    --surface3: #f1f5f9;
    --border: #e2e8f0;
    --accent: #1d4ed8;
    --accent2: #3b82f6;
    --green: #16a34a;
    --green-bg: #dcfce7;
    --amber: #d97706;
    --amber-bg: #fef3c7;
    --red: #dc2626;
    --red-bg: #fee2e2;
    --radius: 16px;
    --radius-sm: 10px;
    --shadow: 0 1px 3px rgba(0,0,0,.07), 0 4px 16px rgba(0,0,0,.06);
    --shadow-lg: 0 8px 32px rgba(0,0,0,.10);
  }

  body { font-family: 'DM Sans', sans-serif; background: #f0f4f8; color: var(--ink); }

  .portal-root { min-height: 100vh; padding: 32px 20px; }

  /* ── Header ── */
  .header { max-width: 1100px; margin: 0 auto 32px; display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .header-title { font-family: 'DM Serif Display', serif; font-size: clamp(22px, 4vw, 32px); color: var(--ink); line-height: 1.2; }
  .header-sub { font-size: 13px; color: var(--ink2); margin-top: 4px; }
  .badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 500; }
  .badge-green { background: var(--green-bg); color: var(--green); }
  .badge-blue { background: #dbeafe; color: var(--accent); }
  .badge-gray { background: var(--surface3); color: var(--ink2); }
  .badge-amber { background: var(--amber-bg); color: var(--amber); }
  .badge-red { background: var(--red-bg); color: var(--red); }

  /* ── Layout ── */
  .main { max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }

  /* ── Hero grid ── */
  .hero-grid { display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 20px; }
  @media (max-width: 768px) { .hero-grid { grid-template-columns: 1fr; } }

  .card { background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
  .card-dark { background: #0f172a; color: white; }
  .card-body { padding: 32px; }
  .card-body-sm { padding: 24px; }

  .hero-headline { font-family: 'DM Serif Display', serif; font-size: clamp(20px, 3vw, 28px); line-height: 1.35; color: white; margin: 16px 0 12px; }
  .hero-sub { font-size: 14px; color: #94a3b8; line-height: 1.6; }
  .hero-features { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-top: 24px; }
  @media (max-width: 600px) { .hero-features { grid-template-columns: 1fr; } }
  .hero-feat { background: rgba(255,255,255,.07); border-radius: var(--radius-sm); padding: 14px; }
  .hero-feat-title { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; color: white; }
  .hero-feat-desc { font-size: 12px; color: #94a3b8; margin-top: 6px; line-height: 1.5; }

  .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
  .stat-box { background: var(--surface2); border-radius: var(--radius-sm); padding: 14px; }
  .stat-num { font-family: 'DM Serif Display', serif; font-size: 26px; color: var(--ink); }
  .stat-label { font-size: 12px; color: var(--ink2); margin-top: 2px; }

  /* ── Tabs ── */
  .tabs-bar { display: flex; gap: 4px; background: var(--surface3); border-radius: 12px; padding: 4px; width: fit-content; }
  .tab-btn { padding: 8px 20px; border-radius: 9px; border: none; background: transparent; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500; color: var(--ink2); cursor: pointer; transition: all .15s; }
  .tab-btn.active { background: var(--surface); color: var(--ink); box-shadow: 0 1px 4px rgba(0,0,0,.1); }

  /* ── Student form ── */
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .label { font-size: 13px; font-weight: 500; color: var(--ink); }
  .input, .select, .textarea {
    font-family: 'DM Sans', sans-serif; font-size: 14px; color: var(--ink);
    background: var(--surface2); border: 1.5px solid var(--border);
    border-radius: var(--radius-sm); padding: 10px 14px;
    outline: none; transition: border-color .15s;
    width: 100%;
  }
  .input:focus, .select:focus, .textarea:focus { border-color: var(--accent2); background: white; }
  .textarea { resize: vertical; min-height: 110px; line-height: 1.6; }

  /* ── Buttons ── */
  .btn { display: inline-flex; align-items: center; gap: 7px; padding: 10px 20px; border-radius: var(--radius-sm); border: none; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500; cursor: pointer; transition: all .15s; }
  .btn-primary { background: var(--accent); color: white; }
  .btn-primary:hover { background: #1e40af; }
  .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
  .btn-outline { background: white; color: var(--ink); border: 1.5px solid var(--border); }
  .btn-outline:hover { border-color: var(--ink3); background: var(--surface2); }
  .btn-danger { background: var(--red-bg); color: var(--red); border: none; }
  .btn-danger:hover { background: #fca5a5; }
  .btn-ghost { background: transparent; color: var(--ink2); border: none; padding: 6px 8px; }
  .btn-ghost:hover { background: var(--surface3); }

  /* ── Attachment chips / previews ── */
  .attach-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; background: var(--surface3); border-radius: 999px; font-size: 12px; font-weight: 500; }
  .attach-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--surface2); border: 1.5px solid var(--border); border-radius: var(--radius-sm); padding: 10px 14px; }
  .audio-player { width: 100%; margin-top: 6px; height: 36px; border-radius: 8px; }
  .image-preview { width: 100%; max-height: 160px; object-fit: cover; border-radius: 8px; margin-top: 6px; }

  /* ── Recording indicator ── */
  .rec-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--red); animation: blink 1s infinite; display: inline-block; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }

  /* ── Inbox ── */
  .inbox-layout { display: grid; grid-template-columns: 340px 1fr; gap: 20px; align-items: start; }
  @media (max-width: 900px) { .inbox-layout { grid-template-columns: 1fr; } }

  .convo-list { display: flex; flex-direction: column; gap: 6px; max-height: 600px; overflow-y: auto; }
  .convo-item { display: flex; align-items: flex-start; gap: 10px; padding: 14px; border-radius: var(--radius-sm); border: 1.5px solid var(--border); background: white; cursor: pointer; transition: all .15s; text-align: left; width: 100%; }
  .convo-item:hover { border-color: var(--accent2); }
  .convo-item.active { background: #0f172a; border-color: #0f172a; color: white; }
  .convo-item.active .convo-sub { color: #94a3b8; }
  .convo-avatar { width: 38px; height: 38px; border-radius: 50%; background: var(--accent2); color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 15px; flex-shrink: 0; }
  .convo-name { font-weight: 600; font-size: 14px; }
  .convo-sub { font-size: 12px; color: var(--ink2); margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .convo-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .convo-time { font-size: 11px; color: var(--ink3); white-space: nowrap; margin-left: auto; }

  /* ── Chat window ── */
  .chat-messages { height: 300px; overflow-y: auto; padding: 16px; background: var(--surface2); border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 10px; }
  .bubble { max-width: 78%; padding: 10px 14px; border-radius: 14px; font-size: 13px; line-height: 1.6; }
  .bubble-student { background: white; border: 1.5px solid var(--border); align-self: flex-start; }
  .bubble-you { background: #0f172a; color: white; align-self: flex-end; }
  .bubble-time { font-size: 11px; margin-top: 4px; color: inherit; opacity: .5; }

  /* ── Toast ── */
  .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: var(--radius-sm); font-size: 14px; font-weight: 500; box-shadow: var(--shadow-lg); z-index: 999; animation: slideup .3s ease; }
  .toast-success { background: #0f172a; color: white; }
  .toast-error { background: var(--red); color: white; }
  @keyframes slideup { from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1} }

  /* ── Spinner ── */
  .spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,.3); border-top-color: white; border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Search ── */
  .search-wrap { position: relative; }
  .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ink3); pointer-events: none; }
  .search-input { padding-left: 36px !important; }

  /* ── Empty state ── */
  .empty { padding: 48px 24px; text-align: center; color: var(--ink2); font-size: 14px; }

  /* ── Lock screen ── */
  .lock-overlay { display: flex; align-items: center; justify-content: center; min-height: 420px; }
  .lock-card { background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow-lg); padding: 48px 40px; max-width: 400px; width: 100%; text-align: center; }
  .lock-icon-ring { width: 72px; height: 72px; border-radius: 50%; background: #0f172a; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: white; }
  .lock-title { font-family: 'DM Serif Display', serif; font-size: 24px; color: var(--ink); margin-bottom: 6px; }
  .lock-sub { font-size: 13px; color: var(--ink2); margin-bottom: 28px; line-height: 1.6; }
  .lock-input-wrap { position: relative; margin-bottom: 4px; }
  .lock-input { width: 100%; padding: 13px 44px 13px 16px; border: 2px solid var(--border); border-radius: var(--radius-sm); font-family: 'DM Sans', sans-serif; font-size: 15px; color: var(--ink); background: var(--surface2); outline: none; text-align: center; letter-spacing: 3px; transition: border-color .15s, background .15s; }
  .lock-input::placeholder { letter-spacing: 1px; }
  .lock-input:focus { border-color: var(--accent2); background: white; }
  .lock-input.shake { animation: shake .35s ease; border-color: var(--red) !important; background: var(--red-bg) !important; }
  .lock-toggle { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--ink3); padding: 4px; display: flex; align-items: center; }
  .lock-btn { width: 100%; padding: 13px; background: #0f172a; color: white; border: none; border-radius: var(--radius-sm); font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 600; cursor: pointer; transition: background .15s; margin-top: 12px; letter-spacing: .3px; }
  .lock-btn:hover { background: #1e293b; }
  .lock-btn:disabled { opacity: .5; cursor: not-allowed; }
  .lock-error { font-size: 13px; color: var(--red); font-weight: 500; margin-top: 10px; min-height: 18px; }
  .lock-hint { font-size: 12px; color: var(--ink3); margin-top: 20px; line-height: 1.6; }
  .attempts-left { display: inline-block; background: var(--amber-bg); color: var(--amber); border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; margin-top: 8px; }
  @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-9px)} 40%{transform:translateX(9px)} 60%{transform:translateX(-6px)} 80%{transform:translateX(5px)} }

  /* ── Unlock banner ── */
  .unlock-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #0f172a; color: white; border-radius: var(--radius-sm); padding: 10px 16px; margin-bottom: 16px; font-size: 13px; flex-wrap: wrap; }
  .unlock-banner-left { display: flex; align-items: center; gap: 8px; }
  .lock-out-screen { display: flex; align-items: center; justify-content: center; min-height: 420px; }
  .lock-out-card { background: var(--red-bg); border: 1.5px solid #fca5a5; border-radius: var(--radius); padding: 40px 32px; max-width: 380px; width: 100%; text-align: center; }
  .lock-out-title { font-family: 'DM Serif Display', serif; font-size: 22px; color: var(--red); margin: 16px 0 8px; }
  .lock-out-sub { font-size: 13px; color: #991b1b; line-height: 1.6; }

  /* ── Success screen ── */
  .success-box { text-align: center; padding: 48px 32px; }
  .success-icon { width: 56px; height: 56px; background: var(--green-bg); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--green); }

  hr { border: none; border-top: 1px solid var(--border); margin: 20px 0; }

  .error-text { font-size: 13px; color: var(--red); font-weight: 500; }
  .flex { display: flex; }
  .flex-wrap { flex-wrap: wrap; }
  .items-center { align-items: center; }
  .gap-8 { gap: 8px; }
  .gap-12 { gap: 12px; }
  .mt-4 { margin-top: 4px; }
  .mt-8 { margin-top: 8px; }
  .mt-12 { margin-top: 12px; }
  .mt-16 { margin-top: 16px; }
  .mt-20 { margin-top: 20px; }
  .mt-24 { margin-top: 24px; }
  .w-full { width: 100%; }
  .text-sm { font-size: 13px; }
  .text-xs { font-size: 12px; }
  .text-muted { color: var(--ink2); }
  .font-semibold { font-weight: 600; }
`;

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return <div className={`toast toast-${type}`}>{msg}</div>;
}

// ── Attachment Preview ────────────────────────────────────────────────────────
function AttachPreview({ att, onRemove }) {
  return (
    <div className="attach-row">
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {att.kind === "audio" ? <Icons.Mic /> : att.kind === "image" ? <Icons.Image /> : <Icons.File />}
        <div style={{ minWidth: 0 }}>
          <div className="text-sm font-semibold" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</div>
          {att.kind === "audio" && att.url && <audio controls src={att.url} className="audio-player" />}
          {att.kind === "image" && att.url && <img src={att.url} alt={att.name} className="image-preview" />}
          {att.kind === "file" && <div className="text-xs text-muted">{att.size}</div>}
        </div>
      </div>
      {onRemove && (
        <button className="btn btn-ghost" onClick={onRemove} title="Remove">
          <Icons.Trash />
        </button>
      )}
    </div>
  );
}

// ── Student Portal ────────────────────────────────────────────────────────────
function StudentPortal({ onToast }) {
  const [name, setName] = useState("");
  const [attempt, setAttempt] = useState("May 2026");
  const [topic, setTopic] = useState("Preparation strategy");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const fileRef = useRef(null);

  const addFile = (e) => {
    const files = Array.from(e.target.files || []);
    const big = files.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (big) { setError(`Each file must be under ${MAX_FILE_MB} MB`); return; }
    const newAtts = files.map((f) => ({
      id: `${Date.now()}-${f.name}`,
      name: f.name,
      kind: f.type.startsWith("image/") ? "image" : "file",
      size: formatBytes(f.size),
      url: URL.createObjectURL(f),
      file: f,
    }));
    setAttachments((p) => [...p, ...newAtts]);
    setError("");
    e.target.value = "";
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setAttachments((p) => [...p, {
          id: `${Date.now()}-voice`, name: `voice-${Date.now()}.webm`,
          kind: "audio", size: "Voice note", url: URL.createObjectURL(blob), file: blob,
        }]);
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recorderRef.current = rec;
      setIsRecording(true);
    } catch {
      setError("Microphone access denied. You can upload an audio file instead.");
    }
  };

  const stopRec = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
  };

  const submit = async () => {
    if (!message.trim()) { setError("Please type your message before sending."); return; }
    setError("");
    setLoading(true);
    try {
      const hasAudio = attachments.some((a) => a.kind === "audio");
      const hasFile = attachments.some((a) => a.kind !== "audio");
      let mode = "Text";
      if (hasAudio && hasFile) mode = "Voice Note + File";
      else if (hasAudio) mode = "Voice Note";
      else if (attachments.length) mode = "Text + File";

      await insertMessage({
        student_name: name.trim() || "Anonymous Student",
        attempt, topic, mode,
        message: message.trim(),
        status: "Unread",
      });

      setSent(true);
      onToast("Message sent successfully!", "success");
    } catch (err) {
      setError("Failed to send. Please try again.");
      onToast("Send failed. Check your connection.", "error");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="card">
        <div className="success-box">
          <div className="success-icon"><Icons.Check /></div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, marginBottom: 8 }}>Message sent!</div>
          <div className="text-muted text-sm" style={{ marginBottom: 24 }}>Your message has been delivered privately. The mentor will reply shortly.</div>
          <button className="btn btn-outline" onClick={() => { setSent(false); setName(""); setMessage(""); setAttachments([]); }}>Send another message</button>
        </div>
      </div>
    );
  }

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
            <input className="input" placeholder="e.g. Riya S. or Anonymous" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">CA Final attempt</label>
            <select className="select" value={attempt} onChange={(e) => setAttempt(e.target.value)}>
              {["May 2026","Nov 2026","May 2027","Nov 2027","Later"].map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Topic</label>
            <select className="select" value={topic} onChange={(e) => setTopic(e.target.value)}>
              {["Preparation strategy","DT doubt","IDT doubt","FR doubt","SFM doubt","Audit doubt","Law doubt","Study plan","Previous attempt review","Other"].map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Voice note</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {!isRecording
                ? <button className="btn btn-outline" onClick={startRec}><Icons.Mic /> Record</button>
                : <button className="btn btn-danger" onClick={stopRec}><Icons.Stop /> Stop</button>}
              {isRecording && <><span className="rec-dot" /><span className="text-sm" style={{ color: "var(--red)" }}>Recording…</span></>}
            </div>
          </div>
        </div>

        <div className="field mt-16">
          <label className="label">Your message</label>
          <textarea className="textarea" placeholder="Describe your doubt, strategy issue, or question clearly…" value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>

        {attachments.length > 0 && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="label">Attachments</div>
            {attachments.map((att) => (
              <AttachPreview key={att.id} att={att} onRemove={() => setAttachments((p) => p.filter((a) => a.id !== att.id))} />
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
            <Icons.Attach /> Attach file
          </button>
          <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx" style={{ display: "none" }} onChange={addFile} />
        </div>
      </div>
    </div>
  );
}

// ── Inbox Lock Screen ─────────────────────────────────────────────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

function InboxLock({ onUnlock }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(() => {
    try { return parseInt(sessionStorage.getItem("ca-lock-attempts") || "0", 10); } catch { return 0; }
  });
  const [lockedUntil, setLockedUntil] = useState(() => {
    try { return parseInt(sessionStorage.getItem("ca-lock-until") || "0", 10); } catch { return 0; }
  });
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const isLockedOut = Date.now() < lockedUntil;
  const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 400);
  };

  const handleUnlock = () => {
    if (isLockedOut) return;
    if (pw === INBOX_PASSWORD) {
      try {
        sessionStorage.setItem(LOCK_SESSION_KEY, "1");
        sessionStorage.setItem("ca-lock-attempts", "0");
      } catch {}
      onUnlock();
    } else {
      const next = attempts + 1;
      setAttempts(next);
      try { sessionStorage.setItem("ca-lock-attempts", String(next)); } catch {}
      triggerShake();
      setPw("");
      if (next >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS;
        setLockedUntil(until);
        try { sessionStorage.setItem("ca-lock-until", String(until)); } catch {}
        setError("");
      } else {
        setError(`Incorrect password. ${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next === 1 ? "" : "s"} left.`);
      }
    }
  };

  if (isLockedOut) {
    return (
      <div className="lock-out-screen">
        <div className="lock-out-card">
          <div style={{ fontSize: 40 }}>🔒</div>
          <div className="lock-out-title">Access temporarily blocked</div>
          <div className="lock-out-sub">
            Too many incorrect attempts. Please wait <strong>{remaining}</strong> seconds before trying again.
            <br /><br />If this was you, refresh the page after the timer expires.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lock-overlay">
      <div className="lock-card">
        <div className="lock-icon-ring">
          <Icons.Lock />
        </div>
        <div className="lock-title">Mentor Inbox</div>
        <div className="lock-sub">This area is private. Enter your password to access student messages and replies.</div>

        <div className="lock-input-wrap">
          <input
            ref={inputRef}
            className={`lock-input${shake ? " shake" : ""}`}
            type={show ? "text" : "password"}
            placeholder="Enter password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleUnlock(); }}
            autoComplete="current-password"
          />
          <button className="lock-toggle" onClick={() => setShow((s) => !s)} title={show ? "Hide" : "Show"}>
            {show ? <Icons.EyeOff /> : <Icons.Eye />}
          </button>
        </div>

        {error && <div className="lock-error">{error}</div>}
        {attempts > 0 && !error && (
          <div style={{ marginTop: 6 }}>
            <span className="attempts-left">{MAX_ATTEMPTS - attempts} attempt{MAX_ATTEMPTS - attempts === 1 ? "" : "s"} remaining</span>
          </div>
        )}

        <button className="lock-btn" onClick={handleUnlock} disabled={!pw}>
          Unlock Inbox
        </button>

        <div className="lock-hint">
          🔐 Only you know this password.<br />Students cannot access this tab.
        </div>
      </div>
    </div>
  );
}

// ── Mentor Inbox ──────────────────────────────────────────────────────────────
function MentorInbox({ onToast }) {
  const [messages, setMessages] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [replies, setReplies] = useState([]);
  const [reply, setReply] = useState("");
  const [search, setSearch] = useState("");
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [sendingReply, setSendingReply] = useState(false);
  const chatRef = useRef(null);

  const loadMessages = useCallback(async () => {
    try {
      const data = await fetchMessages();
      setMessages(data);
      if (!activeId && data.length) setActiveId(data[0].id);
    } catch {
      onToast("Could not load messages", "error");
    } finally {
      setLoadingMsgs(false);
    }
  }, [activeId, onToast]);

  useEffect(() => { loadMessages(); }, []);

  useEffect(() => {
    if (!activeId) return;
    fetchReplies(activeId).then(setReplies).catch(() => {});
  }, [activeId]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [replies, activeId]);

  const sendReply = async () => {
    if (!reply.trim() || !activeId) return;
    setSendingReply(true);
    try {
      const row = await insertReply(activeId, reply.trim());
      await markReplied(activeId);
      setReplies((p) => [...p, row]);
      setMessages((p) => p.map((m) => m.id === activeId ? { ...m, status: "Replied" } : m));
      setReply("");
      onToast("Reply sent!", "success");
    } catch {
      onToast("Failed to send reply", "error");
    } finally {
      setSendingReply(false);
    }
  };

  const filtered = messages.filter((m) => {
    const q = search.toLowerCase();
    return !q || [m.student_name, m.topic, m.attempt, m.message, m.mode].some((v) => String(v || "").toLowerCase().includes(q));
  });

  const active = messages.find((m) => m.id === activeId);
  const unread = messages.filter((m) => m.status === "Unread").length;

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

          <div className="search-wrap" style={{ marginBottom: 12 }}>
            <span className="search-icon"><Icons.Search /></span>
            <input className="input search-input" placeholder="Search messages…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="flex gap-8 flex-wrap" style={{ marginBottom: 12 }}>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 8px" }} onClick={loadMessages}>
              <Icons.Refresh /> Refresh
            </button>
          </div>

          {loadingMsgs
            ? <div className="empty">Loading messages…</div>
            : filtered.length === 0
              ? <div className="empty">No messages yet.</div>
              : (
                <div className="convo-list">
                  {filtered.map((m) => (
                    <button key={m.id} className={`convo-item${activeId === m.id ? " active" : ""}`} onClick={() => setActiveId(m.id)}>
                      <div className="convo-avatar">{(m.student_name || "A")[0].toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="convo-name">{m.student_name || "Anonymous"}</div>
                        <div className="convo-sub">{m.message}</div>
                        <div className="convo-meta">
                          <span className="badge badge-gray">{m.attempt}</span>
                          <span className="badge badge-gray">{m.topic}</span>
                          <span className={`badge ${m.status === "Unread" ? "badge-amber" : "badge-green"}`}>{m.status}</span>
                        </div>
                      </div>
                      <div className="convo-time">{timeLabel(m.created_at)}</div>
                    </button>
                  ))}
                </div>
              )
          }
        </div>
      </div>

      {/* Chat window */}
      <div className="card" style={{ display: "flex", flexDirection: "column" }}>
        {!active
          ? <div className="empty">Select a conversation to view and reply.</div>
          : (
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20 }}>{active.student_name || "Anonymous Student"}</div>
                <div className="text-sm text-muted mt-4">{active.attempt} · {active.topic} · {active.mode}</div>
                <div className="flex gap-8 mt-8">
                  <span className={`badge ${active.status === "Unread" ? "badge-amber" : "badge-green"}`}>{active.status}</span>
                </div>
              </div>

              <hr />

              {/* Student's original message */}
              <div>
                <div className="label" style={{ marginBottom: 8 }}>Student message</div>
                <div className="bubble bubble-student">{active.message}</div>
              </div>

              {/* Replies thread */}
              {replies.length > 0 && (
                <div>
                  <div className="label" style={{ marginBottom: 8 }}>Conversation</div>
                  <div className="chat-messages" ref={chatRef}>
                    {replies.map((r) => (
                      <div key={r.id} className="bubble bubble-you">
                        {r.reply_text}
                        <div className="bubble-time">{timeLabel(r.created_at)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reply box */}
              <div className="field">
                <label className="label">Reply privately</label>
                <textarea className="textarea" placeholder="Write your personal reply here…" value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) sendReply(); }} />
                <div className="flex gap-8 mt-8">
                  <button className="btn btn-primary" onClick={sendReply} disabled={sendingReply || !reply.trim()}>
                    {sendingReply ? <span className="spinner" /> : <Icons.Send />}
                    {sendingReply ? "Sending…" : "Send reply"}
                  </button>
                  <span className="text-xs text-muted" style={{ alignSelf: "center" }}>Ctrl+Enter to send</span>
                </div>
              </div>
            </div>
          )
        }
      </div>
    </div>
  );
}

// ── App Root ──────────────────────────────────────────────────────────────────
export default function CAFinalPortal() {
  const [tab, setTab] = useState("student");
  const [toast, setToast] = useState(null);
  const [inboxUnlocked, setInboxUnlocked] = useState(() => {
    try { return sessionStorage.getItem(LOCK_SESSION_KEY) === "1"; } catch { return false; }
  });

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type, key: Date.now() });
  }, []);

  const handleLock = () => {
    try { sessionStorage.removeItem(LOCK_SESSION_KEY); } catch {}
    setInboxUnlocked(false);
    setTab("student");
  };

  return (
    <>
      <style>{css}</style>
      <div className="portal-root">
        <div className="main">
          {/* Header */}
          <div className="header">
            <div>
              <div className="header-title">CA Final Private Messaging Portal</div>
              <div className="header-sub">Students message you privately · You reply from your inbox · Powered by Supabase</div>
            </div>
            <span className="badge badge-green"><Icons.Shield /> Live &amp; connected</span>
          </div>

          {/* Hero */}
          <div className="hero-grid">
            <div className="card card-dark">
              <div className="card-body">
                <div className="flex flex-wrap gap-8">
                  <span className="badge" style={{ background: "rgba(255,255,255,.1)", color: "white" }}><Icons.Lock /> Private portal</span>
                  <span className="badge" style={{ background: "rgba(74,222,128,.15)", color: "#86efac" }}>No WhatsApp needed</span>
                </div>
                <div className="hero-headline">CA Final students message you through one private link — no phone number shared.</div>
                <div className="hero-sub">Students submit doubts, files, and voice notes. You see every message in your inbox and reply directly. All data is saved in your Supabase database.</div>
                <div className="hero-features">
                  <div className="hero-feat">
                    <div className="hero-feat-title"><Icons.Lock /> Privacy first</div>
                    <div className="hero-feat-desc">Your number and email stay hidden from every student.</div>
                  </div>
                  <div className="hero-feat">
                    <div className="hero-feat-title"><Icons.Attach /> Attachments</div>
                    <div className="hero-feat-desc">Students share PDFs, screenshots, and answer sheets.</div>
                  </div>
                  <div className="hero-feat">
                    <div className="hero-feat-title"><Icons.Headphone /> Voice + text</div>
                    <div className="hero-feat-desc">Record voice notes or type — whatever is easiest.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-body">
                <div className="font-semibold" style={{ fontSize: 16, marginBottom: 6 }}>Your portal is live</div>
                <div className="text-sm text-muted">Messages go straight to Supabase. Refresh your inbox to see new ones.</div>
                <div className="stats-grid">
                  <div className="stat-box"><div className="stat-num">✓</div><div className="stat-label">Supabase connected</div></div>
                  <div className="stat-box"><div className="stat-num">∞</div><div className="stat-label">Messages stored</div></div>
                  <div className="stat-box"><div className="stat-num"><Icons.Shield /></div><div className="stat-label">Private &amp; secure</div></div>
                  <div className="stat-box"><div className="stat-num"><Icons.Inbox /></div><div className="stat-label">Inbox ready</div></div>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div>
            <div className="tabs-bar">
              <button className={`tab-btn${tab === "student" ? " active" : ""}`} onClick={() => setTab("student")}>Student view</button>
              <button className={`tab-btn${tab === "mentor" ? " active" : ""}`} onClick={() => setTab("mentor")} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {inboxUnlocked ? <Icons.Inbox /> : <Icons.Lock />} Your inbox
              </button>
            </div>
          </div>

          {tab === "student" && <StudentPortal onToast={showToast} />}
          {tab === "mentor" && (
            inboxUnlocked
              ? <>
                  <div className="unlock-banner">
                    <div className="unlock-banner-left"><Icons.Shield /> Inbox unlocked — only visible to you this session</div>
                    <button className="btn btn-ghost" style={{ color: "#94a3b8", fontSize: 13, padding: "4px 10px" }} onClick={handleLock}>
                      <Icons.LogOut /> Lock inbox
                    </button>
                  </div>
                  <MentorInbox onToast={showToast} />
                </>
              : <InboxLock onUnlock={() => setInboxUnlocked(true)} />
          )}
        </div>
      </div>

      {toast && <Toast key={toast.key} msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </>
  );
}
