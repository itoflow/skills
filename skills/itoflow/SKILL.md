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
   `agent.runTurn`, `agent.getTurn`, `agent.cancelTurn`, and `agent.listQueue` methods and the
   `api.startRiskRun`, `api.getRiskRun`, and `api.cancelRiskRun` operations
   through `codemode.search()` and `codemode.describe()`; they are not separate
   MCP tools. If either public tool or a required descriptor is absent, stop and
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
   answer to `agent.runTurn`: that queues a separate message, which waits until
   the paused `SIQQuestion` is answered and cannot resolve it. Resume it in Itoflow chat, or make a form-capable MCP
   request whose program returns the unchanged `agent.getTurn` snapshot. A
   text-only research turn does not pause on `SIQQuestion`; if its completed
   markdown result asks a follow-up question, gather the answer through normal
   conversation and start an intentional continuation with a new `message_id`.
5. Each intentional continuation uses a new unique `message_id`. Reuse a prior
   message ID only for an exact retry of the same turn. To cancel, call
   `agent.cancelTurn({ chat_id, message_id })`, then use `agent.getTurn` if the
   acknowledged cancellation has not reached a terminal state.
6. While a turn runs or waits for input, `agent.runTurn` queues the new message
   and returns `status: "queued"` with its `queue_position`. Messages queued on
   the website and over MCP share one queue. `agent.listQueue({ chat_id })`
   lists it, and `agent.cancelTurn` removes a message that has not started.
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
5. Inspect `{ ok: false, status, body }` from `api.*` as a refusal. All 4xx
   responses and any 5xx status listed for the operation in its published
   OpenAPI document return this shape. Surface it as returned; never translate
   it into guessed inputs or successful state. A whole number of seconds in
   `Retry-After` also returns as `retry_after_seconds`; wait that long before
   retrying. Other header forms are omitted. Redirects and undocumented server
   failures remain generic.

## Instrument Identity

Itoflow resolves instruments, not you: do not infer exchange, currency, ISIN,
MIC, or broker symbol from a ticker, company name, screenshot, or nearby
holding.

1. Resolve with the batch operation
   (`codemode.search("resolve identifiers in bulk")`): up to 2,000 rows per
   call, answered in order. Send only evidence
   that the user, file, broker export, or API supplies: an ISIN, a ticker or
   broker symbol with its exchange or MIC, or an Itoflow symbol. Keep the
   file's company names for the review; do not send them as evidence, since
   one must match Itoflow's name exactly.
2. If the file gives tickers without their market and the user has not said
   which market, ask once. The user may name one market for all such rows, or
   one with exceptions; send each row's market as an Itoflow exchange code
   such as `LSE`, or as an ISO 10383 MIC such as `XNAS` for Nasdaq, and show
   it in the review. The name check below cannot catch a wrong market: a
   company listed in two markets has the same name in both.
3. Send rows marked `resolution_unavailable` again; never retry other failed
   rows unchanged.
4. Compare each returned name with the file's company name. A row whose names
   point to different companies, such as an old ticker that now belongs to
   another company, has not resolved.
5. Itoflow's agent can judge the rows that have not resolved, such as a share
   class written `BRK/B`, a renamed company, or a name with no ticker, with
   Itoflow's own symbol data. Each turn uses Itoflow credits, sends those
   rows' identifiers and company names to Itoflow's agent, and stays in the
   user's account as a chat, so ask the user first: say how many rows have
   not resolved, what asking the agent costs, and what the turn sends and
   keeps. If they decline, report
   those rows as unresolved. If they agree, start a turn as in Research, with
   a new `chat_id` and `message_id`, whose message lists only those rows: a
   row number, every identifier and name the file gives for it,
   any market the user named, and the resolver's error or the name it
   returned. Ask it to propose one Itoflow symbol per row with the
   instrument's name and a short reason, or none; to import and save nothing;
   and to answer with only a JSON array of
   `{ "row", "symbol", "name", "reason" }`, with `symbol` null when it found
   none. A message holds at most 100,000 characters; when the rows do not
   fit, split them across turns, one new turn per `execute`, keeping the
   file's row numbers. In later calls, read each answer from its turn's
   dashboard (`agent.getTurn` with `detail: { artifacts: true }`), as in
   Research.
6. Resolve the proposed symbols with the batch operation as `siq_symbol`
   evidence. Show the user each proposal: the file's row, the symbol, the
   name the resolver returns, and the agent's reason. Use a proposal only
   after the user accepts it, and wait for that answer before you start a
   risk run or import the holdings.
7. Report the rows still unresolved, with their count and, for a weights
   file, their gross weight. Never drop them silently.
8. Keep currency explicit. Do not substitute a market's usual currency for
   provider or account metadata.

## Risk And Exposures

The risk engine measures one book against a benchmark and up to 10 peer funds:
risk, exposures, attribution, factor P&L, bets, sizing, scenarios and
valuation. Use `api.startRiskRun`, `api.getRiskRun` and `api.cancelRiskRun`;
`codemode.describe()` gives their inputs and results. A refused call returns
`{ ok: false, status, body }` for a 4xx or a documented 5xx: check `ok` and read
`body.error.code` before using a result. When present, wait
`retry_after_seconds` before retrying. A `403` with `feature_not_enabled`
means risk runs are off for this account; tell the user and start nothing.

1. Learn what the file holds first: weights or quantities, how it marks shorts,
   which legs it has, and whether it lists cash. Never assume a NAV. The engine
   takes weights: signed fractions of the book's net assets, below zero for a
   short. A file of quantities needs prices and a NAV to become weights; ask
   the user, or import it as a portfolio and measure that by `portfolio_id`.
2. Before the first call, tell the user what it sends: the identifiers to
   resolve, then symbols and weights, the benchmark and the peers, and nothing
   else from the file. If the user agrees to ask Itoflow's agent about rows
   that did not resolve, that turn also sends those rows' identifiers and
   names.
3. Resolve every name to a canonical `SYMBOL.EXCHANGE` symbol with the batch
   operation, as above. Keep a `CASH` line as it is: it is not a listing, so
   never send it to the resolver. `CASH` is US dollars; cash in another
   currency goes in as `CASH` too, so tell the user its currency and weight,
   and that the run does not measure that currency's risk. Never send a bare
   ticker; the engine reads one as a US listing. When two rows resolve to one
   symbol, add their weights, since the engine refuses a symbol listed twice.
   Leave out a line, `CASH` included, whose weights add to zero. If any row has
   no weight, ask the user for a complete set of weights for the book to run,
   including `CASH` when the file lists cash. Start nothing until that set
   meets the cash and total rules in step 4. Consent to omit the row is not
   enough.
4. A book holds 1 to 3,000 lines. With a `CASH` line the weights add to 1,
   within 0.01. Without one, the engine holds the rest as cash, so a book that
   borrows must list `CASH` below zero. One run measures one book: run the
   whole book, and run a leg on its own only when the user asks.
   A name that did not resolve stays out, and the run counts its weight as
   cash. Add the signed weights left out to the `CASH` line; a book without
   one gets a `CASH` line of 1 less the weights that go in. Never rescale the
   other weights. If no name resolved, start nothing and tell the user: the
   engine refuses a book of cash alone (`portfolio_has_no_holdings`).
   Otherwise tell the user which names stay out and their gross weight, and
   start only once they agree; a program that resolves and starts in one
   `execute` starts only when every name resolved.
5. Before the start, make a new UUID for `request_key` and keep it. Each
   `execute` starts with no state, so resolve and start in one program:
   `api.startRiskRun({ body: { request_key, request: { portfolio: { holdings }, benchmark, peers } } })`,
   returning the `run_id`. If that does not fit in one
   `execute`, resolve in one, return the symbols in input order, and start in
   the next. A retry with the same key and request joins the run it started,
   up to 24 hours after that run ends. The same key with another request
   returns `409`, so use a new key for any other request.
6. A run takes minutes, with a 20 minute deadline. Return after the start,
   then read it with `api.getRiskRun({ run_id })` in later `execute` calls,
   and read a `running` run again later. Do not loop inside one program. A
   finished result stays for 24 hours. If the start's answer was lost, start
   again with the same key and request to get the `run_id`. A `503` means the
   engine gave no answer: wait `retry_after_seconds` when present, then retry,
   with the same key for a start.
7. A `429` with `risk_engine_busy` means three of this account's runs are
   going. Wait for one to end; never cancel a run you did not start. On an
   account others share, run one book at a time.
   `api.cancelRiskRun({ run_id })` stops a run the user no longer wants; a
   stopped run keeps no result.
8. Return a short summary from the program, not the whole result: `summary`
   has the headline figures and what the run left out, and `view` says what
   it measured. Take only the figures you need from `component`; a `null`
   value was not computed, never zero. Clients cut or move large results.
9. Say what the figures leave out: the gross weight of names that did not
   resolve, which the run counted as cash; `view.unmodelled` and
   `view.modelled_weight`; `view.dropped_peers` with their reasons; and every
   sentence in `summary.notes`. A `partial` run is not a full result; say what
   it did not compute.
10. Tracking error, beta and active exposures to the benchmark and to each
    peer come from the run; read them, do not work them out yourself. State
    the units as the panel labels them, and report `view.as_of`.
11. A `failed` run's `failure_code` says why. `engine_refused` means change
    the request as `reason` says; `rate_limited` and `provider_unavailable`
    mean start again later with a new `request_key`.
12. A `429` from the resolve operation means this minute's limit is spent.
    End the program with what you have, tell the user, and send the rest in a
    later `execute`. Never fall back to one call per name.
13. If the client blocks a call, for example as "Data Exfiltration", say so,
    name the rule it gave, and point the user to the Itoflow MCP setup guide
    for that client. Never split, encode or rename data to get past the check.

### Risk At Past Dates And Side By Side

A risk measure gives factor risk for 1 to 10 books on one factor model
version, at one date or over a range of up to 60 dates. Use it for past dates,
a range of dates, or several books side by side. For today's full report on
one book, with attribution, scenarios and peers, start a risk run instead.

1. Make a new UUID for `request_key` and keep it. Start with
   `api.startRiskMeasure({ body: { request_key, request: { model, benchmark, books, top_names } } })`
   and return the `measure_id`. A retry with the same key and request joins
   the measure it started, up to 24 hours after that measure ends. The same
   key with another request returns `409`, so use a new key for any other
   request.
2. `model.as_of` is one date; `model.range` is `{ from, to, step }`, at most
   60 dates; with neither, the measure takes the newest publication. `step`
   is `month_end`, the default (each month end, and `to` when it is not one),
   or `daily` (each weekday). Leave `model.version` out to use the live
   version; every date uses the one version, and the answer names it. Send
   that version to any later measure you compare with this one.
3. A book is `{ label, portfolio: { portfolio_id, holdings_at } }`, the saved
   portfolio's newest snapshot on or before `holdings_at`, or
   `{ label, holdings: [{ symbol, weight }] }` under the weight rules above.
   Labels are unique in the call. Left out, `holdings_at` is the end of each
   date in New York, so a range follows the portfolio as it was saved. Funds
   in a book, and the benchmark, are read through their stored holdings on or
   before each publication's model date.
4. A year of month ends on a few books takes a minute or two; ten large books
   take several minutes, and a measure stops at 20 minutes. Return after the
   start, then read it with `api.getRiskMeasure({ measure_id })` in later
   `execute` calls, and read a `running` measure again later; `progress`
   gives `dates_done` and `dates_total`. Do not loop inside one program.
   `api.cancelRiskMeasure({ measure_id })` stops a measure the user no longer
   wants.
5. What moved risk between D0 and D1: one measure with `model.range` from D0
   to D1 and the portfolio twice, `held` at `holdings_at` D0 and `live` with
   `holdings_at` left out. On D1, `live` against `held` is the trades; `held`
   on D1 against `held` on D0 is the market and the model. With the default
   `month_end` step, D0 is on the grid only when it is a month end; otherwise
   use `daily`.
6. An `ok` measure's `answer.dates` has one entry per date, oldest first.
   Return a short table from the program, not the whole answer: for each date
   and book, `risk.total_volatility`, `active.tracking_error`, `active.beta`
   and `coverage.modelled_share_of_gross`. Volatility and tracking error are
   annual decimals: 0.21 is 21%. Shares are percent of variance. Report
   `model.version` and each date's `publication_date`. Dates that share a
   publication read the same books, but each date checks the age of inputs
   carried forward, so their figures can differ.
7. Say what the figures leave out. `coverage.modelled_share_of_gross` is the
   share of the book's gross weight the model covers, not a share of net
   assets; `active.modelled_share_of_gross_active` is the same for the active
   book. Report `coverage.unmodelled_count` and the largest lines in
   `coverage.unmodelled`. A date with `status: "missing"` has no publication
   of the version; it names `nearest_before` and `nearest_after`. Say which
   books came back `omitted` and why, and repeat each warning. A null
   `benchmark` on a date means no book is stored for that fund then.
8. A line's `reason_code`: `unmodelled`, the model has no score for the name
   at that publication, and a risk run can add it; `no_equity_listing`, a
   line with no confirmed equity listing, such as a bill or bond, which no run
   can add; `no_fund_book`, a fund the measure could not look through;
   `invalid_inputs`, a saved holding that could not be valued; `not_listed`,
   the part of a fund its source does not list; `cash_currency`, cash in a
   currency other than the model's. Read `reason` for any other code.
9. A measure does not add names to the model. To add them, start a risk run
   on the book: it adds each name it can score to the model's publications
   from the last two years. Then measure again.
10. A `failed` measure's `failure_code` says why: `model_version_not_found`,
    leave `model.version` out; `answer_too_large` or `timed_out`, split the
    books or the range across measures; `cancelled`, start again with a new
    key; `engine_fault`, try once more, then tell the user.
11. A measure counts toward the account's three runs while it runs. A `429`
    with `risk_engine_busy` or a `503` with `risk_engine_unavailable` carries
    `Retry-After`, returned by MCP as `retry_after_seconds`; wait that long
    and call again once, with the same key for a start. A `404` with
    `portfolio_not_found` means the portfolio is missing or not this
    account's.

## Portfolio Import

Parse screenshots, CSVs, and broker exports locally. Extract only visible or
machine-readable evidence: holdings, quantities, cash rows, explicit
currencies, broker/account facts, and the snapshot `as_of` time.

Validation and commit are separate user-visible steps:

1. Use `search` to find Itoflow identifier resolution and portfolio import or
   snapshot validation operations.
2. Resolve every instrument as in Instrument Identity and retain unresolved rows.
3. Run validation in one `execute` call. Do not commit in that execution.
   Validation answers `200` even when the draft fails; read the result's
   `error` and row errors before saying it passed.
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
