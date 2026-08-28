![pi-dumb-zone header](https://raw.githubusercontent.com/ingin97/pi-dumb-zone/master/docs/assets/header.png)

# pi-dumb-zone

A minimal Pi extension that raises a red warning when an assistant response contains a targeted strong-agreement phrase such as **“you are absolutely right”**.

It is intentionally a deterministic lexical heuristic:

- no network calls
- no secondary model calls
- no persistence
- no semantic claims

## Inspiration

This extension was inspired by [_Context Engineering with Dex Horthy_](https://newsletter.pragmaticengineer.com/p/context-engineering-with-dex-horthy), published by The Pragmatic Engineer. Thanks to [Dex Horthy](https://www.humanlayer.dev/) for the context-engineering perspective that prompted it.

## Install

Install from npm with Pi:

```bash
pi install npm:@ingin97/pi-dumb-zone
```

For a project-local install, use:

```bash
pi install npm:@ingin97/pi-dumb-zone -l
```

Then restart Pi or reload with `/reload`.

## Behavior

The extension appends a green status dot after the context indicator in Pi's default footer. At **100k context tokens**, it changes that status to yellow, and shows one warning notification per session. A detected phrase takes priority and switches the status dot to red.

Matching is case-insensitive and allows flexible whitespace. It recognizes targeted strong-agreement phrases such as `you are absolutely right`, `you're right to question that`, `that's actually the better approach`, `exactly — the key thing is`, `100%`, `I couldn't agree more`, and `that's an excellent point` (including curly apostrophes). Only finalized assistant messages are inspected, so streamed text cannot produce duplicate alerts.

False positives are expected. This extension is an observability joke, not a measure of intelligence, alignment, or response quality.

## License

[MIT](LICENSE)
