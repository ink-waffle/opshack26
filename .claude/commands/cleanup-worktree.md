Clean up the worktree and branch we just worked on in this conversation. The user has already merged/rebased the work.

## Step 1: Identify the target

Look at the conversation context — find the branch name we were working on. If unclear, ask.

Never target `main`.

## Step 2: Safety checks

Run all checks from the **main repo root** (not from inside the worktree).

**2a. Find the worktree path** via `git worktree list`. If the branch has no worktree (already removed), skip to 2c.

**2b. Check for uncommitted work** via `git -C <worktree-path> status --porcelain`:

- `??` lines (untracked) are OK — artifacts.
- `M`, `A`, `D`, `R`, `C`, `U` lines (tracked changes) are NOT OK. Stop: "Worktree has uncommitted tracked changes. Aborting."

**2c. Check for unmerged commits** via `git log --oneline main..<branch>`:

- Empty = safe, fully merged. Record `mergeMode = fast-forward`.
- Non-empty = the branch has commits whose exact hashes aren't in main. This is expected after a rebase or squash merge. Detect which:

  **2c-i. Rebase detection** — `git cherry main <branch>`:
  - Every line starts with `-` → every commit has a patch-id equivalent in main. Safe, merged via rebase. Record `mergeMode = rebased`.
  - Any `+` lines → continue to 2c-ii with the `+` commits only.

  **2c-ii. Squash detection** — for each `+` commit from 2c-i, check if its subject line appears in main: `git log --pretty=%s -n 500 main | grep -Fx "<subject>"`.
  - If every `+` commit's subject matches a commit in main → safe, merged via squash. Record `mergeMode = squashed` and note the matched commits.
  - If any subject is unmatched → genuinely unmerged. Show the commit list (identifier + subject) and ask the user before proceeding.

## Step 3: Delete

1. If worktree exists: `cd` to repo root, then `git worktree remove --force <path>`
2. `git worktree prune`
3. Delete the branch:
   - `mergeMode = fast-forward` → `git branch -d <branch>`.
   - `mergeMode = rebased` or `squashed` → `git branch -D <branch>` directly (the hashes differ by design, `-d` will always refuse — asking is just friction).
   - Unmerged but user approved in 2c → `git branch -D <branch>`.
4. Confirm done, including which merge mode was detected.
