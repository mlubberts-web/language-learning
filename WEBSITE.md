# The website: how it is put online

(DEPLOY.md is about the old Streamlit app.)

The website is the folder `web/` plus a small server part, `worker/index.js`, on Cloudflare Workers.
Settings: `wrangler.jsonc`. Every push to `main` on GitHub makes Cloudflare build and publish it again:

- build command: `pip install pymupdf && python build_web.py` (makes `web/data/` from the courses)
- deploy command: `npx wrangler deploy`
- build variable: `PYTHON_VERSION` = `3.12`

Address: https://language-learning.m-lubberts.workers.dev

## Accounts and results: Supabase

Project in Frankfurt. The tables and rules are in `supabase/setup.sql`; the AI helper's daily count is
in `supabase/ai_helper.sql`. Both are run once in Supabase: SQL Editor > New query > paste > Run.
The publishable key in `web/js/config.js` and `wrangler.jsonc` is public on purpose. The secret key
is never put anywhere in this project.

## The AI helper next to the theory

`worker/index.js` receives the question at `/api/ask`, lets the database check the login, the access
and the limit of 50 questions a day (`supabase/ai_helper.sql`), and asks Claude Haiku 5.5 with the
chapter as context. It needs one secret, set once:

1. Make an API key: https://platform.claude.com/settings/keys (sign up first if needed).
2. Add credit: https://platform.claude.com/settings/billing. Optionally set a monthly limit at
   https://platform.claude.com/settings/spend-limits.
3. In Cloudflare: Workers & Pages > language-learning > Settings > Variables and Secrets > Add.
   Type: Secret, name: `ANTHROPIC_API_KEY`, value: the key. Then Deploy.

Without the secret the site works as usual; the helper then answers "Something went wrong".
