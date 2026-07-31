import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
// Gallery changelog, fetched at build time by scripts/fetch-changelog.mjs.
import CHANGELOG from "./changelog.json";

// Data current as of June 2026. Compiled from public provider docs, model cards,
// and third-party architecture analyses. "—" = not publicly disclosed / N/A.
const MODELS = [
  // ---- July 2026 wave (added after original build) ----
  { name: "Sarvam 105B", provider: "Sarvam AI", released: "2026/03", type: "Mid", arch: "Sparse MoE", params: "105B", active: "10.3B",
    attn: "MLA (Multi-head Latent Attn)", modality: "Text", context: 131072, maxOut: null, license: "Apache 2.0", open: true, intel: 12,
    training: [
      { label: "Pre-training", tokens: "12T", detail: "Trained from scratch on 12T tokens — notably fewer than the smaller 30B sibling's 16T. Corpus spans code, general web, specialised knowledge corpora, mathematics and multilingual content, with a substantial share of the budget allocated to the 10 most-spoken Indian languages. Run in three phases: long-horizon pre-training, mid-training, then a long-context extension phase." },
      { label: "SFT", tokens: null, detail: "Supervised fine-tuning on a large corpus of prompts curated for difficulty, quality and domain diversity, topped up with synthetic prompts generated from the pre-training domain mixture to fill underrepresented areas. Prompts are pre-filtered with open-source models and early checkpoints to drop anything trivially solvable or consistently unsolved, keeping the curriculum effective." },
      { label: "RL", tokens: null, detail: "Reinforcement learning as the final stage; Sarvam describes both models as reasoning models trained on in-house curated data at every stage. Specific RL algorithm and token budget not disclosed." },
    ],
    note: "India's flagship open model, from Sarvam AI. 105B total / 10.3B active (9.8%) across 32 MLA layers \u2014 the larger Sarvam switches from GQA to Multi-head Latent Attention with KV LayerNorm and a NoPE + RoPE mix. Large vocabulary tuned for Indic languages. Apache 2.0. Architecture verified from its config.json via Raschka's gallery." },
  { name: "Sarvam 30B", provider: "Sarvam AI", released: "2026/03", type: "SLM", arch: "Sparse MoE", params: "30B", active: "2.4B",
    attn: "Grouped-query attention", modality: "Text", context: 131072, maxOut: null, license: "Apache 2.0", open: true, intel: 7,
    training: [
      { label: "Pre-training", tokens: "16T", detail: "Trained on 16T tokens — more than the larger 105B model's 12T, an unusual inversion. Same corpus recipe: code, general web, specialised knowledge, mathematics and multilingual data with heavy weighting toward the 10 most-spoken Indian languages, across three phases (long-horizon pre-training, mid-training, long-context extension)." },
      { label: "SFT", tokens: null, detail: "Supervised fine-tuning on prompts curated for difficulty, quality and domain diversity, augmented with synthetic prompts drawn from the pre-training mixture. Trivially solvable and consistently unsolved prompts are filtered out using open-source models and early checkpoints." },
      { label: "RL", tokens: null, detail: "Final reinforcement-learning stage on in-house curated data. Algorithm and token budget not disclosed." },
    ],
    note: "The smaller of Sarvam AI's pair of Indian-language models: 30B total but only 2.4B active (8%) over 19 GQA layers with QK-Norm. Reasoning-oriented sparse MoE with a large vocabulary for strong Indic coverage. Among the cheapest models on the Artificial Analysis leaderboard." },
  { name: "Kimi K2.6", provider: "Moonshot", released: "2026/04", type: "Frontier", arch: "Sparse MoE", params: "1T", active: "32B",
    attn: "MLA (Multi-head Latent Attn)", modality: "Text + vision", context: 256000, maxOut: null, license: "Modified MIT", open: true, intel: 44, training: null,
    note: "K3's immediate predecessor and still a strong open model. Keeps the K2/K2.5 DeepSeek-style backbone unchanged \u2014 1T total, 32B active (3.2%), 61 MLA layers, 384 experts \u2014 with gains coming from the multimodal and agentic training recipe rather than architecture. Note the contrast with K3, which broke from MLA to the KDA hybrid." },
  { name: "GLM-5.1", provider: "Zhipu", released: "2026/04", type: "Frontier", arch: "Sparse MoE", params: "744B", active: "40B",
    attn: "MLA + DeepSeek Sparse Attn", modality: "Text + vision", context: 202752, maxOut: null, license: "MIT", open: true, intel: 40, training: null,
    note: "The middle release in Zhipu's fast GLM-5 cadence (5 in Feb, 5.1 in Apr, 5.2 in Jun 2026). Architecture is identical to GLM-5 \u2014 744B/40B, 78 MLA layers with DeepSeek Sparse Attention, MTP-capable \u2014 with the entire gain coming from post-training aimed at long-horizon agentic coding." },
  { name: "Laguna XS.2", provider: "Poolside", released: "2026/04", type: "SLM", arch: "Sparse MoE", params: "33B", active: "3B",
    attn: "Sliding-window + global", modality: "Text", context: 131072, maxOut: null, license: "Apache 2.0", open: true, intel: null,
    training: [
      { label: "Pre-training", tokens: ">30T", detail: "Both Laguna models are trained from scratch as MoEs on more than 30T tokens drawn from web, code and synthetic sources.",
        curriculum: "The mixture was fitted empirically rather than hand-tuned: roughly 60 proxy models of ~0.5B parameters were each trained on ~60B tokens sampled from different mixtures across a corpus spanning more than 50 heterogeneous dataset groups — general web, curated educational text, academic papers, raw code, grounded code and synthetic sources — and the resulting surrogate was optimised to pick the final blend. Poolside notes that optimal mixture design at a 30T-token horizon differs materially from short-horizon recipes, since repeat exposure and diversity trade off differently under long training. Web data passes a conservative filter that removes pure noise while preserving recall, narrowing a ~13T-token candidate pool through scoring, ranking and quota-controlled bucketing." },
      { label: "Long-context", tokens: "200B", detail: "Starts from the end-of-decay checkpoint and splits into two equal 100B-token sub-stages: the first extends context to 32K, the second to 128K. YaRN is applied to the global attention layers only, both sub-stages share a 24M-token global batch, and the learning rate follows a cosine decay." },
      { label: "Mid-training", tokens: "~60B", detail: "The largest post-training stage by unique token count — a deliberately broad instruction mix of general chat, explicit reasoning traces and repository-level agentic coding, so the model keeps conversational ability while learning tool use and terminal work." },
      { label: "SFT", tokens: "3 × ~40B", detail: "Three epochs of roughly 40B tokens each with early stopping on eval scores, reusing mid-training's batch size, sequence length, packing, schedule and optimiser.",
        curriculum: "Four components by token share: agentic coding without reasoning at ~30% (single-turn trajectories from an open-source teacher model); the same sample count and source distribution again but augmented with reasoning traces, which swells to ~45% of tokens; a small agentic mathematics corpus at ~3%, filtered for verifiability so only numeric-answer problems remain and easy items are dropped by solve rate against open-weight LLMs; and ~22% non-agentic samples included specifically to stop the model forgetting general capability. On top of this sits 1.3B tokens of multi-harness agentic trajectories from OpenHands, OpenCode and Mini-SWE-Agent, collected with each harness's native behaviour deliberately preserved — custom subagent spawning, context compaction and planning scaffolds included." },
      { label: "RL", tokens: null, detail: "Online reinforcement learning with CISPO, using verifiable rewards only." },
    ],
    note: "The earlier Laguna small model (April 2026), distinct from the July XS 2.1 refresh. 33B total / 3B active (9.1%) over 30 sliding-window + 10 global layers, using gated GQA with QK-Norm, per-layer query-head counts (\u2018attention budgeting\u2019), a 512-token local window, sigmoid MoE routing and 1 shared plus top-8 routed experts. Apache 2.0 here, unlike the OpenMDW licence on the 2.1 releases." },
  { name: "Gemma 4 26B-A4B", provider: "Google", released: "2026/04", type: "SLM", arch: "Sparse MoE", params: "25.2B", active: "3.8B",
    attn: "Sliding-window + global", modality: "Text + vision", context: 256000, maxOut: 8192, license: "Apache 2.0", open: true, intel: 26, training: null,
    note: "The sparse sibling of the dense Gemma 4 31B: 25.2B total with 3.8B active (15.1%), using 128 experts of which 8 are routed plus 1 shared per token. Keeps the family's 5:1 sliding-window/global attention backbone with QK-Norm, unified K/V and p-RoPE on global layers, swapping only the dense FFNs for MoE layers. 25 sliding-window + 5 global layers, 262k vocabulary." },
  { name: "Claude Opus 5", provider: "Anthropic", released: "2026/07", type: "Frontier", arch: "Undisclosed", params: "\u2014", active: "\u2014",
    attn: "Undisclosed", modality: "Text + vision", context: 1000000, maxOut: 128000, license: "Proprietary", open: false, intel: 60, training: null,
    note: "Anthropic's new Opus-tier flagship, shipped 24 July 2026, succeeding Opus 4.8. Adds an 'xhigh' reasoning-effort mode and a Fast mode (~2.5x speed at 2x price). Positioned just below the Mythos-class Fable 5 \u2014 reported near-Fable intelligence at roughly half the cost. Architecture, parameters and training remain undisclosed, as with the rest of the Claude line. Intelligence figure reflects Artificial Analysis's own framing of Opus 5 as 'Fable 5 level intelligence at a lower cost per task' — the leaderboard snapshot checked had added Opus 5 evaluations but not yet a separate Index row, so treat 60 as provisional." },
  { name: "Claude Sonnet 5", provider: "Anthropic", released: "2026/06", type: "Mid", arch: "Undisclosed", params: "\u2014", active: "\u2014",
    attn: "Undisclosed", modality: "Text + vision", context: 1000000, maxOut: 64000, license: "Proprietary", open: false, intel: 53, training: null,
    note: "Sonnet tier crossed to 5 on 30 June 2026, becoming Anthropic's default high-volume workhorse. Roughly 63% on SWE-bench Pro against Opus 5's 79%, at about 0.6x the price. No architecture or training disclosure." },
  { name: "GPT-5.6 Sol", provider: "OpenAI", released: "2026/07", type: "Frontier", arch: "MoE (reported)", params: "\u2014", active: "\u2014",
    attn: "Undisclosed", modality: "Text + vision + audio", context: 1000000, maxOut: 128000, license: "Proprietary", open: false, intel: 59, training: null,
    note: "Top variant of the GPT-5.6 family (9 July 2026), which ships three fixed tiers: Luna, Terra, Sol. Artificial Analysis reports Sol at roughly Fable 5's intelligence for about a third of the cost, and leading its Coding Agent Index at ~80. Token-efficient: ~15k tokens per Index task vs GPT-5.5's 16k. Architecture undisclosed." },
  { name: "GPT-5.6 Terra", provider: "OpenAI", released: "2026/07", type: "Frontier", arch: "MoE (reported)", params: "\u2014", active: "\u2014",
    attn: "Undisclosed", modality: "Text + vision", context: 1000000, maxOut: 128000, license: "Proprietary", open: false, intel: 55, training: null,
    note: "Middle tier of the GPT-5.6 family \u2014 OpenAI's intended production default. Reported to land just above Claude Fable 5 on the Artificial Analysis Coding Agent Index while sitting below Sol. No separate Intelligence Index figure published." },
  { name: "GPT-5.6 Luna", provider: "OpenAI", released: "2026/07", type: "Mid", arch: "MoE (reported)", params: "\u2014", active: "\u2014",
    attn: "Undisclosed", modality: "Text + vision", context: 1000000, maxOut: 128000, license: "Proprietary", open: false, intel: 51, training: null,
    note: "Cheapest, highest-volume tier of the GPT-5.6 family. Reported to outperform Claude Opus 4.8 on the Coding Agent Index despite the lower tier. Along with Sol it sits on Artificial Analysis's intelligence-vs-cost Pareto frontier (Terra does not)." },
  { name: "Grok 4.5", provider: "xAI", released: "2026/07", type: "Frontier", arch: "MoE (reported)", params: "\u2014", active: "\u2014",
    attn: "Sparse + long-context", modality: "Text + vision", context: 500000, maxOut: null, license: "Proprietary", open: false, intel: 54, training: null,
    note: "xAI's flagship as of 8 July 2026, trained in partnership with Cursor and aimed at coding, agentic tool calling and knowledge work. 500K context \u2014 notably smaller than the 2M window of Grok 4.3 \u2014 with configurable reasoning and ~80 tok/s serving. Architecture undisclosed." },
  { name: "Kimi K3", provider: "Moonshot", released: "2026/07", type: "Frontier", arch: "Hybrid: KDA + MoE", params: "2.8T", active: "104.2B",
    attn: "KDA + full attn (69:24)", modality: "Text + image + video", context: 1048576, maxOut: 131072, license: "Kimi K3 License", open: true, intel: 57,
    training: [
      { label: "Pre-training", tokens: null, detail: "Natively multimodal: text and vision jointly optimised from step one rather than grafting a ViT onto a finished LLM, with visual and textual tokens interleaved under one next-token objective. Per-Head Muon optimiser with K2's weight clipping, Quantile Balancing for MoE load balance, cosine LR with 1% warmup, weight decay 0.1. No token budget disclosed.",
        curriculum: "Four text domains — Web Text, Code, Mathematics and Knowledge — plus a large vision corpus. Each domain passes rule-based heuristics, classifier-based quality scoring and deduplication, with per-domain sampling rates fixed by ablation studies on smaller proxy models. Knowledge and mathematics are rephrased using K2's recipe: style- and perspective-diverse prompting, chunk-wise autoregressive generation, and fidelity verification against the source document. The vision corpus follows K2.5's taxonomy — captions, interleaved image–text documents, OCR, perception, video and visual coding — with coordinate supervision given in both absolute and normalised [0,1] form for resolution-robust localisation, and heavily scaled programmatic data pairing code with its rendered output across SVG, 3D assets, webpages, games and CAD schematics." },
      { label: "Context 8K \u2192 64K", tokens: null, detail: "First half of a four-stage context curriculum: training starts at an 8K window and is extended to 64K in a later pre-training phase, keeping costly long-sequence compute to a small fraction of the budget." },
      { label: "Cooldown 256K \u2192 1M", tokens: null, detail: "Second half of the curriculum, run during cooldown. NoPE \u2014 no explicit positional embedding \u2014 so position is carried implicitly by KDA's recurrent gating and decay, letting the model reach 1M tokens with no RoPE rescaling or interpolation.",
        curriculum: "Natural long documents and video carry a lot of junk \u2014 near-duplicates, binary blobs, truncated files, invalid machine-generated logs \u2014 so they run through a dedicated pipeline of exact and fuzzy deduplication, perceptual hashing over video frames, heuristic and classifier-based quality filtering, and structural validation. Because genuinely long, coherent sources are scarce next to short text, they are upsampled so the long-context distribution is not drowned out during cooldown. Length alone does not teach long-range reasoning, so Moonshot also synthesises long-context data by permuting and concatenating multimodal documents and sub-tasks such that the embedded task can only be solved by attending to information scattered across the full 1M window \u2014 training attention at the intended scale instead of letting it collapse into local patterns." },
      { label: "SFT", tokens: null, detail: "Cold-start policy for RL. Trajectories synthesised by domain-specialised models from earlier Kimi releases, then multi-stage verification and human-in-the-loop annotation, serialised with Moonshot's XTML chat template. Quantisation-aware training begins here and runs through the rest of post-training, with MXFP4 weights and MXFP8 activations." },
      { label: "RL", tokens: null, detail: "Scaled across three domains \u2014 general tasks, general agents and coding agents \u2014 crossed with three reasoning-effort levels (low/high/max), yielding nine separate expert models. Uses a partial-rollout scheme that advances once a fraction of trajectories finish, with per-token regularisation absorbing the resulting off-policy staleness. Non-verifiable tasks are scored by an Agentic Generative Reward Model that must write a rubric before scoring, with budget-based verbosity control to curb reward hacking." },
      { label: "MOPD", tokens: null, detail: "Multi-Teacher On-Policy Distillation consolidates the nine domain \u00d7 effort experts back into a single unified model, so one set of weights retains the specialised behaviour at each reasoning effort." },
    ],
    note: "The largest open-weight model yet at 2.8T parameters \u2014 the first 'open 3T-class' model, taking the crown from DeepSeek V4 Pro's 1.6T. Extremely sparse: only 16 of 896 routed experts fire per token, giving 104.2B activated parameters (3.7% of the network), managed by a Stable LatentMoE framework. Built on Kimi Delta Attention (KDA), a hybrid linear attention interleaving 69 KDA layers with 24 full-attention MLA layers across 93 layers total, cutting KV-cache memory up to 75% and decoding up to 6x faster at 1M context. Attention Residuals (AttnRes) replace standard residual connections, letting each layer selectively retrieve representations from arbitrary earlier layers. Moonshot reports ~2.5x the scaling efficiency of K2. Weights shipped 27 July 2026 under the Kimi K3 License; the tech report concedes it still trails Claude Fable 5 and GPT-5.6 Sol overall." },
  { name: "GLM-5.2", provider: "Zhipu", released: "2026/06", type: "Frontier", arch: "Sparse MoE", params: "744B", active: "40B",
    attn: "DSA + MLA (IndexShare)", modality: "Text + vision", context: 1000000, maxOut: 128000, license: "MIT", open: true, intel: 51, training: null,
    note: "Third release in Zhipu's fast GLM-5 cadence (GLM-5 Feb, 5.1 Apr, 5.2 Jun 2026). ~753B total with ~40B active (256 routed experts, 8 per token). Uses DeepSeek-style sparse attention with MLA KV-cache compression plus IndexShare, which Zhipu reports cuts per-token FLOPs 2.9x at 1M context. MIT licensed with no regional restrictions. Shipped days after the US export clampdown on Anthropic's Fable/Mythos models." },
  { name: "Inkling", provider: "Thinking Machines", released: "2026/07", type: "Frontier", arch: "Sparse MoE", params: "975B", active: "41B",
    attn: "Undisclosed", modality: "Text + image + audio", context: 1000000, maxOut: null, license: "Apache 2.0", open: true, intel: 41, training: null,
    note: "First open-weights model from Thinking Machines Lab (Mira Murati's startup), released 15 July 2026. 975B total / 41B active MoE, Apache 2.0. Accepts text, image and audio but emits text only. Explicitly designed as a base for fine-tuning rather than a benchmark winner \u2014 it ships an 'effort dial' (0.2\u20130.99) instead of fixed tiers. Trails GLM-5.2 and Kimi on terminal-agent coding; SimpleQA Verified of 43.9% lags the closed flagships badly, so pair it with RAG for factual work. An Inkling-Small preview also exists." },
  { name: "Laguna S 2.1", provider: "Poolside", released: "2026/07", type: "Mid", arch: "Sparse MoE", params: "118B", active: "8B",
    attn: "Sliding-window + global", modality: "Text", context: 1048576, maxOut: null, license: "OpenMDW-1.1", open: true, intel: null, training: [{ label: "Pre-training", tokens: "30T", detail: "Began 22 May 2026 on 4,096 NVIDIA H200 GPUs; the full run took under nine weeks. Knowledge cutoff November 2025." }, { label: "Post-training", tokens: null, detail: "Reinforcement learning from code-execution feedback \u2014 Poolside's core method, letting the model learn from its own successes and failures. Separate thinking / non-thinking modes." }],
    note: "Poolside's agentic-coding specialist: 118B total, only 8B active per token across 256 routed experts (top-10) plus 1 shared, over 48 layers. Mixed global/sliding-window attention with a 1M-token window (256K on the free tier). Scores 70.2% on Terminal-Bench 2.1, matching or beating open models several times its size. NVFP4 weights are ~59GB, so it fits on a single NVIDIA DGX Spark. Poolside publishes full evaluation trajectories \u2014 unusually transparent." },
  { name: "Laguna XS 2.1", provider: "Poolside", released: "2026/07", type: "SLM", arch: "Sparse MoE", params: "33B", active: "3B",
    attn: "Sliding-window + global", modality: "Text", context: null, maxOut: null, license: "OpenMDW-1.1", open: true, intel: null, training: null,
    note: "The small end of Poolside's Laguna line: 33B total / 3B active MoE with a 100,352-token vocabulary, published to Hugging Face 2 July 2026. Supports optional thinking, tool calls and preserved reasoning content. Context window not stated in the model card sources checked \u2014 the sibling Laguna M.1 is 262K. Runs on consumer GPUs when quantized." },
  // ---- Frontier / flagship (proprietary) ----
  { name: "Claude Fable 5", provider: "Anthropic", released: "2026/06", type: "Frontier", arch: "Undisclosed", params: "—", active: "—",
    attn: "Undisclosed", modality: "Text + vision", context: 1000000, maxOut: 128000, license: "Proprietary", open: false, intel: 60, training: null,
    note: "Anthropic's Mythos-class flagship. Architecture undisclosed. Like all frontier closed models it is a decoder-only transformer at its core, but parameter counts, expert layout, and attention scheme are unpublished. Shares the long-context (1M) design goal of the Opus line with extra max-output headroom." },
  { name: "Claude Opus 4.8", provider: "Anthropic", released: "2026/05", type: "Frontier", arch: "Undisclosed", params: "—", active: "—",
    attn: "Undisclosed", modality: "Text + vision", context: 1000000, maxOut: 64000, license: "Proprietary", open: false, intel: 56, training: null,
    note: "Dense-vs-MoE split unconfirmed. Anthropic publishes no parameter or architecture details. Differentiates on post-training (reasoning, tool use, safety) rather than disclosed structural innovations. 1M context with no long-context price tiering." },
  { name: "Claude Sonnet 4.6", provider: "Anthropic", released: "2026/02", type: "Frontier", arch: "Undisclosed", params: "—", active: "—",
    attn: "Undisclosed", modality: "Text + vision", context: 1000000, maxOut: 64000, license: "Proprietary", open: false, intel: 34, training: null,
    note: "Mid-flagship tier. Same undisclosed-architecture posture as the rest of the Claude family; added a 1M-token window this generation. Optimized for latency/cost balance against Opus." },
  { name: "Claude Haiku 4.5", provider: "Anthropic", released: "2025/10", type: "Mid", arch: "Undisclosed", params: "—", active: "—",
    attn: "Undisclosed", modality: "Text + vision", context: 200000, maxOut: 64000, license: "Proprietary", open: false, intel: 30, training: null,
    note: "Smallest, fastest Claude tier. 200K window (not 1M) is the main structural difference from its larger siblings. Architecture unpublished." },
  { name: "GPT-5.5", provider: "OpenAI", released: "2026/04", type: "Frontier", arch: "MoE (reported)", params: "—", active: "—",
    attn: "Undisclosed", modality: "Text + vision + audio", context: 922000, maxOut: 128000, license: "Proprietary", open: false, intel: 55, training: null,
    note: "Widely reported to be a sparse Mixture-of-Experts, but OpenAI publishes no counts or routing. Natively multimodal, hybrid reasoning model with adjustable thinking effort. 128K max output is among the highest of the closed flagships." },
  { name: "GPT-5 mini", provider: "OpenAI", released: "2025/08", type: "Mid", arch: "MoE (reported)", params: "—", active: "—",
    attn: "Undisclosed", modality: "Text + vision", context: 400000, maxOut: 64000, license: "Proprietary", open: false, intel: null, training: null,
    note: "Distilled/smaller sibling of the GPT-5 line for high-volume, latency-sensitive work. Architecture undisclosed; assumed to share the family's MoE lineage at reduced scale." },
  { name: "Gemini 3.1 Pro", provider: "Google", released: "2026/02", type: "Frontier", arch: "MoE (reported)", params: "—", active: "—",
    attn: "Sparse + long-context", modality: "Text + vision + audio + video", context: 1000000, maxOut: 64000, license: "Proprietary", open: false, intel: 46, training: null,
    note: "Sparse MoE per Google's earlier Gemini disclosures; exact counts unpublished. The most fully multimodal flagship (native video). Largest hosted context at 2M, with tiered pricing above 200K. Same lineage as the open Gemma models but at far larger scale." },
  { name: "Gemini 3.5 Flash", provider: "Google", released: "2026/05", type: "Mid", arch: "MoE (reported)", params: "—", active: "—",
    attn: "Sparse + long-context", modality: "Text + vision + audio", context: 1000000, maxOut: 64000, license: "Proprietary", open: false, intel: 50, training: null,
    note: "Speed-optimized Gemini tier. 1M context, very high throughput. Shares the family's sparse architecture at smaller effective compute." },
  { name: "Grok 4.3", provider: "xAI", released: "2026/04", type: "Frontier", arch: "MoE (reported)", params: "—", active: "—",
    attn: "Sparse + long-context", modality: "Text + vision", context: 1000000, maxOut: 64000, license: "Proprietary", open: false, intel: 38, training: null,
    note: "Reported MoE; xAI publishes little structural detail. Ties Gemini for the largest hosted window (2M). Emphasis on long-context retrieval and tool use." },

  // ---- Frontier-class open weights ----
  { name: "DeepSeek V4 Pro", provider: "DeepSeek", released: "2026/04", type: "Frontier", arch: "Sparse MoE", params: "1.6T", active: "49B",
    attn: "Hybrid: CSA + HCA", modality: "Text + image + video + audio", context: 1048576, maxOut: 384000, license: "MIT", open: true, intel: 44, training: [{ label: "Pre-training", tokens: "32T+", detail: "Diverse, filtered high-quality tokens; Muon optimizer, mHC residual connections, anticipatory routing for MoE stability." }, { label: "Context extension", tokens: null, detail: "Two-stage long-context extension to the 1M window (token count not separately broken out)." }, { label: "Specialist SFT + RL", tokens: null, detail: "Independent domain experts (math, code, agent, instruction) each get SFT then GRPO with domain reward signals." }, { label: "On-policy distillation", tokens: null, detail: "A single student model distills from 10+ specialist teachers on its own rollouts (OPD), merging skills into one model." }],
    note: "61 layers, 384 routed experts + 1 shared, 6 active per token, so only 49B of 1.6T params fire per token. Hybrid attention interleaves Compressed Sparse Attention (4x KV compression + FP4 'lightning indexer' top-k selection) with Hierarchical Chunked Attention, plus manifold-constrained hyper-connections (mHC) replacing the standard residual stream. 384K max output is 3-6x its peers." },
  { name: "DeepSeek V4 Flash", provider: "DeepSeek", released: "2026/04", type: "Mid", arch: "Sparse MoE", params: "284B", active: "13B",
    attn: "Hybrid: CSA + HCA", modality: "Text + image", context: 1048576, maxOut: 128000, license: "MIT", open: true, intel: 40, training: [{ label: "Pre-training", tokens: "32T+", detail: "DeepSeek reports a single '>32T tokens' figure covering both Pro and Flash; no separate Flash count is published." }, { label: "Context extension", tokens: null, detail: "Long-context extension to 1M; even lower FLOPs/KV than Pro." }, { label: "Specialist SFT + RL", tokens: null, detail: "Per-domain SFT + GRPO, same two-stage paradigm as Pro." }, { label: "On-policy distillation", tokens: null, detail: "Multi-teacher OPD into the unified student." }],
    note: "Shares V4 Pro's attention stack and mHC design at a quarter the scale: 284B total, 13B active. The cheapest frontier-class model to run. Same 1M window, lower max output." },
  { name: "Qwen3.5-Plus", provider: "Alibaba", released: "2026/02", type: "Frontier", arch: "Hybrid: Gated DeltaNet + MoE", params: "397B", active: "17B",
    attn: "Gated DeltaNet + gated attn", modality: "Text + vision + audio + video", context: 262144, maxOut: 64000, license: "Apache 2.0", open: true, intel: 34, training: [{ label: "Pre-training S1", tokens: "~30T", detail: "Qwen3.5's own token counts aren't published; figures shown are the Qwen3 report's recipe — general corpus across many languages." }, { label: "Pre-training S2", tokens: "~5T", detail: "High-quality 4K-sequence tokens; upweights STEM, code, reasoning, synthetic data (Qwen3 figure)." }, { label: "Long-context", tokens: null, detail: "Long-context stage (mix of 16-32K and 4-16K sequences)." }, { label: "Post-training", tokens: null, detail: "SFT + RL alignment with thinking/non-thinking modes." }],
    note: "397B-A17B built on the Qwen3-Next lineage: a 3:1 hybrid of Gated DeltaNet (linear attention) and gated full-attention layers (every 4th layer is full attention), over a sparse MoE. ~250K-token vocabulary and 201-language coverage — the broadest of any open model. Native video + audio." },
  { name: "Qwen3.6 Plus", provider: "Alibaba", released: "2026/03", type: "Frontier", arch: "Hybrid: Gated DeltaNet + MoE", params: "—", active: "—",
    attn: "Gated DeltaNet + gated attn", modality: "Text + vision", context: 1000000, maxOut: 65536, license: "Proprietary (API)", open: false, intel: 40, training: [{ label: "Pre-training", tokens: null, detail: "Qwen3.6 generation; token budget unpublished. Adopts the Qwen3-Next hybrid attention line (Gated DeltaNet) into the main Qwen series." }, { label: "Long-context", tokens: null, detail: "Native 1M-token window (up from 262K in the 27B), multi-token prediction." }, { label: "Post-training", tokens: null, detail: "SFT + RL; reduced overthinking on simple tasks, more reliable agent behavior." }],
    note: "API-only flagship preview of the Qwen3.6 family. Switches the main line to a Gated DeltaNet hybrid (3x Gated DeltaNet→FFN, 1x gated attention→FFN repeating), tuned for agentic coding and long-document reasoning. 1M native context, 64K max output." },
  { name: "Qwen3.7 Max", provider: "Alibaba", released: "2026/05", type: "Frontier", arch: "Hybrid: Gated DeltaNet + MoE", params: "—", active: "—",
    attn: "Gated DeltaNet + gated attn", modality: "Text", context: 1000000, maxOut: 65536, license: "Proprietary (API)", open: false, intel: 46, training: [{ label: "Pre-training", tokens: null, detail: "Architecture and token counts not published as of June 2026; reported to build on the Qwen3.6 Gated DeltaNet hybrid with updated expert routing." }, { label: "Long-context", tokens: null, detail: "1M-token window carried over from Qwen3.6 Plus (991.8K max input / 65.5K max output per the model card)." }, { label: "Post-training", tokens: null, detail: "Agent-tuned RL; native extended-thinking mode, sustained multi-hour / 1000+ tool-call runs." }],
    note: "Alibaba's agent-first proprietary flagship (text-only). AA Intelligence Index 56.6 — the highest-ranked Chinese model on the index — and demonstrated 35-hour autonomous runs. Speaks the Anthropic Messages protocol natively. No open weights. Treat architecture as reported, not confirmed." },
  { name: "Qwen3.7 Plus", provider: "Alibaba", released: "2026/05", type: "Mid", arch: "Hybrid: Gated DeltaNet + MoE", params: "—", active: "—",
    attn: "Gated DeltaNet + gated attn", modality: "Text + vision", context: 1000000, maxOut: 65536, license: "Proprietary (API)", open: false, intel: 39, training: [{ label: "Pre-training", tokens: null, detail: "Undisclosed; same Qwen3.7 generation backbone as Max with multimodal input." }, { label: "Post-training", tokens: null, detail: "RL alignment; vision-capable endpoint of the 3.7 line (Vision Arena #16)." }],
    note: "The multimodal sibling of Qwen3.7 Max — adds vision input. API-only preview as of May 2026; architecture reported to mirror Max. No open weights yet." },
  { name: "MiniMax M3", provider: "MiniMax", released: "2026/06", type: "Frontier", arch: "Sparse MoE", params: "428B", active: "—",
    attn: "MSA sparse attention", modality: "Text + image + video", context: 1000000, maxOut: 64000, license: "Proprietary", open: false, intel: 44, training: null,
    note: "Uses MiniMax Sparse Attention (MSA) for its 1M window. Multimodal across text/image/video. Pricing doubles past 512K input tokens." },
  { name: "Llama 4 Scout", provider: "Meta", released: "2025/04", type: "Mid", arch: "Sparse MoE", params: "109B", active: "17B",
    attn: "iRoPE (interleaved RoPE/NoPE)", modality: "Text + vision", context: 10000000, maxOut: 32000, license: "Llama 4 Community", open: true, intel: 10, training: [{ label: "Pre-training", tokens: "~40T", detail: "Multimodal (text+image+video) via early fusion; 256K pretraining context; cutoff Aug 2024." }, { label: "Mid-training", tokens: null, detail: "Long-context extension with specialized datasets + iRoPE tricks unlocking the 10M window." }, { label: "Post-training", tokens: null, detail: "SFT, then RL; distillation from larger Llama 4 Behemoth teacher reported." }],
    note: "16 large experts, 17B active of 109B total. Interleaved RoPE/NoPE attention layers enable the headline 10M-token window, by far the largest of any model. You still pay the VRAM tax for all 109B weights, but it generates at ~17B-dense speed. Fewer, larger experts vs Gemma 4's many-small-experts approach." },
  { name: "Mistral Large 3", provider: "Mistral", released: "2025/12", type: "Frontier", arch: "Sparse MoE", params: "673B", active: "41B",
    attn: "MLA (Multi-head Latent Attn)", modality: "Text + vision", context: 262144, maxOut: 64000, license: "Apache 2.0", open: true, intel: 16, training: null,
    note: "MoE flagship now under fully permissive Apache 2.0, a shift from Mistral's earlier restrictive terms. GQA-based attention. 256K context, large but not in the 1M+ club." },
  { name: "GLM-5", provider: "Zhipu", released: "2026/02", type: "Frontier", arch: "Sparse MoE", params: "744B", active: "40B",
    attn: "MLA + DeepSeek Sparse Attn", modality: "Text + vision", context: 202752, maxOut: 32000, license: "MIT", open: true, intel: null,
    training: [
      { label: "Pre-training", tokens: "27T", detail: "Base model training opens on a 27-trillion-token corpus that front-loads code and reasoning data. GLM-5 scales to 256 experts while cutting depth to 80 layers to reduce expert-parallel communication overhead, giving 744B total / 40B active.",
        curriculum: "Web data reuses the GLM-4.5 pipeline with tightened selection: an extra DCLM classifier over sentence embeddings pulls in high-quality documents standard classifiers miss, and a World Knowledge classifier tuned on Wikipedia entries and LLM-labelled data rescues long-tail facts from otherwise medium-to-low-quality pages. The code corpus grows 28% in fuzzily deduplicated unique tokens from refreshed snapshots of major hosting platforms plus more code-bearing web pages, with Software Heritage metadata misalignment fixed, a more accurate language classifier, and dedicated classifiers trained for low-resource languages such as Scala, Swift and Lua. Maths and science are drawn from webpages, books and papers through refined extraction and PDF parsing, with LLMs scoring candidates so only the most educational content survives." },
      { label: "DSA adaptation", tokens: "20B", detail: "Continued pre-training that swaps in DeepSeek Sparse Attention, starting from the end-of-mid-training checkpoint. A 1,000-step warmup trains the indexer at 14 sequences of 202,752 tokens per step, then a 20B-token sparse-adaptation stage reuses the mid-training data and hyperparameters. Zhipu notes this is far cheaper than DeepSeek-V3.2's 943.7B-token equivalent yet still matches the original MLA model." },
      { label: "Mid-training", tokens: "1.55T", detail: "A distinct phase that walks the context window up in three stages — 32K over 1T tokens, 128K over 500B, then 200K over 50B. The added 200K stage (versus GLM-4.5's 128K ceiling) is what lets it handle ultra-long documents and multi-file codebases.",
        curriculum: "The three context stages are deliberately front-loaded: 1T tokens at 32K, 500B at 128K and only 50B at 200K, so the bulk of the compute sits at the cheap short-context end while the model still adapts to the long tail. Long documents and synthetic agent trajectories are upsampled at the longer stages, targeting agentic and long-context capacity rather than general language ability, which pre-training already covers." },
      { label: "SFT", tokens: null, detail: "Corpus covers three categories — General Chat (QA, writing, role-play, translation, multi-turn, long-context), Reasoning (maths, programming, science) and Coding & Agent (frontend/backend engineering, tool calling, coding/search/general agents) — with Agent and Coding data expanded well past GLM-4.5's scale. Context extends to 202,752 tokens during this stage, and an updated chat template adds three thinking modes: interleaved (thinks before every response and tool call), preserved (coding agents keep prior thinking blocks across turns instead of re-deriving them) and turn-level (thinking toggled per turn to trade cost against accuracy).",
        curriculum: "General Chat responses are tuned for a more logical, concise style than GLM-4.5, with role-play data broadened across languages and character configurations and filtered against dimensions like instruction following, creativity, logical coherence and long-dialogue consistency using both automatic and human review. Reasoning data is deepened with verifiable, synthesised problems for logical reasoning specifically. Coding & Agent data is the category expanded most aggressively relative to the prior generation." },
      { label: "RL + distillation", tokens: null, detail: "Separate Reasoning RL, Agentic RL and General RL stages, then On-Policy Cross-Stage Distillation to fold them back together. Runs on a rebuilt asynchronous RL stack layered on the 'slime' framework that decouples generation from training to cut rollout tail latency. Total budget across all stages is 28.5T tokens for the base model." },
    ],
    note: "744B-A40B, the largest active-parameter count among single-GPU-deployable open MoEs. MIT licensed. Competitive on hard reasoning and coding benchmarks." },
  { name: "Command A", provider: "Cohere", released: "2025/03", type: "Mid", arch: "Dense", params: "111B", active: "111B",
    attn: "Grouped-query attention", modality: "Text", context: 256000, maxOut: 32000, license: "CC-BY-NC", open: true, intel: 8,
    training: [
      { label: "Pre-training", tokens: null, detail: "Standard pre-training stage; Cohere names it but discloses no corpus size or token budget for Command A." },
      { label: "SFT", tokens: null, detail: "Supervised fine-tuning applied after pre-training, per the model card. Dataset size not disclosed." },
      { label: "Preference training", tokens: null, detail: "Final alignment stage using preference training rather than a named RLHF variant, targeting helpfulness and safety. Cohere's tech report (arXiv 2504.00698) covers the method; the model card itself gives no quantitative detail." },
    ],
    note: "One of the larger dense (non-MoE) models still shipping; all 111B params fire every token. Tuned for RAG and grounded generation with citations. Non-commercial license." },
  { name: "Nemotron 3 Ultra", provider: "NVIDIA", released: "2026/06", type: "Frontier", arch: "Hybrid Mamba-MoE", params: "550B", active: "55B",
    attn: "Mamba-2 SSM + GQA attn", modality: "Text", context: 262144, maxOut: 32000, license: "NVIDIA Nemotron Open Model License", open: true, intel: 38, training: [{ label: "Pre-training P1", tokens: "15T", detail: "Diversity-focused mixture (web, code, math, multilingual); NVFP4 training, LatentMoE, multi-token prediction." }, { label: "Pre-training P2", tokens: "5T", detail: "Quality-focused high-fidelity data after ~75% of pretraining (20T total text tokens)." }, { label: "Context extension", tokens: null, detail: "Extends context to 1M tokens via continued pretraining." }, { label: "SFT + RL + MOPD", tokens: null, detail: "Supervised fine-tuning, multi-environment RLVR, and Multi-teacher On-Policy Distillation." }],
    note: "Hybrid latent Mamba-Transformer MoE: 550B total, 55B active. Interleaves Mamba-2 state-space layers (recurrent state scales linearly with sequence length, not quadratically) with sparse MoE and a few grouped-query attention layers. The SSM layers slash KV-cache cost on long reasoning chains. 1M context via NVFP4 on Blackwell (262K in BF16). Trained in 4-bit NVFP4. NVIDIA's strongest US open-weight model; full open release of weights, data, and recipes." },
  { name: "Nemotron 3 Super", provider: "NVIDIA", released: "2026/03", type: "Mid", arch: "Hybrid Mamba-MoE", params: "120B", active: "12B",
    attn: "Mamba-2 SSM + GQA attn", modality: "Text", context: 1000000, maxOut: 32000, license: "NVIDIA Nemotron Open Model License", open: true, intel: 25, training: [{ label: "Pre-training", tokens: "25T", detail: "Two-phase diversity\u2192quality curriculum, NVFP4 + LatentMoE + MTP (same family recipe as Nano/Ultra)." }, { label: "Context extension", tokens: null, detail: "Continued pretraining to native 1M context." }, { label: "SFT + RL + MOPD", tokens: null, detail: "SFT, RL across interactive environments, and multi-teacher on-policy distillation." }],
    note: "Same hybrid LatentMoE design as Ultra at single-H100 scale: 120B total, 12B active, native 1M context in BF16 with multi-token prediction. RULER-100 retrieval of ~91.75 at full length. The SSM/attention/MoE mix is the structural break from the all-transformer field." },

  // ---- Small language models (SLMs) ----
  { name: "Gemma 4 (31B)", provider: "Google", released: "2026/04", type: "SLM", arch: "Dense", params: "30.7B", active: "30.7B",
    attn: "Sliding-window + global", modality: "Text + vision", context: 256000, maxOut: 8192, license: "Apache 2.0", open: true, intel: 29, training: [{ label: "Pre-training", tokens: null, detail: "Gemma 4's own token budget isn't published. For reference, Gemma 3's report used 14T tokens for the 27B model on a knowledge-distillation recipe." }, { label: "Post-training", tokens: null, detail: "Distillation + instruction tuning + RLHF; function calling and JSON output built in." }],
    note: "The only fully dense Gemma 4 variant, all 30.7B params active. Hybrid attention alternates local sliding-window with periodic global layers (final layer always global). Native multimodal, Apache 2.0. Runs on a single GPU." },
  { name: "Gemma 4 E4B", provider: "Google", released: "2026/04", type: "SLM", arch: "Dense", params: "8B (4.5B eff.)", active: "8B (4.5B eff.)",
    attn: "Sliding-window + global", modality: "Text + vision + audio", context: 128000, maxOut: 8192, license: "Apache 2.0", open: true, intel: 12, training: [{ label: "Pre-training", tokens: null, detail: "Distillation-based pretraining at edge scale (token budget not separately published)." }, { label: "Post-training", tokens: null, detail: "Instruction tuning + RLHF; adds audio input." }],
    note: "Gemma 4's phone-scale edge variant, and a DENSE model \u2014 not MoE. 8B parameters, but per-layer embeddings add small layer-specific token vectors without scaling the compute path, so its effective footprint is ~4.5B. 42-layer stack, 2 KV heads, 5:1 sliding-window/global attention with unified K/V and p-RoPE on global layers. Adds native audio input. (The 25.2B/3.8B MoE figures often attributed to E4B actually belong to the separate Gemma 4 26B-A4B variant.)" },
  { name: "Gemma 3 4B", provider: "Google", released: "2025/03", type: "SLM", arch: "Dense", params: "4B", active: "4B",
    attn: "Sliding-window + global", modality: "Text + vision", context: 128000, maxOut: 8192, license: "Gemma", open: true, intel: null, training: [{ label: "Pre-training", tokens: "4T", detail: "Knowledge-distillation pretraining (Gemma 3 report: 4T tokens for the 4B model)." }, { label: "Post-training", tokens: null, detail: "Distillation, SFT, and RLHF." }],
    note: "Prior-gen dense edge model, ~4.2GB RAM at quantized precision, best fit for memory-constrained devices. Hybrid local/global attention like the rest of the Gemma line." },
  { name: "FunctionGemma 270M", provider: "Google", released: "2026/04", type: "SLM", arch: "Dense", params: "0.27B", active: "0.27B",
    attn: "Sliding-window + global", modality: "Text", context: 32000, maxOut: 4096, license: "Gemma", open: true, intel: null, training: [{ label: "Pre-training", tokens: null, detail: "Small-scale distillation pretraining (budget not published)." }, { label: "Task fine-tuning", tokens: null, detail: "Specialized for function calling." }],
    note: "Purpose-built for function calling on IoT/edge hardware. Smallest model here; dense, text-only, narrow capability by design." },
  { name: "Phi-4-mini", provider: "Microsoft", released: "2025/02", type: "SLM", arch: "Dense", params: "3.8B", active: "3.8B",
    attn: "Grouped-query attention", modality: "Text", context: 128000, maxOut: 16000, license: "MIT", open: true, intel: 6, training: [{ label: "Pre-training", tokens: null, detail: "Phi-4-mini's own token count isn't published. Its report centers on the Mixture-of-LoRAs design; the related Phi-4 (14B) model used ~10T tokens. Recipe emphasizes synthetic, reasoning-dense data over raw scale." }, { label: "Distill pre-training", tokens: null, detail: "Distillation stage that sharply lifts reasoning (per the Phi-4-mini report's ablations)." }, { label: "Post-training", tokens: null, detail: "Distill fine-tuning then roll-out DPO for the reasoning-enhanced model." }],
    note: "Dense reasoning-focused SLM trained heavily on synthetic, reasoning-dense data, the Phi line's signature recipe (data quality over scale). Format-sensitive: best with its chat/function-call templates. Runs on CPU." },
  { name: "Qwen3.5 (9B)", provider: "Alibaba", released: "2026/02", type: "SLM", arch: "Hybrid: Gated DeltaNet (dense)", params: "9B", active: "9B",
    attn: "Gated DeltaNet + gated attn", modality: "Text + vision", context: 262144, maxOut: 16000, license: "Apache 2.0", open: true, intel: 21, training: [{ label: "Pre-training S1", tokens: "~30T", detail: "Qwen3.5-specific counts unpublished; figures are the Qwen3 report recipe (general multilingual corpus)." }, { label: "Pre-training S2", tokens: "~5T", detail: "High-quality STEM/code/reasoning/synthetic data (Qwen3 figure)." }, { label: "Long-context", tokens: null, detail: "Long-context training stage." }, { label: "Post-training", tokens: null, detail: "SFT + RL alignment." }],
    note: "Larger edge-tier Qwen on the Qwen3-Next lineage: 3:1 Gated DeltaNet / gated-attention hybrid (every 4th layer full attention) rather than plain GQA. Inherits the family's wide multilingual vocabulary. Strong coding scores for its class." },
  { name: "Qwen3.5 (0.8B)", provider: "Alibaba", released: "2026/02", type: "SLM", arch: "Hybrid: Gated DeltaNet (dense)", params: "0.8B", active: "0.8B",
    attn: "Gated DeltaNet + gated attn", modality: "Text", context: 262144, maxOut: 8192, license: "Apache 2.0", open: true, intel: 5, training: [{ label: "Pre-training", tokens: "~36T", detail: "Qwen3.5-specific count unpublished; the Qwen3 report's 36T-token corpus is shown as the family figure." }, { label: "Post-training", tokens: null, detail: "SFT + RL; thinking/non-thinking modes." }],
    note: "Smallest Qwen3.5 for sub-4GB devices. Its model card spells out the block structure explicitly: 6 × (3 × Gated DeltaNet→FFN, 1 × gated attention→FFN) — the same hybrid as the rest of the family, not a plain dense GQA model." },
  { name: "Qwen3.6 (27B)", provider: "Alibaba", released: "2026/04", type: "SLM", arch: "Hybrid: Gated DeltaNet (dense)", params: "27B", active: "27B",
    attn: "Gated DeltaNet + gated attn", modality: "Text + vision", context: 262144, maxOut: 65536, license: "Apache 2.0", open: true, intel: 37, training: [{ label: "Pre-training", tokens: null, detail: "Qwen3.6 dense generation; token count unpublished. 64-layer hybrid: 16 repeats of (3x Gated DeltaNet→FFN, 1x gated attention→FFN), trained with multi-token prediction." }, { label: "Long-context", tokens: null, detail: "262K native, extensible to ~1M via YaRN." }, { label: "Post-training", tokens: null, detail: "SFT + RL; adds Thinking Preservation that carries reasoning context across turns." }],
    note: "First dense open model in the Qwen3.6 family. At 27.8B it edges past the 397B-A17B Qwen3.5 MoE on coding benchmarks (SWE-bench Verified ~77.2) while fitting in ~17GB at Q4. Gated DeltaNet hybrid attention; runs on a single GPU." },
  { name: "Qwen3.6 35B-A3B", provider: "Alibaba", released: "2026/04", type: "SLM", arch: "Hybrid: Gated DeltaNet + MoE", params: "35B", active: "3B",
    attn: "Gated DeltaNet + gated attn", modality: "Text", context: 262144, maxOut: 32000, license: "Apache 2.0", open: true, intel: 32, training: [{ label: "Pre-training", tokens: null, detail: "Qwen3.6 generation MoE; token budget unpublished. Hybrid Gated DeltaNet attention with sparse MoE FFN layers." }, { label: "Post-training", tokens: null, detail: "SFT + RL alignment; thinking/non-thinking modes." }],
    note: "First open-weight Qwen3.6 release: 35B total, only 3B active per token, so it runs on a laptop (~21GB quantized) while scoring ~73.4 on SWE-bench Verified. The MoE counterpart to the dense 27B." },
  { name: "Llama 3.2 3B", provider: "Meta", released: "2024/09", type: "SLM", arch: "Dense", params: "3B", active: "3B",
    attn: "Grouped-query attention", modality: "Text", context: 128000, maxOut: 8192, license: "Llama 3.2 Community", open: true, intel: null, training: [{ label: "Pre-training", tokens: "Up to 9T", detail: "Distilled/pruned from larger Llama 3.1 models using their token corpus; logits-based distillation." }, { label: "Post-training", tokens: null, detail: "SFT + DPO alignment." }],
    note: "Dense mobile/edge model. Predates the Llama 4 MoE shift, so unlike Scout every parameter is active. Strong math for its size." },
  { name: "Llama 3.2 1B", provider: "Meta", released: "2024/09", type: "SLM", arch: "Dense", params: "1B", active: "1B",
    attn: "Grouped-query attention", modality: "Text", context: 128000, maxOut: 8192, license: "Llama 3.2 Community", open: true, intel: null, training: [{ label: "Pre-training", tokens: "Up to 9T", detail: "Pruned + distilled from Llama 3.1 8B/larger teachers." }, { label: "Post-training", tokens: null, detail: "SFT + DPO alignment." }],
    note: "Smallest Llama, built for phones. Dense, text-only; 128K context is generous for the size." },
  { name: "Mistral Small 4", provider: "Mistral", released: "2026/03", type: "SLM", arch: "Sparse MoE", params: "119B", active: "6.63B",
    attn: "MLA (Multi-head Latent Attn)", modality: "Text + vision", context: 256000, maxOut: 16000, license: "Apache 2.0", open: true, intel: 20, training: null,
    note: "Sits oddly across the SLM/large line: 119B total but only 6.5B active, so its inference compute is SLM-class while weights are large. Apache 2.0. Shows how 'small' increasingly means active-params, not total." },
  { name: "SmolLM3-3B", provider: "Hugging Face", released: "2025/06", type: "SLM", arch: "Dense", params: "3B", active: "3B",
    attn: "GQA + periodic NoPE", modality: "Text", context: 131072, maxOut: 8192, license: "Apache 2.0", open: true, intel: null, training: [{ label: "Pre-training", tokens: "8T", detail: "Stage 1 pretraining; NoPE + intra-document masking chosen up front for long context." }, { label: "Mid-training", tokens: "3.2T", detail: "Stages 2-3 + long-context training (higher-quality and longer-sequence data)." }, { label: "Post-training", tokens: "37.5B", detail: "SFT + alignment on combined post-training datasets; fully open blueprint." }],
    note: "Fully open instruct + reasoning model with a published end-to-end training blueprint (architecture, data mix, post-training). At 3B it beats Llama 3.2 3B and Qwen2.5 3B on many benchmarks." },
  { name: "Tiny Aya", provider: "Cohere", released: "2026/02", type: "SLM", arch: "Dense", params: "3.35B", active: "3.35B",
    attn: "Sliding-window + global", modality: "Text", context: 8192, maxOut: 4096, license: "CC-BY-NC", open: true, intel: 1, training: null,
    note: "Multilingual-first small model covering 70+ languages at 3.35B. Dense, non-commercial license." },
  { name: "Nemotron 3 Nano", provider: "NVIDIA", released: "2025/12", type: "SLM", arch: "Hybrid Mamba-MoE", params: "30B", active: "3B",
    attn: "Mamba-2 SSM + GQA attn", modality: "Text", context: 1000000, maxOut: 16000, license: "NVIDIA Nemotron Open Model License", open: true, intel: 14, training: [{ label: "Pre-training P1", tokens: "23.5T", detail: "Diverse web/code/math/multilingual + synthetic; aux-loss-free MoE load balancing." }, { label: "Pre-training P2", tokens: "1.5T", detail: "High-quality curated sources (e.g. Wikipedia) to refine accuracy (25T total)." }, { label: "Long-context CPT", tokens: null, detail: "Continued pretraining at 512K sequence (mixed 4K/512K) to reach the 1M window." }, { label: "SFT + RL", tokens: null, detail: "Stage 1 SFT then Stage 2 RL; 13M-sample post-training corpus, GenRM-based RLHF." }],
    note: "Scaled-down hybrid: 52 layers = 23 Mamba-2 + 23 MoE (128 routed + 1 shared, 6 active) + 6 GQA attention layers. 30B total, 3.5B active, with a configurable thinking budget. Remarkably, it keeps a 1M-token window at SLM scale thanks to the linear-cost SSM layers (default capped at 262K to avoid OOM). 4-bit fits in ~3GB RAM." },
];

const TYPE_COLORS = {
  Frontier: { fg: "var(--type-frontier-fg)", dot: "var(--type-frontier-dot)" },
  Mid: { fg: "var(--type-mid-fg)", dot: "var(--type-mid-dot)" },
  SLM: { fg: "var(--type-slm-fg)", dot: "var(--type-slm-dot)" },
};
const ARCH_COLORS = {
  "Dense": "var(--arch-dense)",
  "Sparse MoE": "var(--arch-moe)",
  "MoE": "var(--arch-moe)",
  "MoE + linear attn": "var(--arch-moe)",
  "Hybrid Mamba-MoE": "var(--arch-mamba)",
  "Hybrid: KDA + MoE": "var(--arch-kda)",
  "Hybrid: Gated DeltaNet + MoE": "var(--arch-deltanet)",
  "Hybrid: Gated DeltaNet (dense)": "var(--arch-deltanet)",
  "MoE + Gated DeltaNet": "var(--arch-deltanet)",
  "MoE (reported)": "var(--arch-reported)",
  "Undisclosed": "var(--arch-undisclosed)",
};

// Architecture diagrams from Sebastian Raschka's LLM Architecture Gallery.
// Hot-linked, not copied: the images stay on his server and every use carries a
// visible credit linking back to the source card. Each pairing below was checked
// against the model's parameter count, and every URL was verified to resolve.
// Models with no confidently matching card are deliberately absent rather than
// guessed at - a near-miss card (e.g. Command A+ vs Command A) is not a match.
// Hugging Face repo for each open-weight model, for the ones that actually publish
// weights there. Every URL below was checked live (GET + og:title, since HuggingFace
// serves a 401 status on some missing repos rather than a clean 404) before being
// added - none of these are guessed from a naming pattern.
const HF_LINKS = {
  "Command A": "CohereLabs/c4ai-command-a-03-2025",
  "DeepSeek V4 Flash": "deepseek-ai/DeepSeek-V4-Flash",
  "DeepSeek V4 Pro": "deepseek-ai/DeepSeek-V4-Pro",
  "FunctionGemma 270M": "google/functiongemma-270m-it",
  "GLM-5": "zai-org/GLM-5",
  "GLM-5.1": "zai-org/GLM-5.1",
  "GLM-5.2": "zai-org/GLM-5.2",
  "Gemma 3 4B": "google/gemma-3-4b-it",
  "Gemma 4 (31B)": "google/gemma-4-31b",
  "Gemma 4 26B-A4B": "google/gemma-4-26b-a4b",
  "Gemma 4 E4B": "google/gemma-4-e4b",
  "Inkling": "thinkingmachines/inkling",
  "Kimi K2.6": "moonshotai/Kimi-K2.6",
  "Kimi K3": "moonshotai/Kimi-K3",
  "Laguna S 2.1": "poolside/Laguna-S-2.1",
  "Laguna XS 2.1": "poolside/Laguna-XS-2.1",
  "Laguna XS.2": "poolside/Laguna-XS.2",
  "Llama 3.2 1B": "meta-llama/Llama-3.2-1B",
  "Llama 3.2 3B": "meta-llama/Llama-3.2-3B-Instruct",
  "Llama 4 Scout": "meta-llama/Llama-4-Scout-17B-16E",
  "Mistral Large 3": "mistralai/Mistral-Large-3",
  "Mistral Small 4": "mistralai/Mistral-Small-4-119B-2603",
  "Nemotron 3 Nano": "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16",
  "Nemotron 3 Super": "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16",
  "Nemotron 3 Ultra": "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16",
  "Phi-4-mini": "microsoft/Phi-4-mini-instruct",
  "Qwen3.5 (0.8B)": "Qwen/Qwen3.5-0.8B",
  "Qwen3.5 (9B)": "Qwen/Qwen3.5-9B",
  "Qwen3.5-Plus": "Qwen/Qwen3.5-397B-A17B",
  "Qwen3.6 (27B)": "Qwen/Qwen3.6-27B",
  "Qwen3.6 35B-A3B": "Qwen/Qwen3.6-35B-A3B",
  "Sarvam 105B": "sarvamai/sarvam-105b",
  "Sarvam 30B": "sarvamai/sarvam-30b",
  "SmolLM3-3B": "HuggingFaceTB/SmolLM3-3B",
  "Tiny Aya": "CohereLabs/tiny-aya-base",
};

const DIAGRAM_BASE = "https://sebastianraschka.com/llm-architecture-gallery";
const DIAGRAM_CREDIT = "https://sebastianraschka.com/llm-architecture-gallery/";
// Local mirror of the same 28 diagrams, downloaded into public/diagrams/ as a fallback
// for if sebastianraschka.com ever renames or removes a file. The hotlink is tried
// first — it credits his traffic and always serves his latest version — and the
// <img> only falls back to this repo's copy on a load error. Credit line is
// identical either way.
const LOCAL_DIAGRAM_BASE = `${import.meta.env.BASE_URL}diagrams`;
const DIAGRAMS = {
  "DeepSeek V4 Flash": { slug: "deepseek-v4-flash", title: "DeepSeek V4-Flash (284B)" },
  "DeepSeek V4 Pro": { slug: "deepseek-v4-pro", title: "DeepSeek V4-Pro (1.6T)" },
  "Gemma 4 (31B)": { slug: "gemma-4-31b", title: "Gemma 4 (31B)" },
  "Gemma 4 26B-A4B": { slug: "gemma-4-26b-a4b", title: "Gemma 4 (26B-A4B)" },
  "Gemma 4 E4B": { slug: "gemma-4-e4b", title: "Gemma 4 (E4B)" },
  "GLM-5": { slug: "glm-5-744b", title: "GLM-5 (744B)" },
  "GLM-5.1": { slug: "glm-5-1", title: "GLM-5.1 (744B)" },
  "GLM-5.2": { slug: "glm-5.2", title: "GLM-5.2 (744B)" },
  "Inkling": { slug: "inkling", title: "Inkling (975B)" },
  "Kimi K2.6": { slug: "kimi-k2-6", title: "Kimi K2.6 (1T)" },
  "Kimi K3": { slug: "kimi-k3", title: "Kimi K3 (2.8T)" },
  "Laguna S 2.1": { slug: "laguna-s-2-1", title: "Laguna S 2.1 (118B)" },
  "Laguna XS 2.1": { slug: "laguna-xs-2-1", title: "Laguna XS 2.1 (33B)" },
  "Laguna XS.2": { slug: "laguna-xs2", title: "Laguna XS.2 (33B)" },
  "Llama 3.2 1B": { slug: "llama-3-2-1b", title: "Llama 3.2 (1B)" },
  "Llama 3.2 3B": { slug: "llama-3-2-3b", title: "Llama 3.2 (3B)" },
  "MiniMax M3": { slug: "minimax-m3", title: "MiniMax M3 (428B)" },
  "Mistral Large 3": { slug: "mistral-3-large-673-billion", title: "Mistral Large 3 (673B)" },
  "Mistral Small 4": { slug: "mistral-small-4", title: "Mistral Small 4 (119B)" },
  "Nemotron 3 Nano": { slug: "nemotron-3-nano-30b-a3b", title: "Nemotron 3 Nano (30B-A3B)" },
  "Nemotron 3 Super": { slug: "nemotron-3-super-120b-a12b", title: "Nemotron 3 Super (120B-A12B)" },
  "Nemotron 3 Ultra": { slug: "nemotron-3-ultra-550b-a55b", title: "Nemotron 3 Ultra (550B-A55B)" },
  "Qwen3.6 (27B)": { slug: "qwen3-6-27b", title: "Qwen3.6 (27B)" },
  "Qwen3.6 35B-A3B": { slug: "qwen3-6-35b-a3b", title: "Qwen3.6 (35B-A3B)" },
  "Sarvam 105B": { slug: "sarvam-105b", title: "Sarvam (105B)" },
  "Sarvam 30B": { slug: "sarvam-30b", title: "Sarvam (30B)" },
  "SmolLM3-3B": { slug: "smollm3-3b", title: "SmolLM3 (3B)" },
  "Tiny Aya": { slug: "tiny-aya-3-35b", title: "Tiny Aya (3.35B)" },
};

// Per-model technical report / model card / official source. null = none published.
const REPORTS = {
  "Sarvam 105B": { label: "Sarvam 30B/105B tech report", url: "https://www.sarvam.ai/blogs/sarvam-30b-105b" },
  "Sarvam 30B": { label: "Sarvam 30B/105B tech report", url: "https://www.sarvam.ai/blogs/sarvam-30b-105b" },
  "Kimi K2.6": { label: "Kimi K2.6 tech blog", url: "https://www.kimi.com/blog/kimi-k2-6.html" },
  "GLM-5.1": { label: "GLM-5 tech report (arXiv 2602.15763)", url: "https://arxiv.org/pdf/2602.15763" },
  "Laguna XS.2": { label: "Laguna M.1 / XS.2 tech report (PDF)", url: "https://poolside.ai/assets/laguna/laguna-m1-xs2-technical-report.pdf" },
  "Gemma 4 26B-A4B": { label: "Gemma 4 model card", url: "https://ai.google.dev/gemma/docs/core/model_card_4" },
  "Claude Opus 5": { label: "Anthropic model page", url: "https://www.anthropic.com/claude" },
  "Claude Sonnet 5": { label: "Anthropic model page", url: "https://www.anthropic.com/claude" },
  "GPT-5.6 Sol": { label: "OpenAI", url: "https://openai.com/index/gpt-5/" },
  "GPT-5.6 Terra": { label: "OpenAI", url: "https://openai.com/index/gpt-5/" },
  "GPT-5.6 Luna": { label: "OpenAI", url: "https://openai.com/index/gpt-5/" },
  "Grok 4.5": { label: "xAI news", url: "https://x.ai/news" },
  "Kimi K3": { label: "Kimi K3 tech report (arXiv 2607.24653)", url: "https://arxiv.org/abs/2607.24653" },
  "GLM-5.2": { label: "Z.ai / Zhipu on Hugging Face", url: "https://huggingface.co/zai-org" },
  "Inkling": { label: "Inkling model card", url: "https://thinkingmachines.ai/model-card/inkling/" },
  "Laguna S 2.1": { label: "Introducing Laguna S 2.1", url: "https://poolside.ai/blog/introducing-laguna-s-2-1" },
  "Laguna XS 2.1": { label: "Laguna XS 2.1 model card", url: "https://build.nvidia.com/poolside/laguna-xs-2.1/modelcard" },
  "Claude Fable 5": { label: "Anthropic model page", url: "https://www.anthropic.com/claude" },
  "Claude Opus 4.8": { label: "Anthropic model page", url: "https://www.anthropic.com/claude" },
  "Claude Sonnet 4.6": { label: "Anthropic model page", url: "https://www.anthropic.com/claude" },
  "Claude Haiku 4.5": { label: "Anthropic model page", url: "https://www.anthropic.com/claude" },
  "GPT-5.5": { label: "OpenAI", url: "https://openai.com/index/gpt-5/" },
  "GPT-5 mini": { label: "OpenAI", url: "https://openai.com/index/gpt-5/" },
  "Gemini 3.1 Pro": { label: "Google DeepMind", url: "https://deepmind.google/models/gemini/" },
  "Gemini 3.5 Flash": { label: "Google DeepMind", url: "https://deepmind.google/models/gemini/" },
  "Grok 4.3": { label: "xAI", url: "https://x.ai/news" },
  "DeepSeek V4 Pro": { label: "DeepSeek-V4 tech report (PDF)", url: "https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/DeepSeek_V4.pdf" },
  "DeepSeek V4 Flash": { label: "DeepSeek-V4 tech report (PDF)", url: "https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/DeepSeek_V4.pdf" },
  "Qwen3.5-Plus": { label: "Qwen3 tech report (arXiv 2505.09388)", url: "https://arxiv.org/abs/2505.09388" },
  "Qwen3.6 Plus": { label: "Qwen model card", url: "https://huggingface.co/Qwen" },
  "Qwen3.7 Max": { label: "Qwen blog", url: "https://qwen.ai/blog" },
  "Qwen3.7 Plus": { label: "Qwen blog", url: "https://qwen.ai/blog" },
  "MiniMax M3": { label: "MiniMax model hub", url: "https://huggingface.co/MiniMaxAI" },
  "Llama 4 Scout": { label: "Llama 4 model card", url: "https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E" },
  "Mistral Large 3": { label: "Mistral docs", url: "https://docs.mistral.ai/models/mistral-large-3-25-12" },
  "GLM-5": { label: "Zhipu / Z.ai", url: "https://huggingface.co/zai-org" },
  "Command A": { label: "Cohere model card", url: "https://huggingface.co/CohereLabs/c4ai-command-a-03-2025" },
  "Nemotron 3 Ultra": { label: "Nemotron 3 Ultra tech report (PDF)", url: "https://research.nvidia.com/labs/nemotron/files/NVIDIA-Nemotron-3-Ultra-Technical-Report.pdf" },
  "Nemotron 3 Super": { label: "Nemotron 3 white paper (PDF)", url: "https://research.nvidia.com/labs/nemotron/files/NVIDIA-Nemotron-3-White-Paper.pdf" },
  "Nemotron 3 Nano": { label: "Nemotron 3 Nano paper (arXiv 2512.20848)", url: "https://arxiv.org/abs/2512.20848" },
  "Gemma 4 (31B)": { label: "Gemma 4 (see Gemma 3 report 2503.19786)", url: "https://arxiv.org/abs/2503.19786" },
  "Gemma 4 E4B": { label: "Gemma 4 (see Gemma 3 report 2503.19786)", url: "https://arxiv.org/abs/2503.19786" },
  "Gemma 3 4B": { label: "Gemma 3 tech report (arXiv 2503.19786)", url: "https://arxiv.org/abs/2503.19786" },
  "FunctionGemma 270M": { label: "Gemma model page", url: "https://ai.google.dev/gemma" },
  "Phi-4-mini": { label: "Phi-4-Mini tech report (arXiv 2503.01743)", url: "https://arxiv.org/abs/2503.01743" },
  "Qwen3.5 (9B)": { label: "Qwen3 tech report (arXiv 2505.09388)", url: "https://arxiv.org/abs/2505.09388" },
  "Qwen3.5 (0.8B)": { label: "Qwen3 tech report (arXiv 2505.09388)", url: "https://arxiv.org/abs/2505.09388" },
  "Qwen3.6 (27B)": { label: "Qwen3.6-27B model card", url: "https://huggingface.co/Qwen/Qwen3.6-27B" },
  "Qwen3.6 35B-A3B": { label: "Qwen model card", url: "https://huggingface.co/Qwen" },
  "Llama 3.2 3B": { label: "Llama 3.2 model card", url: "https://huggingface.co/meta-llama/Llama-3.2-3B" },
  "Llama 3.2 1B": { label: "Llama 3.2 model card", url: "https://huggingface.co/meta-llama/Llama-3.2-1B" },
  "Mistral Small 4": { label: "Mistral docs", url: "https://docs.mistral.ai/models/" },
  "SmolLM3-3B": { label: "SmolLM3 (HF blog + playbook)", url: "https://huggingface.co/blog/smollm3" },
  "Tiny Aya": { label: "Cohere Labs Aya", url: "https://cohere.com/research/aya" },
};

// Attention-mechanism dictionary: hover tooltip + the foundational paper that introduced it.
const ATTENTION_INFO = {
  "KDA + full attn (3:1)": {
    desc: "Kimi Delta Attention: a linear-attention layer using the delta rule with gating, interleaved with full softmax attention in a 3:1 ratio. Moonshot reports it cuts KV-cache memory up to 75% and decodes up to 6x faster at 1M context. Paired with Attention Residuals, which let each layer selectively pull representations from arbitrary earlier layers instead of accumulating them uniformly.",
    paper: { label: "Gated DeltaNet — KDA's lineage (arXiv 2412.06464)", url: "https://arxiv.org/abs/2412.06464" },
  },
  "DSA + MLA (IndexShare)": {
    desc: "DeepSeek-style sparse attention combined with Multi-head Latent Attention, which compresses the KV cache into a low-rank latent. Zhipu adds IndexShare, which it reports reduces per-token FLOPs by 2.9x at 1M-token context.",
    paper: { label: "DeepSeek-V3 / MLA (arXiv 2412.19437)", url: "https://arxiv.org/abs/2412.19437" },
  },
  "MLA (Multi-head Latent Attn)": {
    desc: "Multi-head Latent Attention compresses keys and values into a low-rank latent vector that is cached instead of the full K/V tensors, cutting KV-cache memory dramatically while keeping quality close to full attention. Introduced by DeepSeek and since adopted by Mistral, Kimi and GLM.",
    paper: { label: "DeepSeek-V2 / MLA (arXiv 2405.04434)", url: "https://arxiv.org/abs/2405.04434" },
  },
  "MLA + DeepSeek Sparse Attn": {
    desc: "Multi-head Latent Attention combined with DeepSeek Sparse Attention: on top of the low-rank KV cache, each query attends to only a selected subset of positions, cutting long-context cost further. Used by GLM-5 and DeepSeek V3.2.",
    paper: { label: "Native Sparse Attention (arXiv 2502.11089)", url: "https://arxiv.org/abs/2502.11089" },
  },
  "GQA + periodic NoPE": {
    desc: "Grouped-query attention where every fourth layer omits rotary position embeddings entirely (NoPE). Removing positional signal from some layers has been found to improve length generalisation on long contexts.",
    paper: { label: "NoPE — positional encoding & length generalization (arXiv 2305.19466)", url: "https://arxiv.org/abs/2305.19466" },
  },
  "Grouped-query attention": {
    desc: "Query heads share a smaller number of key/value heads, cutting KV-cache memory vs full multi-head attention with almost no quality loss. Standard in most 2024–26 models.",
    paper: { label: "GQA (arXiv 2305.13245)", url: "https://arxiv.org/abs/2305.13245" },
  },
  "Hybrid: CSA + HCA": {
    desc: "DeepSeek V4's two-branch scheme: Compressed Sparse Attention (compress the KV cache, then a lightning indexer selects the top-k blocks per query) interleaved with Heavily/Hierarchical Compressed Attention. Cuts 1M-context cost to a fraction of dense attention.",
    paper: { label: "Native Sparse Attention (arXiv 2502.11089)", url: "https://arxiv.org/abs/2502.11089" },
  },
  "Hybrid linear + full": {
    desc: "Most layers use linear-cost attention (constant-size recurrent state) with periodic full-attention layers inserted to recover exact long-range recall. Keeps long-context compute near-linear.",
    paper: { label: "Gated Linear Attention (arXiv 2312.06635)", url: "https://arxiv.org/abs/2312.06635" },
  },
  "Gated DeltaNet + gated attn": {
    desc: "Gated DeltaNet is a linear-attention layer that combines a gating signal (fast memory erasure) with the delta rule (targeted memory edits), improving on Mamba-2. Paired with periodic gated softmax-attention layers for exact local recall.",
    paper: { label: "Gated DeltaNet (arXiv 2412.06464)", url: "https://arxiv.org/abs/2412.06464" },
  },
  "Mamba-2 SSM + GQA attn": {
    desc: "Interleaves Mamba-2 state-space layers — whose memory scales linearly with sequence length rather than quadratically — with a few grouped-query attention layers for exact recall. Basis of the Nemotron 3 hybrid.",
    paper: { label: "Mamba-2 (arXiv 2405.21060)", url: "https://arxiv.org/abs/2405.21060" },
  },
  "iRoPE (interleaved RoPE/NoPE)": {
    desc: "Llama 4 Scout's long-context trick: interleaves layers using rotary position embeddings (RoPE) with layers that use no positional encoding (NoPE), plus inference-time attention-temperature scaling, enabling length generalization to 10M tokens.",
    paper: { label: "RoPE / RoFormer (arXiv 2104.09864)", url: "https://arxiv.org/abs/2104.09864" },
  },
  "Sliding-window + global": {
    desc: "Alternates cheap local sliding-window attention (each token attends to a fixed nearby window) with occasional global-attention layers; Gemma keeps the final layer global to preserve whole-context awareness.",
    paper: { label: "Longformer sliding window (arXiv 2004.05150)", url: "https://arxiv.org/abs/2004.05150" },
  },
  "MSA sparse attention": {
    desc: "MiniMax Sparse Attention — a sparse scheme that restricts each query to a selected subset of keys, making the 1M-token window tractable. Vendor-specific; limited public detail.",
    paper: { label: "Native Sparse Attention (arXiv 2502.11089)", url: "https://arxiv.org/abs/2502.11089" },
  },
  "Sparse + long-context": {
    desc: "Reported sparse-attention family used by the closed flagships for long context; exact mechanism unpublished. Generally restricts attention to a subset of positions to avoid quadratic cost.",
    paper: null,
  },
  "Undisclosed": {
    desc: "The provider has not published its attention mechanism. Assumed to be a transformer attention variant, but specifics are unknown.",
    paper: null,
  },
};

// Foundational papers per architecture component, keyed by arch string.
const ARCH_PAPERS = {
  "Dense": [{ label: "Transformer — Attention Is All You Need (1706.03762)", url: "https://arxiv.org/abs/1706.03762" }],
  "Sparse MoE": [{ label: "Sparse MoE layer (1701.06538)", url: "https://arxiv.org/abs/1701.06538" }, { label: "Switch Transformer (2101.03961)", url: "https://arxiv.org/abs/2101.03961" }],
  "MoE": [{ label: "Sparse MoE layer (1701.06538)", url: "https://arxiv.org/abs/1701.06538" }],
  "MoE + linear attn": [{ label: "Switch Transformer (2101.03961)", url: "https://arxiv.org/abs/2101.03961" }, { label: "Gated Linear Attention (2312.06635)", url: "https://arxiv.org/abs/2312.06635" }],
  "Hybrid Mamba-MoE": [{ label: "Mamba-2 (2405.21060)", url: "https://arxiv.org/abs/2405.21060" }, { label: "Switch Transformer / MoE (2101.03961)", url: "https://arxiv.org/abs/2101.03961" }],
  "Hybrid: KDA + MoE": [{ label: "Gated DeltaNet — delta-rule lineage (2412.06464)", url: "https://arxiv.org/abs/2412.06464" }, { label: "Switch Transformer / MoE (2101.03961)", url: "https://arxiv.org/abs/2101.03961" }],
  "Hybrid: Gated DeltaNet + MoE": [{ label: "Gated DeltaNet (2412.06464)", url: "https://arxiv.org/abs/2412.06464" }, { label: "Switch Transformer / MoE (2101.03961)", url: "https://arxiv.org/abs/2101.03961" }],
  "Hybrid: Gated DeltaNet (dense)": [{ label: "Gated DeltaNet (2412.06464)", url: "https://arxiv.org/abs/2412.06464" }],
  "MoE + Gated DeltaNet": [{ label: "Gated DeltaNet (2412.06464)", url: "https://arxiv.org/abs/2412.06464" }, { label: "Switch Transformer / MoE (2101.03961)", url: "https://arxiv.org/abs/2101.03961" }],
  "MoE (reported)": [{ label: "Sparse MoE layer (1701.06538)", url: "https://arxiv.org/abs/1701.06538" }],
  "Undisclosed": [],
};


const COLUMNS = [
  { key: "name", label: "Model", numeric: false },
  { key: "intel", label: "Intelligence", numeric: true, sub: "Artificial Analysis",
    tip: "Artificial Analysis Intelligence Index v4.1 — a composite of 9 evaluations (GDPval-AA v2, τ²-Banking, Terminal-Bench v2.1, SciCode, Humanity's Last Exam, GPQA Diamond, CritPt, AA-Omniscience, AA-LCR). Leaderboard snapshot 26 July 2026. “—” = not on the AA leaderboard." },
  { key: "released", label: "Released", numeric: true },
  { key: "provider", label: "Provider", numeric: false },
  { key: "type", label: "Class", numeric: false },
  { key: "arch", label: "Architecture", numeric: false },
  { key: "params", label: "Total params", numeric: false },
  { key: "active", label: "Active params", numeric: false },
  { key: "attn", label: "Attention", numeric: false },
  { key: "modality", label: "Modality", numeric: false },
  { key: "context", label: "Context", numeric: true },
  { key: "maxOut", label: "Max out", numeric: true },
  { key: "license", label: "License", numeric: false },
];

function fmtTokens(n) {
  if (n == null) return "—";
  if (n >= 1000000) return (n / 1000000) % 1 === 0 ? `${n / 1000000}M` : `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}
function paramSort(v) {
  if (v === "—") return -1;
  const m = String(v).match(/([\d.]+)\s*([TBM]?)/);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  if (m[2] === "T") n *= 1000;
  if (m[2] === "M") n /= 1000;
  return n;
}
// Sum disclosed token counts across stages -> { total: "XXT"|null, hasEst: bool }.
function totalTokens(training) {
  if (!training) return null;
  let billions = 0, sawNum = false, hasEst = false;
  for (const st of training) {
    if (!st.tokens) continue;
    const m = String(st.tokens).match(/([\d.]+)\s*([TBM])/);
    if (!m) continue;
    sawNum = true;
    if (String(st.tokens).startsWith("~")) hasEst = true;
    let n = parseFloat(m[1]);
    if (m[2] === "T") n *= 1000;
    else if (m[2] === "M") n /= 1000;
    billions += n;
  }
  if (!sawNum) return null;
  let total;
  if (billions >= 1000) {
    const t = billions / 1000;
    total = `${(t % 1 === 0 ? t : t.toFixed(1))}T`;
  } else {
    total = `${Math.round(billions)}B`;
  }
  return { total, hasEst };
}

export default function FrontierModelsTable() {
  const [sortKey, setSortKey] = useState("intel");
  const [sortDir, setSortDir] = useState("desc");
  const [typeFilter, setTypeFilter] = useState("All");
  const [archFilter, setArchFilter] = useState("All");
  const [weightFilter, setWeightFilter] = useState("All");
  const [yearFilter, setYearFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [tip, setTip] = useState(null); // { text, x, y }
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark"
  );
  const [lightbox, setLightbox] = useState(null); // { src, alt, href }
  const [reader, setReader] = useState(null); // full-text reading view for one model

  // The detail row's <td> spans the full 1240px+ table, so its contents would
  // scroll sideways with the table. Pinning the panel to the scrollport instead
  // needs the wrapper's visible width, remeasured on resize.
  const wrapRef = useRef(null);
  const [wrapW, setWrapW] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setWrapW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toggleTheme = useCallback(() => {
    setDark((d) => {
      const next = !d;
      const root = document.documentElement;
      if (next) root.setAttribute("data-theme", "dark");
      else root.removeAttribute("data-theme");
      try { localStorage.setItem("fmt-theme", next ? "dark" : "light"); } catch (e) {}
      return next;
    });
  }, []);

  // Esc closes whichever overlay is open.
  useEffect(() => {
    if (!lightbox && !reader) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (lightbox) setLightbox(null);
      else setReader(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, reader]);

  const types = ["All", "Frontier", "Mid", "SLM"];
  const archs = ["All", "Dense", "MoE", "Undisclosed"];
  const weights = ["All", "Open weights", "Proprietary"];
  const years = ["All", ...Array.from(new Set(MODELS.map((m) => m.released.split("/")[0]))).sort()];

  const rows = useMemo(() => {
    let r = MODELS.filter((m) => {
      if (typeFilter !== "All" && m.type !== typeFilter) return false;
      if (archFilter === "Dense" && m.arch !== "Dense") return false;
      if (archFilter === "MoE" && !m.arch.includes("MoE")) return false;
      if (archFilter === "Undisclosed" && m.arch !== "Undisclosed") return false;
      if (weightFilter === "Open weights" && !m.open) return false;
      if (weightFilter === "Proprietary" && m.open) return false;
      if (yearFilter !== "All" && m.released.split("/")[0] !== yearFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!m.name.toLowerCase().includes(q) && !m.provider.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    r = [...r].sort((a, b) => {
      let av, bv;
      if (sortKey === "context" || sortKey === "maxOut") {
        av = a[sortKey] == null ? -1 : +a[sortKey];
        bv = b[sortKey] == null ? -1 : +b[sortKey];
      }
      else if (sortKey === "released") {
        const toNum = (s) => { const [y, m] = String(s).split("/").map(Number); return y * 12 + (m - 1); };
        av = toNum(a.released); bv = toNum(b.released);
      }
      else if (sortKey === "intel") {
        av = a.intel == null ? -1 : a.intel;
        bv = b.intel == null ? -1 : b.intel;
      }
      else if (sortKey === "params" || sortKey === "active") { av = paramSort(a[sortKey]); bv = paramSort(b[sortKey]); }
      else { av = String(a[sortKey]).toLowerCase(); bv = String(b[sortKey]).toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return r;
  }, [sortKey, sortDir, typeFilter, archFilter, weightFilter, yearFilter, query]);

  function toggleSort(key) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      const numericish = ["context", "maxOut", "params", "active"].includes(key);
      setSortDir(numericish ? "desc" : "asc");
    }
  }

  return (
    <div style={S.page}>
      <div style={S.shell}>
        <header style={S.header}>
          <div style={S.eyebrowRow}>
            <div style={{ ...S.eyebrow, marginBottom: 0 }}>Model landscape · July 2026</div>
            <button
              type="button"
              onClick={toggleTheme}
              style={S.themeBtn}
              aria-pressed={dark}
              aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
              title={dark ? "Switch to light theme" : "Switch to dark theme"}
            >
              <span aria-hidden="true">{dark ? "☀" : "☾"}</span>
              {dark ? "Light" : "Dark"}
            </button>
          </div>
          <h1 style={S.title}>The Model Atlas</h1>
          <p style={S.sub}>
            A living map of how frontier and small language models are actually built — architecture,
            attention, training pipelines and data curricula, sourced from primary technical reports.
            Built for engineers and researchers training their own. Sort or filter any column; tap a row
            to see its architecture and a stage-by-stage training pipeline with disclosed token counts.
          </p>
        </header>

        <div style={S.legend}>
          <span style={S.legendItem}><span style={{ ...S.swatch, background: ARCH_COLORS["Dense"] }} />Dense — all params active every token</span>
          <span style={S.legendItem}><span style={{ ...S.swatch, background: ARCH_COLORS["Sparse MoE"] }} />MoE — router fires a subset of experts</span>
          <span style={S.legendItem}><span style={{ ...S.swatch, background: ARCH_COLORS["Hybrid Mamba-MoE"] }} />Mamba hybrid — Mamba-2 SSM + MoE + attention</span>
          <span style={S.legendItem}><span style={{ ...S.swatch, background: ARCH_COLORS["Hybrid: Gated DeltaNet + MoE"] }} />DeltaNet hybrid — Gated DeltaNet + gated attention (±MoE)</span>
          <span style={S.legendItem}><span style={{ ...S.swatch, background: ARCH_COLORS["Hybrid: KDA + MoE"] }} />KDA hybrid — Kimi Delta Attention + full attention + MoE</span>
          <span style={S.legendItem}><span style={{ ...S.swatch, background: ARCH_COLORS["Undisclosed"] }} />Undisclosed — closed flagship</span>
        </div>

        <div style={S.controls}>
          <input style={S.search} placeholder="Search model or provider…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
          <div style={S.segGroup}>
            {types.map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)}
                style={{ ...S.seg, ...(typeFilter === t ? S.segOn : {}) }}>{t}</button>
            ))}
          </div>
          <div style={S.segGroup}>
            {archs.map((a) => (
              <button key={a} onClick={() => setArchFilter(a)}
                style={{ ...S.seg, ...(archFilter === a ? S.segOn : {}) }}>{a}</button>
            ))}
          </div>
          <div style={S.segGroup}>
            {weights.map((w) => (
              <button key={w} onClick={() => setWeightFilter(w)}
                style={{ ...S.seg, ...(weightFilter === w ? S.segOn : {}) }}>{w}</button>
            ))}
          </div>
          <div style={S.segGroup}>
            {years.map((y) => (
              <button key={y} onClick={() => setYearFilter(y)}
                style={{ ...S.seg, ...(yearFilter === y ? S.segOn : {}) }}>{y}</button>
            ))}
          </div>
        </div>

        <div style={S.count}>{rows.length} model{rows.length !== 1 ? "s" : ""} · tap a row to expand</div>

        <div style={S.tableWrap} ref={wrapRef}>
          <table style={S.table}>
            <thead>
              <tr>
                {COLUMNS.map((c) => {
                  const active = c.key === sortKey;
                  return (
                    <th key={c.key} onClick={() => toggleSort(c.key)}
                      style={{ ...S.th, textAlign: c.numeric ? "right" : "left",
                        color: active ? "var(--ink)" : "var(--ink-faint)" }}
                      onMouseEnter={c.tip ? (e) => setTip({ text: c.tip, x: e.clientX, y: e.clientY }) : undefined}
                      onMouseMove={c.tip ? (e) => setTip({ text: c.tip, x: e.clientX, y: e.clientY }) : undefined}
                      onMouseLeave={c.tip ? () => setTip(null) : undefined}>
                      <span style={S.thInner}>{c.label}
                        <span style={{ ...S.arrow, opacity: active ? 1 : 0.25 }}>
                          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </span>
                      {c.sub && <span style={S.thSub}>{c.sub}</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => {
                const tc = TYPE_COLORS[m.type];
                const ac = ARCH_COLORS[m.arch] || "var(--fallback)";
                const isOpen = expanded === m.name;
                return (
                  <React.Fragment key={m.name}>
                    <tr onClick={() => setExpanded(isOpen ? null : m.name)}
                      style={{ ...S.tr, background: isOpen ? "var(--row-open)" : i % 2 ? "var(--row-alt)" : "transparent",
                        cursor: "pointer" }}>
                      <td style={{ ...S.td, ...S.modelCell }}>
                        <span style={{ ...S.caret, transform: isOpen ? "rotate(90deg)" : "none" }}>▸</span>
                        {m.name}
                      </td>
                      <td style={{ ...S.td }}>
                        {m.intel == null ? (
                          <span style={S.intelNA}>—</span>
                        ) : (
                          <span style={S.intelWrap}>
                            <span style={S.intelTrack}>
                              <span style={{ ...S.intelFill, width: `${m.intel}%`,
                                background: m.intel >= 55 ? "var(--intel-hi)" : m.intel >= 40 ? "var(--intel-mid)" : "var(--intel-lo)" }} />
                            </span>
                            <span style={S.intelVal}>{m.intel}</span>
                          </span>
                        )}
                      </td>
                      <td style={{ ...S.td, ...S.num, ...S.releasedCell }}>{m.released}</td>
                      <td style={S.td}>{m.provider}</td>
                      <td style={S.td}>
                        <span style={{ ...S.pill, color: tc.fg }}>
                          <span style={{ ...S.pillDot, background: tc.dot }} />{m.type}
                        </span>
                      </td>
                      <td style={S.td}>
                        <span style={{ ...S.archTag, color: ac, borderColor: ac + "55" }}>{m.arch}</span>
                      </td>
                      <td style={S.td}>{m.params}</td>
                      <td style={{ ...S.td, color: m.active !== "—" && m.active !== m.params ? "var(--arch-moe)" : "var(--ink)" }}>{m.active}</td>
                      <td style={S.td}>
                        {(() => {
                          const info = ATTENTION_INFO[m.attn];
                          return info ? (
                            <span style={S.attnHover}
                              onMouseEnter={(e) => setTip({ text: info.desc, x: e.clientX, y: e.clientY })}
                              onMouseMove={(e) => setTip({ text: info.desc, x: e.clientX, y: e.clientY })}
                              onMouseLeave={() => setTip(null)}>
                              {m.attn}
                            </span>
                          ) : m.attn;
                        })()}
                      </td>
                      <td style={S.td}>{m.modality}</td>
                      <td style={{ ...S.td, ...S.num }}>{fmtTokens(m.context)}</td>
                      <td style={{ ...S.td, ...S.num }}>{fmtTokens(m.maxOut)}</td>
                      <td style={{ ...S.td, color: m.open ? "var(--open-fg)" : "var(--ink-faint)" }}>{m.license}</td>
                    </tr>
                    {isOpen && (
                      <tr style={{ background: "var(--detail-bg)" }}>
                        <td colSpan={COLUMNS.length} style={S.detailCell}>
                          <div style={{ ...S.detailSticky, width: wrapW || "100%" }}>
                          <div style={S.detailInner}>
                            <div style={S.detailCols}>
                              <div style={S.detailArchCol}>
                                <span style={{ ...S.detailLabel, color: ac }}>Architecture notes</span>
                                <p style={{ ...S.detailText, ...(m.note.length > 420 ? S.clampNote : {}) }}>{m.note}</p>
                                {m.note.length > 420 && (
                                  <button type="button" style={S.moreBtn}
                                    onClick={(e) => { e.stopPropagation(); setReader(m); }}>
                                    Show more <span aria-hidden="true">→</span>
                                  </button>
                                )}
                                {DIAGRAMS[m.name] && (() => {
                                  const d = DIAGRAMS[m.name];
                                  const thumb = `${DIAGRAM_BASE}/images/architectures/thumbnails/${d.slug}.webp`;
                                  const full = `${DIAGRAM_BASE}/images/architectures/${d.slug}.webp`;
                                  const localThumb = `${LOCAL_DIAGRAM_BASE}/thumbnails/${d.slug}.webp`;
                                  const localFull = `${LOCAL_DIAGRAM_BASE}/full/${d.slug}.webp`;
                                  const alt = `Architecture diagram of ${d.title}`;
                                  return (
                                    <div style={S.diagramBlock}>
                                      <span style={{ ...S.detailLabel, color: "var(--ink-faint)" }}>Architecture diagram</span>
                                      <button
                                        type="button"
                                        style={S.diagramBtn}
                                        title="Click to enlarge"
                                        aria-label={`Enlarge ${alt}`}
                                        onClick={(e) => { e.stopPropagation(); setLightbox({ src: full, localSrc: localFull, alt, title: d.title }); }}
                                      >
                                        <img src={thumb} alt={alt} loading="lazy" decoding="async" style={S.diagramImg}
                                          onError={(e) => { if (!e.currentTarget.dataset.fallenBack) { e.currentTarget.dataset.fallenBack = "1"; e.currentTarget.src = localThumb; } }} />
                                        <span style={S.diagramZoom} aria-hidden="true">⤢</span>
                                      </button>
                                      <div style={S.diagramCredit}>
                                        Diagram © <a style={S.creditLink} href={DIAGRAM_CREDIT} target="_blank"
                                          rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Sebastian Raschka</a>
                                        {" "}· LLM Architecture Gallery
                                      </div>
                                    </div>
                                  );
                                })()}
                                <span style={{ ...S.detailLabel, color: "var(--ink-faint)", marginTop: 16 }}>Sources</span>
                                <div style={S.linkRow}>
                                  <span style={S.linkTag}>Report</span>
                                  {REPORTS[m.name] ? (
                                    <a style={S.link} href={REPORTS[m.name].url} target="_blank" rel="noopener noreferrer">
                                      {REPORTS[m.name].label} ↗
                                    </a>
                                  ) : <span style={S.linkNA}>none published</span>}
                                </div>
                                {m.open && HF_LINKS[m.name] && (
                                  <div style={S.linkRow}>
                                    <span style={S.linkTag}>Weights</span>
                                    <a style={S.link} href={`https://huggingface.co/${HF_LINKS[m.name]}`}
                                      target="_blank" rel="noopener noreferrer">
                                      {HF_LINKS[m.name]} ↗
                                    </a>
                                  </div>
                                )}
                                {(() => {
                                  const archPapers = ARCH_PAPERS[m.arch] || [];
                                  const attnPaper = ATTENTION_INFO[m.attn] && ATTENTION_INFO[m.attn].paper;
                                  const all = [...archPapers];
                                  if (attnPaper && !all.some((p) => p.url === attnPaper.url)) all.push(attnPaper);
                                  if (all.length === 0) return null;
                                  return (
                                    <div style={S.linkRow}>
                                      <span style={S.linkTag}>Papers</span>
                                      <span style={S.linkList}>
                                        {all.map((p, pi) => (
                                          <a key={pi} style={S.link} href={p.url} target="_blank" rel="noopener noreferrer">
                                            {p.label} ↗
                                          </a>
                                        ))}
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                              <div style={S.detailTrainCol}>
                                <span style={{ ...S.detailLabel, color: "var(--clay)" }}>
                                  {(() => {
                                    const tt = totalTokens(m.training);
                                    return tt
                                      ? `Training pipeline · ~${tt.total} disclosed${tt.hasEst ? " (incl. est.)" : ""}`
                                      : "Training pipeline";
                                  })()}
                                </span>
                                {m.training ? (
                                  <>
                                  <div style={S.pipeline}>
                                    {m.training.map((st, si) => (
                                      <React.Fragment key={si}>
                                        <div style={S.stage}>
                                          <div style={S.stageHead}>
                                            <span style={S.stageNum}>{si + 1}</span>
                                            <span style={S.stageName}>{st.label}</span>
                                          </div>
                                          {st.tokens && (
                                            <span style={{ ...S.stageTokens, ...(String(st.tokens).startsWith("~") ? S.stageTokensEst : {}) }}>
                                              {st.tokens} tokens{String(st.tokens).startsWith("~") ? " (est.)" : ""}
                                            </span>
                                          )}
                                          <p style={{ ...S.stageDetail, ...(st.detail.length > 190 ? S.clampStage : {}) }}>{st.detail}</p>
                                          {st.curriculum && <span style={S.curriculumFlag}>◆ data curriculum available</span>}
                                        </div>
                                        {si < m.training.length - 1 && <span style={S.pipeArrow}>→</span>}
                                      </React.Fragment>
                                    ))}
                                  </div>
                                  {(m.training.some((st) => st.detail.length > 190 || st.curriculum) ) && (
                                    <button type="button" style={S.moreBtn}
                                      onClick={(e) => { e.stopPropagation(); setReader(m); }}>
                                      Read full pipeline <span aria-hidden="true">→</span>
                                    </button>
                                  )}
                                  </>
                                ) : (
                                  <p style={S.detailNA}>
                                    {m.open
                                      ? "This lab hasn't published a detailed training breakdown or token counts."
                                      : "Closed model — the provider publishes no training stages or token counts."}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <section style={S.synthesis}>
          <h2 style={S.synthHead}>What they share, where they split</h2>
          <div style={S.synthGrid}>
            <div style={S.synthCard}>
              <div style={S.synthNum}>01</div>
              <h3 style={S.synthTitle}>Common ground</h3>
              <p style={S.synthBody}>
                All are decoder-only transformers trained on next-token prediction, all use some grouped or
                compressed form of attention to cut the quadratic cost of long sequences, and nearly all the 2026
                flagships now ship 1M+ token windows. Tool use and a "thinking" mode have become baseline rather
                than differentiators.
              </p>
            </div>
            <div style={S.synthCard}>
              <div style={{ ...S.synthNum, color: "var(--arch-moe)" }}>02</div>
              <h3 style={S.synthTitle}>Dense vs MoE</h3>
              <p style={S.synthBody}>
                The sharpest structural split. Dense models (Gemma 4 31B, the Phi and Llama-3.2 SLMs, Command A)
                fire every parameter per token — simpler and predictable, but compute scales with size. MoE models
                route each token to a few experts, so a 1.6T model like DeepSeek V4 Pro only spends 49B per token.
                Within MoE the design still varies: Llama 4 uses few large experts (16), Gemma 4 uses many small
                ones (128).
              </p>
            </div>
            <div style={S.synthCard}>
              <div style={{ ...S.synthNum, color: "var(--type-frontier-dot)" }}>03</div>
              <h3 style={S.synthTitle}>The attention arms race</h3>
              <p style={S.synthBody}>
                Long context is won at the attention layer. DeepSeek interleaves compressed-sparse and chunked
                attention; Llama 4 Scout's interleaved RoPE/NoPE reaches 10M tokens; Gemma alternates
                sliding-window with global layers; Qwen mixes linear and full attention. NVIDIA's Nemotron 3 goes
                further, splicing in Mamba-2 state-space layers whose memory scales linearly rather than
                quadratically. The closed flagships almost certainly do similar things but publish nothing.
              </p>
            </div>
            <div style={S.synthCard}>
              <div style={{ ...S.synthNum, color: "var(--open-fg)" }}>04</div>
              <h3 style={S.synthTitle}>"Small" is now about active params</h3>
              <p style={S.synthBody}>
                The SLM line has blurred. Mistral Small 4 carries 119B total weights but activates only 6.5B, giving
                it SLM-class inference cost with large-model knowledge. Meanwhile truly tiny dense models
                (FunctionGemma 270M, Llama 3.2 1B) target phones and IoT. Open weights and permissive licensing
                (Apache 2.0, MIT) cluster heavily at this end.
              </p>
            </div>
          </div>
        </section>

        {CHANGELOG.items.length > 0 && (
          <section style={S.changelog}>
            <div style={S.changelogHead}>
              <span style={S.changelogTitle}>Gallery changelog</span>
              <a style={S.changelogAll} href="https://sebastianraschka.com/llm-architecture-gallery/changelog/"
                target="_blank" rel="noopener noreferrer">All updates ↗</a>
            </div>
            <p style={S.changelogNote}>
              Latest entries from Sebastian Raschka's LLM Architecture Gallery, the source of the diagrams above.
              Pulled from its RSS feed when this page was built{CHANGELOG.fetched ? ` (${CHANGELOG.fetched})` : ""} and
              refreshed daily — the feed sends no CORS header, so it is read at build time rather than in your browser.
            </p>
            <ul style={S.changelogList}>
              {CHANGELOG.items.slice(0, 6).map((c, ci) => (
                <li key={ci} style={S.changelogItem}>
                  <span style={S.changelogDate}>{c.date || "—"}</span>
                  <a style={S.changelogLink} href={c.link} target="_blank" rel="noopener noreferrer">{c.title}</a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer style={S.footer}>
          <span>Training stages and token counts are from each model's technical report or model card; "disclosed" totals sum only the stages with published numbers, so true totals are higher. Closed flagships publish no training breakdown.</span>
          <span>Intelligence = Artificial Analysis Intelligence Index v4.1, leaderboard snapshot 26 July 2026 (artificialanalysis.ai). v4.1 combines 9 evaluations: GDPval-AA v2, 𝜏³-Banking, Terminal-Bench v2.1, SciCode, Humanity's Last Exam, GPQA Diamond, CritPt, AA-Omniscience and AA-LCR. Where AA lists several reasoning-effort variants, the highest-scoring variant is shown; "—" = not on the AA leaderboard.</span>
          <span>Architecture fields (decoder type, attention, parameter and context figures) for open-weight models were cross-checked against Sebastian Raschka's LLM Architecture Gallery (sebastianraschka.com/llm-architecture-gallery), which derives them from model config.json files and technical reports.</span>
          <span>Closed-flagship architecture fields say "Undisclosed" or "reported" — vendors publish few internals; do not treat reported MoE labels as confirmed counts.</span>
          <span>Context = max input window. Compiled from public provider docs, model cards and third-party analyses, July 2026; figures shift frequently.</span>
        </footer>
      </div>
      {tip && (
        <div style={{ ...S.tooltip,
          left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 320),
          top: tip.y + 16 }}>
          {tip.text}
        </div>
      )}

      {reader && (
        <div style={S.lightbox} role="dialog" aria-modal="true"
          aria-label={`${reader.name} — full detail`} onClick={() => setReader(null)}>
          <div style={S.readerInner} onClick={(e) => e.stopPropagation()}>
            <div style={S.readerBar}>
              <div>
                <div style={S.readerEyebrow}>{reader.provider} · {reader.released}</div>
                <h2 style={S.readerTitle}>{reader.name}</h2>
              </div>
              <button type="button" style={S.lightboxClose} onClick={() => setReader(null)} aria-label="Close">✕</button>
            </div>

            <div style={S.readerSection}>
              <span style={{ ...S.detailLabel, color: ARCH_COLORS[reader.arch] || "var(--fallback)" }}>Architecture notes</span>
              <p style={S.readerBody}>{reader.note}</p>
            </div>

            {reader.training && (
              <div style={S.readerSection}>
                <span style={{ ...S.detailLabel, color: CLAY }}>Training pipeline</span>
                <ol style={S.readerStages}>
                  {reader.training.map((st, si) => (
                    <li key={si} style={S.readerStage}>
                      <div style={S.readerStageHead}>
                        <span style={S.stageNum}>{si + 1}</span>
                        <span style={S.readerStageName}>{st.label}</span>
                        {st.tokens && (
                          <span style={{ ...S.stageTokens, ...(String(st.tokens).startsWith("~") ? S.stageTokensEst : {}), marginBottom: 0 }}>
                            {st.tokens} tokens{String(st.tokens).startsWith("~") ? " (est.)" : ""}
                          </span>
                        )}
                      </div>
                      <p style={S.readerBody}>{st.detail}</p>
                      {st.curriculum && (
                        <div style={S.curriculum}>
                          <span style={S.curriculumLabel}>Data curriculum</span>
                          <p style={S.curriculumText}>{st.curriculum}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div style={S.readerFoot}>
              <span style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {REPORTS[reader.name] && (
                  <a style={S.creditLink} href={REPORTS[reader.name].url} target="_blank" rel="noopener noreferrer">
                    {REPORTS[reader.name].label} ↗
                  </a>
                )}
                {reader.open && HF_LINKS[reader.name] && (
                  <a style={S.creditLink} href={`https://huggingface.co/${HF_LINKS[reader.name]}`} target="_blank" rel="noopener noreferrer">
                    {HF_LINKS[reader.name]} ↗
                  </a>
                )}
              </span>
              <span style={{ color: INK_FAINT }}>Press Esc to close</span>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          style={S.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.alt}
          onClick={() => setLightbox(null)}
        >
          <div style={S.lightboxInner} onClick={(e) => e.stopPropagation()}>
            <div style={S.lightboxBar}>
              <span style={S.lightboxTitle}>{lightbox.title}</span>
              <button type="button" style={S.lightboxClose} onClick={() => setLightbox(null)} aria-label="Close diagram">
                ✕
              </button>
            </div>
            <img src={lightbox.src} alt={lightbox.alt} style={S.lightboxImg}
              onError={(e) => { if (lightbox.localSrc && !e.currentTarget.dataset.fallenBack) { e.currentTarget.dataset.fallenBack = "1"; e.currentTarget.src = lightbox.localSrc; } }} />
            <div style={S.lightboxCredit}>
              Diagram © <a style={S.creditLink} href={DIAGRAM_CREDIT} target="_blank" rel="noopener noreferrer">
                Sebastian Raschka
              </a>{" "}· LLM Architecture Gallery · press Esc to close
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Claude-style theme: warm paper background, clay accent, serif display =====
const mono = "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace";
const serif = "'Tiempos Text', 'Georgia', 'Times New Roman', serif";
const sans = "'Styrene B', 'Inter', system-ui, -apple-system, sans-serif";
const CLAY = "var(--clay)";      // Claude clay/terracotta accent
const CLAY_SOFT = "var(--clay-soft)"; // soft clay tint
const PAPER = "var(--paper)";     // warm paper bg
const CARD = "var(--card)";      // raised surface
const INK = "var(--ink)";       // primary text
const INK_SOFT = "var(--ink-soft)";  // secondary text
const INK_FAINT = "var(--ink-faint)"; // tertiary
const LINE = "var(--line)";      // hairline border
const LINE_SOFT = "var(--line-soft)";
const S = {
  page: { background: PAPER, minHeight: "100vh", padding: "40px 22px", color: INK,
    fontFamily: sans },
  shell: { maxWidth: 1240, margin: "0 auto" },
  header: { marginBottom: 26 },
  eyebrow: { fontFamily: mono, fontSize: 11.5, letterSpacing: "0.16em", textTransform: "uppercase",
    color: CLAY, marginBottom: 14 },
  eyebrowRow: { display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 16, marginBottom: 14 },
  themeBtn: { display: "inline-flex", alignItems: "center", gap: 7, background: CARD,
    border: `1px solid ${LINE}`, borderRadius: 999, padding: "7px 14px", cursor: "pointer",
    fontFamily: mono, fontSize: 11.5, letterSpacing: "0.1em", textTransform: "uppercase",
    color: INK_SOFT, flexShrink: 0, boxShadow: "var(--shadow)" },
  title: { fontFamily: serif, fontSize: "clamp(30px, 5vw, 50px)", fontWeight: 500, letterSpacing: "-0.015em",
    margin: "0 0 14px", lineHeight: 1.04, color: INK },
  sub: { color: INK_SOFT, fontSize: 15.5, lineHeight: 1.6, maxWidth: 700, margin: 0 },
  legend: { display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 20, fontSize: 12.5, color: INK_SOFT },
  legendItem: { display: "inline-flex", alignItems: "center", gap: 7 },
  swatch: { width: 10, height: 10, borderRadius: 3, display: "inline-block" },
  controls: { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 },
  search: { background: CARD, border: `1px solid ${LINE}`, borderRadius: 9, padding: "9px 13px",
    color: INK, fontSize: 14, minWidth: 220, flex: "1 1 220px", outline: "none", fontFamily: sans },
  segGroup: { display: "inline-flex", background: CARD, border: `1px solid ${LINE}`,
    borderRadius: 9, padding: 3, gap: 2 },
  seg: { background: "transparent", border: "none", color: INK_SOFT, padding: "6px 12px",
    fontSize: 13, borderRadius: 6, cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap", fontFamily: sans },
  segOn: { background: CLAY, color: "var(--on-clay)" },
  count: { fontFamily: mono, fontSize: 12, color: INK_FAINT, marginBottom: 10 },
  tableWrap: { overflowX: "auto", border: `1px solid ${LINE}`, borderRadius: 14, background: CARD,
    boxShadow: "0 1px 3px rgba(43,42,39,0.04)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1240 },
  th: { padding: "14px 12px", fontWeight: 600, fontSize: 11.5, cursor: "pointer", userSelect: "none",
    borderBottom: `1px solid ${LINE}`, position: "sticky", top: 0, background: CARD, whiteSpace: "nowrap",
    color: INK_SOFT },
  thInner: { display: "inline-flex", alignItems: "center", gap: 5 },
  // Attribution for the Intelligence column, sitting under its header label.
  thSub: { display: "block", fontFamily: mono, fontSize: 9, letterSpacing: "0.06em",
    textTransform: "none", color: INK_FAINT, fontWeight: 400, marginTop: 2, cursor: "help" },
  arrow: { fontFamily: mono, fontSize: 11 },
  tr: { transition: "background 0.1s" },
  td: { padding: "12px 12px", borderBottom: `1px solid ${LINE_SOFT}`, color: INK, whiteSpace: "nowrap",
    verticalAlign: "middle" },
  modelCell: { fontWeight: 600, color: INK },
  releasedCell: { color: INK_SOFT, fontSize: 12.5 },
  caret: { display: "inline-block", marginRight: 8, color: CLAY, fontSize: 10, transition: "transform 0.15s", verticalAlign: "middle" },
  num: { textAlign: "right", fontFamily: mono, fontVariantNumeric: "tabular-nums", color: INK },
  intelWrap: { display: "inline-flex", alignItems: "center", gap: 8, minWidth: 92 },
  intelTrack: { position: "relative", width: 56, height: 6, borderRadius: 3, background: LINE,
    overflow: "hidden", flexShrink: 0 },
  intelFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 3 },
  intelVal: { fontFamily: mono, fontSize: 12, fontVariantNumeric: "tabular-nums", color: INK, minWidth: 18 },
  intelNA: { fontFamily: mono, fontSize: 12, color: INK_FAINT },
  pill: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 },
  pillDot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block" },
  archTag: { fontSize: 11.5, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
    border: "1px solid", whiteSpace: "nowrap" },
  detailCell: { padding: 0, borderBottom: `1px solid ${LINE}` },
  // Pinned to the left edge of the scrollport so the panel stays put while the
  // table scrolls sideways underneath it. Width is set from the wrapper at runtime.
  detailSticky: { position: "sticky", left: 0 },
  changelog: { marginTop: 34, padding: "20px 22px", background: CARD,
    border: `1px solid ${LINE}`, borderRadius: 14 },
  changelogHead: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 8 },
  changelogTitle: { fontFamily: mono, fontSize: 11.5, letterSpacing: "0.16em",
    textTransform: "uppercase", color: CLAY },
  changelogAll: { fontSize: 12, color: INK_SOFT, textDecoration: "underline", textUnderlineOffset: 2, flexShrink: 0 },
  changelogNote: { margin: "0 0 14px", fontSize: 12.5, lineHeight: 1.6, color: INK_FAINT, maxWidth: 720 },
  changelogList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 },
  changelogItem: { display: "flex", gap: 12, alignItems: "baseline", fontSize: 13, lineHeight: 1.5 },
  changelogDate: { fontFamily: mono, fontSize: 11.5, color: INK_FAINT, flexShrink: 0, minWidth: 82 },
  changelogLink: { color: INK, textDecoration: "none", borderBottom: `1px solid ${LINE}` },
  diagramBlock: { marginTop: 16 },
  diagramBtn: { display: "block", padding: 0, border: `1px solid ${LINE}`, borderRadius: 10,
    background: CARD, cursor: "zoom-in", overflow: "hidden", position: "relative",
    width: "100%", maxWidth: 300, lineHeight: 0 },
  diagramImg: { width: "100%", height: "auto", display: "block" },
  diagramZoom: { position: "absolute", right: 7, bottom: 7, width: 24, height: 24,
    display: "grid", placeItems: "center", borderRadius: 6, fontSize: 12,
    background: "var(--card)", border: `1px solid ${LINE}`, color: INK_SOFT, lineHeight: 1 },
  diagramCredit: { fontSize: 11, color: INK_FAINT, marginTop: 7, lineHeight: 1.5 },
  creditLink: { color: INK_SOFT, textDecoration: "underline", textUnderlineOffset: 2 },
  lightbox: { position: "fixed", inset: 0, zIndex: 100, background: "rgba(20,19,17,0.72)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" },
  // Reading view: generous measure and leading so long stage text is comfortable.
  readerInner: { background: CARD, border: `1px solid ${LINE}`, borderRadius: 16,
    padding: "26px 30px 24px", width: "min(760px, 94vw)", maxHeight: "92vh",
    overflow: "auto", cursor: "auto", boxShadow: "0 18px 50px rgba(0,0,0,0.35)" },
  readerBar: { display: "flex", alignItems: "flex-start", justifyContent: "space-between",
    gap: 18, marginBottom: 22, paddingBottom: 18, borderBottom: `1px solid ${LINE}` },
  readerEyebrow: { fontFamily: mono, fontSize: 10.5, letterSpacing: "0.12em",
    textTransform: "uppercase", color: INK_FAINT, marginBottom: 6 },
  readerTitle: { fontFamily: serif, fontSize: 27, fontWeight: 500, margin: 0,
    color: INK, letterSpacing: "-0.01em", lineHeight: 1.15 },
  readerSection: { marginBottom: 26 },
  readerBody: { margin: "0 0 0", fontSize: 14.5, lineHeight: 1.8, color: INK,
    maxWidth: "68ch", letterSpacing: "0.002em" },
  readerStages: { listStyle: "none", margin: "4px 0 0", padding: 0,
    display: "flex", flexDirection: "column", gap: 22 },
  readerStage: { paddingLeft: 0 },
  readerStageHead: { display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 9 },
  readerStageName: { fontSize: 15, fontWeight: 650, color: INK },
  curriculum: { marginTop: 11, padding: "11px 14px", background: "var(--detail-bg)",
    border: `1px solid ${LINE_SOFT}`, borderRadius: 9, borderLeft: `2px solid ${CLAY}` },
  curriculumLabel: { display: "block", fontFamily: mono, fontSize: 9.5, letterSpacing: "0.12em",
    textTransform: "uppercase", color: CLAY, marginBottom: 5 },
  curriculumText: { margin: 0, fontSize: 13, lineHeight: 1.7, color: INK_SOFT, maxWidth: "66ch" },
  readerFoot: { display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center",
    justifyContent: "space-between", paddingTop: 16, borderTop: `1px solid ${LINE}`,
    fontSize: 12, color: INK_SOFT },
  lightboxInner: { background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 14,
    maxWidth: "min(1100px, 96vw)", maxHeight: "94vh", overflow: "auto", cursor: "auto",
    boxShadow: "0 18px 50px rgba(0,0,0,0.35)" },
  lightboxBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 10 },
  lightboxTitle: { fontFamily: mono, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: INK_SOFT },
  lightboxClose: { background: "transparent", border: `1px solid ${LINE}`, borderRadius: 7,
    width: 28, height: 28, cursor: "pointer", color: INK_SOFT, fontSize: 13, lineHeight: 1, flexShrink: 0 },
  lightboxImg: { display: "block", maxWidth: "100%", height: "auto", borderRadius: 8 },
  lightboxCredit: { fontSize: 11, color: INK_FAINT, marginTop: 10, lineHeight: 1.5 },
  detailInner: { padding: "18px 18px 22px 34px", boxSizing: "border-box" },
  detailCols: { display: "flex", flexWrap: "wrap", gap: 30, alignItems: "flex-start" },
  detailArchCol: { flex: "1 1 280px", minWidth: 260, maxWidth: 460 },
  detailTrainCol: { flex: "2 1 480px", minWidth: 300 },
  detailLabel: { fontFamily: mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase",
    fontWeight: 700, display: "block", marginBottom: 10 },
  detailText: { margin: 0, fontSize: 14, lineHeight: 1.78, color: INK, letterSpacing: "0.002em" },
  // Collapsed previews: keep the panel scannable, full text lives in the reader.
  clampNote: { display: "-webkit-box", WebkitLineClamp: 7, WebkitBoxOrient: "vertical",
    overflow: "hidden" },
  clampStage: { display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical",
    overflow: "hidden" },
  moreBtn: { marginTop: 12, display: "inline-flex", alignItems: "center", gap: 7,
    background: "transparent", border: `1px solid ${LINE}`, borderRadius: 999,
    padding: "7px 15px", cursor: "pointer", fontFamily: mono, fontSize: 10.5,
    letterSpacing: "0.1em", textTransform: "uppercase", color: INK_SOFT },
  attnHover: { borderBottom: `1px dotted ${INK_FAINT}`, cursor: "help" },
  tooltip: { position: "fixed", zIndex: 50, maxWidth: 300, background: INK,
    border: "none", borderRadius: 9, padding: "10px 12px",
    fontSize: 12.5, lineHeight: 1.5, color: "var(--paper)", pointerEvents: "none",
    boxShadow: "0 10px 32px rgba(43,42,39,0.22)" },
  linkRow: { display: "flex", gap: 9, alignItems: "baseline", marginTop: 8, fontSize: 12.5, lineHeight: 1.5 },
  linkTag: { fontFamily: mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
    color: INK_FAINT, flexShrink: 0, paddingTop: 1, minWidth: 44 },
  linkList: { display: "flex", flexDirection: "column", gap: 4 },
  link: { color: CLAY, textDecoration: "none", borderBottom: `1px solid ${CLAY_SOFT}` },
  linkNA: { color: INK_FAINT, fontStyle: "italic" },
  detailNA: { margin: 0, fontSize: 13.5, lineHeight: 1.6, color: INK_SOFT, fontStyle: "italic" },
  pipeline: { display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 10 },
  stage: { flex: "1 1 210px", minWidth: 200, maxWidth: 310, background: CARD,
    border: `1px solid ${LINE}`, borderRadius: 10, padding: "14px 16px 16px" },
  stageHead: { display: "flex", alignItems: "center", gap: 7, marginBottom: 8 },
  stageNum: { fontFamily: mono, fontSize: 11, fontWeight: 700, color: "var(--on-clay)", background: CLAY,
    width: 18, height: 18, borderRadius: "50%", display: "inline-flex", alignItems: "center",
    justifyContent: "center", flexShrink: 0 },
  stageName: { fontSize: 13, fontWeight: 650, color: INK, lineHeight: 1.2 },
  stageTokens: { display: "inline-block", fontFamily: mono, fontSize: 11.5, fontWeight: 700,
    color: "var(--tok-ok-fg)", background: "var(--tok-ok-bg)", border: "1px solid var(--tok-ok-line)", borderRadius: 5,
    padding: "1px 6px", marginBottom: 6 },
  stageTokensEst: { color: "var(--tok-est-fg)", background: "var(--tok-est-bg)", border: "1px solid var(--tok-est-line)" },
  stageDetail: { margin: 0, fontSize: 12.5, lineHeight: 1.72, color: INK_SOFT },
  curriculumFlag: { display: "block", marginTop: 8, fontFamily: mono, fontSize: 9.5,
    letterSpacing: "0.04em", color: CLAY },
  pipeArrow: { display: "flex", alignItems: "center", color: CLAY, fontSize: 16, fontWeight: 700 },
  synthesis: { marginTop: 40 },
  synthHead: { fontFamily: serif, fontSize: 26, fontWeight: 500, letterSpacing: "-0.01em", margin: "0 0 18px", color: INK },
  synthGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 },
  synthCard: { background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "20px 20px 22px" },
  synthNum: { fontFamily: mono, fontSize: 13, fontWeight: 700, color: CLAY, marginBottom: 10 },
  synthTitle: { fontFamily: serif, fontSize: 17, fontWeight: 500, margin: "0 0 9px", color: INK },
  synthBody: { margin: 0, fontSize: 13, lineHeight: 1.65, color: INK_SOFT },
  footer: { marginTop: 30, display: "flex", flexDirection: "column", gap: 5,
    fontSize: 11.5, color: INK_FAINT, lineHeight: 1.55 },
};
