```markdown
# AGENTS.md File Guidelines

These guidelines are designed to ensure a well-structured, maintainable, and high-quality codebase for the AGENTS repository. Adherence to these principles will contribute to a robust and scalable AI agent development environment.

## 1. DRY (Don't Repeat Yourself)

*   **Single Responsibility Principle:** Each agent component (e.g., agent module, data processor, communication module) should have a single, clearly defined purpose.
*   **Abstraction:**  Avoid redundant code. Create abstract interfaces or classes to represent common functionality.
*   **Code Reuse:**  Whenever possible, reuse existing code patterns across different agents or components.

## 2. KISS (Keep It Simple, Stupid)

*   **Minimal Code:** Strive for the shortest code path that achieves the required functionality.  Avoid unnecessary complexity.
*   **Readability:** Prioritize code clarity.  Use meaningful variable names, comments, and consistent formatting.
*   **Understandable Logic:** Ensure the logic within each component is straightforward to follow.

## 3. SOLID Principles

*   **Single Responsibility Principle:**  As described above.
*   **Liskov Substitution Principle:**  Implementations of a base class should be substitutable for implementations of derived classes without altering the correctness of the system.
*   **Interface Segregation Principle:** Clients should not be required to know about methods they do not use.
*   **Open/Closed Principle:** The system should be extensible through mechanisms like configuration or plugins without modifying the core code.

## 4. YAGNI (You Aren't Gonna Need It)

*   **Avoid premature optimization:** Focus on implementing the necessary features for the current task and defer non-essential optimizations to future iterations.
*   **Future-Proofing:**  Don't add features or logic that are unlikely to be required in the future.
*   **Focus on Functionality:**  Prioritize implementing the essential requirements of the agent component before adding optional features.

## 5. Code Length Constraints

*   **Maximum Code:** 180 lines of code per file.
*   **Code Reviews:** Each file must be reviewed by at least one other team member before being merged.

## 6. Test Coverage Requirements

*   **Minimum Coverage:** 80% test coverage across all files.
*   **Test Framework:** Utilize a chosen testing framework (e.g., pytest, unittest) consistently.
*   **Test Suite:** Maintain a comprehensive test suite with well-defined test cases.

## 7. File Structure & Organization

*   **Root Directory:**  The AGENTS.md file must reside in the root directory of the repository.
*   **Module/Component Structure:**  Organize files into logical modules or components (e.g., `agent_core.py`, `agent_data_processor.py`, `agent_communication.py`).
*   **Docstrings:**  Include detailed docstrings for all functions, classes, and modules explaining their purpose, parameters, and return values. Use a consistent docstring format (e.g., Google style).

## 8.  File Content Guidelines

*   **Clear and Concise:**  Each file should have a focused and understandable scope.
*   **Comments:**  Use comments judiciously to explain complex logic or non-obvious code.
*   **Naming Conventions:** Follow consistent naming conventions for variables, functions, and classes (e.g., camelCase for variables, PascalCase for classes).

## 9.  Specific File Examples (Illustrative - Adapt to Specific Component Requirements)

*   `agent_core.py`:  Contains core agent functionality, including initialization, data handling, and basic communication.
*   `agent_data_processor.py`:  Handles data transformation and processing.
*   `agent_communication.py`:  Manages agent communication with other agents.
*   `test_agent_core.py`: Contains unit tests for the core agent functionality.
*   `test_agent_data_processor.py`: Contains unit tests for the data processor functionality.
*   `test_agent_communication.py`: Contains unit tests for the communication functionality.

## 10.  Tools and Practices

*   **Version Control:** Utilize Git for version control and collaboration.
*   **Code Style:**  Enforce a consistent code style using a linter (e.g., pylint, flake8).
*   **Static Analysis:** Employ static analysis tools to identify potential errors and code quality issues.
*   **Documentation:** Maintain a README file explaining the purpose of the AGENTS.md file, how to run the agents, and any relevant setup instructions.

```