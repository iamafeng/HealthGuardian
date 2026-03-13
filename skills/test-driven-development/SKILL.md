# Skill: Test-Driven Development (TDD)

## Description
Enforces the Red-Green-Refactor cycle for all code changes.

## Instructions
- **Rule**: NO production code without a failing test case.
- **RED**: Write a minimal failing test. Observe it fail with the correct reason.
- **GREEN**: Write the simplest code to make the test pass. No over-engineering.
- **REFACTOR**: Clean up code and remove duplication while keeping tests green.
- **Validation**: Only after seeing the test fail can you trust it is valid.

## Constraints
- If you accidentally wrote code before tests, DELETE the code and restart from the test.
- Every new feature or bug fix MUST have an associated test case.
