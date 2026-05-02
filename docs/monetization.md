# Monetizing kanbots — subscription-only, trial-to-paid

A strategy doc. Opinionated. Argue with it.

---

## The brief

> 1. **Don't become Cursor.** No reselling tokens, no sitting in the
>    middle of model usage, no margin-on-inference business.
> 2. **No huge cloud infrastructure.** No fleets of GPUs to run, no
>    centralized agent execution, no per-user always-on services that
>    require a 24/7 SRE pager.
> 3. **Subscription-only.** No perpetual license, no free tier. Pay
>    monthly or lose access. Trial-to-paid is the entire funnel.
> 4. **Sublime in spirit.** Polished, opinionated, single-purpose
>    desktop tool. Not a SaaS suite, not a platform, not a marketplace
>    front-end.

These four together ship one product: a desktop tool that you pay for
monthly, that orchestrates the inference you already pay other people
for. Sublime's craft, JetBrains' billing model, Tower's distribution
shape, none of Cursor's economics.

---

## What kanbots is, in market terms

- **A desktop kanban that orchestrates fleets of local CLI agents.** Five
  Claude Code agents working in five worktrees, decision cards routing
  through a tray, branch previews live, costs tallied per run.
- **Local-first.** SQLite + git worktrees on the user's machine. Data
  does not leave the box.
- **BYOK / BYO-CLI.** `claude`, `codex`, eventual `aider` / `gemini`
  binaries on PATH. You never see a token.
- **Single-user, single-machine.** Identity is the local git user. No
  multi-tenant complexity.
- **Multi-provider.** The dispatcher adapter scaffold (in flight on
  `refactor/dispatcher-adapter-scaffold`) decouples kanbots from any
  single CLI vendor. Strategic asset for the sub-only pitch — your
  subscription doesn't die when one provider raises prices.

Comps a buyer already knows:

| Comp                | Model                      | Lesson for kanbots                                       |
|---------------------|----------------------------|----------------------------------------------------------|
| Cursor              | Sub + inference markup     | What we are not. Use as foil.                            |
| JetBrains IDEs      | Sub-only, $13–19/mo        | The closest spiritual model: dev tool, sub-only, profitable for two decades |
| Figma               | Sub-only, $12–15/mo        | Trial is generous, conversion is design-led              |
| Tower (post-2017)   | Sub-only, $69/yr           | Survived the perpetual→sub backlash; smaller user base, similar revenue |
| Linear (personal)   | Per-seat sub               | Buyer mental model: project tracker on a card            |
| 1Password           | Sub-only, $3/mo            | Aggressive trial, hard gate, no perpetual escape hatch   |
| Sublime Text        | Perpetual, $99             | Aspirational craft and polish. Pricing model is *not* what we're copying. |

The Sublime spirit is the *product*. The pricing comes from JetBrains.

---

## Why sub-only is coherent for kanbots

The strongest case isn't price-per-user; it's **alignment of incentives**.

- The product gets better when the model providers improve. New models,
  new CLIs, new tool patterns ship every quarter. A perpetual license
  forces you to either ship breaking changes for free forever or split
  the user base across versions. A subscription says: you pay because
  the tool keeps up.
- Cost analytics, recipe libraries, and provider integrations have
  ongoing maintenance burden. A subscription pays for that maintenance.
- Sub-only filters the user base to people serious enough to pay.
  Smaller community, higher signal, lower support burden per user.
- The user already pays $20–200/mo for an inference subscription. Asking
  $15/mo for the orchestration on top is a small ask in proportion.

The case to confront honestly: sub-only is harder to launch than
freemium. There's no organic word-of-mouth from free users, no GitHub
stars accumulating from people kicking the tires, no marketplace network
effect from a 100k-user free base. Every install is a deliberate intent
signal that you must earn through marketing. The tradeoff is a smaller,
denser, more profitable user base.

---

## The funnel: trial-to-paid is everything

Without a free tier, the marketing site converts visitors directly into
trial signups. The trial converts users into subscribers. Both steps
need craft.

### Trial design

**14 days, no credit card required, full Pro access.**

- 14 days because devs work in cycles. A 7-day trial is gone before they
  ship anything meaningful. 30 days is too long to maintain urgency.
- No card required because dev tool credit-card-required trials cut
  signups by 60–80%. Better funnel hygiene matters more than gaming
  conversion via card-trapping.
- Full access because the killer demo is the *fleet* — five agents in
  parallel with a cost dashboard. Cripple the trial and you bury the
  one feature that sells the product.

**Day-by-day nudge schedule:**

- Day 0 — onboarding: load a sample workspace, dispatch a real agent,
  see the cost dashboard populate. The first 10 minutes must produce a
  visible "wow."
- Day 3 — in-app summary: "You've run X agents, saved Y minutes vs
  manual dispatch, spent $Z on Claude through kanbots."
- Day 7 — first conversion offer: "Half your trial left. Subscribe now
  and lock in $X/mo." Show the dashboard with their actual data.
- Day 12 — urgency: "Trial ends in 2 days. Continue without losing your
  recipes and run history."
- Day 14 — lock screen: "Trial ended. Subscribe to continue, or export
  your data and uninstall." Provide a one-click subscribe and a clear
  data-export path.
- Day 14 + 7 — recovery email: "Come back, here's 20% off your first
  three months."

**Trial extension rules.**

- One automatic 7-day extension if the user has dispatched fewer than
  3 agents (signal: didn't get to the killer demo).
- No reinstall-to-renew gaming — bind trial state to a hashed machine
  fingerprint *and* the email account. Same person on a new machine
  with the same email gets their existing trial state, not a fresh one.
- Be lenient on legitimate edge cases (machine reset, new laptop) —
  manual extensions on request, no friction.

**Conversion math to plan around.**

- No-card trials in dev tools convert at 5–15% to paid. Plan for 8%.
- Card-required trials convert at 20–40% but signup volume drops 60%+.
  Net usually similar or worse for products without urgent recurring
  need.
- Annual subscription discount (offer 20% off when paying annually) lifts
  paid LTV by ~50% and reduces churn calculation noise.

### What converts

The thing that turns a trial user into a subscriber is almost always a
single moment of *measurable leverage*. The trial design must guarantee
they hit that moment before day 14.

For kanbots that moment is:

- **Cost analytics meets reality.** They see "$47 spent this week on
  Claude, 12 PRs shipped, $3.92 per merged PR" and the math compares
  favorably to their own time. This is the reason they pay.
- **Five agents in parallel, all working.** The kanban metaphor pays
  off the moment they have multiple cards in flight. Single-agent users
  never feel the leverage.
- **A recipe they keep using.** Once they've saved 3+ Task Create
  recipes for their stack, switching tools costs them their library.

Onboarding has to hit at least two of these by day 7.

---

## Pricing

**One tier at launch. Add Team only after 500 personal subs.**

### Pro — $15/mo or $144/yr (20% annual discount)

Everything kanbots does. Multi-repo workspaces, parallel agents,
decision queue, command palette, fork/split, cost analytics, recipe
library, Provider Manager. No artificial gating inside the product;
every feature ships to every paying user.

- Up to 3 devices per license (laptop, desktop, work machine — the
  realistic dev footprint).
- Annual discount is the only price segmentation at launch. Keep it
  simple.

### Team — $25/seat/mo, 5-seat minimum (introduce in year 2)

When kanbots has clear team-purchase signal (companies emailing about
bulk seats), introduce Team:

- Centralized billing (one invoice, not per-seat cards)
- Org cost dashboard rolling up opted-in member usage
- Shared agent recipes via user-hosted sync (their S3 / GitHub repo /
  Postgres — you stay out of storage)
- SSO when an org reaches 50+ seats

Don't build Team early. It's a year-2+ revenue leg, and shipping it
prematurely fragments the product.

### Why $15/mo

- Tower at $5.75/mo is the floor — they pre-date the AI-tool premium
  and don't carry the same polish/feature load.
- JetBrains at $13–19/mo is the comparable: a serious dev tool with
  ongoing development, no inference resale, sub-only, profitable.
- Cursor at $20/mo is the ceiling — they bundle inference. You don't.
  Stay $5 below.
- Linear personal at $10/mo is for project tracking. Kanbots is heavier
  than that, lighter than a full IDE. $15 splits the difference.

Annual at $144 ($12/mo) lifts perceived value (locked-in pricing) and
cuts churn anxiety. Annual takers also pay upfront, which fixes cash
flow.

**Don't launch with a "founders' lifetime deal."** It directly
contradicts sub-only and creates a class of users with no recurring
revenue who are loud about being grandfathered. The user retention play
is the annual discount, not lifetime escape hatches.

---

## License enforcement architecture

The non-negotiable infrastructure. Build this *first*, before the Pro
features. Without it, sub-only is just hope.

### Components

**License server.** A small service (Cloudflare Worker / Fly / Render —
$10–30/mo at any reasonable scale). Endpoints:

- `POST /auth/signup` → creates account, starts trial, issues JWT
- `POST /auth/login` → returns JWT
- `POST /licenses/refresh` → returns refreshed JWT (called weekly by
  the app)
- `GET /licenses/status` → current subscription state (active, past_due,
  canceled, trial_ended)
- Stripe webhook receiver → updates license state on payment events

**License token (JWT).** Signed with the license server's private key.
Embedded claims:

```
{
  "sub": "user_abc123",
  "email": "user@example.com",
  "tier": "pro",
  "status": "trial" | "active" | "past_due" | "canceled",
  "trial_ends_at": "...",
  "paid_until": "...",
  "device_id": "machine-fingerprint-hash",
  "iat": ..., "exp": "...",  // 14 days
}
```

App validates locally with the public key on every launch. Never trust
the server response without signature check — that's how you avoid
single-point-of-trust attacks on the license server itself.

**Offline grace period: 14 days.** The JWT carries a 14-day expiry. The
app refreshes it weekly when online. If the user is offline, the app
keeps working until the JWT expires. After expiry: lock screen, must
reconnect to verify.

This is critical UX. Devs work on planes, in coffee shops, in
conference Wi-Fi hellscapes. A "must phone home or app dies" model
will end up on Hacker News with a thousand-comment thread.

**Device limit: 3 devices.** Track machine fingerprints (MAC address +
hostname + install ID hashed together, not the raw values). 4th device
prompts the user to deactivate one. Per-license, not per-day, so people
don't grind through their slots.

**Phone-home cadence.** Once a week is enough. App refreshes JWT,
server records a heartbeat (used for kicking abandoned devices). Never
phone home on every action; that's hostile and brittle.

### Auth UX

- Email + password. Optionally OAuth via Google/GitHub for less friction.
- "Forgot password" must work — link in the lock screen, magic link to
  email.
- "Sign out" never deletes local data. Re-sign-in restores access
  without re-importing.
- Lock screen shows: account email, last sync time, "reconnect" button,
  "subscribe now" button, "export data" link. Never trap a user with
  no way out — the data export must remain accessible even when locked.

### Subscription state machine

Map Stripe webhook events to license states:

- `checkout.session.completed` → `active`
- `invoice.payment_failed` → `past_due` (give 7-day grace, then
  `canceled`)
- `customer.subscription.deleted` → `canceled` (effective end of paid
  period, not immediate)
- `customer.subscription.updated` → adjust `paid_until`

The `past_due` window prevents one bad credit card transaction from
locking out a paying user. Cancellation lets them keep using until end
of paid period — never claw back what they already paid for.

---

## The licensing question

kanbots is currently MIT-licensed. **This must change for sub-only to
work.** With MIT source, anyone can fork, strip the license check,
publish a free build. The Pro pitch dies the day someone does.

Three paths in order of recommendation:

### Recommended: closed-source binaries from a private repo

- Move the source to a private GitHub repo.
- Ship signed binaries to paying users only.
- Public-facing repo (if any) holds the marketing site, recipe
  contribution SDK, issue tracker, and that's it.
- Pre-relicense announcement: post a clear "we are going closed-source
  ahead of paid launch" note on the public repo. Acknowledge that the
  prior MIT license remains valid for any clone made before the
  relicense date — that's the actual MIT terms, not a concession.

This is the JetBrains / Tower / 1Password / Sublime model. Cleanest
enforcement. Smallest legal surface area.

### Alternative: source-available with FSL or BSL

- Move source to a Functional Source License (FSL — converts to MIT
  after 2 years) or Business Source License (BSL — converts to your
  chosen open license after 4 years).
- Source is public for inspection, audit, and self-build by trusted
  users (security teams, enterprise procurement).
- Commercial use requires a kanbots subscription. Selling competing
  hosted versions is prohibited inside the source-available window.

This buys some community goodwill at a small enforcement cost.
Determined people can still build from source and skip payment, but the
license terms make the casual path illegitimate. Sentry, Hashicorp,
Mongo, Redis, BuildKite all use variants.

### Not recommended: keep MIT

You'd be relying entirely on the inconvenience of cracking the binary
to drive payment. That works for casual users and fails completely for
the populations most likely to pay (companies with procurement reviewing
the license).

**Recommendation: closed-source.** The Sublime spirit you want is the
craft, not the source-availability. Sublime itself is closed-source.

---

## Anti-piracy realism

You cannot fully prevent piracy of a desktop application. Cracked
binaries will exist for any popular paid tool. The realistic stance:

- **Make casual sharing inconvenient.** Per-account license, hashed
  device fingerprint, 3-device cap. People will still share with a
  family member; that's fine. They won't share with a Slack of 500.
- **Detect mass key-sharing.** If one license is checking in from 47
  device fingerprints, revoke and auto-refund the original purchaser as
  a goodwill gesture. Cheaper than a chargeback.
- **Sign your binaries** with code-signing certificates so users see
  warnings on tampered builds.
- **Don't waste engineering on DRM rabbit holes.** Obfuscated bytecode,
  rolling encryption keys, hardware attestation — none of these stop
  the determined pirate, all of them slow down your real engineering.
  Spend that time on the cost dashboard instead.

The economic reality: a $15/mo dev tool aimed at people whose time is
worth $100/hr will not be pirated by anyone in your target market. The
people who pirate are not your customers. Don't optimize against them.

---

## Distribution playbook

Sub-only changes the distribution shape from the freemium playbook.

**No free-user spread.** You can't rely on "10,000 free users will
recommend you to their friends." Every install is a deliberate, paid
(or trial-paid) action. The marketing site has to do the work the free
tier did in the freemium model.

### The killer demo

Sub-only sells *before* the install. The home page must contain a
60-second video that shows:

1. Workspace picker → kanban board with 5 issues queued
2. One click → 5 agents dispatched in parallel
3. Cards lighting up with live tool calls
4. Decision tray showing 2 pending decisions, resolve in two clicks
5. Cost dashboard updating live
6. Final beat: PR opened, branch preview live

If they don't believe the demo, they don't sign up for the trial. If
they do, the trial almost sells itself.

### Channels

- **Hacker News launch** when Pro is ready. One shot. The Show HN must
  open with the demo video, not a "free for 14 days" hook. Lead with
  the product.
- **YouTube long-form demos** on channels in the Claude Code / dev
  productivity orbit. Pay creators for honest reviews; one viral video
  beats 50 sponsored tweets.
- **Sponsored newsletters and podcasts** with developer audiences.
  Bytes, JS Party, Software Engineering Daily, Latent Space. $1–3k
  spends, measure trial signups attributed.
- **Comparison landing pages.** kanbots vs Cursor, vs Aider, vs
  Continue. Be honest about tradeoffs (Cursor has inference bundled,
  we don't; Aider is free, we charge for the GUI; etc.). SEO captures
  high-intent searchers.
- **Devrel partnerships** with Anthropic and OpenAI. They want to show
  off their CLI ecosystems; you're the surface that makes both look
  good. Ask for one quote, one tweet, one blog mention.
- **Twitter/X presence** by the founder. Short videos of fleet runs.
  Build a small audience over time. The product roadmap is the content
  calendar.

### What you skip

- **Reddit free-tier hawking.** Without a free tier, "go try it free"
  doesn't work in r/ClaudeAI. Skip Reddit until there's a real ad
  budget.
- **GitHub stars chasing.** Closed-source means no stars. Don't try.
- **Open-source community building.** Contradicts sub-only. The "community"
  is your paying users; treat them like a customer base, not a movement.

---

## Numbers, with assumptions on the table

These are deliberately conservative. Sub-only with no free tier
produces a smaller TAM than freemium for any given marketing spend.

### Modest scenario (end of year 2)

Assumptions:
- 15,000 cumulative trial signups over 18 months (about 800/month
  average — sustainable with steady marketing, no virality)
- 8% trial-to-paid conversion = 1,200 paying subs
- 30% on annual ($144), 70% on monthly ($15 × 12 = $180)
- Mix-weighted ARPU: $169/yr

Revenue:
- 1,200 × $169 = **$203k ARR**
- Marketplace and Team not in this scenario (year 3+)
- Opex: license server + CDN + Stripe fees + tooling ≈ $20k/yr
- **Net ≈ $183k.** One full-time founder at modest salary.

### Optimistic scenario (end of year 3)

Assumptions:
- 60,000 cumulative trial signups (HN momentum + content compounding +
  one or two podcast appearances landing)
- 12% conversion (cost analytics matures, onboarding refined) = 7,200
  paying subs
- 50% on annual at this stage (existing users renewing as annual)
- Mix-weighted ARPU: $156/yr (more annuals = lower nominal ARPU but
  better cash flow and lower churn)

Revenue:
- 7,200 × $156 = **$1.12M ARR** from Pro
- 100 Team customers × 8 seats avg × $300/seat/yr = $240k ARR
- **Total ≈ $1.36M ARR**
- Opex still under $200k (one engineer, occasional contractor, hosting)
- **Net ≈ $1.16M.** Profitable indie business.

### Both scenarios assume

- Zero token resale revenue (by design)
- Zero compute costs (by design)
- License server and Stripe scale to these volumes for ~$50/mo total
  infrastructure
- One operator can support 1,200 customers; needs help around 5,000

---

## Build order

The temptation is to build Pro features first because they're more fun.
Resist. Without enforcement, every Pro feature you build is given away
for free.

1. **License server + auth + Stripe + license client.** Two to four
   weeks of unsexy work. This is the foundation. Build it now.
2. **Trial state machine in the app.** Lock screen, day-N nudges,
   data-export path. Two weeks.
3. **Cost analytics surfaced loudly.** Inspector cost card, daily/
   weekly dashboard, $/PR metric. The killer Pro feature already has
   the schema (Phase 11a in `REFACTOR_PLAN.md`); finish the UI.
4. **Parallel agents fully wired.** This is the kanban payoff. Make
   sure 5+ concurrent agents work cleanly with no UI hitches.
5. **Recipe save/load/export.** Personal moat for paying users. Phase 6
   already drafts the create modal; recipes are the persistence layer.
6. **Marketing site.** Demo video, comparison pages, trial signup form.
7. **Hacker News launch.** Goal: 200 paying subs in the 90 days
   following launch.
8. **Iterate on conversion.** Onboarding, day-7 nudge wording, annual
   discount A/B. Get conversion from 5% to 8% in months 4–9.
9. **Team plan** when 500+ personal subs are stable. User-hosted sync,
   bulk billing, SSO if asked for.

Codex CLI provider work (in flight on `refactor/dispatcher-adapter-
scaffold`) ships in parallel to step 1. Multi-provider is a marketing
asset, not a paid feature — every trial user benefits.

---

## Honest risks

- **Cold start.** Sub-only means slower year 1. No free users
  contributing recipes, starring repos, or telling friends. Hedge:
  build a real content engine (blog, demos, comparison pages). Be
  patient with the funnel.
- **Trial gaming.** People reinstall to extend trials. Fingerprint
  binding helps but isn't bulletproof. Accept ~5–10% leakage; chasing
  the last 2% is a DRM rathole.
- **Plane outage.** A user gets locked out at 30k feet because the JWT
  expired. Mitigation: 14-day offline grace, lock screen never blocks
  data export, magic-link recovery via email.
- **HN backlash on "subscription for a desktop app."** Real risk.
  Tower got cooked. The mitigation is the demo video and the cost
  analytics — show the leverage before they argue. Be ready with a
  prepared response: "We don't resell your inference; this is a
  subscription for the orchestration that keeps shipping new providers
  and features." Don't get defensive about price.
- **Anthropic / OpenAI ship a competing GUI.** Same as the prior
  thinking: you stay multi-provider, neutral, deeper UX, faster
  iteration. They have weak incentive to build kanban.
- **Stripe / payment provider issues.** A subscription business lives
  and dies on payment infrastructure. Use Stripe + a single backup
  provider (Paddle for international VAT). Don't roll your own.
- **Churn is now your KPI.** In freemium, churn is invisible noise. In
  sub-only, every cancellation is a real revenue loss. Build a
  cancellation flow that asks "why" with one click, log everything,
  read it weekly.
- **Forgotten subscriptions.** Some users will cancel after a few months
  without using kanbots much. Healthy. Don't fight it with dark
  patterns; the customer relationship is worth more than one extra
  month of revenue.

---

## The bottom line

Sub-only desktop dev tool, $15/mo or $144/yr, 14-day no-card trial,
license-gated, closed-source, multi-provider, never sells inference.

JetBrains' billing model. Tower's distribution shape. Sublime's craft.
None of Cursor's economics.

Comps say this is a $200k–$1.5M ARR business in 2–3 years with one or
two operators, no VC, ~$200k/yr opex, and a single license-server
container. It will not be Cursor. That's the point.
