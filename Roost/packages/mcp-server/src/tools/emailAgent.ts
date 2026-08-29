// email_agent MCP tool: send/checkInbox/readThread.
//
// Talks to real Gmail via googleapis when an account's OAuth credentials are
// present in env (see BUILD_SPEC.md Section 6). When a given account's
// credentials are missing, calls for that account fall back to a persisted
// in-memory mailbox on disk (.mockMailbox.json) so the negotiation loop can
// be built and tested headlessly before Gmail OAuth is wired up — flip over
// to real Gmail with zero code changes once GMAIL_*_REFRESH_TOKEN is set.

import { google, gmail_v1 } from "googleapis";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_MAILBOX_PATH = join(__dirname, "..", "data", ".mockMailbox.json");

export type EmailAccount = "agent" | "landlord";

export interface SendEmailArgs {
  account: EmailAccount;
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  /** RFC822 Message-ID being replied to, for In-Reply-To/References threading. */
  inReplyToMessageId?: string;
  /** Comma-separated Cc addresses — used to keep a client's team on the thread when replying. */
  cc?: string;
}

export interface SendEmailResult {
  threadId: string;
  /** RFC822 Message-ID of the sent message (use as inReplyToMessageId on the next reply). */
  messageId: string;
}

export interface CheckInboxArgs {
  account: EmailAccount;
  /** Restrict to these thread ids. Omit/empty to discover new threads across the whole inbox. */
  threadIds?: string[];
  sinceTimestamp: number; // epoch ms
}

export interface InboxMessage {
  threadId: string;
  messageId: string;
  from: string;
  date: number; // epoch ms
  snippet: string;
}

export interface ReadThreadArgs {
  account: EmailAccount;
  threadId: string;
}

export interface ThreadMessage {
  messageId: string;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  date: number; // epoch ms
  body: string;
}

// ---------------------------------------------------------------------------
// Account config / credential detection
// ---------------------------------------------------------------------------

interface AccountEnv {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  email?: string;
}

function getAccountEnv(account: EmailAccount): AccountEnv {
  const prefix = account === "agent" ? "GMAIL_AGENT" : "GMAIL_LANDLORD";
  return {
    clientId: process.env[`${prefix}_CLIENT_ID`],
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`],
    refreshToken: process.env[`${prefix}_REFRESH_TOKEN`],
    email: process.env[`${prefix}_EMAIL`],
  };
}

function hasRealCredentials(account: EmailAccount): boolean {
  const cfg = getAccountEnv(account);
  return !!(cfg.clientId && cfg.clientSecret && cfg.refreshToken && cfg.email);
}

export function accountEmail(account: EmailAccount): string {
  const cfg = getAccountEnv(account);
  return cfg.email ?? `${account}.mock@roost-hackathon.test`;
}

// ---------------------------------------------------------------------------
// Real Gmail implementation
// ---------------------------------------------------------------------------

// Reused per account for the life of the process, instead of building a
// fresh OAuth2Client (and implicitly re-running the full refresh-token
// handshake) on every single call. googleapis caches the access token on
// the client instance and only actually refreshes it once that token is
// near expiry, but that caching is useless if every caller gets its own
// brand-new, blank-slate client — which is what was happening here: every
// checkInbox/readThread/sendEmail paid for a full token refresh round-trip
// before its real request even went out, on every single call, compounding
// across every thread checked in every poll cycle.
const gmailClients = new Map<EmailAccount, gmail_v1.Gmail>();

function getGmailClient(account: EmailAccount): gmail_v1.Gmail {
  const cached = gmailClients.get(account);
  if (cached) return cached;
  const cfg = getAccountEnv(account);
  const oauth2Client = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret);
  oauth2Client.setCredentials({ refresh_token: cfg.refreshToken });
  const client = google.gmail({ version: "v1", auth: oauth2Client });
  gmailClients.set(account, client);
  return client;
}

// ---------------------------------------------------------------------------
// Rate-limit circuit breaker
// ---------------------------------------------------------------------------
//
// Gaxios retries a 429 up to 3 times per call with its own backoff, so one
// "single" rate-limited call already re-hits Gmail several times on its own.
// A poll loop that just catches-and-retries every 5s on top of that keeps
// hammering the same limit and prolonging it, rather than backing off — this
// was confirmed live as the reason a rate-limit condition made the agent
// look completely unresponsive for 40+ minutes. Recording a per-account
// cooldown when a 429 is seen lets every subsequent call in that window fail
// fast (no network call at all) until Gmail's own stated retry time passes.
const rateLimitCooldownUntil = new Map<EmailAccount, number>();
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000;

function isRateLimited(account: EmailAccount): boolean {
  const until = rateLimitCooldownUntil.get(account);
  return !!until && Date.now() < until;
}

function isRateLimitError(err: unknown): boolean {
  return (err as { code?: number | string })?.code === 429 || (err as { code?: number | string })?.code === "429";
}

function extractRetryAfterMs(err: unknown): number {
  const header = (err as { response?: { headers?: Record<string, string> } })?.response?.headers?.[
    "retry-after"
  ];
  if (header) {
    const seconds = Number(header);
    if (!Number.isNaN(seconds)) return seconds * 1000;
    const asDate = Date.parse(header);
    if (!Number.isNaN(asDate)) return Math.max(asDate - Date.now(), DEFAULT_RATE_LIMIT_COOLDOWN_MS);
  }

  // Gmail's 429 doesn't set an HTTP Retry-After header at all — the actual
  // stated recovery time is embedded in the error's own message text
  // instead ("User-rate limit exceeded.  Retry after 2026-08-29T05:56:52Z").
  // Without this, every 429 fell back to the flat default below, which is
  // far shorter than Google's real window — confirmed live: the cooldown
  // expired long before Gmail actually lifted the limit, so the very next
  // call re-hit the same 429 (and, worse, each fresh hit reported an even
  // LATER retry time than the one before it — hammering a live rate limit
  // appears to push the window out further, not just fail to help).
  const candidateMessages = [
    (err as { message?: string })?.message,
    (err as { cause?: { message?: string } })?.cause?.message,
    ...((err as { errors?: { message?: string }[] })?.errors ?? []).map((e) => e?.message),
  ].filter((m): m is string => !!m);

  for (const msg of candidateMessages) {
    const match = msg.match(/Retry after (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/i);
    if (match) {
      const asDate = Date.parse(match[1]);
      if (!Number.isNaN(asDate)) {
        // A retry landing exactly ON Google's stated boundary (clock skew,
        // or the estimate simply not being exact) immediately re-hits the
        // limit — confirmed live: a retry right at the reported time got a
        // FRESH 429 with an even later retry-after than the one just
        // waited out. A modest safety margin costs nothing when the wait
        // was already long, but avoids landing exactly at the edge.
        const rawMs = asDate - Date.now();
        return Math.max(Math.round(rawMs * 1.25), 1000);
      }
    }
  }

  return DEFAULT_RATE_LIMIT_COOLDOWN_MS;
}

function recordRateLimit(account: EmailAccount, err: unknown): void {
  const cooldownMs = extractRetryAfterMs(err);
  rateLimitCooldownUntil.set(account, Date.now() + cooldownMs);
  console.error(
    `[emailAgent] ${account} hit Gmail rate limit — cooling down for ${Math.round(cooldownMs / 1000)}s`
  );
}

// Small bounded worker-pool, matching the concurrency-limiting pattern used
// for Gmail calls elsewhere (stateMachine.ts) — an unbounded Promise.all
// over every message in a discovery-mode inbox scan is exactly the kind of
// burst that trips the rate limit above in the first place.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(new Array(Math.min(limit, items.length)).fill(0).map(() => worker()));
  return results;
}
const GMAIL_CONCURRENCY_LIMIT = 4;

function headerValue(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string | undefined {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())
    ?.value ?? undefined;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function extractPlainTextBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fall back to recursing (handles nested multipart/alternative).
    for (const part of payload.parts) {
      const nested = extractPlainTextBody(part);
      if (nested) return nested;
    }
  }
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return "";
}

// Reply bodies from Gmail include the full quoted history of the thread
// below the sender's new text (e.g. "On Thu, 27 Aug 2026 ... wrote: > ...").
// Every downstream consumer of a message body — price extraction, tone
// classification, client-intake parsing — used to scan that quoted history
// too, with no way to tell an old quoted number/phrase from something the
// sender actually just wrote. Confirmed live: a landlord replied "Yea
// 25,00,000 works for me", but our own quoted opening offer further down
// the same email ("₹2,50,000/month") matched the price regex first, so the
// agent accepted the deal at 1/10th the price the landlord actually named.
// Stripping the quoted tail at the source, once, fixes every caller at once.
const QUOTE_BOUNDARY_PATTERNS = [
  /^[ \t]*On .{0,150}wrote:[ \t]*$/im, // Gmail/Apple Mail: "On <date>, <name> wrote:"
  /^-{2,}\s*Original Message\s*-{2,}/im, // Outlook: "-----Original Message-----"
  /^From:.{0,200}\r?\n[ \t]*Sent:/im, // Outlook header block
  /^[ \t]*>/m, // first blockquoted line
];

function stripQuotedReplyText(body: string): string {
  let cutIndex = body.length;
  for (const pattern of QUOTE_BOUNDARY_PATTERNS) {
    const match = body.match(pattern);
    if (match && match.index != null && match.index < cutIndex) {
      cutIndex = match.index;
    }
  }
  return body.slice(0, cutIndex).trim();
}

/**
 * RFC 2047 "encoded word" for header text — raw UTF-8 bytes in a header
 * (e.g. the em dash in "Office space inquiry — ...") are not strictly
 * valid RFC 5322 and some clients mangle them into mojibake; base64-encoding
 * non-ASCII header text is the standard fix. ASCII-only text passes through
 * unchanged (cheap check, avoids needlessly encoding the common case).
 */
function encodeHeaderText(text: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, "utf-8").toString("base64")}?=`;
}

function buildRawMessage(args: {
  to: string;
  from: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  cc?: string;
}): string {
  const headers = [
    `To: ${args.to}`,
    `From: ${args.from}`,
    `Subject: ${encodeHeaderText(args.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
  ];
  if (args.cc) {
    headers.push(`Cc: ${args.cc}`);
  }
  if (args.inReplyTo) {
    headers.push(`In-Reply-To: ${args.inReplyTo}`);
    headers.push(`References: ${args.inReplyTo}`);
  }
  const raw = headers.join("\r\n") + "\r\n\r\n" + args.body;
  return Buffer.from(raw).toString("base64url");
}

async function sendEmailReal(args: SendEmailArgs): Promise<SendEmailResult> {
  const gmail = getGmailClient(args.account);
  const from = accountEmail(args.account);

  const raw = buildRawMessage({
    to: args.to,
    from,
    subject: args.subject,
    body: args.body,
    inReplyTo: args.inReplyToMessageId,
    cc: args.cc,
  });

  const sendRes = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId: args.threadId },
  });

  const gmailMessageId = sendRes.data.id!;
  const threadId = sendRes.data.threadId!;

  const meta = await gmail.users.messages.get({
    userId: "me",
    id: gmailMessageId,
    format: "metadata",
    metadataHeaders: ["Message-ID"],
  });
  const rfcMessageId = headerValue(meta.data.payload?.headers, "Message-ID") ?? gmailMessageId;

  return { threadId, messageId: rfcMessageId };
}

async function checkInboxReal(args: CheckInboxArgs): Promise<InboxMessage[]> {
  const gmail = getGmailClient(args.account);
  const myEmail = accountEmail(args.account);
  const results: InboxMessage[] = [];

  if (args.threadIds && args.threadIds.length > 0) {
    // Tracked-thread mode: fetch each known thread, look for new incoming messages.
    for (const threadId of args.threadIds) {
      let thread;
      try {
        thread = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
      } catch (err) {
        if (isRateLimitError(err)) {
          recordRateLimit(args.account, err);
          break; // stop hammering the rest of this batch too
        }
        continue; // thread not visible in this mailbox (yet) — skip
      }

      for (const message of thread.data.messages ?? []) {
        const headers = message.payload?.headers;
        const from = headerValue(headers, "From") ?? "";
        const dateMs = Number(message.internalDate ?? "0");
        const rfcMessageId = headerValue(headers, "Message-ID") ?? message.id!;

        const isIncoming = !from.toLowerCase().includes(myEmail.toLowerCase());
        if (isIncoming && dateMs > args.sinceTimestamp) {
          results.push({
            threadId,
            messageId: rfcMessageId,
            from,
            date: dateMs,
            snippet: message.snippet ?? "",
          });
        }
      }
    }
  } else {
    // Discovery mode: scan the recent inbox for new threads not yet tracked
    // (used by the landlord auto-responder and the client-intake poller,
    // neither of which have a thread registry yet at this point). A plain
    // maxResults cap with client-side date filtering silently misses
    // anything older than the N most recent inbox messages — on a real,
    // busy personal inbox (not a clean test mailbox), unrelated traffic
    // pushes genuine client/landlord replies out of that window within
    // hours. Gmail's `after:` search operator filters server-side by date
    // instead, so nothing gets missed regardless of inbox volume.
    const afterSeconds = Math.floor(args.sinceTimestamp / 1000);
    const list = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      q: `after:${afterSeconds}`,
      maxResults: 100,
    });

    // Fetch metadata for all candidates with bounded concurrency —
    // sequential awaits here turn a 50-message inbox into 50 round-trips end
    // to end (tens of seconds), but a plain unbounded Promise.all fires every
    // request in the same instant, which is exactly the kind of burst that
    // trips Gmail's per-user rate limit on a busy real inbox (confirmed live:
    // this discovery-mode scan runs every 5s from clientIntake.ts, so an
    // unbounded burst here recurred every single poll cycle).
    const messages = await mapWithConcurrency(
      list.data.messages ?? [],
      GMAIL_CONCURRENCY_LIMIT,
      (ref) =>
        gmail.users.messages.get({
          userId: "me",
          id: ref.id!,
          format: "metadata",
          metadataHeaders: ["From", "Message-ID"],
        })
    );

    for (const message of messages) {
      const headers = message.data.payload?.headers;
      const from = headerValue(headers, "From") ?? "";
      const dateMs = Number(message.data.internalDate ?? "0");
      const rfcMessageId = headerValue(headers, "Message-ID") ?? message.data.id!;

      const isIncoming = !from.toLowerCase().includes(myEmail.toLowerCase());
      if (isIncoming && dateMs > args.sinceTimestamp) {
        results.push({
          threadId: message.data.threadId!,
          messageId: rfcMessageId,
          from,
          date: dateMs,
          snippet: message.data.snippet ?? "",
        });
      }
    }
  }

  return results.sort((a, b) => a.date - b.date);
}

async function readThreadReal(args: ReadThreadArgs): Promise<ThreadMessage[]> {
  const gmail = getGmailClient(args.account);
  const thread = await gmail.users.threads.get({ userId: "me", id: args.threadId, format: "full" });

  return (thread.data.messages ?? []).map((message) => {
    const headers = message.payload?.headers;
    return {
      messageId: headerValue(headers, "Message-ID") ?? message.id!,
      from: headerValue(headers, "From") ?? "",
      to: headerValue(headers, "To") ?? "",
      cc: headerValue(headers, "Cc"),
      subject: headerValue(headers, "Subject") ?? "",
      date: Number(message.internalDate ?? "0"),
      body: stripQuotedReplyText(extractPlainTextBody(message.payload)),
    };
  });
}

// ---------------------------------------------------------------------------
// Mock transport (test infra, used only when real credentials are absent)
// ---------------------------------------------------------------------------

interface MockThread {
  threadId: string;
  subject: string;
  messages: ThreadMessage[];
}

interface MockMailboxState {
  threads: Record<string, MockThread>;
}

function loadMockState(): MockMailboxState {
  if (!existsSync(MOCK_MAILBOX_PATH)) return { threads: {} };
  return JSON.parse(readFileSync(MOCK_MAILBOX_PATH, "utf-8")) as MockMailboxState;
}

function saveMockState(state: MockMailboxState): void {
  writeFileSync(MOCK_MAILBOX_PATH, JSON.stringify(state, null, 2), "utf-8");
}

async function sendEmailMock(args: SendEmailArgs): Promise<SendEmailResult> {
  const state = loadMockState();
  const from = accountEmail(args.account);
  const threadId = args.threadId ?? `mock-thread-${randomUUID()}`;
  const messageId = `<mock-${randomUUID()}@roost-hackathon.test>`;

  if (!state.threads[threadId]) {
    state.threads[threadId] = { threadId, subject: args.subject, messages: [] };
  }
  state.threads[threadId].messages.push({
    messageId,
    from,
    to: args.to,
    subject: args.subject,
    date: Date.now(),
    body: args.body,
  });
  saveMockState(state);

  return { threadId, messageId };
}

async function checkInboxMock(args: CheckInboxArgs): Promise<InboxMessage[]> {
  const state = loadMockState();
  const myEmail = accountEmail(args.account);
  const results: InboxMessage[] = [];

  const threadIds =
    args.threadIds && args.threadIds.length > 0
      ? args.threadIds
      : Object.keys(state.threads); // discovery mode: scan every mock thread

  for (const threadId of threadIds) {
    const thread = state.threads[threadId];
    if (!thread) continue;
    for (const message of thread.messages) {
      const isIncoming = message.to.toLowerCase().includes(myEmail.toLowerCase());
      if (isIncoming && message.date > args.sinceTimestamp) {
        results.push({
          threadId,
          messageId: message.messageId,
          from: message.from,
          date: message.date,
          snippet: message.body.slice(0, 120),
        });
      }
    }
  }

  return results.sort((a, b) => a.date - b.date);
}

async function readThreadMock(args: ReadThreadArgs): Promise<ThreadMessage[]> {
  const state = loadMockState();
  const thread = state.threads[args.threadId];
  if (!thread) return [];
  return [...thread.messages].sort((a, b) => a.date - b.date);
}

// ---------------------------------------------------------------------------
// Public API (dispatches to real Gmail or mock per-account, at call time)
// ---------------------------------------------------------------------------

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  if (!hasRealCredentials(args.account)) return sendEmailMock(args);
  if (isRateLimited(args.account)) {
    throw new Error(`Gmail rate-limited for account "${args.account}" — cooling down, try again shortly`);
  }
  try {
    return await sendEmailReal(args);
  } catch (err) {
    if (isRateLimitError(err)) recordRateLimit(args.account, err);
    throw err;
  }
}

export async function checkInbox(args: CheckInboxArgs): Promise<InboxMessage[]> {
  if (!hasRealCredentials(args.account)) return checkInboxMock(args);
  // A rate-limited account has nothing new to report this cycle — returning
  // an empty result (rather than throwing) lets callers' existing "no new
  // messages" path handle it for free, with no special-casing needed.
  if (isRateLimited(args.account)) return [];
  try {
    return await checkInboxReal(args);
  } catch (err) {
    if (isRateLimitError(err)) {
      recordRateLimit(args.account, err);
      return [];
    }
    throw err;
  }
}

export async function readThread(args: ReadThreadArgs): Promise<ThreadMessage[]> {
  if (!hasRealCredentials(args.account)) return readThreadMock(args);
  if (isRateLimited(args.account)) {
    throw new Error(`Gmail rate-limited for account "${args.account}" — cooling down, try again shortly`);
  }
  try {
    return await readThreadReal(args);
  } catch (err) {
    if (isRateLimitError(err)) recordRateLimit(args.account, err);
    throw err;
  }
}

export function isUsingMockTransport(account: EmailAccount): boolean {
  return !hasRealCredentials(account);
}
