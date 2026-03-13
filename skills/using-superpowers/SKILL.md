# Skill: Using Superpowers

## Description
This skill enforces the use of standardized software engineering workflows. It ensures that the agent never skips the necessary steps of brainstorming, planning, and testing.

## Instructions
- **Mandatory Use**: You MUST activate a relevant skill if there is even a 1% chance it applies to the current task. This is non-negotiable.
- **Skill Before Action**: Before providing any response or taking any action (including asking a question), you must first activate the relevant skill.
- **No Excuses**: Do not skip skill activation with excuses like "it's just a simple question," "I need more context," or "I'll explore the code first."
- **Priority**: Always prioritize process skills (Brainstorming, Debugging) before implementation skills.

## Constraints
- Never perform a task without a plan if it involves more than one step.
- Never write production code without a failing test case (TDD).
- Never attempt a fix without identifying the root cause (Systematic Debugging).
