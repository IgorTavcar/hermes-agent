# Hermes Agent — Fresh Engineering Wiki (`wiki_fresh`)

A self-contained, **offline-first** static wiki built *from the code*, explaining how the
Hermes Agent harness actually works — grounded in `path:line` citations into this
repository at commit `42a4c91c4` (2026-08-19).

Open `wiki_fresh/index.html` in any browser — no server, no build step, no network.
Mermaid diagrams render from a vendored copy (`vendor/mermaid.min.js`); nothing loads
from a CDN.

## Why a second wiki?

The repo already ships `wiki/`. This `wiki_fresh/` was written independently, from a
fresh code sweep, with a different table of contents oriented around **transferability** —
"how is Hermes built, and what/how/where can be transferred (best methods, algorithms,
ideas, know-how) to another agent harness."

## Pages

| Page | What it covers |
| --- | --- |
| `index.html` | Overview + how to read the codebase + a message end-to-end |
| `architecture.html` | The one shared core, process model, gateway pipeline, session keying, the SQLite state DB, subagent delegation, `execute_code` RPC, the four extension surfaces |
| `loops.html` | The inner (turn) and outer (session) loop algorithms in detail, with the actual loop bodies and ordering invariants |
| `kernels.html` | The LLM client/adapter layer per dialect — SDKs wrapped, request/tool conversion, streaming, prompt caching, reasoning params |
| `providers.html` | The provider catalog and, one by one, the subscription-tier OAuth integrations (Claude Pro/Max, ChatGPT/Codex, Grok, Copilot, Qwen, MiniMax, Nous) |
| `channels.html` | Channel setup — Telegram, WhatsApp (Baileys & Cloud API), Twilio SMS, plus Discord/Slack/Signal, with real config keys |
| `multimodal.html` | Explicit multimodal support in code — Text→Image (`image_generate` + provider registry), Image→Text (native vision routing + `vision_analyze`), Text→Audio (`text_to_speech` + streaming TTS), Audio→Text (the gateway STT pipeline), the shared media plane, and what is *not* in core |
| `orchestration.html` | Workflows and (sub)agents — `delegate_task` anatomy, the Kanban DAG engine and worker fleet, steerability/isolation/configurability/observability/inter-agent comms axis by axis, harness self-agents, and why there is no dynamic workflow engine |
| `skills.html` | The self-adaptive skills machinery — creation trigger, review fork, ownership guards, memory nudges, session search, Honcho, curator |
| `transfer.html` | The transferable ideas index — best methods/algorithms/know-how, by the scarce resource each defends, with what to lift first |

## Site features (`wiki.js` + `style.css`)

- **Offline search** — type in the top-bar box or press <kbd>/</kbd>. Backed by
  `search-index.js`; arrow keys + <kbd>Enter</kbd> to navigate, <kbd>Esc</kbd> to close.
- **Prev/next pagination**, **copy buttons** on code blocks, **hover anchor links** on
  headings, and a **mobile "On this page" TOC** (the desktop sidebar collapses under 860px).

All enhancement is progressive: if `search-index.js` is missing the box still renders and
says so; every other feature no-ops cleanly.

## Regenerating the search index

`search-index.js` is generated from the page content:

```sh
python3 wiki_fresh/build_search_index.py
```

It writes `wiki_fresh/search-index.js` (`window.__WIKI_INDEX__ = [...]`), one entry per
section plus a page-level entry. Re-run it whenever page text changes.

## Provenance & staleness

Every citation is `path:line` into the working tree at commit `42a4c91c4`. Content was
re-derived from source by parallel code-exploration passes and spot-checked against the
tree. Because line numbers drift as code changes, re-verify each `<code class="cite">`
after large merges.

> **Caveat.** Subscription-OAuth providers route real consumer subscriptions through
> agent traffic. Confirm such usage is within each provider's terms of service before
> relying on it in production; Hermes provides the transport, not the entitlement.
