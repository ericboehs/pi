#!/usr/bin/env bash
# Fork-only: merge upstream/main into this fork's main, rebuild dist/, and run the tests.
#
# ~/.pi/agent/bin/pi runs this checkout's dist/, so a successful run means the
# next pi start uses the merged build.
#
# Usage: scripts/sync-upstream.sh [--push] [--skip-tests] [--quick-tests]
#   --push         push main to origin once build and tests pass
#   --skip-tests   merge and build only
#   --quick-tests  run only the coding-agent vitest suite instead of ./test.sh
#
# Stops on the first failure and leaves the tree as-is so you can inspect it.
# A merge conflict leaves the merge in progress: resolve and commit, then rerun
# with the same flags (the merge step is skipped once upstream/main is merged).
# To back out a merge that built or tested badly: git reset --hard ORIG_HEAD && npm run build
set -euo pipefail

push=false
tests=full
for arg in "$@"; do
	case "$arg" in
		--push) push=true ;;
		--skip-tests) tests=none ;;
		--quick-tests) tests=quick ;;
		-h | --help)
			sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
			exit 0
			;;
		*)
			printf 'Unknown option: %s\n' "$arg" >&2
			exit 2
			;;
	esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() {
	printf '\033[31mError:\033[0m %s\n' "$*" >&2
	exit 1
}

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

[[ "$(git branch --show-current)" == main ]] || die "check out main first (on $(git branch --show-current))"
git remote get-url upstream >/dev/null 2>&1 || die "no 'upstream' remote (git remote add upstream https://github.com/earendil-works/pi.git)"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || die "working tree has uncommitted changes"

step "Fetching origin and upstream"
git fetch --quiet origin main
git fetch --quiet upstream main

if ! git merge-base --is-ancestor origin/main main; then
	step "Fast-forwarding main to origin/main"
	git merge --ff-only origin/main || die "main and origin/main have diverged; reconcile them first"
fi

before=$(git rev-parse HEAD)
behind=$(git rev-list --count main..upstream/main)
if [[ "$behind" -eq 0 ]]; then
	step "Already up to date with upstream/main ($(git rev-parse --short upstream/main))"
else
	step "Merging $behind upstream commit(s) ($(git rev-parse --short upstream/main))"
	if ! git merge --no-edit upstream/main; then
		printf '\nConflicts:\n' >&2
		git diff --name-only --diff-filter=U | sed 's/^/  /' >&2
		die "resolve the conflicts and commit (or git merge --abort), then rerun"
	fi
fi

if [[ "$behind" -gt 0 ]] && ! git diff --quiet "$before" HEAD -- package-lock.json; then
	step "package-lock.json changed: npm ci --ignore-scripts"
	npm ci --ignore-scripts
fi

step "Building (npm run build)"
npm run build

case "$tests" in
	full)
		step "Testing (./test.sh)"
		./test.sh
		;;
	quick)
		step "Testing (coding-agent vitest)"
		(cd packages/coding-agent && npx vitest --run)
		;;
	none) step "Skipping tests" ;;
esac

if $push; then
	step "Pushing main to origin"
	git push origin main
fi

step "Done: main is at $(git rev-parse --short HEAD). Restart pi to use the new build."
