# Contributing

We publish this repository from Itoflow's own codebase. Each release there
replaces the files on `main` here and publishes a GitHub release. A commit made
only in this repository is overwritten by the next publish.

## Report a problem or suggest a change

Open an issue with your client, its version, the plugin version and what
happened. Pull requests are welcome as proposals. When we accept one, we make
the change in our codebase and credit you; it reaches this repository with the
next publish, and we close the pull request with a link to it.

## Check a change

```bash
node scripts/validate.mjs
claude plugin validate --strict .
```

To try the plugin from your checkout, see
[Test a local copy](README.md#test-a-local-copy).

## Rules for skills

- Use only public Itoflow features. Let the agent find operations with the
  `search` tool rather than listing endpoints that may change.
- Keep a shared skill free of client names, so it works in every client.
- Never include tokens, keys, passwords or real account data. Use made-up
  examples, and say that they are made up.
- Use public funds or tickers in examples, never a customer's holdings.
- A change to anything a client installs needs a new plugin version.

By contributing, you agree that your work is licensed under the
[Apache License 2.0](LICENSE).
