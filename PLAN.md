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
- [x] 3.5 B2 units
- [x] 3.6 C1 units
- [x] 3.7 C2 units
- [x] 3.8 Verbs in context (irregular verbs, tenses) and themed lists.
      (13 verbs-in-context files, 195 sentences; 16 themed lists with 510 entries, including
      phrasal verbs and "Valkuilen voor Nederlanders". More themes can follow, up to the 32 of Spanish.)
- [x] 3.9 Model exams: links to the official Cambridge sample papers per level.
      (`exam_levels` in course.json: A1/A2 → A2 Key, B1 Preliminary, B2 First, C1 Advanced,
      C2 Proficiency; each mock-exam card shows a button to that exam's preparation page.)
- [ ] 3.10 🙋 Menno spot-checks a few units.

## Phase 4: English for Spanish speakers (`en_from_es`)

- [x] 4.1 Translate the explanations of all English units into Spanish (Spain), A1–C2.
      (59 units and PDFs, 5,062 questions; Dutch-specific notes and mistakes rewritten for Spanish
      speakers: ser/estar, "hay", "depend of", false friends such as constipado and embarazada.)
- [x] 4.2 Themed lists and notes for Spanish speakers (false friends, pronunciation traps).
      (15 lists translated plus a new "Trampas para hispanohablantes" with 32 entries; 13 verbs-in-context
      files. Pronunciation traps for Spanish speakers are in A1 · pdf 1.)

## Phase 5: Dutch for English speakers (`nl_from_en`)

- [x] 5.1 Curriculum A1–C2 (word order, separable verbs, de/het, er, modal particles ...),
      following the CEFR, Staatsexamen NT2 and CNaVT. (`courses/nl_from_en/curriculum.md`, 59 units;
      course.json with the integration exam, Staatsexamen NT2 and CNaVT practice pages per level.)
- [x] 5.2 A1 units (9 units, 1,140 questions)
- [x] 5.3 A2 units (10 units; 2,180 questions in the course so far)
- [x] 5.4 B1 units (10 units; 2,890 questions in the course so far)
- [x] 5.5 B2 units (10 units; 3,670 questions in the course so far)
- [x] 5.6 C1 units (10 units; 4,497 questions in the course so far)
- [x] 5.7 C2 units (10 units; the course now has all 59 units and 5,375 questions)
- [x] 5.8 Verbs in context (strong verbs, perfect with hebben/zijn) and themed lists.
      (9 verbs-in-context files, 137 sentences; 16 themed lists with de/het for every noun, including
      separable verbs and "Traps for English speakers".)
- [x] 5.9 Model exams: official NT2 and CNaVT practice exams.
      (exam_levels in course.json: A1/A2 → Inburgeringsexamen, B1/B2 → Staatsexamen NT2 I and II,
      C1/C2 → CNaVT C1; each mock-exam card links to the official practice page.)
- [ ] 5.10 🙋 Menno spot-checks a few units.

## Phase 6: Dutch for Spanish speakers (`nl_from_es`)

- [x] 6.1 Translate the explanations of all Dutch units into Spanish (Spain).
- [x] 6.2 Themed lists and notes for Spanish speakers.

## Phase 7: finishing the website

- [x] 7.1 README and DEPLOY for the whole site; screenshots.
- [x] 7.2 Privacy page (what is stored, how to delete an account), terms of use.
- [x] 7.3 Everything once more on a phone-sized screen.
- [ ] 7.4 🙋 Menno decides on a name and maybe an own domain.

## Phase 8: a real website (replaces the Streamlit app)

Decided with Menno on 2026-11-23: the Streamlit app is slow and loses its place after a short
break, so the site is rebuilt as a normal website. The course files in `courses/` stay the source.
- The exercises run in the browser; the site is hosted on Cloudflare Pages (served from Amsterdam/
  Frankfurt). Accounts and results in Supabase (EU region), with Supabase Auth: email accounts.
- Sign-up needs an invite code for now. Every account has a "has access" setting so a payment
  system (Mollie or Stripe) can switch access on later without rebuilding.
- A professional look: own design, line icons, no emojis.
- Launch with invite codes from Mexico; selling access after Menno is back in the Netherlands
  (KvK registration, BTW, payment provider).
- The Streamlit app keeps running until the new site has everything.

- [x] 8.1 Streamlit app: keep the place (course, page, unit) in the web address and stay logged in
      after a lost connection, so it no longer jumps back to home.
- [x] 8.2 Check: is the Supabase project in an EU region? Answer: US East. It stays there for the
      Streamlit app; the new site gets a new Supabase project in Frankfurt (8.7).
- [x] 8.3 Design: two or three directions for the main pages (course picker, home, exercise,
      reader) as mock-ups. 🙋 Menno picks one.
- [x] 8.4 New `web/` folder: build step that turns `courses/` into data files for the browser.
      How the site is made (no Node or framework needed): plain HTML, CSS and JavaScript modules in
      `web/`; `build_web.py` writes `web/data/` (not in git; Cloudflare runs it when it publishes);
      browser tests run in Edge through Playwright, like the screenshots.
- [x] 8.5 Grading in the browser, with test cases taken from the Python grading so both agree.
- [x] 8.6 Screens: course picker, home, level lists, reader (PDFs), the exercise types, word lists,
      verbs in context, schedule, progress, mock exam; in English, Dutch and Spanish. In the
      answer box keys 1–9 type the special letters of the buttons (Spanish á é í ó ú ü ñ ¿ ¡),
      Alt + a number types the number itself.
- [x] 8.7 Accounts: email sign-up with invite code, login, forgot password, "has access", own
      data only (row-level security), delete own account, admin page for users and access.
- [x] 8.8 Move existing results from the `saves` table to the new tables.
- [ ] 8.9 Tests on phone and desktop sizes (Playwright); a trial address for a few users.
- [ ] 8.10 🙋 Domain, email service for login emails, go live; the Streamlit app is retired.
- [ ] 8.12 Exam-format mock exams: follow the structure of the official model exams (tasks, number
      of questions, timing, points) with the site's own texts and questions, and link to the
      official free model exams instead of putting them on the site (they are copyrighted).
      Menno has the DELE "modelo 0" PDFs (A1–C2) in Desktop/DeleMockExams; for English and Dutch
      the Cambridge and Staatsexamen NT2/CNaVT sample papers do the same job.
- [ ] 8.11 🙋 Later, back in the Netherlands: KvK, BTW, payments switch on "has access".

## Phase 9: Menno's wishes after testing the site

Agreed with Menno on 2026-11-26. In this order:

- [x] 9.1 Words: a unit is a "Chapter" (Hoofdstuk / Capítulo), its reading part is "Theory";
      nowhere "PDF" any more. A location reads "A1 · Chapter 8".
- [x] 9.2 The theory of a chapter on one scrollable page, with a thin, quiet progress bar on the
      LEFT side that shows how far down you are. Reading progress comes from how far you scrolled.
- [x] 9.3 Self-check solutions on the same page, under the exercises, after a line "Solutions below".
- [x] 9.4 The continue button goes to where you left off: the spot in the theory or the exercise list.
- [x] 9.5 Daily review: 20 questions a day, picked from what is most due; fresh every day, nothing
      piles up.
- [x] 9.6 Mastering: a question is mastered when it is right on the first try of a round (a later
      round counts too); a wrong first try in a later round takes it away again. A list is
      mastered at more than 95 % mastered questions. "Exercises finished" = mastered lists + lists
      marked done by hand. The exercise page shows "right first try" and "right in the end".
      "Skip what I know" skips only first-try-right questions. Word lists the same, shown per part:
      A→B, B→A and el/la (or de/het, the article part of each language). Old results don't have to
      be converted (Menno's own status may start over).
- [x] 9.7 Extra correct answers for the word questions: every translation the course gives for a
      word anywhere counts everywhere, both directions (answer_variants.py, 3,800 questions got
      more answers; test_answers.py). "to" and "the" were already optional in the word questions.
      Answers by hand can be added in extra_answers/<course>.json.
- [ ] 9.7b The same check for the sentence exercises (translate, fill): where more than one wording
      is right but only one is accepted. Until then the "I was actually right" button remembers
      your answer for good.
- [x] 9.8 Language choice: two clear steps, "I speak …" and "I want to learn …".
- [ ] 9.9 Verb practice tab (like Word lists), for all three languages: sentences with the verb left
      out, in two modes, "tense given" and "find the tense from the context" (every tense that fits
      is right). A large checked bank of sentences, drawn at random, with a tense filter.
- [ ] 9.10 The comparison boxes (now the yellow Dutch boxes) always compare the language you learn
      with your own language, written in your own language. New boxes for the courses that don't
      have them in the right language; new files.
- [ ] 9.11 Mock exams: the official model exams on the site, visible only to accounts marked for it
      (Menno and his mother; private, not in the repo, in a private Supabase storage bucket). On
      the site: a timer that can be paused, a separate calm "exam" look, and a PDF download. If
      the site ever goes public, this is replaced by own exams in the same format (8.12).
- [ ] 9.12 AI helper next to the theory: answers questions about the page you are on. Through the
      Claude API (billed apart from a Claude.ai subscription), the key as a Cloudflare secret, a
      small server part, a daily limit per person. 🙋 Design proposal first, Menno picks.
- [ ] 9.13 Learning your own language (option a): courses with the explanations in the language
      itself, up to final-exam level (VWO 6 for Dutch, and the same level for English and Spanish).

## Log

Short notes per session: what was done, anything left open.

- 2026-11-21: plan written, code copied (0.1).
- 2026-11-21: 0.2–1.4 done. The interface is in English, Dutch and Spanish (437 texts, checked by
  test_ui_text.py). Already done for 1.7: a course with only some levels works (the plan, the
  mock exam and the level lists skip what doesn't exist yet). Run the app with another course
  with `set COURSE=<id>` before `streamlit run app.py`.
- 2026-11-23: Phase 6 done: all 59 Dutch units in Spanish, adapted for Spanish speakers (mistake rows
  such as "Ik denk in jou", "Ik wacht de bus", "Ik heb het hem" order), 15 word lists, the verbs in
  context and "Trampas para hispanohablantes"; all tests pass. 7.1: new README for the six courses
  with new screenshots, DEPLOY updated; "Put back a backup" now also takes results/<course>_*.json.
- 2026-11-23: 7.2: privacy.py, "🔒 Privacy and terms" on the login screen and in the sidebar (what is
  stored, where, who can see it, terms of use), in all three languages. Online, people with their own
  account can delete it with all results (tick box first); accounts in the secrets can't. Tested
  online against the fake database.
- 2026-11-23: 7.3: every main screen checked at 390 px wide (courses, home, schedule, progress,
  themes, mock, level, reader, exercises, build, listen, translate): no errors, nothing wider than
  the screen. Fixed: on a phone the sidebar now closes after tapping a menu button, and the reader
  keeps two buttons per row so the page comes into view sooner.
  🙋 Question for Menno: es_from_en (Spanish explained in English) still has the "Dutch" comparison
  boxes of the original app in 30 units (for example "One tense, two Dutch tenses"). Keep them, or
  rewrite them for English speakers? Not changed, since they are the original content.
- 2026-11-23: Menno: keep the Dutch comparison boxes in es_from_en. Phase 8 added: the real website.
- 2026-11-23: 8.1: place.py writes the course, screen, level, PDF and page into the web address
  (c=, screen=, level=, pdf=, page=); a new visit after a lost connection opens that place again.
  A practice session or running mock exam comes back to where it started. test_place.py added;
  run_tests.py now prints in UTF-8 so it also works from Git Bash. Tested with a real reload.
- 2026-11-23: 8.2: Supabase is in US East; the new site starts a new project in Frankfurt. 8.3: three
  design directions on a design canvas (A clear and academic, B friendly and bright, C focused study
  app); waiting for Menno's choice. 8.12 added for exam-format mock exams.
- 2026-11-23: 8.3: Menno chose direction A (clear and academic) out of six. Exercise, reader and phone
  screens drawn in that style; colours, fonts and sizes written down in docs/DESIGN.md.
- 2026-11-23: 8.4–8.5: build_web.py makes web/data (16.6 MB, 4 seconds) with the same questions as the
  app; web/js/grading.js grades like practice_logic.py. test_web.py compares the two on 69,185 answers
  of all six courses (39,666 right, 4,366 with a warning, 25,153 wrong): all the same.
- 2026-11-23: 8.6 started: web/ has the course choice, course home (levels, units, daily review, level
  test), the exercises of a unit (all types, topics, 10/20/All, Skip what I know, Mark as done) and the
  practice session (typing with keys 1–9 for á é í ó ú ü ñ ¿ ¡, Alt for numbers, tiles, el/la by key,
  listening, rounds, I was actually right, results with the next type). Results are kept in the
  browser for now, in the same layout as the app. Clicked through in Edge at 1280 and 390 px wide:
  no errors. Still to do in 8.6: reader, word lists, mock exam, schedule, progress, translations.
- 2026-11-23: 8.6 reader: the units as web pages from the content files (all 14 block kinds of
  make_pdfs.py, as HTML), split at each pagebreak; arrow keys, page buttons, Mark as done, Download
  PDF (build_web copies the PDFs). Reading progress in the app's layout; note: the web pages are
  not the PDF pages, so when results move over (8.8) "done" carries over and the pages seen start
  fresh. All 708 first and last pages of the 354 units open without errors.
- 2026-11-23: 8.6 word lists, mock exam (with links to the official model exams), Schedule (today's
  list, coming days, overview with deadlines and calendar, official mock exams, settings) and
  Progress (week by week, trends, levels, mock exams, weak subjects). web/js/plan.js makes the same
  study plan as study_plan.py: test_web.py compares them in 5 situations. Until someone sets
  deadlines, the example is B2 after half a year and the top level after a year. For 8.8: write
  Menno's current deadlines into his study log when his results move, so his plan stays the same.
  Still to do in 8.6: Dutch and Spanish for the new texts.
- 2026-11-23: 8.6 done: the website's own texts are in ui_text/web_nl.json and web_es.json (330 texts
  on the site, all in Dutch and Spanish); test_web_text.py checks them, find_web_texts.py lists
  what is missing. Every test passes.
- 2026-11-25: Units by subject (Menno's request): categories/<language>.json, one per language you
  learn; "By subject" on the course home shows e.g. all units about verb tenses with "A2 · Unit 5".
  build_web.py stops when a unit is missing or in no category.
- 2026-11-25: 8.7 started: Supabase project in Frankfurt (URL and publishable key in web/js/config.js).
  supabase/setup.sql makes invite_codes, profiles (has_access, is_admin) and results with row level
  security; the sign-up is refused without a valid invite code. Screens: log in, make an account,
  forgot password, new password, your account (log out, delete), privacy and terms, admin (invite
  codes, access). Results go to the database when logged in; ?offline keeps them in the browser
  (for the tests). 🙋 Menno: run setup.sql, settings in Supabase, then a first test account.
- 2026-11-25: 8.7 tested against the real Supabase project: wrong invite code refused, account made,
  results saved and back after a reload and after logging in again, another account sees none of
  them, admin functions closed to others, wrong password refused, delete account (tick first)
  removes the account. New Supabase projects need explicit grants for the website (now in
  setup.sql). Left for 8.7: Menno's own admin account (after the site is online).
- 2026-11-25: Site online at https://language-learning.m-lubberts.workers.dev (Cloudflare Workers with
  static assets, wrangler.jsonc publishes web/; every push to GitHub rebuilds it). Measured from
  Mexico: site 1.5 s, unit 1.2 s, checking an answer 16 ms. Menno has his account and is admin (8.7).
- 2026-11-25: 8.8: the account page can bring in the old app's backup per course (web/js/import.js):
  practice results and study log as they are, reading progress from PDF pages to web pages (done stays
  done), and the app's deadlines (B2 4 Dec, C2 20 Jan) when the log has none of its own. 🙋 Menno
  downloads the backup in the Streamlit app and brings it in.
- 2026-11-26: 8.8 done: Menno brought in his results from the old app on the live site.
- 2026-11-26: 9.1–9.5 done: "chapter" instead of "PDF" (the course texts are changed while
  building, the files stay as they are), the theory on one page with a thin bar on the left,
  solutions under a "Solutions below" line, the continue button goes to where you left off, and
  the daily review is 20 questions a day.
- 2026-11-26: 9.6 done: mastered = right on the first try last time (marking as done no longer
  counts); "right in the end" is kept per question (end_ok); a list is mastered above 95% and an
  exercise is finished when mastered or marked done; word lists show the counts per part.
- 2026-11-26: 9.7 done for the word questions (answer_variants.py); 9.7b (sentences) still open.
- 2026-11-26: 9.8 done: the course choice in two steps ("I speak", then "I want to learn"); the site
  switches to your language at step 1; your last course stays at the top.
