# 🗺️ ROADMAP.md - Vibe Kanban Evolution

## 🌟 Vision & Goals

To provide a modern, high-performance Kanban board with 3D visualization, CLI integration, and built-in automation to supercharge engineering team productivity. Our goal is to bridge the gap between developer-friendly CLI tooling and immersive, at-a-glance 3D project management, all backed by reliable SQLite persistence.

## 📊 Current Status

**Phase: Visualization & Automation (Phase 2)**
The core Kanban functionalities (SQLite persistence, Node.js API, basic CLI) are complete and stable. We are actively expanding the 3D visualization scene (Three.js), refining our CLI orchestration, and strengthening our CI/CD pipeline infrastructure to ensure reliability at scale. The project is currently addressing stability and fallback mechanisms for AI provider exhaustion.

## 📅 Quarterly Roadmap

### Q1: Stability & CI/CD Excellence

**Focus: Establishing a rock-solid foundation for continuous delivery and system resilience.**

- **High Priority (Bugs/Critical):**
  - Fix failing CI pipelines (Issues: #CI pipeline failing - please fix)
  - Implement GitHub Actions CI/CD Pipeline (Issue: #Implement GitHub Actions CI/CD Pipeline, #Setup CI/CD pipeline and toolset)
- **Medium Priority:**
  - Implement Stall Detector and Provider Exhaustion Fallback (Issue: #feat: Implement Stall Detector and Provider Exhaustion Fallback)
- **Low Priority:**
  - General tech debt cleanup in test suites.

### Q2: 3D Visualization & Agent Dynamics

**Focus: Enhancing the immersive 3D experience and dynamic agent interactions.**

- **High Priority:**
  - Dynamic 3D Agent Skin Recreation based on assigned LLM models (Issue: #Dynamic 3D Agent Skin Recreation)
- **Medium Priority:**
  - Complete the Three.js board visualization and task card models.
  - Finalize local Kubernetes (Kind) development scripts.
- **Low Priority:**
  - Increase Playwright E2E test coverage for 3D interactions.

### Q3: Collaboration & Orchestration

**Focus: Scaling the platform for multi-user, real-time collaboration.**

- **High Priority:**
  - Implement WebSocket for real-time synchronization for collaborative boards (replacing current SSE).
- **Medium Priority:**
  - Expand `vibe` CLI with advanced orchestration commands.
  - Integration with external backlogs (GitHub/Jira/Linear).
- **Low Priority:**
  - Simulating agent movement in 3D space with pathfinding (replacing simple interpolation).

### Q4: Expansion & v1.0 Release

**Focus: Polish, extensibility, and official v1.0 launch.**

- **High Priority:**
  - v1.0 Release Stabilization.
- **Medium Priority:**
  - Plugin System: Allow custom visualization themes and CLI extensions.
  - Automated task movement based on Kubernetes event triggers.
- **Low Priority:**
  - Lightweight mobile companion app for task tracking.

---

## 🔍 Feature Details

### 1. Robust CI/CD Pipeline Implementation

- **User Value:** Ensures code quality, prevents regressions, and automates deployments, leading to faster and more reliable releases.
- **Technical Approach:** Setup GitHub Actions workflows to run ESLint, TypeScript compilation, Node.js native test runner, and Playwright E2E tests on every PR.
- **Success Criteria:** All open PRs require passing checks before merging. Zero manual intervention required for testing.
- **Estimated Effort:** Medium

### 2. Stall Detector and Provider Exhaustion Fallback

- **User Value:** Prevents the system from hanging indefinitely when an AI provider fails or times out, ensuring continuous operation.
- **Technical Approach:** Implement a timeout/stall detection mechanism in the driver orchestration logic. Track global provider health and gracefully fallback to available agents or unassign tasks when a provider is exhausted.
- **Success Criteria:** Orchestration engine successfully reassigns tasks or marks them as 'done/interrupted' without crashing the server when an API goes offline.
- **Estimated Effort:** Medium

### 3. Dynamic 3D Agent Skin Recreation

- **User Value:** Provides immediate visual feedback in the 3D space regarding which AI model is currently executing a task.
- **Technical Approach:** Dynamically update Three.js `BoxGeometry` textures to render the active LLM model name directly onto the agent's chest badge. Ensure textures are redrawn smoothly without resetting agent position.
- **Success Criteria:** When an agent's model changes via CLI/API, their 3D avatar instantly reflects the new model name legibly on their chest.
- **Estimated Effort:** Small

### 4. Real-time WebSocket Synchronization

- **User Value:** Enables seamless multi-user collaboration where board updates happen instantly across all connected clients without page reloads.
- **Technical Approach:** Migrate the current Server-Sent Events (SSE) implementation to a robust WebSocket connection for bi-directional real-time state updates.
- **Success Criteria:** Task movements made by one user are reflected in all other active browser sessions with less than 100ms latency.
- **Estimated Effort:** Large

---

## ⚠️ Dependencies & Risks

- **Three.js Performance:** Expanding the 3D scene and dynamic textures must be monitored to ensure it doesn't degrade performance on lower-end machines.
- **Test Flakiness:** E2E Playwright tests involving 3D canvas interactions and real-time orchestrations can be inherently flaky. Investment in robust wait conditions is crucial.
- **AI Provider Stability:** The system relies heavily on external CLIs and APIs (OpenAI, Gemini, Copilot). Rate limits and service outages are significant risks requiring robust fallback logic.
