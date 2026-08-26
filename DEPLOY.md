# Deploying to Cloudflare Pages

This site is a static frontend (`index.html` + `/img`) plus two small serverless
functions (`/functions/api/...`) that run on Cloudflare's edge. The functions
check your passcode and store your projects — the passcode itself never
reaches the browser.

## 1. Push this folder to a GitHub (or GitLab) repo

Cloudflare Pages deploys from a git repo. Create a new repo, add all these
files (keeping the folder structure exactly as-is), and push.

If you'd rather not use git, you can also deploy directly with the `wrangler`
CLI — see step 5 for the equivalent command.

## 2. Create the KV namespace (this is your database)

In the Cloudflare dashboard:

1. Go to **Workers & Pages → KV**
2. Click **Create namespace**, name it `PORTFOLIO_KV`
3. Save it — you'll bind it to your Pages project in step 4

## 3. Create the Pages project

1. **Workers & Pages → Create application → Pages → Connect to Git**
2. Pick the repo you pushed in step 1
3. Build settings: framework preset **None**, build command **(leave blank)**,
   build output directory **`/`** (the repo root — that's where `index.html` lives)
4. Deploy. It'll go live at a `*.pages.dev` URL first — that's expected, you'll
   attach your real domain in step 6.

## 4. Bind the KV namespace and set your secrets

Still in the dashboard, on your new Pages project:

1. **Settings → Functions → KV namespace bindings → Add binding**
   - Variable name: `PORTFOLIO_KV`
   - KV namespace: the `PORTFOLIO_KV` you created in step 2
2. **Settings → Environment variables → Add variable**, add both of these
   as **Secret** (not plaintext) for both Production and Preview:
   - `ADMIN_PASSCODE` — whatever passcode you want to unlock the admin panel with
   - `SESSION_SECRET` — a long random string (used to sign login sessions;
     doesn't need to be memorable, just random — e.g. generate one at
     https://1password.com/password-generator or run `openssl rand -hex 32`)
3. Trigger a new deployment (Settings changes require a redeploy to take effect —
   easiest is to push an empty commit, or hit **Retry deployment**).

## 5. (Alternative to steps 1–4) Deploy with Wrangler CLI directly

If you'd rather skip git entirely:

```bash
npm install -g wrangler
wrangler login

# Create the KV namespace
wrangler kv namespace create PORTFOLIO_KV

# Add the namespace id it prints to wrangler.toml (see below), then:
wrangler pages deploy . --project-name=your-project-name

# Set secrets
wrangler pages secret put ADMIN_PASSCODE --project-name=your-project-name
wrangler pages secret put SESSION_SECRET --project-name=your-project-name
```

You'll need a minimal `wrangler.toml` in this folder for the KV binding:

```toml
name = "your-project-name"
pages_build_output_dir = "."

[[kv_namespaces]]
binding = "PORTFOLIO_KV"
id = "the-id-wrangler-printed-in-the-create-command"
```

## 6. Point your domain at it

Since your domain is already on Cloudflare DNS:

1. On your Pages project: **Custom domains → Set up a custom domain**
2. Enter your domain/subdomain — Cloudflare will add the DNS record for you
   automatically since the zone is already in your account
3. Wait a minute or two for it to propagate

## 7. Test it

- Visit your domain — the three seed projects should load (they come from
  `functions/_shared/defaultProjects.js` until you add your own)
- Click **Admin** in the footer, enter the passcode you set in step 4
- Add a project — it should appear immediately, for anyone who visits, no
  redeploy needed
- Refresh the page in a different browser/device to confirm it's really
  server-side, not just local to your machine

## Notes

- Each project's images are stored as base64 directly inside its KV record.
  That's simple and fine for a portfolio's worth of photos, but if you start
  uploading a lot of large images, KV has a 25MB-per-value ceiling — worth
  moving images to Cloudflare R2 (object storage) if you ever hit that.
- Session tokens last 2 hours, then you'll need to re-enter the passcode.
- To change the passcode later, just update the `ADMIN_PASSCODE` secret in
  the dashboard and redeploy — no code changes needed.
