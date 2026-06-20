# Deploying to Vercel (from your phone)

This is a static Vite app, so Vercel needs zero custom setup — `vercel.json` already pins the
framework, build command (`vite build`), and output directory (`dist`).

## One-time import (~2 minutes, all from the phone)

1. Open **vercel.com** in your mobile browser (or the Vercel app) and sign in.
2. Tap **Add New… → Project**.
3. Under **Import Git Repository**, find **`atc-tav/risk-graph`**.
   - If it isn't listed, tap **Adjust GitHub App Permissions** and grant Vercel access to the
     `atc-tav` org / this repo, then come back.
4. Vercel auto-detects **Vite**. Leave the defaults and tap **Deploy**.
5. After ~1 minute you get a live URL like `https://risk-graph-xxxx.vercel.app` — open it on the
   phone to see the 3D map.

## How updates work after that

- The repo's **Production branch** is `claude/risk-graph-theory-1vikpf` (the current default
  branch). Every push I make to it triggers an automatic redeploy, so the same URL stays current —
  just refresh.
- You can watch build status and grab the URL anytime from the Vercel dashboard / app.

## Optional: a proper `main` branch later

Right now the feature branch doubles as production, which is fine. When you're back at a desk and
want a conventional setup, we can create `main`, set it as the GitHub default + Vercel Production
branch, and treat feature branches as Vercel **Preview** deployments (each gets its own URL).
