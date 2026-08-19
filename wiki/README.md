# Hermes Agent — Engineering Wiki

A self-contained, **offline-first** static wiki that explains how the Hermes Agent
harness actually works, grounded in `path:line` citations into this repository.

Open `wiki/index.html` in any browser — no server, no build step, no network. Mermaid
diagrams render from a vendored copy (`vendor/mermaid.min.js`); nothing loads from a CDN.

## Pages

| Page | What it covers |
| --- | --- |
| `index.html` | Overview + how to read the codebase |
| `architecture.html` | The single production turn loop and its drivers (CLI, gateway, cron, batch, delegation) |
| `self-improvement.html` | Trajectory compression, cron routines, the iteration budget, the auxiliary-LLM approval guardian |
| `internals.html` | `execute_code` RPC tool calls, context compaction, terminal backends, serverless snapshot persistence |
| `providers-auth.html` | `PROVIDER_REGISTRY`, the auth types, OAuth/device-code flows, the credential pool |
| `faq.html` | Subscription-vs-API for Anthropic / OpenAI / xAI and the rest, with ToS analysis |

## Site features (`wiki.js` + `style.css`)

- **Offline search** — type in the top-bar box or press <kbd>/</kbd>. Backed by
  `search-index.js` (see below); arrow keys + <kbd>Enter</kbd> to navigate, <kbd>Esc</kbd> to close.
- **Prev/next pagination**, **copy buttons** on code blocks, **hover anchor links** on
  headings, and a **mobile "On this page" TOC** (the desktop sidebar collapses under 860px).

All enhancement is progressive: if `search-index.js` is missing the box still renders and
says so; every other feature no-ops cleanly.

## Regenerating the search index

`search-index.js` is generated from the page content:

```sh
python3 wiki/build_search_index.py
```

It writes `wiki/search-index.js` (`window.__WIKI_INDEX__ = [...]`), one entry per
section, used by the offline search. Re-run it whenever page text changes.

## Provenance & staleness

Every citation is `path:line` into the working tree **at the time it was last re-grounded**
(see each page's footer for the commit hash and date). Because line numbers drift as the
code changes, re-ground after large merges: re-verify each `<code class="cite">` against the
current source and fix any that moved. The wiki was last re-grounded against commit
`c56af362c` (2026-06-12), immediately after merging ~7094 upstream commits — that merge
nearly halved `run_agent.py` and removed the Atropos RL/eval environment, so the prior
citations were rebuilt from scratch.
