# Deferred Work

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-parent-register-login-and-auth-gates.md`
  summary: No rate limit, attempt counter, or lockout on `POST /api/session` or `POST /api/parents`, and no log line on failure.
  evidence: Unlimited password guessing against a known email, and an unauthenticated endpoint that creates rows. Pre-existing since Story 1.2 for admin login; Story 1.3 widens the surface to a public registration endpoint. Any throttling library is an "Ask First" dependency.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-parent-register-login-and-auth-gates.md`
  summary: Session rows accumulate without bound — no sweep of expired rows, no index on `expires_at`, and a new login never invalidates the caller's previous session.
  evidence: Rows are deleted only on explicit logout or when an expired cookie happens to be presented, so sessions for anyone who simply closed the tab persist until the file is rebuilt. Behaviour inherited from Story 1.2, now multiplied across every parent.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-parent-register-login-and-auth-gates.md`
  summary: No client-side test runner, so all React behaviour is verified by regex-matching component source text.
  evidence: `io-matrix.test.ts` is the only test file and cannot mount a component. Inverting the gate's `session.status === 'in'` branch would flip which tabs are protected while the suite stays green. Adding a runner is an "Ask First" dependency the spine defers.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-parent-register-login-and-auth-gates.md`
  summary: No `test` script in any `package.json` and no CI configuration, so the suite only runs when someone invokes `node --test` by hand after a build.
  evidence: Root and `server/package.json` define only `dev`, `build`, `start`, and `typecheck`. Every verification claim depends on manual invocation.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-parent-register-login-and-auth-gates.md`
  summary: Validation rules are duplicated between `server/identity/validation.ts` and `client/storefront/src/AuthGate.tsx` with no shared module.
  evidence: The email regex, both Sri Lankan mobile regexes, the password bounds, and several message strings exist verbatim in both files. They agree today, and nothing fails if only one side is later changed.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-parent-register-login-and-auth-gates.md`
  summary: `sessions.admin_id` and `sessions.parent_id` have no `ON DELETE` behaviour.
  evidence: Migration 002 declares both foreign keys without a cascade, so once account deletion exists (Stories 1.4/1.5) deleting a parent will fail on a constraint while the session row survives.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-parent-register-login-and-auth-gates.md`
  summary: Migration 002's table rebuild is only safe because `runMigrations` happens to run before `enableForeignKeys`, and nothing asserts it.
  evidence: The `DROP TABLE sessions` / `RENAME` swap neither checks that `PRAGMA foreign_keys` is off nor runs `PRAGMA foreign_key_check` afterwards. Moving the pragma call earlier in `server/web/index.ts` would silently break the copy.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-parent-register-login-and-auth-gates.md`
  summary: No maximum length on the name and delivery-address fields.
  evidence: Only non-emptiness is enforced, so express's 100 kB body limit is the only ceiling on what gets stored and later rendered back onto the account page. The password cap added during review did not extend to the free-text fields.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-parent-register-login-and-auth-gates.md`
  summary: Registration is an account-enumeration oracle, including for the admin address.
  evidence: A distinguishable 409 confirms whether an email belongs to an existing account, which hands out the admin's address as a verified target for the unthrottled login endpoint. Reserving the admin email was a deliberate decision for this story; the enumeration consequence was not weighed.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-parent-register-login-and-auth-gates.md`
  summary: A session that expires mid-visit is not detected until the next mount, and the chrome offers no signed-out affordance.
  evidence: `SessionProvider` probes once on mount with no central handler mapping a later 401 back to `status: 'out'`, so the UI keeps showing the parent as signed in until a reload. Separately, there is no Log in entry point anywhere in the tab bar — the only way in is to tap a gated tab and discover it is gated.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-parent-register-login-and-auth-gates.md`
  summary: `seedAdmin` does not reconcile with an existing parent holding the same email.
  evidence: If `ADMIN_EMAIL` is later changed to an address a parent already registered, unified login resolves the admin first and locks that parent out permanently, with no error at boot.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-parent-register-login-and-auth-gates.md`
  summary: Auth panel widths are hardcoded and inconsistent — `.auth-gate-panel` at 400px against `.admin-login-panel` at 360px.
  evidence: Sibling dimensions such as `--space-admin-sidebar-w` are tokenised in `tokens.css`, so two untokenised and differing widths for the same kind of surface break the established discipline.
