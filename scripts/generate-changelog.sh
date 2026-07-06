#!/usr/bin/env bash
# Regenerate CHANGELOG.md from conventional-commit history (OSS_SPEC §8.4).
# Walks every `v*` tag (newest first) — plus the given tag when it does not
# exist yet, in which case HEAD stands in for it — and emits a Keep a
# Changelog document with commits grouped per release by conventional-commit
# type. CHANGELOG.md is fully generated — never edit it by hand.
set -euo pipefail

tag="${1:?usage: generate-changelog.sh <tag>}"

emit_release() {
  # $1 = version label (without v), $2 = git ref for this release,
  # $3 = previous tag (may be empty).
  local label="$1" ref="$2" prev="$3"
  local range="${prev:+${prev}..}${ref}"
  local date
  date=$(git log -1 --format=%cs "$ref" 2>/dev/null || date +%Y-%m-%d)

  echo
  echo "## [${label}] - ${date}"

  local type heading lines
  for type in feat fix perf docs test; do
    case "$type" in
      feat) heading="Added" ;;
      fix) heading="Fixed" ;;
      perf) heading="Performance" ;;
      docs) heading="Documentation" ;;
      test) heading="Tests" ;;
    esac
    lines=$(git log --pretty=format:'- %s' "$range" 2>/dev/null \
      | grep -E "^- ${type}(\([^)]*\))?!?: " | sort -u || true)
    if [ -n "$lines" ]; then
      echo
      echo "### ${heading}"
      echo
      echo "$lines"
    fi
  done

  # Breaking changes get their own section regardless of type.
  local breaking
  breaking=$(git log --pretty=format:'- %s' "$range" 2>/dev/null \
    | grep -E '^- [a-z]+(\([^)]*\))?!: ' | sort -u || true)
  if [ -n "$breaking" ]; then
    echo
    echo "### Breaking"
    echo
    echo "$breaking"
  fi
}

{
  echo "# Changelog"
  echo
  echo "All notable changes to this project are documented in this file."
  echo
  echo "The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),"
  echo "and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)."
  echo
  echo "This file is **auto-generated from conventional commits at release time**"
  echo "by \`scripts/generate-changelog.sh\` — do not edit manually."

  # Release points: every existing v* tag newest-first; when the given tag
  # does not exist yet (local dry run before tagging), HEAD stands in for it.
  releases=()
  if ! git rev-parse -q --verify "refs/tags/${tag}" >/dev/null; then
    releases+=("${tag#v}|HEAD")
  fi
  while IFS= read -r t; do
    [ -n "$t" ] && releases+=("${t#v}|${t}")
  done < <(git tag --list 'v*' --sort=-v:refname)

  for ((i = 0; i < ${#releases[@]}; i++)); do
    label="${releases[$i]%%|*}"
    ref="${releases[$i]##*|}"
    prev_entry="${releases[$((i + 1))]:-}"
    prev="${prev_entry##*|}"
    emit_release "$label" "$ref" "$prev"
  done
} > CHANGELOG.md

echo "regenerated CHANGELOG.md up to ${tag}"
