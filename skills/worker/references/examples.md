# A local analysis conversation

These resources and results are synthetic examples. Replace them with the
current session's actual capabilities, files and user request.

## First message

> I am the local agent working in the user's portfolio-analysis project. I can
> use Python and the shell, read and edit the shared analysis code, query the
> configured read-only holdings database, and use the connected market-data
> MCP. I can retrieve its daily adjusted prices, but have not verified access
> in this session. I also have returns.parquet and prior sector-exposure outputs
> here. I can inspect schemas, filter and join tables, aggregate rows, run your
> calculations with pandas, and render charts. File coverage and currency are
> unverified. Database access is read-only; local output files are writable.
>
> The user wants a risk review of a synthetic portfolio using the local holdings
> and return history. I have not checked the return-history coverage yet. Load
> your local-worker-research skill and lead the research: choose the question
> and method, use your own research tools, review the evidence and write the
> conclusion. I will follow your retrieval, transformation and execution
> instructions and return data and results for your analysis.
> Please state your plan and the first local assignment, with its inputs,
> method, checks and expected output. If local work is unnecessary, do the
> research in Itoflow.

Include other available capability categories when they exist. If a resource
is only named in the conversation but its access is unverified, say so.

## Instructions and results

```text
Itoflow → Local agent
  I will research the benchmark, choose the risk tests and interpret the results.
  First return the holdings schema, as-of date, currencies, classification
  source and missing-value counts. Do not transform the holdings yet.

Local agent → Itoflow
  The synthetic table has instrument_id, market_value_usd and sector.
  Holdings are dated 2026-09-30. All 20 values are present and in USD.
  Sector comes from the local instrument table; two rows have no sector.

Itoflow → Local agent
  Group by sector; retain missing sectors in an "Unclassified" group.
  Sum market_value_usd and divide each sum by the total to calculate weights.
  Return the sector table, total value, missing-sector count and coverage.
  Check the grouped values equal the original total and weights sum to 100%.

Local agent → Itoflow
  I ran the query and helper. Weights sum to 100%.
  These synthetic holdings are dated 2026-09-30; classifications came from
  the local instrument table, with 98% of portfolio value classified.
  Two holdings have no sector classification.
  The requested table follows in this message. The complete output is also
  in results/sector_exposure.csv on this machine; the source is unchanged.
  [Requested sector table and totals]
  I await your review and next instruction.

Itoflow → Local agent
  Query the connected market-data source for those two instrument IDs.
  Return its classifications and as-of dates before changing the calculation.

Local agent → Itoflow
  The source returned one dated classification and no match for the other.
  [Returned classification, instrument ID, source and date]
  I have not changed the inputs or rerun the calculation.

Itoflow → Local agent
  Use that classification, retain the unmatched row as Unclassified, and
  rerun the same aggregation and checks. I will interpret the exposure.
```

The result is a normal follow-up message. No upload, private record or artifact
registry is needed for Itoflow to ask for further work on the local CSV.

## When a transformation needs a decision

```text
Itoflow → Local agent
  Join the daily return files and calculate the annualized volatility.

Local agent → Itoflow
  The files have different date coverage and missing observations. Please
  specify the date window, missing-data policy and annualization convention.
  I have not dropped rows, filled values or calculated a result.

Itoflow → Local agent
  Use the shared observed dates in 2025, drop dates missing either return,
  use sample standard deviation times sqrt(252), and report the excluded
  date count alongside each result. Do not fill missing returns.
```

Once the method is clear, write and run the necessary code, return the requested
values and checks, and let Itoflow decide what those values imply.

## Execution repair and a proposed research change

```text
Local agent → Itoflow
  Your CSV reader failed on encoding. The file's byte-order mark identifies
  UTF-16, so I corrected the decoder and reran your calculation. Row counts,
  identifiers, units and the requested checks match; I did not alter the data.
  [Requested results and checks]

Local agent → Itoflow
  The requested provider returned prices only from 2022. Your method needs
  data from 2018, so the requested calculation is incomplete. Another local
  source advertises the longer history, but its adjustment basis is unverified.
  I recommend checking that basis and coverage before switching sources.
  I have not substituted data or shortened the window.

Itoflow → Local agent
  Inspect the alternative's adjustment metadata and coverage first. Return
  those facts and overlapping-date comparisons so I can decide whether to use it.
```

Own local diagnosis, implementation repairs and their verification. Offer
informed options for research changes; let Itoflow choose the revised analysis.

## When all research is handed back

```text
Itoflow → Local agent
  Research both ETFs, find all sources, choose the risk measures, collect the
  market context, compute the results and tell me which one is best.

Local agent → Itoflow
  Please keep the lead researcher role. I have no existing local dataset for
  these ETFs. Use your research tools to establish the facts and method, then
  give me a bounded calculation or retrieval where my tools help. Tell me the
  inputs, checks and result you need; retain the final interpretation.
```

If Itoflow reports that the cloud skill is missing, say that plainly. A local
plugin upgrade alone does not install it on the server. If Itoflow can follow
the stated split, continue; otherwise report the role mismatch as a blocker.

After a bounded calculation, send the result for review. Do not issue your own
final recommendation while Itoflow's review is still running.

## When access changes

If the database connection expires, tell Itoflow that the query did not run and
use the current client's normal authentication flow. If a file has moved or
changed, describe the current file and which earlier result needs checking.
Do not repeat a completed action merely because a reply is delayed.
