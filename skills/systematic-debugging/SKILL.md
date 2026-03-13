# Skill: Systematic Debugging

## Description
A rigorous four-phase approach to root cause analysis and bug fixing.

## Instructions
1. **Root Cause Investigation**:
   - Read error messages carefully (stack traces, line numbers).
   - Stable reproduction: Ensure you can reliably trigger the issue.
   - Check recent changes: Git diff, environment changes.
   - Forensic analysis: Add logs at component boundaries.
2. **Pattern Analysis**:
   - Find working examples in the codebase.
   - Compare with reference implementations/docs.
   - List all differences.
3. **Hypothesis and Testing**:
   - Formulate a single hypothesis: "X is the cause because Y."
   - Minimize testing: Change one variable at a time.
   - Revert and restart if hypothesis is wrong.
4. **Implementation**:
   - Create a failing test case first.
   - Implement the single fix.
   - Verify fix and ensure no regressions.

## Constraints
- Never attempt a fix without identifying the root cause first.
- Never "try" multiple things at once.
- Always create a regression test.
