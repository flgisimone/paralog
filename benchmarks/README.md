# Benchmark

How paralog's precision and recall are measured. The plan is in [`plan/01-benchmark.md`](../plan/01-benchmark.md).

## Contents

| Path | Content |
|---|---|
| `fixtures/<name>/` | Synthetic repositories with overlaps inserted on purpose; `annotations.json` lists the overlaps (difficulty 1–4) and the near-misses that must not be reported. |
| `labels/<repo>.json` | Hand labels of the findings reported on a real repository: `true`, `false` or `"unsure"` per finding id. |
| `schema/` | JSON Schemas of annotations, labels, candidates and findings. |
| `schema.ts`, `score.ts`, `bench.ts` | Formats, scoring and the `npm run bench` command. |

## Scoring a run

```bash
npm run bench -- --run <dir> [--all]
```

The run directory holds the outputs of one tool (or one model) on the targets:

```
<dir>/fixtures/<fixture>/candidates.json   ranked candidate pairs (optional)
<dir>/fixtures/<fixture>/findings.json     findings (optional)
<dir>/real/<repo>/findings.json            findings on a real repository
```

`--run` defaults to `benchmarks/results/latest` (ignored by git). The command writes `score.json` and `score.md` into the run directory and prints the markdown.

What is measured:

- **Fixtures, candidates**: recall@K (K = 10, 25, 50, 100, 200) overall and per difficulty, near-misses in the top K, rank of the first hit per overlap.
- **Fixtures, findings**: precision and recall of confirmed findings (`--all` adds unverified ones), recall per difficulty, false positives on near-misses, unverified findings that would have been true positives.
- **Real repositories**: precision from the labels (`true / (true + false)`); `unsure` and unlabeled findings are excluded and reported.
- **Cost**: tokens, dollars and seconds from the `usage` of each findings file.

Matching rule: a candidate pair or a finding hits a case when at least two of its members are distinct members of that case. Units are compared as `file#Qualified.name`, with or without the `:kind` suffix. On a fixture, every finding that hits no overlap is a false positive: the fixture is assumed to be fully annotated.
