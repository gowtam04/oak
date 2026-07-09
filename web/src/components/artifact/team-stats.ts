/**
 * team-stats — client-side final-stat readout for the team artifact (TEAM-AD-7).
 *
 * The implementation now lives in the shared, pure `@/lib/teams/member-stats`
 * module (lifted so the server team-analysis service reuses the exact same
 * math). This file re-exports it verbatim for back-compat with the artifact
 * components/tests that import from `./team-stats` — no behaviour change here.
 */

export {
  MEMBER_STAT_KEYS,
  STAT_LABELS,
  computeMemberStats,
  type MemberStatKey,
  type MemberStat,
} from "@/lib/teams/member-stats";
