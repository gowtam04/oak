# Champions-first — Auth and Permissions

Existing email one-time-code accounts stay. This file only states **what changes** for Champions-first and what must remain true. Personas: guest, signed-in player, operator.

## Roles

| Role | Goal |
|------|------|
| Guest | Chat, Dex, Usage, Calc without an account |
| Signed-in player | Durable history, living teams, archive, voice, apply/save, shares |
| Operator | Existing admin, including Champions item allowlist |

- **CF-AUTH-BR-1** — Signing in is still optional. Guests can use the Champions coach (chat, Dex, usage, calc) fully except for durable save paths.
- **CF-AUTH-BR-2** — Operator access remains the existing private admin allowlist. There is still **no** in-app link to admin for ordinary players.

## Guest

- **CF-AUTH-US-1** — As a guest, I want to use Champions reference and chat without signing in.
  - **CF-AUTH-AC-1.1** — Given I am signed out, I can open a new Champions chat, Dex, Usage, and Calc.
  - **CF-AUTH-AC-1.2** — Given I am signed out, I cannot create, edit, import, or apply onto a saved team. Those actions ask me to sign in (CF-AS-11).
  - **CF-AUTH-AC-1.3** — Given I am signed out, Voice is not available (CF-AS-10).
  - **CF-AUTH-AC-1.4** — Given I am signed out, I have no Archived section (I have no saved teams).

## Signed-in player

- **CF-AUTH-US-2** — As a signed-in player, I want only **my** living and archived teams, and my history.
  - **CF-AUTH-AC-2.1** — Given I am signed in, I see only my living Champions teams and my archived teams.
  - **CF-AUTH-AC-2.2** — Given another account’s team id, I cannot view, edit, apply, or delete it (existing isolation).
  - **CF-AUTH-AC-2.3** — Given I sign in on a second client (web / iOS / Android), then living teams, archive, and history are the same account-scoped data.

## Operator

- **CF-AUTH-US-3** — As the operator, I want to keep curating which held items count as available in Champions.
  - **CF-AUTH-AC-3.1** — Given I am an operator, I can still maintain the Champions item allowlist/exclusions (CF-AS-7).
  - **CF-AUTH-AC-3.2** — Given an item is excluded, then players see it as not in the Champions roster (CF-DATA-BR-20).
  - **CF-AUTH-AC-3.3** — Given I am not an operator, I cannot change the allowlist.

## Permission-deny states (product)

| Action | Guest | Signed-in | Other account |
|--------|-------|-----------|---------------|
| Champions chat, Dex, Usage, Calc | Allow | Allow | n/a |
| Voice | Deny (sign in) | Allow | n/a |
| Create / import / apply living team | Deny (sign in) | Allow | Deny |
| View / delete own archived team | n/a | Allow | Deny |
| Edit archived team | n/a | Deny | Deny |
| Operator item allowlist | Deny | Deny unless operator | Deny |
