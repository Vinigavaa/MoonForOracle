## ADDED Requirements

### Requirement: Sidebar Navigator reflects the open package's subprograms

The system SHALL provide a "Navigator" section in the sidebar that lists the top-level functions and procedures of the package currently open/active in the editor. When the active editor tab is a package, the Navigator SHALL show its subprograms, each with the member name and an icon distinguishing a function from a procedure. When no package is active, the Navigator SHALL show a hint to open a package.

#### Scenario: Opening a package populates the Navigator

- **WHEN** the user opens a package in the editor (by clicking it in the tree, by Ctrl+Click on an identifier, or by activating an existing package tab)
- **THEN** the Navigator section lists that package's top-level functions and procedures, with an icon per member indicating function vs. procedure

#### Scenario: Switching tabs updates the Navigator

- **WHEN** the user switches the active editor tab from one package to another (or to a non-package tab)
- **THEN** the Navigator updates to the newly active package's subprograms, or shows the "open a package" hint when the active tab is not a package

#### Scenario: Package with no subprograms

- **WHEN** the active package's body declares no top-level functions or procedures
- **THEN** the Navigator shows an empty ("No members") indicator and does not error

### Requirement: Navigator loads members automatically and caches them

The system SHALL load the active package's member list automatically (without manual expansion), deriving it from the package body source so each member's reported line matches the source shown in the editor. The loaded list SHALL be cached for the session so re-activating the same package does not refetch.

#### Scenario: Automatic load on activation

- **WHEN** a package becomes the active editor object and its members have not been loaded this session
- **THEN** the system fetches the package source, parses its members, and displays them, showing a loading indicator while the fetch is in progress

#### Scenario: Cached on re-activation

- **WHEN** the user re-activates a package whose members were already loaded this session
- **THEN** the Navigator displays the members immediately without refetching the source

#### Scenario: Load failure is recoverable

- **WHEN** fetching or parsing the active package's source fails
- **THEN** the Navigator shows an error state with a way to retry, and the rest of the app remains usable

### Requirement: Selecting a Navigator member navigates to its declaration

The system SHALL, when the user clicks a member in the Navigator, focus the active package's source editor, switch it to the package body part, and place the caret and scroll position at the member's declaration line.

#### Scenario: Navigate to a member

- **WHEN** the user clicks a function or procedure in the Navigator
- **THEN** the system switches the package editor to the body part and scrolls to and places the caret on that member's declaration line

#### Scenario: Re-clicking the same member re-navigates

- **WHEN** the user clicks the same member again after scrolling away
- **THEN** the system scrolls back to that member's declaration line (navigation re-triggers via a monotonic token)

#### Scenario: Navigation waits for asynchronous source load

- **WHEN** the user clicks a member and the package source has not finished loading in the editor
- **THEN** the system performs the scroll-to-line once the source finishes loading rather than being lost
