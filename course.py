"""Which course you are following, and where its files are. No screens here.

A course is one language to learn, explained in another language. Its id says both, for example
es_from_en: Spanish, explained in English. Each course has:

    courses/<id>/course.json         what the course is (see below)
    courses/<id>/catalog.json        the list of its PDFs (made by build_catalog.py)
    courses/<id>/content/            the source of each PDF, including its exercises
    courses/<id>/themes/             the themed word lists
    courses/<id>/verbs_in_context/   sentences for practising verb forms in context
    static/<id>/                     the PDFs (under static/ so the browser can open them)

Your results are kept per course, so two courses never mix: on your own computer in
results/<id>_practice.json and so on, online in rows with the same names.

Which course is open is kept in the session (st.session_state.course), like the time zone in
clock.py. Outside a running page (in the tests) it is the first course, es_from_en.
"""
import json, os
from functools import lru_cache
from pathlib import Path

from clock import session_value

HERE = Path(__file__).parent
COURSES = HERE / "courses"
RESULTS = HERE / "results"
DEFAULT = "es_from_en"


def current():
    """The id of the course that is open, for example 'es_from_en'. On your own computer you can
    also start the app with another course: set COURSE=nl_from_en before 'streamlit run'."""
    return session_value("course") or os.environ.get("COURSE") or DEFAULT


def is_chosen():
    """True when a course is open: chosen in this session, or set with COURSE. Outside a running
    page (the tests) the default course counts as open."""
    from clock import running  # here, so this file still loads without Streamlit
    return bool(session_value("course") or os.environ.get("COURSE") or not running())


def folder(course_id=None):
    return COURSES / (course_id or current())


def pdf_folder(course_id=None):
    return HERE / "static" / (course_id or current())


def pdf_url(file, course_id=None):
    """The address of a PDF for the browser (Streamlit serves everything in static/)."""
    return f"/app/static/{course_id or current()}/{file}"


def results_file(kind, course_id=None):
    """Where results of one kind are kept: kind is 'progress', 'practice' or 'study_log'.
    The file name, without .json, is also the name of the row in the online database."""
    return RESULTS / f"{course_id or current()}_{kind}.json"


def info(course_id=None):
    """The contents of course.json: the languages, the title and so on."""
    return _read_info(course_id or current())


@lru_cache  # read once per course: the file never changes while the app runs
def _read_info(course_id):
    return json.loads((folder(course_id) / "course.json").read_text(encoding="utf-8"))


def all_ids():
    """Every course that has a course.json, in alphabetical order."""
    return sorted(path.parent.name for path in COURSES.glob("*/course.json"))


# The six courses of the site, in the order they are shown: (id, language you learn, explained in).
PLANNED = [("es_from_en", "es", "en"), ("es_from_nl", "es", "nl"), ("en_from_nl", "en", "nl"),
           ("en_from_es", "en", "es"), ("nl_from_en", "nl", "en"), ("nl_from_es", "nl", "es")]


def is_available(course_id):
    """True when the course exists and has at least one PDF; the others are 'coming soon'."""
    path = COURSES / course_id / "catalog.json"
    return path.exists() and bool(json.loads(path.read_text(encoding="utf-8")))
