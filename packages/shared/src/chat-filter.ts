/** Common English profanity — matched on word boundaries, replaced with asterisks. */
const PROFANITY = [
  "asshole",
  "bastard",
  "bitch",
  "bollocks",
  "bullshit",
  "cock",
  "crap",
  "cunt",
  "damn",
  "dick",
  "fag",
  "faggot",
  "fuck",
  "fucker",
  "fucking",
  "motherfucker",
  "nigger",
  "nigga",
  "piss",
  "pussy",
  "shit",
  "shitty",
  "slut",
  "twat",
  "wanker",
  "whore",
] as const;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PROFANITY_RE = new RegExp(
  `\\b(?:${PROFANITY.map(escapeRegExp).join("|")})\\b`,
  "gi",
);

/** Replace vulgar words with asterisks (same length, minimum 4). */
export function filterChatText(text: string): string {
  return text.replace(PROFANITY_RE, (match) => "*".repeat(Math.max(4, match.length)));
}
