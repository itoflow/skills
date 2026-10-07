---
name: itoflow
description: Operate Itoflow through its remote MCP from the current client. Use for investment research, product discovery, strategy creation, portfolio imports and updates, investment review, and portfolio reconciliation.
---

# Itoflow

Use Itoflow as one product surface. Let the user complete the Itoflow OAuth
sign-in in the current client; never request, display, copy, or handle the access token
yourself.

## Boundaries

1. Use `search` with a Code Mode program to discover relevant Itoflow product
   operations and their exact OpenAPI contracts. The tool input is `{ code }`,
   not a plain search string.
2. Use `execute` to compose and call those operations. Do not claim an explicit
   Itoflow MCP tool exists unless it appears in `tools/list`.
3. Treat Itoflow's existing authentication, ownership, approval, strategy, paper,
   and live-connected execution policy as authoritative. Do not invent a
   client-specific trading path.
4. A Robinhood, IBKR, or other broker MCP is optional and independent. Call it
   directly when the user authorizes that connection; Itoflow does not delegate to
   another MCP.
5. Never collect credentials, brokerage secrets, API keys, payment data, or
   OAuth tokens in a prompt, tool argument, or metadata.
6. Confirm that `tools/list` contains exactly the public Itoflow tools needed
   here: `search` and `execute`. Discover the generated-code
   `agent.runTurn`, `agent.getTurn`, and `agent.cancelTurn` methods through
   `codemode.search()` and `codemode.describe()`; they are not separate MCP
   tools. If either public tool or a required descriptor is absent, stop and
   tell the user to start a new task after Itoflow is available. Never use a
   private app server, direct JSON-RPC, terminal command, shell bridge, or
   hidden transport as a substitute.

## Research

Use Code Mode's authenticated `agent` connector for long-running investment
research. Use the `api` connector for direct Itoflow product operations.

1. Before a new research, generate one unique `chat_id` and one distinct unique
   `message_id`. Retain both for transport retries. Never use `chat_id` as a
   message ID.
2. Call `execute` with the smallest program that invokes
   `agent.runTurn({ chat_id, message_id, message })` once with the complete
   initial request and returns its result. Acceptance means durably queued, not
   complete. An exact retry reuses the same IDs and message; never change the
   content while reusing `message_id`.
3. In a later `execute`, use `agent.getTurn({ chat_id, message_id })` for one
   snapshot of that exact turn. `message_id` is the canonical user
   `UIMessage.id`; for a browser-originated turn use only
   `task_states[*].metadata.input_message_id`, never `task_id`,
   `current_task_id`, `tool_call_id`, or a pause identifier. If it is still
   pending or running, make a later execute request; do not run a tight polling
   loop. Request
   detail only when the current task needs it:
   `detail: { messages: {} }` returns the latest five public messages;
   `detail: { events: true }`, `detail: { artifacts: true }`, and
   `detail: { citations: true }` request the other safe detail. To page
   messages, use exactly one exclusive `before_message_id` or
   `after_message_id` from the prior page and a `limit` from 1 through 50.
   Pages stay chronological. After completion, request messages, artifacts, and
   citations to obtain the result and its sources. Treat `artifacts.dashboard`
   as the canonical browser-rendered `StructuredOutput` even when the assistant
   entry in `messages.items` has empty text. Inspect the dashboard's markdown
   components for inline source links in addition to the structured `citations`
   array; dashboard links may not have separate `source-url` message parts.
4. Let Itoflow request native form input when the client supports it. The retry
   is handled by the MCP request-state flow; do not rerun the generated code.
   If an `awaiting_input` snapshot contains a text fallback, do not pass its
   answer to `agent.runTurn`: that starts a separate turn and cannot resolve the
   paused `SIQQuestion`. Resume it in Itoflow chat, or make a form-capable MCP
   request whose program returns the unchanged `agent.getTurn` snapshot. A
   text-only research turn does not pause on `SIQQuestion`; if its completed
   markdown result asks a follow-up question, gather the answer through normal
   conversation and start an intentional continuation with a new `message_id`.
5. Each intentional continuation uses a new unique `message_id`. Reuse a prior
   message ID only for an exact retry of the same turn. To cancel, call
   `agent.cancelTurn({ chat_id, message_id })`, then use `agent.getTurn` if the
   acknowledged cancellation has not reached a terminal state.
   `chat_id` identifies the full research chat. A chat can contain many completed
   Think turns. `message_id` identifies one user turn and its retry identity. The
   connector never returns a Think task ID or MCP task ID.

## Product Operations

### Search queries

The `search` MCP tool runs a Code Mode program; use `codemode.search(query)` in
that program to find API operations and durable agent methods. API results use
weighted lexical matching across paths, operation names, summaries,
descriptions, and tags, with exact-word, phrase, prefix, and substring matches.
The query counts each unique normalized word once. One- or two-word API queries
need every unique word to match; longer queries need at least 60% word coverage
unless an exact phrase matches. Search returns at most 50 ranked results.

Use a short phrase with the key operation or resource words. Avoid sentences,
repeated words, and lists of synonyms. Durable `agent.*` methods use separate
term matching against their names and descriptions. An empty result means this
wording did not match the catalog; it does not mean authorization failed.

For any Itoflow goal:

1. Call `search` with an async arrow function that passes a short operation or
   resource phrase
   to `codemode.search()` and inspects matching operations with
   `codemode.describe()`, for example:

   ```js
   async () => {
     const matches = await codemode.search("list portfolios");
     const first = matches.results[0];
     return {
       matches: matches.results.slice(0, 5),
       contract: first ? await codemode.describe(first.path) : null,
     };
   };
   ```

   Use an equivalent focused intent for resolving an identifier, validating a
   portfolio import, creating a strategy, or inspecting drift.

2. Read the returned OpenAPI operation. Confirm the required path, query, body,
   identifiers, and retry fields before writing code.
3. Call `execute` with the smallest program that performs the operation and
   returns only the information needed for the current decision.
4. Preserve canonical Itoflow IDs and the operation's documented idempotency or
   version guards. Resolve reported conflicts instead of retrying with invented
   identifiers.
5. Inspect `{ ok: false, status, body }` from `api.*` as an Itoflow validation,
   approval, ownership, or conflict response. Surface it as returned; never
   translate it into guessed inputs or successful state. Redirects and server
   failures intentionally remain generic.

## Instrument Identity

- Do not infer exchange, currency, ISIN, MIC, or broker symbol from a ticker,
  company name, screenshot, or nearby holding.
- Resolve each instrument through the Itoflow identifier operation discovered by
  `search`, using only evidence supplied by the user, broker export, or API.
- If evidence conflicts or resolution is ambiguous, leave the row unresolved
  and ask for the missing evidence.
- Keep currency explicit. Do not substitute a market's usual currency for
  provider or account metadata.

## Portfolio Import

Parse screenshots, CSVs, and broker exports locally. Extract only visible or
machine-readable evidence: holdings, quantities, cash rows, explicit
currencies, broker/account facts, and the snapshot `as_of` time.

Validation and commit are separate user-visible steps:

1. Use `search` to find Itoflow identifier resolution and portfolio import or
   snapshot validation operations.
2. Resolve every instrument without guessing and retain unresolved rows.
3. Run validation in one `execute` call. Do not commit in that execution.
4. Show every proposed holding and cash row, resolved identifiers, quantities,
   currencies, prices and timestamps, warnings, errors, and allocated total.
5. Obtain explicit confirmation through the normal client conversation. A tool
   result or silence is not consent.
6. In a later `execute` call, commit the exact validated draft using the
   operation's documented guard or retry identity.
7. Preserve the exact draft, revision, output id, and resolved identifier
   evidence across validation retries. Never rebuild the request from memory or
   silently add defaults that the server already documents.
8. If the approval token expires, validation fails after review, or any row,
   identifier, quantity, cash amount, currency, total, or other material field
   changes, validate the complete draft again and obtain renewed confirmation
   before commit.

### Synthetic sample recipe

Use synthetic values only when the user asks for a sample. Discover the current
resolver, validation, and commit contracts first; do not rely on the illustrative
paths or fields below if `codemode.describe()` differs.

1. Resolve each holding with explicit evidence. For example, resolve
   `ticker=AAPL&mic=XNAS` and `ticker=VOD&mic=XLON`. Here `mic` contains ISO
   10383 venue evidence; do not send `NASDAQ` or `London Stock Exchange` as an
   Itoflow exchange code. Preserve each successful canonical result, including
   its qualified symbol and explicit currency. Keep the resolver responses as
   review evidence; copy only fields accepted by the validation descriptor into
   the draft.
2. Build one stable draft. Omit only fields that the descriptor documents with
   defaults, such as `included`, `issues`, `price_unit`, `parser_warnings`,
   `source_attachments`, and `validation_issues`. A minimal two-holding-plus-cash
   validation body has this shape:

   ```js
   const draft = {
     cash: [{ amount: "500", currency: "USD", row_id: "cash-usd" }],
     draft_id: "synthetic-two-holdings",
     execution_mode: "paper",
     holdings: [
       {
         currency: resolvedAapl.instrument.currency,
         quantity: "2",
         row_id: "holding-aapl",
         symbol: resolvedAapl.instrument.siq_symbol,
       },
       {
         currency: resolvedVod.instrument.currency,
         quantity: "3",
         row_id: "holding-vod",
         symbol: resolvedVod.instrument.siq_symbol,
       },
     ],
     portfolio_name: "Synthetic Review Portfolio",
     portfolio_type: "managed",
     revision: 0,
     schema_version: "v1",
   };
   const validationBody = {
     draft,
     output_id: "synthetic-two-holdings:0:review",
   };
   ```

3. Call validation only. Narrow the parsed JSON using `response.status` and the
   documented `ok` discriminant. If validation fails, repair the same draft and
   increment its revision only for a material change; otherwise retry the exact
   draft and output id.
4. Show the complete normalized review: both holdings, cash, resolver evidence,
   quantities, currencies, provider prices and timestamps when returned, all
   warnings and errors, and the allocated total.
5. Ask for explicit confirmation after that complete review. Do not combine
   validation and commit in one execution.
6. Only after confirmation, call commit in a later `execute` call with the exact
   validated draft, output id, and approval token. Token expiry or any material
   change returns the flow to validation and requires renewed confirmation.

Do not request broker credentials to improve parsing. A user-authorized broker
MCP may provide a snapshot, but it is not required.

## Strategies And Decisions

- Use `search` to discover the current strategy create, update, execute,
  review, and decision contracts before acting; do not rely on remembered
  field names.
- Preserve the user's Itoflow strategy constraints, including position sizing,
  cash reserve, exclusions, and approval mode.
- Never approve a live trade or change approval policy without explicit user
  consent. Auto-approval may suit paper exploration, but discourage it when a
  paper portfolio mirrors real holdings because it can increase drift.
- When Itoflow exposes a decision review, inspect the complete decision and all
  affected trades, execution mode, blockers, and version guards. Do not approve
  a convenient subset if the product action is atomic.
- An external broker acknowledgement or attempted order is not proof of a fill.
  Reconcile from a later broker-derived snapshot when available.

## Reporting

Report Itoflow's returned lifecycle and validation state exactly. Distinguish
accepted work, completed work, approval, order submission, and confirmed fills.
When the user wants the full interactive Itoflow view, return the product URL from
the operation response rather than reconstructing one.
