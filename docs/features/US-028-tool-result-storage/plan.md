# Plan

1. Inspect Claude stream message shapes and confirm where tool_result blocks arrive.
2. Persist tool_result blocks when they come from stream user messages, without duplicating user text.
3. Aggregate tool_result blocks across messages in the UI and hide tool_result-only messages from the timeline.
4. Validate tool outputs render after reload and note any unrun tests.
