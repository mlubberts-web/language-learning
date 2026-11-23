# Plan: one language-learning site, six courses

This file is the to-do list for the whole project. Claude works through it from top to bottom
(started with `/loop work through PLAN.md`), ticks off each step when it is done and tested, and
commits after every step. Steps marked 🙋 need Menno: Claude stops there and says exactly what to do.

The original Spanish app (`LanguageLearningSite/.../spanish_app`, online at
spanishlearningonline.streamlit.app) is **not touched**. Everything happens in this folder,
`C:\Users\mlubb\Desktop\MultipleLanguagesSite`, and the GitHub repository `language-learning`.
The long-term idea is to run this as a real language-learning website.

## The six courses

Three languages to learn, each explained in two languages. A course id is
`<language you learn>_from_<language of the explanations>`.

| Course | You learn | Explained in | Content |
|---|---|---|---|
| `es_from_en` | Spanish (Spain) | English | the existing Spanish course |
| `es_from_nl` | Spanish (Spain) | Dutch | the same Spanish, explanations translated |
| `en_from_nl` | English (British) | Dutch | new English content |
| `en_from_es` | English (British) | Spanish (Spain) | the same English, explanations translated |
| `nl_from_en` | Dutch (Netherlands) | English | new Dutch content |
| `nl_from_es` | Dutch (Netherlands) | Spanish (Spain) | the same Dutch, explanations translated |

Choices made (Menno can overrule any of them):
- Spanish from Spain, British English (American spelling accepted with a warning), Dutch from the
  Netherlands.
- Every course goes from A1 to C2, about 59 units like the Spanish course, with themed word lists,
  verbs in context and 12 official model exams (DELE for Spanish, Cambridge for English,
  Staatsexamen NT2 and CNaVT for Dutch).
- The interface speaks the language of the explanations: English, Dutch or Spanish.
- One website and one database for all courses. Someone chooses a course when making an account
  and can add or switch courses later; results are kept per course.
- The reading material stays PDFs, now generated from the content files, so the reader, page
  tracking and time counting keep working.
- Separate Supabase project and Streamlit app from the Spanish app.

## Working rules

- Small steps, commented code for a Python beginner with MATLAB experience.
- Tests must pass before a step is ticked off; new code gets new checks.
- Content: correct, natural, level-appropriate. Each language unit is checked by a second pass
  (Claude re-reads it as an examiner) before it is ticked off.
- No personal details in the repository. No Co-Authored-By lines in commits.
- Commit and push after every finished step.

---

## Phase 0: setup

- [x] 0.1 Copy the code of the Spanish app (at its latest commit) into this folder, start git with
      the noreply identity and the remote `language-learning`.
- [x] 0.2 Make a virtual environment, install the packages, run both test suites; first commit
      and push.

## Phase 1: the engine (any language pair)

- [x] 1.1 Course folders: move the Spanish data to `courses/es_from_en/` (content, themes,
      verbs_in_context, pdfs, catalog, mock exams) with a `course.json` describing the course
      (languages, level names, PDF list). All code reads paths through one `course.py`.
- [x] 1.2 Language profiles in `languages.py` (es, en, nl): what counts as a small
      difference in answers (accents, ñ, ¿¡, contractions, ij/y, ë), articles (el/la, de/het, none),
      persons for verb forms, the speech voice, letters for the article keys.
- [x] 1.3 Exercise types per course: the article exercise becomes "el or la?" / "de or het?" or is
      left out; titles such as "Words, Spanish to English" come from the course.
- [x] 1.4 Interface translations: every text on screen goes through `t()` in `ui_text.py`, with
      the Dutch and Spanish in `ui_text/nl.json` and `es.json`; the interface language is the
      course's explanation language.
  - [x] 1.4a `ui_text.py`, day and month names, and a test that every `t()` text is translated
  - [x] 1.4b app.py, ui.py, login.py
  - [x] 1.4c practice_screen.py, practice_items.py, practice_logic.py, extra_screens.py
  - [x] 1.4d schedule_screen.py, study_plan.py
  - [x] 1.4e progress_screen.py
  - [x] 1.4f Check every screen in Dutch and Spanish in the browser (with a test course)
- [x] 1.5 Choosing a course: on your own computer a course picker; online the course is chosen
      when making an account, and the sidebar can switch or add courses. Saved rows are named
      per course, so results never mix.
- [x] 1.6 PDF generator: `make_pdfs.py` turns a content file into a PDF in the same style as the
      Spanish PDFs (PyMuPDF). Check it on a few Spanish units side by side with the originals.
- [x] 1.7 Tests run for every course (`run_tests.py` runs all of them); a course with only some units is allowed (the plan and
      progress only count what exists).
- [x] 1.8 Landing page for visitors who are not logged in: what the site is, the six courses,
      log in / create an account. Works on a phone.
- [ ] 1.9 🙋 New Supabase project + SQL, new Streamlit app with secrets. Deploy and test online.
      (Asked Menno on 2026-11-21; Phase 2 goes on in the meantime. When he says it's done: log in
      online, check the landing page, a course, saving, and update this step.)

## Phase 2: Spanish for Dutch speakers (`es_from_nl`)

- [x] 2.1 Translate the explanations of A1 (content, themes, verbs-in-context notes) into Dutch;
      Spanish stays as it is. Generate the PDFs, run the tests.
- [x] 2.2 A2
- [x] 2.3 B1
- [x] 2.4 B2
- [x] 2.5 C1
- [x] 2.6 C2
- [x] 2.7 Themed lists in Dutch (32 files).
- [x] 2.8 Dutch-specific notes: false friends and typical mistakes of Dutch speakers.
      (New themed list `courses/es_from_nl/themes/dutch_traps.json`, 44 entries; the Dutch notes
      inside the units were translated with them.)
- [ ] 2.9 🙋 Menno spot-checks a few units. (Asked on 2026-11-22; Phase 3 goes on in the meantime.)

## Phase 3: English for Dutch speakers (`en_from_nl`)

- [x] 3.1 Curriculum: the list of ~59 units A1–C2 with their contents, following the CEFR and the
      Cambridge exams; write it to `courses/en_from_nl/curriculum.md`.
- [x] 3.2 A1 units
- [x] 3.3 A2 units
- [x] 3.4 B1 units
- [ ] 3.5 B2 units
- [ ] 3.6 C1 units
- [ ] 3.7 C2 units
- [ ] 3.8 Verbs in context (irregular verbs, tenses) and themed lists.
- [ ] 3.9 Model exams: links to the official Cambridge sample papers per level.
- [ ] 3.10 🙋 Menno spot-checks a few units.

## Phase 4: English for Spanish speakers (`en_from_es`)

- [ ] 4.1 Translate the explanations of all English units into Spanish (Spain), A1–C2.
- [ ] 4.2 Themed lists and notes for Spanish speakers (false friends, pronunciation traps).

## Phase 5: Dutch for English speakers (`nl_from_en`)

- [ ] 5.1 Curriculum A1–C2 (word order, separable verbs, de/het, er, modal particles ...),
      following the CEFR, Staatsexamen NT2 and CNaVT.
- [ ] 5.2 A1 units
- [ ] 5.3 A2 units
- [ ] 5.4 B1 units
- [ ] 5.5 B2 units
- [ ] 5.6 C1 units
- [ ] 5.7 C2 units
- [ ] 5.8 Verbs in context (strong verbs, perfect with hebben/zijn) and themed lists.
- [ ] 5.9 Model exams: official NT2 and CNaVT practice exams.
- [ ] 5.10 🙋 Menno spot-checks a few units.

## Phase 6: Dutch for Spanish speakers (`nl_from_es`)

- [ ] 6.1 Translate the explanations of all Dutch units into Spanish (Spain).
- [ ] 6.2 Themed lists and notes for Spanish speakers.

## Phase 7: finishing the website

- [ ] 7.1 README and DEPLOY for the whole site; screenshots.
- [ ] 7.2 Privacy page (what is stored, how to delete an account), terms of use.
- [ ] 7.3 Everything once more on a phone-sized screen.
- [ ] 7.4 🙋 Menno decides on a name and maybe an own domain.

## Log

Short notes per session: what was done, anything left open.

- 2026-11-21: plan written, code copied (0.1).
- 2026-11-21: 0.2–1.4 done. The interface is in English, Dutch and Spanish (437 texts, checked by
  test_ui_text.py). Already done for 1.7: a course with only some levels works (the plan, the
  mock exam and the level lists skip what doesn't exist yet). Run the app with another course
  with `set COURSE=<id>` before `streamlit run app.py`.
