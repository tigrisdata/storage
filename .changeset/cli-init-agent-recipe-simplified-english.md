---
"@tigrisdata/cli": patch
"tigris": patch
---

`tigris init --agent` prints its setup recipe in [ASD-STE100 Simplified
Technical English](https://www.asd-ste100.org/). Each step reads the same
way to every agent that follows it.

The goal is to make the instructions unambiguous for both humans and
agents. A distracted operator and a less capable model read each step the
same way.

Each step is now one instruction per sentence in the imperative. Every
condition is ahead of the command. All steps that carried two orders at
once now use two sentences. An agent can no longer do half of a step
and count it as complete.
