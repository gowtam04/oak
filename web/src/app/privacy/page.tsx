import type { Metadata } from "next";
import Link from "next/link";

import { OPERATOR_ACCESS_DISCLOSURE_MARKDOWN } from "@/components/admin/operator-access-disclosure";
import Markdown from "@/components/Markdown";

export const metadata: Metadata = {
  title: "Privacy Policy — Oak",
  description: "How Oak collects, uses, and protects your data.",
};

/**
 * Standalone, unlinked legal page (no nav from `/`) — its only purpose is to be
 * a live URL for App Store Connect / `AccountView.swift`'s `privacyPolicyURL`.
 */
const PRIVACY_POLICY_MARKDOWN = `# Privacy Policy

**Last updated: June 30, 2026**

Oak ("Oak," "we," "us") is an independent, unofficial fan project — a chat
companion for reasoning about competitive Pokémon teams. It is not affiliated
with, endorsed by, sponsored by, or otherwise connected to Nintendo, Game
Freak, Creatures Inc., or The Pokémon Company. This policy explains what
information Oak collects when you use the app (on the web or on iOS), how
it's used, and the choices you have.

## Information we collect

- **Account email.** If you sign in, we collect the email address you provide
  so we can send a one-time sign-in code. Oak never uses passwords.
- **Chat messages and history.** If you're signed in, your conversations with
  Oak are stored so you can return to them later and have them sync across
  devices. If you're using Oak as a guest (no account), your conversation isn't
  tied to an account and you can't return to it later — the live session exists
  only in memory and is discarded once it ends. Separately, and regardless of
  whether you're signed in, Oak keeps an internal operational record of each
  message and answer (see "Operational records and operator access" below).
- **Team data.** If you build or save a competitive team (species, ability,
  held item, moves, nature, EVs, IVs, Tera type, and similar details), that
  data is stored against your account.
- **Images you attach.** A photo or screenshot you attach to a message is sent
  to the active AI model to help answer that one question. It's used only for
  that single message — the image itself is never stored in your chat history or
  saved anywhere (Oak keeps only a count of how many images a message included).
- **Technical data.** We log IP addresses transiently to rate-limit sign-in
  requests and prevent abuse. Oak does not use analytics, advertising, or
  tracking SDKs of any kind.

${OPERATOR_ACCESS_DISCLOSURE_MARKDOWN}

## How we use this information

We use the information above only to operate Oak: authenticating sign-in,
generating answers to your questions, saving and syncing your chats and
teams, and protecting the service from abuse. We do not sell your personal
information, and we do not use it for advertising.

## Who we share it with

Oak relies on a small number of service providers to function:

- **AI model providers** (xAI/Grok by default, with Anthropic or OpenAI as
  operator-selected alternates) receive your message content, and any images
  you attach, in order to generate an answer.
- **Resend** delivers the one-time sign-in code email to your inbox, and so
  receives your email address for that purpose.
- **Fly.io** hosts the application and its database, in the United States.

These providers process data on Oak's behalf and are not permitted to use it
for their own purposes beyond providing their service to us. We do not sell
personal information to anyone.

## Data retention

- Signed-in account data (chats, saved teams) is retained until you delete it
  or delete your account.
- A guest's live conversation isn't tied to an account and can't be reloaded
  later — it exists only in memory and is discarded when the session ends.
- The internal operational records described above (one per chat turn, one per
  sign-in event) are kept indefinitely, for signed-in and guest activity alike.
- Attached images are never stored; each is used for a single message and
  then discarded.

## Your rights and account deletion

You can permanently delete your account — including all chat history and
saved teams — at any time from the iOS app (Account → Delete account).
Deletion is immediate and can't be undone. If you'd like help deleting or
accessing your data, or have any other question about your information,
email us at gowtam@gowtam.ai.

## Children's privacy

Oak is not directed at children under 13, and we do not knowingly collect
personal information from children under 13. If you believe a child has
provided us with personal information, contact us and we'll delete it.

## Security

We take reasonable technical and organizational measures to protect your
information. No method of transmission or storage is 100% secure, so we
can't guarantee absolute security.

## Changes to this policy

We may update this policy from time to time. Any changes will be posted on
this page with an updated "Last updated" date.

## Contact us

Questions about this policy or your data? Email gowtam@gowtam.ai.
`;

export default function PrivacyPolicyPage() {
  return (
    <div className="legal-page">
      <Link href="/" className="legal-page__back">
        ← Back to Oak
      </Link>
      <Markdown markdown={PRIVACY_POLICY_MARKDOWN} />
    </div>
  );
}
