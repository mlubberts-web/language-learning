"""Privacy and terms of use: what the site stores, where, who can see it, and how to delete it.
Shown as a folding part in the sidebar and on the login screen. Online, people who made their own
account can delete it here, with all their results."""
import streamlit as st

import accounts
import login
from storage import StorageError
from ui_text import mark, t

# (heading, paragraphs). Every text goes through t() where it is shown.
PRIVACY = [
    (mark("What is stored"), [
        mark("On your own computer (start.bat) everything stays in the results folder next to app.py. "
             "Nothing is sent anywhere."),
        mark("Online: your name, a scrambled version of your password (never the password itself), your "
             "time zone and the date you made your account. Per course: which pages you read, your answers "
             "to the practice questions and when you gave them, your study time, your deadlines and your "
             "mock exam scores. Also which courses you follow and the language of the screens."),
    ]),
    (mark("Where it is kept and who can see it"), [
        mark("The site runs on Streamlit Community Cloud and keeps the results in a Supabase database, "
             "both with servers in the United States. Only the site's own server can read the database. "
             "The person who runs the site can see the names of the accounts and could look at the data, "
             "but only does so to help you."),
        mark("Nothing is sold or shared, and there are no ads and no tracking. Streamlit and Supabase keep "
             "their own technical logs, like every web host. Listening uses the voices of your own "
             "browser."),
    ]),
    (mark("Your data and deleting it"), [
        mark("💾 Your data in the sidebar downloads all your results of the open course."),
        mark("Delete my account (below, online) removes your account and all your results at once. "
             "This can't be undone. For an account the site's owner made for you, ask them."),
    ]),
    (mark("Terms of use"), [
        mark("The site is free, for your own study. The material was written with the help of an AI "
             "(Claude) and checked, but it can still contain mistakes. The site has no connection with "
             "Instituto Cervantes, Cambridge, the Staatsexamens NT2, DUO or CNaVT; it only links to their "
             "official practice papers."),
        mark("The site can change or stop, so download a backup now and then. Keep your login and your "
             "bookmark to yourself, and don't try to get into other people's accounts."),
    ]),
]


def delete_own_account():
    """The click on Delete my account: removes the account and its results, then logs out."""
    if not st.session_state.get("delete_sure"):
        st.session_state.delete_message = t("Tick the box first.")
        return
    try:
        accounts.remove(st.session_state.database, st.session_state.user)
    except StorageError:
        st.session_state.delete_message = t(login.DATABASE_DOWN)
        return
    login.log_out()  # clears the session: the next page is the login screen


def can_delete_own_account():
    """Online, for accounts made with the invite code. Accounts written in the secrets are changed
    there, by the site's owner."""
    user = st.session_state.get("user")
    return bool(user and st.session_state.get("database") and user not in (login.secrets_part("users") or {}))


def privacy_part():
    with st.expander(t("🔒 Privacy and terms")):
        for heading, paragraphs in PRIVACY:
            st.markdown(f"**{t(heading)}**")
            for paragraph in paragraphs:
                st.caption(t(paragraph))
        if can_delete_own_account():
            message = st.session_state.pop("delete_message", None)
            if message:
                st.error(message)
            st.checkbox(t("Yes, delete my account and all my results"), key="delete_sure")
            st.button(t("Delete my account"), key="delete_account", on_click=delete_own_account,
                      width="stretch")
