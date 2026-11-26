// The screens about your account: log in, make an account (with an invite code), forgotten
// password, your account page (with deleting it), privacy and terms, and the admin page.

import * as acc from "../account.js";
import { t, mark, longDate } from "../text.js";
import { h } from "../ui.js";
import { state, resetState } from "../state.js";
import * as data from "../data.js";
import { readFiles, applyImport } from "../import.js";

// What the error names of account.js mean, for people
const ERRORS = {
  INVALID_INVITE_CODE: mark("This invite code isn't valid. Check it, or ask the person who gave it to you."),
  WRONG_LOGIN: mark("That email address and password don't match."),
  EMAIL_TAKEN: mark("There is already an account with this email address. Log in, or reset your password."),
  WEAK_PASSWORD: mark("Choose a longer password: at least 8 characters."),
  NOT_CONFIRMED: mark("Confirm your email address first: open the link in the email we sent you."),
  TOO_MANY: mark("Too many tries in a short time. Wait a few minutes and try again."),
  BAD_EMAIL: mark("That doesn't look like an email address."),
  OTHER: mark("Something went wrong. Try again in a moment."),
};
const message = (code) => h("div", { class: "feedback wrong", role: "alert" }, t(ERRORS[code] || ERRORS.OTHER));

const field = (label, input) => h("label", { class: "stack", style: "gap: 6px" }, h("span", { style: "font-weight: 500" }, label), input);
const box = (type, name, autocomplete) => h("input", { class: "answer-box", type, name, autocomplete, required: true, style: "min-height: 48px; font-size: 16px" });

function page(title, lead, ...content) {
  document.title = `${title} · [SITE NAME]`;
  return h("div", { style: "max-width: 460px; margin: 0 auto" }, h("section", { class: "card big" },
    h("h1", {}, title), lead && h("p", { class: "lead" }, lead), ...content));
}

// After logging in: start fresh with this person's results, at their last course.
async function afterLogin() {
  resetState();
  location.hash = "#/";
  await state.render();
}

// ---------- log in ----------
export async function loginScreen() {
  const email = box("email", "email", "email"), password = box("password", "password", "current-password");
  const problem = h("div");
  const form = h("form", { class: "stack", onsubmit: async (event) => {
    event.preventDefault();
    const error = await acc.logIn(email.value, password.value);
    if (error) problem.replaceChildren(message(error));
    else await afterLogin();
  } }, field(t("Email address"), email), field(t("Password"), password), problem,
    h("button", { type: "submit", class: "button primary large" }, t("Log in")));
  return page(t("Log in"), null, form,
    h("p", {}, h("a", { href: "#/forgot" }, t("Forgot your password?"))),
    h("p", { class: "muted" }, t("No account yet? You need an invite code."), " ", h("a", { href: "#/signup" }, t("Make an account"))),
    h("p", { class: "muted" }, h("a", { href: "#/privacy" }, t("Privacy and terms"))));
}

// ---------- make an account ----------
export async function signupScreen() {
  const code = box("text", "invite", "off"), name = box("text", "name", "given-name"), email = box("email", "email", "email");
  const password = box("password", "new-password", "new-password"), again = box("password", "again", "new-password");
  name.required = false;
  const agree = h("input", { type: "checkbox", required: true });
  const problem = h("div");
  const form = h("form", { class: "stack", onsubmit: async (event) => {
    event.preventDefault();
    if (password.value.length < 8) return problem.replaceChildren(message("WEAK_PASSWORD"));
    if (password.value !== again.value) return problem.replaceChildren(h("div", { class: "feedback wrong", role: "alert" }, t("The two passwords are not the same.")));
    const error = await acc.signUp(email.value, password.value, name.value, code.value);
    if (error === "CHECK_EMAIL") {
      form.replaceWith(h("div", { class: "feedback right" }, t("Almost done: we sent you an email. Open the link in it to confirm your address, then log in.")));
    } else if (error) problem.replaceChildren(message(error));
    else await afterLogin();
  } },
    field(t("Invite code"), code), field(t("Your first name (optional)"), name), field(t("Email address"), email),
    field(t("Password (at least 8 characters)"), password), field(t("Password again"), again),
    h("label", { class: "switch" }, agree, h("span", {}, t("I have read the"), " ", h("a", { href: "#/privacy", target: "_blank" }, t("privacy statement and terms")))),
    problem, h("button", { type: "submit", class: "button primary large" }, t("Make my account")));
  return page(t("Make an account"), t("For now the site is open to invited people only. Your invite code is in the message you got."), form,
    h("p", { class: "muted" }, t("Already have an account?"), " ", h("a", { href: "#/login" }, t("Log in"))));
}

// ---------- forgotten password ----------
export async function forgotScreen() {
  const email = box("email", "email", "email");
  const problem = h("div");
  const form = h("form", { class: "stack", onsubmit: async (event) => {
    event.preventDefault();
    const error = await acc.sendPasswordReset(email.value);
    if (error) problem.replaceChildren(message(error));
    else form.replaceWith(h("div", { class: "feedback right" }, t("If there is an account with this address, an email with a link is on its way. The link lets you choose a new password.")));
  } }, field(t("Email address"), email), problem, h("button", { type: "submit", class: "button primary large" }, t("Send me a link")));
  return page(t("Forgot your password?"), t("Fill in your email address and we send you a link to choose a new password."), form,
    h("p", {}, h("a", { href: "#/login" }, t("Back to logging in"))));
}

export async function newPasswordScreen() {
  const password = box("password", "new-password", "new-password");
  const problem = h("div");
  const form = h("form", { class: "stack", onsubmit: async (event) => {
    event.preventDefault();
    if (password.value.length < 8) return problem.replaceChildren(message("WEAK_PASSWORD"));
    const error = await acc.setNewPassword(password.value);
    if (error) problem.replaceChildren(message(error));
    else { await acc.startSession(); await afterLogin(); }
  } }, field(t("New password (at least 8 characters)"), password), problem, h("button", { type: "submit", class: "button primary large" }, t("Save my new password")));
  return page(t("Choose a new password"), null, form);
}

// ---------- privacy and terms (also readable without an account) ----------
const PRIVACY = [
  [mark("What is stored"), [
    mark("Your email address, your first name if you give it, a scrambled version of your password (never the password itself), the invite code you used and the date you made your account."),
    mark("Per course: which pages you read, your answers to the practice questions and when you gave them, your study time, your deadlines and your mock exam scores. Also which course you used last.")]],
  [mark("Where it is kept and who can see it"), [
    mark("The site is served by Cloudflare. Your account and results are kept by Supabase, on servers in Frankfurt, Germany, in the European Union. Each person can only read their own results."),
    mark("The person who runs the site can see the email addresses and names of the accounts, and could look at the data, but only does so to help you or to keep the site working."),
    mark("Nothing is sold or shared, and there are no ads and no tracking cookies. The site only keeps what it needs to keep you logged in. Listening uses the voices of your own browser.")]],
  [mark("Your data and deleting it"), [
    mark("On your account page you can delete your account. That removes your account and all your results at once, and can't be undone."),
    mark("You can also ask for a copy of your data, or for it to be corrected or deleted, by email to the person who gave you your invite code.")]],
  [mark("Terms of use"), [
    mark("For now the site is free and only open to people with an invite code, for their own study. The material was written with the help of an AI (Claude) and checked, but it can still contain mistakes."),
    mark("The site has no connection with Instituto Cervantes, Cambridge, the Staatsexamens NT2, DUO or CNaVT; it only links to their official practice papers."),
    mark("Keep your password to yourself and don't try to get into other people's accounts. The site can change or stop.")]],
]; // mark(): translated where they are shown

export async function privacyScreen() {
  document.title = `${t("Privacy and terms")} · [SITE NAME]`;
  return h("div", { style: "max-width: 760px; margin: 0 auto" }, h("section", { class: "card big" },
    h("h1", {}, t("Privacy and terms")),
    PRIVACY.map(([heading, paragraphs]) => h("div", { class: "stack", style: "gap: 8px" },
      h("h2", {}, t(heading)), paragraphs.map((text) => h("p", {}, t(text))))),
    h("p", {}, h("a", { href: acc.account.user ? "#/" : "#/login" }, t("Back")))));
}

// ---------- your account ----------
export async function accountScreen() {
  const { user, profile } = acc.account;
  const sure = h("input", { type: "checkbox" });
  const problem = h("div");
  document.title = `${t("Your account")} · [SITE NAME]`;
  return h("div", { style: "max-width: 640px; margin: 0 auto" }, h("div", { class: "stack", style: "gap: 24px" },
    h("section", { class: "card big" },
      h("h1", {}, t("Your account")),
      h("p", {}, h("strong", {}, t("Email address")), ` ${user.email}`),
      profile?.display_name && h("p", {}, h("strong", {}, t("Name")), ` ${profile.display_name}`),
      profile?.created_at && h("p", { class: "muted" }, t("Account made on {day}", { day: longDate(profile.created_at.slice(0, 10)) })),
      h("div", { class: "row" },
        h("a", { class: "button", href: "#/new-password" }, t("Change my password")),
        h("button", { type: "button", class: "button", onclick: async () => { await acc.logOut(); resetState(); location.hash = "#/login"; } }, t("Log out")),
        profile?.is_admin && h("a", { class: "button", href: "#/admin" }, t("Admin")))),
    await importPart(),
    h("section", { class: "card" },
      h("h2", {}, t("Delete my account")),
      h("p", {}, t("This removes your account and all your results of every course at once. It can't be undone.")),
      h("label", { class: "switch" }, sure, t("Yes, delete my account and all my results")),
      problem,
      h("div", {}, h("button", { type: "button", class: "button", style: "color: var(--wrong); border-color: var(--wrong)", onclick: async () => {
        if (!sure.checked) return problem.replaceChildren(h("div", { class: "feedback near" }, t("Tick the box first.")));
        const error = await acc.deleteMyAccount();
        if (error) return problem.replaceChildren(message(error));
        resetState();
        location.hash = "#/login";
      } }, t("Delete my account")))),
    h("p", {}, h("a", { href: "#/privacy" }, t("Privacy and terms")))));
}

// ---------- bringing in results from the Streamlit app ----------
async function importPart() {
  const [courses, languages] = await Promise.all([data.courses(), data.languages()]);
  const names = languages.names;
  const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
  const choice = h("select", { class: "answer-box", style: "min-height: 44px; font-size: 16px", "aria-label": t("Course") },
    courses.map((c) => h("option", { value: c.id }, `${capital(names[c.learn][c.explained_in])} · ${names[c.explained_in][c.explained_in]}`)));
  const files = h("input", { type: "file", accept: ".json,application/json", multiple: true, "aria-label": t("Backup file") });
  const result = h("div");
  return h("section", { class: "card" },
    h("h2", {}, t("Bring in results from the old app")),
    h("p", {}, t("In the old app, open the course and download your backup with the 💾 Your data button in the side menu. Then choose the same course here and pick that file. It replaces the results of this course on this site.")),
    h("label", { class: "stack", style: "gap: 6px" }, h("span", { style: "font-weight: 500" }, t("Course")), choice),
    files,
    result,
    h("div", {}, h("button", { type: "button", class: "button primary", onclick: async () => {
      const course = choice.value;
      const found = await readFiles([...files.files], course);
      if (!Object.keys(found).length) return result.replaceChildren(h("div", { class: "feedback wrong" }, t("No results found in these files. Pick the backup file of the old app.")));
      const catalog = await data.catalog(course);
      const summary = applyImport(found, course, catalog);
      await acc.flush();
      resetState();
      result.replaceChildren(h("div", { class: "feedback right" }, t("Done: {units} units, {questions} practised questions and {days} study days brought in.",
        { units: summary.units ?? 0, questions: summary.questions ?? 0, days: summary.days ?? 0 })));
    } }, t("Bring in"))));
}

// ---------- no access (for later, when access ends without payment) ----------
export async function noAccessScreen() {
  return page(t("Your account has no access right now"), t("Ask the person who gave you your invite code."),
    h("div", { class: "row" }, h("button", { type: "button", class: "button", onclick: async () => { await acc.logOut(); resetState(); location.hash = "#/login"; } }, t("Log out"))));
}

// ---------- admin ----------
export async function adminScreen() {
  if (!acc.account.profile?.is_admin) { location.hash = "#/"; return h("div"); }
  const [users, codes] = await Promise.all([acc.admin.users(), acc.admin.codes()]);
  const problem = (result) => result.error && h("div", { class: "feedback wrong" }, result.error.message);
  const code = h("input", { class: "answer-box", style: "min-height: 44px; font-size: 16px", placeholder: t("Code") });
  const note = h("input", { class: "answer-box", style: "min-height: 44px; font-size: 16px", placeholder: t("For whom (only for you)") });
  const max = h("input", { class: "answer-box", type: "number", min: 1, style: "min-height: 44px; font-size: 16px", placeholder: t("Uses (empty: no limit)") });
  const saveCode = async (c, n, m, active) => { const r = await acc.admin.saveCode(c, n, m, active); if (r.error) alert(r.error.message); state.render(); };
  document.title = `${t("Admin")} · [SITE NAME]`;
  return h("div", { class: "stack", style: "gap: 24px" },
    h("section", { class: "card big" }, h("h1", {}, t("Admin")), h("p", { class: "lead" }, t("Invite codes and who has access."))),
    h("section", { class: "card" }, h("h2", {}, t("Invite codes")), problem(codes),
      h("div", { class: "grid", style: "grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))" }, code, note, max,
        h("button", { type: "button", class: "button primary", onclick: () => code.value.trim() && saveCode(code.value, note.value, Number(max.value) || null, true) }, t("Add code"))),
      h("div", { class: "table-box" }, h("table", {},
        h("thead", {}, h("tr", {}, [t("Code"), t("For whom"), t("Used"), t("Active"), ""].map((x) => h("th", {}, x)))),
        h("tbody", {}, (codes.data || []).map((c) => h("tr", {},
          h("td", {}, h("strong", {}, c.code)), h("td", {}, c.note || ""), h("td", {}, `${c.uses}${c.max_uses ? ` / ${c.max_uses}` : ""}`),
          h("td", {}, c.active ? t("yes") : t("no")),
          h("td", {}, h("button", { type: "button", class: "button small", onclick: () => saveCode(c.code, c.note, c.max_uses, !c.active) }, c.active ? t("Switch off") : t("Switch on"))))))))),
    h("section", { class: "card" }, h("h2", {}, t("Accounts")), problem(users),
      h("div", { class: "table-box" }, h("table", {},
        h("thead", {}, h("tr", {}, [t("Email address"), t("Name"), t("Invite code"), t("Made"), t("Last login"), t("Access"), ""].map((x) => h("th", {}, x)))),
        h("tbody", {}, (users.data || []).map((u) => h("tr", {},
          h("td", {}, u.email), h("td", {}, u.display_name || ""), h("td", {}, u.invite_code || ""),
          h("td", {}, u.created_at ? u.created_at.slice(0, 10) : ""), h("td", {}, u.last_sign_in_at ? u.last_sign_in_at.slice(0, 10) : ""),
          h("td", {}, u.has_access ? t("yes") : t("no")),
          h("td", {}, !u.is_admin && h("button", { type: "button", class: "button small", onclick: async () => {
            const r = await acc.admin.setAccess(u.id, !u.has_access, u.access_until); if (r.error) alert(r.error.message); state.render();
          } }, u.has_access ? t("Take away access") : t("Give access"))))))))));
}
