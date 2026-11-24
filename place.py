"""Keeps your place (screen, level, PDF, page) in the web address.

Streamlit keeps everything about your visit in the server's memory. When the connection breaks
(a phone that locks its screen, a short break, the online app going to sleep) the page reconnects
as a new visit and would start at the home screen. The web address survives that, so after every
run the place is written into it, and a new visit reads it back once.

An address then looks like:  ...?login=ana.ab12&c=nl_from_es&screen=reader&pdf=a2_03&page=4
The login part is login.py's; this file only uses c, screen, level, pdf and page.

The two plain functions below (where_now, place_back) don't use Streamlit, so test_place.py
can check them; remember() and restore() connect them to the page."""
import streamlit as st

KEYS = ("c", "screen", "level", "pdf", "page")  # the parts of the address this file uses
# Screens that can simply be opened again. A practice session or a running mock exam lives only
# in memory, so after a lost connection you come back to where that session started.
PLAIN = {"home", "level", "reader", "practice", "themes", "mock", "schedule", "progress"}


def where_now(state):
    """The place to write in the address, from the session state (a dict-like object).
    Returns a dict such as {"screen": "reader", "level": "A2", "pdf": "a2_03", "page": "4"}."""
    view = state.get("view", "home")
    if view == "drill":  # a practice session: remember where it came from
        back = (state.get("drill") or {}).get("back") or ("home",)
        if back[0] == "pdf":
            return {"screen": "practice", "pdf": back[1]}
        if back[0] == "level":
            return {"screen": "level", "level": back[1]}
        if back[0] == "view" and back[1] in PLAIN:
            return {"screen": back[1]}
        return {"screen": "home"}
    if view in ("mock_run", "mock_result"):
        return {"screen": "mock"}
    if view == "level" and state.get("level"):
        return {"screen": "level", "level": state["level"]}
    if view == "reader" and state.get("current"):
        return {"screen": "reader", "pdf": state["current"], "page": str(state.get("page", 0))}
    if view == "practice" and state.get("practice_pdf"):
        return {"screen": "practice", "pdf": state["practice_pdf"]}
    if view in PLAIN - {"level", "reader", "practice"}:
        return {"screen": view}
    return {"screen": "home"}


def place_back(address, by_id, levels, page_count):
    """What to put back in the session state from an address (a dict of its parts).
    by_id: the PDFs of the course by id; levels: the levels of the course; page_count(pdf) gives
    the number of pages. Anything that doesn't fit the course (an old link, a typo) gives {},
    which means: start at the home screen as usual."""
    screen = address.get("screen")
    pdf = by_id.get(address.get("pdf", ""))
    if screen == "level" and address.get("level") in levels:
        return {"view": "level", "level": address["level"]}
    if screen == "reader" and pdf:
        try:
            page = int(address.get("page", 0))
        except ValueError:
            page = 0
        page = max(0, min(page_count(pdf) - 1, page))  # a page that exists in this PDF
        return {"view": "reader", "current": pdf["id"], "level": pdf["level"], "page": page,
                "page_jump": page + 1}
    if screen == "practice" and pdf:
        return {"view": "practice", "practice_pdf": pdf["id"], "level": pdf["level"]}
    if screen in PLAIN - {"home", "level", "reader", "practice"}:
        return {"view": screen}
    return {}


def restore(course_id, by_id, levels, page_count):
    """Once per visit: open the place from the address, if it belongs to the open course."""
    if st.session_state.get("place_restored"):
        return
    st.session_state.place_restored = True
    address = {key: st.query_params.get(key) for key in KEYS if st.query_params.get(key) is not None}
    if address.get("c") == course_id:
        st.session_state.update(place_back(address, by_id, levels, page_count))


def remember(course_id):
    """After every run: write the current place in the address (without reloading the page)."""
    wanted = {"c": course_id, **where_now(st.session_state)}
    for key in KEYS:
        if key in wanted:
            if st.query_params.get(key) != wanted[key]:  # only change what changed
                st.query_params[key] = wanted[key]
        elif key in st.query_params:
            del st.query_params[key]
