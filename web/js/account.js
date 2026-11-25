// Accounts and saving results online, through Supabase (the database of the website).
// The rules of who may see what are in the database itself (supabase/setup.sql): everyone can
// only read and write their own rows, and only while their account has access.
//
// Results are rows in the table "results": one per course part, named like the files of the
// app ("es_from_en_practice", "es_from_en_progress", "es_from_en_study_log") plus "profile".

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const account = {
  user: null,     // the person logged in (email, id), or null
  profile: null,  // their row in "profiles": display_name, has_access, is_admin ...
  results: {},    // name -> data, loaded once after logging in
};

// ---------- logging in and out ----------
// Reads the session kept by the browser (you stay logged in) and the profile and results.
export async function startSession() {
  const { data } = await supabase.auth.getSession();
  account.user = data.session?.user || null;
  if (account.user) await loadProfileAndResults();
  return account.user;
}

async function loadProfileAndResults() {
  const profile = await supabase.from("profiles").select("*").eq("id", account.user.id).maybeSingle();
  if (profile.error) throw profile.error;
  account.profile = profile.data;
  account.results = {};
  if (account.profile?.has_access) {
    const rows = await supabase.from("results").select("name, data");
    if (rows.error) throw rows.error;
    for (const row of rows.data) account.results[row.name] = row.data;
  }
}

export async function logIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return explain(error);
  account.user = data.user;
  await loadProfileAndResults();
  return null;
}

// Makes an account. The invite code is checked by the database; a wrong one stops the sign-up.
export async function signUp(email, password, name, inviteCode) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(), password,
    options: { data: { name: name.trim(), invite_code: inviteCode.trim() }, emailRedirectTo: location.origin + location.pathname },
  });
  if (error) return explain(error);
  if (!data.session) return "CHECK_EMAIL"; // the project asks people to confirm their email first
  account.user = data.user;
  await loadProfileAndResults();
  return null;
}

export async function logOut() {
  await flush();
  await supabase.auth.signOut();
  account.user = null; account.profile = null; account.results = {};
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}${location.pathname}#/new-password` });
  return error ? explain(error) : null;
}

export async function setNewPassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  return error ? explain(error) : null;
}

export async function deleteMyAccount() {
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return explain(error);
  await supabase.auth.signOut();
  account.user = null; account.profile = null; account.results = {};
  return null;
}

// Turns an error of Supabase into one of a few known names, which the screens translate.
function explain(error) {
  const text = `${error.message || ""} ${error.code || ""}`;
  if (/INVALID_INVITE_CODE|Database error saving new user/i.test(text)) return "INVALID_INVITE_CODE";
  if (/Invalid login credentials/i.test(text)) return "WRONG_LOGIN";
  if (/already registered|already been registered|user_already_exists/i.test(text)) return "EMAIL_TAKEN";
  if (/Password should|weak_password/i.test(text)) return "WEAK_PASSWORD";
  if (/Email not confirmed/i.test(text)) return "NOT_CONFIRMED";
  if (/rate limit|over_email_send_rate_limit|too many/i.test(text)) return "TOO_MANY";
  if (/invalid.*email|email_address_invalid/i.test(text)) return "BAD_EMAIL";
  console.error(error);
  return "OTHER";
}

// ---------- saving results ----------
// Changes are collected and sent a moment later, so many quick answers make one save.
const waiting = new Map();
let timer = null;

export function saveResult(name, data) {
  if (!account.user) return;
  account.results[name] = data;
  waiting.set(name, data);
  clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}

export async function flush() {
  clearTimeout(timer);
  if (!waiting.size || !account.user) return;
  const rows = [...waiting].map(([name, data]) => ({ user_id: account.user.id, name, data, updated_at: new Date().toISOString() }));
  waiting.clear();
  const { error } = await supabase.from("results").upsert(rows);
  if (error) { // keep them, and try again with the next save
    for (const row of rows) if (!waiting.has(row.name)) waiting.set(row.name, row.data);
    console.error(error);
  }
}

// When the tab is closed or hidden (a phone locking its screen), save straight away.
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

// ---------- the admin page ----------
export const admin = {
  users: () => supabase.rpc("admin_users"),
  setAccess: (person, allowed, until) => supabase.rpc("admin_set_access", { person, allowed, until: until || null }),
  codes: () => supabase.rpc("admin_invite_codes"),
  saveCode: (code, note, maxUses, active) => supabase.rpc("admin_save_invite_code",
    { new_code: code, new_note: note || null, new_max_uses: maxUses || null, is_active: active }),
};
