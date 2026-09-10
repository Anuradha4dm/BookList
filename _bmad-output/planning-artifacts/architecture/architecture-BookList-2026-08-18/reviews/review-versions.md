# Versions / reality-check review

**Spine:** `ARCHITECTURE-SPINE.md` (draft, 2026-08-18)
**Lens:** Every committed stack/host decision was web-researched or reality-checked on 2026-08-18 — current library versions, named tech still exists and fits, greenfield starter live defaults.
**Project:** Greenfield (no `package.json` in the BookList repo). No brownfield lockfile to ratify.
**Checked:** 2026-08-18 via npm, Node.js docs, GitHub Release schedule, Bonto live pages, and the live `create-vite` `react-ts` template.

**Verdict: pass with findings.** Pinned npm versions exist and are current. Bonto Node 18/20/22 and the Glitch always-on + one custom domain claims match live docs. Two greenfield gaps remain: the official Vite React starter still ships TypeScript 6, and Bonto’s Node 22 *patch* was not confirmed against Vite 8’s 22.12+ floor.

---

## Sources (2026-08-18)

| Claim | Source |
| --- | --- |
| Node LTS schedule | https://github.com/nodejs/Release — 22 Maintenance LTS (EOL 2027-04-30); 24 Active LTS (EOL 2028-04-30); 26 Current |
| Node 22 latest patch | https://nodejs.org/en/blog/release/v22.23.2 — **22.23.2** (2026-07-29) |
| Express | https://www.npmjs.com/package/express — **5.2.1** latest (2025-12-01) |
| better-sqlite3 | https://www.npmjs.com/package/better-sqlite3 — **13.0.3** latest (2026-08-05) |
| TypeScript | https://www.npmjs.com/package/typescript — **7.0.2** latest (2026-07-08); announcement https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ |
| React | https://www.npmjs.com/package/react — **19.2.8** latest (2026-07-21) |
| Vite | https://www.npmjs.com/package/vite — **8.2.1** latest (2026-08-06); engines Node **20.19+ / 22.12+** (https://vite.dev/blog/announcing-vite8) |
| tsx | https://www.npmjs.com/package/tsx — **4.23.12** latest 4.x (2026-08-10) |
| `node:sqlite` on 22 | https://nodejs.org/dist/latest-v22.x/docs/api/sqlite.html — Stability **1.1 Active development**, still experimental |
| `node:sqlite` on 24/26 | https://nodejs.org/docs/latest-v24.x/api/sqlite.html — Stability **1.2 Release candidate** |
| Bonto Node majors | https://bonto.dev/hosting/nodejs, https://bonto.dev/docs — **18, 20, 22** only |
| Bonto default Node | https://bonto.dev/blog/static-sites-nodejs-hosting-guide — **Node 20 by default** |
| Bonto Glitch | https://bonto.dev/pricing — Glitch **$8/mo**, 500 hours, 1G storage, **1 always-on**, **1 custom domain** |
| Bonto free disk | https://bonto.dev/pricing — **256M** storage, 0 always-on, sleep after 30 min |
| create-vite `react-ts` | https://raw.githubusercontent.com/vitejs/vite/main/packages/create-vite/template-react-ts/package.json (`create-vite` 9.1.2) |

---

## Pin-by-pin

| Spine pin | Live 2026-08-18 | Fit | Confirmed? |
| --- | --- | --- | --- |
| Node.js **22** (Bonto max; 18/20 not current LTS) | Bonto offers 18/20/22 only. Upstream: 22 = Maintenance LTS, **24 = Active LTS**, 26 = Current. 18 and 20 are EOL. | Host-constrained, not “current LTS”. Deferred Node 24 is the right escape hatch. | **Major yes; patch no** (see F1) |
| Express **5.2.1** | npm latest 5.2.1 | Exists; still current (quiet since 2025-12-01) | Yes |
| better-sqlite3 **13.0.3** | npm latest 13.0.3 (2026-08-05) | Exists; native addon; still the production SQLite choice on Node 22 | Yes |
| TypeScript **7.0.2** | npm latest 7.0.2 (native Go `tsc`) | Exists as latest; **not** what create-vite ships | Version yes; starter default **no** (see F2) |
| React **19.2.8** | npm latest 19.2.8; create-vite `^19.2.8` | Exists and matches starter | Yes |
| Vite **8.2.1** | npm latest 8.2.1; create-vite `^8.2.1` | Exists; requires Node 22.12+ | Version yes; host patch **no** (see F1) |
| tsx **current 4.x matching Node 22** | 4.23.12 (4.x line); Vite optional peer `tsx ^4.8.1` | Exists; 4.x is current; patch left unpinned | Line yes; exact patch not pinned (see F4) |

AD-8 rejection of `node:sqlite` is still justified **on the chosen runtime**: Node 22 docs mark it Stability 1.1 experimental. It is only RC (1.2) on 24/26, which Bonto does not offer. Do not treat “unflagged” as stable on 22.

Named non-versioned tech that still exists and fits: Express JSON `/api`, Vite React (not Next), Node `scrypt`, SQLite WAL, httpOnly + SameSite=Lax cookies, Bonto persistent disk + `PORT` env. No invented or discontinued product names.

---

## Findings

### F1 — Medium — Bonto Node 22 patch vs Vite 8 engines unconfirmed

**Where:** Stack table (Node 22, Vite 8.2.1); AD-2 / structural seed (Bonto free + Glitch).

**Issue:** Vite 8 requires Node **20.19+ or 22.12+**. The spine correctly pins major 22 as Bonto’s maximum and defers 24. Bonto’s public pages only list majors 18/20/22; they do **not** publish the 22.x patch. Upstream 22 latest is 22.23.2, which would satisfy Vite 8 — that is not evidence of what Bonto runs.

If Bonto’s 22 image is older than 22.12, `vite@8.2.1` will refuse to install or run on the host even though the spine’s majors are consistent.

**Action:** discuss. Before first deploy, read `node -v` on a Bonto 22 app (or Bonto Node-versions docs if a patch appears). If `< 22.12`, either ask Bonto to bump 22 or pin Vite to a 7.x that still accepts older 22. Add `engines.node` (e.g. `>=22.12 <23`) so a default **Node 20** Bonto app cannot silently install.

**Autofix candidate:** one sentence in Stack: “Vite 8 needs Node 22.12+; confirm Bonto’s 22 patch at first app create; set `engines.node`.”

### F2 — Medium — TypeScript 7.0.2 is npm-latest, not the live Vite starter default

**Where:** Stack table TypeScript 7.0.2; prod path `tsc` + `vite build`; AD-6 Vite React apps.

**Issue:** Greenfield. The live `create-vite` `react-ts` template (fetched 2026-08-18) still pins:

- `typescript`: **`~6.0.2`**
- `react` / `react-dom`: `^19.2.8` (matches spine)
- `vite`: `^8.2.1` (matches spine)
- `@types/node`: **`^24.13.3`**
- `@vitejs/plugin-react`: `^6.0.5`
- `oxlint`: `^1.78.0`
- build: `tsc -b && vite build`

TypeScript 7.0.2 **is** npm `latest` (native Go compiler, no stable JS compiler API until ~7.1). `tsx` 4.x compiles via esbuild, so dev may be fine. Prod `tsc` on TS 7 is a real toolchain choice the official Vite starter has **not** made. The spine’s “Seed — verified 2026-08-18” does not record this split.

`@types/node@^24` in the starter also fights the Node **22** runtime.

**Action:** discuss. Either (a) keep TS 7.0.2 and state that the seed **intentionally diverges** from create-vite’s `~6.0.2`, and pin `@types/node` to 22, or (b) match the starter (`typescript ~6.0.2`) until Vite’s template moves. Do not scaffold `react-ts` and assume its TypeScript line is 7.

### F3 — Low — “22 … 18/20 not current LTS” overstates 22’s LTS phase

**Where:** Stack table Node.js row; Deferred “Node 24 (revisit if Bonto adds it; today max is 22)”.

**Issue:** On 2026-08-18, **24 is Active LTS**; 22 is **Maintenance LTS**. 18/20 are indeed not current LTS (they are EOL). The Bonto-max-22 decision is verified. The parenthetical reads as if 22 were the current LTS line.

**Action:** autofix wording: “Node 22 (Bonto max; 24 is Active LTS upstream, not offered; 18/20 EOL).” Deferred Node 24 stays.

### F4 — Low — tsx left as “current 4.x” while other seed rows are exact

**Where:** Stack table tsx row.

**Issue:** Live latest is **4.23.12** (2026-08-10). The 4.x line is current and Vite’s optional peer is `^4.8.1`. Unpinned “current 4.x” is looser than Express/React/Vite pins. Acceptable given “code owns versions once the repo exists,” but the seed is not equally verified.

**Action:** ignore or pin `tsx@4.23.12` (or `^4.23.12`) for parity.

### F5 — Low — Bonto default runtime is Node 20, not 22

**Where:** AD-2; Stack Node 22.

**Issue:** Hosting pages confirm 18/20/22. The Node.js hosting guide still says **Bonto runs Node 20 by default**. Choosing 22 is valid and required for a current LTS-ish line on that host; it is **not** the platform default. Unset `engines` / dashboard version will land on 20, which is EOL and is a worse fit for Vite 8 (20.19+ might still work if their 20 image is new enough — also unconfirmed).

**Action:** autofix: note “must select Node 22 in Bonto (default is 20).”

---

## Confirmed, not findings

- **Glitch plan:** Live pricing matches the spine (always-on + one custom domain). A Bonto blog still lists Glitch with **2** always-on slots; **pricing page (1 slot) is the source of truth.**
- **Free tier:** 256M disk and auto-sleep (30 min on pricing FAQ) match the pre-prod diagram. Hour cap exists; live copy disagrees with itself (plan card **75** hours vs FAQ **50** hours). Spine does not pin a number — good.
- **better-sqlite3 vs `node:sqlite`:** Rejection is current for Node 22. Revisit only if Bonto adds Node 24+ *and* `node:sqlite` is stable on that line.
- **Express 5.2.1:** Eight months without a newer 5.x; still latest. Not stale.
- **React 19.2.8 + Vite 8.2.1:** Match npm latest *and* the live create-vite template.
- No repo lockfile to contradict the seed.

---

## Disposition

| ID | Severity | Disposition |
| --- | --- | --- |
| F1 | medium | discuss — confirm Bonto Node 22.x ≥ 22.12; set `engines` |
| F2 | medium | discuss — TS 7 vs create-vite `~6.0.2`; pin `@types/node` to 22 if keeping 7 |
| F3 | low | autofix — LTS-phase wording |
| F4 | low | ignore or pin tsx 4.23.12 |
| F5 | low | autofix — Bonto default is 20 |

Do not change the spine from this review (finalize-reviewer write-only).
