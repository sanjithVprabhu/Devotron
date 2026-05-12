Here are the biggest practical lessons that have come out of public analyses (these are the patterns people are already porting into their own agents and into OpenClaw plugins):

The Agent Loop (the heart of everything)
Robust ReAct-style loop: LLM → parse tool calls → execute → observe results → feed back into next thought. Includes retry logic, token budgeting, and “thinking mode” before acting.
Tool System + Permission Model
Every capability is a strict “Tool” module (file ops, shell execution, web browsing, sub-agent spawning, scheduling, etc.). There’s a full permission model so the agent can’t just nuke your machine. This is gold for safety in your own agents.
Memory Architecture (the “skeptical memory” trick)
Three-layer memory: short references in MEMORY.md (treated as hints only), detailed project notes pulled on-demand, and selective session history. The agent is explicitly told never to fully trust its memory — always verify against the actual filesystem/code. This prevents hallucinated actions.
Multi-Agent Coordination (“Swarms”)
The system can spawn sub-agents with their own scoped tools and permissions for parallel tasks. Planning agent → execution agents → verification agents. This is how they handle complex, long-running jobs.
Context & State Management
Smart assembly of system prompts + project context (e.g., CLAUDE.md + git status + file summaries). Context window is treated as a scarce resource.
Error Recovery & Autonomous Modes
State machines for handling failures, plus “KAIROS” daemon mode (background agent that keeps running even after you close the terminal).
Safety & Guardrails
Strict typing, plugin architecture, and explicit instructions to keep the agent inside safe bounds.


Voice input, React-powered terminal UI (for the CLI version), task management, MCP (Model Context Protocol), scheduling, and a bunch of unreleased feature flags that show where they’re heading.
These aren’t abstract ideas — they’re the exact patterns that turn a raw LLM into something that feels like a real software engineer (or personal assistant) living in your terminal or chat apps.

Quick TL;DR of the two systems


AspectOpenClaw (Open-Source)Claude Code (Leaked Proprietary)Primary FocusGeneral-purpose “Life OS” personal assistantSpecialized terminal-native coding agentDeploymentSelf-hosted Node.js gateway (local Mac/Windows/Linux/VPS)Bun-powered CLI (terminal-first)Interface20+ messaging apps (WhatsApp, Telegram, Slack, Discord, iMessage, etc.) + voice + CanvasTerminal (with React-based Ink UI)Model SupportFully model-agnostic (Claude, OpenAI, local/Ollama, etc.)Locked to Anthropic models (but leak shows model-agnostic patterns)Core StrengthBroad automation + always-on persistence across your life toolsDeep, production-grade reasoning in codebases
They are not direct competitors — they solve different problems. OpenClaw is your always-on personal butler across chat apps. Claude Code is your senior dev teammate that lives in the terminal and owns git repos.

1. Agent Loop & Orchestration

OpenClaw: Message-driven loop triggered by inbound events from any channel. Uses a Gateway WebSocket control plane + RPC-style Pi agent. Supports activation/queue/reply policies. Proactive elements via cron jobs, webhooks, and heartbeat-style checks (but lighter than Claude’s).
Claude Code: Classic ReAct-style state machine in query.ts (1,729 lines). 7 distinct “continue sites” in a while(true) loop. Streaming tool calls while the model is still thinking. Explicit thinking/review modes. The leak revealed they built a proactive KAIROS daemon (always-on background loop that asks “anything worth doing right now?” every few seconds).

Lesson for your project: Claude’s loop is more battle-hardened for long-running autonomous work. OpenClaw’s is better for multi-channel human-in-the-loop + background tasks.
2. Memory & Context Management (Biggest Architectural Gap)

OpenClaw: Uses injected prompt files (AGENTS.md, SOUL.md, TOOLS.md) + session history. Persistent across messaging sessions. Simpler persistence model optimized for always-on gateway.
Claude Code: 3-layer “skeptical” / self-healing memory (the most praised pattern from the leak):
Lightweight MEMORY.md index (always in context — just pointers, ~150 chars/line)
On-demand topic files (actual knowledge)
Raw transcripts (never loaded — only grep’d when needed)

Strict write discipline: never trust memory blindly; always verify against filesystem.
autoDream sub-agent runs nightly to consolidate, deduplicate, and fix contradictions.


Lesson for your project: Claude’s memory system is the gold standard for preventing context rot in long-lived agents. OpenClaw is more straightforward but easier to extend with plugins.
3. Tools & Extensibility

OpenClaw: “Skills” platform + ClawHub (community skill registry). Tools include browser (CDP), canvas, device nodes (camera, screen, notifications), cron, webhooks, exec. Sandboxed per-session (Docker for non-main sessions).
Claude Code: 40+ permission-gated tools (bash, file read/write/edit, grep/glob, LSP integration, git workflows). Plugin architecture + MCP (Model Context Protocol). Deep terminal/git integration.

Lesson for your project: OpenClaw wins on ecosystem (easy to add any capability via skills). Claude wins on depth for code-heavy tasks.
4. Multi-Agent Coordination

OpenClaw: Session-based routing + multi-agent via workspaces. Inter-session tools (sessions_*). Mission Control dashboard for orchestration.
Claude Code: Full coordinator + worker swarm pattern. One “manager” Claude can spawn sub-agents in isolated git worktrees (fork/teammate/worktree models). Forking is extremely cheap due to prompt caching. 25+ event hook system.

Lesson for your project: Claude’s swarm pattern (especially fork + isolated worktrees) is directly portable and production-grade. OpenClaw’s is more chat-oriented.
5. Security & Permissions

OpenClaw: Explicit sandboxing, pairing approval for DMs, allow/denylist tools, TCC permissions on macOS. Gateway is the trust boundary.
Claude Code: “Critic” pattern (model self-checks safety), dual bash parsers for edge-case attacks, anti-distillation decoys, undercover mode, strict permission model. KAIROS requires higher trust model.

Lesson for your project: Both are thoughtful, but Claude’s critic + verification agent patterns are advanced techniques you can steal for safer agents.
6. Autonomy & Unreleased Features (Leak Gold)
Claude Code had KAIROS (full daemon mode), autoDream, ULTRAPLAN (offload planning to remote heavy model), and a Tamagotchi pet system (BUDDY) all built and gated behind feature flags. OpenClaw already ships persistent always-on behavior natively via its gateway.

We're starting exactly where you asked: from the Claude Code leak (the March 31, 2026 npm source-map accident that exposed ~512k lines of clean TypeScript across ~1,900 files). This is the production-grade agent harness — the orchestration layer that turns an LLM into something reliably autonomous. Not the model weights, but the real engineering moat: state machines, memory discipline, tool safety, multi-agent coordination, and proactive daemons.
The goal of this lesson plan is deep understanding + Rust implementation. By the end, you'll be able to rebuild the core patterns (and eventually the full harness) in Rust — using Tokio for async, traits/enums for tools, channels for mailboxes, etc. This directly advances your project: you'll own the architecture, not just use someone else's framework.
I synthesized this from the best public deep-dive analyses of the leaked source (QueryEngine.ts, query.ts, tool registry, coordinatorMode.ts, memory patterns, KAIROS scaffolding, etc.). No proprietary code is copied here — we're studying patterns for clean-room Rust work (inspired by existing Rust rewrites like instructkr/claw-code).

Key leak insights:

Not a simple ReAct wrapper. It's a self-healing state machine with centralized orchestration (QueryEngine.ts ~46k lines handles everything LLM-related).
44+ compile-time feature flags (KAIROS, ULTRAPLAN, COORDINATOR_MODE, etc.).
Built on Bun + React/Ink (terminal UI) — but the core is language-agnostic patterns.
Exercises:
Read 2–3 top leak analyses. Diagram the high-level flow (user input → queryLoop → tools → memory → output).
Clone a clean-room Rust starter (e.g., instructkr/claw-code Rust branch) and run the minimal version.
Rust translation: Use Cargo features for flags (#[cfg(feature = "kairos")]).
Deliverable: One-page architecture diagram + list of the 7 "continue sites" in the main loop.

The Core Agent Loop – State Machine & 7 Continue Sites (Week 1)
Objectives: Master the heart of orchestration.
Key leak insights:

Lives in query.ts (~1,729 lines): async generator queryLoop() with while(true).
Exactly 7 explicit continue sites — yield points for pausing, error recovery, compaction, permission checks, etc. This makes the loop observable, testable, and resumable.
Streaming tool calls while the model is still thinking. Self-healing on failures.
Why it matters: Turns probabilistic LLM output into deterministic, long-running agency.
Exercises:
Trace the loop flow in analyses.
Implement a minimal Rust version: async fn agent_loop() using tokio::select! + enum-based states. Add 7 yield points via a state machine (use enum ContinueSite).
Rust translation: Use Tokio for async streams; mpsc channels for control flow; enum for state (far cleaner than TS generators).
Deliverable: Working Rust single-turn agent loop that parses tool calls and resumes.

Phase 2: Tool System & Permission Model 
Objectives: Build safe, extensible capabilities.
Key leak insights:

~40+ tools in a plugin-style registry (Tool.ts ~29k lines). Each has Zod schemas, risk metadata (isReadOnly, isDestructive), and isolated execution.
AgentTool for spawning sub-agents. Deferred loading (tools hidden from model until ToolSearch meta-tool).
Default-deny permissions + denial tracker (graceful fallback after repeated denials).
Exercises:
Define 5–10 core tools (bash, file read/write, git).
In Rust: trait Tool + #[derive] for schemas (serde + validator crate). Implement permission checker.
Rust translation: Enums for tool kinds; traits for execution; async_trait for async tools. Sandbox with std::process or wasmtime for isolation.
Deliverable: Rust tool registry with permission gating.

Phase 3: Memory Architecture – Skeptical 3-Layer + Self-Healing
Objectives: Prevent context rot in long-lived agents.
Key leak insights:

3-layer "skeptical" memory (never trust blindly):
MEMORY.md index (always loaded — just pointers, ~150 chars/line).
On-demand topic files.
Transcripts (grep-only, never fully loaded).

autoDream (nightly consolidation via KAIROS): dedup, fix contradictions, rewrite facts.
Write discipline: verify against filesystem before trusting memory.
Exercises:
Implement index + topic loader.
Build a simple autoDream consolidator (use local LLM or rules).
Rust translation: Use sled or redb for persistent index; filesystem watchers; async grep with ripgrep bindings.
Deliverable: 3-layer memory module that survives restarts and self-heals.

Phase 4: Query Engine, Context Management & Compression 
Objectives: Handle long sessions without token explosion.
Key leak insights:

QueryEngine.ts: centralizes streaming, caching, retries, budget management.
Multi-stage compression: MicroCompact (local edits), AutoCompact (summarization with 13k-token buffer), Full Compact, circuit breakers.
Context re-injection rules (e.g., CLAUDE.md on every turn).
Exercises:
Build token budget tracker + 3 compression strategies.
Add self-healing (retry + fallback).
Rust translation: tokio streams for LLM calls; custom token counter (or tiktoken-rs); state machine for compression stages.
Deliverable: Query engine that auto-compacts and resumes.

Phase 5: Multi-Agent Coordination – Coordinator, Workers & Mailbox 
Objectives: Scale to swarms.
Key leak insights:

CoordinatorMode.ts: one "manager" spawns worker agents in isolated git worktrees.
Mailbox pattern for high-risk ops (workers queue requests; coordinator approves atomically).
Shared memory + prompt-cache forking (cheap parallelism).
Prompt-based orchestration (not heavy framework code).
Exercises:
Implement coordinator + 2 workers.
Build mailbox with channels.
Rust translation: Tokio tasks/actors; mpsc or flume for mailbox; worktree isolation via git2 crate.
Deliverable: Multi-agent swarm that parallelizes a task safely.

Phase 6: Autonomy & KAIROS Daemon 
Objectives: Build proactive, always-on agents.
Key leak insights:

KAIROS: background daemon with "tick" interval, proactive prompts ("anything worth doing?"), GitHub webhooks, autoDream.
Feature-gated but fully scaffolded.
Exercises:
Add cron-like ticker + background loop.
Integrate memory dreaming.
Rust translation: Tokio cron or tokio::time; daemonize with daemonize crate or systemd.
Deliverable: Rust agent that runs 24/7 and acts autonomously.

Phase 7: Safety, Error Recovery, Telemetry & Polish 
Objectives: Make it production-grade.
Key leak insights:

Critic pattern, frustration regexes, dual bash parsers, undercover mode.
Telemetry on "continue" frequency, denial counts.
Error recovery baked into every continue site.
Exercises:
Add critic self-check + telemetry dashboard.
Full error paths.
Rust translation: Tracing crate; regex for signals; circuit breakers (backon crate).
Deliverable: Safe, observable Rust harness.

Phase 8: Capstone – Full Rust Agent + Extensions (Weeks 9–12)

Integrate everything into a CLI (clap + ratatui or ink-like).
Add OpenClaw-style skills later if you want multi-channel.
Benchmark vs. original patterns.
Optional: Port BUDDY pet or ULTRAPLAN for fun.

The Parts of a Full Agentic Framework
A complete agentic framework is not just “LLM + ReAct loop.” It’s 9 tightly integrated subsystems. Here they are in the exact order they appear in the Claude Code architecture (and the order we’ll attack them one at a time in your Rust implementation):

#SubsystemWhat it does (Claude Code leak style)Why it’s critical for reliabilityRust translation hint (what we’ll build)1Input / Trigger LayerAccepts commands, messages, webhooks, or proactive “ticks” from daemonStarts the whole machine cleanlyTokio channels + CLI + cron triggers2Context AssemblyGathers CLAUDE.md, git status, MEMORY.md index, file summaries, etc. into one promptPrevents the model from flying blindFilesystem watchers + prompt templating3Query Engine / Core LoopThe while(true) state machine with 7 explicit “continue sites”Turns probabilistic LLM output into deterministic, resumable executionEnum-based state machine + tokio::select!4Tool Registry & Execution40+ permission-gated tools (bash, fs, git, spawn sub-agent, etc.)Gives the agent real superpowers without letting it nuke your machineTrait Tool + sandboxed executors5Memory & Self-Healing3-layer skeptical memory + autoDream consolidatorStops context rot over long sessionsredb/sled index + nightly background task6Multi-Agent CoordinatorSpawns/manages worker swarms in isolated worktrees + mailbox patternScales to complex tasks without chaosTokio actors + mpsc mailboxes7Safety & Critic LayerSelf-check prompts, permission denials, frustration regexes, dual parsersProduction safety (the part most open-source agents skip)Trait Critic + circuit breakers8Autonomy / KAIROS DaemonBackground always-on loop that asks “anything worth doing right now?”Makes the agent proactive instead of only reactiveTokio runtime daemon + tick scheduler9Observability & CompactionTelemetry, token budgeting, micro/auto/full compaction, error recoveryKeeps the agent alive forever without exploding context or costtracing crate + compression state machine

One Full Agent Infra Cycle (The Conveyor Belt)
This is the exact flow that runs in Claude Code’s query.ts (the 1,729-line heart of the leak). It is not a simple ReAct loop — it has 7 built-in “pause-and-check” points so the system can self-heal, get permission, compact memory, or hand off to a sub-agent at any moment.
Here is the complete cycle, step by step:

Trigger arrives (user command, webhook, or KAIROS tick)
→ Input layer normalizes it.
Context is assembled (2–3 seconds)
Load CLAUDE.md
Read MEMORY.md index (lightweight only)
Git status + relevant file summaries
Last 3 turns of history (compressed)
→ Prompt is built and sent to the LLM.

LLM responds (streaming)
Model thinks out loud
Decides: final answer OR tool call(s) OR “I need more context”

Enter the 7 Continue Sites (the magic that makes it production-grade)
The loop hits one of these exact checkpoints after every LLM turn or tool result:
Site 1: Permission Gate – Is this tool allowed? (default deny + denial counter)
Site 2: Tool Execution – Run the tool in sandbox, capture output
Site 3: Memory Verification – “Does the filesystem still match what MEMORY.md says?” (skeptical check)
Site 4: Critic Safety Review – Run the self-critic prompt; if risky, block or ask user
Site 5: Compaction Check – Are we burning too many tokens? Run micro/auto/full compact
Site 6: Swarm Handoff – Should I spawn a worker agent? (mailbox pattern)
Site 7: Output & Loop Decision – Stream result to user OR loop back to step 2

Loop back (while true)
Unless the task is complete or the user says stop, the cycle repeats instantly. The agent can run for hours/days because of the 7 checkpoints.
Background KAIROS tick (every 30–300 seconds, independent of the main loop)
Checks for new emails, git changes, calendar, etc.
Runs autoDream if night-time
Decides “is there proactive work I should start?”


That is one full infra cycle. It repeats forever. This is why Claude Code feels alive compared to simple chatbots.

What is a Daemon? (General Computing Definition)
A daemon (pronounced "DEE-muhn") is a background process that runs continuously on a computer, independent of any logged-in user or interactive terminal.

It starts at boot (or when launched) and stays alive, usually "headless" (no GUI or direct console I/O).
It waits for events, timers, or requests, then performs work silently.
Classic examples: sshd (handles SSH logins), systemd services, print spoolers, cron, Docker daemon, web servers in production.

Key traits:

Detached from the controlling terminal (so it survives logout).
Long-running — often forever, with proper signal handling (SIGTERM for graceful shutdown).
Event-driven or periodic — wakes up on triggers (network request, timer tick, file change) or polls at intervals.
On Unix/Linux/macOS: traditionally ends with "d" (e.g., httpd).
On Windows: similar concept is a Service.

Daemons make systems feel "alive" because they work while you're away.
Daemon in the Context of Agentic Frameworks (Claude Code Leak)
In agentic AI systems like the leaked Claude Code harness, a daemon turns a reactive tool-calling loop into a proactive, ambient agent.
Specifically:

KAIROS (the big reveal from the leak) is an unreleased autonomous daemon mode.
It runs in the background as a persistent process.
Every few seconds/minutes it performs a "tick":
Checks for changes (new git commits, files, external events via webhooks).
Asks the LLM: “Is there anything worth doing right now?” (proactive planning).
Runs autoDream — a memory consolidation task that merges observations, removes contradictions, deduplicates facts, and rewrites vague insights into actionable knowledge.
Prepares clean context so when you return, the agent resumes with fresh, non-rotten memory.

It enables ambient intelligence: the agent works while you sleep, during idle time, or across sessions — solving the "session dies when you close the terminal" problem.
Named after the Greek god of "the right moment" — it acts at the opportune time.


This is why the leak felt revolutionary: most open-source agents (including basic AutoGen or simple ReAct loops) are session-bound and reactive. KAIROS-style daemons make them persistent and proactive — the difference between a chatbot that only answers when pinged vs. a true digital coworker that thinks ahead.

How Daemons Work in Practice (The Full Cycle)
A typical daemon lifecycle:

Start — fork/detach from terminal (or use systemd/supervisor), set up logging to files.
Initialize — load config, open connections, set up memory/index.
Main loop — while true with sleep/timers:
Wait for events (Tokio channels, watchers).
On tick: run proactive logic (e.g., check state → LLM call → memory dream → act or sleep).

Graceful shutdown — handle SIGINT/SIGTERM, persist state, clean up.
Supervision — run under systemd, supervisord, or as a Cargo binary with --daemon flag.

Rust + Tokio is excellent for daemons because:

Tokio provides async runtime for concurrent ticks, watchers, and LLM calls without blocking.
You can use crates like:
daemonize or manual fork (careful with Tokio runtime — daemonize before starting Tokio).
tokio::time for periodic ticks.
notify for filesystem watching.
tracing + file loggers.
systemd integration via listenfd for production deployment.

Core Concept Recap (The 9 Subsystems of a Full Agentic Framework)
A production agentic framework (like the leaked Claude Code harness) is these 9 integrated parts working as one factory:

Input / Trigger Layer
Context Assembly
Core Query Loop (with 7 explicit “continue sites”) ← We focus here today
Tool Registry & Execution
Memory & Self-Healing (skeptical 3-layer + autoDream)
Multi-Agent Coordinator
Safety & Critic Layer
Autonomy / KAIROS Daemon
Observability & Compaction

The Core Query Loop (in query.ts from the leak) is the main “while(true)” engine that ties everything together. It is an async generator / state machine that makes the agent reliable and resumable.
The 7 Continue Sites (The Magic That Makes It Production-Grade)
These are the 7 explicit pause-and-check points inside the loop (referenced directly in the leaked source). They prevent the agent from running off a cliff, allow self-healing, and make long-running tasks possible.

Permission Gate — Is this action allowed?
Tool Execution — Run the tool safely and capture output.
Memory Verification — Does the real filesystem still match what memory claims? (skeptical check)
Critic Safety Review — Run a self-check: is this risky?
Compaction Check — Are we burning too many tokens? Summarize if needed.
Swarm Handoff — Should I spawn a sub-agent for this?
Output & Loop Decision — Show result to user or continue the loop?

After any site, the loop can: continue, pause, recover, or stop.
Full Agent Infra Lifecycle — Explained Through a Concrete Example
Example Task:
You are a Rust developer working on a personal project. You open the terminal and type:
"Refactor the memory module in my Rust agent to use redb instead of sled for better performance. Make it persistent across daemon restarts and add a simple auto-compaction for old entries."
Now watch the full cycle from trigger to completion (and how KAIROS keeps it alive afterward). This mirrors the leaked Claude Code behavior.
Step 1: Input / Trigger Layer

The agent receives your command (CLI input).
Normalizes it (parse flags, detect intent).
In Rust: We’ll use clap for CLI + Tokio channels for daemon/webhook triggers.

Step 2: Context Assembly

The system quietly gathers:
Your project’s AGENT.md or CLAUDE.md (your preferred style, rules).
Lightweight MEMORY.md index (just hints: “memory module uses sled, performance bottleneck noted on 2026-04-05”).
Git status (current branch, changed files).
Relevant file summaries (only the memory.rs file, not the whole repo).
Last few turns of conversation (compressed).

Prompt is built and sent to the LLM (Claude or whatever model you choose).

Step 3: Enter the Core Query Loop (while(true))
The LLM starts thinking and responds with a plan + tool calls.
First iteration:

LLM says: “I need to read the current memory.rs file and check dependencies.”

Continue Site 1: Permission Gate
→ “Is file read allowed?” Yes (it’s read-only). Proceed.
Continue Site 2: Tool Execution
→ Tool runs: read src/memory.rs. Output captured: “Current implementation uses sled::Db...”.
Continue Site 3: Memory Verification (Skeptical check)
→ Agent checks: “MEMORY.md says we use sled, but let me confirm on disk” → Matches. Good. (If it didn’t match, it would correct memory.)
Continue Site 4: Critic Safety Review
→ Self-critic prompt: “Is refactoring core memory risky?” → Low risk (no destructive delete). OK.
LLM continues thinking: “Plan: replace sled with redb, add persistence hooks, add compaction logic.”
Continue Site 2 again: Execute multiple tools in parallel if safe (read Cargo.toml, search for sled usages).
Continue Site 5: Compaction Check
→ Context getting long? Run micro-compact (summarize old tool results).
Continue Site 6: Swarm Handoff?
→ For bigger refactors, it might spawn a “verifier” sub-agent in an isolated worktree to test the changes.
Continue Site 7: Output & Loop Decision
→ Streams progress to your terminal (e.g., “Reading files… Planning changes… Writing new redb implementation…”).
→ Since task not finished, loop back to Step 2 (re-assemble updated context with new file changes).
Second iteration:

LLM now has the tool results.
It writes the new code using file-edit tool.
Sites 1–7 fire again (permission for write, execute the edit, verify the new file exists, critic check, etc.).

Final iteration:

LLM says: “Task complete. Here’s a summary of changes. Run cargo test to verify?”
No more tool calls → Loop exits gracefully.

After the main loop: The agent prints a clean summary and waits for your next command.
How KAIROS Daemon Keeps It Alive (Autonomy Layer)
Even after you close the terminal:

The KAIROS daemon (background process) is still running.
Every ~60 seconds it gets a <tick> prompt: “Anything worth doing right now?”
It checks: git changes, new issues, or “memory module was refactored today — should I run tests or dream about further optimizations?”
If yes → it can run cargo test quietly, update MEMORY.md index, or trigger autoDream (nightly consolidation: merge observations, remove contradictions like “sled vs redb”, rewrite facts into clean knowledge).
It writes to append-only daily logs so you see what happened when you return.
Proactive actions are capped (e.g., 15-second budget) so it never blocks you.

This is why the agent feels persistent and proactive instead of dying when the session ends.
What You Just Saw in the Example

The loop ran multiple times (iterations) until the task was done.
The 7 continue sites acted as safety nets and decision points at every step.
Memory stayed skeptical and self-healing.
If the task was huge, the coordinator could have spawned workers.
KAIROS would continue working in the background.

This full cycle is what turns a simple LLM call into reliable agency.
Your Next Hands-On Step for the Project (Rust Implementation)
Now that you’ve followed the lifecycle with a real example, we translate it to Rust.
Phase 1 Deliverable: Build a minimal Rust agent loop with the 7 continue sites as an enum.
I can give you right now:

A complete Cargo project skeleton (with Tokio, anyhow, serde).
The enum ContinueSite { PermissionGate, ToolExecution, ... }
A basic async fn run_agent_loop() that simulates the while(true) with yield points.
How to model context assembly and one fake tool call.

Your choice (tell me exactly what you want next):

“Give me the full Rust code skeleton for the 7-continue-site loop right now” — I’ll output the code you can copy-paste and run.
“Explain one continue site deeper with Rust pseudocode” (e.g., Site 3 Memory Verification).
“Let’s diagram the example flow visually in text first, then code.”
Or anything else — “I want to start with Input + Context Assembly instead.”

This is your project — we go at your pace, one piece at a time, building true ownership of the orchestration layer in Rust.

Core Concept: What is the Input / Trigger Layer?
This layer is the single, reliable entry point for all events that wake up or direct the agent. Its job is not to do reasoning or execute tools — it is to receive, validate, normalize, and route incoming signals so the rest of the system can work with clean, consistent data.
Think of it as the reception desk + bouncer + dispatcher of the agent factory:

Reception: Accepts signals from many sources.
Bouncer: Validates, authenticates, rejects junk or dangerous input.
Dispatcher: Normalizes the input into a standard internal format and decides which session/agent should handle it.

Without a solid Input Layer, the agent becomes fragile: duplicate sessions, lost context, security holes, or chaos when multiple triggers arrive at once (user message + cron tick + webhook).
Why This Layer Exists (Lessons from the Claude Code Leak + OpenClaw)
From analyses of the leaked ~512k lines (especially query.ts, context.ts, entrypoint files, and KAIROS scaffolding):

Claude Code is primarily terminal-first but designed with extensibility for other inputs.
The layer handles CLI commands, file attachments, slash commands, and background triggers.
It normalizes everything into a unified UserInput or QueryParams structure before hitting the Query Engine.
For KAIROS (the daemon), triggers include periodic <tick> prompts and external events (e.g., GitHub webhooks).

OpenClaw (your other reference) makes this even more explicit because it is multi-channel:

A long-lived Gateway (daemon process) owns all incoming connections (WhatsApp, Telegram, Slack, Discord, iMessage, WebSocket, cron, etc.).
Every message or event funnels through the Gateway first → it creates/resumes a session, validates, then hands a normalized event to the agent brain.

Key architectural principle (common to both):

One source of truth for starting work → prevents race conditions and makes the 7-continue-site loop predictable.
Separation of concerns: Input layer does no LLM calls, no tool execution, no memory writes. It only prepares data.

Detailed Components Inside the Input / Trigger Layer
Here is the full internal breakdown (synthesized from leak analyses and OpenClaw’s gateway docs):

Transport / Adapter Layer
Concrete ways input arrives:
Terminal/CLI (stdin, arguments, flags) — Claude Code style.
Messaging channels (WhatsApp, Telegram, etc.) — OpenClaw style.
WebSocket / API endpoints.
Timers / cron (for scheduled tasks).
File watchers or webhooks (e.g., new git commit, email arrival).
Background daemon ticks (KAIROS “anything worth doing?”).

Each adapter translates raw input (JSON, text, binary) into a common internal event format.

Authentication & Validation
Check API keys, tokens, or pairing (especially for messaging apps).
Schema validation (e.g., JSON Schema for structured commands).
Rate limiting or spam protection.
Reject malformed or malicious input early.

Normalization & Enrichment
Turn raw input into a standard struct, e.g.:
trigger_type: UserCommand | CronTick | Webhook | DaemonTick | Message
payload: the actual text/command
metadata: timestamp, source channel, session_id, user_id, priority
attachments: files, images, context hints

Add defaults or look up session history ID.

Session Management / Routing
Decide or create the correct session/workspace (per project, per chat thread, per user).
Route to the right agent instance (single agent vs. coordinator mode).
Handle concurrency: queue if the agent is busy, or allow parallel safe tasks.

Logging & Observability Hook
Record the raw trigger (append-only log) for debugging and KAIROS later review.
Emit telemetry event (“trigger received”).

Hand-off to Next Layer
Once clean, pass the normalized TriggerEvent to Context Assembly (Subsystem #2).

Full Lifecycle Example — Following One Trigger End-to-End
Recall the example task:
You type in the terminal:
"Refactor the memory module in my Rust agent to use redb instead of sled for better performance. Make it persistent across daemon restarts and add a simple auto-compaction for old entries."
Step-by-step through the Input / Trigger Layer only (we stop before Context Assembly):

Transport arrives
Claude Code style: Terminal reads your typed line via stdin or CLI parser (clap-like).
Or OpenClaw style: If you sent it via WhatsApp, the Gateway’s WhatsApp adapter receives the message via Baileys/grammY library.

Validation
Is the command non-empty? Yes.
Does it look like a valid agent request (not spam)? Yes.
For daemon/KAIROS: A timer fires → creates a special DaemonTick trigger with empty payload but metadata saying “proactive check”.

Normalization
Raw text → structured object:text{
  trigger_type: "UserCommand",
  payload: "Refactor the memory module...",
  metadata: {
    timestamp: "2026-04-07T22:15:00Z",
    source: "terminal",
    session_id: "project-rust-agent-123",
    priority: "high"
  },
  attachments: []   // could have pasted files here
}
If it was a slash command like /status, it gets tagged differently for special handling.

Session Routing
Looks up or creates session for “project-rust-agent-123”.
Checks if the agent is already busy on another task → queues or runs in parallel if safe.
For KAIROS daemon tick: It might route to a background “proactive” session that has lower priority.

Logging
Writes to daily append-only log: “2026-04-07 22:15 — UserCommand received from terminal”.

Hand-off
Passes the clean TriggerEvent to Context Assembly.
The core loop (with its 7 continue sites) has not started yet — this layer’s job is done.


What happens if something goes wrong here?

Malformed input → polite rejection + log, no LLM waste.
No active session → create one with default rules from AGENT.md.
Duplicate trigger → deduplicate using UUID or consumedCommandUuids (seen in leak analyses).

Key Design Differences: Claude Code vs OpenClaw

Claude Code (leak): Heavier on CLI + terminal. Input is often direct to queryLoop. KAIROS adds daemon ticks and webhooks as extra trigger types. Focus = deep coding sessions in one workspace.
OpenClaw: Gateway-centric (long-running daemon). Excels at many concurrent channels and cron/webhook triggers. More emphasis on session persistence across messaging apps.
Common strength: Both treat the Input Layer as the trust boundary — everything downstream assumes input is already safe and normalized.

Why This Matters for Reliability & Your Rust Build

A weak Input Layer causes most agent failures: lost messages, session explosion, security holes (e.g., unsanitized shell commands), or inability to run proactively (KAIROS).
In Rust, this layer will be clean and type-safe:
Enums for TriggerType (UserCommand, CronTick, DaemonTick, Webhook, etc.).
Structs with serde for normalization.
Tokio channels or mpsc for routing to the next layer (async-friendly).
Validation with libraries like validator or JSON Schema.


This separation makes the whole system observable, testable, and extensible — you can later add voice input, email triggers, or browser extensions without touching the core loop.
What We Have Now (Your Understanding Check)
You now fully understand:

The purpose and boundaries of the Input / Trigger Layer.
Its 6 internal components.
How a real trigger (your refactor command) flows through it.
How it enables both reactive (user command) and proactive (KAIROS tick) behavior.
Why it must stay simple and separate from reasoning/tools.

Next step in your project (only when you are ready):
We move to Subsystem #2: Context Assembly — how the system gathers CLAUDE.md, MEMORY.md index, git status, relevant files, etc., into a coherent prompt without wasting tokens.
Before we continue:

Does everything above feel clear? Any part you want me to expand (e.g., how daemon ticks differ from user commands, or session management details)?
Any questions on how this layer interacts with the 7 continue sites later?
Or shall we go deeper on one specific trigger type (e.g., KAIROS tick lifecycle) before moving on?

Tell me exactly where your head is — we only advance when you say you’ve internalized this piece completely. This slow, detailed pace is how you will own the entire orchestration architecture in Rust by the end.

1. Schema Validation — What It Does and How It Works
What it validates: The Input Layer enforces a strict, typed contract on every incoming trigger before it goes anywhere else. It checks:

Required fields exist (e.g., payload or command cannot be empty).
Types are correct (string for command, array for attachments, enum for trigger_type).
Values are sensible (no obviously malicious patterns, length limits, rate limits).
For structured commands (e.g., JSON from a webhook or slash-command), it validates against a JSON Schema (or Zod-style schema in the leak).

How it does it (in the leaked Claude Code + OpenClaw patterns):

Claude Code (terminal-first): Uses a lightweight CLI parser (like a TypeScript equivalent of clap) + early permission schemas for any attached files or flags. It also runs quick “input sanitizers” (e.g., strip control characters, block zero-width Unicode that could hide malicious instructions).
OpenClaw (gateway-first): Every WebSocket message or inbound webhook is validated against a full JSON Schema generated from TypeBox definitions. If it fails → immediate 400 rejection, no further processing. Config files themselves are validated the same way at startup.
Result: The rest of the agent (context assembly onward) can assume the input is always clean and well-formed. This is a classic “trust boundary” — everything downstream trusts this layer 100%.

In your example:
You type the refactor command. Schema check passes instantly because it’s plain text with a valid payload. If you had pasted a 10 MB JSON blob pretending to be a command, it would reject it here.
2. Normalization and Enrichment — Turning Raw Input into the “Right Schema”
Yes — your understanding is spot-on: it transforms messy real-world input into one clean, standardized internal structure that the rest of the system can rely on.
Normalization (making it consistent):

Raw CLI text → structured object.
Raw WhatsApp message → same structured object.
Raw cron/webhook → same object.
All variations become identical format.

Enrichment (adding useful context the downstream layers need):

Adds metadata the original input didn’t have (timestamp, source channel, session ID, priority, user ID, trace ID for observability).
Looks up or creates a session.
Attaches any relevant defaults (e.g., “use this default model if none specified”).

The resulting structure is what I called the clean TriggerEvent (more on this below).
In your example:
Raw input = just the sentence you typed.
After normalization/enrichment = a rich object with timestamp, session_id for your Rust project, source = “terminal”, priority = “high”, etc.
3. How It Checks If an Agent Is Busy on Another Task
The Input Layer maintains (or talks to) a session registry — a lightweight in-memory map (or small persistent store) of currently active sessions.

Each session has a current_task_id or is_busy flag + optional timeout.
When a new trigger arrives → look up the session_id.
If is_busy == true → apply the session’s activation policy (configured per workspace or globally):
“queue” (most common for long-running work)
“reject with polite message”
“interrupt” (rare, only for high-priority)
“allow parallel” (only if the task is marked safe)


This check is before any LLM call or context assembly — pure metadata.
4. Where Is the Queue? Is It Like an mpsc Channel?
Yes — exactly the concept you’re thinking.
In the architecture:

There is a per-session queue (or global priority queue for KAIROS-style background work).
In Claude Code (leak): It’s an in-memory queue inside the QueryEngine for the current session. For daemon mode it uses a simple task queue with dependencies.
In OpenClaw: The Gateway maintains typed queues per session (backed by in-memory channels + optional Redis/persistence for truly long-lived setups).
In Rust (what you’ll eventually build): This will be a Tokio mpsc (multi-producer single-consumer) channel per session, or a more advanced actor mailbox with priority + backpressure. You can make it persistent with a small redb table if you want the queue to survive restarts.

When the agent finishes its current task, the Input Layer pops the next item from that session’s queue and feeds it forward.
5. How Does It Decide If It Is Safe to Run in Parallel?
This decision is made after the busy check, using two signals:

Task metadata (enriched in the TriggerEvent): e.g., allow_parallel: true for read-only tasks like “show git status”.
Session policy + global rules: Destructive tasks (file writes, shell execution) are usually serialized per session to avoid race conditions. Read-only or independent tasks can run in parallel (Claude Code does this via isolated git worktrees for sub-agents).

The Input Layer itself does not make deep safety calls — it just reads the flags and routes accordingly. Real safety (permission gate) happens later inside the 7 continue sites.
6. KAIROS Daemon Tick — Is It the Daemon Receiving Input from the Prompt?
Exactly right.
The KAIROS daemon is a background process that runs 24/7 (even when you close the terminal).
Every N seconds/minutes (configurable tick interval) it generates its own internal trigger:

Trigger type = DaemonTick (special enum value).
Payload = usually empty or a fixed prompt like “<tick> Is there anything worth doing right now based on recent changes?”
This trigger goes through the exact same Input / Trigger Layer as a user command — schema validation, normalization, enrichment, session routing, busy check, queue, etc.

This is why the daemon feels “alive”: it is literally feeding itself clean TriggerEvents on a schedule. The core loop then treats it like any other task (but usually with lower priority and stricter autonomy limits).
7. What Is the Clean TriggerEvent?
It is the standardized, validated, enriched data structure that leaves the Input Layer and enters Context Assembly.
Typical shape (conceptual — exact fields from leak analyses + OpenClaw):

trigger_type: enum (UserCommand | DaemonTick | Cron | Webhook | Message)
payload: the actual command text or structured data
metadata: timestamp, source, session_id, trace_id, priority, user_id, etc.
attachments: any files, images, context hints
policy_overrides: optional flags for this specific trigger (e.g., skip certain safety checks)

Everything downstream (Context Assembly, Core Loop, etc.) only ever sees this clean object. No raw stdin, no raw JSON, no surprises.
8. What Is Context Assembly? (Quick Preview — We’ll Go Deep Next)
This is Subsystem #2, the immediate next layer after the Input Layer hands off the clean TriggerEvent.
It is responsible for gathering all the relevant background knowledge into one coherent prompt before the LLM is even called. It pulls:

Project rules
Memory index
Git state
Relevant files

We’ll cover it fully when you’re ready — but it only activates after the Input Layer has done its job.
9. What Kind of Information Is Generally Inside AGENTS.md (or CLAUDE.md)?
In Claude Code (the leak) the file is called CLAUDE.md (sometimes PROJECT.md or .claude/rules/*.yaml).
In OpenClaw it is often AGENTS.md / SOUL.md / TOOLS.md (multiple files for different concerns).
Typical contents (hierarchical — root + subfolder + global files all merge):

Project personality / rules: “You are a senior Rust engineer. Prefer redb over sled. Always add tests. Never commit without running cargo clippy.”
Coding standards: File layout, error handling, logging style, naming conventions.
Tool preferences: Which tools to prefer, which to avoid.
Safety & workflow rules: “Always verify memory against filesystem. For refactors, create a new git worktree first.”
Context hints: What files are important, architecture overview, tech stack.
Hierarchical overrides: Subfolder rules can add “in /src/memory/ always use async traits”.

The Input Layer does not parse this file — it just notes the session and passes the session_id forward. Context Assembly is what actually reads and injects CLAUDE.md / AGENTS.md into the prompt.

Your understanding check — we have now covered every single part of the Input / Trigger Layer in complete detail.
Does everything feel solid? Any piece you want me to expand or re-explain with another example (e.g., how a KAIROS tick differs from a user command, or exactly how the queue handles backpressure)?
When you say “ready”, we move to Subsystem #2: Context Assembly (how CLAUDE.md / AGENTS.md + memory index + git state get assembled). We only advance when you are 100% comfortable.

This is the second gate in your full agentic framework. The Input / Trigger Layer has already done its job and handed over a clean TriggerEvent. Context Assembly now takes that clean event and builds a coherent, token-efficient prompt package that the LLM will actually see. Nothing reaches the model until this layer finishes.
We stay in pure architecture and concepts mode — no code yet. I'll explain every detail, why it exists, how Claude Code (from the leak) and OpenClaw implement it differently, and then walk through the exact same refactor example so you can follow the full lifecycle again.
Core Concept: What Is Context Assembly?
Context Assembly is the smart prompt builder. Its single job is to gather all relevant background knowledge from disk, memory, git, and recent history — then package it into one clean system prompt + user message that respects the model's context window.
It solves the classic problem: raw LLMs forget everything between calls and have no idea about your project, your rules, or what happened yesterday. This layer turns a dumb stateless model into a stateful, project-aware agent.
Key principles (directly visible in the leak analyses):

Context is scarce and expensive → never load everything.
Skeptical / self-healing mindset starts here → always prefer fresh data from disk over stale memory.
Hierarchical loading → global rules + project rules + session-specific overrides.
Token budgeting → early decisions on what to include, summarize, or skip.

The output of this layer is a structured ContextPackage that gets passed to the Core Query Loop (the 7-continue-site engine).
Detailed Components Inside Context Assembly
Here is the full breakdown (synthesized from Claude Code leak patterns and OpenClaw's gateway/runtime):

Bootstrap / Rules Files Loading (Always first)
Reads fixed Markdown files from the workspace root or .claude/ folder.
These are re-read every single turn (or on every major context rebuild) because they are cheap and authoritative.

Memory Index Injection (The skeptical layer)
Loads the lightweight MEMORY.md index (only pointers/hints, ~150 chars per line).
Does not load full topic files yet — only injects the index.
The model is explicitly instructed: “Treat MEMORY.md as hints only. Always verify against actual filesystem before acting.”

Project & Git Context
Git status, current branch, recent commits, changed files.
Relevant file summaries (not full files — only top-level or recently touched ones, with line limits).
LSP or tree-sitter summaries if available (deeper in coding agents).

Session & History Context
Last few turns (compressed or micro-summarized).
Any attachments or overrides from the TriggerEvent.

Tool & Capability Summary
Short descriptions of available tools/skills (names + one-line purpose only — full schemas come later if the model asks via a meta-tool).

Token Budgeting & Early Compaction
Calculates estimated token count.
Applies micro-compaction rules if close to limit (e.g., drop old history, shorten summaries).
Decides whether to trigger on-demand topic loading or full compaction.

Final Prompt Templating
Combines everything into:
System prompt (rules + personality + memory index + tool list)
User message (the TriggerEvent payload + any enriched context)

Adds explicit instructions like “You are in session XYZ. Verify memory claims against disk.”


The entire assembly usually takes 1–3 seconds and is fully deterministic/reproducible.
Key Files and What They Contain
In Claude Code (leak style):

CLAUDE.md (or PROJECT.md): Main rules file. Coding standards, workflow preferences, safety rules, “what not to do”, preferred tools, architecture notes.
MEMORY.md: Lightweight index only — short lines like “memory module: switched to redb on 2026-04-07, see src/memory/redb.rs for details”.

In OpenClaw (your other reference — multi-channel personal agent):

AGENTS.md: Operational rules and workflow. How the agent should make decisions, tool usage conventions, response length guidelines, routing/boot sequence.
SOUL.md: Personality and tone. “You are a helpful, opinionated senior Rust engineer who values performance and correctness. Be concise but thorough.”
USER.md or similar: User preferences and background.
MEMORY.md or daily logs: Long-term knowledge.
TOOLS.md or skill files: Capability descriptions.

These files are plain Markdown so you (the human) can edit them directly in any text editor. The agent treats them as ground truth and reloads them frequently.
Full Lifecycle Example — Context Assembly in Action
Recall your trigger:
"Refactor the memory module in my Rust agent to use redb instead of sled for better performance. Make it persistent across daemon restarts and add a simple auto-compaction for old entries."
After the Input Layer hands over the clean TriggerEvent (with session_id = "rust-agent-project", payload = your sentence, source = "terminal"):
Context Assembly runs:

Bootstrap files:
Reads AGENTS.md / CLAUDE.md: “You are a senior Rust engineer. Prefer redb over sled for performance. Always add persistence and tests. Never trust memory blindly — verify on disk.”
Reads SOUL.md: “Be concise, opinionated about correctness, explain trade-offs.”

Memory Index:
Loads MEMORY.md (always in context):
“memory module: currently uses sled, noted performance bottleneck 2026-04-05, see src/memory.rs”
Instructs model: “This is a hint only. Check actual files before refactoring.”

Git & Project Context:
Git status: on main branch, src/memory.rs modified yesterday.
Summarizes relevant files: only src/memory.rs (first 100 lines + structure) and Cargo.toml (dependencies section showing sled).

Session History:
Last turn summary (if any): “Discussed performance trade-offs yesterday.”

Tool Summary:
Short list: “file_read, file_edit, git_status, cargo_test, etc.”

Token Check:
Estimated 4,200 tokens so far → under limit → no early compaction needed.

Final Package:
System prompt = AGENTS.md + SOUL.md + MEMORY.md index + tool list + “Verify everything on disk” instruction.
User message = your refactor request + git summary + file hints.


This clean package now goes to the Core Query Loop, which will start the LLM call and hit the 7 continue sites.
If the model later needs deeper details (e.g., full content of src/memory.rs), it will request it via a tool call — which triggers Continue Site 2 (Tool Execution) and Continue Site 3 (Memory Verification).
Design Differences: Claude Code vs OpenClaw

Claude Code (terminal/coding focus): Heavier on git + file summaries + live repo context. Re-reads CLAUDE.md every query. Strong emphasis on skeptical memory from the very first prompt.
OpenClaw (personal life agent): Gateway assembles from AGENTS.md + SOUL.md + daily logs + skill registry. More emphasis on personality and multi-channel persistence. Bootstrap files are reloaded at session start and survive compaction.

Both treat Context Assembly as a critical engineering decision — bad assembly = hallucinating agent; good assembly = reliable, long-lived agency.
Why This Layer Matters for Your Rust Build

It enforces the “skeptical” philosophy right from the start.
It makes the agent feel aware of your project without wasting tokens.
In Rust you’ll model this as a clean function or struct (ContextAssembler) that takes TriggerEvent and returns ContextPackage. Use filesystem crates for fast reads, token counters for budgeting, and hierarchical merging logic for the Markdown files.

This layer directly enables the 3-layer memory system and the proactive KAIROS daemon (which also runs its own context assembly on every tick).

Your understanding check for Subsystem #2
We have now covered Context Assembly in full detail: its purpose, 7 internal steps, the key files (AGENTS.md / CLAUDE.md / SOUL.md / MEMORY.md), how it uses the TriggerEvent, and how it appears in the refactor example.
Does everything feel solid?
Any part you want expanded (e.g., how token budgeting works in practice, differences in file loading order, or how it interacts with KAIROS ticks)?
When you are ready and say “ready for next” or “move to the core loop”, we will advance to Subsystem #3: The Core Query Loop with the 7 Continue Sites — the real heart of the orchestration (the while(true) state machine from the leak).

Where Is All This Context Generally Stored?
The Context Assembly layer never stores anything itself — it is a reader and assembler. It reads live from the filesystem (and runs lightweight git commands) every time a clean TriggerEvent arrives. This is deliberate: it keeps the agent skeptical and self-healing.
Here is the exact storage map (hierarchical loading order matters — the leak shows the system walks the filesystem in a specific sequence):

Global rules (apply to every project the agent ever touches):
~/.claude/CLAUDE.md (user-level global instructions)
~/.claude/rules/*.md (modular global rule files)
/etc/claude-code/CLAUDE.md or system-managed rules (corporate/enterprise overrides)

Project rules (apply only inside this workspace):
<project-root>/CLAUDE.md (main project file — re-read on every turn)
<project-root>/.claude/CLAUDE.md
<project-root>/.claude/rules/*.md (sub-rules)
Subdirectory CLAUDE.md files (walk up from current working directory to root — so a rule in /src/memory/CLAUDE.md overrides higher ones for that folder only)
CLAUDE.local.md at any level (gitignored — for secret/personal overrides you don’t want committed)

Session-specific overrides:
Per-session files in a memdir/ or .claude/sessions/ folder (Claude Code style).
Or OpenClaw-style: temporary overrides injected only for this TriggerEvent’s session_id (e.g., “for this refactor task only, be extra verbose on tests”).

Current existing state of the workspace (the live “now”):
All of the above Markdown files are read fresh from disk on every assembly (no caching of rules).
Git state = live git commands (see below).
File summaries = live read of selected files (not full repo).
MEMORY.md index = live read of the index file (always in project root or memdir/).


In your refactor example:
Context Assembly first walks the filesystem, loads your project’s CLAUDE.md (“Prefer redb over sled for performance”), then loads ~/.claude/CLAUDE.md (“You are a senior Rust engineer”), then reads the current MEMORY.md index, then runs git status to see that src/memory.rs was touched yesterday.

How Token Budgeting Works
Token budgeting is early and aggressive — it happens before the final prompt is built, so the assembly never exceeds the model’s limit (or your configured safety margin).
How it works conceptually:

The assembler has a fast token counter (equivalent to tiktoken in Rust — counts tokens in the raw text).
It calculates an estimate for: rules files + MEMORY.md index + git summary + history + tool list.
Hard caps: e.g., MEMORY.md injection is truncated at ~200 lines or 25 KB (whichever comes first).
If over budget → multi-stage decisions:
Micro-compaction (shorten file summaries, drop oldest history turns).
Drop optional git details (e.g., skip full recent commits if not relevant).
Skip some rule sub-files or use a shorter tool summary.
(Later in the loop) trigger full compaction if still too big.


The model is explicitly told the remaining budget in the prompt so it can self-manage (“You have 18k tokens left — be concise”).
In the refactor example:
Estimated 4,200 tokens → under limit → full git status + full MEMORY.md index goes in. If it was 28k tokens, it would drop the last 3 days of git commits and shorten file summaries automatically.
What Does the MEMORY.md Index Look Like? What Is an “Index”? Pointers?
MEMORY.md is NOT a database of facts. It is a lightweight human-and-model-readable index file — pure Markdown, stored on disk in the project root (or memdir/ / ~/.claude/projects/...).

What an “index” means here: Think of it like the table of contents at the front of a book, or a library card catalog. It does not contain the full knowledge — it contains short pointers (references) to where the real details live.
Pointers = English-language references, NOT programming memory pointers.
Each line is deliberately short (~150 characters max) so it stays cheap in context.

Typical MEMORY.md example (exactly as seen in leak analyses):
text- [memory module](src/memory/redb.rs): switched from sled on 2026-04-07 — performance bottleneck fixed, see redb.rs:42 for persistence hooks
- [daemon restarts]: KAIROS now survives full process restart using redb + PID file
- [auto-compaction]: nightly task prunes entries older than 30 days, see autoDream.ts logic
- [user preference]: always prefer async traits in Rust agents
The first 200 lines (or 25 KB) of this file are always injected into context.
When the model needs more detail, it asks for the linked topic file (e.g., src/memory/redb.rs or a dedicated memory/topic-redb.md) via a tool call — then Continue Site 3 (Memory Verification) checks it against disk.
This is the “skeptical” part: the index is treated as hints only.

How Does It Get Git Status, Current Branch, Recent Commits? How Does It Handle “So Much Data”?
It does not dump the entire git history. It runs lightweight, targeted git commands (via the tool system, but the assembly layer can call safe read-only ones early).
Typical commands (from leak):

git status --porcelain → short list of changed files.
git branch --show-current → current branch name.
git log --oneline -n 5 → only the last 5 commits (titles only).
git diff --name-only HEAD~3 or similar for recent changes.

If the workspace is huge, it limits output (e.g., only files matching the task via glob) or skips entirely in remote/low-budget mode.
“Commit” here simply means the output of those git commands — plain text summaries that get injected as a small section in the prompt. The agent never loads the full .git folder.
In your example: Git summary injected = “On main branch. src/memory.rs modified 1 day ago. No uncommitted changes.” — tiny, but enough for the model to know the current state.

What Are Tree-Sitter Summaries?
Tree-sitter is a fast, incremental code parser (used in editors like VS Code). In Claude Code (and advanced coding agents), the Context Assembly can call a Tree-sitter parser on relevant source files to produce semantic summaries instead of raw text.
Example summary for src/memory.rs:
textModule: memory
- Uses redb::Database (async)
- Functions: init_db(), compact_old_entries()
- Structs: MemoryIndex { ... }
- Key trait: PersistentStore
This is much cheaper in tokens than dumping the whole file and gives the model structural understanding (classes, functions, dependencies). It is optional — only for coding-heavy tasks — and falls back to plain text read if Tree-sitter is not available.

Where Is the Context of the Last Few Sessions Stored?

Short-term session history: Stored in-memory during the current run, then written to append-only daily log files (e.g., memory/2026-04-07.md or session transcripts).
Compressed summaries: After each major turn or compaction, a micro-summary is written back to a topic file or daily log.
Never fully reloaded: Raw transcripts are grep-only (searched on demand, never loaded wholesale into context).
The last 2–4 turns (or their compressed versions) are what actually gets injected into the prompt.

What Tree-sitter Actually Is (Simple Mental Model)
Tree-sitter is a fast, incremental parser that turns raw source code (any language it supports — Rust, Python, TS, etc.) into a structured Abstract Syntax Tree (AST).

Think of it like an editor (VS Code, Cursor, etc.) understanding your code: it knows “this is a function named init_db”, “this function calls sled::open”, “this struct has these fields”, and exactly which lines/bytes they occupy.
It is not an LLM. It is a deterministic, language-specific parser (written in C with bindings for many languages) that runs locally and blazingly fast.
Incremental = when you edit one line, it only updates the affected part of the tree instead of re-parsing the whole file.

In the Claude Code leak (and modern agentic coding systems), Tree-sitter is used inside Context Assembly and the Tool layer to give the agent structural awareness instead of just treating code as dumb text.
How Tree-sitter Works Step-by-Step

Parsing — Feed a file (or the whole workspace) to the Rust Tree-sitter parser → it builds an AST: a tree where each node has a type (function_declaration, struct_item, call_expression, etc.) and exact byte ranges (start_line, start_column, end_line, end_column).
Querying the Tree — You write simple “queries” (like super-powered regex but for syntax) to extract what you want:
“Find all function declarations”
“Find all calls to anything containing ‘sled’”
“Give me the full node for the struct named MemoryIndex”

Mapping back to source — Every node knows its exact position in the original file, so the agent can:
Show precise snippets
Edit only the right lines
Generate accurate diffs

Building higher-level intelligence:
Symbol index (list of all functions, structs, traits)
Call graph (which function calls which)
Scope-aware search (find variable usage inside a specific function only)
Semantic chunking (split file into logical units: one function per chunk)


This all happens locally and fast — no LLM involved at this stage.
How the Agent Knows “Which File and Which Line” When You Give a Task
This is the key part you asked about. Here’s the flow in a production agent (Claude Code style) for your example task: “Refactor the memory module in my Rust agent to use redb instead of sled...”
During Context Assembly (Subsystem #2):

The assembler first uses simple heuristics (git status, MEMORY.md index, file names) to pick likely files: src/memory.rs, Cargo.toml, etc.
Then it can call Tree-sitter tools (read-only) to build a semantic summary for those files:
“Module memory: contains struct MemoryStore, function init_db() that opens sled::Db, function compact_old_entries(), calls to sled::open at lines 42 and 67.”

The summary (short and structured) goes into the prompt. The model now knows semantically where the sled usage lives.

When the Core Loop runs (7 continue sites):

The LLM thinks: “I need to find all sled usages.”
It issues a tool call (e.g., semantic_search or find_symbol or grep_with_tree_sitter).
Tool executes Tree-sitter query across relevant files → returns precise results with exact file paths + line/column ranges + surrounding context.
Example output the model sees:textFile: src/memory.rs
- Function init_db() lines 38-55: calls sled::open(...)
- Call to sled::Db at line 67 inside compact_old_entries()
- Struct MemoryIndex at lines 12-25 uses sled internally
Continue Site 2 (Tool Execution) runs it safely.
Continue Site 3 (Memory Verification) confirms the file on disk still matches.
Continue Site 4 (Critic) checks if the planned edit looks risky.

The model now has grounded, precise locations — not guessing from text search.
How It Avoids Breaking Upstream / Downstream Code
This is where Tree-sitter + the full agent loop shines (the leak’s safety patterns):

Dependency Analysis (via Tree-sitter queries):
Before any edit, the agent can query the call graph: “Who calls init_db()?” or “Where is MemoryStore used outside this module?”
It discovers upstream callers (e.g., in src/agent_loop.rs) and downstream dependencies (e.g., persistence in KAIROS daemon).

Surgical Edits:
Instead of replacing text blindly, it uses the exact node ranges to generate precise diffs or targeted file_edit tool calls.
It can edit only the sled::open call while leaving surrounding logic intact.

Verification Steps (baked into the 7 continue sites):
After edit: re-run Tree-sitter to check the AST is still valid (no syntax breakage).
Run cargo check / clippy / tests via tools.
Critic prompt: “Does this change break any callers? Check call graph.”
Memory verification: update MEMORY.md index with new pointers.

Swarm / Multi-Agent (if the task is big):
Coordinator can spawn a “verifier” sub-agent in an isolated git worktree to test the refactor without touching the main code.


In your example:

Agent finds sled in init_db() and compact_old_entries().
It also finds that KAIROS daemon calls init_db() upstream.
It plans: update the function signature if needed, then propagate to callers, then run tests.
If something looks risky (e.g., breaking change to public API), it hits the Critic or asks you.

This is why agents with Tree-sitter feel much smarter and safer than plain text-based ones.
Rust Translation Note (for your project — still concepts)
In Rust you’ll use the tree-sitter crate + the official tree-sitter-rust grammar. You’ll expose tools like:

list_symbols(file_path)
find_usages(symbol_name)
get_node_at_position(file, line, col)
semantic_chunk_file(file) → returns logical chunks with their AST types.

These become part of your Tool Registry (Subsystem #4) and get called from Context Assembly when the task looks code-heavy.
Tying It Back to the Full Lifecycle
In your refactor task:

Input Layer → clean TriggerEvent
Context Assembly → loads CLAUDE.md rules + MEMORY.md index + git status + Tree-sitter semantic summaries for memory.rs → builds prompt
Core Loop starts → LLM decides it needs more precise sled locations → tool call → Tree-sitter query → precise locations returned → 7 continue sites handle permission, execution, verification, critic, etc.
Result: accurate, low-risk refactor that knows about upstream/downstream effects.

This structural awareness is one of the big reasons Claude Code felt like a “real senior dev” in the terminal.

Moving Forward in Your Agent-Building Project
We now advance to Subsystem #3: The Core Query Loop with the 7 Continue Sites.
This is the real heart of the leaked Claude Code orchestration harness (the ~1,729-line query.ts file that everyone praised after the leak). Everything we’ve built so far (Input Layer + Context Assembly) feeds directly into this loop. The 7 continue sites are what make the agent reliable, self-healing, resumable, and production-grade instead of a fragile ReAct wrapper.
Quick Recap of the Full Picture So Far

Input / Trigger Layer → clean TriggerEvent
Context Assembly → ContextPackage (rules + MEMORY.md index + git + Tree-sitter summaries + history)
→ Now: Core Query Loop (while(true) state machine that drives the entire cycle)

What the Core Query Loop Actually Is
It is an async generator / state machine that runs in a while(true) loop until the task is complete or explicitly stopped.
Instead of a simple “LLM → tool → repeat” loop, the leak shows a highly engineered version with exactly 7 explicit “continue sites” — these are built-in pause points where the system can:

Check safety
Execute tools
Verify memory
Compact context
Hand off to sub-agents
Recover from errors
Decide whether to loop back or output to the user

This design makes the loop observable, testable, resumable, and self-healing. It is the main reason Claude Code could run long autonomous coding sessions without falling apart.
The 7 Continue Sites (Exact Conceptual Breakdown)
These are the 7 explicit checkpoints referenced throughout the leaked source. After every LLM response or tool result, the loop hits one (or more) of these sites before continuing.

Permission Gate — Is this tool/action allowed for the current session? (default-deny + denial tracking)
Tool Execution — Safely run the tool (bash, file edit, git, Tree-sitter query, etc.) and capture clean output
Memory Verification (Skeptical Check) — Does the real filesystem still match what MEMORY.md claims? If not, correct it
Critic Safety Review — Run a self-critic prompt: “Is this plan risky? Any upstream/downstream breakage?”
Compaction Check — Token budget too high? Run micro/auto/full compaction
Swarm Handoff — Should I spawn a sub-agent/worker in an isolated worktree for this part?
Output & Loop Decision — Stream result to user or loop back to Context Assembly for the next iteration
How the Loop Flows (High-Level)

Receive ContextPackage from Subsystem #2
Call LLM (streaming)
Parse response (thought + tool calls or final answer)
Enter the 7-site checkpoint system
Based on what the model asked for, route through the appropriate sites
Loop back (re-assemble fresh context with updated state) or output

KAIROS daemon ticks also feed into this same loop (with lower priority).
Next: Deep Dive into the Core Loop
Since you learn best through detailed concepts + examples, I’ll next explain:

The exact lifecycle of one full iteration using your “refactor memory module to redb” task
How each of the 7 continue sites fires in practice
Why this is so much stronger than simple ReAct or AutoGen conversation loops
How it integrates with Tree-sitter, skeptical memory, and daemon mode

Your move — tell me when you’re ready:
Reply with one of these (or anything else):

“Explain the full loop lifecycle with the refactor example in detail”
“Go deep on the 7 continue sites one by one”
“Compare this loop to simple ReAct and to AutoGen”
“I’m ready — show me how the loop handles errors and self-healing”
Or “ready for next” if you want the complete conceptual map first
Core Philosophy of the Query Loop
The loop is not a simple ReAct (“reason → act → observe → repeat”). It is a production-grade, self-healing async state machine wrapped in an async generator (async function* queryLoop() in the leaked source).

It runs in a while(true) until the task is explicitly done or stopped.
After every LLM response or tool result, control is yielded to one (or more) of the 7 explicit continue sites.
These sites are the engineered “checkpoints” that prevent chaos, enable recovery, manage resources, and make long-running autonomous work possible.
The generator pattern means the entire loop is observable, resumable, and testable — you can pause at any site, inspect state, or even replay from a specific checkpoint.
It integrates directly with Context Assembly (re-assembles fresh context on every loop-back) and the Tool Registry (Subsystem #4).

This design turns probabilistic LLM output into deterministic, reliable agency.

Deep Breakdown
These are the exact 7 yield points referenced in the leaked source comments. The loop hits them in flexible order depending on what the model just did.

Permission Gate
Purpose: Enforce strict boundaries before any action. Default-deny + tracks repeated denials.
How it works: Every tool call or high-risk operation is checked against session policy, user approvals, risk metadata (read-only vs destructive), and denial history. If denied → graceful fallback message or escalation to user.
Why it exists: Prevents the agent from ever doing something it shouldn’t (e.g., rm -rf / or editing production files without approval).
In practice: Model wants to edit src/memory.rs → gate checks “is file_write allowed in this session?” → yes → proceed.
Tool Execution
Purpose: Safely run whatever the model asked for and capture clean, structured output.
How it works: Calls the Tool Registry (40+ tools in the leak). Each tool has isolated execution, schemas, and output sanitization. Results are streamed back or returned as structured data.
Why it exists: Turns the model’s “intention” into real-world effect without leaking raw shell output or crashing the loop.
In practice: Tool runs read_file(src/memory.rs) or Tree-sitter query for sled usages → output is cleaned and fed back to next LLM turn.
Memory Verification (Skeptical Check)
Purpose: Fight context rot and hallucinations.
How it works: Before trusting anything in MEMORY.md index or previous knowledge, it verifies against actual filesystem (or git). If mismatch → auto-corrects the index/topic file on the spot.
Why it exists: This is the “skeptical memory” pattern that everyone praised in the leak. Never fully trust memory — always double-check reality.
In practice: Model thinks “MEMORY.md says we still use sled” → verification reads the real file → sees redb already partially there → corrects index immediately.
Critic Safety Review
Purpose: Self-audit for risk, upstream/downstream breakage, or bad plans.
How it works: Runs a separate critic prompt (or full sub-inference) on the proposed plan/tool results. Looks for frustration signals, security issues, API breaks, etc. If risky → block, rollback, or ask user.
Why it exists: The model can be overconfident; the critic forces second-guessing (huge for production safety).
In practice: After planning a refactor that touches the KAIROS daemon → critic checks call graph → “this changes public API used by daemon → add deprecation or notify user”.
Compaction Check
Purpose: Prevent token explosion and context rot during long sessions.
How it works: Checks current token usage. Triggers micro-compact (shorten recent history), auto-compact (summarize), or full compact (rewrite entire context) if needed.
Why it exists: Context windows are finite and expensive. This keeps the agent alive for hours/days.
In practice: After 4 tool calls in the refactor → tokens creeping up → micro-compact summarizes the last 3 Tree-sitter results into one line.
Swarm Handoff
Purpose: Scale complex work without bloating the main agent.
How it works: If task is big, spawns a worker sub-agent in an isolated git worktree (cheap forking via prompt cache). Main agent queues requests via mailbox pattern.
Why it exists: One agent can’t do everything well; swarms enable parallel research + execution + verification.
In practice: Refactor is large → handoff to “verifier” worker to run cargo test in a fork while main agent continues planning.
Output & Loop Decision
Purpose: Decide the end of the iteration.
How it works: Streams final answer to user (terminal, chat, etc.) OR decides to loop back to Context Assembly for the next full iteration. Also handles “task complete” or pause signals.
Why it exists: Keeps the loop alive until the job is truly done, not just one tool call.
In practice: After final edit + tests pass → streams clean summary to you and exits loop (or asks “anything else?”).
Full Multi-Iteration Lifecycle — Your Refactor Example in Action
TriggerEvent arrives → Context Assembly builds package (CLAUDE.md rules + MEMORY.md index + git status + Tree-sitter summary of memory.rs showing sled calls).
Iteration 1

LLM thinks: “Need to see current memory implementation.”
Hits Site 1 (Permission) → file_read OK.
Site 2 (Tool Execution) → reads file + Tree-sitter query for sled usages.
Site 3 (Memory Verification) → confirms MEMORY.md matches disk.
Site 4 (Critic) → low risk.
Site 5 (Compaction) → not needed yet.
Site 7 (Output & Decision) → streams progress + loops back.

Iteration 2 (fresh context re-assembled with new file reads)

LLM plans full refactor.
Hits Site 6 (Swarm Handoff) → spawns verifier worker in git worktree.
Site 2 → executes surgical file edits using Tree-sitter ranges.
Site 3 → verifies edits landed correctly.
Site 4 → critic confirms no upstream breakage in KAIROS calls.
Site 5 → compacts old tool results.
Site 7 → streams “refactor complete, running tests…” + loops.

Iteration 3

Worker reports test results.
Main loop merges → runs cargo test via tool.
All sites fire as needed → final critic OK → Site 7 decides task done → streams clean summary and exits loop.

Meanwhile, the KAIROS daemon (running in parallel) gets its own tick, sees the changes, and might proactively run cargo clippy or update MEMORY.md index in the background.
This loop ran multiple full cycles with safety nets at every step — that’s why it feels alive and reliable.
Why This Is the Gold Standard

Simple ReAct = fragile, no built-in recovery or resource management.
AutoGen-style conversation = can go chaotic with infinite back-and-forth.
Claude Code loop = engineered checkpoints + self-healing + compaction + swarms = production-grade agency that can run for hours without human nudges.

This is the exact pattern that makes the harness the moat.

Does the LLM itself know about the 7 continue sites?
No. The model has zero knowledge of the internal names “Permission Gate”, “Tool Execution”, etc.
What the model does know (via the system prompt that Context Assembly injects every turn):

High-level workflow instructions that mirror the spirit of the sites, e.g.:
“Think step-by-step before acting.”
“Use tools when you need information or to make changes.”
“Always verify claims against the actual filesystem before trusting memory.”
“Be conservative with destructive actions and double-check upstream/downstream impact.”
“If you need more context, request it via a tool call instead of guessing.”

The exact tool-calling format the harness expects (in the leak it was a structured XML-like or JSON format wrapped in special tags, plus optional <thinking> blocks).
Reminders about safety, token budget, and when to declare the task complete.

The 7 sites are purely internal orchestration logic — they live in the TypeScript (and later your Rust) state machine, not in the prompt. The model is guided to behave in ways that naturally trigger the sites, but it never sees or references the site names.
2. Does every response go through every site, or is it selective?
Selective. The loop parser decides which site(s) to activate based on what the model actually outputted.
The flow is:

Context Assembly → fresh prompt package.
LLM call (streaming or full response).
Response parser (inside the query loop) analyses the output.
Based on the parsed content, the state machine routes to one or more of the 7 sites in the logical order needed for that response.
After the chosen sites finish, it hits Site 7 (Output & Loop Decision) which decides: loop back to Context Assembly or exit.

It is not “run all 7 every time.” It is a dynamic routing table. Some responses might skip straight to Site 7. Others might hit Sites 1 → 2 → 3 → 4 → 7 in sequence.
This is what the async generator pattern in query.ts enabled — the loop yields control at each relevant checkpoint instead of hard-coding a fixed sequence.
3. How the actual Claude model response differs from normal Claude web / API output
On Claude web or plain API you see one continuous stream:

Thinking (visible or hidden)
Then final answer or tool calls (if using tools mode)

In the agent harness the loop intercepts and parses that same response type, but treats it as raw material for the state machine.
The harness expects (and the system prompt enforces) a more structured output:

Optional <thinking> or <plan> block (free-form reasoning)
Zero or more <tool_call> blocks (name + parameters in a strict format)
Optional <final_answer> block

The parser looks for these blocks and routes accordingly. This is why the agent feels “step-by-step” even though the model itself is just doing one inference at a time — the loop is what creates the multi-turn orchestration.
4. How different response paths are handled (exact implementation logic)
Here are the real paths the loop takes for different kinds of model outputs:
Path A: Pure thinking / planning (no tool call, no final answer yet)

Model output = just reasoning like “I need to check the current implementation first.”
Parser detects: no tool calls, no final_answer tag.
Route: directly to Site 7 (Output & Loop Decision).
Site 7: streams a progress update to you (optional), then loops back to Context Assembly for the next turn.
Result: model gets fresh context (with any new git changes, etc.) and continues thinking.

Path B: Model wants to use a tool (most common during work)

Model output = thinking + one or more <tool_call> blocks.
Parser detects tool calls.
Route:
Site 1 (Permission Gate) → check if allowed.
If yes → Site 2 (Tool Execution) → run it (file read, Tree-sitter query, cargo test, etc.).
Site 3 (Memory Verification) → if the tool touched or read memory-related things.
Site 4 (Critic Safety Review) → especially for edits or risky ops.
Site 5 (Compaction) → if tokens are getting high after the tool result.
Site 6 (Swarm Handoff) → if the tool result indicates a big sub-task.
Finally Site 7 → feed the tool result back into the next LLM call (loop).


Path C: Model outputs code or direct changes

Usually wrapped as a tool call to file_edit or write_file (the leak had very specific editing tools that took precise diffs or ranges from Tree-sitter).
Same route as Path B, but the Tool Execution site runs the edit safely and returns “edit applied successfully” or diff preview.
Critic (Site 4) is almost always triggered for any write.

Path D: Model says the task is complete

Model outputs <final_answer> block with summary.
Parser detects final_answer.
Route: skip most sites → straight to Site 7.
Site 7: streams the clean final answer to you + exits the loop (or asks “anything else?”).

Path E: Model needs additional context / says “I don’t have enough info”

Model either:
Explicitly makes a tool call for more context (e.g., read_file, tree_sitter_query, grep).
Or just says it in thinking.

In both cases the parser treats it as a tool call (or forces a context tool) → goes through Sites 1-2-3 etc.
The loop never lets the model “stall” — if it needs context, the system forces a tool call route.

5. How all these paths feel seamless to you (the user)
You don’t see the internal routing. You see:

Streaming progress (“Reading memory.rs… Planning refactor… Editing file… Running tests…”)
The loop is quietly doing the parsing + routing + re-assembly behind the scenes.
This is why the leaked Claude Code felt so much more reliable than plain Claude with tools — the orchestration layer was doing the heavy lifting of turning one-shot responses into a continuous, self-correcting process.

Quick mental model for your future Rust build

How the actual Claude model response differs from normal Claude web / API
Normal Claude web or plain API (what you see every day):

You send one message.
The model thinks (sometimes you see the thinking stream, sometimes it’s hidden).
Then it just spits out one continuous block of text.
It can mix reasoning + code + tool calls all together in any order, or even forget to use tools when it should.

Example of what you get on web/API for your refactor task:
textI need to look at the memory module first. Let me check the current code.

The current implementation uses sled in src/memory.rs at lines 42 and 67. To switch to redb, I should update the init_db function and also check the KAIROS daemon since it calls this.

Here is the new code for src/memory.rs: [long code block]

Let me know if this looks good!
It’s free-form. The model decides the format on the fly. It might forget to use tools, or put code in the middle of thinking, or declare the task done too early.
In the agent harness (Claude Code leak):
The Context Assembly layer (the one we already covered) injects a much stronger, stricter system prompt every single turn.
That prompt contains explicit instructions like:

“Always output in this exact structured format.”
“First, put your reasoning inside <thinking> </thinking> tags.”
“If you need to do anything (read file, edit code, run test), output one or more <tool_call> blocks.”
“When the entire task is finished, output a <final_answer> block with the summary.”
“Never mix free text with tool calls. Never output code directly — only via tool calls.”
“Think step-by-step and be explicit.”

Because of this, the model is forced to output tagged blocks instead of free-form text.
Concrete example of what the harness actually receives from the model (same refactor task):
text<thinking>
I need to inspect the current memory implementation before refactoring.
I should first read the file and find all sled usages using Tree-sitter.
</thinking>

<tool_call name="read_file">
  <parameter name="path">src/memory.rs</parameter>
</tool_call>

<tool_call name="tree_sitter_query">
  <parameter name="query">calls to sled</parameter>
</tool_call>
No final answer yet → so the loop knows more work is needed.
Or later when done:
text<thinking>
All changes made, tests passed, upstream callers updated.
</thinking>

<final_answer>
Refactor complete: switched memory module to redb with persistence and auto-compaction.
Summary of changes: [short list]
</final_answer>
This structured output is not magic from the model — it is enforced by the system prompt that Context Assembly puts in front of the model every single time.
2. How the parser + state machine decide which sites to run (and in what order)
Once the model outputs the tagged blocks above, the response parser (simple code inside the query loop) does this:

It reads the raw text the model just gave.
It looks for the tags using basic string/XML parsing (exactly like finding  tags in HTML).
It extracts:
Everything inside <thinking> → used for progress streaming to you.
All <tool_call> blocks → list of tools the model wants.
<final_answer> block → if present.


This parsing is 100% deterministic and happens outside the LLM, in the harness code (the state machine).
Then the state machine uses a simple “if-then” routing table (hard-coded rules, not AI):

If there is a <final_answer> block → skip almost everything and go straight to Site 7 (Output & Loop Decision) → show the answer and exit the loop.
If there are <tool_call> blocks → start the sequence:
Site 1 (Permission Gate) — check if all requested tools are allowed.
If yes → Site 2 (Tool Execution) — actually run the tools (read_file, tree_sitter_query, etc.).
After tools finish → Site 3 (Memory Verification) if any memory-related files were touched.
Site 4 (Critic Safety Review) especially for any edit tools.
Site 5 (Compaction Check) if tokens are getting high after the tool results.
Site 6 (Swarm Handoff) only if the tool results show this is a big sub-task.
Finally Site 7 (Output & Loop Decision) — stream progress to you and decide to loop back to Context Assembly for the next LLM call.


The order is not random. The state machine follows fixed rules based on what tags were present. It can skip sites it doesn’t need (e.g., no tool calls → skip Sites 1-6 entirely).
That’s why it feels “step-by-step” even though each LLM call is just one inference. The loop is the conductor that keeps forcing the model back into the structured format and routing the results through the right safety checkpoints.
Why the model behaves better in the harness than on web/API
It’s 90% the system prompt + 10% the loop.
The prompt in the harness is much stricter and more repetitive than a normal chat. It literally says things like “You MUST use <tool_call> tags for any action” and “Never output raw code outside a tool call.” Because Claude is trained to follow instructions well, it obeys this format almost every time.
If the model ever spits out messy free-form text anyway (it happens rarely), the parser falls back to a “pure thinking” path and just loops back with a gentle reminder in the next prompt (“Please use the structured format…”).
This is exactly how the leaked Claude Code turned a normal Claude model into something that feels like a reliable senior dev who thinks step-by-step and uses tools safely.

Bro, does this slower, concrete explanation with the side-by-side output examples make the parsing and routing click now?
Tell me:

Which part still feels fuzzy? (e.g., “show me the exact routing for the first tool call in the refactor example”)
Or if it’s clear, just say “ready for next” and we move to Subsystem #4 (Tool Registry & Execution).

How the Framework Maps Perfectly to Business/Commerce
The Core Query Loop + 7 sites work even better for business because commerce tasks are usually more structured and rule-heavy than personal coding tasks.
Here’s how the full architecture translates:













































SubsystemPersonal/Coding Use (Claude Code)Business/Commerce Use (Your Idea)Input / Trigger LayerTerminal + KAIROS ticksWhatsApp, Telegram, RCS, SMS, Webhook from orders, cronContext AssemblyCLAUDE.md + MEMORY.md + git + Tree-sitterBusiness Rules.md + Inventory DB + Order History + Customer CRMCore Query Loop + 7 SitesRefactor code, run testsProcess orders, handle refunds, update inventory, customer supportTool Registryfile_edit, git, cargo testcheck_stock, process_payment, update_order_status, send_invoiceMemory & Self-HealingSkeptical MEMORY.md indexOrder history, customer preferences, inventory snapshotsMulti-Agent CoordinatorSpawn verifier in git worktreeSpawn “Finance Agent”, “Logistics Agent”, “Support Agent”KAIROS DaemonBackground “anything worth doing?”Background stock check, payment reconciliation, abandoned cart
The 7 continue sites become extremely valuable here because business operations have real money and reputation at stake:

Site 1 (Permission Gate) → “Is this customer allowed to request a refund over ₹10,000?”
Site 4 (Critic) → “Does this order change affect inventory or accounting?”
Site 3 (Memory Verification) → “Does the current stock in DB still match what we told the customer yesterday?”

Real-World Commerce Flow Example (Using WhatsApp)
Customer sends on WhatsApp:
“Hey, I ordered shirt XYZ yesterday but want to change size to Large and add one more.”
Full cycle using the framework:

Input / Trigger Layer (Gateway receives WhatsApp message)
→ Normalizes into clean TriggerEvent (session = customer_98765, channel = whatsapp).
Context Assembly
Loads Business Rules.md (“Refunds under ₹5k auto-approved, size changes allowed within 48h, always verify stock before promising”)
Loads MEMORY.md index (“Customer 98765: previous order #ORD-4452, preferred size M, no prior complaints”)
Pulls live order from DB + current inventory for shirt XYZ
Adds recent chat history with this customer

Core Query Loop starts (with 7 sites)
First LLM call: Model outputs structured thinking + tool calls
Site 1 Permission: “Size change allowed? Yes. Adding item? Check stock first.”
Site 2 Tool Execution: get_order(ORD-4452), check_stock(shirt_XYZ_Large)
Site 3 Memory Verification: “Stock in DB matches what we told customer yesterday? Yes.”
Site 4 Critic: “Any accounting impact? No. Customer happiness risk? Low.”
Site 2 again: update_order(ORD-4452, new_size=Large, add_qty=1)
Site 5 Compaction: Summarize old history
Site 7: Streams friendly response back to WhatsApp: “Done! Your order #ORD-4452 updated to Large +1 qty. New total ₹2,850. Delivery in 3 days.”


The customer gets a natural chat reply, but behind the scenes the full agentic loop with safety checkpoints ran.
The KAIROS daemon can run in background:

Every 30 minutes check for abandoned carts across all customers
Every night reconcile payments and update inventory
Proactively message customers when stock is low on their favorite items

Why This Works Extremely Well for Businesses

Messaging channels (WhatsApp Business API, Telegram Bot, RCS) are already the preferred way customers talk to Indian businesses.
The structured output + 7 sites give you auditability and safety — every action (order change, refund, inventory update) goes through permission + critic + memory verification.
Multi-agent swarms let you have specialized agents: one for support, one for logistics, one for finance — all coordinated by the main loop.
You can start simple (only WhatsApp + basic order tools) and grow to full “autonomous commerce OS”.

This is already happening in 2026 — many D2C brands and small commerce players are using OpenClaw-style gateways + Claude-style orchestration to run significant portions of their operations via chat.

Core Query Loop – High-Level Architecture
The Core Query Loop is a while(true) async state machine (implemented as an async generator in the leaked TypeScript).
Its job is simple but powerful:

Take the ContextPackage from Subsystem #2
Call the LLM once
Parse the response
Route through the necessary continue sites (safety, execution, verification, etc.)
Decide whether to loop back or finish

It repeats this cycle until the task is complete or the user stops it.
Key Insight:
The loop itself is deterministic (written in code). The LLM only provides “intent” (thinking + tool calls or final answer). The state machine turns that intent into safe, observable, self-healing actions.
The Full Cycle (One Iteration)
Here is exactly what happens in one pass through the loop:

Receive fresh ContextPackage (from Context Assembly — rules, MEMORY.md index, git status, Tree-sitter summary, etc.)
Make one LLM call (streaming or full response) with the strict system prompt that forces structured output.
Response Parser analyses the output and extracts:
<thinking> block (for progress)
Any <tool_call> blocks
<final_answer> block (if present)

State Machine Routing (deterministic if-then logic — not AI):
If <final_answer> → go to Site 7 → finish
If <tool_call>s → go through Sites 1–6 as needed
If only thinking → go to Site 7 → loop back

Execute the chosen Continue Sites (in logical order)
Site 7 (Output & Loop Decision):
Stream progress to user (terminal or chat)
Decide: loop back to Step 1 (new Context Assembly) OR exit the loop


This cycle can repeat 5–50+ times for a complex task. Each iteration gets a fresh context, so the agent stays up-to-date.
Concrete Example: Your Refactor Task Step-by-Step
Task: “Refactor the memory module in my Rust agent to use redb instead of sled...”
Iteration 1

Context Assembly gives: CLAUDE.md rules + MEMORY.md index (“still using sled”) + git status + Tree-sitter summary of src/memory.rs
LLM call → outputs:text<thinking>I need to see the current code before planning the refactor.</thinking>
<tool_call name="read_file"><parameter name="path">src/memory.rs</parameter></tool_call>
<tool_call name="tree_sitter_query"><parameter name="query">sled</parameter></tool_call>
Parser sees: two tool calls → no final_answer
Routing:
Site 1 (Permission Gate): “read_file and tree_sitter_query allowed?” → Yes
Site 2 (Tool Execution): Runs both tools → returns file content + list of sled usages with line numbers
Site 3 (Memory Verification): Checks if MEMORY.md still matches disk → yes
Site 4 (Critic): Low risk
Site 5 (Compaction): Not needed yet
Site 7: Streams “Reading memory module…” to you → loops back for Iteration 2


Iteration 2

New Context Assembly (now includes the tool results from Iteration 1)
LLM call → outputs thinking + plan + more tool calls for editing
Routing:
Site 1 → OK
Site 2 → executes surgical file edits using Tree-sitter ranges
Site 3 → verifies the edits landed correctly on disk
Site 4 → Critic checks for upstream breakage (e.g., KAIROS daemon calls)
Site 6 → Possibly hands off to a verifier sub-agent
Site 7 → Streams progress → loops back


Iteration 3 (Final)

LLM call → outputs:text<thinking>All changes done, tests passed.</thinking>
<final_answer>Refactor complete. Switched to redb with persistence and auto-compaction.</final_answer>
Parser sees final_answer → skips most sites
Site 7 → Streams clean summary to you + exits the loop

This is how the agent feels “continuous and intelligent” — even though each LLM call is just one shot, the loop + parser + sites create the step-by-step behavior.
How the State Machine Decides Order (Deterministic Part)
The routing is pure code (not LLM). Typical logic (from leak patterns):

If final_answer present → Site 7 only
Else if tool_calls present:
Always start with Site 1 (Permission)
Then Site 2 (Execute tools)
Then conditionally:
Site 3 if memory/files were involved
Site 4 if any write/edit happened
Site 5 if token count high
Site 6 if task looks complex

End with Site 7 (decide loop or finish)


The order is fixed by the state machine for safety. You can’t skip permission or critic for destructive actions.

