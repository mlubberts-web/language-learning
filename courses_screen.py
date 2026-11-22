"""Choosing a course, and switching between the courses you follow.

Which courses you follow is kept in your profile: on your own computer results/profile.json,
online a row 'profile' in the database, like your other results:

    {"courses": ["es_from_en", "en_from_nl"], "last": "en_from_nl", "ui_lang": "nl"}

'last' is the course that opens next time; 'ui_lang' the language of the screens before a course
is open (this choice screen and the login).
"""
import os

import streamlit as st

import course
import languages
import storage
import ui_text
from ui_text import t

FLAGS = {"es": "🇪🇸", "en": "🇬🇧", "nl": "🇳🇱"}
LANGUAGE_NAMES = {"en": "English", "nl": "Nederlands", "es": "Español"}  # each in its own language
# What stays in the session when you switch courses: who you are, not what you were doing.
KEEP = {"user", "time_zone", "is_admin", "database", "profile", "ui_lang"}


def profile_file():
    return course.RESULTS / "profile.json"


def profile():
    """Your profile, read once per visit and then kept in the session."""
    if "profile" not in st.session_state:
        st.session_state.profile = storage.load(profile_file(), {"courses": [], "last": None})
    return st.session_state.profile


def save_profile():
    storage.save(profile_file(), profile())


def open_course(course_id):
    """Opens a course, adding it to your courses the first time. Everything of the course you were
    in leaves the session, so nothing of it mixes with the new one."""
    data = profile()
    if course_id not in data["courses"]:
        data["courses"].append(course_id)
    data["last"] = course_id
    data["ui_lang"] = st.session_state.get("ui_lang", data.get("ui_lang", "en"))
    save_profile()
    for key in [k for k in st.session_state if k not in KEEP]:  # list() first: the loop deletes
        del st.session_state[key]
    st.session_state.course = course_id


def set_ui_lang():
    profile()["ui_lang"] = st.session_state.ui_lang
    save_profile()


def course_name(course_id, lang=None):
    """('🇪🇸 Spanish', 'explained in English') in the interface language."""
    learn, base = next((l, b) for c, l, b in course.PLANNED if c == course_id)
    ui = lang or ui_text.interface()
    name = languages.name(learn, ui)
    return f"{FLAGS[learn]} {name[:1].upper() + name[1:]}", t("explained in {language}",
                                                               language=languages.name(base, ui))


def start():
    """Runs after the login, before anything else is shown. Opens your last course, or shows the
    course choice and stops the page there."""
    if os.environ.get("COURSE"):  # on your own computer, started with another course
        st.session_state.setdefault("course", os.environ["COURSE"])
        return
    data = profile()
    st.session_state.setdefault("ui_lang", data.get("ui_lang", "en"))
    if st.session_state.get("course"):
        return
    if data["last"] and course.is_available(data["last"]):
        st.session_state.course = data["last"]
        return
    if not data["courses"] and has_old_results():
        open_course(course.DEFAULT)  # results from before there was a choice: the Spanish course
        return
    choice_screen()
    st.stop()


def has_old_results():
    """True when the Spanish course already has results (from before courses could be chosen)."""
    try:
        return bool(storage.load(course.results_file("progress", course.DEFAULT), {}))
    except storage.StorageError:
        return False


def language_choice(save=True):
    """English / Nederlands / Español for the screens before a course is open. save=False on the
    landing page: nobody is logged in yet, so there is no profile to keep it in."""
    st.segmented_control("🌐", list(LANGUAGE_NAMES), key="ui_lang", required=True,
                         on_change=set_ui_lang if save else None,
                         format_func=LANGUAGE_NAMES.get, label_visibility="collapsed")


def choice_screen(adding=False):
    """The cards of the six courses. 'adding' is True when you came from the sidebar."""
    if not adding:  # inside a course, the screens speak the language of that course
        language_choice()
    st.title(t("Add a course") if adding else t("Choose a course"))
    st.caption(t("Each course takes you from A1 to C2 with reading material, exercises, a study plan "
                 "and mock exams. You can follow more than one course; your results stay apart."))
    course_cards(buttons=True)


def course_cards(buttons):
    """A card per course. With buttons to open or start a course; without (the landing page) a
    card only says whether the course is there yet."""
    following = profile()["courses"] if buttons else []
    columns = st.columns(3)
    for n, (course_id, learn, base) in enumerate(course.PLANNED):
        title, subtitle = course_name(course_id)
        with columns[n % 3].container(border=True, key=f"course_{course_id}"):
            st.markdown(f"### {title}")
            st.caption(subtitle)
            if not buttons:
                st.markdown(t("✅ Available") if course.is_available(course_id) else t("🕓 Coming soon"))
            elif not course.is_available(course_id):
                st.button(t("Coming soon"), key=f"open_course_{course_id}", disabled=True, width="stretch")
            elif course_id in following:
                st.button(t("Open"), key=f"open_course_{course_id}", on_click=open_course, args=(course_id,),
                          width="stretch")
            else:
                st.button(t("Start this course"), key=f"open_course_{course_id}", type="primary",
                          on_click=open_course, args=(course_id,), width="stretch")


def sidebar_part():
    """The open course, with a switch to your other courses and a button to add one."""
    following = [c for c in profile()["courses"] if course.is_available(c)]
    current = course.current()
    if current not in following:
        following.append(current)
    if len(following) > 1:
        st.selectbox(t("Course"), following, index=following.index(current), key="course_switch",
                     format_func=lambda c: " · ".join(course_name(c)),
                     on_change=lambda: open_course(st.session_state.course_switch))
    st.button(t("➕ Add a course"), key="add_course", width="stretch",
              on_click=lambda: st.session_state.update(view="courses"))
