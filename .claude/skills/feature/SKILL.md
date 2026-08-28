---
name: feature
description: Manage current featue workflow - start, review, explain or complete
argument-hint: load|start|review|explain|test|complete
---

# Feature Workflow

Manages the full lifecycle of a feature form spec to merge.

## Working File

@context/current-feature.md

### File Structure

current-feature.md has these sections:

- `# Current Feature` - H1 heading with feature name when active
- `## Status` - Not Started | In Progress | Complete
- `## Goals` - Bullet points of what success looks like
- `## Notes` - Additional context, constraints, or details from spec
- `## History` - Completed features (append only)

## Task

Execute the requested action: $ARGUMENTS

| Action     | Description                                              |
| ---------- | -------------------------------------------------------- |
| `load`     | Load a feature spec or inline description                |
| `start`    | Begin implementation, create branch                      |
| `review`   | Check goals met, code quality                            |
| `explain`  | Document what changed and why                            |
| `test`     | Check for testable logic or server actions and utilities |
| `complete` | Commit, merge, reset                                     |

See [actions/](actions/) for detailed instructions.

If no action provided, explain the available options.
