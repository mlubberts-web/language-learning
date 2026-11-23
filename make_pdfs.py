"""Makes the reading PDFs of a course from its content files, in the style of the Spanish PDFs.

usage:  python make_pdfs.py <course id> [file name start ...] [--out folder]
        python make_pdfs.py es_from_nl                 every content file of the course
        python make_pdfs.py es_from_nl a1_02 a1_03     only these
The PDFs go to static/<course id>/ (or the --out folder). Afterwards run build_catalog.py.
Only needed on your own computer, when content changes; it needs ReportLab: pip install reportlab

A content file is {"meta": {...}, "blocks": [...]} (see courses/es_from_en/content for examples).
Each block becomes part of the PDF; the kinds are listed in BLOCKS at the bottom. Texts may use
<b>bold</b> and <i>italic</i>. Only in verb forms (conj, conjgrid) *stars* mark the irregular part,
shown in red; elsewhere a star is just a star (*Pienso de que: a wrong sentence).
The headings that belong to the PDF itself ("Person", "Answers" ...) are in the language of the
course's explanations, through ui_text.t().
"""
import json, re, sys, unicodedata
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (CondPageBreak, KeepTogether, ListFlowable, ListItem, PageBreak, Paragraph,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

import course
import languages
from ui_text import t

# ---------- the look ----------
RED = colors.HexColor("#c0392b")
NAVY = colors.HexColor("#1f2a44")
INK = colors.HexColor("#2b3345")
GREY = colors.HexColor("#6b7385")
STRIPE = colors.HexColor("#f5f1ea")
GREEN = colors.HexColor("#2e7d4f")
RULE = colors.HexColor("#d9d4ca")
# Note boxes: (background, bar and title colour)
CALLOUTS = {"tip": ("#e9eff7", "#2f6db5"), "warn": ("#fdeceb", "#c0392b"),
            "spain": ("#fdf4e3", "#e08a1e"), "dutch": ("#fdf4e3", "#e08a1e"), "note": ("#fdf4e3", "#e08a1e")}
WIDTH, HEIGHT = A4
MARGIN = 1.9 * cm
FRAME = WIDTH - 2 * MARGIN  # the width of the text


def fonts():
    """Arial from Windows when it is there (it covers more characters, like θ), else Helvetica."""
    folder = Path("C:/Windows/Fonts")
    files = {"Body": "arial.ttf", "Body-Bold": "arialbd.ttf", "Body-Italic": "ariali.ttf",
             "Body-BoldItalic": "arialbi.ttf"}
    if all((folder / f).exists() for f in files.values()):
        for name, f in files.items():
            pdfmetrics.registerFont(TTFont(name, str(folder / f)))
        pdfmetrics.registerFontFamily("Body", normal="Body", bold="Body-Bold", italic="Body-Italic",
                                      boldItalic="Body-BoldItalic")
        return "Body", "Body-Bold"
    return "Helvetica", "Helvetica-Bold"


FONT, BOLD = fonts()


def style(name, size=9, color=INK, font=None, leading=None, **extra):
    return ParagraphStyle(name, fontName=font or FONT, fontSize=size, leading=leading or size * 1.45,
                          textColor=color, alignment=TA_LEFT, **extra)


S = {"p": style("p", spaceAfter=6),
     "eyebrow": style("eyebrow", 7.5, RED, BOLD),
     "title": style("title", 22, NAVY, BOLD, 26),
     "subtitle": style("subtitle", 10, GREY, spaceAfter=10),
     # keepWithNext: a heading never stays behind alone at the bottom of a page
     "h1": style("h1", 14, RED, BOLD, 18, spaceBefore=10, keepWithNext=1),
     "h2": style("h2", 10.5, NAVY, BOLD, 14, spaceBefore=6, spaceAfter=4, keepWithNext=1),
     "cell": style("cell", 8.3, INK, leading=11),
     "head": style("head", 8.3, colors.white, BOLD, 11),
     "small_head": style("small_head", 6.8, colors.HexColor("#c9cfdc"), leading=9),
     "caption": style("caption", 9, NAVY, spaceBefore=4, spaceAfter=3, keepWithNext=1),
     "next": style("next", 8.5, GREY, spaceBefore=8)}


def red_parts(text):
    """'est*oy*' -> 'est<font color=red><b>oy</b></font>': the irregular part in red."""
    return re.sub(r"\*(.+?)\*", r'<font color="#c0392b"><b>\1</b></font>', text)


def para(text, kind="cell", **colour):
    st = S[kind] if not colour else ParagraphStyle(kind + str(colour), parent=S[kind], **colour)
    return Paragraph(str(text), st)


def table(rows, widths, head=True, first_bold=True, extra=()):
    """A table in the house style: navy header, striped rows. widths are relative (they are scaled
    to the width of the page). rows are lists of texts or Paragraphs."""
    scale = FRAME / sum(widths)
    cells = []
    for r, row in enumerate(rows):
        line = []
        for c, value in enumerate(row):
            if isinstance(value, str) or isinstance(value, (int, float)):
                if head and r == 0:
                    value = para(value, "head")
                elif first_bold and c == 0:
                    value = para(f"<b>{value}</b>")
                else:
                    value = para(value)
            line.append(value)
        cells.append(line)
    commands = [("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, 1 if head else 0), (-1, -1), 0.4, RULE)]
    if head:
        commands.append(("BACKGROUND", (0, 0), (-1, 0), NAVY))
    for r in range(1 if head else 0, len(cells)):
        if (r - (1 if head else 0)) % 2 == 1:
            commands.append(("BACKGROUND", (0, r), (-1, r), STRIPE))
    result = Table(cells, colWidths=[w * scale for w in widths], repeatRows=1 if head else 0)
    result.setStyle(TableStyle(commands + list(extra)))
    return result


# ---------- the blocks ----------
class Build:
    """Everything one PDF needs while it is made: the course's languages and the exercises, which
    come back on the answers page."""

    def __init__(self, course_id, document):
        info = course.info(course_id)
        self.learn, self.base = info["learn"], info["explained_in"]
        self.meta = document["meta"]
        self.exercises = []  # (kind, block) in order, for the answers page
        profile = languages.profile(self.learn)
        self.persons = profile.get("table_persons", profile["persons"])  # the longer forms, for tables

    def tr(self, text, **values):
        return t(text, self.base, **values)

    def language(self, code):
        name = languages.name(code, self.base)
        return name[:1].upper() + name[1:]


def block_h1(b, build):
    rule = line()
    rule.keepWithNext = 1  # the line under the heading stays with what follows, like the heading
    # CondPageBreak: with less than 5 cm left on the page, the heading starts on the next one
    return [CondPageBreak(5 * cm), para(b["text"], "h1"), rule]


def line():
    rule = Table([[""]], colWidths=[FRAME], rowHeights=[2])
    rule.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, -1), 0.5, RULE)]))
    return rule


def block_h2(b, build):
    return [para(b["text"], "h2")]


def block_p(b, build):
    return [para(b["text"], "p")]


def bullet_list(items):
    return ListFlowable([ListItem(para(item, "cell"), leftIndent=10, value="•") for item in items],
                        bulletType="bullet", start="•", leftIndent=10, bulletFontSize=7)


def block_bullets(b, build):
    return [bullet_list(b["items"]), Spacer(1, 6)]


def block_callout(b, build):
    background, accent = CALLOUTS.get(b.get("kind"), CALLOUTS["tip"])
    inside = [para(f"<b>{b['title']}</b>", "cell", textColor=colors.HexColor(accent))] if b.get("title") else []
    if b.get("text"):
        inside.append(para(b["text"]))
    if b.get("bullets"):
        inside.append(bullet_list(b["bullets"]))
    box = Table([[inside]], colWidths=[FRAME])
    box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(background)),
                             ("LINEBEFORE", (0, 0), (0, -1), 3, colors.HexColor(accent)),
                             ("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 6),
                             ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
    return [Spacer(1, 4), box, Spacer(1, 8)]


def block_table(b, build):
    rows = [b["head"]] + b["rows"]
    extra = []
    if b.get("style") == "endings":  # the endings in red
        rows = [rows[0]] + [[row[0]] + [f'<font color="#c0392b"><b>{v}</b></font>' for v in row[1:]]
                            for row in rows[1:]]
    return [table(rows, b.get("widths") or [1] * len(b["head"]), extra=extra), Spacer(1, 8)]


def block_verbpairs(b, build):
    """Word pairs, two pairs per row, under a header with the title."""
    items = b["items"]
    rows = [[b.get("title", ""), "", "", ""]]
    half = (len(items) + 1) // 2  # the left column first, then the right one
    for n in range(half):
        left = items[n]
        right = items[n + half] if n + half < len(items) else ["", ""]
        rows.append([f"<b>{left[0]}</b>", left[1], f"<b>{right[0]}</b>", right[1]])
    widths = b.get("widths") or [3.2, 5.3, 3.2, 5.3]
    if len(widths) == 2:
        widths = widths * 2
    return [table(rows, widths, first_bold=False, extra=[("SPAN", (0, 0), (-1, 0))]), Spacer(1, 8)]


def block_conj(b, build):
    forms = b.get("forms") or [b["stem"] + f"*{end}*" for end in b["endings"]]
    kind = b.get("label") or build.tr("regular {group} verb", group=f"<b>{b.get('group', '')}</b>")
    caption = para(f"<b>{b['verb']}</b> — {b.get('meaning', '')}  ·  {kind}", "caption")
    rows = [[build.tr("Person"), build.tr("Form"), build.tr("Example"), build.language(build.base)]]
    examples = b.get("examples", [])
    for n, (person, form) in enumerate(zip(build.persons, forms)):
        example = examples[n] if n < len(examples) else ["", ""]
        rows.append([person, f"<b>{red_parts(form)}</b>", f"<i>{example[0]}</i>", example[1]])
    # The caption stays with the table (keepWithNext); a long table may go on over the page.
    return [caption, table(rows, [3.6, 2.6, 5.4, 5.4], first_bold=False), Spacer(1, 8)]


def block_conjgrid(b, build):
    verbs = b["verbs"]
    persons = b.get("persons") or build.persons
    head = [para(f"<b>{b.get('person_title') or build.tr('Person')}</b>", "head")] + [
        [para(f"<b>{v['inf']}</b>", "head"), para(v.get("meaning", ""), "small_head")] for v in verbs]
    rows = [head]
    for n, person in enumerate(persons):
        rows.append([person] + [f"<b>{red_parts(v['forms'][n])}</b>" if n < len(v["forms"]) else "" for v in verbs])
    parts = [para(b["title"], "caption")] if b.get("title") else []
    parts.append(table(rows, [3.6] + [13.4 / len(verbs)] * len(verbs), first_bold=False))
    return parts + [Spacer(1, 8)]


def block_mistakes(b, build):
    rows = [[build.tr("Instead of…"), build.tr("Write…"), build.tr("Why")]]
    for row in b["rows"]:
        wrong, right, why = row[:3]  # a 4th part ("advice") only matters for the practice questions
        rows.append([f'<font color="#c0392b">{wrong}</font>', f'<font color="#2e7d4f"><b>{right}</b></font>', why])
    return [table(rows, [4.6, 4.6, 7.8], first_bold=False), Spacer(1, 8)]


def block_exercises(b, build):
    build.exercises.append(("exercises", b))
    titles = b.get("titles") or [build.tr("Sentence"), build.tr("Hint")]
    rows = [["#"] + titles]
    for n, item in enumerate(b["items"], 1):
        rows.append([str(n), item["q"], f'<font color="#6b7385">{item.get("hint", "")}</font>'])
    return [table(rows, [1, 9.5, 6.5]), Spacer(1, 6)]


def block_translations(b, build):
    build.exercises.append(("translations", b))
    rows = [[str(n), item["q"]] for n, item in enumerate(b["items"], 1)]
    numbered = table(rows, [1, 16], head=False, extra=[("TOPPADDING", (0, 0), (-1, -1), 8),
                                                      ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                                                      ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                                                      ("LINEBELOW", (0, 0), (-1, -1), 0.6, GREY)])
    # The line above it ('Translate into Spanish:') is a p block of its own in the content.
    return [Spacer(1, 4), numbered, Spacer(1, 8)]


def block_pagebreak(b, build):
    return [PageBreak()]


def block_answers(b, build):
    parts = [para(build.tr("Answers"), "h1"), line()]
    for kind, block in build.exercises:
        if kind == "exercises":
            titles = block.get("answer_titles") or [build.tr("Answer"), build.tr("Full sentence")]
            rows = [["#"] + titles]
            for n, item in enumerate(block["items"], 1):
                second = item.get("why", "") if block.get("answer_titles") else item.get("full", "")
                rows.append([str(n), f'<font color="#c0392b"><b>{item["a"]}</b></font>', second])
            parts += [table(rows, [1, 5.5, 10.5]), Spacer(1, 8)]
        else:
            rows = [["#", build.tr("Translation")]] + [[str(n), item["a"]] for n, item in enumerate(block["items"], 1)]
            parts += [table(rows, [1, 16]), Spacer(1, 8)]
    if build.meta.get("next"):
        parts.append(para(build.meta["next"], "next"))
    return parts


BLOCKS = {"h1": block_h1, "h2": block_h2, "p": block_p, "bullets": block_bullets, "callout": block_callout,
          "table": block_table, "verbpairs": block_verbpairs, "conj": block_conj, "conjgrid": block_conjgrid,
          "mistakes": block_mistakes, "exercises": block_exercises, "translations": block_translations,
          "pagebreak": block_pagebreak, "answers": block_answers}


# ---------- the whole PDF ----------
def file_name(meta):
    """'A1_02_Regular_Verbs_Present_Tense.pdf'. Accents are left off ('Pronunciación' becomes
    'Pronunciacion'), so the name works in any web address."""
    plain = unicodedata.normalize("NFKD", meta["title"]).encode("ascii", "ignore").decode()
    words = re.sub(r"[^\w\s-]", "", plain).split()
    return f"{meta['level']}_{int(meta['number']):02d}_{'_'.join(words)}.pdf"


def make_pdf(course_id, content_path, out_folder):
    document = json.loads(Path(content_path).read_text(encoding="utf-8"))
    build = Build(course_id, document)
    meta = document["meta"]
    story = [para(f"{meta['level']}  ·  {meta.get('section', '').upper()}  ·  "
                  + build.tr("PDF {number} OF {total}", number=meta["number"], total=meta.get("total_in_level", "?")),
                  "eyebrow"),
             para(meta["title"], "title"), para(meta.get("subtitle", ""), "subtitle")]
    for block in document["blocks"]:
        story += BLOCKS[block["type"]](block, build)

    def page(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(RED)
        canvas.rect(0, HEIGHT - 10, WIDTH, 10, stroke=0, fill=1)  # the red band at the top
        canvas.setStrokeColor(RULE)
        canvas.line(MARGIN, 1.5 * cm, WIDTH - MARGIN, 1.5 * cm)
        canvas.setFont(FONT, 7)
        canvas.setFillColor(GREY)
        canvas.drawString(MARGIN, 1.1 * cm, meta.get("footer", ""))
        canvas.drawRightString(WIDTH - MARGIN, 1.1 * cm, build.tr("Page {number}", number=doc.page))
        canvas.restoreState()

    out = Path(out_folder) / file_name(meta)
    out.parent.mkdir(parents=True, exist_ok=True)
    pdf = SimpleDocTemplate(str(out), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=1.6 * cm,
                            bottomMargin=2.0 * cm, title=f"{meta['level']} · {meta['title']}",
                            author="Language Learning", subject=f"{meta['level']} — {meta.get('section', '')}")
    pdf.build(story, onFirstPage=page, onLaterPages=page)
    return out


if __name__ == "__main__":
    args = sys.argv[1:]
    out = None
    if "--out" in args:
        out = args[args.index("--out") + 1]
        args = args[:args.index("--out")] + args[args.index("--out") + 2:]
    course_id, starts = args[0], args[1:]
    paths = sorted((course.folder(course_id) / "content").glob("*.json"))
    if starts:
        paths = [p for p in paths if p.name.startswith(tuple(starts))]
    for path in paths:
        print(make_pdf(course_id, path, out or course.pdf_folder(course_id)))
