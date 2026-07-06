# content-relay-commit SPEC

## Purpose

Route Content Relay commit requests through the global commit workflow while adding repo- and workspace-specific attribution requirements.

## Invocation

Use before committing changes in this repository, preparing a commit message, or responding to requests to commit, save, amend, or create git history.

## Runtime contract

- Require loading the global `commit` skill.
- Require explicit user intent before creating commits, amends, or pushes.
- Require `safe-git-practices` for branch changes, push/pull, merge/rebase, reset, restore, clean, stash, or destructive git operations.
- Add both required attribution trailers.
- Keep commit guidance thin; do not duplicate the full global commit skill.

## Maintenance

Update this skill when repo commit attribution, global git safety guidance, or commit message conventions change.
