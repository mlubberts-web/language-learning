"""Small pieces shared by app.py and the other screen files."""
from pathlib import Path

import streamlit as st

import course
import study_log


def log_file():
    """The study log of the open course."""
    return course.results_file("study_log")


def go_home():
    st.session_state.view = "home"
    st.session_state.level = None


def go_level(level):
    st.session_state.view = "level"
    st.session_state.level = level


def go_view(view):
    st.session_state.view = view
    st.session_state.level = None


def hero(eyebrow, title, text, share=None):
    """The dark banner at the top of a screen. 'share' is the filled part of the bar, 0 to 1;
    without it there is no bar (the landing page)."""
    bar = (f'<div class="hero-track"><div class="hero-fill" style="width:{share:.1%}"></div></div>'
           if share is not None else "")
    st.html(f'<div class="hero"><div class="hero-eyebrow">{eyebrow}</div>'
            f'<div class="hero-title">{title}</div><div class="hero-text">{text}</div>{bar}</div>')


# ---------- study log: the time you study each day ----------
def log_data():
    """The study log, read once and then kept in the session."""
    if "study_log" not in st.session_state:
        st.session_state.study_log = study_log.load(log_file())
    return st.session_state.study_log


def save_log():
    study_log.save(log_file(), log_data())


def log_activity(kind, first_try=None):
    """Counts an answer ('answer') or a page you read ('page') towards today's study time.
    first_try: for an answer that is a first try, True when right and False when wrong."""
    study_log.add_activity(log_data(), kind)
    if first_try is not None:
        study_log.add_result(log_data(), first_try)
    save_log()


def log_overrule():
    """'I was actually right' on a first try: counts it as right in today's accuracy."""
    study_log.overrule_result(log_data())
    save_log()
