"""Logging in and making an account, only for the online version of the app.

On your own computer there are no secrets, so start() does nothing and everything is saved in files.
Online, the app's secrets (typed into Streamlit Community Cloud, see DEPLOY.md) look like this:

    [supabase]
    url = "https://abcdefgh.supabase.co"
    key = "sb_secret_..."

    [signup]
    code = "the invite code"      # leave this part out to switch making accounts off

    [users.menno]
    password = "a long password"
    timezone = "Europe/Amsterdam"
    admin = true                  # may reset passwords and remove accounts

Each [users.<name>] part is one person. Everyone else makes their own account with the invite code;
those accounts are kept in the database (see accounts.py). Results are kept apart by name.
After logging in, the address in the browser gets a ?login=... part: bookmark that address and the
app logs you in by itself next time.
"""
import hashlib, hmac, time
from zoneinfo import available_timezones

import streamlit as st

import accounts
import storage
from storage import StorageError
import courses_screen
import ui_text
from ui import hero
from ui_text import mark, t

DEFAULT_TIME_ZONE = "Europe/Amsterdam"
DATABASE_DOWN = mark("The online database can't be reached right now. Try again in a minute.")


def secrets_part(name):
    """A part of the secrets, such as 'users', or None when it is missing (always on your own computer)."""
    try:
        return st.secrets[name]
    except Exception:  # no secrets file at all, or no such part in it
        return None


def token(name, secret, key):
    """The code in a bookmarked login address. It changes when the password changes, and nobody
    can make one without knowing the database key, which only the server has."""
    return hmac.new(key.encode(), f"{name}:{secret}".encode(), hashlib.sha256).hexdigest()[:32]


def find(name, database):
    """The account with this name, from the secrets or else from the database, or None.
    'secret' is what the bookmark code is made from: the password for accounts in the secrets
    (as before), the password hash for accounts in the database."""
    users = secrets_part("users") or {}
    if name in users:
        person = users[name]
        return {"name": name, "password": person["password"], "secret": person["password"],
                "timezone": person.get("timezone", DEFAULT_TIME_ZONE),
                "admin": bool(person.get("admin", False))}
    row = accounts.get(database, name)  # may raise StorageError
    if row is None:
        return None
    return {"name": name, "hash": row["password_hash"], "secret": row["password_hash"],
            "timezone": row["timezone"], "admin": False}


def password_right(account, password):
    if "password" in account:
        return hmac.compare_digest(password, account["password"])
    return accounts.password_matches(password, account["hash"])


def remember(account):
    """Keeps who is logged in in the session, so button actions (which Streamlit runs before
    start()) know it too."""
    st.session_state.user = account["name"]
    st.session_state.time_zone = account["timezone"]
    st.session_state.is_admin = account["admin"]


def log_in(account, key):
    """Logs in after the form, and puts the bookmark code in the address."""
    remember(account)
    st.query_params["login"] = f"{account['name']}.{token(account['name'], account['secret'], key)}"
    st.rerun()


def start():
    """Runs at the top of every page load. Returns the name of who is logged in, or None on your own
    computer. Online, without a login it shows the login screen and stops the page there."""
    settings = secrets_part("supabase")
    if settings is None:
        return None  # nothing in the session: storage.py uses files and clock.py the computer's clock
    database = {"url": settings["url"], "key": settings["key"]}
    if "user" not in st.session_state or "time_zone" not in st.session_state:
        account = None
        try:
            account = from_bookmark(database)
        except StorageError:
            st.error(t(DATABASE_DOWN))
        if account is None:
            login_screen(database)
            st.stop()  # nothing else of the page is shown until you log in
        remember(account)
    name = st.session_state.user
    st.session_state.database = storage.database_session(settings["url"], settings["key"], name)
    return name


def from_bookmark(database):
    """The account in a bookmarked address (?login=name.code), when its code is right."""
    name, _, code = st.query_params.get("login", "").partition(".")  # 'menno.ab12' -> 'menno', '.', 'ab12'
    if not name:
        return None
    account = find(name, database)
    if account and hmac.compare_digest(code, token(name, account["secret"], database["key"])):
        return account
    return None


def guess_language():
    """The visitor's language from their browser ('nl-NL' -> 'nl'), if the site has it; else English."""
    try:
        code = (st.context.locale or "en")[:2].lower()
    except Exception:
        code = "en"
    return code if code in ui_text.LANGUAGES else "en"


def login_screen(database):
    """The landing page for visitors who are not logged in: what the site is, its courses, and
    logging in or making an account."""
    st.session_state.setdefault("ui_lang", guess_language())
    courses_screen.language_choice(save=False)  # nobody is logged in yet, so nothing to save it in
    hero("📘 Language Learning", t("Learn a language properly, from A1 to C2"),
         t("Spanish, English and Dutch, explained in your own language. Read, practise, follow a study "
           "plan to your own deadlines and train for the official exams."))
    st.write("")
    columns = st.columns(3)
    for column, (title, text) in zip(columns, FEATURES):
        with column.container(border=True):
            st.markdown(f"#### {t(title)}")
            st.caption(t(text))
    st.subheader(t("The courses"))
    courses_screen.course_cards(buttons=False)
    st.subheader(t("Log in or make an account"))
    if secrets_part("signup") is None:
        login_form(database)
    else:
        log_in_tab, new_tab = st.tabs([t("Log in"), t("Create an account")])
        with log_in_tab:
            login_form(database)
        with new_tab:
            signup_form(database)
    import privacy  # here: privacy.py imports this file, so importing it at the top would go round in a circle
    privacy.privacy_part()


# The three cards on the landing page: (title, text), translated where they are shown.
FEATURES = [(mark("📖 Read"), mark("Clear lessons for every level, with tables, examples and the mistakes to avoid.")),
            (mark("✍️ Practise"), mark("Thousands of questions in nine exercise types, from single words to whole "
                                       "sentences, with listening and a daily review.")),
            (mark("🗓️ Plan"), mark("Set your deadlines and get a list for every day. The plan adapts to how fast "
                                  "you go."))]


def login_form(database):
    with st.form("login"):
        name = st.text_input(t("Name")).strip().lower()
        password = st.text_input(t("Password"), type="password")
        sent = st.form_submit_button(t("Log in"), type="primary")
    if sent:
        try:
            account = find(name, database)
        except StorageError:
            st.error(t(DATABASE_DOWN))
            return
        if account and password_right(account, password):
            log_in(account, database["key"])
        time.sleep(1)  # makes guessing passwords slow
        st.error(t("That name and password don't match."))


def time_zones():
    """The time zones to choose from, such as Europe/Madrid, and the one the browser uses."""
    zones = sorted(z for z in available_timezones() if "/" in z and not z.startswith(("Etc/", "SystemV/")))
    try:
        guess = st.context.timezone  # the visitor's own time zone, as their browser reports it
    except Exception:
        guess = None
    return zones, guess if guess in zones else DEFAULT_TIME_ZONE


def signup_form(database):
    zones, guess = time_zones()
    with st.form("signup"):
        code = st.text_input(t("Invite code"), type="password",
                             help=t("You get this from the person who sent you the link."))
        name = st.text_input(t("Name"), help=t("You log in with it. Small letters and digits, 2 to 20."))
        password = st.text_input(t("Password"), type="password",
                                 help=t("At least {count} characters.", count=accounts.MIN_PASSWORD))
        again = st.text_input(t("Password again"), type="password")
        zone = st.selectbox(t("Your time zone"), zones, index=zones.index(guess),
                            help=t("Decides when a new day starts in your study plan."))
        sent = st.form_submit_button(t("Create my account"), type="primary")
    if not sent:
        return
    name = name.strip().lower()
    if not hmac.compare_digest(code.strip(), str(secrets_part("signup")["code"])):
        time.sleep(1)  # makes guessing the code slow
        st.error(t("That invite code isn't right."))
    elif not accounts.valid_name(name):
        st.error(t("Choose a name of 2 to 20 small letters or digits (- and _ are allowed too), without spaces."))
    elif len(password) < accounts.MIN_PASSWORD:
        st.error(t("Choose a password of at least {count} characters.", count=accounts.MIN_PASSWORD))
    elif password != again:
        st.error(t("The two passwords are not the same."))
    else:
        try:
            made = name not in (secrets_part("users") or {}) and accounts.create(database, name, password, zone)
            account = find(name, database) if made else None
        except StorageError:
            st.error(t(DATABASE_DOWN))
            return
        if not made:
            st.error(t("That name is already taken. Choose another one."))
            return
        log_in(account, database["key"])


def log_out():
    st.query_params.clear()
    for widget_key in list(st.session_state):  # list() first: the loop changes what it walks over
        del st.session_state[widget_key]


def sidebar_part(name):
    """Who is logged in, with a button to log out. Only online."""
    st.caption(t("Logged in as **{name}**. Bookmark this page to log in by itself next time.",
                 name=name.capitalize()))
    st.button(t("Log out"), key="log_out", on_click=log_out, width="stretch")


# ---------- for admins: the accounts people made ----------
# The buttons use on_click: Streamlit runs those before the page is drawn, so the list and the
# message below already show the result of the click.

def admin_did(problem=None, done=None):
    """What the last admin click did, shown at the top of the Accounts part."""
    st.session_state.admin_message = ("error", problem) if problem else ("success", done)


def admin_set_password(database):
    who, new = st.session_state.admin_password_who, st.session_state.admin_new_password
    if len(new) < accounts.MIN_PASSWORD:
        return admin_did(t("Choose a password of at least {count} characters.", count=accounts.MIN_PASSWORD))
    try:
        accounts.set_password(database, who, new)
    except StorageError:
        return admin_did(t(DATABASE_DOWN))
    admin_did(done=t("{name} has a new password. Their old bookmark stops working.", name=who))


def admin_remove(database):
    who = st.session_state.admin_remove_who
    if not st.session_state.admin_remove_sure:
        return admin_did(t("Tick the box first."))
    try:
        accounts.remove(database, who)
    except StorageError:
        return admin_did(t(DATABASE_DOWN))
    admin_did(done=t("{name} and all their results were removed.", name=who))


def admin_part():
    """For admins only: the accounts people made, with a new password or removing one."""
    if not st.session_state.get("is_admin"):
        return
    database = st.session_state.database
    message = st.session_state.pop("admin_message", None)  # (kind, text) of the last click
    with st.expander(t("👥 Accounts"), expanded=message is not None):  # open to show the message
        if message:
            kind, text = message
            (st.error if kind == "error" else st.success)(text)
        if secrets_part("signup") is None:
            st.caption(t("Making accounts is switched off. Add a [signup] part with a code to the "
                         "secrets to switch it on (see DEPLOY.md)."))
        else:
            st.caption(t("New people make their own account with the app's address and the invite "
                         "code from the secrets. Accounts written in the secrets are changed there."))
        try:
            people = accounts.every(database)
        except StorageError:
            st.error(t(DATABASE_DOWN))
            return
        if not people:
            st.caption(t("Nobody has made an account yet."))
            return
        for person in people:
            st.markdown(f"**{person['name']}** · {person['timezone']} · "
                        + t("since {day}", day=person["created"]))
        names = [person["name"] for person in people]
        with st.form("admin_password", clear_on_submit=True):
            st.selectbox(t("Account"), names, key="admin_password_who")
            st.text_input(t("New password"), type="password", key="admin_new_password")
            st.form_submit_button(t("Set new password"), width="stretch",
                                  on_click=admin_set_password, args=(database,))
        with st.form("admin_remove", clear_on_submit=True):
            st.selectbox(t("Account"), names, key="admin_remove_who")
            st.checkbox(t("Yes, remove this account and all its results"), key="admin_remove_sure")
            st.form_submit_button(t("Remove account"), width="stretch",
                                  on_click=admin_remove, args=(database,))

