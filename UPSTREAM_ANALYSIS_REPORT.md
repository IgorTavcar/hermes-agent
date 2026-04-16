# Hermes Agent: Upstream Intelligence & Architecture Report

**Date:** 2026-04-16 (status-refreshed from 2026-03-23)
**Repo:** NousResearch/hermes-agent @ `1ccd0637`
**Fork:** IgorTavcar/hermes-agent (now even with upstream)
**Originally analyzed:** 50 open PRs, 50 open issues, 30+ merged PRs, 150+ forks, full codebase architecture

> **Refresh note (2026-04-16):** After fast-forwarding 1467 upstream commits, the **status** of every PR referenced below was rechecked (see [§9 PR Status Refresh](#9-pr-status-refresh-2026-04-16)). The PR/issue/fork *catalog itself* was **not** re-audited — the set of "top open PRs" and "interesting forks" reflects the March snapshot and has drifted. Treat recommendations in §2 and §8 as historical; re-audit before acting. Architecture deep-dive (§6) is updated in the companion `MULTI_AGENT_ARCHITECTURE_REPORT.md` drift log.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Open PRs: Merge Recommendations](#2-open-prs-merge-recommendations)
3. [Open Issues: Critical Bugs & Opportunities](#3-open-issues-critical-bugs--opportunities)
4. [Active Forks: Interesting Implementations](#4-active-forks-interesting-implementations)
5. [Merged PR Patterns: What Maintainers Accept](#5-merged-pr-patterns-what-maintainers-accept)
6. [Architecture Deep Dive](#6-architecture-deep-dive)
7. [Embedding Viability Assessment](#7-embedding-viability-assessment)
8. [Recommendations](#8-recommendations)
9. [PR Status Refresh (2026-04-16)](#9-pr-status-refresh-2026-04-16)

---

## 1. Executive Summary

Hermes Agent is a **production-grade, modular AI agent framework** by Nous Research with:
- 14 messaging platform adapters (Telegram, Discord, Slack, WhatsApp, Signal, Matrix, etc.)
- 22+ toolsets (40+ individual tools) for web, terminal, browser, vision, memory, etc.
- Context compression, streaming, subagent delegation, plugin system
- Cron scheduling, cross-session memory (Honcho AI), skill system

**Key findings:**

| Area | Finding |
|------|---------|
| **Open PRs** | 50 open; 10 are high-value, 27 are bug fixes. Several critical fixes waiting for merge. |
| **Open Issues** | Provider/auth config is the #1 pain area. Compression has a death-spiral bug. |
| **Forks** | 12 forks have substantial changes. Best: WebAPI backend, multi-agent teams, CDLM reasoning, Lark adapter. |
| **Architecture** | Well-structured. AIAgent class is importable and embeddable. 6 callback hooks for full observability. |
| **Embedding** | **YES - viable.** Three integration paths: Python API (max control), HTTP REST, ACP protocol. |

---

## 2. Open PRs: Merge Recommendations

### Tier 1: CRITICAL - Should Merge Immediately

| PR | Title | Author | Impact |
|----|-------|--------|--------|
| **#2554** | Replace dead `summary_target_tokens` with ratio-based scaling | teknium1 (maintainer) | Fixes 91% information loss during compression on non-1M context models. The old `summary_target_tokens` was dead code. |
| **#2587** | Pass `base_url` and `api_key_env` to fallback provider | KiraKatana | 7-line fix for **fundamentally broken** custom fallback endpoints. Also fixes crash when API returns string instead of dict. |
| **#2524** | Isolate Telegram polling from streaming edits | Lyt060814 | Fixes `httpx.ReadError` production crash affecting ALL Telegram users with streaming. Single shared HTTP connection saturated. |

### Tier 2: HIGH VALUE - Strong Merge Candidates

| PR | Title | Author | Lines | Why Merge |
|----|-------|--------|-------|-----------|
| **#2560** | State machine hardening + 6 major features | claudlos | +4,654/-735 | **Mega PR**: Repo Map (aider-style), Test/Lint Runner, Auto Git Commits, Architect Mode, @-mention Context, Cost Tracking. All 5998 tests pass. Needs splitting. |
| **#2558** | SimpleX Chat gateway adapter | Mibayy | +1,038/-3 | Full private messaging platform. WebSocket, reconnect, file attachments, all 16 integration points. |
| **#2578** | Multi-tier fallback chain with auto-recovery | haqk | +242/-2 | Extends single fallback to ordered cascade. Background auto-recovery when primary returns. `/fallback` status command. |
| **#2551** | Windows support overhaul | claudlos | +16,600/-14,848 | Transforms Windows from "not supported" to "supported". Security hardening (shell=True removal), native clipboard, Windows Task Scheduler. |
| **#2570** | Background delegation (fire-and-forget subagents) | anpicasso | +169/-58 | Adds `background=true` to `delegate_task()`. Reuses existing `/background` infrastructure. |
| **#2572** | SearXNG self-hosted web search | bhovig | +82/-1 | Privacy-respecting, no API keys, no rate limits. Auto-detect via `SEARXNG_URL`. |
| **#2548** | Ctrl+Backspace whole-word deletion in TUI | kshitijk4poor | +659/-1 | Extracts terminal keyboard handling into standalone module. Kitty protocol + xterm + legacy fallback. 23 tests. |

### Tier 3: GOOD - Worth Reviewing

| PR | Title | Author | Lines | Notes |
|----|-------|--------|-------|-------|
| **#2576** | Tool deselection not persisting | ereid7 | +112/-2 | `hermes tools` deselections silently re-enabled by platform defaults. |
| **#2575** | Ignore Discord system messages | ticketclosed-wontfix | +104/-0 | Bot responds to thread renames, pins, boosts. |
| **#2531** | /stop bypasses replay paths | verapillars | +142/-28 | /stop queued and replayed as user prompt. Defense-in-depth fix. |
| **#2529** | Collapse only large pastes, not whole prompt | kortexa-ai | +243/-50 | Paste collapsing triggered by total buffer, not pasted chunk. |
| **#2527** | Remove expired sessions after flush | teyrebaz33 | +12/-40 | Eliminates O(N) LLM call floods on gateway restart. Net reduction. |
| **#2525** | Slack formatting + thread reply fix | ghostmfr | +38/-2 | Three Slack bugs: streaming bypasses formatting, tables leak, wrong thread. |
| **#2538** | Suppress 'Event loop is closed' noise | acsezen | +16/-0 | Cosmetic but alarming stderr on MCP shutdown. |
| **#2535** | Plugin CLI + format documentation | anpicasso | +260/-18 | Fills major documentation gap. Removes unimplemented `register_command()` API docs. |
| **#2580** | Show custom providers in /model | kortexa-ai | +91/-8 | Custom providers invisible in `/model` output. |

### Duplicate/Competing PRs (pick one)

| Issue | PR A | PR B | Recommendation |
|-------|------|------|---------------|
| Custom provider remapped to openrouter | #2571 (teyrebaz33) | #2564 (dieutx) | #2571 (more concise) |
| /resume CLI handler | #2592 (dieutx) | #2593 draft (alanwilhelm) | #2593 (more thorough, handles edge cases) |
| Plugin toolset bypass | #2588 (Bartok9) | #2577 (teyrebaz33) | Both needed (CLI + gateway sides) |

### Skip

| PR | Reason |
|----|--------|
| **#2568** (SimoKiihamaki) | Kitchen sink: 17 unrelated commits, +2,477/-401. Started as 1-line import fix. |
| **#2589** (InB4DevOps) | Unnecessary AGENTS.md modification alongside test PR. |

---

## 3. Open Issues: Critical Bugs & Opportunities

### Critical Bugs (Breaking Core Functionality)

| Issue | Title | Impact |
|-------|-------|--------|
| **#2562** | `custom` provider silently switched to `openrouter` | Trust-breaking: user config mutated without consent. Blocks all custom/local model users. |
| **#2565** | Secret blocklist blocks local model usage | `none`, `null`, `dummy` in API key field triggers cryptic error for local models needing no key. |
| **#2574** | Plugin toolsets excluded from platform_toolsets (regression) | Breaks plugin ecosystem. Caused by commit `34be3f8b`. |
| **#2153** | Context compression death spiral in gateway | 212k+ token sessions hit unrecoverable loop. All 3 compression defense layers fail simultaneously. |
| **#2128** | Empty assistant message leaks into Chat Completions API | Breaks multi-provider setups with thinking models. |

### Provider/Auth Cluster (Systemic Issue)

Issues #2562, #2565, #2281, #2204, #2374 all point to **fragile provider/auth resolution**. The auth layer needs hardening:
- Config.yaml values silently ignored on fresh startup
- Custom providers remapped to openrouter
- Placeholder API keys rejected for local models
- MiniMax auth overwritten by Anthropic token refresh

### High-Impact Feature Requests

| Issue | Title | Why It Matters |
|-------|-------|---------------|
| **#2416** | Publish to PyPI | **Blocks ACP Registry listing** (Zed, JetBrains integration). |
| **#2553** | Discord app command registration | Discord blocks unrecognized `/` commands. Skills fail silently. |
| **#2046** | Observation masking for older turns | Reduce quadratic token growth without LLM summarization. |
| **#2045** | Lazy skill loading | 87 bundled skills = 1,500-2,000 wasted tokens per message. |
| **#2293** | Config preserved across updates | Users lose custom values on `hermes update`. Multiple confirmations. |

---

## 4. Active Forks: Interesting Implementations

### Top-Tier Forks (Merge-Worthy Ideas)

#### 1. skeletor-js: **Full WebAPI Backend** (16 commits ahead)
- Complete FastAPI REST API: session CRUD, SSE chat streaming, memory, skills, config, cron job management
- ~1,200+ lines of clean, separated routes/models/deps
- `hermes webapi` CLI command
- **Verdict:** HIGH value. Creates the missing web frontend layer. Would unlock web UI development.

#### 2. SimoKiihamaki: **Web Page FTS5 Storage** (23 commits ahead)
- SQLite-backed persistent storage for scraped pages with FTS5 full-text search
- 5 new tools: `web_page_search`, `web_page_list`, `web_page_get`, `web_page_delete`, `web_page_stats`
- Also: massive linter cleanup (70% pyflakes warning reduction across 54 files)
- **Verdict:** HIGH value. Makes web research persistent and searchable.

#### 3. brezgis: **Multi-Agent Team System** (5 commits ahead)
- Full `team/` package: supervisor, planner, registry, messaging, local models
- `team_tools.py` for CLI access, 1,800+ lines of tests
- Review skills, CI/CD guardrails, security audit documentation
- **Verdict:** HIGH value but ambitious. The team orchestration concept directly addresses agent swarm control.

#### 4. Ti0aceite: **Browser Tool Overhaul** (23 commits ahead)
- `browser_select` for dropdowns, dependent dropdown stabilization
- Secret env var support with redacted traces
- 885-line browser test suite
- **Verdict:** HIGH value for browser automation use cases.

#### 5. Ebb-Flow-Tech: **Lark (Feishu) Platform Adapter** (14 commits ahead)
- Full Lark adapter: webhook handling, Interactive Cards, event dedup, AES decryption
- 5 card types, chart image delivery, deployment templates
- **Verdict:** HIGH value for Chinese market / Feishu users.

#### 6. BrianLi009: **CDLM Reasoning Engine** (1 commit ahead)
- Conflict-Driven Learning solver (~2,800 lines)
- Academic-quality with visualization, sudoku demo, math contest problems
- Hermes tool integration + `/cdlm` activation
- **Verdict:** MEDIUM-HIGH for research applications.

#### 7. nelohenriq: **Infrastructure Modules** (3 commits ahead)
- Context compaction (390 lines), prompt cache (331 lines), rate limiter (418 lines), token stats (323 lines)
- **Verdict:** MEDIUM-HIGH. Addresses real infrastructure needs, but less polished.

#### 8. sh1ftmaker: **Resume by Working Directory** (4 commits ahead)
- `hermes --resume` auto-detects most recent session by CWD
- Schema v6 migration, 3 resume modes, fallback to recent session
- **Verdict:** MEDIUM-HIGH. Genuine UX improvement, clean implementation.

### Fork Summary Table

| Fork | Key Innovation | Lines Added | Quality |
|------|---------------|-------------|---------|
| skeletor-js | WebAPI (FastAPI) | ~1,200+ | Very High |
| SimoKiihamaki | Web page FTS5 search | ~680 | Very High |
| brezgis | Multi-agent teams | ~1,500+ | High |
| Ti0aceite | Browser tool suite | ~1,300 | High |
| Ebb-Flow-Tech | Lark adapter | ~640 | High |
| BrianLi009 | CDLM reasoning | ~2,800 | High |
| nelohenriq | Rate limiter, cache | ~1,360 | Medium-High |
| sh1ftmaker | Resume by CWD | ~140 | High |
| bhovig | SearXNG search | ~155 | Medium-High |
| agenthatchery | Docker + deep research | ~470 | Medium |
| tradewife | Apollo distribution | ~400 | Medium |
| Lux-Fiat | Railway + reminders | ~600 | Medium |

---

## 5. Merged PR Patterns: What Maintainers Accept

### Merge Workflow
The project uses a **"salvage" workflow**: community PRs are rarely merged directly. Instead, `teknium1` cherry-picks, rewrites, and merges on internal branches (`hermes/hermes-*`).

### What Gets Merged
1. **Small, focused PRs** with clear problem statements
2. **Bug fixes** with test coverage
3. **Platform adapter improvements** (parity across platforms)
4. **Gateway reliability** features (reconnect, resilience)
5. **MCP ecosystem** work (CLI management, OAuth)

### What Gets Rejected
1. **Large PRs** (>3,000 additions) without prior discussion
2. **PRs duplicating maintainer work** already in progress
3. **Kitchen-sink PRs** mixing unrelated changes
4. **PRs without tests** or test plans

### Recent Development Priorities
1. Gateway reliability (auto-reconnect, exponential backoff)
2. MCP ecosystem (CLI management + OAuth 2.1 PKCE)
3. CLI UX (@ context completions, Claude Code style)
4. Platform adapter parity (Discord, Matrix catching up to Telegram)
5. Data persistence (ResponseStore to SQLite)

---

## 6. Architecture Deep Dive

### Core Components

```
hermes-agent/
├── run_agent.py          # AIAgent class (~7,400 lines) - core agent loop
├── model_tools.py        # Tool registry, discovery, definitions
├── toolsets.py           # 40+ tool groupings per platform
├── hermes_state.py       # SQLite session/message persistence (WAL mode)
├── cli.py                # Interactive TUI (prompt_toolkit)
├── agent/
│   ├── prompt_builder.py    # System prompt construction
│   ├── context_compressor.py # LLM-based context summarization
│   ├── display.py           # Pluggable display abstraction
│   ├── delegation.py        # Subagent spawning
│   └── anthropic_adapter.py # Anthropic-native API support
├── gateway/
│   ├── run.py              # GatewayRunner (~5,800 lines) - multi-platform orchestrator
│   ├── session.py          # Session lifecycle, reset policies
│   ├── delivery.py         # Cross-platform message routing
│   ├── stream_consumer.py  # Token streaming → platform edits
│   ├── hooks.py            # Plugin hook discovery & dispatch
│   └── platforms/          # 14 adapter implementations
│       ├── base.py         # BasePlatformAdapter abstract class
│       ├── telegram.py
│       ├── discord.py
│       ├── slack.py
│       └── ... (11 more)
├── tools/                  # 22+ tool implementations
│   ├── delegate_tool.py    # Subagent spawning
│   ├── memory_tool.py      # MEMORY.md + USER.md
│   ├── terminal_tools.py   # Shell execution
│   ├── web_tools.py        # Search + extraction
│   ├── browser_tool.py     # Browser automation
│   └── ...
├── acp_adapter/            # Agent Client Protocol (Zed, JetBrains)
├── cron/                   # Background task scheduler
├── skills/                 # 87 bundled skill definitions
└── hermes_cli/             # CLI utilities, config, auth
```

### Agent Loop Flow

```
run_conversation(user_message)
  ├─ Build system prompt (cached per session)
  ├─ Preflight compression check
  └─ Main Loop (while iterations < max):
      ├─ Check interrupt flag (0.3s polling)
      ├─ Fire step_callback
      ├─ Call LLM API (stream or non-stream)
      ├─ Process response:
      │   ├─ Text → stream_delta_callback
      │   ├─ Tool calls → parallel execution (8 threads max)
      │   │   ├─ Safety: never-parallel set, path overlap detection
      │   │   └─ Fire tool_progress_callback per tool
      │   └─ Reasoning → reasoning_callback
      ├─ Post-response: memory nudge, skill nudge, compression check
      └─ Return {final_response, messages, api_calls, completed}
```

### Callback/Observability System

| Callback | Fires When | Signature |
|----------|-----------|-----------|
| `stream_delta_callback` | Each text token | `(text_delta: str)` |
| `reasoning_callback` | Each reasoning token | `(reasoning_text: str)` |
| `tool_progress_callback` | Before each tool | `(tool_name, args_preview, args)` |
| `step_callback` | After each LLM turn | `(api_call_count, prev_tools)` |
| `status_callback` | Progress/warnings | `(status_dict)` |
| `clarify_callback` | Interactive prompts | `(question, choices)` |

### Subagent/Delegation

- Spawns child `AIAgent` with isolated context
- **Shared** `IterationBudget` (parent+children count toward session limit)
- Max depth: 2 (no grandchild recursion)
- Max concurrent children: 3
- Parent interrupts propagate to all children recursively
- Results returned to parent's tool result (intermediate steps hidden)

### Provider Support

| Provider | API Mode | Features |
|----------|----------|----------|
| OpenRouter | `chat_completions` | 200+ models, reasoning, streaming |
| Anthropic | `anthropic_messages` | Native SDK, prefix caching |
| OpenAI | `chat_completions` | Standard, streaming |
| Codex | `codex_responses` | Responses API, reasoning |
| Custom | `chat_completions` | Any OpenAI-compatible endpoint |
| Copilot | ACP | Agent Client Protocol |

### Context Compression

1. Prune old tool results (cheap pre-pass)
2. Protect first N messages (system + opening exchange)
3. Protect tail by token budget (~20K tokens)
4. Summarize middle turns with auxiliary model
5. On subsequent compressions, iteratively update summary
6. Creates new session linked via `parent_session_id`

---

## 7. Embedding Viability Assessment

### Can We Embed Hermes as a Controllable Agent Platform?

**YES.** Three integration paths:

### Path A: Python API (Maximum Control)

```python
from run_agent import AIAgent
from hermes_state import SessionDB

db = SessionDB()
agent = AIAgent(
    model="anthropic/claude-opus-4.6",
    base_url="https://openrouter.ai/api/v1",
    api_key="...",
    session_db=db,
    session_id="controlled-session-001",
    enabled_toolsets=["web", "terminal", "delegation"],
    tool_progress_callback=my_tool_monitor,
    stream_delta_callback=my_stream_handler,
    step_callback=my_step_observer,
)

# Run (sync - wrap in executor for async)
result = agent.run_conversation(user_message="...")

# Interrupt from another thread
agent.interrupt("cancel this")
```

**Pros:** Full callback observability, session control, tool restriction, interrupt support.
**Cons:** Sync API (needs ThreadPoolExecutor wrapping), filesystem coupling to HERMES_HOME.

### Path B: HTTP REST API (Process Isolation)

```bash
# Start API server
hermes gateway --platforms api_server

# OpenAI-compatible endpoint
curl -X POST http://localhost:8642/v1/chat/completions \
  -d '{"model":"hermes","messages":[{"role":"user","content":"..."}]}'

# Streaming via SSE
curl -X POST http://localhost:8642/v1/chat/completions \
  -d '{"model":"hermes","messages":[...],"stream":true}'
```

**Pros:** Process isolation, language-agnostic, standard API.
**Cons:** Less granular control, no per-tool callbacks via HTTP.

### Path C: ACP Protocol (Standardized)

```python
from acp_adapter.server import HermesACPAgent
# initialize(), new_session(), prompt(), cancel()
```

**Pros:** Standardized protocol, editor integration ready.
**Cons:** Newer, less battle-tested.

### What Works Well for Embedding

| Capability | Status | Notes |
|-----------|--------|-------|
| Programmatic invocation | **Excellent** | `AIAgent` designed for it |
| Streaming events | **Excellent** | 6 callback hooks |
| Session persistence | **Excellent** | SQLite with WAL (concurrent reads) |
| Tool restriction | **Excellent** | `enabled_toolsets` / `disabled_toolsets` |
| Interrupt/cancel | **Good** | Thread-safe `interrupt()` method |
| Subagent control | **Good** | Shared iteration budget, recursive interrupt |
| Multiple instances | **Good** | Works with per-instance HERMES_HOME |
| State querying | **Good** | Direct SQLite access while running |
| Plugin extensibility | **Good** | Register custom tools via plugin API |

### What Needs Work for Full Orchestration

| Gap | Severity | Workaround |
|-----|----------|-----------|
| Global interrupt signal | Medium | Isolate via separate processes or HERMES_HOME |
| No WebSocket streaming | Medium | Bridge callbacks → WebSocket in wrapper |
| No pause/resume mid-turn | Medium | Only interrupt (kills current turn) |
| No tool call preview/approval API | Medium | Use `clarify_callback` for approval gates |
| No built-in rate limiting | Low | Implement in orchestrator layer |
| Filesystem coupling | Low | Override via `HERMES_HOME` env var |
| Sync-first API | Low | `ThreadPoolExecutor` wrapping |

### Multi-Agent Swarm Architecture

For controlling agent swarms:

```
Orchestration Layer (your software)
├── Agent Pool Manager
│   ├── AIAgent instance 1 (session_id=task-001, HERMES_HOME=/data/agent1)
│   ├── AIAgent instance 2 (session_id=task-002, HERMES_HOME=/data/agent2)
│   └── AIAgent instance N ...
├── Event Bus (consuming callbacks from all agents)
│   ├── stream_delta_callback → WebSocket relay
│   ├── tool_progress_callback → monitoring dashboard
│   └── step_callback → progress tracking
├── Session Store (shared or per-agent SQLite)
├── Budget Controller (IterationBudget per task group)
└── Result Aggregator (collect final_response from all agents)
```

**Key insight:** Each AIAgent already supports parent-child delegation with shared budgets. Your orchestration layer becomes the "super-parent" that creates top-level agents, each of which can spawn subagents internally.

---

## 8. Recommendations

### For Our Fork: What to Cherry-Pick

**Immediate (bug fixes):**
1. PR #2554 - Compression ratio scaling (fixes data loss)
2. PR #2587 - Fallback base_url fix (7 lines, critical)
3. PR #2524 - Telegram streaming crash fix
4. PR #2527 - Session expiry re-flush prevention

**Short-term (features for our use case):**
1. PR #2578 - Multi-tier fallback chain (resilience)
2. PR #2570 - Background delegation (async subagents)
3. PR #2572 - SearXNG search (self-hosted, no API keys)
4. Fork: skeletor-js WebAPI (REST API for external control)

**Medium-term (if building orchestration layer):**
1. Fork: brezgis multi-agent team system (supervisor, planner, registry)
2. PR #2560 - Architect mode + repo map + cost tracking (cherry-pick individual features)
3. Fork: nelohenriq rate limiter + token stats

**For external integration:**
1. Implement WebSocket bridge over AIAgent callbacks
2. Add tool call preview/approval API for orchestrator control
3. Build agent pool manager with per-instance HERMES_HOME isolation
4. Create event bus consuming all agent callbacks for unified monitoring

### What NOT to Merge
- PR #2568 (kitchen sink, 17 unrelated commits)
- PR #2551 (Windows overhaul - unless Windows support needed, too invasive)
- Fork: tradewife Apollo (branding changes, not architectural)

---

*Report generated by analyzing NousResearch/hermes-agent upstream activity, 150+ forks, and full codebase architecture review.*

---

## 9. PR Status Refresh (2026-04-16)

Status of every PR referenced in this report, checked against `NousResearch/hermes-agent` at HEAD `1ccd0637`. Upstream uses a **salvage workflow** (maintainer cherry-picks/rewrites on internal branches), so "closed" rarely means "rejected" — the idea may have landed under a different commit.

### From §2 (PR recommendations)

| PR | Title | Old tier | Current state |
|---|---|---|---|
| #2554 | Compression ratio scaling | Tier 1 | ✅ **MERGED** |
| #2587 | Fallback `base_url`/`api_key_env` | Tier 1 | 🟢 open |
| #2524 | Telegram polling isolation | Tier 1 | 🟢 open |
| #2558 | SimpleX Chat gateway | Tier 2 | 🟢 open |
| #2570 | Background delegation | Tier 2 | 🟢 open |
| #2572 | SearXNG search | Tier 2 | 🟢 open |
| #2531 | /stop bypasses replay | Tier 3 | 🟢 open |
| #2529 | Collapse only large pastes | Tier 3 | 🟢 open |
| #2535 | Plugin CLI + docs | Tier 3 | 🟢 open |
| #2580 | Custom providers in /model | Tier 3 | 🟢 open |
| #2593 | /resume CLI handler (thorough) | Duplicate A | 🟢 open |
| #2577 | Plugin toolset (gateway side) | Duplicate | 🟢 open |
| #2560 | State machine + 6 mega features | Tier 2 | 🔴 closed (mega PR, likely superseded by maintainer work) |
| #2578 | Multi-tier fallback chain | Tier 2 | 🔴 closed |
| #2551 | Windows overhaul | Tier 2 | 🔴 closed |
| #2548 | Ctrl+Backspace word delete | Tier 2 | 🔴 closed |
| #2576 | Tool deselection persist | Tier 3 | 🔴 closed |
| #2575 | Ignore Discord system msgs | Tier 3 | 🔴 closed |
| #2527 | Remove expired sessions | Tier 3 | 🔴 closed |
| #2525 | Slack formatting + thread | Tier 3 | 🔴 closed |
| #2538 | Suppress 'event loop closed' | Tier 3 | 🔴 closed |
| #2571 | Custom→openrouter remap (A) | Duplicate A | 🔴 closed |
| #2564 | Custom→openrouter remap (B) | Duplicate B | 🔴 closed |
| #2592 | /resume CLI handler (terse) | Duplicate B | 🔴 closed |
| #2588 | Plugin toolset (CLI side) | Duplicate | 🔴 closed |
| #2568 | Kitchen-sink | Skip | 🔴 closed (expected) |
| #2589 | AGENTS.md modification | Skip | 🔴 closed (expected) |

**Summary:** 1 merged, 11 still open, 15 closed without direct merge (several likely salvaged — verify in `git log` before assuming rejected).

### Not checked in this refresh
- Issue numbers in §3 (#2562, #2565, #2574, #2153, #2128, #2416, #2553, #2046, #2045, #2293) — these are issues, not PRs, and were not re-queried.
- Forks in §4 — commit counts and "N commits ahead" figures have almost certainly drifted after a 1467-commit upstream bump.
- Merge-pattern observations in §5 — qualitative claims about maintainer behavior; likely still directional but not re-sampled.

### What "fresh research" would look like
A full re-audit would: (a) fetch the *current* top-50 open PRs and re-tier; (b) re-check top forks via `gh` and count divergence from new HEAD; (c) scan issues opened since 2026-03-23 for new critical bugs. Ask explicitly if you want this — it's roughly an hour of `gh` + web work.
