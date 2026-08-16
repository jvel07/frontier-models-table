import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { ProviderMark } from "./providerIcons.jsx";
import SiteNav from "./SiteNav.jsx";

// Data current as of June 2026. Compiled from public provider docs, model cards,
// and third-party architecture analyses. "—" = not publicly disclosed / N/A.
export const MODELS = [
  // ---- July 2026 wave (added after original build) ----
  { name: "Sarvam 105B", provider: "Sarvam AI", released: "2026/03", type: "Mid", arch: "Sparse MoE", params: "105B", active: "10.3B",
    attn: "MLA (Multi-head Latent Attn)", modality: "Text", context: 131072, maxOut: null, license: "Apache 2.0", open: true, intel: 12, codingAgent: null, codingAgentVia: null, agentic: null,
    training: [
      { label: "Pre-training", tokens: "12T", detail: "Trained from scratch on 12T tokens — notably fewer than the smaller 30B sibling's 16T. Corpus spans code, general web, specialised knowledge corpora, mathematics and multilingual content, with a substantial share of the budget allocated to the 10 most-spoken Indian languages. Run in three phases: long-horizon pre-training, mid-training, then a long-context extension phase." },
      { label: "SFT", tokens: null, detail: "Supervised fine-tuning on a large corpus of prompts curated for difficulty, quality and domain diversity, topped up with synthetic prompts generated from the pre-training domain mixture to fill underrepresented areas. Prompts are pre-filtered with open-source models and early checkpoints to drop anything trivially solvable or consistently unsolved, keeping the curriculum effective." },
      { label: "RL", tokens: null, detail: "Reinforcement learning as the final stage; Sarvam describes both models as reasoning models trained on in-house curated data at every stage. Specific RL algorithm and token budget not disclosed." },
    ],
    note: "India's flagship open model, from Sarvam AI. 105B total / 10.3B active (9.8%) across 32 MLA layers \u2014 the larger Sarvam switches from GQA to Multi-head Latent Attention with KV LayerNorm and a NoPE + RoPE mix. Large vocabulary tuned for Indic languages. Apache 2.0. Architecture verified from its config.json via Raschka's gallery." },
  { name: "Sarvam 30B", provider: "Sarvam AI", released: "2026/03", type: "SLM", arch: "Sparse MoE", params: "30B", active: "2.4B",
    attn: "Grouped-query attention", modality: "Text", context: 131072, maxOut: null, license: "Apache 2.0", open: true, intel: 6, codingAgent: null, codingAgentVia: null, agentic: null,
    training: [
      { label: "Pre-training", tokens: "16T", detail: "Trained on 16T tokens — more than the larger 105B model's 12T, an unusual inversion. Same corpus recipe: code, general web, specialised knowledge, mathematics and multilingual data with heavy weighting toward the 10 most-spoken Indian languages, across three phases (long-horizon pre-training, mid-training, long-context extension)." },
      { label: "SFT", tokens: null, detail: "Supervised fine-tuning on prompts curated for difficulty, quality and domain diversity, augmented with synthetic prompts drawn from the pre-training mixture. Trivially solvable and consistently unsolved prompts are filtered out using open-source models and early checkpoints." },
      { label: "RL", tokens: null, detail: "Final reinforcement-learning stage on in-house curated data. Algorithm and token budget not disclosed." },
    ],
    note: "The smaller of Sarvam AI's pair of Indian-language models: 30B total but only 2.4B active (8%) over 19 GQA layers with QK-Norm. Reasoning-oriented sparse MoE with a large vocabulary for strong Indic coverage. Among the cheapest models on the Artificial Analysis leaderboard." },
  { name: "Kimi K2.6", provider: "Moonshot", released: "2026/04", type: "Frontier", arch: "Sparse MoE", params: "1T", active: "32B",
    attn: "MLA (Multi-head Latent Attn)", modality: "Text + image", context: 256000, maxOut: null, license: "Modified MIT", open: true, intel: 45, codingAgent: 33, codingAgentVia: "Claude Code", agentic: 31,
    trainingSource: "Moonshot published no training details for K2.6 — neither its blog post nor its model card describes any stage, token budget or recipe. The pipeline below is Kimi K2.5's, taken from that model's technical report (arXiv 2602.02276), and is shown as the closest documented reference rather than as a description of K2.6. The one link Moonshot does state is architectural: the K2.6 model card says it \"has the same architecture as Kimi-K2.5, and the deployment method can be directly reused\". That covers architecture and deployment only — treat the stages here as K2.5's until Moonshot publishes K2.6's own.",
    training: [
      { label: "ViT training", tokens: "~1T", detail: "K2.5 builds its visual encoder separately first. MoonViT-3D is continually pre-trained from SigLIP on image-text and video-text pairs, where the text side mixes alt text, synthetic image and video captions, grounding boxes and OCR output. Unlike Kimi-VL this stage drops the contrastive loss and trains on caption cross-entropy alone. Alignment runs in two steps: MoonViT-3D is first aligned to Moonlight-16B-A3B via the caption loss over roughly 1T tokens at very low FLOPs, then a short second step updates only the MLP projector bridging the encoder to the 1T-parameter LLM." },
      { label: "Joint pre-training", tokens: "15T", detail: "Rather than training a language model and grafting vision on afterwards, K2.5 resumes from a near-final Kimi K2 checkpoint and continues over roughly 15T vision-text tokens at 4K sequence length, improving language and multimodal ability together. The recipe extends K2's distribution by adding unique tokens, shifting proportions toward coding, and capping how many epochs any one source may contribute.",
        curriculum: "The vision-to-text ratio was settled by ablation rather than convention. Standard practice introduces vision late and heavily — 50% of tokens or more — so Moonshot fixed the total vision-text budget and swept both the injection point and the ratio. The result inverted the usual advice: early fusion at a low vision ratio (about 10:90) beat mid-training at 20:80 and late training at 50:50 across vision knowledge, vision reasoning and OCR, while leaving text ability essentially untouched. The text corpus spans four domains — Web Text, Code, Mathematics and Knowledge — with most processing pipelines carried over from Kimi K2." },
      { label: "Mid-training + long context", tokens: null, detail: "A third pre-training stage trains on higher-quality mid-training data and performs long-context activation, extending the window sequentially through YaRN interpolation." },
      { label: "SFT", tokens: null, detail: "Follows the SFT pipeline established by Kimi K2. Candidate responses are synthesised from K2, K2 Thinking and a set of in-house expert models, with domain-specific generation pipelines combining human annotation, prompt engineering and multi-stage verification. The resulting instruction set targets interactive reasoning and precise tool calling rather than single-turn answers." },
      { label: "RL", tokens: null, detail: "Runs inside a Unified Agentic Reinforcement Learning Environment supporting joint text-vision RL and PARL for agent swarms. The policy objective departs from K1.5 by adding token-level clipping, which limits the off-policy divergence that grows when responses come from a stale policy, alongside a squared log-ratio penalty for stability." },
    ],
    note: "K3's immediate predecessor and still a strong open model. Keeps the K2/K2.5 DeepSeek-style backbone unchanged \u2014 1T total, 32B active (3.2%), 61 MLA layers, 384 experts \u2014 with gains coming from the multimodal and agentic training recipe rather than architecture. Note the contrast with K3, which broke from MLA to the KDA hybrid." },
  { name: "GLM-5.1", provider: "Zhipu", released: "2026/04", type: "Frontier", arch: "Sparse MoE", params: "744B", active: "40B",
    attn: "MLA + DeepSeek Sparse Attn", modality: "Text + image", context: 202752, maxOut: null, license: "MIT", open: true, intel: 41, codingAgent: 36, codingAgentVia: "Claude Code", agentic: 31, training: null,
    note: "The middle release in Zhipu's fast GLM-5 cadence (5 in Feb, 5.1 in Apr, 5.2 in Jun 2026). Architecture is identical to GLM-5 \u2014 744B/40B, 78 MLA layers with DeepSeek Sparse Attention, MTP-capable \u2014 with the entire gain coming from post-training aimed at long-horizon agentic coding." },
  { name: "Laguna XS.2", provider: "Poolside", released: "2026/04", type: "SLM", arch: "Sparse MoE", params: "33B", active: "3B",
    attn: "Sliding-window + global", modality: "Text", context: 131072, maxOut: null, license: "Apache 2.0", open: true, intel: null, codingAgent: null, codingAgentVia: null, agentic: null,
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
    attn: "Sliding-window + global", modality: "Text + image + video", context: 256000, maxOut: 8192, license: "Apache 2.0", open: true, intel: 26, codingAgent: null, codingAgentVia: null, agentic: 11, training: null,
    note: "The sparse sibling of the dense Gemma 4 31B: 25.2B total with 3.8B active (15.1%), using 128 experts of which 8 are routed plus 1 shared per token. Keeps the family's 5:1 sliding-window/global attention backbone with QK-Norm, unified K/V and p-RoPE on global layers, swapping only the dense FFNs for MoE layers. 25 sliding-window + 5 global layers, 262k vocabulary." },
  { name: "Muse Spark", provider: "Meta", released: "2026/04", type: "Frontier", arch: "Undisclosed", params: "—", active: "—",
    attn: "Undisclosed", modality: "Text + image + audio", context: 262144, maxOut: null, license: "Proprietary", open: false, intel: 44, codingAgent: null, codingAgentVia: null, agentic: null, training: null,
    note: "The first model out of Meta Superintelligence Labs, shipped 8 April 2026, and the first Meta flagship that is not a Llama. It is also the first one Meta kept closed — no weights, no Hugging Face repo, API and Meta AI only — which breaks the open-weight line that ran from Llama 1 through Llama 4. Meta describes it as natively multimodal, with vision trained into the model rather than attached to a finished text model, and frames it as the first rung of a scaling ladder rather than a finished frontier system. Parameter count, architecture, attention and training are all undisclosed, so the rows below stay empty by design." },
  { name: "Opus 5", provider: "Anthropic", released: "2026/07", type: "Frontier", arch: "Undisclosed", params: "\u2014", active: "\u2014",
    attn: "Undisclosed", modality: "Text + image", context: 1000000, maxOut: 128000, license: "Proprietary", open: false, intel: 63, codingAgent: 67, codingAgentVia: "Claude Code", agentic: 59, training: null,
    note: "Anthropic's new Opus-tier flagship, shipped 24 July 2026, succeeding Opus 4.8. Adds an 'xhigh' reasoning-effort mode and a Fast mode (~2.5x speed at 2x price). Positioned just below the Mythos-class Fable 5 \u2014 reported near-Fable intelligence at roughly half the cost. Architecture, parameters and training remain undisclosed, as with the rest of the Claude line. Artificial Analysis framed it as 'Fable 5 level intelligence at a lower cost per task'; the leaderboard now carries its own rows per reasoning effort, and the figures here are the max-effort variant." },
  { name: "Sonnet 5", provider: "Anthropic", released: "2026/06", type: "Mid", arch: "Undisclosed", params: "\u2014", active: "\u2014",
    attn: "Undisclosed", modality: "Text + image", context: 1000000, maxOut: 64000, license: "Proprietary", open: false, intel: 55, codingAgent: null, codingAgentVia: null, agentic: 50, training: null,
    note: "Sonnet tier crossed to 5 on 30 June 2026, becoming Anthropic's default high-volume workhorse. Roughly 63% on SWE-bench Pro against Opus 5's 79%, at about 0.6x the price. No architecture or training disclosure." },
  { name: "GPT-5.6 Sol", provider: "OpenAI", released: "2026/07", type: "Frontier", arch: "MoE (reported)", params: "\u2014", active: "\u2014",
    attn: "Undisclosed", modality: "Text + image + audio", context: 1000000, maxOut: 128000, license: "Proprietary", open: false, intel: 61, codingAgent: 67, codingAgentVia: "Codex", agentic: 58, training: null,
    note: "Top variant of the GPT-5.6 family (9 July 2026), which ships three fixed tiers: Luna, Terra, Sol. Artificial Analysis reports Sol at roughly Fable 5's intelligence for about a third of the cost, and leading its Coding Agent Index at ~80. Token-efficient: ~15k tokens per Index task vs GPT-5.5's 16k. Architecture undisclosed." },
  { name: "GPT-5.6 Terra", provider: "OpenAI", released: "2026/07", type: "Frontier", arch: "MoE (reported)", params: "\u2014", active: "\u2014",
    attn: "Undisclosed", modality: "Text + image", context: 1000000, maxOut: 128000, license: "Proprietary", open: false, intel: 57, codingAgent: 62, codingAgentVia: "Codex", agentic: 50, training: null,
    note: "Middle tier of the GPT-5.6 family \u2014 OpenAI's intended production default. Reported to land just above Claude Fable 5 on the Artificial Analysis Coding Agent Index while sitting below Sol. No separate Intelligence Index figure published." },
  { name: "GPT-5.6 Luna", provider: "OpenAI", released: "2026/07", type: "Mid", arch: "MoE (reported)", params: "\u2014", active: "\u2014",
    attn: "Undisclosed", modality: "Text + image", context: 1000000, maxOut: 128000, license: "Proprietary", open: false, intel: 52, codingAgent: 59, codingAgentVia: "Codex", agentic: 47, training: null,
    note: "Cheapest, highest-volume tier of the GPT-5.6 family. Reported to outperform Claude Opus 4.8 on the Coding Agent Index despite the lower tier. Along with Sol it sits on Artificial Analysis's intelligence-vs-cost Pareto frontier (Terra does not)." },
  { name: "Grok 4.6", provider: "xAI", released: "2026/08", type: "Frontier", arch: "Undisclosed", params: "\u2014", active: "\u2014",
    attn: "Undisclosed", modality: "Text + image", context: 500000, maxOut: null, license: "Proprietary", open: false, intel: 61, codingAgent: null, codingAgentVia: null, agentic: 59, training: null,
    note: "xAI's flagship from 12 August 2026, aimed at long-running agentic work. Keeps Grok 4.5's 500K window and adds an xhigh reasoning tier above the previous high, along with tiered pricing that doubles above a 200K prompt \u2014 the first time the lab has priced long context separately, which says something about what serving it costs. Output length is documented as having no limit rather than as a number, so the max-output column is blank rather than guessing one. Nothing is published about the architecture, so unlike Grok 4.5 and 4.3 this row does not even carry a reported MoE label." },
  { name: "Grok 4.5", provider: "xAI", released: "2026/07", type: "Frontier", arch: "MoE (reported)", params: "\u2014", active: "\u2014",
    attn: "Sparse + long-context", modality: "Text + image", context: 500000, maxOut: null, license: "Proprietary", open: false, intel: 56, codingAgent: 64, codingAgentVia: "Grok Build", agentic: 49, training: null,
    note: "xAI's flagship as of 8 July 2026, trained in partnership with Cursor and aimed at coding, agentic tool calling and knowledge work. 500K context \u2014 notably smaller than the 2M window of Grok 4.3 \u2014 with configurable reasoning and ~80 tok/s serving. Architecture undisclosed." },
  { name: "Muse Spark 1.1", provider: "Meta", released: "2026/07", type: "Frontier", arch: "Undisclosed", params: "\u2014", active: "\u2014",
    attn: "Undisclosed", modality: "Text + image + video + audio", context: 1048576, maxOut: null, license: "Proprietary", open: false, intel: 53, codingAgent: 54, codingAgentVia: "Opencode", agentic: 40, training: null,
    note: "Meta's follow-up three months after Muse Spark (9 July 2026), and the release that put Meta behind a paid developer API for the first time. The context window goes from roughly 262K to 1M, and Artificial Analysis measured the Intelligence Index rising 43 \u2192 51, with the coding sub-score alone up 12 points \u2014 an unusually large move for a point release. Positioned for agentic work: tool use, computer use and orchestration across external apps, taking text, image, video and audio in and returning text only. Architecture and training remain undisclosed, as with 1.0." },
  { name: "Muse Spark 1.2", provider: "Meta", released: "2026/08", type: "Frontier", arch: "Undisclosed", params: "—", active: "—",
    attn: "Undisclosed", modality: "Text + image + video + audio", context: 1048576, maxOut: null, license: "Proprietary", open: false, intel: 57, codingAgent: 61, codingAgentVia: "tbh", agentic: 49, training: null,
    note: "A coding-focused point release on 5 August 2026, shipped alongside Muse Code, Meta's own terminal agent — the two were trained together, which is unusual enough to be the headline: the model is tuned for the harness it runs in. Meta reports scaling training compute on long-horizon coding work, whole-repository generation and end-to-end projects, but publishes no architecture, no parameter count and no token budget, exactly as with 1.0 and 1.1. Takes text, image, video, audio and PDF against one 1M-token budget, returns text. On 10 August Meta said it would open the weights, reversing the closed policy that covered the first three Muse Spark releases; until a repository exists, this stays closed here. Artificial Analysis has rated it, but no score is recorded here yet." },
  { name: "Qwen3.8 Max", provider: "Alibaba", released: "2026/07", type: "Frontier", arch: "Sparse MoE", params: "2.4T", active: "95B",
    attn: "Gated DeltaNet + gated attn", modality: "Text + image + video", context: 1000000, maxOut: 131072, license: "Proprietary (API)", open: false, intel: 58, codingAgent: 57, codingAgentVia: "Claude Code", agentic: 58, training: null,
    note: "Previewed 19 July 2026, days after Kimi K3, and no longer a preview: the id is now qwen3.8-max, and the open-weights base landed on 8 August. That release answered what the preview would not. Active parameters are 95B of the 2.4T, so the largest Qwen serves at roughly 4% of its weight; attention is the Gated DeltaNet hybrid the 3.5-3.7 line used, three linear-attention layers to each gated full-attention one, which this atlas declined to assume until the config said so. Alibaba describes Max as the same model with vision input, non-thinking mode and a 1M window on by default, so the figures here are the hosted service's rather than the open weights'." },
  { name: "Qwen3.8 2.4T-A95B", provider: "Alibaba", released: "2026/08", type: "Frontier", arch: "Sparse MoE", params: "2.4T", active: "95B",
    attn: "Gated DeltaNet + gated attn", modality: "Text", context: 262144, maxOut: null, license: "Qwen3.8-Max License", open: true, intel: 58, codingAgent: null, codingAgentVia: null, agentic: 57, training: [{ label: "Pre-training", tokens: null, detail: "Alibaba names pre-training and post-training as the two stages and publishes no token budget for either, so none is shown rather than borrowing the previous generation's. The model is trained with multi-token prediction over multiple steps." }, { label: "Post-training", tokens: null, detail: "Reasoning depth is exposed at inference as a reasoning_effort setting, and reasoning context carries across turns via preserve_thinking." }],
    note: "The open-weights model under Qwen3.8 Max, and the first time a Qwen-Max-class model has shipped with downloadable weights. 2.4T total, 95B active: 92 layers arranged as 23 repeats of three Gated DeltaNet blocks to one gated-attention block, every one of them feeding a 512-expert MoE that fires 10 routed experts plus a shared one. The licence is Alibaba's own Qwen3.8-Max terms rather than Apache 2.0, unlike the rest of the open Qwen line. 262K native context, which Alibaba says extends to 1.01M. Text only — the vision input belongs to the hosted Max, not to these weights." },
  { name: "Kimi K3", provider: "Moonshot", released: "2026/07", type: "Frontier", arch: "Sparse MoE", params: "2.8T", active: "104.2B",
    attn: "KDA + full attn (69:24 layers)", modality: "Text + image + video", context: 1048576, maxOut: 131072, license: "Kimi K3 License", open: true, intel: 60, codingAgent: 61, codingAgentVia: "Kimi Code CLI", agentic: 54,
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
    attn: "DSA + MLA (IndexShare)", modality: "Text + image", context: 1000000, maxOut: 128000, license: "MIT", open: true, intel: 53, codingAgent: 43, codingAgentVia: "Claude Code", agentic: 46, training: null,
    note: "Third release in Zhipu's fast GLM-5 cadence (GLM-5 Feb, 5.1 Apr, 5.2 Jun 2026). ~753B total with ~40B active (256 routed experts, 8 per token). Uses DeepSeek-style sparse attention with MLA KV-cache compression plus IndexShare, which Zhipu reports cuts per-token FLOPs 2.9x at 1M context. MIT licensed with no regional restrictions. Shipped days after the US export clampdown on Anthropic's Fable/Mythos models." },
  { name: "Inkling", provider: "Thinking Machines", released: "2026/07", type: "Frontier", arch: "Sparse MoE", params: "975B", active: "41B",
    attn: "Undisclosed", modality: "Text + image + audio", context: 1000000, maxOut: null, license: "Apache 2.0", open: true, intel: 42, codingAgent: null, codingAgentVia: null, agentic: 34, training: null,
    note: "First open-weights model from Thinking Machines Lab (Mira Murati's startup), released 15 July 2026. 975B total / 41B active MoE, Apache 2.0. Accepts text, image and audio but emits text only. Explicitly designed as a base for fine-tuning rather than a benchmark winner \u2014 it ships an 'effort dial' (0.2\u20130.99) instead of fixed tiers. Trails GLM-5.2 and Kimi on terminal-agent coding; SimpleQA Verified of 43.9% lags the closed flagships badly, so pair it with RAG for factual work. An Inkling-Small preview also exists." },
  { name: "Laguna S 2.1", provider: "Poolside", released: "2026/07", type: "Mid", arch: "Sparse MoE", params: "118B", active: "8B",
    attn: "Sliding-window + global", modality: "Text", context: 1048576, maxOut: null, license: "OpenMDW-1.1", open: true, intel: null, codingAgent: null, codingAgentVia: null, agentic: null, training: [{ label: "Pre-training", tokens: "30T", detail: "Began 22 May 2026 on 4,096 NVIDIA H200 GPUs; the full run took under nine weeks. Knowledge cutoff November 2025." }, { label: "Post-training", tokens: null, detail: "Reinforcement learning from code-execution feedback \u2014 Poolside's core method, letting the model learn from its own successes and failures. Separate thinking / non-thinking modes." }],
    note: "Poolside's agentic-coding specialist: 118B total, only 8B active per token across 256 routed experts (top-10) plus 1 shared, over 48 layers. Mixed global/sliding-window attention with a 1M-token window (256K on the free tier). Scores 70.2% on Terminal-Bench 2.1, matching or beating open models several times its size. NVFP4 weights are ~59GB, so it fits on a single NVIDIA DGX Spark. Poolside publishes full evaluation trajectories \u2014 unusually transparent." },
  { name: "Laguna XS 2.1", provider: "Poolside", released: "2026/07", type: "SLM", arch: "Sparse MoE", params: "33B", active: "3B",
    attn: "Sliding-window + global", modality: "Text", context: null, maxOut: null, license: "OpenMDW-1.1", open: true, intel: null, codingAgent: null, codingAgentVia: null, agentic: null, training: null,
    note: "The small end of Poolside's Laguna line: 33B total / 3B active MoE with a 100,352-token vocabulary, published to Hugging Face 2 July 2026. Supports optional thinking, tool calls and preserved reasoning content. Context window not stated in the model card sources checked \u2014 the sibling Laguna M.1 is 262K. Runs on consumer GPUs when quantized." },
  // ---- Frontier / flagship (proprietary) ----
  { name: "Fable 5", provider: "Anthropic", released: "2026/06", type: "Frontier", arch: "Undisclosed", params: "—", active: "—",
    attn: "Undisclosed", modality: "Text + image", context: 1000000, maxOut: 128000, license: "Proprietary", open: false, intel: 62, codingAgent: 66, codingAgentVia: "Claude Code", agentic: 57, training: null,
    note: "Anthropic's Mythos-class flagship. Architecture undisclosed. Like all frontier closed models it is a decoder-only transformer at its core, but parameter counts, expert layout, and attention scheme are unpublished. Shares the long-context (1M) design goal of the Opus line with extra max-output headroom." },
  { name: "Opus 4.8", provider: "Anthropic", released: "2026/05", type: "Frontier", arch: "Undisclosed", params: "—", active: "—",
    attn: "Undisclosed", modality: "Text + image", context: 1000000, maxOut: 64000, license: "Proprietary", open: false, intel: 57, codingAgent: 61, codingAgentVia: "Claude Code", agentic: 49, training: null,
    note: "Dense-vs-MoE split unconfirmed. Anthropic publishes no parameter or architecture details. Differentiates on post-training (reasoning, tool use, safety) rather than disclosed structural innovations. 1M context with no long-context price tiering." },
  { name: "Sonnet 4.6", provider: "Anthropic", released: "2026/02", type: "Frontier", arch: "Undisclosed", params: "—", active: "—",
    attn: "Undisclosed", modality: "Text + image", context: 1000000, maxOut: 64000, license: "Proprietary", open: false, intel: 48, codingAgent: 38, codingAgentVia: "Claude Code", agentic: 42, training: null,
    note: "Mid-flagship tier. Same undisclosed-architecture posture as the rest of the Claude family; added a 1M-token window this generation. Optimized for latency/cost balance against Opus." },
  { name: "Haiku 4.5", provider: "Anthropic", released: "2025/10", type: "Mid", arch: "Undisclosed", params: "—", active: "—",
    attn: "Undisclosed", modality: "Text + image", context: 200000, maxOut: 64000, license: "Proprietary", open: false, intel: 30, codingAgent: null, codingAgentVia: null, agentic: 16, training: null,
    note: "Smallest, fastest Claude tier. 200K window (not 1M) is the main structural difference from its larger siblings. Architecture unpublished." },
  { name: "GPT-5.5", provider: "OpenAI", released: "2026/04", type: "Frontier", arch: "MoE (reported)", params: "—", active: "—",
    attn: "Undisclosed", modality: "Text + image + audio", context: 922000, maxOut: 128000, license: "Proprietary", open: false, intel: 56, codingAgent: 61, codingAgentVia: "Codex", agentic: 47, training: null,
    note: "Widely reported to be a sparse Mixture-of-Experts, but OpenAI publishes no counts or routing. Natively multimodal, hybrid reasoning model with adjustable thinking effort. 128K max output is among the highest of the closed flagships." },
  { name: "GPT-5 mini", provider: "OpenAI", released: "2025/08", type: "Mid", arch: "MoE (reported)", params: "—", active: "—",
    attn: "Undisclosed", modality: "Text + image", context: 400000, maxOut: 64000, license: "Proprietary", open: false, intel: 32, codingAgent: null, codingAgentVia: null, agentic: 20, training: null,
    note: "Distilled/smaller sibling of the GPT-5 line for high-volume, latency-sensitive work. Architecture undisclosed; assumed to share the family's MoE lineage at reduced scale." },
  { name: "Gemini 3.1 Pro", provider: "Google", released: "2026/02", type: "Frontier", arch: "MoE (reported)", params: "—", active: "—",
    attn: "Sparse + long-context", modality: "Text + image + video + audio", context: 1000000, maxOut: 64000, license: "Proprietary", open: false, intel: 48, codingAgent: 30, codingAgentVia: "Gemini CLI", agentic: 23, training: null,
    note: "Sparse MoE per Google's earlier Gemini disclosures; exact counts unpublished. The most fully multimodal flagship (native video). Largest hosted context at 2M, with tiered pricing above 200K. Same lineage as the open Gemma models but at far larger scale." },
  { name: "Gemini 3.7 Flash", provider: "Google", released: "2026/08", type: "Mid", arch: "MoE (reported)", params: "—", active: "—",
    attn: "Sparse + long-context", modality: "Text + image + video + audio", context: 1000000, maxOut: 64000, license: "Proprietary", open: false, intel: 56, codingAgent: 57, codingAgentVia: "Opencode", agentic: 45, training: null,
    note: "Released 13 August 2026 and pitched at coding and agent work at the Flash price rather than the Pro one. Its model card states the model is based on Gemini 3.6 Flash and refers the reader to that card for architecture, which in turn refers to 3.5 Flash — so the architecture and attention rows here are carried across that chain of Google's own statements rather than assumed from the family name, and both remain reported rather than confirmed. Knowledge cutoff March 2026, with some domains held back to January 2025." },
  { name: "Gemini 3.6 Flash", provider: "Google", released: "2026/07", type: "Mid", arch: "MoE (reported)", params: "—", active: "—",
    attn: "Sparse + long-context", modality: "Text + image + video + audio", context: 1000000, maxOut: 64000, license: "Proprietary", open: false, intel: 52, codingAgent: 46, codingAgentVia: "Opencode", agentic: 41, training: null,
    note: "The 21 July 2026 Flash, between 3.5 and 3.7 and matching 3.5's index score. Its card says it is based on Gemini 3.5 Flash and sends the reader there for architecture; nothing about parameters, sparsity or attention is published at any point in the chain. Same 1M window, 64K output and March 2026 cutoff as the generation either side of it." },
  { name: "Gemini 3.5 Flash", provider: "Google", released: "2026/05", type: "Mid", arch: "MoE (reported)", params: "—", active: "—",
    attn: "Sparse + long-context", modality: "Text + image + audio", context: 1000000, maxOut: 64000, license: "Proprietary", open: false, intel: 52, codingAgent: null, codingAgentVia: null, agentic: 40, training: null,
    note: "Speed-optimized Gemini tier. 1M context, very high throughput. Shares the family's sparse architecture at smaller effective compute." },
  { name: "Grok 4.3", provider: "xAI", released: "2026/04", type: "Frontier", arch: "MoE (reported)", params: "—", active: "—",
    attn: "Sparse + long-context", modality: "Text + image", context: 1000000, maxOut: 64000, license: "Proprietary", open: false, intel: 38, codingAgent: null, codingAgentVia: null, agentic: 24, training: null,
    note: "Reported MoE; xAI publishes little structural detail. Ties Gemini for the largest hosted window (2M). Emphasis on long-context retrieval and tool use." },

  // ---- Frontier-class open weights ----
  { name: "DeepSeek V4 Pro", provider: "DeepSeek", released: "2026/04", type: "Frontier", arch: "Sparse MoE", params: "1.6T", active: "49B",
    attn: "Hybrid: CSA + HCA", modality: "Text + image + video + audio", context: 1048576, maxOut: 384000, license: "MIT", open: true, intel: 53, codingAgent: 31, codingAgentVia: "Claude Code", agentic: 50, training: [{ label: "Pre-training", tokens: "32T+", detail: "Diverse, filtered high-quality tokens; Muon optimizer, mHC residual connections, anticipatory routing for MoE stability." }, { label: "Context extension", tokens: null, detail: "Two-stage long-context extension to the 1M window (token count not separately broken out)." }, { label: "Specialist SFT + RL", tokens: null, detail: "Independent domain experts (math, code, agent, instruction) each get SFT then GRPO with domain reward signals." }, { label: "On-policy distillation", tokens: null, detail: "A single student model distills from 10+ specialist teachers on its own rollouts (OPD), merging skills into one model." }],
    note: "61 layers, 384 routed experts + 1 shared, 6 active per token, so only 49B of 1.6T params fire per token. Hybrid attention interleaves Compressed Sparse Attention (4x KV compression + FP4 'lightning indexer' top-k selection) with Hierarchical Chunked Attention, plus manifold-constrained hyper-connections (mHC) replacing the standard residual stream. 384K max output is 3-6x its peers. DeepSeek published DeepSeek-V4-Pro-0813 on 13 August 2026 as the official release superseding the preview, adding a DSpark speculative-decoding module; every architecture field recorded here is unchanged in its config. The intelligence score is that release's — AA lists DeepSeek V4 Pro 0813 eight points above the preview it replaced — while the coding score is still the preview's." },
  { name: "DeepSeek V4 Flash", provider: "DeepSeek", released: "2026/04", type: "Mid", arch: "Sparse MoE", params: "284B", active: "13B",
    attn: "Hybrid: CSA + HCA", modality: "Text + image", context: 1048576, maxOut: 128000, license: "MIT", open: true, intel: 52, codingAgent: 55, codingAgentVia: "Codex", agentic: 48, training: [{ label: "Pre-training", tokens: "32T+", detail: "DeepSeek reports a single '>32T tokens' figure covering both Pro and Flash; no separate Flash count is published." }, { label: "Context extension", tokens: null, detail: "Long-context extension to 1M; even lower FLOPs/KV than Pro." }, { label: "Specialist SFT + RL", tokens: null, detail: "Per-domain SFT + GRPO, same two-stage paradigm as Pro." }, { label: "On-policy distillation", tokens: null, detail: "Multi-teacher OPD into the unified student." }],
    note: "Shares V4 Pro's attention stack and mHC design at a quarter the scale: 284B total, 13B active. The cheapest frontier-class model to run. Same 1M window, lower max output. DeepSeek published a refreshed checkpoint, DeepSeek-V4-Flash-0731, on 31 July 2026. The intelligence score is that checkpoint's, ten points above the one it replaced; the coding score still predates it." },
  { name: "Qwen3.5-Plus", provider: "Alibaba", released: "2026/02", type: "Frontier", arch: "Sparse MoE", params: "397B", active: "17B",
    attn: "Gated DeltaNet + gated attn", modality: "Text + image + video", context: 262144, maxOut: 64000, license: "Apache 2.0", open: true, intel: 34, codingAgent: null, codingAgentVia: null, agentic: 20, training: [{ label: "Pre-training", tokens: null, detail: "Alibaba published no Qwen3.5 technical report. The only official source is the Qwen3.5 blog (\"Towards Native Multimodal Agents\", Feb 2026), which names the training stages but discloses no token budget for any of them — so no figure is shown here rather than borrowing the previous generation's.", curriculum: "Not disclosed at stage level. The blog reports only that Qwen3.5 trains natively multimodally, claiming \"near-100% multimodal training efficiency compared to text-only training\", and that reinforcement learning was scaled across million-agent environments." }, { label: "Long-context", tokens: null, detail: "Long-context stage (mix of 16-32K and 4-16K sequences)." }, { label: "Post-training", tokens: null, detail: "SFT + RL alignment with thinking/non-thinking modes." }],
    note: "397B-A17B built on the Qwen3-Next lineage: a 3:1 hybrid of Gated DeltaNet (linear attention) and gated full-attention layers (every 4th layer is full attention), over a sparse MoE. ~250K-token vocabulary and 201-language coverage — the broadest of any open model. Native video + audio." },
  { name: "Qwen3.6 Plus", provider: "Alibaba", released: "2026/03", type: "Frontier", arch: "MoE (reported)", params: "—", active: "—",
    attn: "Gated DeltaNet + gated attn", modality: "Text + image", context: 1000000, maxOut: 65536, license: "Proprietary (API)", open: false, intel: 40, codingAgent: null, codingAgentVia: null, agentic: 29, training: [{ label: "Pre-training", tokens: null, detail: "Qwen3.6 generation; token budget unpublished. Adopts the Qwen3-Next hybrid attention line (Gated DeltaNet) into the main Qwen series." }, { label: "Long-context", tokens: null, detail: "Native 1M-token window (up from 262K in the 27B), multi-token prediction." }, { label: "Post-training", tokens: null, detail: "SFT + RL; reduced overthinking on simple tasks, more reliable agent behavior." }],
    note: "API-only flagship preview of the Qwen3.6 family. Switches the main line to a Gated DeltaNet hybrid (3x Gated DeltaNet→FFN, 1x gated attention→FFN repeating), tuned for agentic coding and long-document reasoning. 1M native context, 64K max output." },
  { name: "Qwen3.7 Max", provider: "Alibaba", released: "2026/05", type: "Frontier", arch: "MoE (reported)", params: "—", active: "—",
    attn: "Gated DeltaNet + gated attn", modality: "Text", context: 1000000, maxOut: 65536, license: "Proprietary (API)", open: false, intel: 47, codingAgent: null, codingAgentVia: null, agentic: 31, training: [{ label: "Pre-training", tokens: null, detail: "Architecture and token counts not published as of June 2026; reported to build on the Qwen3.6 Gated DeltaNet hybrid with updated expert routing." }, { label: "Long-context", tokens: null, detail: "1M-token window carried over from Qwen3.6 Plus (991.8K max input / 65.5K max output per the model card)." }, { label: "Post-training", tokens: null, detail: "Agent-tuned RL; native extended-thinking mode, sustained multi-hour / 1000+ tool-call runs." }],
    note: "Alibaba's agent-first proprietary flagship (text-only). AA Intelligence Index 56.6 — the highest-ranked Chinese model on the index — and demonstrated 35-hour autonomous runs. Speaks the Anthropic Messages protocol natively. No open weights. Treat architecture as reported, not confirmed." },
  { name: "Qwen3.7 Plus", provider: "Alibaba", released: "2026/05", type: "Mid", arch: "MoE (reported)", params: "—", active: "—",
    attn: "Gated DeltaNet + gated attn", modality: "Text + image", context: 1000000, maxOut: 65536, license: "Proprietary (API)", open: false, intel: 39, codingAgent: 36, codingAgentVia: "Claude Code", agentic: 21, training: [{ label: "Pre-training", tokens: null, detail: "Undisclosed; same Qwen3.7 generation backbone as Max with multimodal input." }, { label: "Post-training", tokens: null, detail: "RL alignment; vision-capable endpoint of the 3.7 line (Vision Arena #16)." }],
    note: "The multimodal sibling of Qwen3.7 Max — adds vision input. API-only preview as of May 2026; architecture reported to mirror Max. No open weights yet." },
  { name: "MiniMax M3", provider: "MiniMax", released: "2026/06", type: "Frontier", arch: "Sparse MoE", params: "428B", active: "—",
    attn: "MSA sparse attention", modality: "Text + image + video", context: 1000000, maxOut: 64000, license: "Proprietary", open: false, intel: 45, codingAgent: null, codingAgentVia: null, agentic: 36, training: null,
    note: "Uses MiniMax Sparse Attention (MSA) for its 1M window. Multimodal across text/image/video. Pricing doubles past 512K input tokens." },
  { name: "Llama 4 Scout", provider: "Meta", released: "2025/04", type: "Mid", arch: "Sparse MoE", params: "109B", active: "17B",
    attn: "iRoPE (interleaved RoPE/NoPE)", modality: "Text + image", context: 10000000, maxOut: 32000, license: "Llama 4 Community", open: true, intel: 10, codingAgent: null, codingAgentVia: null, agentic: 1, training: [{ label: "Pre-training", tokens: "~40T", detail: "Multimodal (text+image+video) via early fusion; 256K pretraining context; cutoff Aug 2024." }, { label: "Mid-training", tokens: null, detail: "Long-context extension with specialized datasets + iRoPE tricks unlocking the 10M window." }, { label: "Post-training", tokens: null, detail: "SFT, then RL; distillation from larger Llama 4 Behemoth teacher reported." }],
    note: "16 large experts, 17B active of 109B total. Interleaved RoPE/NoPE attention layers enable the headline 10M-token window, by far the largest of any model. You still pay the VRAM tax for all 109B weights, but it generates at ~17B-dense speed. Fewer, larger experts vs Gemma 4's many-small-experts approach." },
  { name: "Mistral Large 3", provider: "Mistral", released: "2025/12", type: "Frontier", arch: "Sparse MoE", params: "673B", active: "41B",
    attn: "MLA (Multi-head Latent Attn)", modality: "Text + image", context: 262144, maxOut: 64000, license: "Apache 2.0", open: true, intel: 16, codingAgent: null, codingAgentVia: null, agentic: 6, training: null,
    note: "MoE flagship now under fully permissive Apache 2.0, a shift from Mistral's earlier restrictive terms. GQA-based attention. 256K context, large but not in the 1M+ club." },
  { name: "GLM-5", provider: "Zhipu", released: "2026/02", type: "Frontier", arch: "Sparse MoE", params: "744B", active: "40B",
    attn: "MLA + DeepSeek Sparse Attn", modality: "Text + image", context: 202752, maxOut: 32000, license: "MIT", open: true, intel: 41, codingAgent: null, codingAgentVia: null, agentic: null,
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
    attn: "Grouped-query attention", modality: "Text", context: 256000, maxOut: 32000, license: "CC-BY-NC", open: true, intel: 7, codingAgent: null, codingAgentVia: null, agentic: null,
    training: [
      { label: "Pre-training", tokens: null, detail: "Standard pre-training stage; Cohere names it but discloses no corpus size or token budget for Command A." },
      { label: "SFT", tokens: null, detail: "Supervised fine-tuning applied after pre-training, per the model card. Dataset size not disclosed." },
      { label: "Preference training", tokens: null, detail: "Final alignment stage using preference training rather than a named RLHF variant, targeting helpfulness and safety. Cohere's tech report (arXiv 2504.00698) covers the method; the model card itself gives no quantitative detail." },
    ],
    note: "One of the larger dense (non-MoE) models still shipping; all 111B params fire every token. Tuned for RAG and grounded generation with citations. Non-commercial license." },
  { name: "Nemotron 3 Ultra", provider: "NVIDIA", released: "2026/06", type: "Frontier", arch: "Sparse MoE", params: "550B", active: "55B",
    attn: "Mamba-2 SSM + GQA attn", modality: "Text", context: 262144, maxOut: 32000, license: "NVIDIA Nemotron Open Model License", open: true, intel: 38, codingAgent: null, codingAgentVia: null, agentic: 27, training: [{ label: "Pre-training P1", tokens: "15T", detail: "Diversity-focused mixture (web, code, math, multilingual); NVFP4 training, LatentMoE, multi-token prediction." }, { label: "Pre-training P2", tokens: "5T", detail: "Quality-focused high-fidelity data after ~75% of pretraining (20T total text tokens)." }, { label: "Context extension", tokens: null, detail: "Extends context to 1M tokens via continued pretraining." }, { label: "SFT + RL + MOPD", tokens: null, detail: "Supervised fine-tuning, multi-environment RLVR, and Multi-teacher On-Policy Distillation." }],
    note: "Hybrid latent Mamba-Transformer MoE: 550B total, 55B active. Interleaves Mamba-2 state-space layers (recurrent state scales linearly with sequence length, not quadratically) with sparse MoE and a few grouped-query attention layers. The SSM layers slash KV-cache cost on long reasoning chains. 1M context via NVFP4 on Blackwell (262K in BF16). Trained in 4-bit NVFP4. NVIDIA's strongest US open-weight model; full open release of weights, data, and recipes." },
  { name: "Nemotron 3 Super", provider: "NVIDIA", released: "2026/03", type: "Mid", arch: "Sparse MoE", params: "120B", active: "12B",
    attn: "Mamba-2 SSM + GQA attn", modality: "Text", context: 1000000, maxOut: 32000, license: "NVIDIA Nemotron Open Model License", open: true, intel: 26, codingAgent: null, codingAgentVia: null, agentic: 9, training: [{ label: "Pre-training", tokens: "25T", detail: "Two-phase diversity\u2192quality curriculum, NVFP4 + LatentMoE + MTP (same family recipe as Nano/Ultra)." }, { label: "Context extension", tokens: null, detail: "Continued pretraining to native 1M context." }, { label: "SFT + RL + MOPD", tokens: null, detail: "SFT, RL across interactive environments, and multi-teacher on-policy distillation." }],
    note: "Same hybrid LatentMoE design as Ultra at single-H100 scale: 120B total, 12B active, native 1M context in BF16 with multi-token prediction. RULER-100 retrieval of ~91.75 at full length. The SSM/attention/MoE mix is the structural break from the all-transformer field." },

  // ---- Small language models (SLMs) ----
  { name: "Muse Glimmer", provider: "Meta", released: "2026/08", type: "SLM", arch: "Dense", params: "30B", active: "30B",
    attn: "Sliding-window + global", modality: "Text + image", context: 131072, maxOut: null, license: "Apache 2.0", open: true, intel: 35, codingAgent: null, codingAgentVia: null, agentic: 23, training: null,
    note: "Meta's return to open weights, 10 August 2026, and the first Muse model with a licence that permits anything: Apache 2.0, after three closed Muse Spark releases. Built to run locally rather than to top a leaderboard — a dense 30B including its vision tower, quantised to roughly 4 bits so the language model, the KV cache, the perception encoder and a speculative drafter all fit inside a 24GB card. Attention repeats three sliding-window layers to one global, at a 2,048-token window. Weights ship in several formats from the same repository: BF16 for research, GGUF for llama.cpp, and ExecuTorch builds for on-device use. Not yet rated by Artificial Analysis. The layer and head figures widely reported for it are not recorded here, because no one has read them off the config.json for this atlas yet." },
  { name: "Gemma 4 (31B)", provider: "Google", released: "2026/04", type: "SLM", arch: "Dense", params: "30.7B", active: "30.7B",
    attn: "Sliding-window + global", modality: "Text + image + video", context: 256000, maxOut: 8192, license: "Apache 2.0", open: true, intel: 30, codingAgent: null, codingAgentVia: null, agentic: 14, training: [{ label: "Pre-training", tokens: null, detail: "Gemma 4's own token budget isn't published. For reference, Gemma 3's report used 14T tokens for the 27B model on a knowledge-distillation recipe." }, { label: "Post-training", tokens: null, detail: "Distillation + instruction tuning + RLHF; function calling and JSON output built in." }],
    note: "The only fully dense Gemma 4 variant, all 30.7B params active. Hybrid attention alternates local sliding-window with periodic global layers (final layer always global). Native multimodal, Apache 2.0. Runs on a single GPU." },
  { name: "Gemma 4 E4B", provider: "Google", released: "2026/04", type: "SLM", arch: "Dense", params: "8B (4.5B eff.)", active: "8B (4.5B eff.)",
    attn: "Sliding-window + global", modality: "Text + image + video + audio", context: 128000, maxOut: 8192, license: "Apache 2.0", open: true, intel: 12, codingAgent: null, codingAgentVia: null, agentic: null, training: [{ label: "Pre-training", tokens: null, detail: "Distillation-based pretraining at edge scale (token budget not separately published)." }, { label: "Post-training", tokens: null, detail: "Instruction tuning + RLHF; adds audio input." }],
    note: "Gemma 4's phone-scale edge variant, and a DENSE model \u2014 not MoE. 8B parameters, but per-layer embeddings add small layer-specific token vectors without scaling the compute path, so its effective footprint is ~4.5B. 42-layer stack, 2 KV heads, 5:1 sliding-window/global attention with unified K/V and p-RoPE on global layers. Adds native audio input. (The 25.2B/3.8B MoE figures often attributed to E4B actually belong to the separate Gemma 4 26B-A4B variant.)" },
  { name: "Gemma 3 4B", provider: "Google", released: "2025/03", type: "SLM", arch: "Dense", params: "4B", active: "4B",
    attn: "Sliding-window + global", modality: "Text + image", context: 128000, maxOut: 8192, license: "Gemma", open: true, intel: 1, codingAgent: null, codingAgentVia: null, agentic: null, training: [{ label: "Pre-training", tokens: "4T", detail: "Knowledge-distillation pretraining (Gemma 3 report: 4T tokens for the 4B model)." }, { label: "Post-training", tokens: null, detail: "Distillation, SFT, and RLHF." }],
    note: "Prior-gen dense edge model, ~4.2GB RAM at quantized precision, best fit for memory-constrained devices. Hybrid local/global attention like the rest of the Gemma line." },
  { name: "FunctionGemma 270M", provider: "Google", released: "2026/04", type: "SLM", arch: "Dense", params: "0.27B", active: "0.27B",
    attn: "Sliding-window + global", modality: "Text", context: 32000, maxOut: 4096, license: "Gemma", open: true, intel: null, codingAgent: null, codingAgentVia: null, agentic: null, training: [{ label: "Pre-training", tokens: null, detail: "Small-scale distillation pretraining (budget not published)." }, { label: "Task fine-tuning", tokens: null, detail: "Specialized for function calling." }],
    note: "Purpose-built for function calling on IoT/edge hardware. Smallest model here; dense, text-only, narrow capability by design." },
  { name: "Phi-4-mini", provider: "Microsoft", released: "2025/02", type: "SLM", arch: "Dense", params: "3.8B", active: "3.8B",
    attn: "Grouped-query attention", modality: "Text", context: 128000, maxOut: 16000, license: "MIT", open: true, intel: 6, codingAgent: null, codingAgentVia: null, agentic: null, training: [{ label: "Pre-training", tokens: null, detail: "Phi-4-mini's own token count isn't published. Its report centers on the Mixture-of-LoRAs design; the related Phi-4 (14B) model used ~10T tokens. Recipe emphasizes synthetic, reasoning-dense data over raw scale." }, { label: "Distill pre-training", tokens: null, detail: "Distillation stage that sharply lifts reasoning (per the Phi-4-mini report's ablations)." }, { label: "Post-training", tokens: null, detail: "Distill fine-tuning then roll-out DPO for the reasoning-enhanced model." }],
    note: "Dense reasoning-focused SLM trained heavily on synthetic, reasoning-dense data, the Phi line's signature recipe (data quality over scale). Format-sensitive: best with its chat/function-call templates. Runs on CPU." },
  { name: "Fara 1.5 27B", provider: "Microsoft", released: "2026/05", type: "SLM", arch: "Dense", params: "27B", active: "27B",
    attn: "Gated DeltaNet + gated attn", modality: "Text + image", context: 262144, maxOut: null, license: "MIT", open: true, intel: null, codingAgent: null, codingAgentVia: null, agentic: null, training: [{ label: "Supervised fine-tuning", tokens: null, detail: "Supervised fine-tuning of Qwen3.5-27B on trajectories from FaraGen1.5, Microsoft's own pipeline: it invents web tasks, runs them to completion, and verifies the result before the trajectory is allowed into training. Microsoft reports 64 NVIDIA B200s for six days over a January-April 2026 training period, and publishes no token count." }],
    note: "A computer-use agent that drives a browser from screenshots alone — no DOM, no accessibility tree — and emits clicks, typing and scrolls as tool calls carrying pixel coordinates. Only the fine-tune is Microsoft's: the architecture underneath is Qwen3.5-27B, 64 layers in a 3:1 hybrid of linear attention and gated full attention, with a vision tower in front. Trained to stop and hand the task back before payments, sign-ins, submissions and anything else it cannot undo. The model card gives a release date of 21 May 2026 while the weights repository was created on 17 July 2026." },
  { name: "Fara 1.5 4B", provider: "Microsoft", released: "2026/05", type: "SLM", arch: "Dense", params: "4B", active: "4B",
    attn: "Gated DeltaNet + gated attn", modality: "Text + image", context: 262144, maxOut: null, license: "MIT", open: true, intel: null, codingAgent: null, codingAgentVia: null, agentic: null, training: [{ label: "Supervised fine-tuning", tokens: null, detail: "Same FaraGen1.5 trajectory data as the 27B, fine-tuned onto Qwen3.5-4B instead. Microsoft reports 32 NVIDIA B200s for two days; no token count is published." }],
    note: "The small Fara, for running the agent loop on one accelerator with the screenshot history still resident. Same vision-only perception and same coordinate-grounded actions as the 27B, at 32 layers instead of 64. Microsoft asks that both be run inside its MagenticLite harness, which sandboxes the browser and holds the allow-list — an unusual thing for a model card to insist on, and a reasonable one for a model whose output is clicks." },
  { name: "Qwen3.5 (9B)", provider: "Alibaba", released: "2026/02", type: "SLM", arch: "Dense", params: "9B", active: "9B",
    attn: "Gated DeltaNet + gated attn", modality: "Text + image + video", context: 262144, maxOut: 16000, license: "Apache 2.0", open: true, intel: 22, codingAgent: null, codingAgentVia: null, agentic: 7, training: [{ label: "Pre-training", tokens: null, detail: "Alibaba published no Qwen3.5 technical report. The only official source is the Qwen3.5 blog (\"Towards Native Multimodal Agents\", Feb 2026), which names the training stages but discloses no token budget for any of them — so no figure is shown here rather than borrowing the previous generation's." }, { label: "Long-context", tokens: null, detail: "Long-context training stage." }, { label: "Post-training", tokens: null, detail: "SFT + RL alignment." }],
    note: "Larger edge-tier Qwen on the Qwen3-Next lineage: 3:1 Gated DeltaNet / gated-attention hybrid (every 4th layer full attention) rather than plain GQA. Inherits the family's wide multilingual vocabulary. Strong coding scores for its class." },
  { name: "Qwen3.5 (0.8B)", provider: "Alibaba", released: "2026/02", type: "SLM", arch: "Dense", params: "0.8B", active: "0.8B",
    attn: "Gated DeltaNet + gated attn", modality: "Text + image + video", context: 262144, maxOut: 8192, license: "Apache 2.0", open: true, intel: 5, codingAgent: null, codingAgentVia: null, agentic: null, training: [{ label: "Pre-training", tokens: null, detail: "Alibaba published no Qwen3.5 technical report. The only official source is the Qwen3.5 blog (\"Towards Native Multimodal Agents\", Feb 2026), which names the training stages but discloses no token budget for any of them — so no figure is shown here rather than borrowing the previous generation's." }, { label: "Post-training", tokens: null, detail: "SFT + RL; thinking/non-thinking modes." }],
    note: "Smallest Qwen3.5 for sub-4GB devices. Its model card spells out the block structure explicitly: 6 × (3 × Gated DeltaNet→FFN, 1 × gated attention→FFN) — the same hybrid as the rest of the family, not a plain dense GQA model." },
  { name: "Qwen3.8 (27B)", provider: "Alibaba", released: "2026/08", type: "SLM", arch: "Dense", params: "27B", active: "27B",
    attn: "Gated DeltaNet + gated attn", modality: "Text + image + video", context: 262144, maxOut: null, license: "Apache 2.0", open: true, intel: null, codingAgent: null, codingAgentVia: null, agentic: null, training: [{ label: "Pre-training", tokens: null, detail: "Pre-training and post-training are named as the two stages with no token budget for either. 64 layers as 16 repeats of three Gated DeltaNet blocks to one gated-attention block, trained with multi-token prediction." }, { label: "Post-training", tokens: null, detail: "Thinking on by default and disableable per request, with reasoning depth set by reasoning_effort and reasoning context preserved across turns." }],
    note: "The dense 27B of the Qwen3.8 generation, published 5 August 2026 three days before the 2.4T. Same layer shape as the Qwen3.6 and 3.5 27Bs before it — 64 layers, 5,120 wide, a 3:1 linear-to-full attention ratio — so what moved is the training rather than the architecture. Ships with a vision encoder for images and hour-scale video, and under Apache 2.0, which the 2.4T sibling is not. Artificial Analysis has not rated it, so both index columns are blank." },
  { name: "Qwen3.6 (27B)", provider: "Alibaba", released: "2026/04", type: "SLM", arch: "Dense", params: "27B", active: "27B",
    attn: "Gated DeltaNet + gated attn", modality: "Text + image + video", context: 262144, maxOut: 65536, license: "Apache 2.0", open: true, intel: 38, codingAgent: null, codingAgentVia: null, agentic: 28, training: [{ label: "Pre-training", tokens: null, detail: "Qwen3.6 dense generation; token count unpublished. 64-layer hybrid: 16 repeats of (3x Gated DeltaNet→FFN, 1x gated attention→FFN), trained with multi-token prediction." }, { label: "Long-context", tokens: null, detail: "262K native, extensible to ~1M via YaRN." }, { label: "Post-training", tokens: null, detail: "SFT + RL; adds Thinking Preservation that carries reasoning context across turns." }],
    note: "First dense open model in the Qwen3.6 family. At 27.8B it edges past the 397B-A17B Qwen3.5 MoE on coding benchmarks (SWE-bench Verified ~77.2) while fitting in ~17GB at Q4. Gated DeltaNet hybrid attention; runs on a single GPU." },
  { name: "Qwen3.6 35B-A3B", provider: "Alibaba", released: "2026/04", type: "SLM", arch: "Sparse MoE", params: "35B", active: "3B",
    attn: "Gated DeltaNet + gated attn", modality: "Text + image + video", context: 262144, maxOut: 32000, license: "Apache 2.0", open: true, intel: 32, codingAgent: null, codingAgentVia: null, agentic: 22, training: [{ label: "Pre-training", tokens: null, detail: "Qwen3.6 generation MoE; token budget unpublished. Hybrid Gated DeltaNet attention with sparse MoE FFN layers." }, { label: "Post-training", tokens: null, detail: "SFT + RL alignment; thinking/non-thinking modes." }],
    note: "First open-weight Qwen3.6 release: 35B total, only 3B active per token, so it runs on a laptop (~21GB quantized) while scoring ~73.4 on SWE-bench Verified. The MoE counterpart to the dense 27B." },
  { name: "Llama 3.2 3B", provider: "Meta", released: "2024/09", type: "SLM", arch: "Dense", params: "3B", active: "3B",
    attn: "Grouped-query attention", modality: "Text", context: 128000, maxOut: 8192, license: "Llama 3.2 Community", open: true, intel: 4, codingAgent: null, codingAgentVia: null, agentic: null, training: [{ label: "Pre-training", tokens: "Up to 9T", detail: "Distilled/pruned from larger Llama 3.1 models using their token corpus; logits-based distillation." }, { label: "Post-training", tokens: null, detail: "SFT + DPO alignment." }],
    note: "Dense mobile/edge model. Predates the Llama 4 MoE shift, so unlike Scout every parameter is active. Strong math for its size." },
  { name: "Llama 3.2 1B", provider: "Meta", released: "2024/09", type: "SLM", arch: "Dense", params: "1B", active: "1B",
    attn: "Grouped-query attention", modality: "Text", context: 128000, maxOut: 8192, license: "Llama 3.2 Community", open: true, intel: 1, codingAgent: null, codingAgentVia: null, agentic: null, training: [{ label: "Pre-training", tokens: "Up to 9T", detail: "Pruned + distilled from Llama 3.1 8B/larger teachers." }, { label: "Post-training", tokens: null, detail: "SFT + DPO alignment." }],
    note: "Smallest Llama, built for phones. Dense, text-only; 128K context is generous for the size." },
  { name: "Mistral Small 4", provider: "Mistral", released: "2026/03", type: "SLM", arch: "Sparse MoE", params: "119B", active: "6.63B",
    attn: "MLA (Multi-head Latent Attn)", modality: "Text + image", context: 256000, maxOut: 16000, license: "Apache 2.0", open: true, intel: 20, codingAgent: null, codingAgentVia: null, agentic: 5, training: null,
    note: "Sits oddly across the SLM/large line: 119B total but only 6.5B active, so its inference compute is SLM-class while weights are large. Apache 2.0. Shows how 'small' increasingly means active-params, not total." },
  { name: "Leanstral 1.5", provider: "Mistral", released: "2026/07", type: "SLM", arch: "Sparse MoE", params: "119B", active: "6.5B",
    attn: "MLA (Multi-head Latent Attn)", modality: "Text + image", context: 256000, maxOut: null, license: "Apache 2.0", open: true, intel: null, codingAgent: null, codingAgentVia: null, agentic: null, training: null,
    note: "A proof-assistant specialist: Mistral built it to write Lean 4, where what the model produces is checked mechanically rather than eyeballed, so the reward signal is unusually honest. Published as an update to the earlier Leanstral rather than a new design, and it carries the Mistral Small 4 shape unchanged — 36 layers, 128 experts firing 4 per token plus one shared, MLA splitting each head into 64 rotated and 64 unrotated dimensions. Weights ship quantised to FP8. Mistral publishes no training pipeline for it, so none is shown here. Architecture is read from params.json; this repository has no config.json." },
  { name: "SmolLM3-3B", provider: "Hugging Face", released: "2025/06", type: "SLM", arch: "Dense", params: "3B", active: "3B",
    attn: "GQA + periodic NoPE", modality: "Text", context: 131072, maxOut: 8192, license: "Apache 2.0", open: true, intel: null, codingAgent: null, codingAgentVia: null, agentic: null, training: [{ label: "Pre-training", tokens: "8T", detail: "Stage 1 pretraining; NoPE + intra-document masking chosen up front for long context." }, { label: "Mid-training", tokens: "3.2T", detail: "Stages 2-3 + long-context training (higher-quality and longer-sequence data)." }, { label: "Post-training", tokens: "37.5B", detail: "SFT + alignment on combined post-training datasets; fully open blueprint." }],
    note: "Fully open instruct + reasoning model with a published end-to-end training blueprint (architecture, data mix, post-training). At 3B it beats Llama 3.2 3B and Qwen2.5 3B on many benchmarks." },
  { name: "Granite SWASH 2B", provider: "IBM", released: "2026/07", type: "SLM", arch: "Dense", params: "2.14B", active: "2.14B",
    attn: "Sliding-window + attention sinks", modality: "Text", context: 8192, maxOut: null, license: "Apache 2.0", open: true, intel: null, codingAgent: null, codingAgentVia: null, agentic: null, training: null,
    note: "IBM published this as an experiment rather than a product: a base model with no safety alignment, released to show what the next Granite series is being built out of. Seven of its 24 layers see the whole sequence and the other 17 look back only 128 tokens. Every head also learns a sink — a parameter compared against the log-sum-exp of that head's own scores, scaling the head's output down when nothing in range was worth reading. The training mix is described only as open source and proprietary data, with no stages or token counts, so none are shown. The 8,192-token window is small for 2026, which is rather the point of a study model." },
  { name: "Granite SWASH 3B-A600M", provider: "IBM", released: "2026/07", type: "SLM", arch: "Sparse MoE", params: "3.02B", active: "0.6B",
    attn: "Sliding-window + attention sinks", modality: "Text", context: 8192, maxOut: null, license: "Apache 2.0", open: true, intel: null, codingAgent: null, codingAgentVia: null, agentic: null, training: null,
    note: "The sparse half of the same experiment: 28 layers, 48 experts with 4 firing per token plus a shared one, so 3B of weights run at 0.6B of compute. Same sliding-window-plus-sinks attention as the dense 2B and the same 128-token window, which makes the pair a controlled comparison of dense against sparse at fixed attention design — the reason to publish both. Experts are narrow at 512 dimensions against a 1,280-wide shared expert. Base model, no alignment, no published training breakdown." },
  { name: "Tiny Aya", provider: "Cohere", released: "2026/02", type: "SLM", arch: "Dense", params: "3.35B", active: "3.35B",
    attn: "Sliding-window + global", modality: "Text", context: 8192, maxOut: 4096, license: "CC-BY-NC", open: true, intel: 1, codingAgent: null, codingAgentVia: null, agentic: null, training: null,
    note: "Multilingual-first small model covering 70+ languages at 3.35B. Dense, non-commercial license." },
  { name: "Nemotron 3 Nano", provider: "NVIDIA", released: "2025/12", type: "SLM", arch: "Sparse MoE", params: "30B", active: "3B",
    attn: "Mamba-2 SSM + GQA attn", modality: "Text", context: 1000000, maxOut: 16000, license: "NVIDIA Nemotron Open Model License", open: true, intel: 15, codingAgent: null, codingAgentVia: null, agentic: 2, training: [{ label: "Pre-training P1", tokens: "23.5T", detail: "Diverse web/code/math/multilingual + synthetic; aux-loss-free MoE load balancing." }, { label: "Pre-training P2", tokens: "1.5T", detail: "High-quality curated sources (e.g. Wikipedia) to refine accuracy (25T total)." }, { label: "Long-context CPT", tokens: null, detail: "Continued pretraining at 512K sequence (mixed 4K/512K) to reach the 1M window." }, { label: "SFT + RL", tokens: null, detail: "Stage 1 SFT then Stage 2 RL; 13M-sample post-training corpus, GenRM-based RLHF." }],
    note: "Scaled-down hybrid: 52 layers = 23 Mamba-2 + 23 MoE (128 routed + 1 shared, 6 active) + 6 GQA attention layers. 30B total, 3.5B active, with a configurable thinking budget. Remarkably, it keeps a 1M-token window at SLM scale thanks to the linear-cost SSM layers (default capped at 262K to avoid OOM). 4-bit fits in ~3GB RAM." },
  { name: "Qwen3 235B-A22B", provider: "Alibaba", released: "2025/04", type: "Frontier", arch: "Sparse MoE", params: "235B", active: "22B",
    attn: "Grouped-query attention", modality: "Text", context: 131072, maxOut: null, license: "Apache 2.0", open: true, intel: 13, codingAgent: null, codingAgentVia: null, agentic: null,
    training: [
      { label: "Pre-training S1", tokens: ">30T", detail: "General stage. All Qwen3 models train on over 30T tokens at a 4,096-token sequence length, building language proficiency and world knowledge across 119 languages and dialects — up from 29 in Qwen2.5.",
        curriculum: "The full 36T-token corpus spans coding, STEM, reasoning, books, multilingual text and synthetic data. Two pipelines expand it beyond what was scraped: Qwen2.5-VL performs text recognition over a large volume of PDF-like documents and Qwen2.5 then refines the output, yielding trillions of extra high-quality tokens; separately Qwen2.5, Qwen2.5-Math and Qwen2.5-Coder synthesise trillions more across textbooks, QA, instructions and code snippets covering dozens of domains. A multilingual annotation system then labels over 30T tokens along dimensions including educational value, field, domain and safety, so the mixture can be filtered and combined at instance level rather than by coarse source weighting." },
      { label: "Pre-training S2", tokens: "~5T", detail: "Reasoning stage. The corpus is re-weighted toward STEM, coding, reasoning and synthetic data, and the model trains on roughly 5T higher-quality tokens, still at 4,096 sequence length, with the learning-rate decay accelerated." },
      { label: "Long-context", tokens: null, detail: "Final pre-training stage, run on hundreds of billions of tokens at a 32,768 sequence length. The corpus is deliberately skewed long: 75% of text runs 16,384–32,768 tokens and 25% runs 4,096–16,384. RoPE base frequency is raised from 10,000 to 1,000,000 via ABF, and YARN plus Dual Chunk Attention give a four-fold sequence-length increase at inference time." },
      { label: "Post-training", tokens: null, detail: "Flagship models run a four-stage pipeline: Long-CoT Cold Start, then Reasoning RL, then Thinking Mode Fusion, then General RL. The first two build the thinking ability; the last two fold non-thinking behaviour back in, so one model serves both modes and the user can cap reasoning with a thinking budget. Lightweight models skip this entirely and instead take Strong-to-Weak Distillation from the flagships — distilling teacher output logits, which the report found gave both higher Pass@1 and better exploration than running the four stages per model." },
    ],
    note: "The 2025 flagship that established the modern Qwen line: 235B total, 22B active over 94 layers, 128 experts with 8 routed per token and — unlike Qwen2.5-MoE — no shared expert, balanced by a global-batch load-balancing loss. Attention is plain GQA (64 query / 4 KV heads) with QK-Norm and the QKV bias of Qwen2 removed. 151,669-token BBPE vocabulary. Its headline feature was merging thinking and non-thinking modes into a single checkpoint with a user-settable thinking budget, a pattern the whole industry copied. Context is 32K native, extended to 128K with YaRN." },
  { name: "Qwen3-VL 235B-A22B", provider: "Alibaba", released: "2025/09", type: "Frontier", arch: "Sparse MoE", params: "235B", active: "22B",
    attn: "Grouped-query attention", modality: "Text + image + video", context: 262144, maxOut: null, license: "Apache 2.0", open: true, intel: 21, codingAgent: null, codingAgentVia: null, agentic: null,
    training: [
      { label: "S0 · VL alignment", tokens: "67B", detail: "Bridges the modality gap before any full-parameter training. Only the MLP vision–language merger is trainable; both the vision encoder and the LLM backbone stay frozen. Runs on ~67B tokens at 8,192 sequence length.",
        curriculum: "High-quality image–caption pairs, visual knowledge collections and OCR data — an alignment-first mix chosen to establish cross-modal grounding before the expensive stages unfreeze everything." },
      { label: "S1 · Multimodal pre-train", tokens: "~1T", detail: "Full-parameter multimodal pre-training: vision encoder, merger and LLM backbone all unfrozen, ~1T tokens at 8,192 sequence length." },
      { label: "S2 · Long-context", tokens: "~1T", detail: "Sequence length rises to 32,768 with all parameters still trainable, over another ~1T tokens. The mixture shifts — more text-only data to protect long-form text comprehension, and the remaining vision-language share weighted toward video and agent-oriented data." },
      { label: "S3 · Ultra-long-context", tokens: "100B", detail: "A short, expensive final stage: 100B tokens at a 262,144-token sequence length, which is what makes the native 256K interleaved window real rather than extrapolated. The model holds 100% accuracy on video up to 30 minutes (~256K tokens) and still degrades gracefully out to ~1M." },
      { label: "Post-training", tokens: null, detail: "Three stages. SFT first, itself in two phases — 32K context, then extended to 256K focused on long-document and long-video data — with the data split into standard formats for non-thinking models and Chain-of-Thought formats for thinking ones. Then Strong-to-Weak Distillation, notably performed on text-only data against the LLM backbone, which the report says lifted reasoning on multimodal tasks as well as text ones. Finally RL, split into Reasoning RL and General RL." },
    ],
    note: "The vision-language flagship of the Qwen3 generation, sharing the 235B-A22B MoE backbone with the text model. Three modules: a Qwen3-ViT vision encoder continued from SigLIP-2 with dynamic-resolution training, an MLP merger, and the Qwen3 LLM. Three architectural changes carry it: an enhanced interleaved-MRoPE for spatial–temporal modelling across images and video, DeepStack integration that feeds multi-level ViT features into the LLM for tighter alignment, and text-based time alignment. Natively handles 256K-token interleaved text/image/video context, extensible to ~1M. Also ships as dense 2B/4B/8B/32B and a 30B-A3B MoE." },
];

export const TYPE_COLORS = {
  Frontier: { fg: "var(--type-frontier-fg)", dot: "var(--type-frontier-dot)" },
  Mid: { fg: "var(--type-mid-fg)", dot: "var(--type-mid-dot)" },
  SLM: { fg: "var(--type-slm-fg)", dot: "var(--type-slm-dot)" },
};
export const ARCH_COLORS = {
  "Dense": "var(--arch-dense)",
  "Sparse MoE": "var(--arch-moe)",
  "MoE (reported)": "var(--arch-reported)",
  "Undisclosed": "var(--arch-undisclosed)",
};

// Architecture diagrams from Sebastian Raschka's LLM Architecture Gallery.
// Hot-linked, not copied: the images stay on his server and every use carries a
// visible credit linking back to the source card. Each pairing below was checked
// against the model's parameter count, and every URL was verified to resolve.
// Models with no confidently matching card are deliberately absent rather than
// guessed at - a near-miss card (e.g. Command A+ vs Command A) is not a match.
// Titles are our own model names; only the image itself comes from the gallery.
// Structured architecture specs, read from each model's own config.json on Hugging
// Face — the artefact the lab itself publishes. Kept as discrete comparable fields
// rather than prose so the comparison view can diff them, and so a later synthesis
// feature can recombine them.
//
// An earlier version of this map took its descriptions from a third-party gallery;
// it was replaced because the wording was that author's, not ours. The only outside
// inputs left in this project are the architecture images (credited, hot-linked) and
// the Artificial Analysis intelligence index.
//
// A missing field means the config does not declare it. Absence of rope_theta is NOT
// treated as proof of NoPE — that claim is only made where a technical report says so.
export const SPECS = {
  "DeepSeek V4 Flash": { vocab: "129,280", layers: 43, hidden: "4,096", heads: "64 Q / 1 KV (GQA 64:1)", experts: "256 routed \u00b7 6 active \u00b7 1 shared", window: "128", posEmb: "RoPE \u03b8=10K + yarn \u00d716; 64 RoPE dims per head (MLA)", ffn: "2,048 per expert", activation: "silu", norm: "RMSNorm (ε=1e-6)", headDim: 512, source: "config.json" },
  "DeepSeek V4 Pro": { vocab: "129,280", layers: 61, hidden: "7,168", heads: "128 Q / 1 KV (GQA 128:1)", experts: "384 routed \u00b7 6 active \u00b7 1 shared", window: "128", posEmb: "RoPE \u03b8=10K + yarn \u00d716; 64 RoPE dims per head (MLA)", ffn: "3,072 per expert", activation: "silu", norm: "RMSNorm (ε=1e-6)", headDim: 512, source: "config.json" },
  "Gemma 4 (31B)": { vocab: "262,144", layers: 60, hidden: "5,376", heads: "32 Q / 16 KV (GQA 2:1)", layerMix: "50 sliding-window + 10 full attention", window: "1,024", posEmb: "full attention: partial RoPE (25% of head dims) \u03b8=1M + proportional \u00b7 sliding-window: RoPE \u03b8=10K", ffn: "21,504", activation: "gelu_pytorch_tanh", norm: "RMSNorm (ε=1e-6)", headDim: 256, source: "config.json" },
  "Gemma 4 26B-A4B": { vocab: "262,144", layers: 30, hidden: "2,816", heads: "16 Q / 8 KV (GQA 2:1)", experts: "128 routed", layerMix: "25 sliding-window + 5 full attention", window: "1,024", posEmb: "full attention: partial RoPE (25% of head dims) \u03b8=1M + proportional \u00b7 sliding-window: RoPE \u03b8=10K", ffn: "2,112 dense · 704 per expert", activation: "gelu_pytorch_tanh", norm: "RMSNorm (ε=1e-6)", headDim: 256, source: "config.json" },
  "Gemma 4 E4B": { vocab: "262,144", layers: 42, hidden: "2,560", heads: "8 Q / 2 KV (GQA 4:1)", layerMix: "35 sliding-window + 7 full attention", window: "512", posEmb: "full attention: partial RoPE (25% of head dims) \u03b8=1M + proportional \u00b7 sliding-window: RoPE \u03b8=10K", ffn: "10,240", activation: "gelu_pytorch_tanh", norm: "RMSNorm (ε=1e-6)", headDim: 256, source: "config.json" },
  "GLM-5": { vocab: "154,880", layers: 78, hidden: "6,144", heads: "64 Q / 64 KV (MHA)", experts: "256 routed \u00b7 8 active \u00b7 1 shared", posEmb: "RoPE \u03b8=1M; MLA head split 64 RoPE / 192 NoPE dims", ffn: "12,288 dense · 2,048 per expert", activation: "silu", norm: "RMSNorm (ε=1e-5)", headDim: 64, source: "config.json" },
  "GLM-5.1": { vocab: "154,880", layers: 78, hidden: "6,144", heads: "64 Q / 64 KV (MHA)", experts: "256 routed \u00b7 8 active \u00b7 1 shared", posEmb: "RoPE \u03b8=1M; MLA head split 64 RoPE / 192 NoPE dims", ffn: "12,288 dense · 2,048 per expert", activation: "silu", norm: "RMSNorm (ε=1e-5)", headDim: 64, source: "config.json" },
  "GLM-5.2": { vocab: "154,880", layers: 78, hidden: "6,144", heads: "64 Q / 64 KV (MHA)", experts: "256 routed \u00b7 8 active \u00b7 1 shared", posEmb: "RoPE \u03b8=8M; MLA head split 64 RoPE / 192 NoPE dims", ffn: "12,288 dense · 2,048 per expert", activation: "silu", norm: "RMSNorm (ε=1e-5)", headDim: 192, source: "config.json" },
  "Inkling": { vocab: "201,024", layers: 66, hidden: "6,144", heads: "64 Q / 8 KV (GQA 8:1)", experts: "256 routed \u00b7 6 active \u00b7 2 shared", ffn: "3,072", norm: "RMSNorm (ε=1e-6)", headDim: 128, source: "config.json" },
  "Kimi K2.6": { vocab: "163,840", layers: 61, hidden: "7,168", heads: "64 Q / 64 KV (MHA)", experts: "384 routed \u00b7 8 active \u00b7 1 shared", posEmb: "RoPE \u03b8=50K + yarn \u00d764; MLA head split 64 RoPE / 128 NoPE dims", ffn: "18,432 dense · 2,048 per expert", activation: "silu", norm: "RMSNorm (ε=1e-5)", source: "config.json" },
  "Kimi K3": { vocab: "163,840", layers: 93, hidden: "7,168", heads: "96 Q / 96 KV (MHA)", experts: "896 routed", posEmb: "NoPE \u2014 no rope_theta in config; the tech report (\u00a73.4) states position is carried implicitly by KDA's recurrent gating and decay", ffn: "33,792 dense · 3,072 per expert", activation: "situ — as published; not a known activation, and K2.6's config says silu", norm: "RMSNorm (ε=1e-5)", source: "config.json" },
  "Laguna S 2.1": { vocab: "100,352", layers: 48, hidden: "3,072", heads: "48 Q / 8 KV (GQA 6:1)", experts: "256 routed \u00b7 10 active", layerMix: "36 sliding-window + 12 full attention", window: "512", posEmb: "full attention: partial RoPE (50% of head dims) \u03b8=500K + yarn \u00d7128 \u00b7 sliding-window: RoPE \u03b8=10K", ffn: "12,288 dense · 1,024 per expert", norm: "RMSNorm (ε=1e-6)", headDim: 128, source: "config.json" },
  "Laguna XS 2.1": { vocab: "100,352", layers: 40, hidden: "2,048", heads: "48 Q / 8 KV (GQA 6:1)", experts: "256 routed \u00b7 8 active", layerMix: "30 sliding-window + 10 full attention", window: "512", posEmb: "full attention: partial RoPE (50% of head dims) \u03b8=500K + yarn \u00d732 \u00b7 sliding-window: RoPE \u03b8=10K", ffn: "8,192 dense · 512 per expert", norm: "RMSNorm (ε=1e-6)", headDim: 128, source: "config.json" },
  "Laguna XS.2": { vocab: "100,352", layers: 40, hidden: "2,048", heads: "48 Q / 8 KV (GQA 6:1)", experts: "256 routed \u00b7 8 active", layerMix: "30 sliding-window + 10 full attention", window: "512", posEmb: "full attention: partial RoPE (50% of head dims) \u03b8=500K + yarn \u00d764 \u00b7 sliding-window: RoPE \u03b8=10K", ffn: "8,192 dense · 512 per expert", norm: "RMSNorm (ε=1e-6)", headDim: 128, source: "config.json" },
  "Mistral Small 4": { vocab: "131,072", layers: 36, hidden: "4,096", heads: "32 Q / 32 KV (MHA)", experts: "128 routed \u00b7 4 active \u00b7 1 shared", posEmb: "RoPE \u03b8=10K + yarn \u00d7128; MLA head split 64 RoPE / 64 NoPE dims", ffn: "12,288 dense · 2,048 per expert", activation: "silu", norm: "RMSNorm (ε=1e-6)", headDim: 128, source: "config.json" },
  "Nemotron 3 Nano": { vocab: "131,072", layers: 52, hidden: "2,688", heads: "32 Q / 2 KV (GQA 16:1)", experts: "128 routed \u00b7 6 active \u00b7 1 shared", posEmb: "RoPE \u03b8=10K", ffn: "1,856", headDim: 128, source: "config.json" },
  "Nemotron 3 Super": { vocab: "131,072", layers: 88, hidden: "4,096", heads: "32 Q / 2 KV (GQA 16:1)", experts: "512 routed \u00b7 22 active \u00b7 1 shared", posEmb: "RoPE \u03b8=10K", ffn: "2,688", headDim: 128, source: "config.json" },
  "Nemotron 3 Ultra": { vocab: "131,072", hidden: "8,192", heads: "64 Q / 2 KV (GQA 32:1)", experts: "512 routed \u00b7 22 active \u00b7 1 shared", posEmb: "RoPE \u03b8=10K", ffn: "5,120", headDim: 128, source: "config.json" },
  "Qwen3.8 2.4T-A95B": { vocab: "248,320", layers: 92, hidden: "8,192", heads: "64 Q / 4 KV (GQA 16:1)", experts: "512 routed \u00b7 10 active \u00b7 1 shared", layerMix: "69 linear attention + 23 full attention", posEmb: "partial RoPE (25% of head dims) \u03b8=10M", ffn: "2,048 per expert", activation: "silu", norm: "RMSNorm (ε=1e-6)", headDim: 256, source: "config.json" },
  "Qwen3.8 (27B)": { vocab: "248,320", layers: 64, hidden: "5,120", heads: "24 Q / 4 KV (GQA 6:1)", layerMix: "48 linear attention + 16 full attention", posEmb: "partial RoPE (25% of head dims) \u03b8=10M; interleaved MRoPE, sections 11/11/10", ffn: "17,408", activation: "silu", norm: "RMSNorm (ε=1e-6)", headDim: 256, source: "config.json" },
  "Fara 1.5 27B": { vocab: "248,320", layers: 64, hidden: "5,120", heads: "24 Q / 4 KV (GQA 6:1)", layerMix: "48 linear attention + 16 full attention", posEmb: "partial RoPE (25% of head dims) θ=10M; interleaved MRoPE, sections 11/11/10", ffn: "17,408", activation: "silu", norm: "RMSNorm (ε=1e-6)", headDim: 256, source: "config.json" },
  "Fara 1.5 4B": { vocab: "248,320", layers: 32, hidden: "2,560", heads: "16 Q / 4 KV (GQA 4:1)", layerMix: "24 linear attention + 8 full attention", posEmb: "partial RoPE (25% of head dims) θ=10M; interleaved MRoPE, sections 11/11/10", ffn: "9,216", activation: "silu", norm: "RMSNorm (ε=1e-6)", headDim: 256, source: "config.json" },
  "Granite SWASH 2B": { vocab: "100,352", layers: 24, hidden: "2,560", heads: "20 Q / 4 KV (GQA 5:1)", layerMix: "17 sliding-window + 7 full attention", window: "128", posEmb: "RoPE θ=10K", ffn: "8,192", activation: "silu", norm: "RMSNorm (ε=1e-5)", source: "config.json" },
  "Granite SWASH 3B-A600M": { vocab: "100,352", layers: 28, hidden: "1,280", heads: "20 Q / 4 KV (GQA 5:1)", experts: "48 routed · 4 active · 1 shared", layerMix: "20 sliding-window + 8 full attention", window: "128", posEmb: "RoPE θ=10K", ffn: "512 per expert · 1,280 shared", activation: "silu", norm: "RMSNorm (ε=1e-5)", source: "config.json" },
  "Leanstral 1.5": { vocab: "131,072", layers: 36, hidden: "4,096", heads: "32 Q / 32 KV (MHA)", experts: "128 routed · 4 active · 1 shared", posEmb: "RoPE θ=10K + yarn ×128; MLA head split 64 RoPE / 64 NoPE dims", ffn: "12,288 dense · 2,048 per expert", norm: "RMSNorm (ε=1e-6)", headDim: 128, source: "params.json" },
  "Phi-4-mini": { vocab: "200,064", layers: 32, hidden: "3,072", heads: "24 Q / 8 KV (GQA 3:1)", window: "262,144", posEmb: "partial RoPE (75% of head dims) \u03b8=10K + longrope", ffn: "8,192", activation: "silu", norm: "RMSNorm (ε=1e-5)", source: "config.json" },
  "Qwen3 235B-A22B": { vocab: "151,936", layers: 94, hidden: "4,096", heads: "64 Q / 4 KV (GQA 16:1)", experts: "128 routed \u00b7 8 active", posEmb: "RoPE \u03b8=1M", ffn: "12,288 dense · 1,536 per expert", activation: "silu", norm: "RMSNorm (ε=1e-6)", headDim: 128, source: "config.json" },
  "Qwen3-VL 235B-A22B": { vocab: "151,936", layers: 94, hidden: "4,096", heads: "64 Q / 4 KV (GQA 16:1)", experts: "128 routed \u00b7 8 active", posEmb: "Interleaved MRoPE across text, image and video (tech report)", ffn: "12,288 dense · 1,536 per expert", activation: "silu", norm: "RMSNorm (ε=1e-6)", headDim: 128, source: "config.json" },
  "Qwen3.5 (0.8B)": { vocab: "248,320", layers: 24, hidden: "1,024", heads: "8 Q / 2 KV (GQA 4:1)", layerMix: "18 linear attention + 6 full attention", posEmb: "partial RoPE (25% of head dims) \u03b8=10M", ffn: "3,584", activation: "silu", norm: "RMSNorm (ε=1e-6)", headDim: 256, source: "config.json" },
  "Qwen3.5 (9B)": { vocab: "248,320", layers: 32, hidden: "4,096", heads: "16 Q / 4 KV (GQA 4:1)", layerMix: "24 linear attention + 8 full attention", posEmb: "partial RoPE (25% of head dims) \u03b8=10M", ffn: "12,288", activation: "silu", norm: "RMSNorm (ε=1e-6)", headDim: 256, source: "config.json" },
  "Qwen3.5-Plus": { vocab: "248,320", layers: 60, hidden: "4,096", heads: "32 Q / 2 KV (GQA 16:1)", experts: "512 routed \u00b7 10 active", layerMix: "45 linear attention + 15 full attention", posEmb: "partial RoPE (25% of head dims) \u03b8=10M", ffn: "1,024 per expert", activation: "silu", norm: "RMSNorm (ε=1e-6)", headDim: 256, source: "config.json" },
  "Qwen3.6 (27B)": { vocab: "248,320", layers: 64, hidden: "5,120", heads: "24 Q / 4 KV (GQA 6:1)", layerMix: "48 linear attention + 16 full attention", posEmb: "partial RoPE (25% of head dims) \u03b8=10M", ffn: "17,408", activation: "silu", norm: "RMSNorm (ε=1e-6)", headDim: 256, source: "config.json" },
  "Qwen3.6 35B-A3B": { vocab: "248,320", layers: 40, hidden: "2,048", heads: "16 Q / 2 KV (GQA 8:1)", experts: "256 routed \u00b7 8 active", layerMix: "30 linear attention + 10 full attention", posEmb: "partial RoPE (25% of head dims) \u03b8=10M", ffn: "512 per expert", activation: "silu", norm: "RMSNorm (ε=1e-6)", headDim: 256, source: "config.json" },
  "Sarvam 105B": { vocab: "262,144", layers: 32, hidden: "4,096", heads: "64 Q", experts: "128 routed \u00b7 8 active", posEmb: "RoPE \u03b8=10K + deepseek yarn \u00d740; MLA head split 64 RoPE / 128 NoPE dims", ffn: "16,384 dense · 2,048 per expert", activation: "silu", norm: "RMSNorm (ε=1e-6)", headDim: 576, source: "config.json" },
  "Sarvam 30B": { vocab: "262,144", layers: 19, hidden: "4,096", heads: "64 Q / 4 KV (GQA 16:1)", experts: "128 routed \u00b7 6 active", posEmb: "RoPE \u03b8=8M", ffn: "8,192 dense · 1,024 per expert", activation: "silu", norm: "RMSNorm (ε=1e-6)", headDim: 64, source: "config.json" },
  "SmolLM3-3B": { vocab: "128,256", layers: 36, hidden: "2,048", heads: "16 Q / 4 KV (GQA 4:1)", layerMix: "36 full attention", posEmb: "RoPE \u03b8=5M; NoPE on 9 of 36 layers (every 4th)", ffn: "11,008", activation: "silu", norm: "RMSNorm (ε=1e-6)", source: "config.json" },
};

// Hugging Face repo for each open-weight model, for the ones that actually publish
// weights there. Every URL below was checked live (GET + og:title, since HuggingFace
// serves a 401 status on some missing repos rather than a clean 404) before being
// added - none of these are guessed from a naming pattern.
export const HF_LINKS = {
  "Command A": "CohereLabs/c4ai-command-a-03-2025",
  "DeepSeek V4 Flash": "deepseek-ai/DeepSeek-V4-Flash",
  "DeepSeek V4 Pro": "deepseek-ai/DeepSeek-V4-Pro",
  "Qwen3.8 2.4T-A95B": "Qwen/Qwen3.8-2.4T-A95B",
  "Qwen3.8 (27B)": "Qwen/Qwen3.8-27B",
  "Fara 1.5 27B": "microsoft/Fara1.5-27B",
  "Fara 1.5 4B": "microsoft/Fara1.5-4B",
  "Leanstral 1.5": "mistralai/Leanstral-1.5-119B-A6B",
  "Granite SWASH 2B": "ibm-granite/granite-swash-2b",
  "Granite SWASH 3B-A600M": "ibm-granite/granite-swash-3b-a600m",
  "FunctionGemma 270M": "google/functiongemma-270m-it",
  "GLM-5": "zai-org/GLM-5",
  "GLM-5.1": "zai-org/GLM-5.1",
  "GLM-5.2": "zai-org/GLM-5.2",
  "Gemma 3 4B": "google/gemma-3-4b-it",
  "Muse Glimmer": "meta-models/Muse-Glimmer-30B",
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
  "Qwen3 235B-A22B": "Qwen/Qwen3-235B-A22B",
  "Qwen3-VL 235B-A22B": "Qwen/Qwen3-VL-235B-A22B-Instruct",
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

export const DIAGRAM_BASE = "https://sebastianraschka.com/llm-architecture-gallery";
export const DIAGRAM_CREDIT = "https://sebastianraschka.com/llm-architecture-gallery/";
// Local mirror of the same 28 diagrams, downloaded into public/diagrams/ as a fallback
// for if sebastianraschka.com ever renames or removes a file. The hotlink is tried
// first — it credits his traffic and always serves his latest version — and the
// <img> only falls back to this repo's copy on a load error. Credit line is
// identical either way.
export const LOCAL_DIAGRAM_BASE = `${import.meta.env.BASE_URL}diagrams`;
export const DIAGRAMS = {
  "DeepSeek V4 Flash": { slug: "deepseek-v4-flash", title: "DeepSeek V4 Flash" },
  "DeepSeek V4 Pro": { slug: "deepseek-v4-pro", title: "DeepSeek V4 Pro" },
  "Gemma 4 (31B)": { slug: "gemma-4-31b", title: "Gemma 4 (31B)" },
  "Gemma 4 26B-A4B": { slug: "gemma-4-26b-a4b", title: "Gemma 4 26B-A4B" },
  "Gemma 4 E4B": { slug: "gemma-4-e4b", title: "Gemma 4 E4B" },
  "GLM-5": { slug: "glm-5-744b", title: "GLM-5" },
  "GLM-5.1": { slug: "glm-5-1", title: "GLM-5.1" },
  "GLM-5.2": { slug: "glm-5.2", title: "GLM-5.2" },
  "Inkling": { slug: "inkling", title: "Inkling" },
  "Kimi K2.6": { slug: "kimi-k2-6", title: "Kimi K2.6" },
  "Kimi K3": { slug: "kimi-k3", title: "Kimi K3" },
  "Laguna S 2.1": { slug: "laguna-s-2-1", title: "Laguna S 2.1" },
  "Laguna XS 2.1": { slug: "laguna-xs-2-1", title: "Laguna XS 2.1" },
  "Laguna XS.2": { slug: "laguna-xs2", title: "Laguna XS.2" },
  "Llama 3.2 1B": { slug: "llama-3-2-1b", title: "Llama 3.2 1B" },
  "Llama 3.2 3B": { slug: "llama-3-2-3b", title: "Llama 3.2 3B" },
  "MiniMax M3": { slug: "minimax-m3", title: "MiniMax M3" },
  "Mistral Large 3": { slug: "mistral-3-large-673-billion", title: "Mistral Large 3" },
  "Mistral Small 4": { slug: "mistral-small-4", title: "Mistral Small 4" },
  "Nemotron 3 Nano": { slug: "nemotron-3-nano-30b-a3b", title: "Nemotron 3 Nano" },
  "Nemotron 3 Super": { slug: "nemotron-3-super-120b-a12b", title: "Nemotron 3 Super" },
  "Nemotron 3 Ultra": { slug: "nemotron-3-ultra-550b-a55b", title: "Nemotron 3 Ultra" },
  "Qwen3 235B-A22B": { slug: "qwen3-235b-a22b", title: "Qwen3 235B-A22B" },
  "Qwen3.6 (27B)": { slug: "qwen3-6-27b", title: "Qwen3.6 (27B)" },
  "Qwen3.6 35B-A3B": { slug: "qwen3-6-35b-a3b", title: "Qwen3.6 35B-A3B" },
  "Sarvam 105B": { slug: "sarvam-105b", title: "Sarvam 105B" },
  "Sarvam 30B": { slug: "sarvam-30b", title: "Sarvam 30B" },
  "SmolLM3-3B": { slug: "smollm3-3b", title: "SmolLM3-3B" },
  "Tiny Aya": { slug: "tiny-aya-3-35b", title: "Tiny Aya" },
};

// Per-model technical report / model card / official source. null = none published.
export const REPORTS = {
  "Sarvam 105B": { label: "Sarvam 30B/105B tech report", url: "https://www.sarvam.ai/blogs/sarvam-30b-105b" },
  "Sarvam 30B": { label: "Sarvam 30B/105B tech report", url: "https://www.sarvam.ai/blogs/sarvam-30b-105b" },
  "Kimi K2.6": { label: "Kimi K2.6 tech blog", url: "https://www.kimi.com/blog/kimi-k2-6.html" },
  "GLM-5.1": { label: "GLM-5 tech report (arXiv 2602.15763)", url: "https://arxiv.org/pdf/2602.15763" },
  "Laguna XS.2": { label: "Laguna M.1 / XS.2 tech report (PDF)", url: "https://poolside.ai/assets/laguna/laguna-m1-xs2-technical-report.pdf" },
  "Gemma 4 26B-A4B": { label: "Gemma 4 model card", url: "https://ai.google.dev/gemma/docs/core/model_card_4" },
  "Muse Spark": { label: "Introducing Muse Spark — Meta AI blog", url: "https://ai.meta.com/blog/introducing-muse-spark-msl/" },
  "Opus 5": { label: "Anthropic model page", url: "https://www.anthropic.com/claude" },
  "Sonnet 5": { label: "Anthropic model page", url: "https://www.anthropic.com/claude" },
  "GPT-5.6 Sol": { label: "OpenAI", url: "https://openai.com/index/gpt-5/" },
  "GPT-5.6 Terra": { label: "OpenAI", url: "https://openai.com/index/gpt-5/" },
  "GPT-5.6 Luna": { label: "OpenAI", url: "https://openai.com/index/gpt-5/" },
  "Grok 4.5": { label: "xAI news", url: "https://x.ai/news" },
  "Grok 4.6": { label: "xAI API release notes", url: "https://docs.x.ai/developers/release-notes" },
  "Muse Spark 1.1": { label: "Introducing Muse Spark 1.1 — Meta AI blog", url: "https://ai.meta.com/blog/introducing-muse-spark-meta-model-api/" },
  "Muse Glimmer": { label: "Introducing Muse Glimmer — Meta AI Research", url: "https://research.meta.ai/blog/introducing-muse-glimmer-open-agentic-model" },
  "Kimi K3": { label: "Kimi K3 tech report (arXiv 2607.24653)", url: "https://arxiv.org/abs/2607.24653" },
  "GLM-5.2": { label: "Z.ai / Zhipu on Hugging Face", url: "https://huggingface.co/zai-org" },
  "Inkling": { label: "Inkling model card", url: "https://thinkingmachines.ai/model-card/inkling/" },
  "Laguna S 2.1": { label: "Introducing Laguna S 2.1", url: "https://poolside.ai/blog/introducing-laguna-s-2-1" },
  "Laguna XS 2.1": { label: "Laguna XS 2.1 model card", url: "https://build.nvidia.com/poolside/laguna-xs-2.1/modelcard" },
  "Fable 5": { label: "Anthropic model page", url: "https://www.anthropic.com/claude" },
  "Opus 4.8": { label: "Anthropic model page", url: "https://www.anthropic.com/claude" },
  "Sonnet 4.6": { label: "Anthropic model page", url: "https://www.anthropic.com/claude" },
  "Haiku 4.5": { label: "Anthropic model page", url: "https://www.anthropic.com/claude" },
  "GPT-5.5": { label: "OpenAI", url: "https://openai.com/index/gpt-5/" },
  "GPT-5 mini": { label: "OpenAI", url: "https://openai.com/index/gpt-5/" },
  "Gemini 3.1 Pro": { label: "Google DeepMind", url: "https://deepmind.google/models/gemini/" },
  "Gemini 3.5 Flash": { label: "Google DeepMind", url: "https://deepmind.google/models/gemini/" },
  "Gemini 3.6 Flash": { label: "Gemini 3.6 Flash model card", url: "https://deepmind.google/models/model-cards/gemini-3-6-flash/" },
  "Gemini 3.7 Flash": { label: "Gemini 3.7 Flash model card", url: "https://deepmind.google/models/model-cards/gemini-3-7-flash/" },
  "Grok 4.3": { label: "xAI", url: "https://x.ai/news" },
  "DeepSeek V4 Pro": { label: "DeepSeek-V4 tech report (arXiv 2606.19348)", url: "https://arxiv.org/abs/2606.19348" },
  "Fara 1.5 27B": { label: "Fara-1.5 tech report (arXiv 2606.20785)", url: "https://arxiv.org/abs/2606.20785" },
  "Fara 1.5 4B": { label: "Fara-1.5 tech report (arXiv 2606.20785)", url: "https://arxiv.org/abs/2606.20785" },
  "Leanstral 1.5": { label: "Mistral model card", url: "https://huggingface.co/mistralai/Leanstral-1.5-119B-A6B" },
  "Granite SWASH 2B": { label: "IBM Granite model card", url: "https://huggingface.co/ibm-granite/granite-swash-2b" },
  "Granite SWASH 3B-A600M": { label: "IBM Granite model card", url: "https://huggingface.co/ibm-granite/granite-swash-3b-a600m" },
  "DeepSeek V4 Flash": { label: "DeepSeek-V4 tech report (arXiv 2606.19348)", url: "https://arxiv.org/abs/2606.19348" },
  "Qwen3.5-Plus": { label: "Qwen3.5 blog — Qwen Team, Feb 2026", url: "https://qwen.ai/blog?id=qwen3.5" },
  "Qwen3.6 Plus": { label: "Qwen model card", url: "https://huggingface.co/Qwen" },
  "Qwen3.8 Max": { label: "Qwen3.8 blog post", url: "https://qwen.ai/blog?id=qwen3.8" },
  "Qwen3.8 2.4T-A95B": { label: "Qwen3.8 blog post", url: "https://qwen.ai/blog?id=qwen3.8" },
  "Qwen3.8 (27B)": { label: "Qwen3.8 blog post", url: "https://qwen.ai/blog?id=qwen3.8" },
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
  "Qwen3.5 (9B)": { label: "Qwen3.5 blog — Qwen Team, Feb 2026", url: "https://qwen.ai/blog?id=qwen3.5" },
  "Qwen3.5 (0.8B)": { label: "Qwen3.5 blog — Qwen Team, Feb 2026", url: "https://qwen.ai/blog?id=qwen3.5" },
  "Qwen3 235B-A22B": { label: "Qwen3 tech report (arXiv 2505.09388)", url: "https://arxiv.org/abs/2505.09388" },
  "Qwen3-VL 235B-A22B": { label: "Qwen3-VL tech report (arXiv 2511.21631)", url: "https://arxiv.org/abs/2511.21631" },
  "Qwen3.6 (27B)": { label: "Qwen3.6-27B model card", url: "https://huggingface.co/Qwen/Qwen3.6-27B" },
  "Qwen3.6 35B-A3B": { label: "Qwen model card", url: "https://huggingface.co/Qwen" },
  "Llama 3.2 3B": { label: "Llama 3.2 model card", url: "https://huggingface.co/meta-llama/Llama-3.2-3B" },
  "Llama 3.2 1B": { label: "Llama 3.2 model card", url: "https://huggingface.co/meta-llama/Llama-3.2-1B" },
  "Mistral Small 4": { label: "Mistral docs", url: "https://docs.mistral.ai/models/" },
  "SmolLM3-3B": { label: "SmolLM3 (HF blog + playbook)", url: "https://huggingface.co/blog/smollm3" },
  "Tiny Aya": { label: "Cohere Labs Aya", url: "https://cohere.com/research/aya" },
};

// Attention-mechanism dictionary: hover tooltip + the foundational paper that introduced it.
export const ATTENTION_INFO = {
  "KDA + full attn (69:24 layers)": {
    desc: "Kimi Delta Attention: a linear-attention layer using the delta rule with gating, interleaved with full softmax attention. The 69:24 is a count of layers, not heads — of Kimi K3's 93 layers, 69 are KDA and 24 are full-attention Gated MLA, roughly a 3:1 alternation. Linear layers carry a fixed-size recurrent state instead of a KV cache that grows with sequence length, which is where the saving comes from; the periodic full-attention layers restore exact long-range recall. Moonshot reports it cuts KV-cache memory up to 75% and decodes up to 6x faster at 1M context. Paired with Attention Residuals, which let each layer selectively pull representations from arbitrary earlier layers instead of accumulating them uniformly.",
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
  "Sliding-window + attention sinks": {
    desc: "Most layers read only a short window of recent tokens, with a few full-attention layers interleaved to carry information further. Every head additionally learns a sink: somewhere for attention to go when nothing in range is worth reading, instead of the softmax being forced to spread its mass over whatever happens to be nearby.",
    paper: { label: "Attention sinks — Efficient Streaming Language Models (arXiv 2309.17453)", url: "https://arxiv.org/abs/2309.17453" },
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

/**
 * Papers behind each positional-encoding scheme, matched against the posEmb string
 * that SPECS derives from config.json. A model can hit several: DeepSeek V4 is RoPE
 * + YaRN + the MLA rope/nope head split, so it cites all three.
 *
 * Every arXiv id below was resolved against the arXiv API and its title checked —
 * a citation that points at the wrong paper is worse than no citation.
 */
export const POSITIONAL_PAPERS = [
  { match: /NoPE|no rope_theta|NoPE on \d+ of/i,
    label: "NoPE — The Impact of Positional Encoding on Length Generalization (arXiv 2305.19466)",
    url: "https://arxiv.org/abs/2305.19466" },
  { match: /\bRoPE\b|θ=/,
    label: "RoPE — RoFormer: Rotary Position Embedding (arXiv 2104.09864)",
    url: "https://arxiv.org/abs/2104.09864" },
  { match: /partial RoPE/i,
    label: "Partial RoPE — Round and Round We Go! What makes RoPE useful? (arXiv 2410.06205)",
    url: "https://arxiv.org/abs/2410.06205" },
  { match: /yarn/i,
    label: "YaRN — Efficient Context Window Extension (arXiv 2309.00071)",
    url: "https://arxiv.org/abs/2309.00071" },
  { match: /MRoPE/i,
    label: "MRoPE — Qwen2-VL, multimodal rotary position embedding (arXiv 2409.12191)",
    url: "https://arxiv.org/abs/2409.12191" },
  { match: /ABF/,
    label: "ABF base-frequency rescaling — Effective Long-Context Scaling (arXiv 2309.16039)",
    url: "https://arxiv.org/abs/2309.16039" },
  { match: /\bDCA\b/,
    label: "Dual Chunk Attention — Training-Free Long-Context Scaling (arXiv 2402.17463)",
    url: "https://arxiv.org/abs/2402.17463" },
  { match: /longrope/i,
    label: "LongRoPE — Extending the Context Window Beyond 2M Tokens (arXiv 2402.13753)",
    url: "https://arxiv.org/abs/2402.13753" },
  { match: /MLA head split|RoPE dims per head \(MLA\)/,
    label: "MLA rope/nope head split — DeepSeek-V2 (arXiv 2405.04434)",
    url: "https://arxiv.org/abs/2405.04434" },
];

export function positionalPapers(model) {
  const scheme = (SPECS[model.name] || {}).posEmb;
  if (!scheme) return [];
  return POSITIONAL_PAPERS.filter((p) => p.match.test(scheme));
}

// Foundational papers per architecture component, keyed by arch string.
export const ARCH_PAPERS = {
  "Dense": [{ label: "Transformer — Attention Is All You Need (1706.03762)", url: "https://arxiv.org/abs/1706.03762" }],
  "Sparse MoE": [{ label: "Sparse MoE layer (1701.06538)", url: "https://arxiv.org/abs/1701.06538" }, { label: "Switch Transformer (2101.03961)", url: "https://arxiv.org/abs/2101.03961" }],
  "MoE (reported)": [{ label: "Sparse MoE layer (1701.06538)", url: "https://arxiv.org/abs/1701.06538" }],
  "Undisclosed": [],
};


/**
 * Column presets. The table carries fifteen columns because the data warrants it,
 * but almost nobody needs all of them at once: someone sizing a deployment wants
 * different columns from someone choosing a training recipe. "All" stays the default
 * so the full table is still what you land on.
 */
export const PRESETS = {
  All: null,
  Serving: ["name", "intel", "codingAgent", "agentic", "params", "active", "context", "maxOut", "license"],
  Training: ["name", "arch", "params", "active", "attn", "released", "provider"],
  Architecture: ["name", "arch", "attn", "params", "active", "modality", "context"],
};

/**
 * Mark the searched-for text inside a model name.
 *
 * Only a literal, case-insensitive hit is marked. The filter itself is looser — it
 * strips separators, so "qwen 3.8" matches Qwen3.8 — and it also reads columns this
 * never touches, so a row can match without anything lighting up here. That is the
 * right way round: a highlight that pointed at characters the reader did not type
 * would be worse than no highlight at all.
 */
function Highlight({ text, query }) {
  const q = query.trim();
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark style={S.mark}>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/**
 * One of the three Artificial Analysis scores, as a bar plus its number.
 *
 * All three are 0-100 on the same footing, so they share one cell and one set of
 * thresholds — a reader comparing Intelligence against Coding agent is comparing
 * bars drawn to the same scale. A blank is an em dash, never a zero-width bar:
 * the score is absent, not low.
 *
 * `via` names the harness for the coding-agent score, and it is printed in the
 * cell rather than tucked into a tooltip. That index scores a harness driving a
 * model, not a model: GLM-5.2 is 43 through Claude Code and would be a different
 * number through its own CLI. A reader who sees the figure has to see whose
 * scaffolding produced it, or the column is quietly attributing one company's
 * agent engineering to another company's model.
 */
function ScoreCell({ value, via }) {
  return (
    <td style={{ ...S.td }}>
      {value == null ? (
        <span style={S.intelNA}>—</span>
      ) : (
        <>
          <span style={S.intelWrap}>
            <span style={S.intelTrack}>
              <span style={{ ...S.intelFill, width: `${value}%`,
                background: value >= 55 ? "var(--intel-hi)" : value >= 40 ? "var(--intel-mid)" : "var(--intel-lo)" }} />
            </span>
            <span style={S.intelVal}>{value}</span>
          </span>
          {/* The space is a text node, not decoration: the tag is display:block, so
              without it the cell's textContent — what a copy-paste or a scraper gets
              — reads "55via Codex". */}
          {via && <>{" "}<span style={S.viaTag}>via {via}</span></>}
        </>
      )}
    </td>
  );
}

/**
 * One-tap queries offered under an empty search box.
 *
 * Every one is a substring of a value the search actually reads — an attention
 * mechanism, a channel-mixing family, a licence, a modality — so a chip can never
 * land on an empty table. Sorted roughly by how much of the field each one cuts
 * away, so the first tap is a broad slice and the last is a narrow one.
 */
const SEARCH_SUGGESTIONS = ["MoE", "Dense", "MLA", "Sliding-window", "DeltaNet", "Mamba", "Apache 2.0"];

const COLUMNS = [
  { key: "name", label: "Model", numeric: false },
  { key: "intel", label: "Intelligence", numeric: true, sub: "Artificial Analysis",
    tip: "Artificial Analysis Intelligence Index v4.1 — a composite of 9 evaluations (GDPval-AA v2, τ²-Banking, Terminal-Bench v2.1, SciCode, Humanity's Last Exam, GPQA Diamond, CritPt, AA-Omniscience, AA-LCR). Leaderboard snapshot 15 August 2026. “—” = not on the AA leaderboard." },
  { key: "codingAgent", label: "Coding agent", numeric: true, sub: "AA · best harness",
    tip: "Artificial Analysis Coding Agent Index v1.3 — an equal-weighted composite of DeepSWE (113 software-engineering tasks, Datacurve), Terminal-Bench v2 (84 agentic terminal tasks, Laude Institute) and SWE-Atlas-QnA (124 technical Q&A tasks, Scale AI), each scored pass@1 averaged over three attempts. It measures a coding agent driving a model, not a model: the same model scores differently through different harnesses, so the harness is named under the figure. Where AA publishes several pairings for one model, the highest-scoring one is shown. This replaced the Coding Index column, which AA withdrew from its site. “—” = AA publishes no pairing for this model." },
  { key: "agentic", label: "Agentic", numeric: true, sub: "Artificial Analysis",
    tip: "Artificial Analysis Agentic Index — the equal-weighted average of two evaluations of long-horizon, tool-using work: GDPval-AA v2 (real tasks across 44 occupations, run in an agentic loop with shell and browser access, scored by blind pairwise Elo) and τ³-Banking (multi-step tool calls against a large unstructured knowledge base). Scored 0-100 on the same footing as the Intelligence Index. Both evaluations are also among the nine inside the Intelligence Index, so this is a re-cut of part of that score rather than an independent axis. Leaderboard snapshot 16 August 2026. “—” = AA does not score this model on the agentic index." },
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

/**
 * Break an architecture note into separate statements for bullet rendering.
 *
 * Purely presentational — rejoining the result reproduces the original exactly.
 * The hard part is not splitting inside the things these notes are full of:
 * decimals and scales ("1.6T", "3.7%"), version numbers ("K2.5", "GPT-5.6",
 * "v4.1"), and abbreviations ("e.g.", "vs.").
 */
const SENTENCE_ABBREV = new Set([
  "e.g", "i.e", "vs", "etc", "approx", "cf", "al", "no", "fig", "eq", "ref",
  "inc", "ltd", "co", "dr", "prof", "st", "vol", "ch", "pp", "ca", "est",
]);

export function splitNote(note) {
  if (!note) return [];
  const out = [];
  let buf = "";
  for (let i = 0; i < note.length; i++) {
    const c = note[i];
    buf += c;
    if (c !== "." && c !== "!" && c !== "?") continue;
    const after = note.slice(i + 1);
    const m = /^\s+(["“'(]?[A-Z0-9])/.exec(after);
    if (!m) continue;
    // inside a decimal or version number
    if (c === "." && /\d$/.test(note.slice(0, i)) && /^\s*\d/.test(after)) continue;
    // after a known abbreviation
    const lastWord = (buf.match(/([A-Za-z.]+)\.$/) || [])[1];
    if (lastWord && SENTENCE_ABBREV.has(lastWord.replace(/\.$/, "").toLowerCase())) continue;
    // after a single-letter initial
    if (/(^|\s)[A-Za-z]\.$/.test(buf)) continue;
    out.push(buf.trim());
    buf = "";
    i += m[0].length - m[1].length;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export function fmtTokens(n) {
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
export function totalTokens(training) {
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

/** Fold a name to what someone would actually type: no spaces, no punctuation. */
const searchKey = (s) => s.toLowerCase().replace(/[^a-z0-9.]/g, "");

export default function FrontierModelsTable({ focus } = {}) {
  const [sortKey, setSortKey] = useState("intel");
  const [sortDir, setSortDir] = useState("desc");
  const [typeFilter, setTypeFilter] = useState("All");
  const [archFilter, setArchFilter] = useState("All");
  const [weightFilter, setWeightFilter] = useState("All");
  const [yearFilter, setYearFilter] = useState("All");
  // Class, architecture, year and the column presets fold away: five button groups
  // in a row was most of what the page looked like. Weights stays out because it is
  // the split people actually come here to make.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const searchRef = useRef(null);
  // #/model/<name> lands here: open that row so the link is worth sharing.
  const [expanded, setExpanded] = useState(() =>
    (focus && MODELS.some((m) => m.name === focus)) ? focus : null);
  const [preset, setPreset] = useState("All");
  const hiddenCols = useMemo(() => {
    const keep = PRESETS[preset];
    return keep ? COLUMNS.map((c, i) => (keep.includes(c.key) ? -1 : i)).filter((i) => i >= 0) : [];
  }, [preset]);
  const [tip, setTip] = useState(null); // { text, x, y }
  const [lightbox, setLightbox] = useState(null); // { src, alt, href }
  const [reader, setReader] = useState(null); // full-text reading view for one model
  const [selected, setSelected] = useState([]); // model names queued for comparison

  const MAX_COMPARE = 4;
  const toggleCompare = useCallback((name) => {
    setSelected((cur) =>
      cur.includes(name)
        ? cur.filter((n) => n !== name)
        : cur.length >= MAX_COMPARE ? cur : [...cur, name]
    );
  }, []);
  const openCompare = useCallback(() => {
    if (selected.length < 2) return;
    window.location.hash = `#/compare/${selected.map(encodeURIComponent).join("|")}`;
  }, [selected]);

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

  /**
   * "/" jumps to the search field, Escape leaves it — the two keys every reader
   * already has in their fingers from every other search box on the internet.
   *
   * The guard matters more than the shortcut: typing a slash inside any field must
   * type a slash. So the handler stands down whenever the event came from an input,
   * a textarea or anything contenteditable, and whenever a modifier is held, which
   * is where the browser's own shortcuts live.
   */
  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "Escape" && el === searchRef.current) {
        if (query) setQuery("");
        else searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [query]);

  // A row expanded near the bottom of the scrollport would open off-screen, so
  // park its top just under the sticky header whenever the panel doesn't fit.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!expanded || !wrap) return;
    const row = Array.from(wrap.querySelectorAll("tr[data-model]"))
      .find((el) => el.dataset.model === expanded);
    const panel = row && row.nextElementSibling;
    if (!panel) return;
    const wrapRect = wrap.getBoundingClientRect();
    const headerH = wrap.querySelector("th") ? wrap.querySelector("th").offsetHeight : 0;
    const delta = row.getBoundingClientRect().top - (wrapRect.top + headerH);
    if (delta < 0 || panel.getBoundingClientRect().bottom > wrapRect.bottom) {
      wrap.scrollBy({ top: delta, behavior: "smooth" });
    }
  }, [expanded]);

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

  // Buttons are divided by rules rather than gaps, so the last one in a group must
  // drop its divider or it doubles up with the group's own edge.
  const segOf = (on, last) => ({ ...S.seg, ...(last ? { borderRight: "none" } : null), ...(on ? S.segOn : null) });

  // What the folded-away groups are currently doing, for the button that hides them.
  const narrowed = [typeFilter, archFilter, yearFilter].filter((v) => v !== "All")
    .concat(preset === "All" ? [] : [`${preset} cols`]);

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
        // Labs punctuate their own names inconsistently — Qwen3.8 against GPT-5.6
        // against Muse Spark 1.2 — so a raw substring match makes finding a model
        // depend on guessing where its lab put the spaces. Compare with the
        // separators removed from both sides; "qwen 3.8" then finds Qwen3.8.
        //
        // The fields searched are exactly the ones the table displays. Searching the
        // notes as well would find more, and every extra hit would be a row with no
        // visible reason to be there; a reader cannot see why "distillation" matched
        // when the word is three clicks away inside a panel.
        const q = searchKey(query);
        const hit = [m.name, m.provider, m.arch, m.attn, m.license, m.modality, m.type]
          .some((f) => searchKey(f).includes(q));
        if (!hit) return false;
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
      else if (sortKey === "intel" || sortKey === "codingAgent" || sortKey === "agentic") {
        av = a[sortKey] == null ? -1 : a[sortKey];
        bv = b[sortKey] == null ? -1 : b[sortKey];
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
        <SiteNav current="table" />

        <header style={S.header}>
          <div style={S.titleRow}>
            <img src={`${import.meta.env.BASE_URL}logo-atlas.png`} alt="" aria-hidden="true" style={S.logo} />
            <h1 style={{ ...S.title, margin: 0 }}>The Model Atlas</h1>
          </div>
        </header>

        <div style={S.controls}>
          <div style={{ ...S.searchWrap, ...(searchFocus ? S.searchWrapOn : null) }}>
            <span aria-hidden="true" style={{ ...S.searchLegend, ...(searchFocus ? S.searchLegendOn : null) }}>
              search
            </span>
            <span aria-hidden="true" style={S.searchPrompt}>&gt;</span>
            {!query && !searchFocus && (
              <span aria-hidden="true" className="atlas-cursor" style={S.searchCursor}>█</span>
            )}
            <input ref={searchRef} data-search style={S.search}
              placeholder="model, lab, architecture, attention, licence…"
              aria-label="Search models" value={query}
              onFocus={() => setSearchFocus(true)} onBlur={() => setSearchFocus(false)}
              onChange={(e) => setQuery(e.target.value)} />
            {query ? (
              <>
                <span style={S.searchCount} data-search-count>{rows.length}/{MODELS.length}</span>
                <button type="button" style={S.searchClear} aria-label="Clear search"
                  onClick={() => { setQuery(""); searchRef.current?.focus(); }}>×</button>
              </>
            ) : (
              // The shortcut is only advertised where it works: pressing it while the
              // field already has focus would type a slash, not focus anything.
              !searchFocus && <span aria-hidden="true" style={S.searchKey}>/</span>
            )}
          </div>
          <div style={S.segGroup}>
            {weights.map((w, i) => (
              <button key={w} onClick={() => setWeightFilter(w)}
                style={segOf(weightFilter === w, i === weights.length - 1)}>{w}</button>
            ))}
          </div>
          {/* Anything set while the panel is shut would otherwise be invisible, so the
              button names it rather than just counting. */}
          <button type="button" data-filters-toggle aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
            style={{ ...S.moreFilters, ...(narrowed.length ? S.moreFiltersOn : null) }}>
            {narrowed.length ? narrowed.join(" · ") : "More filters"}
            <span aria-hidden="true" style={S.moreCaret}>{filtersOpen ? "−" : "+"}</span>
          </button>
        </div>

        {/* Nobody's first instinct is to search a reference table for "MLA". These
            are here to say that they can: each one is a real value in a column the
            search reads, so every chip lands on models rather than on nothing. */}
        {!query && (
          <div style={S.tries} data-tries>
            <span style={S.triesLabel}>Try</span>
            {SEARCH_SUGGESTIONS.map((s) => (
              <button key={s} type="button" style={S.tryChip}
                onClick={() => { setQuery(s); searchRef.current?.focus(); }}>{s}</button>
            ))}
          </div>
        )}

        {filtersOpen && (
          <div style={S.filterPanel} data-filter-panel>
            <div style={S.filterRow}>
              <span style={S.filterLabel}>Class</span>
              <div style={S.segGroup}>
                {types.map((t, i) => (
                  <button key={t} onClick={() => setTypeFilter(t)}
                    style={segOf(typeFilter === t, i === types.length - 1)}>{t}</button>
                ))}
              </div>
            </div>
            <div style={S.filterRow}>
              <span style={S.filterLabel}>Architecture</span>
              <div style={S.segGroup}>
                {archs.map((a, i) => (
                  <button key={a} onClick={() => setArchFilter(a)}
                    style={segOf(archFilter === a, i === archs.length - 1)}>{a}</button>
                ))}
              </div>
            </div>
            <div style={S.filterRow}>
              <span style={S.filterLabel}>Released</span>
              <div style={S.segGroup}>
                {years.map((y, i) => (
                  <button key={y} onClick={() => setYearFilter(y)}
                    style={segOf(yearFilter === y, i === years.length - 1)}>{y}</button>
                ))}
              </div>
            </div>
            <div style={S.filterRow}>
              <span style={S.filterLabel}>Columns</span>
              <div style={S.segGroup} data-presets>
                {Object.keys(PRESETS).map((p, i, all) => (
                  <button key={p} onClick={() => setPreset(p)} title={`Show the ${p.toLowerCase()} columns`}
                    style={segOf(preset === p, i === all.length - 1)}>
                    {p === "All" ? "All cols" : p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div style={S.count}>
            {rows.length} model{rows.length !== 1 ? "s" : ""} · tap a row to expand · tick up to {MAX_COMPARE} to compare side by side
          </div>
        )}

        {/* A table with no rows and no explanation reads as a broken page. Say what
            was searched for, and put the way out one tap away. */}
        {rows.length === 0 && (
          <div style={S.empty} data-empty>
            <div style={S.emptyLine}>
              Nothing matches <span style={S.emptyQuery}>{query}</span>
              {narrowed.length ? <> with {narrowed.join(" · ").toLowerCase()} set</> : null}.
            </div>
            <div style={S.emptyHint}>
              Search reads the model, lab, architecture, attention, licence, modality
              and class columns.
            </div>
            <button type="button" style={S.emptyBtn}
              onClick={() => { setQuery(""); searchRef.current?.focus(); }}>
              Clear the search
            </button>
          </div>
        )}

        {/* Presets hide columns with generated CSS rather than by dropping cells from the
            markup. Every row keeps all fifteen cells in the same positions, so the header
            and body cannot drift out of alignment — the one bug this table has actually
            shipped. Detail rows are spared via :not([colspan]). */}
        {hiddenCols.length > 0 && (
          <style>{hiddenCols.map((i) =>
            `#atlas-table > thead > tr > th:nth-child(${i + 1}),` +
            `#atlas-table > tbody > tr > td:not([colspan]):nth-child(${i + 1})` +
            `{display:none}`).join("")}</style>
        )}
        {/* Hidden rather than emptied when nothing matches: a header row standing over
            no rows reads as the table having failed, not as the search having. */}
        <div style={{ ...S.tableWrap, ...(rows.length === 0 ? S.hidden : null) }} ref={wrapRef}>
          <table style={S.table} id="atlas-table">
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
                      data-model={m.name}
                      style={{ ...S.tr, background: isOpen ? "var(--row-open)" : i % 2 ? "var(--row-alt)" : "transparent",
                        cursor: "pointer" }}>
                      <td style={{ ...S.td, ...S.modelCell }}>
                        <input
                          type="checkbox"
                          checked={selected.includes(m.name)}
                          disabled={!selected.includes(m.name) && selected.length >= MAX_COMPARE}
                          onChange={() => toggleCompare(m.name)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${m.name} for comparison`}
                          title={
                            selected.includes(m.name) ? "Remove from comparison"
                              : selected.length >= MAX_COMPARE ? `Limit is ${MAX_COMPARE} models`
                              : "Add to comparison"
                          }
                          style={S.compareBox}
                        />
                        <span style={{ ...S.caret, transform: isOpen ? "rotate(90deg)" : "none" }}>▸</span>
                        <span style={S.modelName}>
                          <Highlight text={m.name} query={query} />
                          <ProviderMark provider={m.provider} />
                        </span>
                      </td>
                      <ScoreCell value={m.intel} />
                      <ScoreCell value={m.codingAgent} via={m.codingAgentVia} />
                      <ScoreCell value={m.agentic} />
                      <td style={{ ...S.td, ...S.num, ...S.releasedCell }}>{m.released}</td>
                      <td style={S.td}>{m.provider}</td>
                      <td style={S.td}>
                        <span style={{ ...S.pill, color: tc.fg }}>
                          <span style={{ ...S.pillDot, background: tc.dot }} />{m.type}
                        </span>
                      </td>
                      <td style={S.td}>
                        <span style={{ ...S.archTag, color: ac }}>{m.arch}</span>
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
                                {(() => {
                                  // One statement per bullet: a wall of prose is the
                                  // last thing anyone wants to read in a reference table.
                                  const bits = splitNote(m.note);
                                  const LIMIT = 3;
                                  const shown = bits.slice(0, LIMIT);
                                  const rest = bits.length - shown.length;
                                  return (
                                    <>
                                      <ul style={S.noteList}>
                                        {shown.map((b, bi) => (
                                          <li key={bi} style={S.noteItem}>
                                            <span style={S.noteMark} aria-hidden="true" />
                                            <span>{b}</span>
                                          </li>
                                        ))}
                                      </ul>
                                      {rest > 0 && (
                                        <button type="button" style={S.moreBtn}
                                          onClick={(e) => { e.stopPropagation(); setReader(m); }}>
                                          {rest} more {rest === 1 ? "note" : "notes"} <span aria-hidden="true">→</span>
                                        </button>
                                      )}
                                    </>
                                  );
                                })()}
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
                                  const posPapers = positionalPapers(m);
                                  if (posPapers.length === 0) return null;
                                  return (
                                    <div style={S.linkRow}>
                                      <span style={S.linkTag} title="Papers behind this model's positional-encoding scheme">
                                        Position
                                      </span>
                                      <span style={S.linkList}>
                                        {posPapers.map((p, pi) => (
                                          <a key={pi} style={S.link} href={p.url} target="_blank" rel="noopener noreferrer">
                                            {p.label} ↗
                                          </a>
                                        ))}
                                      </span>
                                    </div>
                                  );
                                })()}
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
                                    // Never present an inherited pipeline's budgets as this model's own disclosure.
                                    if (m.trainingSource) return "Training pipeline · inherited, not reported";
                                    const tt = totalTokens(m.training);
                                    return tt
                                      ? `Training pipeline · ~${tt.total} disclosed${tt.hasEst ? " (incl. est.)" : ""}`
                                      : "Training pipeline";
                                  })()}
                                </span>
                                {m.trainingSource && (
                                  <div style={S.provenance}>
                                    <span style={S.provenanceTag}>Not this model's own figures</span>
                                    <p style={S.provenanceText}>{m.trainingSource}</p>
                                  </div>
                                )}
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

        <footer style={{ ...S.footer, paddingBottom: selected.length > 0 ? 96 : undefined }}>
          <span>Training stages and token counts are from each model's technical report or model card; "disclosed" totals sum only the stages with published numbers, so true totals are higher. Closed flagships publish no training breakdown.</span>
          <span>Intelligence = Artificial Analysis Intelligence Index, leaderboard snapshot 15 August 2026 (artificialanalysis.ai), taken at v4.1 and labelled v4.1.1 by AA as of 16 August. It combines 9 evaluations: GDPval-AA v2, 𝜏³-Banking, Terminal-Bench v2.1, SciCode, Humanity's Last Exam, GPQA Diamond, CritPt, AA-Omniscience and AA-LCR. Where AA lists several reasoning-effort variants, the highest-scoring variant is shown, per index rather than per model: AA scores some variants on one index and not another, so a model's three figures can come from different effort settings. Agentic and Coding agent were read on 16 August 2026, one day later than Intelligence; "—" = not on the AA leaderboard.</span>
          <span>Coding agent = Artificial Analysis Coding Agent Index v1.3, read 16 August 2026: an equal-weighted composite of DeepSWE (113 software-engineering tasks, Datacurve), Terminal-Bench v2 (84 agentic terminal tasks, Laude Institute) and SWE-Atlas-QnA (124 technical Q&A tasks, Scale AI), each scored pass@1 averaged over three attempts per task. Read it as a measure of a pair, not of a model. AA evaluates a coding agent driving a model — Claude Code, Codex, Cursor CLI, Opencode, Gemini CLI, Grok Build, Kimi Code CLI, tbh — and the same model scores very differently depending on which harness is holding it: GLM-5.2 is 43 through Claude Code, against 69 on the model-only index that used to sit in this column. The harness is therefore named under every figure. Where AA publishes several pairings for one model, the highest-scoring pairing is shown, which is usually but not always the lab's own agent. 22 of the 71 models here have a published pairing; "—" means AA has not evaluated any agent on that model.</span>
          <span>This column replaced a Coding column carrying AA's Coding Index — Terminal-Bench v2.1 and SciCode combined, scoring the model on its own. Artificial Analysis has since withdrawn that index from its site: it has no page, no leaderboard column and no entry among the capability indices, though the underlying field is still populated behind the leaderboard. A figure a reader cannot go and check is not one this atlas should carry, so it was dropped rather than left in place with a caveat. Both of its component benchmarks are still published individually by AA, and both now count toward the Intelligence Index instead.</span>
          <span>Agentic = Artificial Analysis Agentic Index, leaderboard snapshot 16 August 2026: the equal-weighted average of GDPval-AA v2 (real tasks across 44 occupations and 9 industries, run in an agentic loop with shell access and web browsing, scored by blind pairwise Elo) and 𝜏³-Banking (multi-step tool calls over a large unstructured knowledge base). It is not independent of the Intelligence column — both evaluations are among the nine that make up Intelligence Index v4.1 — so treat it as that score re-cut for long-horizon tool use, not as a second opinion. AA scores 160 of its 608 leaderboard entries on this index, which is why 25 models here show "—" while carrying an Intelligence figure.</span>
          <span>Detailed architecture specs for open-weight models — layer counts, attention head grouping, expert counts, vocabulary size, sliding-window size and positional-encoding scheme — are read directly from each model's own config.json on Hugging Face. Positional schemes come from rope_theta, partial_rotary_factor and per-layer rope_parameters; a model is only described as using NoPE where its technical report says so, never merely because its config omits rope_theta.</span>
          <span>Architecture diagrams are hot-linked from Sebastian Raschka's LLM Architecture Gallery (sebastianraschka.com/llm-architecture-gallery) with credit, and the intelligence column is Artificial Analysis's index. Everything else here — the model notes, training pipelines and spec fields — is compiled by us from primary technical reports, model cards and config files.</span>
          <span>Closed-flagship architecture fields say "Undisclosed" or "reported" — vendors publish few internals; do not treat reported MoE labels as confirmed counts.</span>
          <span>Context = max input window. Compiled from public provider docs, model cards and third-party analyses, July 2026; figures shift frequently.</span>
          <span style={S.copyright}>© 2026 José Vicente Egas López</span>
        </footer>
      </div>
      {tip && (
        <div style={{ ...S.tooltip,
          left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 320),
          top: tip.y + 16 }}>
          {tip.text}
        </div>
      )}

      {selected.length > 0 && (
        <div style={S.compareBar} role="region" aria-label="Model comparison tray">
          <div style={S.compareBarInner}>
            <span style={S.compareCount}>
              {selected.length} of {MAX_COMPARE} selected
            </span>
            <div style={S.compareChips}>
              {selected.map((n) => (
                <button key={n} type="button" style={S.compareChip}
                  onClick={() => toggleCompare(n)} title={`Remove ${n}`}>
                  {n} <span aria-hidden="true" style={{ opacity: 0.6 }}>✕</span>
                </button>
              ))}
            </div>
            <div style={S.compareActions}>
              <button type="button" style={S.compareClear} onClick={() => setSelected([])}>
                Clear
              </button>
              <button
                type="button"
                style={{ ...S.compareGo, ...(selected.length < 2 ? S.compareGoOff : {}) }}
                onClick={openCompare}
                disabled={selected.length < 2}
                title={selected.length < 2 ? "Select at least two models" : "Compare selected models"}
              >
                Compare {selected.length >= 2 ? `${selected.length} models` : ""} →
              </button>
            </div>
          </div>
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
              <ul style={{ ...S.noteList, marginTop: 4 }}>
                {splitNote(reader.note).map((b, bi) => (
                  <li key={bi} style={{ ...S.noteItem, ...S.noteItemReader }}>
                    <span style={S.noteMark} aria-hidden="true" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            {reader.training && (
              <div style={S.readerSection}>
                <span style={{ ...S.detailLabel, color: CLAY }}>
                  Training pipeline{reader.trainingSource ? " · inherited, not reported" : ""}
                </span>
                {reader.trainingSource && (
                  <div style={S.provenance}>
                    <span style={S.provenanceTag}>Not this model's own figures</span>
                    <p style={S.provenanceText}>{reader.trainingSource}</p>
                  </div>
                )}
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

// ===== Theme: near-black surfaces, electric blue accent, grotesque display =====
export const mono = "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace";
/**
 * One neutral grotesque for the whole page, controls included, set tight.
 *
 * These are all fonts a reader already has. The face this theme is modelled on is
 * a licensed squeezed grotesque, and buying it would mean shipping a webfont: this
 * site deliberately makes no third-party requests at runtime and hosts no binaries
 * it does not need. Helvetica Neue is the closest thing already installed, and the
 * tight negative tracking on the display sizes does most of the work anyway — the
 * squeeze reads as tracking long before it reads as a different typeface.
 */
export const display = "'Helvetica Neue', Helvetica, Inter, 'Segoe UI', Arial, sans-serif";
const CLAY = "var(--clay)";      // the one spot colour: a proof-correction red
const CLAY_SOFT = "var(--clay-soft)"; // soft tint of it
const PAPER = "var(--paper)";     // the page
const CARD = "var(--card)";      // same as the page; nothing here is raised
const INK = "var(--ink)";       // primary text
const INK_SOFT = "var(--ink-soft)";  // secondary text
const INK_FAINT = "var(--ink-faint)"; // tertiary
const LINE = "var(--line)";      // hairline border
const LINE_SOFT = "var(--line-soft)";
export const S = {
  // Transparent on purpose: the fixed parallax field behind the app paints the
  // page colour, and a solid background here would cover it.
  page: { background: "transparent", minHeight: "100vh", padding: "40px 22px", color: INK,
    fontFamily: display },
  shell: { maxWidth: 1240, margin: "0 auto" },
  header: { marginBottom: 26 },
  eyebrow: { fontFamily: mono, fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase",
    color: CLAY, marginBottom: 14 },
  titleRow: { display: "flex", alignItems: "center", gap: 16, margin: "0 0 14px", flexWrap: "wrap" },
  // Decorative: the adjacent <h1> already carries the name, so the img is aria-hidden.
  // The mark is wider than tall, so it is sized to sit against the cap height of
  // the title rather than to a square box.
  logo: { width: "clamp(62px, 9vw, 104px)", height: "auto", flexShrink: 0, display: "block",
    borderRadius: 0 },
  title: { fontFamily: display, fontSize: "clamp(38px, 7vw, 76px)", fontWeight: 500, letterSpacing: "-0.035em",
    margin: "0 0 14px", lineHeight: 1.02, color: INK },
  sub: { color: INK_SOFT, fontSize: 15.5, lineHeight: 1.6, maxWidth: 700, margin: 0 },
  controls: { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 },
  // Underlined rather than boxed: a rule under a field is the form convention, and
  // it removes one more rectangle from a page that had a great many.
  // A terminal prompt, boxed, with its label cut into the top rule the way a
  // fieldset legend sits in its border. Everything inside is monospace: the whole
  // point of the old-school register is that the field looks like somewhere you
  // type commands rather than somewhere you fill in a form.
  searchWrap: { position: "relative", display: "flex", alignItems: "center", gap: 8,
    flex: "1 1 300px", minWidth: 240, padding: "9px 11px", border: `1px solid ${LINE}`,
    borderRadius: 0, background: "transparent", transition: "border-color 120ms ease" },
  searchWrapOn: { borderColor: CLAY },
  searchLegend: { position: "absolute", top: -7, left: 9, padding: "0 5px",
    background: PAPER, fontFamily: mono, fontSize: 9, letterSpacing: "0.14em",
    textTransform: "uppercase", color: INK_FAINT, transition: "color 120ms ease" },
  searchLegendOn: { color: CLAY },
  searchPrompt: { fontFamily: mono, fontSize: 13, lineHeight: 1, color: CLAY },
  searchCursor: { fontFamily: mono, fontSize: 12, lineHeight: 1, color: CLAY,
    marginLeft: -3, animation: "atlas-blink 1.1s step-end infinite" },
  search: { background: "transparent", border: "none", borderRadius: 0, padding: 0,
    color: INK, fontSize: 13, flex: 1, minWidth: 0, outline: "none", fontFamily: mono,
    letterSpacing: "0.01em", caretColor: CLAY },
  searchCount: { fontFamily: mono, fontSize: 11, color: INK_FAINT,
    fontVariantNumeric: "tabular-nums" },
  searchClear: { background: "transparent", border: "none", cursor: "pointer", padding: "0 2px",
    fontFamily: mono, fontSize: 16, lineHeight: 1, color: INK_FAINT },
  // A key cap, sized like one. Hidden on focus, where pressing it would type it.
  searchKey: { fontFamily: mono, fontSize: 10, color: INK_FAINT, border: `1px solid ${LINE}`,
    borderRadius: 0, padding: "1px 6px", lineHeight: 1.4 },
  mark: { background: CLAY_SOFT, color: "inherit", padding: "0 1px", borderRadius: 2 },
  hidden: { display: "none" },
  tries: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7, margin: "14px 0 4px" },
  triesLabel: { fontFamily: mono, fontSize: 10, letterSpacing: "0.03em", textTransform: "uppercase",
    color: INK_FAINT, marginRight: 1 },
  tryChip: { background: "transparent", border: `1px solid ${LINE}`, borderRadius: 0,
    padding: "3px 10px", cursor: "pointer", fontFamily: mono, fontSize: 10.5, color: INK_SOFT },
  empty: { border: `1px solid ${LINE}`, background: CARD, padding: "26px 24px", marginBottom: 20 },
  emptyLine: { fontSize: 16, color: INK, marginBottom: 7 },
  emptyQuery: { fontFamily: mono, fontSize: 14, color: CLAY },
  emptyHint: { fontSize: 13, color: INK_FAINT, marginBottom: 16, maxWidth: 520, lineHeight: 1.6 },
  emptyBtn: { background: "transparent", border: `1px solid ${LINE}`, borderRadius: 0,
    padding: "7px 15px", cursor: "pointer", fontFamily: mono, fontSize: 10.5,
    letterSpacing: "0.03em", textTransform: "uppercase", color: INK_SOFT },
  // Wraps because the widest group (the column presets) is itself wider than a
  // 380px screen; without this the whole page picks up a horizontal scrollbar.
  segGroup: { display: "inline-flex", flexWrap: "wrap", background: "transparent",
    border: `1px solid ${LINE}`, borderRadius: 0, padding: 0 },
  seg: { background: "transparent", border: "none", borderRight: `1px solid ${LINE}`,
    color: INK_SOFT, padding: "6px 13px", fontSize: 13, borderRadius: 0, cursor: "pointer",
    fontWeight: 400, whiteSpace: "nowrap", fontFamily: display },
  segOn: { background: CLAY, color: "var(--on-clay)" },
  moreFilters: { display: "inline-flex", alignItems: "center", gap: 8, background: "transparent",
    border: "none", borderBottom: `1px solid ${LINE}`, borderRadius: 0, padding: "7px 2px",
    fontFamily: mono, fontSize: 11.5, letterSpacing: "0.03em", textTransform: "uppercase",
    color: INK_FAINT, cursor: "pointer", whiteSpace: "nowrap" },
  moreFiltersOn: { color: CLAY, borderBottomColor: CLAY },
  moreCaret: { fontFamily: mono, fontSize: 13, lineHeight: 1 },
  filterPanel: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 16,
    paddingLeft: 14, borderLeft: `2px solid ${LINE}` },
  filterRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  filterLabel: { fontFamily: mono, fontSize: 10.5, letterSpacing: "0.03em",
    textTransform: "uppercase", color: INK_FAINT, minWidth: 92 },
  count: { fontFamily: mono, fontSize: 12, color: INK_FAINT, marginBottom: 10 },
  // The table is its own scrollport in both directions: 66 rows would otherwise
  // push the footer a couple of screens down the page. No box around it: a printed
  // table is delimited by its rules, not by a frame, and the scrollport does not
  // need to announce itself.
  tableWrap: { overflow: "auto", maxHeight: "clamp(380px, 72vh, 900px)",
    borderBottom: `2px solid ${INK}`, background: CARD },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1240 },
  // Booktabs: a heavy rule above the header, a light one below it, a heavy one under
  // the last row, and no vertical rules anywhere. borderCollapse paints a cell's
  // border on the table rather than the cell, so a sticky header's own borders
  // scroll away with the rows — both of its rules are inset shadows instead.
  th: { padding: "13px 12px 9px", fontWeight: 400, fontSize: 11, cursor: "pointer", userSelect: "none",
    fontFamily: mono, letterSpacing: "0.03em", textTransform: "uppercase",
    boxShadow: `inset 0 2px 0 ${INK}, inset 0 -1px 0 ${INK}`,
    position: "sticky", top: 0, zIndex: 2, background: CARD,
    whiteSpace: "nowrap", color: INK_SOFT },
  modelName: { display: "inline-flex", alignItems: "center", gap: 7 },
  compareBox: { width: 14, height: 14, marginRight: 9, cursor: "pointer", flexShrink: 0,
    accentColor: CLAY, verticalAlign: "middle" },
  // Fixed tray so the selection survives scrolling a 56-row table.
  compareBar: { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60,
    background: CARD, borderTop: `1px solid ${LINE}`, boxShadow: "0 -6px 18px rgba(0,0,0,0.08)",
    padding: "12px 22px" },
  compareBarInner: { maxWidth: 1240, margin: "0 auto", display: "flex", alignItems: "center",
    gap: 14, flexWrap: "wrap" },
  compareCount: { fontFamily: mono, fontSize: 11, letterSpacing: "0.03em",
    textTransform: "uppercase", color: INK_FAINT, flexShrink: 0 },
  compareChips: { display: "flex", gap: 7, flexWrap: "wrap", flex: "1 1 auto", minWidth: 0 },
  compareChip: { display: "inline-flex", alignItems: "center", gap: 7, background: "var(--detail-bg)",
    border: `1px solid ${LINE}`, borderRadius: 0, padding: "5px 11px", cursor: "pointer",
    fontSize: 12.5, color: INK, fontFamily: display },
  compareActions: { display: "flex", gap: 9, flexShrink: 0, alignItems: "center" },
  compareClear: { background: "transparent", border: "none", cursor: "pointer",
    fontFamily: mono, fontSize: 11, letterSpacing: "0.03em", textTransform: "uppercase",
    color: INK_FAINT, padding: "8px 6px" },
  compareGo: { background: CLAY, color: "var(--on-clay)", border: "none", borderRadius: 0,
    padding: "9px 18px", cursor: "pointer", fontFamily: mono, fontSize: 11.5,
    letterSpacing: "0.03em", textTransform: "uppercase", fontWeight: 600 },
  compareGoOff: { opacity: 0.42, cursor: "not-allowed" },
  thInner: { display: "inline-flex", alignItems: "center", gap: 5 },
  // Attribution for the Intelligence column, sitting under its header label.
  thSub: { display: "block", fontFamily: mono, fontSize: 9, letterSpacing: "0.02em",
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
  // The harness that produced the coding-agent figure, printed under it: the score
  // belongs to the pair, and a bare number would read as a property of the model.
  viaTag: { display: "block", fontFamily: mono, fontSize: 9, letterSpacing: "0.02em",
    color: INK_FAINT, marginTop: 3, whiteSpace: "nowrap" },
  pill: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 },
  pillDot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block" },
  // No box. The colour already says which family this is, the legend above says what
  // the colours mean, and a rectangle drawn 66 times down a column is pure furniture.
  archTag: { fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" },
  detailCell: { padding: 0, borderBottom: `1px solid ${LINE}` },
  // Pinned to the left edge of the scrollport so the panel stays put while the
  // table scrolls sideways underneath it. Width is set from the wrapper at runtime.
  // zIndex below the header's: this row sits after <thead> in the DOM, so
  // without it the panel would paint over the sticky header on vertical scroll.
  detailSticky: { position: "sticky", left: 0, zIndex: 1 },
  diagramBlock: { marginTop: 16 },
  diagramBtn: { display: "block", padding: 0, border: `1px solid ${LINE}`, borderRadius: 0,
    background: CARD, cursor: "zoom-in", overflow: "hidden", position: "relative",
    width: "100%", maxWidth: 300, lineHeight: 0 },
  diagramImg: { width: "100%", height: "auto", display: "block" },
  diagramZoom: { position: "absolute", right: 7, bottom: 7, width: 24, height: 24,
    display: "grid", placeItems: "center", borderRadius: 0, fontSize: 12,
    background: "var(--card)", border: `1px solid ${LINE}`, color: INK_SOFT, lineHeight: 1 },
  diagramCredit: { fontSize: 11, color: INK_FAINT, marginTop: 7, lineHeight: 1.5 },
  creditLink: { color: INK_SOFT, textDecoration: "underline", textUnderlineOffset: 2 },
  lightbox: { position: "fixed", inset: 0, zIndex: 100, background: "rgba(20,19,17,0.72)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" },
  // Reading view: generous measure and leading so long stage text is comfortable.
  readerInner: { background: CARD, border: `1px solid ${LINE}`, borderRadius: 0,
    padding: "26px 30px 24px", width: "min(760px, 94vw)", maxHeight: "92vh",
    overflow: "auto", cursor: "auto", boxShadow: "0 18px 50px rgba(0,0,0,0.35)" },
  readerBar: { display: "flex", alignItems: "flex-start", justifyContent: "space-between",
    gap: 18, marginBottom: 22, paddingBottom: 18, borderBottom: `1px solid ${LINE}` },
  readerEyebrow: { fontFamily: mono, fontSize: 10.5, letterSpacing: "0.03em",
    textTransform: "uppercase", color: INK_FAINT, marginBottom: 6 },
  readerTitle: { fontFamily: display, fontSize: 27, fontWeight: 500, margin: 0,
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
    border: `1px solid ${LINE_SOFT}`, borderRadius: 0, borderLeft: `2px solid ${CLAY}` },
  curriculumLabel: { display: "block", fontFamily: mono, fontSize: 9.5, letterSpacing: "0.03em",
    textTransform: "uppercase", color: CLAY, marginBottom: 5 },
  curriculumText: { margin: 0, fontSize: 13, lineHeight: 1.7, color: INK_SOFT, maxWidth: "66ch" },
  readerFoot: { display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center",
    justifyContent: "space-between", paddingTop: 16, borderTop: `1px solid ${LINE}`,
    fontSize: 12, color: INK_SOFT },
  lightboxInner: { background: CARD, border: `1px solid ${LINE}`, borderRadius: 0, padding: 14,
    maxWidth: "min(1100px, 96vw)", maxHeight: "94vh", overflow: "auto", cursor: "auto",
    boxShadow: "0 18px 50px rgba(0,0,0,0.35)" },
  lightboxBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 10 },
  lightboxTitle: { fontFamily: mono, fontSize: 12, letterSpacing: "0.03em", textTransform: "uppercase", color: INK_SOFT },
  lightboxClose: { background: "transparent", border: `1px solid ${LINE}`, borderRadius: 0,
    width: 28, height: 28, cursor: "pointer", color: INK_SOFT, fontSize: 13, lineHeight: 1, flexShrink: 0 },
  lightboxImg: { display: "block", maxWidth: "100%", height: "auto", borderRadius: 0 },
  lightboxCredit: { fontSize: 11, color: INK_FAINT, marginTop: 10, lineHeight: 1.5 },
  detailInner: { padding: "18px 18px 22px 34px", boxSizing: "border-box" },
  detailCols: { display: "flex", flexWrap: "wrap", gap: 30, alignItems: "flex-start" },
  detailArchCol: { flex: "1 1 280px", minWidth: 260, maxWidth: 460 },
  detailTrainCol: { flex: "2 1 480px", minWidth: 300 },
  detailLabel: { fontFamily: mono, fontSize: 10.5, letterSpacing: "0.03em", textTransform: "uppercase",
    fontWeight: 700, display: "block", marginBottom: 10 },
  detailText: { margin: 0, fontSize: 14, lineHeight: 1.78, color: INK, letterSpacing: "0.002em" },
  // Architecture notes as separate statements rather than one block of prose.
  noteList: { listStyle: "none", margin: 0, padding: 0, display: "flex",
    flexDirection: "column", gap: 11 },
  noteItem: { display: "flex", gap: 11, alignItems: "flex-start", fontSize: 13.5,
    lineHeight: 1.72, color: INK, letterSpacing: "0.002em" },
  noteItemReader: { fontSize: 14.5, lineHeight: 1.8, maxWidth: "68ch" },
  noteMark: { width: 5, height: 5, borderRadius: "50%", background: CLAY,
    flexShrink: 0, marginTop: "0.55em", opacity: 0.75 },
  // Collapsed previews: keep the panel scannable, full text lives in the reader.
  clampNote: { display: "-webkit-box", WebkitLineClamp: 7, WebkitBoxOrient: "vertical",
    overflow: "hidden" },
  clampStage: { display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical",
    overflow: "hidden" },
  moreBtn: { marginTop: 12, display: "inline-flex", alignItems: "center", gap: 7,
    background: "transparent", border: `1px solid ${LINE}`, borderRadius: 0,
    padding: "7px 15px", cursor: "pointer", fontFamily: mono, fontSize: 10.5,
    letterSpacing: "0.03em", textTransform: "uppercase", color: INK_SOFT },
  attnHover: { borderBottom: `1px dotted ${INK_FAINT}`, cursor: "help" },
  tooltip: { position: "fixed", zIndex: 50, maxWidth: 300, background: INK,
    border: "none", borderRadius: 0, padding: "10px 12px",
    fontSize: 12.5, lineHeight: 1.5, color: "var(--paper)", pointerEvents: "none",
    boxShadow: "0 6px 20px rgba(20,18,14,0.18)" },
  linkRow: { display: "flex", gap: 9, alignItems: "baseline", marginTop: 8, fontSize: 12.5, lineHeight: 1.5 },
  linkTag: { fontFamily: mono, fontSize: 10, letterSpacing: "0.03em", textTransform: "uppercase",
    color: INK_FAINT, flexShrink: 0, paddingTop: 1, minWidth: 44 },
  linkList: { display: "flex", flexDirection: "column", gap: 4 },
  link: { color: CLAY, textDecoration: "none", borderBottom: `1px solid ${CLAY_SOFT}` },
  linkNA: { color: INK_FAINT, fontStyle: "italic" },
  detailNA: { margin: 0, fontSize: 13.5, lineHeight: 1.6, color: INK_SOFT, fontStyle: "italic" },
  pipeline: { display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 10 },
  stage: { flex: "1 1 210px", minWidth: 200, maxWidth: 310, background: CARD,
    border: `1px solid ${LINE}`, borderRadius: 0, padding: "14px 16px 16px" },
  stageHead: { display: "flex", alignItems: "center", gap: 7, marginBottom: 8 },
  stageNum: { fontFamily: mono, fontSize: 11, fontWeight: 700, color: "var(--on-clay)", background: CLAY,
    width: 18, height: 18, borderRadius: "50%", display: "inline-flex", alignItems: "center",
    justifyContent: "center", flexShrink: 0 },
  stageName: { fontSize: 13, fontWeight: 650, color: INK, lineHeight: 1.2 },
  stageTokens: { display: "inline-block", fontFamily: mono, fontSize: 11.5, fontWeight: 700,
    color: "var(--tok-ok-fg)", background: "var(--tok-ok-bg)", border: "1px solid var(--tok-ok-line)", borderRadius: 0,
    padding: "1px 6px", marginBottom: 6 },
  stageTokensEst: { color: "var(--tok-est-fg)", background: "var(--tok-est-bg)", border: "1px solid var(--tok-est-line)" },
  stageDetail: { margin: 0, fontSize: 12.5, lineHeight: 1.72, color: INK_SOFT },
  curriculumFlag: { display: "block", marginTop: 8, fontFamily: mono, fontSize: 9.5,
    letterSpacing: "0.04em", color: CLAY },
  // Shown when a pipeline is borrowed from a predecessor: has to read as a warning,
  // not as this model's own disclosure.
  provenance: { margin: "0 0 14px", padding: "12px 15px", borderRadius: 0,
    background: "var(--tok-est-bg)", border: `1px solid var(--tok-est-line)`,
    borderLeft: `3px solid var(--tok-est-fg)` },
  provenanceTag: { display: "block", fontFamily: mono, fontSize: 9.5, letterSpacing: "0.03em",
    textTransform: "uppercase", color: "var(--tok-est-fg)", marginBottom: 6, fontWeight: 700 },
  provenanceText: { margin: 0, fontSize: 12.5, lineHeight: 1.7, color: INK_SOFT, maxWidth: "68ch" },
  pipeArrow: { display: "flex", alignItems: "center", color: CLAY, fontSize: 16, fontWeight: 700 },
  synthesis: { marginTop: 40 },
  synthHead: { fontFamily: display, fontSize: 26, fontWeight: 500, letterSpacing: "-0.01em", margin: "0 0 18px", color: INK },
  synthGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 },
  synthCard: { background: CARD, border: `1px solid ${LINE}`, borderRadius: 0, padding: "20px 20px 22px" },
  synthNum: { fontFamily: mono, fontSize: 13, fontWeight: 700, color: CLAY, marginBottom: 10 },
  synthTitle: { fontFamily: display, fontSize: 17, fontWeight: 500, margin: "0 0 9px", color: INK },
  synthBody: { margin: 0, fontSize: 13, lineHeight: 1.65, color: INK_SOFT },
  copyright: { marginTop: 6, paddingTop: 12, borderTop: `1px solid ${LINE_SOFT}`,
    fontFamily: mono, fontSize: 11.5, color: INK_FAINT, letterSpacing: "0.02em" },
  footer: { marginTop: 30, display: "flex", flexDirection: "column", gap: 5,
    fontSize: 11.5, color: INK_FAINT, lineHeight: 1.55 },
};
