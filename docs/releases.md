# Releasing

Preparing a release never creates a tag or publishes a package.

1. Run the **Release** workflow. It starts from main, prepares the version and
   changelog commit on a release branch, and dispatches CI for that commit.
2. Open the compare link in the workflow summary to create the release PR.
   Repository policy currently disallows Actions-created PRs; no extra token or
   policy bypass is needed.
3. Merge normally after required checks pass.
4. Run **Publish** from main with the version tag and exact merged release commit
   SHA. For squash merges, use the new main commit, not the release branch SHA.

Publish verifies main ancestry, matching workspace package versions and release
notes before creating and pushing that specific tag. A retry must use the same
commit and tag; existing tags are never moved. Already-uploaded packages retain
content-verification checks.

Local preparation uses `bun scripts/release.ts` on a clean branch and creates
only a commit. The old `--push` option is rejected. Open a PR, then publish through
the explicit workflow after merge.
