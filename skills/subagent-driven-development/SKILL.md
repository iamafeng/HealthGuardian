# Skill: Subagent-Driven Development

## Description
Enables task delegation to specialized subagents for parallel or complex development.

## Instructions
- **Delegate Small**: Identify modular tasks suitable for subagents (e.g., refactoring a specific class, writing unit tests for a utility).
- **Clear Context**: Provide the subagent with the exact file paths, relevant code snippets, and the specific task from the Plan.
- **Review**: Always perform a two-stage review:
  1. **Compliance**: Did the subagent follow the plan and TDD?
  2. **Quality**: Is the code idiomatic and correct?
- **Merge**: Integrate the subagent's work only after verification.

## Constraints
- Never delegate without a specific task from a Plan.
- Never accept subagent work without running tests.
