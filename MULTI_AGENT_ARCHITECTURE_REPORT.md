# Hermes-Agent: Multi-Agent Architecture & Agent Loop

**Date:** 2026-04-16 (refreshed from 2026-03-30)
**Codebase:** hermes-agent (Python 3.11+) @ upstream HEAD `1ccd0637`
**API Protocol:** OpenAI ChatCompletion spec (works with vLLM, SGLang, OpenRouter, Anthropic, etc.)

> **Refresh note (2026-04-16):** Fork fast-forwarded 1467 commits from `NousResearch/hermes-agent`. Verified all structural facts against current HEAD and patched file:line references, file sizes, and counts that drifted. Core architecture (agent loop, delegation model, constants, tool dispatch) is unchanged. See [§7 Drift Log](#7-drift-log-2026-04-16) for a diff.

---

## Table of Contents

1. [Agent Loop (Single Agent)](#1-agent-loop-single-agent)
2. [Tool Execution Pipeline](#2-tool-execution-pipeline)
3. [Multi-Agent Mode (Delegation)](#3-multi-agent-mode-delegation)
4. [Two Agent Loop Implementations](#4-two-agent-loop-implementations)
5. [State Management](#5-state-management)
6. [End-to-End Architecture Diagram](#6-end-to-end-architecture-diagram)
7. [Drift Log (2026-04-16)](#7-drift-log-2026-04-16)

---

## 1. Agent Loop (Single Agent)

The core loop lives in `AIAgent.run_conversation()` at `run_agent.py:8169`. It is **synchronous** and follows this cycle:

```
┌─────────────────────────────────────────────────────────┐
│                   run_conversation()                     │
│                                                         │
│  1. INIT                                                │
│     • Reset retry counters, iteration budget            │
│     • Copy conversation_history                         │
│     • Hydrate todo store from history (gateway mode)    │
│     • Preflight context compression if over threshold   │
│     • Fire pre_llm_call plugin hook                     │
│                                                         │
│  2. MAIN LOOP                                           │
│     while api_call_count < max_iterations               │
│       AND iteration_budget.remaining > 0:               │
│                                                         │
│     ┌──────────────────────────────────────────┐        │
│     │  a) CHECK INTERRUPT                      │        │
│     │     if _interrupt_requested → break      │        │
│     │                                          │        │
│     │  b) CONSUME BUDGET                       │        │
│     │     iteration_budget.consume()           │        │
│     │                                          │        │
│     │  c) PREPARE API MESSAGES                 │        │
│     │     • Inject Honcho turn context         │        │
│     │     • Copy reasoning → reasoning_content │        │
│     │     • Strip internal fields              │        │
│     │     • Apply prompt caching (Anthropic)   │        │
│     │     • Inject budget pressure warnings    │        │
│     │                                          │        │
│     │  d) LLM API CALL                         │        │
│     │     openai.chat.completions.create(      │        │
│     │       messages, tools, temperature,      │        │
│     │       max_tokens, extra_body             │        │
│     │     )                                    │        │
│     │                                          │        │
│     │  e) PARSE RESPONSE                       │        │
│     │     • Extract assistant content          │        │
│     │     • Extract reasoning/thinking blocks  │        │
│     │     • Parse tool_calls array             │        │
│     │     • Validate tool names & JSON args    │        │
│     │     • Detect truncation (finish=length)  │        │
│     │                                          │        │
│     │  f) TOOL EXECUTION (if tool_calls)       │        │
│     │     _execute_tool_calls()                │        │
│     │     ├─ If parallelizable → ThreadPool(8) │        │
│     │     └─ Else → sequential one-by-one      │        │
│     │     Append tool results to messages       │        │
│     │                                          │        │
│     │  g) CONTINUATION DECISION                │        │
│     │     • tool_calls present → continue loop │        │
│     │     • no tool_calls → final_response     │        │
│     │     • truncation → retry with prefix     │        │
│     │     • context overflow → compress & retry│        │
│     └──────────────────────────────────────────┘        │
│                                                         │
│  3. POST-LOOP                                           │
│     • Fire post_llm_call plugin hook                    │
│     • Persist to session DB                             │
│     • Skill nudge check                                 │
│     • Memory flush                                      │
│     • Return result dict                                │
└─────────────────────────────────────────────────────────┘
```

### Return Value

```python
{
    "final_response": str,      # Text answer to the user
    "messages": List[Dict],     # Full conversation history
    "api_calls": int,           # Number of LLM calls made
    "completed": bool,          # Natural completion
    "interrupted": bool,        # User/parent interrupted
    "partial": bool,            # Stopped early (budget exhausted)
    "error": str,               # Error message if failed
}
```

### Key Loop Features

- **Interrupt handling:** Checks `_interrupt_requested` at the top of each iteration; propagates to children.
- **Iteration budgeting:** `IterationBudget` object gates each turn via `.consume()`; separate from `max_iterations` counter.
- **Context compression:** Auto-summarizes middle turns when token estimate exceeds 50% of model context window. Up to 3 compression passes per preflight check.
- **Prompt caching:** Anthropic cache breakpoints applied to system prompt and early messages to reduce cost on repeated calls.
- **Message validation:** Strips surrogate characters, ensures role alternation, removes internal fields before API calls.
- **Plugin hooks:** `pre_llm_call` and `post_llm_call` hooks allow external plugins to inject context or observe results.

---

## 2. Tool Execution Pipeline

Located at `run_agent.py:7235`.

```
_execute_tool_calls(assistant_message, messages)
    │
    ├─ Safety analysis: can tools run concurrently?
    │   • No clarify tool (interactive, must be sequential)
    │   • All read-only OR non-overlapping file targets
    │   • No destructive commands (rm, mv, git reset)
    │
    ├─→ YES: _execute_tool_calls_concurrent()     [ThreadPoolExecutor, 8 workers]
    └─→ NO:  _execute_tool_calls_sequential()     [one-by-one on main thread]
         │
         └─ For each tool_call:
              _invoke_tool(name, args, task_id)
              │
              ├─ "todo"           → local TodoStore (in-memory, per-agent)
              ├─ "memory"         → MemoryStore (MEMORY.md on disk)
              ├─ "session_search" → SQLite FTS5 query on session DB
              ├─ "clarify"        → user interaction callback
              ├─ "delegate_task"  → spawn subagent(s) ← MULTI-AGENT ENTRY POINT
              └─ <all other tools> → registry.dispatch()
                   (model_tools.handle_function_call → tools/registry.py)
```

### Tool Registry Architecture

- Central registry in `tools/registry.py` collects all tool handlers.
- Each tool file (50+ in `tools/`) calls `registry.register()` at import time.
- `model_tools.py` imports all tools, populates the registry, and exposes `handle_function_call()`.
- Supports dynamic registration for MCP tools at runtime.

### Tool Result Handling

```python
for tool_call in assistant_message.tool_calls:
    result = _invoke_tool(name, args, task_id)
    messages.append({
        "role": "tool",
        "tool_call_id": tool_call.id,
        "content": result,  # JSON string
    })
```

Results are appended to the message list and fed back to the LLM on the next iteration.

---

## 3. Multi-Agent Mode (Delegation)

Defined in `tools/delegate_tool.py`. Multi-agent is not a separate mode — it is a tool (`delegate_task`) available to the parent agent. The LLM decides when to delegate based on task complexity.

### 3.1 Hierarchy & Depth Control

```
Orchestrator (CLI / Gateway)
    │
    └─ AIAgent (parent)          depth=0, budget=90
         │
         ├─ delegate_task(goal="Task A")
         │   └─ AIAgent (child)  depth=1, budget=50
         │       └─ delegate_task → BLOCKED (depth ≥ MAX_DEPTH=2)
         │
         ├─ delegate_task(goal="Task B")
         │   └─ AIAgent (child)  depth=1, budget=50
         │
         └─ delegate_task(tasks=[A, B, C])   ← batch (parallel) mode
             ├─ AIAgent (child 0)  ┐
             ├─ AIAgent (child 1)  ├─ ThreadPoolExecutor(max_workers=3)
             └─ AIAgent (child 2)  ┘
```

- Maximum depth is 2 (parent → child → grandchild rejected).
- Each child gets its own iteration budget (default 50, configurable).
- Total iterations across parent + children can exceed the parent's `max_iterations`.

### 3.2 Child Agent Construction

`_build_child_agent()` at `tools/delegate_tool.py:238`:

```
Parent AIAgent
    │
    ├─ Credentials:    inherit parent (or override via delegation config)
    ├─ Toolsets:       intersect(requested, parent's) − blocked_tools
    ├─ System prompt:  focused goal + context (NO parent history)
    ├─ Budget:         fresh IterationBudget(50) (configurable)
    ├─ Flags:          quiet_mode=True, skip_context_files=True, skip_memory=True
    ├─ Callbacks:      tool_progress → relayed to parent's display
    ├─ Session DB:     shared with parent (for session_search)
    └─ Depth:          parent._delegate_depth + 1
```

### 3.3 Blocked Tools for Children

Children are prohibited from using these tools to prevent side effects and recursive delegation:

```python
DELEGATE_BLOCKED_TOOLS = frozenset([
    "delegate_task",   # no recursive delegation
    "clarify",         # no user interaction
    "memory",          # no writes to shared MEMORY.md
    "send_message",    # no cross-platform side effects
    "execute_code",    # children should reason step-by-step
])
```

The corresponding toolset names are also stripped:

```python
blocked_toolset_names = {"delegation", "clarify", "memory", "code_execution"}
```

### 3.4 Delegation Modes

**Single Task:**
```python
delegate_task(
    goal="Write a Python function to parse CSV files",
    context="Project uses pandas, files are in /data/",
    toolsets=["terminal", "file"],
    max_iterations=50,
)
```

**Batch (Parallel) Tasks:**
```python
delegate_task(
    tasks=[
        {"goal": "Research API docs",  "context": "...", "toolsets": ["web"]},
        {"goal": "Write unit tests",   "context": "...", "toolsets": ["terminal", "file"]},
        {"goal": "Update README",      "context": "...", "toolsets": ["file"]},
    ]
)
```

### 3.5 Communication Pattern

```
Parent                             Child
  │                                  │
  │── goal + context ──────────────→ │  (via ephemeral_system_prompt)
  │                                  │
  │   [child runs its own            │
  │    full agent loop with          │
  │    own tools, own budget,        │
  │    own conversation history]     │
  │                                  │
  │← tool_progress callbacks ────── │  (per-tool: name + preview string)
  │← "_thinking" callbacks ──────── │  (reasoning text, display only)
  │                                  │
  │←── structured result ──────────  │  (summary + metadata)
  │                                  │
  │   [result becomes tool_call      │
  │    result in parent's            │
  │    messages list]                │
```

Key properties:
- **No shared conversation history** — child starts with a fresh conversation containing only the goal+context as its system prompt.
- **One-way communication** — parent sends goal, child returns result; there is no interactive back-and-forth.
- **Parent sees summary only** — the child's intermediate tool calls and reasoning are NOT included in the parent's messages.
- **Progress is observable** — parent can display child's real-time tool usage via progress callbacks.

### 3.6 Batch Execution Flow

```
1. Build all children on main thread (thread-safe construction)
2. Save parent tool names (children mutate global registry during init)
3. ThreadPoolExecutor(max_workers=3).submit(_run_single_child, ...)
4. as_completed() → collect results in order
5. Restore parent tool names from saved copy
6. Unregister children from parent._active_children
7. Return aggregated results to parent as tool call result
```

### 3.7 Result Structure

Each child returns:

```python
{
    "task_index": 0,
    "status": "completed",           # or "failed", "interrupted"
    "summary": "...",                 # Child's final_response text
    "api_calls": 15,
    "duration_seconds": 23.4,
    "model": "anthropic/claude-opus-4.6",
    "exit_reason": "completed",       # or "max_iterations", "interrupted"
    "tokens": {"input": 5000, "output": 2000},
    "tool_trace": [
        {"tool": "read_file",  "args_bytes": 50,  "result_bytes": 200},
        {"tool": "terminal",   "args_bytes": 100, "result_bytes": 500, "status": "error"},
    ],
}
```

Batch mode wraps these in:
```python
{
    "results": [<child_result>, ...],
    "total_duration_seconds": 45.2,
}
```

### 3.8 Interrupt Propagation

```
User presses Ctrl+C (or parent sends interrupt)
    │
    └─ parent.request_interrupt("User pressed Ctrl+C")
         │
         ├─ self._interrupt_requested = True
         │
         └─ with self._active_children_lock:
              for child in self._active_children:
                   child.request_interrupt(message)
                       └─ child._interrupt_requested = True
                            └─ breaks out of child's agent loop
```

### 3.9 Credential Routing

Children can use a different provider/model than the parent, configured via `~/.hermes/config.yaml`:

```yaml
delegation:
  provider: "openrouter"               # Different provider for subagents
  model: "meta-llama/llama-2-70b"      # Cheaper/faster model
  max_iterations: 50                    # Per-subagent budget
  base_url: "https://..."
  api_key: "..."
```

Resolution order: `config override > parent inherit`.

### 3.10 Display Integration

**CLI mode:**
- Child tool calls are printed as tree-view lines above the parent's delegation spinner:
  ```
   ├─ 📁 read_file  "src/main.py"
   ├─ 💭 "Analyzing the function structure..."
   ├─ 🔧 terminal  "python -m pytest"
  ```

**Gateway mode:**
- Tool names are batched (batch size = 5) and flushed to the parent's progress callback.
- Thinking events are suppressed (too noisy for chat platforms).

---

## 4. Two Agent Loop Implementations

The codebase contains two implementations of the agent loop pattern:

| Aspect | `AIAgent.run_conversation()` | `HermesAgentLoop.run()` |
|---|---|---|
| **File** | `run_agent.py:8169` | `environments/agent_loop.py:175` |
| **Sync/Async** | Synchronous | Async (`async def run()`) |
| **Purpose** | Production (CLI, Gateway, Delegation) | RL training environments |
| **State** | Full (session DB, memory, Honcho, skills, plugins) | Minimal (messages + tool dispatch only) |
| **Context mgmt** | Compression, caching, budget warnings | None (fixed `max_turns`) |
| **Tool dispatch** | Same: `handle_function_call()` via registry | Same: `handle_function_call()` via registry |
| **Tool threading** | `ThreadPoolExecutor(8)` for concurrent tool calls | `ThreadPoolExecutor(128)` for RL parallelism |
| **TodoStore** | Persistent across turns (CLI), hydrated from history (gateway) | Ephemeral per loop run |

Both follow the identical core pattern:

```
LLM call → parse tool_calls → execute tools → append results → repeat
```

The `HermesAgentLoop` is a stripped-down version designed for high-throughput RL training where hundreds of agent instances run concurrently against training environments.

---

## 5. State Management

```
AIAgent instance
 │
 ├─ Per-session (persists across turns in CLI mode):
 │   ├─ session_id              — unique identifier
 │   ├─ session_db              — SQLite store (conversations, FTS5 search)
 │   ├─ _cached_system_prompt   — built once, reused within session
 │   ├─ _memory_store           — in-memory MEMORY.md representation
 │   ├─ _todo_store             — in-memory todo list
 │   ├─ _honcho                 — cross-session user modeling (Honcho)
 │   ├─ session_prompt_tokens   — cumulative input token count
 │   ├─ session_completion_tokens — cumulative output token count
 │   ├─ session_cache_read_tokens — Anthropic prompt cache hits
 │   └─ _user_turn_count, _turns_since_memory — nudge timing
 │
 ├─ Per-turn (reset each run_conversation() call):
 │   ├─ iteration_budget        — fresh IterationBudget(max_iterations)
 │   ├─ _invalid_tool_retries   — retry counter for bad tool names
 │   ├─ _invalid_json_retries   — retry counter for malformed JSON args
 │   ├─ _empty_content_retries  — retry counter for empty responses
 │   ├─ _interrupt_requested    — user/parent stop flag
 │   └─ _stream_callback        — streaming delta handler
 │
 └─ Multi-agent (for delegation):
     ├─ _delegate_depth         — 0=root, 1=child, 2=blocked
     ├─ _active_children        — list of running child AIAgent instances
     └─ _active_children_lock   — threading.Lock for thread-safe access
```

---

## 6. End-to-End Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                       ENTRY POINTS                           │
│  CLI (cli.py)  │  Gateway (gateway/run.py)  │  ACP Adapter  │
└───────┬────────┴──────────┬─────────────────┴───────┬────────┘
        │                   │                         │
        └───────────────────┼─────────────────────────┘
                            ▼
              ┌──────────────────────────┐
              │      AIAgent.__init__     │
              │  • Load config & creds   │
              │  • Resolve toolsets      │
              │  • Build tool schemas    │
              │  • Init session DB       │
              │  • Load memory & skills  │
              └────────────┬─────────────┘
                           ▼
              ┌──────────────────────────┐
              │   run_conversation()      │◄──── user message
              │                          │
              │   ┌────────────────────┐ │
              │   │   AGENT LOOP       │ │
              │   │                    │ │
              │   │  LLM API call ─────┼─┼──► OpenAI-compat API
              │   │       │            │ │     (OpenRouter / vLLM /
              │   │       │            │ │      Anthropic / SGLang)
              │   │  parse tool_calls  │ │
              │   │       │            │ │
              │   │  ┌────▼────┐       │ │
              │   │  │ DISPATCH │       │ │
              │   │  └────┬────┘       │ │
              │   │       │            │ │
              │   │  ┌────▼──────────┐ │ │
              │   │  │  50+ TOOLS    │ │ │    ┌─────────────────────┐
              │   │  │  • terminal   │ │ │    │   CHILD AGENTS      │
              │   │  │  • file ops   │ │ │    │   (delegation)      │
              │   │  │  • web/search │ │ │    │                     │
              │   │  │  • browser    │ │ │    │  Own AIAgent inst.  │
              │   │  │  • delegate ──┼─┼─┼──►│  Own agent loop     │
              │   │  │  • memory     │ │ │    │  Own iter. budget   │
              │   │  │  • MCP tools  │ │ │    │  Restricted tools   │
              │   │  │  • todo       │ │ │    │  No parent history  │
              │   │  │  • clarify    │ │ │    │                     │
              │   │  │  • skills     │ │ │    │  Returns summary ──┐│
              │   │  └──────────────┘ │ │    └─────────────────────┘│
              │   │       │            │ │                           │
              │   │  append results ◄──┼─┼───────────────────────────┘
              │   │  to messages       │ │
              │   │       │            │ │
              │   │  continue / stop   │ │
              │   └────────────────────┘ │
              │                          │
              │  POST-LOOP               │
              │  • Plugin hooks          │
              │  • Session DB persist    │
              │  • Memory/skill nudges   │
              │                          │
              │   return result dict ────┼──► caller (CLI / Gateway / parent agent)
              └──────────────────────────┘
```

---

## Key Architectural Insight

**Multi-agent is emergent, not structural.** There is no separate "multi-agent mode" or orchestrator service. The `delegate_task` tool is just one of 50+ tools available to the agent. The LLM decides when to delegate based on the task at hand. When it does, the tool handler spawns child `AIAgent` instances — each running the exact same `run_conversation()` loop — with restricted capabilities and isolated context. Results flow back as ordinary tool call results.

This makes the architecture:
- **Recursive but bounded** — depth capped at 2 via `MAX_DEPTH`
- **Self-similar** — children are full agents, not simplified workers
- **Isolated** — no shared conversation state between parent and children
- **Observable** — progress callbacks provide real-time visibility into child work
- **Configurable** — children can use different providers, models, and tool sets than the parent

---

## 7. Drift Log (2026-04-16)

Verified against upstream HEAD `1ccd0637` after a 1467-commit fast-forward from the 2026-03-30 snapshot.

### Core architecture: unchanged
- Sync `AIAgent.run_conversation()` loop
- `_execute_tool_calls()` concurrent vs sequential safety logic, 8-worker pool
- Delegation model: `delegate_task` tool, fresh child context, goal+context system prompt, no shared history
- `DELEGATE_BLOCKED_TOOLS` = `{delegate_task, clarify, memory, send_message, execute_code}` — exact match
- `blocked_toolset_names` = `{delegation, clarify, memory, code_execution}` — exact match
- `MAX_DEPTH = 2`, `DEFAULT_MAX_ITERATIONS = 50`, batch pool `max_workers=3`
- `HermesAgentLoop` async impl, `ThreadPoolExecutor(128)` for RL
- All return/result dict shapes, interrupt propagation, credential routing

### File:line references (patched in place above)
| Reference | Old | New | Δ |
|---|---|---|---|
| `AIAgent.run_conversation()` | `run_agent.py:5992` | `run_agent.py:8169` | +2,177 |
| `_execute_tool_calls()` | `run_agent.py:5221` | `run_agent.py:7235` | +2,014 |
| `_build_child_agent()` | `delegate_tool.py:150` | `tools/delegate_tool.py:238` | +88 |
| `HermesAgentLoop.run()` | `environments/agent_loop.py:167` | `environments/agent_loop.py:175` | +8 |

### Size / count drift
| Surface | 2026-03-30 | 2026-04-16 | Note |
|---|---|---|---|
| `run_agent.py` LOC | ~7,400 | 11,535 | +56% |
| `gateway/run.py` LOC | ~5,800 | 9,886 | +70% |
| `gateway/platforms/` adapters | 14 | 20 | +homeassistant, bluebubbles, feishu, dingtalk, qqbot, telegram_network |
| Toolsets | 22+ | 41 | Significant expansion |
| Core tools (`_HERMES_CORE_TOOLS`) | 40+ | 36 | Reshuffle, some moved to toolsets |
| Bundled skills (`skills/SKILL.md`) | 87 | 79 | Net −8; several skills pruned/merged |

### What was not re-audited
Upstream PR/issue/fork catalog (the companion `UPSTREAM_ANALYSIS_REPORT.md`) received only a status refresh for PRs that were already listed. A fresh fork/PR/issue scan was not performed.
