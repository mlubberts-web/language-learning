"""Language Learning - reader and progress tracker, for every course.
Run with:  streamlit run app.py   (or double-click start.bat on Windows).

Screens: home (all levels) -> level (the PDFs in one level) -> reader (one PDF).
The practice screens are in practice_screen.py.
To add a screen, write a function for it and add it to SCREENS at the bottom."""
import base64, json, os
from pathlib import Path

import pymupdf
import streamlit as st

import clock
import course
import courses_screen as courses
import extra_screens as extra
import login
import practice_screen as practice
import practice_store as store
import progress_screen as progress
import schedule_screen as schedule
import storage
import languages
from ui import go_home, go_level, go_view, hero, log_activity, log_data, save_log
from ui_text import mark, t

HERE = Path(__file__).parent
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
# mark() only marks a text for translation; t() translates it where it is shown.
LEVEL_NAMES = {"A1": mark("Beginner"), "A2": mark("Elementary"), "B1": mark("Intermediate"),
               "B2": mark("Upper intermediate"), "C1": mark("Advanced"), "C2": mark("Mastery")}
PAGE_WIDTHS = {mark("Small"): 760, mark("Medium"): 1000, mark("Large"): 1300}  # maximum width, in pixels
STATUS_LABEL = {"done": mark("✅ Done"), "reading": mark("📖 In progress"), "new": mark("○ Not started")}
SITE_NAME = "Language Learning"  # the working name of the site

STYLE = """
<style>
  h1, h2, h3, h4 { color: #1f2a44; }
  .hero { background: #1f2a44; color: #fff; border-radius: 14px; padding: 26px 30px; }
  .hero-eyebrow { color: #f0b9b2; font-size: .8rem; font-weight: 700; letter-spacing: .08em;
                  text-transform: uppercase; }
  .hero-title { font-size: 2.1rem; font-weight: 700; line-height: 1.2; margin: 4px 0 6px; }
  .hero-text { color: #d9deea; }
  .hero-track { background: rgba(255, 255, 255, .2); border-radius: 99px; height: 10px; margin-top: 16px; }
  .hero-fill { background: #e4685c; border-radius: 99px; height: 100%; }
  .pdf-page { width: 100%; background: #fff; box-shadow: 0 1px 8px rgba(31, 42, 68, .22); }
  [class*="st-key-card_"], [class*="st-key-row_"] { background: #fff; }
  [data-testid="stSidebar"] button { justify-content: flex-start; text-align: left; }
  [data-testid="stSidebar"] button > div { justify-content: flex-start; }
</style>
"""

st.set_page_config(page_title=SITE_NAME, page_icon="📘", layout="wide")
st.html(STYLE)
# Online, this asks who you are first; on your own computer it does nothing and USER is None.
USER = login.start()
# Then which course: your last one, or the course choice (which stops the page there).
try:
    courses.start()
except storage.StorageError as problem:
    st.error(t("The online database can't be reached right now, so your results can't be loaded. "
               "Reload the page in a minute.\n\nWhat the database said: {problem}", problem=problem))
    st.stop()


# ---------- data ----------
def pdf_path(file):
    return course.pdf_folder() / file


def page_count(file):
    return _page_count(file, course.current())


@st.cache_data
def _page_count(file, course_id):
    # course_id makes each course's PDFs cached separately (the same file name can be in two courses)
    with pymupdf.open(course.pdf_folder(course_id) / file) as doc:
        return doc.page_count


@st.cache_data(show_spinner=False)
def render_page(file, index, course_id):
    """Return a page as a vector SVG data URI, so it stays sharp at any size or browser zoom."""
    with pymupdf.open(course.pdf_folder(course_id) / file) as doc:
        svg = doc[index].get_svg_image(text_as_path=True)
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode("utf-8")).decode("ascii")


catalog = practice.load_catalog()  # the PDFs of the open course
by_id = {i["id"]: i for i in catalog}


# ---------- progress ----------
def load_progress():
    # storage.py reads the file, or the online database when the app runs on the internet.
    return storage.load(course.results_file("progress"), {})


def save_progress():
    storage.save(course.results_file("progress"), st.session_state.progress)


def entry(pid):
    return st.session_state.progress.setdefault(
        pid, {"seen": [], "last_page": 0, "done": False, "updated": None})


def touch(pid):
    entry(pid)["updated"] = clock.now().isoformat(timespec="seconds")


def seen_count(item):
    return len(entry(item["id"])["seen"]) if item["id"] in st.session_state.progress else 0


def status(item):
    e = st.session_state.progress.get(item["id"])
    total = page_count(item["file"])
    if e and (e["done"] or len(e["seen"]) >= total):
        return "done"
    if e and e["seen"]:
        return "reading"
    return "new"


def fraction(item):
    if status(item) == "done":
        return 1.0
    return min(1.0, seen_count(item) / page_count(item["file"]))


def stats(items):
    """Return (PDFs done, pages read, pages in total) for a list of PDFs."""
    done = sum(status(i) == "done" for i in items)
    pages_total = sum(page_count(i["file"]) for i in items)
    pages_read = sum(page_count(i["file"]) if status(i) == "done" else seen_count(i) for i in items)
    return done, pages_read, pages_total


def level_items(level):
    return [i for i in catalog if i["level"] == level]


def course_levels():
    """The levels that have PDFs. A course that is still being written may not have them all yet."""
    return [level for level in LEVELS if level_items(level)]


def browser_url(item, page_index=0):
    return f"{course.pdf_url(item['file'])}#page={page_index + 1}"


def open_in_pdf_app(item):
    path = str(pdf_path(item["file"]))
    if hasattr(os, "startfile"):
        os.startfile(path)  # Windows only
        st.toast(t("Opened in your default PDF app."))
    else:
        st.toast(t("This button only works when the app runs on Windows."))


# ---------- state ----------
# Your results are read once per visit and then kept in the session. Online they come from the
# database; when it can't be reached the page stops here, so it never starts with empty results
# that would overwrite your real ones at the next save.
try:
    if "progress" not in st.session_state:
        st.session_state.progress = load_progress()
    practice.practice_data()
    log_data()
except storage.StorageError as problem:
    st.error(t("The online database can't be reached right now, so your results can't be loaded. "
               "Reload the page in a minute.\n\nWhat the database said: {problem}", problem=problem))
    st.stop()
st.session_state.setdefault("view", "home")
st.session_state.setdefault("level", None)
st.session_state.setdefault("current", None)
st.session_state.setdefault("page", 0)
st.session_state.setdefault("page_jump", 1)


# ---------- navigation ----------
def open_reader(pid, page=None):
    st.session_state.current = pid
    st.session_state.level = by_id[pid]["level"]
    st.session_state.view = "reader"
    p = entry(pid)["last_page"] if page is None else page
    st.session_state.page = p
    st.session_state.page_jump = p + 1


def go_to_page(new_page):
    total = page_count(by_id[st.session_state.current]["file"])
    st.session_state.page = max(0, min(total - 1, new_page))
    st.session_state.page_jump = st.session_state.page + 1


def turn_page(step):
    go_to_page(st.session_state.page + step)


def jump_changed():
    go_to_page(st.session_state.page_jump - 1)


def toggle_done(pid):
    e = entry(pid)
    e["done"] = not (status(by_id[pid]) == "done")
    if not e["done"]:
        e["seen"] = []
        e["last_page"] = 0
    touch(pid)
    save_progress()


def reset_pdf(pid):
    st.session_state.progress.pop(pid, None)
    save_progress()
    st.session_state.page = 0
    st.session_state.page_jump = 1


def scroll_to_top_after_moving():
    """Start each new screen or PDF page at the top instead of keeping the old scroll position."""
    s = st.session_state
    spot = f"{s.view}/{s.level}"
    if s.view == "reader":
        spot += f"/{s.current}/{s.page}"
    elif s.view == "drill":
        spot += f"/{s.drill['stage']}/{s.drill['round']}/{s.drill['position']}/{s.drill['finished']}"
    elif s.view == "mock_run":
        spot += f"/{s.mock['position']}"
    # Streamlit only runs the script again when the HTML changes, hence the comment holding the spot.
    st.html(f'<script>/* {spot} */ document.querySelector(\'[data-testid="stMain"]\')?.scrollTo(0, 0);'
            "</script>", unsafe_allow_javascript=True)


# ---------- shared pieces ----------
def language_name():
    """The language of the open course, in the interface language: 'Spanish', 'Engels' ..."""
    info = course.info()
    name = languages.name(info["learn"], info["explained_in"])
    return name[:1].upper() + name[1:]  # 'español' -> 'Español' as a title


def sidebar():
    with st.sidebar:
        st.title(f"📘 {language_name()}")
        courses.sidebar_part()
        st.button(t("🏠 Home"), key="nav_home", on_click=go_home, width="stretch",
                  type="primary" if st.session_state.view == "home" else "secondary")
        st.button(t("🗓️ Schedule"), key="nav_schedule", on_click=go_view, args=("schedule",), width="stretch",
                  type="primary" if st.session_state.view == "schedule" else "secondary")
        st.button(t("📊 Progress"), key="nav_progress", on_click=go_view, args=("progress",), width="stretch",
                  type="primary" if st.session_state.view == "progress" else "secondary")
        st.button(t("📚 Themed words"), key="nav_themes", on_click=go_view, args=("themes",), width="stretch",
                  type="primary" if st.session_state.view == "themes" else "secondary")
        st.button(t("⏱️ Mock exam"), key="nav_mock", on_click=go_view, args=("mock",), width="stretch",
                  type="primary" if st.session_state.view == "mock" else "secondary")
        st.divider()
        st.caption(t("LEVELS"))
        for level in course_levels():
            items = level_items(level)
            done = sum(status(i) == "done" for i in items)
            st.button(f"{level} · {t(LEVEL_NAMES[level])}  ({done}/{len(items)})", key=f"nav_{level}",
                      on_click=go_level, args=(level,), width="stretch",
                      type="primary" if st.session_state.level == level else "secondary")
        st.divider()
        if USER:
            login.sidebar_part(USER)
        else:
            st.caption(t("Progress is saved in the results folder next to app.py."))
        your_data()
        login.admin_part()  # only for admins: the accounts people made


# ---------- your data: a backup to download, and putting one back ----------
# The names of the three files in a backup (the same names as in the original Spanish app)
PARTS = {"progress": "progress.json", "practice": "practice.json", "study_log": "study_log.json"}


def backup_text():
    """All your results in one file: {"progress": {...}, "practice": {...}, "study_log": {...}}."""
    every = {"progress": st.session_state.progress, "practice": practice.practice_data(),
             "study_log": log_data()}
    return json.dumps(every, ensure_ascii=False, indent=1)


def read_uploads(files):
    """The parts in the uploaded files: a backup from the button above, or the separate files
    progress.json, practice.json and study_log.json from the app on your own computer."""
    found = {}
    for file in files:
        try:
            data = json.loads(file.getvalue().decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            continue  # not a JSON file
        part = next((p for p, file_name in PARTS.items() if file.name == file_name), None)
        if part:
            found[part] = data
        elif isinstance(data, dict) and set(data) & set(PARTS):  # & keeps what both sets have
            found.update({p: data[p] for p in PARTS if p in data})
    return found


def put_back(found):
    """Replaces your results with the uploaded ones and saves them."""
    if "progress" in found:
        st.session_state.progress = found["progress"]
        save_progress()
    if "practice" in found:
        st.session_state.practice = found["practice"]
        store.save(practice.practice_file(), found["practice"])
    if "study_log" in found:
        st.session_state.study_log = found["study_log"]
        save_log()
    st.session_state.restored = ", ".join(PARTS[p] for p in found)


def your_data():
    with st.expander(t("💾 Your data")):
        st.download_button(t("Download a backup"), backup_text(), width="stretch",
                           file_name=f"{course.current()}-backup-{clock.today().isoformat()}.json",
                           mime="application/json", key="backup_download")
        if st.session_state.get("restored"):
            st.success(t("Put back: {files}.", files=st.session_state.pop("restored")))
        files = st.file_uploader(t("Put back a backup"), type="json", accept_multiple_files=True,
                                 key="backup_upload",
                                 help=t("A backup from the button above, or progress.json, practice.json "
                                        "and study_log.json from the app on your own computer."))
        found = read_uploads(files or [])
        if files and not found:
            st.warning(t("These files don't hold any results."))
        if found:
            st.caption(t("This replaces your current results with the ones in: {files}.",
                         files=", ".join(PARTS[p] for p in found)))
            st.button(t("Replace my results"), key="backup_put_back", type="primary", width="stretch",
                      on_click=put_back, args=(found,))


# ---------- home: progress across all levels ----------
def home():
    done, read, total = stats(catalog)
    all_questions = practice.every_item()
    mastered, questions = practice.mastery(all_questions)
    hero(language_name(), t("Your progress"),
         t("{done} of {pdfs} PDFs done · {read} of {pages} pages read · "
           "{mastered} of {questions} practice questions mastered",
           done=done, pdfs=len(catalog), read=read, pages=total, mastered=mastered, questions=questions),
         done / len(catalog))
    st.write("")
    schedule.home_row()  # today's plan, with a button to the Schedule screen

    due = practice.due_items()
    c = st.columns([4, 1.5], vertical_alignment="center")
    if due:
        c[0].markdown(t("**📅 Daily review:** {count} questions are due today", count=len(due)))
        # The list is sorted with the longest overdue first, [:30] takes the first thirty.
        c[1].button(t("Review {count}", count=min(30, len(due))), key="home_review", type="primary",
                    width="stretch", on_click=practice.start_drill,
                    args=(due[:30], t("📅 Daily review"), ("home",)))
    else:
        c[0].markdown(t("**📅 Daily review:** nothing is due today. Questions you practise come back "
                        "after 1, 3, 7 and 30 days."))

    recent = [(e["updated"], pid) for pid, e in st.session_state.progress.items()
              if e.get("updated") and pid in by_id]
    if recent:
        _, pid = max(recent)
        item = by_id[pid]
        c = st.columns([4, 1.5], vertical_alignment="center")
        c[0].markdown(t("**Continue where you left off:** {level} · {title} (page {page} of {pages})",
                        level=item["level"], title=item["title"], page=entry(pid)["last_page"] + 1,
                        pages=page_count(item["file"])))
        c[1].button(t("Continue ▶"), on_click=open_reader, args=(pid,), type="primary", width="stretch")

    weak = practice.weak_items(all_questions)
    if weak:
        c = st.columns([4, 1.5], vertical_alignment="center")
        c[0].markdown(t("**Weak questions:** {count} across all levels", count=len(weak)))
        c[1].button(t("💪 Practise 20"), key="home_weak", on_click=practice.start_drill, width="stretch",
                    args=(weak, t("All levels · Weak questions"), ("home",), None, None, 20))

    practice.weak_subjects_section(None, ("home",), "home_subject")

    st.subheader(t("Levels"))
    cols = st.columns(3)
    for n, level in enumerate(course_levels()):
        items = level_items(level)
        level_done, level_read, level_total = stats(items)
        with cols[n % 3].container(border=True, key=f"card_{level}"):
            st.markdown(f"#### {level} · {t(LEVEL_NAMES[level])}")
            st.progress(level_done / len(items) if items else 0,
                        text=t("{done} of {total} PDFs done", done=level_done, total=len(items)))
            level_mastered, level_questions = practice.mastery(practice.items_of_level(level))
            st.caption(t("{read} of {pages} pages read", read=level_read, pages=level_total) + "  \n"
                       + t("{mastered} of {questions} practice questions mastered",
                           mastered=level_mastered, questions=level_questions))
            st.button(t("Open {level}", level=level), key=f"open_{level}", on_click=go_level, args=(level,),
                      width="stretch")


# ---------- level: progress within one level ----------
def level_screen():
    level = st.session_state.level
    items = level_items(level)
    done, read, total = stats(items)
    st.button(t("🏠 Home"), key="level_home", on_click=go_home)
    level_questions = practice.items_of_level(level)
    mastered, questions = practice.mastery(level_questions)
    hero(t("Level {level}", level=level), t(LEVEL_NAMES[level]),
         t("{done} of {pdfs} PDFs done · {read} of {pages} pages read · "
           "{mastered} of {questions} practice questions mastered",
           done=done, pdfs=len(items), read=read, pages=total, mastered=mastered, questions=questions),
         done / len(items) if items else 0)
    st.write("")

    # Practising across all the PDFs of this level at once.
    weak = practice.weak_items(level_questions)
    with st.container(horizontal=True):
        st.button(t("🎯 Test all of {level} (30 questions)", level=level), key="level_test",
                  on_click=practice.start_drill,
                  args=(level_questions, t("{level} · Mixed test", level=level), ("level", level), None, None, 30))
        if weak:
            st.button(t("💪 Weak questions ({count})", count=len(weak)), key="level_weak",
                      on_click=practice.start_drill,
                      args=(weak, t("{level} · Weak questions", level=level), ("level", level), None, None, 20))
    practice.weak_subjects_section(level, ("level", level), f"level_subject_{level}")

    next_up = next((i["id"] for i in items if status(i) != "done"), None)
    for item in items:
        stt = status(item)
        is_next = item["id"] == next_up
        with st.container(border=True, key=f"row_{item['id']}"):
            c = st.columns([0.45, 3.5, 1.6, 1.2, 1.2, 1.2], vertical_alignment="center")
            c[0].markdown(f"### {item['number']}")
            c[1].markdown(f"**{item['title']}**" + ("  ·  :red[" + t("Next up") + "]" if is_next else ""))
            c[1].caption(f"{item['section']} · " + t("{pages} pages", pages=page_count(item["file"]))
                         + f" · {item['subtitle']}")
            c[2].progress(fraction(item), text=t(STATUS_LABEL[stt]))
            pdf_mastered, pdf_questions = practice.mastery(practice.load_all_items()[item["id"]])
            c[2].caption(t("{mastered} of {questions} questions mastered",
                           mastered=pdf_mastered, questions=pdf_questions))
            label = {"done": t("Read again"), "reading": t("Continue"), "new": t("Read")}[stt]
            c[3].button(label, key=f"read_{item['id']}", on_click=open_reader,
                        args=(item["id"], 0 if stt == "done" else None),
                        type="primary" if is_next else "secondary", width="stretch")
            c[4].button(t("Practise"), key=f"practise_{item['id']}", on_click=practice.go_practice,
                        args=(item["id"],), width="stretch")
            with c[5].popover(t("More"), width="stretch"):
                last_page = entry(item["id"])["last_page"] if stt == "reading" else 0
                st.link_button(t("Open in browser tab"), browser_url(item, last_page), width="stretch")
                # Online the PDF app would open on the server, not on your computer, so it's left out.
                if not USER and st.button(t("Open in PDF app"), key=f"app_{item['id']}", width="stretch"):
                    open_in_pdf_app(item)
                st.button(t("Mark as not done") if stt == "done" else t("Mark as done"),
                          key=f"done_{item['id']}", on_click=toggle_done, args=(item["id"],),
                          width="stretch")


# ---------- reader ----------
def reader():
    item = by_id[st.session_state.current]
    total = page_count(item["file"])
    page = st.session_state.page
    e = entry(item["id"])
    if page not in e["seen"]:
        e["seen"].append(page)
    e["last_page"] = page
    touch(item["id"])
    save_progress()
    # Count the time you read, but only once per page: the screen also reruns when you change the size.
    if st.session_state.get("logged_page") != (item["id"], page):
        st.session_state.logged_page = (item["id"], page)
        log_activity("page")

    top = st.columns([1, 1.7, 5, 2.2], vertical_alignment="center")
    top[0].button(t("🏠 Home"), key="reader_home", on_click=go_home, width="stretch")
    top[1].button(f"← {item['level']} · {t(LEVEL_NAMES[item['level']])}", key="reader_level",
                  on_click=go_level, args=(item["level"],), width="stretch")
    top[2].markdown(f"#### {item['level']} · PDF {item['number']} — {item['title']}")
    top[3].progress(fraction(item), text=t(STATUS_LABEL[status(item)]))

    bar = st.columns([1, 1, 1.3, 1.6, 2, 2, 1.8], vertical_alignment="center")
    bar[0].button(t("◀ Prev"), on_click=turn_page, args=(-1,), disabled=page == 0,
                  shortcut="Left", width="stretch")
    bar[1].button(t("Next ▶"), on_click=turn_page, args=(1,), disabled=page >= total - 1,
                  shortcut="Right", width="stretch")
    bar[2].number_input(t("Page"), 1, total, key="page_jump", on_change=jump_changed,
                        label_visibility="collapsed")
    bar[3].markdown(t("**of {total}**  ·  read {read}/{total}", total=total, read=len(e["seen"])))
    bar[4].link_button(t("Open in browser tab"), browser_url(item, page), width="stretch")
    if not USER and bar[5].button(t("Open in PDF app"), width="stretch"):
        open_in_pdf_app(item)
    # format_func shows each choice translated; the choice itself stays the English name
    size = bar[6].selectbox(t("Size"), list(PAGE_WIDTHS), index=1, label_visibility="collapsed",
                            format_func=t)

    st.html(f'<div style="text-align:center"><img class="pdf-page" src="{render_page(item["file"], page, course.current())}" '
            f'alt="{t("Page {page} of {total}", page=page + 1, total=total)}" style="max-width:{PAGE_WIDTHS[size]}px"></div>')

    foot = st.columns([1, 1, 2, 2, 2])
    foot[0].button(t("◀ Prev") + " ", on_click=turn_page, args=(-1,), disabled=page == 0,
                   key="prev2", width="stretch")
    foot[1].button(t("Next ▶") + " ", on_click=turn_page, args=(1,), disabled=page >= total - 1,
                   key="next2", width="stretch")
    label = t("Mark as not done") if status(item) == "done" else t("Mark as done")
    foot[2].button(label, on_click=toggle_done, args=(item["id"],), width="stretch",
                   type="primary" if page == total - 1 and status(item) != "done" else "secondary")
    foot[3].button(t("Reset progress for this PDF"), on_click=reset_pdf, args=(item["id"],),
                   width="stretch")
    foot[4].button(t("Practise this PDF"), key="reader_practise", on_click=practice.go_practice,
                   args=(item["id"],), width="stretch")


# ---------- run ----------
SCREENS = {"home": home, "level": level_screen, "reader": reader,
           "practice": practice.practice_screen, "drill": practice.drill_screen,
           "themes": extra.themes_screen, "mock": extra.mock_screen,
           "mock_run": extra.mock_run_screen, "mock_result": extra.mock_result_screen,
           "schedule": schedule.schedule_screen, "progress": progress.progress_screen,
           "courses": lambda: courses.choice_screen(adding=True)}
# The Schedule screen needs to open the reader and know how much of a PDF you read; both live in this file.
schedule.connect(open_reader, lambda pid: fraction(by_id[pid]),
                 lambda pid: st.session_state.progress.get(pid, {}).get("updated"))
practice.ACTIONS["open_reader"] = open_reader  # for the "Next PDF" button after a practice session
SCREENS[st.session_state.view]()
sidebar()  # after the screen, so its counts include the page just opened
scroll_to_top_after_moving()
