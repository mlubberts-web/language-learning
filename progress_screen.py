"""The Progress tab: what you studied, week by week back to your first day, your trends, your
levels, mock exams and weak subjects. It only shows things; the plan lives in study_plan.py and
the Schedule screen, the numbers come from study_log.json and practice.json."""
from datetime import date, timedelta
import clock

import altair as alt
import pandas as pd  # tables for the charts; pandas is to Python what a MATLAB table is
import streamlit as st

import practice_screen as practice
import schedule_screen as sched
import study_log
import ui_text
from ui import hero, log_data, save_log
from ui_text import mark, t

ACCENT = "#c0392b"  # the red of the app: every chart here has one series, in this colour
INK = "#2b3345"


# ---------- the numbers of one day and one week ----------
def accuracy(right, total):
    """Share right on the first try, or None without first tries."""
    return right / total if total else None


def day_summary(day):
    log = log_data()
    text = day.isoformat()
    entry = sched.day_entry(day)
    goal = sched.goal_units(day)
    return {"day": day, "hours": study_log.studied_minutes(log, text) / 60,
            "exercises": sched.finished_on(day, "exercise"), "pdfs": sched.finished_on(day, "read"),
            "mocks": sched.finished_on(day, "mock"), "questions": entry.get("answers", 0),
            "pages": entry.get("pages", 0), "right": entry.get("first_right", 0), "tries": entry.get("first_total", 0),
            "goal": len(goal), "goal_done": study_log.finished_by(log, [u["id"] for u in goal], text)}


def week_summary(monday, today):
    days = [day_summary(monday + timedelta(days=n)) for n in range(7) if monday + timedelta(days=n) <= today]
    finished = log_data().get("finished", {})
    end = min(monday + timedelta(days=6), today)
    total = {key: sum(d[key] for d in days) for key in ("hours", "exercises", "pdfs", "mocks", "questions",
                                                          "pages", "right", "tries")}
    return {"monday": monday, "days": days, **total,  # ** puts the totals into this dict
            "studied_days": sum(1 for d in days if d["hours"] >= 0.25),
            "lists": sum(1 for d in days if study_log.goal_reached(log_data(), d["day"].isoformat())),
            "list_days": sum(1 for d in days if d["goal"]),
            "accuracy": accuracy(total["right"], total["tries"]),
            "start": sched.plans.position(sched.plan_units(), finished, monday - timedelta(days=1)),
            "end": sched.plans.position(sched.plan_units(), finished, end)}


def short(day):
    """'4 Dec' / '4 dic', in the interface language."""
    return f"{day.day} {ui_text.short_month(day)}"


def day_label(day):
    """'Fri 4' / 'vr 4' / 'vie 4'."""
    return f"{ui_text.short_day(day)} {day.day}"


def week_label(monday):
    return f"{short(monday)} – {short(monday + timedelta(days=6))}"


def remember_mastered(today):
    """Writes down how many questions you have mastered today, for the 'Mastered over time' chart."""
    mastered, _ = practice.mastery(practice.every_item() + practice.theme_items())
    if study_log.remember_mastered(log_data(), today.isoformat(), mastered):
        save_log()
    return mastered


# ---------- charts: one series each, so no legend is needed ----------
def bar_chart(rows, x, y, y_title, number_format, tooltip, height=230):
    data = pd.DataFrame(rows)  # as a table, so the chart is redrawn when the numbers change
    bars = alt.Chart(data).mark_bar(color=ACCENT, cornerRadiusTopLeft=4, cornerRadiusTopRight=4, size=26).encode(
        x=alt.X(f"{x}:N", title=None, sort=None, axis=alt.Axis(labelAngle=0)),
        y=alt.Y(f"{y}:Q", title=y_title, axis=alt.Axis(grid=True, gridOpacity=0.3)),
        tooltip=tooltip)
    labels = bars.mark_text(dy=-8, color=INK).encode(text=alt.Text(f"{y}:Q", format=number_format)
                                                    ).transform_filter(f"datum.{y} > 0")  # no '0' labels
    return (bars + labels).properties(height=height)


def line_chart(rows, x, y, y_title, number_format, height=230, percent=False):
    data = pd.DataFrame(rows)
    scale = alt.Scale(domain=[0, 1]) if percent else alt.Scale(zero=True)
    axis = alt.Axis(format="%" if percent else "d", grid=True, gridOpacity=0.3)
    base = alt.Chart(data).encode(x=alt.X(f"{x}:N", title=None, sort=None, axis=alt.Axis(labelAngle=0)),
                                  y=alt.Y(f"{y}:Q", title=y_title, scale=scale, axis=axis),
                                  tooltip=[alt.Tooltip(f"{x}:N", title=t("When")),
                                           alt.Tooltip(f"{y}:Q", title=y_title, format=number_format)])
    return (base.mark_line(color=ACCENT, strokeWidth=2) +
            base.mark_point(color=ACCENT, filled=True, size=70)).properties(height=height)


def delta(now, before, unit="", percent=False):
    """The change against the week before, for st.metric, or None when there is nothing to compare."""
    if before is None or now is None:
        return None
    change = now - before
    if percent:
        return t("{change} points", change=f"{change * 100:+.0f}")
    return f"{change:+.1f}{unit}" if isinstance(change, float) else f"{change:+d}{unit}"


# ---------- callbacks ----------
def move_week(step):
    st.session_state.progress_week = st.session_state.get("progress_week", 0) + step if step else 0


def pick_week(mondays):
    """For the 'Jump to a week' list: the offset in weeks from this week."""
    chosen = st.session_state.progress_week_pick
    this = mondays[-1]
    monday = next(m for m in mondays if week_label(m) == chosen)
    st.session_state.progress_week = -((this - monday).days // 7)


# ---------- the screen ----------
def progress_screen():
    today = clock.today()
    plan, shares, finished = sched.current_state(today)  # also writes down what you finished today
    log = log_data()
    units = plan["units"]
    mastered = remember_mastered(today)
    questions = len(practice.every_item()) + len(practice.theme_items())
    total_hours = sum(study_log.studied_minutes(log, d) for d in log.get("days", {})) / 60
    pdfs_read = sum(1 for u in units if u["kind"] == "read" and u["id"] in finished)
    exercises = sum(1 for u in units if u["kind"] == "exercise" and u["id"] in finished)
    first = sched.first_day(today)
    hero(t("Progress"), t("Your progress"),
         t("{hours} hours studied since {day} · {reads_done} of {reads} PDFs read · {exercises_done} of {exercises} "
           "exercises finished · {mastered} of {questions} questions mastered",
           hours=ui_text.decimal(total_hours), day=sched.long_date(first), reads_done=pdfs_read, reads=sched.count(units, "read"),
           exercises_done=exercises, exercises=sched.count(units, "exercise"), mastered=mastered, questions=questions),
         (pdfs_read + exercises) / (sched.count(units, "read") + sched.count(units, "exercise")))
    st.write("")

    days = [first + timedelta(days=n) for n in range((today - first).days + 1)]
    studied_days = [d for d in days if study_log.studied_minutes(log, d.isoformat()) >= 15]
    best = max(days, key=lambda d: study_log.studied_minutes(log, d.isoformat()))
    c = st.columns(5)
    c[0].metric(t("Days studied"), t("{done} of {total}", done=len(studied_days), total=len(days)),
                help=t("Days with at least 15 minutes."))
    c[1].metric(t("Average per study day"), ui_text.decimal(total_hours / len(studied_days)) + " h" if studied_days else "–")
    c[2].metric(t("Best day"), sched.fmt(study_log.studied_minutes(log, best.isoformat())), help=sched.long_date(best))
    c[3].metric(t("Streak"), sched.counted(study_log.streak(log, today.isoformat()), mark("{count} day"), mark("{count} days")),
                help=t("Days in a row on which you finished your whole list from the Schedule."))
    c[4].metric(t("Where you are now"), sched.plans.position(units, log.get("finished", {}), today),
                help=t("The first PDF you haven't finished yet: read, and all its exercises."))

    tabs = st.tabs([t("📅 Week by week"), t("📈 Trends"), t("🎓 Levels"), t("⏱️ Mock exams"), t("💪 Weak subjects")])
    with tabs[0]:
        week_view(first, today)
    with tabs[1]:
        trends_view(first, today)
    with tabs[2]:
        levels_view(units, finished)
    with tabs[3]:
        mocks_view()
    with tabs[4]:
        practice.weak_subjects_section(None, ("view", "progress"), "progress_subject")
        if not practice.practice_data()["items"]:
            st.caption(t("Weak subjects appear here once you have practised."))


# ---------- week by week ----------
def week_view(first, today):
    this = sched.monday_of(today)
    first_monday = sched.monday_of(first)
    mondays = [first_monday + timedelta(weeks=n) for n in range((this - first_monday).days // 7 + 1)]
    offset = st.session_state.get("progress_week", 0)
    monday = min(this, max(first_monday, this + timedelta(weeks=offset)))
    with st.container(horizontal=True, vertical_alignment="bottom"):
        st.button(t("◀ Previous week"), key="progress_back", on_click=move_week, args=(-1,), disabled=monday <= first_monday)
        st.button(t("This week"), key="progress_now", on_click=move_week, args=(0,))
        st.button(t("Next week ▶"), key="progress_next", on_click=move_week, args=(1,), disabled=monday >= this)
        labels = [week_label(m) for m in reversed(mondays)]  # newest first
        st.session_state.progress_week_pick = week_label(monday)  # the list always shows the week on screen
        st.selectbox(t("Jump to a week"), labels, key="progress_week_pick", on_change=pick_week, args=(mondays,),
                     width=220)

    week = week_summary(monday, today)
    before = week_summary(monday - timedelta(weeks=1), today) if monday > first_monday else None
    title = t("This week") if monday == this else t("Week of {week}", week=week_label(monday))
    st.subheader(title)
    c = st.columns(6)
    c[0].metric(t("Hours studied"), ui_text.decimal(week["hours"]) + " h",
                delta(round(week["hours"], 1), round(before["hours"], 1) if before else None, " h"))
    c[1].metric(t("Days studied"), t("{done} of {total}", done=week["studied_days"], total=len(week["days"])),
                help=t("Days with at least 15 minutes."))
    c[2].metric(t("Exercises finished"), week["exercises"], delta(week["exercises"], before and before["exercises"]))
    c[3].metric(t("PDFs read"), week["pdfs"], delta(week["pdfs"], before and before["pdfs"]))
    c[4].metric(t("Questions answered"), week["questions"], delta(week["questions"], before and before["questions"]))
    c[5].metric(t("Right on the first try"), f"{week['accuracy']:.0%}" if week["accuracy"] is not None else "–",
                delta(week["accuracy"], before and before["accuracy"], percent=True),
                help=t("Of your first tries this week (not the repeats in later rounds), the share that was right."))
    lists = (" · " + t("Daily lists finished on **{done} of {total}** days", done=week["lists"], total=week["list_days"])
             if week["list_days"] else "")
    mocks = (" · " + sched.counted(week["mocks"], mark("{count} mock exam"), mark("{count} mock exams"))) if week["mocks"] else ""
    st.markdown("📍 " + t("Started the week at **{start}**, ended at **{end}**", start=week["start"], end=week["end"])
                + lists + mocks)

    rows = []
    for n in range(7):
        day = monday + timedelta(days=n)
        s = day_summary(day) if day <= today else None
        rows.append({"day": day_label(day), "hours": round(s["hours"], 2) if s else 0,
                     "exercises": s["exercises"] if s else 0, "pdfs": s["pdfs"] if s else 0,
                     "questions": s["questions"] if s else 0, "pages": s["pages"] if s else 0,
                     "accuracy": f"{s['right'] / s['tries']:.0%}" if s and s["tries"] else "–",
                     "list": (t("{done} of {total}", done=s["goal_done"], total=s["goal"]) if s["goal"] else "–") if s else "",
                     "future": s is None})
    st.markdown("**" + t("Hours studied per day") + "**")
    st.altair_chart(bar_chart(rows, "day", "hours", t("Hours"), ".1f", [
        alt.Tooltip("day:N", title=t("Day")), alt.Tooltip("hours:Q", title=t("Hours"), format=".1f"),
        alt.Tooltip("exercises:Q", title=t("Exercises finished")), alt.Tooltip("pdfs:Q", title=t("PDFs read")),
        alt.Tooltip("questions:Q", title=t("Questions answered")),
        alt.Tooltip("accuracy:N", title=t("Right on the first try")), alt.Tooltip("list:N", title=t("Daily list"))]),
        width="stretch", key=f"week_chart_{monday.isoformat()}")  # its own key per week: always redrawn
    st.dataframe([{t("Day"): r["day"], t("Hours"): round(r["hours"], 1), t("Exercises"): r["exercises"],
                   t("PDFs read"): r["pdfs"], t("Pages"): r["pages"], t("Questions"): r["questions"],
                   t("First try right"): r["accuracy"], t("Daily list"): r["list"]} for r in rows if not r["future"]],
                 hide_index=True, width="stretch")
    finished_list(monday, today)


def finished_list(monday, today):
    """Everything you finished in a week: PDFs, exercises grouped per PDF or list, mock exams."""
    lookup = sched.units_by_id()
    end = monday + timedelta(days=6)
    done = [(d, lookup[unit_id]) for unit_id, d in log_data().get("finished", {}).items()
            if unit_id in lookup and monday.isoformat() <= d <= end.isoformat()]
    if not done:
        st.caption(t("Nothing finished in this week."))
        return
    order = {unit["id"]: n for n, unit in enumerate(sched.plan_units())}
    done.sort(key=lambda pair: order[pair[1]["id"]])  # in the order of the program
    with st.expander(t("✅ What you finished this week ({count})", count=len(done))):
        groups = {}
        for d, unit in done:
            if unit["kind"] == "exercise":
                name = unit["title"]
                groups.setdefault(("exercise", name), []).append((d, unit))
            else:
                groups[(unit["kind"], unit["id"])] = [(d, unit)]
        for (kind, _), entries in groups.items():
            unit = entries[0][1]
            when = sorted({date.fromisoformat(d) for d, _ in entries})
            days = ", ".join(day_label(d) for d in when)
            if kind == "read":
                st.markdown("📖 " + t("Read **{title}**", title=unit["title"]) + f" · {days}")
            elif kind == "mock":
                st.markdown(f"⏱️ **{sched.mock_title(unit['level'], unit['number'])}** · {days}")
            else:
                icon = sched.ICONS["theme"] if unit.get("theme") else sched.ICONS["exercise"]
                types = ", ".join(practice.mode_title(u["mode"]) for _, u in entries)
                st.markdown(f"{icon} **{unit['title']}**: {types} · {days}")
        st.caption(t("For what you finished before the dates were kept, the day is estimated from your answers."))


# ---------- trends over all weeks ----------
def trends_view(first, today):
    first_monday = sched.monday_of(first)
    weeks = [week_summary(first_monday + timedelta(weeks=n), today)
             for n in range((sched.monday_of(today) - first_monday).days // 7 + 1)]
    rows = [{"week": short(w["monday"]), "hours": round(w["hours"], 2), "exercises": w["exercises"],
             "pdfs": w["pdfs"], "questions": w["questions"], "accuracy": w["accuracy"],
             "where": f"{w['start']} → {w['end']}"} for w in weeks]
    tip = [alt.Tooltip("week:N", title=t("Week starting")), alt.Tooltip("hours:Q", title=t("Hours"), format=".1f"),
           alt.Tooltip("exercises:Q", title=t("Exercises")), alt.Tooltip("pdfs:Q", title=t("PDFs read")),
           alt.Tooltip("questions:Q", title=t("Questions")), alt.Tooltip("where:N", title=t("Where you were"))]
    c = st.columns(2)
    with c[0]:
        st.markdown("**" + t("Hours studied per week") + "**")
        st.altair_chart(bar_chart(rows, "week", "hours", t("Hours"), ".1f", tip), width="stretch")
    with c[1]:
        st.markdown("**" + t("Exercises finished per week") + "**")
        st.altair_chart(bar_chart(rows, "week", "exercises", t("Exercises"), "d", tip), width="stretch")
    c = st.columns(2)
    with c[0]:
        st.markdown("**" + t("Questions answered per week") + "**")
        st.altair_chart(bar_chart(rows, "week", "questions", t("Questions"), "d", tip), width="stretch")
    with c[1]:
        st.markdown("**" + t("Right on the first try, per week") + "**")
        scored = [r for r in rows if r["accuracy"] is not None]
        if scored:
            st.altair_chart(line_chart(scored, "week", "accuracy", t("Right on the first try"), ".0%", percent=True),
                            width="stretch")
        else:
            st.caption(t("This chart fills as you practise."))

    st.markdown("**" + t("Questions mastered over time") + "**")
    snapshots = sorted(log_data().get("mastered", {}).items())
    if len(snapshots) >= 2:
        st.altair_chart(line_chart([{"day": f"{day_label(date.fromisoformat(d))} {ui_text.short_month(date.fromisoformat(d))}",
                                     "mastered": n} for d, n in snapshots],
                                   "day", "mastered", t("Questions mastered"), "d"), width="stretch")
    else:
        st.caption(t("Kept once a day when you open this tab: the line appears from the second day."))

    st.markdown("**" + t("All weeks") + "**")
    st.dataframe([{t("Week"): week_label(w["monday"]), t("Hours"): round(w["hours"], 1),
                   t("Days studied"): w["studied_days"], t("Exercises"): w["exercises"], t("PDFs read"): w["pdfs"],
                   t("Questions"): w["questions"],
                   t("First try right"): f"{w['accuracy']:.0%}" if w["accuracy"] is not None else "–",
                   t("Start of the week"): w["start"], t("End of the week"): w["end"]} for w in reversed(weeks)],
                 hide_index=True, width="stretch")


# ---------- levels ----------
def levels_view(units, finished):
    rows = []
    for level in sched.LEVELS + ["themes"]:
        own = [u for u in units if u["level"] == level]
        reads = [u for u in own if u["kind"] == "read"]
        exercises = [u for u in own if u["kind"] == "exercise"]
        if not exercises:
            continue  # not in your plan: above your last deadline
        items = practice.theme_items() if level == "themes" else practice.items_of_level(level)
        mastered, total = practice.mastery(items)
        mocks = {(m["level"], m["number"]) for m in log_data().get("mocks", [])}
        rows.append({t("Level"): t("Themed lists") if level == "themes" else level,  # percentages, 0 to 100
                     t("PDFs read"): 100 * sum(u["id"] in finished for u in reads) / len(reads) if reads else None,
                     t("Exercises finished"): 100 * sum(u["id"] in finished for u in exercises) / len(exercises),
                     t("Questions mastered"): 100 * mastered / total if total else 0,
                     t("Mock exams"): t("{done} of {total}", done=sum((level, n) in mocks for n in (1, 2)), total=2)
                     if level != "themes" else "–"})
    progress = lambda label: st.column_config.ProgressColumn(label, format="%.0f%%", min_value=0, max_value=100)
    st.dataframe(rows, hide_index=True, width="stretch",
                 column_config={name: progress(name) for name in
                                (t("PDFs read"), t("Exercises finished"), t("Questions mastered"))})
    st.caption(t("A PDF counts as read when you opened all its pages or marked it as done. An exercise is one "
                 "exercise type of a PDF or list, finished when every question was answered once. Mastered: "
                 "right on your last first try."))


# ---------- mock exams ----------
def mocks_view():
    official = log_data().get("mocks", [])
    st.markdown("**" + t("Official {exam} model exams", exam=sched.exam_name()) + "**")
    if official:
        rows = []
        for m in sorted(official, key=lambda m: m["date"]):
            parts = m["parts"]
            rows.append({t("Date"): sched.long_date(date.fromisoformat(m["date"])),
                         t("Exam"): f"{m['level']} {t('no.')} {m['number']}",
                         **{t(part): f"{score}%" for part, score in parts.items()},
                         t("Average"): f"{sum(parts.values()) / len(parts):.0f}%",
                         t("All parts ≥ {target}%", target=sched.TARGET): "✅" if min(parts.values()) >= sched.TARGET else "🔸"})
        st.dataframe(rows, hide_index=True, width="stretch")
    else:
        st.caption(t("None logged yet. Log them on the Schedule screen, under ⏱️ Mock exams."))
    st.markdown("**" + t("Mock exams in the app") + "**")
    own = practice.practice_data().get("mocks", [])
    if own:
        rows = [{"when": f"{m['date']} · {t(m['level'])}", "score": m["percent"] / 100} for m in own]
        if len(rows) >= 2:
            st.altair_chart(line_chart(rows, "when", "score", t("Score"), ".0%", percent=True), width="stretch")
        st.dataframe([{t("Date"): m["date"], t("Level"): t(m["level"]), t("Score"): f"{m['percent']}%",
                       t("Right"): t("{done} of {total}", done=m["right"], total=m["total"])} for m in reversed(own)],
                     hide_index=True, width="stretch")
    else:
        st.caption(t("None yet. Start one with ⏱️ Mock exam in the menu."))
