## Summary

<!-- 1–3 sentences. Why is this change being made? -->

## Linked issue

<!-- Closes #123 -->

## Test plan

- [ ]
- [ ]

## Checklist

- [ ] PR title follows [Conventional Commits](https://www.conventionalcommits.org/) — we squash-merge, so it becomes the commit on `main`
- [ ] Tests added or updated (`tests/**/*_test.ts`)
- [ ] Docs updated (`docs/`, `README.md`, `AGENTS.md` as applicable)
- [ ] Exactly one of: a changeset fragment under `.changes/unreleased/` (a player would notice this) **or** the `no-changelog` label
- [ ] `make build && make test && make lint && make fmt-check` all pass locally
