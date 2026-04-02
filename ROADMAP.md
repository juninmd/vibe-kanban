# 🗺️ ROADMAP.md - Vibe Kanban Evolution

## 🌟 Vision & Goals
To provide a modern, high-performance Kanban board with 3D visualization, CLI integration, and built-in orchestration to supercharge engineering team productivity. Our goal is to bridge the gap between developer-friendly CLI tooling and immersive, at-a-glance 3D project management, all backed by reliable SQLite persistence and AI-driven automation.

## 📊 Current Status
**Phase: Stabilization & UI Refinement (Phase 3)**
The core Kanban functionalities (SQLite persistence, Node.js API, basic CLI) and the foundation of the 3D visualization scene are complete. However, the current focus must urgently shift to stabilizing the project's infrastructure. We are facing critical CI pipeline failures that block reliable continuous integration. Concurrently, there is a backlog of user requests for UI/UX enhancements that will significantly improve the usability of the 2D and 3D Kanban interfaces.

## 📅 Quarterly Roadmap

### Q1: Infrastructure Stability & Quality Assurance
**Focus: Resolving critical pipeline blockers to establish a rock-solid foundation for continuous delivery.**
- **High Priority (Bugs/Critical):**
  - Fix failing CI pipelines. This is currently blocking reliable merges and is the top priority.
    - [Issue #146: CI pipeline failing - please fix](https://github.com/juninmd/vibe-kanban/issues/146)
    - [Issue #127: CI pipeline failing - please fix](https://github.com/juninmd/vibe-kanban/issues/127)
    - [Issue #115: CI pipeline failing - please fix](https://github.com/juninmd/vibe-kanban/issues/115)
    - [Issue #113: CI pipeline failing - please fix](https://github.com/juninmd/vibe-kanban/issues/113)
- **Medium Priority:**
  - Implement automated E2E retry mechanisms to mitigate flaky Playwright tests affecting the CI pipeline.
- **Low Priority:**
  - General tech debt cleanup in test suites and repository structure.

### Q2: UI/UX Refinement & Usability Enhancements
**Focus: Improving the daily user experience based on community feedback.**
- **High Priority:**
  - Address core UI/UX improvement suggestions to enhance accessibility, navigation, and visual clarity in both the 2D fullscreen and 3D views.
    - [Issue #165: UI/UX Improvement Suggestions](https://github.com/juninmd/vibe-kanban/issues/165)
    - [Issue #145: UI/UX Improvement Suggestions](https://github.com/juninmd/vibe-kanban/issues/145)
    - [Issue #133: UI/UX Improvement Suggestions](https://github.com/juninmd/vibe-kanban/issues/133)
- **Medium Priority:**
  - Dynamic 3D Agent Skin Recreation based on assigned LLM models to provide immediate visual context in the 3D scene.
- **Low Priority:**
  - Improve the visual design of the Task Cards in the 3D environment for better legibility.

### Q3: Collaboration & Orchestration
**Focus: Scaling the platform for multi-user, real-time collaboration.**
- **High Priority:**
  - Implement WebSocket for real-time synchronization for collaborative boards (replacing current SSE implementation).
- **Medium Priority:**
  - Implement Stall Detector and Provider Exhaustion Fallback for resilient AI agent orchestration.
  - Integration with external backlogs (GitHub/Jira/Linear).
- **Low Priority:**
  - Simulating agent movement in 3D space with pathfinding (replacing simple interpolation).

### Q4: Expansion & v1.0 Release
**Focus: Polish, extensibility, and official v1.0 launch.**
- **High Priority:**
  - v1.0 Release Stabilization and Security Audits.
- **Medium Priority:**
  - Plugin System: Allow custom visualization themes and CLI extensions.
- **Low Priority:**
  - Lightweight mobile companion app for task tracking.

---

## 🔍 Feature Details

### 1. Robust CI/CD Pipeline Remediation
- **User Value:** Ensures code quality, prevents regressions, and automates deployments. Developers can trust the mainline branch and contribute without fear of hidden breakages.
- **Technical Approach:** Investigate the root cause of the current GitHub Actions failures (Issues #146, #127, #115, #113). This likely involves fixing broken test suites, resolving dependency conflicts, or correcting the Playwright E2E environment setup.
- **Success Criteria:** All CI pipeline checks pass consistently on `main` and all open PRs. Zero manual intervention required for testing.
- **Estimated Effort:** Large

### 2. UI/UX Interface Overhaul
- **User Value:** Provides a smoother, more intuitive experience. Reduces friction in managing tasks and observing the 3D environment, directly increasing user productivity and satisfaction.
- **Technical Approach:** Systematically address the suggestions in Issues #165, #145, and #133. This will likely involve CSS/styling updates in `styles.css`, adjusting HTML layouts, and potentially tweaking the Three.js camera controls or lighting for better visibility.
- **Success Criteria:** The requested UI improvements are implemented, resulting in a cleaner 2D interface and a more accessible 3D scene without impacting rendering performance.
- **Estimated Effort:** Medium

### 3. Dynamic 3D Agent Skin Recreation
- **User Value:** Provides immediate visual feedback in the 3D space regarding which AI model is currently executing a task, enhancing system observability.
- **Technical Approach:** Dynamically update Three.js `BoxGeometry` textures to render the active LLM model name directly onto the agent's chest badge. Ensure textures are redrawn smoothly.
- **Success Criteria:** When an agent's model changes via CLI/API, their 3D avatar instantly reflects the new model name legibly on their chest.
- **Estimated Effort:** Small

### 4. Real-time WebSocket Synchronization
- **User Value:** Enables seamless multi-user collaboration where board updates happen instantly across all connected clients without polling lag.
- **Technical Approach:** Migrate the current Server-Sent Events (SSE) implementation to a robust WebSocket connection for bi-directional real-time state updates.
- **Success Criteria:** Task movements made by one user are reflected in all other active browser sessions with less than 100ms latency.
- **Estimated Effort:** Large

---

## ⚠️ Dependencies & Risks
- **Test Flakiness & CI Stability:** The current broken CI pipeline is the biggest risk to development velocity. E2E Playwright tests involving 3D canvas interactions can be inherently flaky; fixing the pipeline must address this flakiness permanently.
- **Three.js Performance:** Implementing UI/UX changes and dynamic textures must be monitored to ensure it doesn't degrade performance on lower-end machines.
- **AI Provider Stability:** The system relies on external CLIs and APIs. Provider exhaustion is a risk requiring robust fallback logic (planned for Q3).
