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
import json
from functools import lru_cache
from pathlib import Path

from clock import session_value

HERE = Path(__file__).parent
COURSES = HERE / "courses"
RESULTS = HERE / "results"
DEFAULT = "es_from_en"


def current():
    """The id of the course that is open, for example 'es_from_en'."""
    return session_value("course") or DEFAULT


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
