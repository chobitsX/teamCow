# TeamCow Chat-First Modal Refresh Design

Date: 2026-05-16
Status: Draft approved in conversation, awaiting user review of written spec
Scope: Renderer shell UX refresh for empty-state center lane and `New Conversation` creation flow

## Goal

Refresh the TeamCow desktop shell so it feels like a calm, professional, chat-first local AI workspace instead of a product explainer page.

The redesign should:

- simplify the center lane when there is no active conversation
- replace the inline `New Conversation` launcher with a true centered modal
- preserve the three-column workspace mental model
- keep the right inspector visible but visually quiet when there is no active conversation
- support provider-driven model selection and worktree selection in a scalable way

## Product Decision Summary

The approved design decisions are:

- empty-state center lane uses an `extreme minimal` chat-first treatment
- `New Conversation` opens as a centered modal with a dimmed backdrop
- right inspector remains visible in empty state, but as a minimal placeholder
- modal fields are:
  - `Provider`
  - `Model`
  - `Worktree`
- `Execution Target` is renamed to `Worktree`
- `Template` is removed from V1
- `Model` remains disabled until a `Provider` is selected
- `Model` options are derived from the selected provider when available

## UX Intent

The workspace should feel like a ready-to-work tool:

- the center lane is the primary stage
- the user should immediately understand where to type and how to start
- supporting controls should recede into the background
- `New Conversation` should feel like a focused creation action, not a page section

The visual reference target is closer to modern chat-first coding tools where:

- the center area is mostly open space plus a strong input surface
- there is little or no explanatory onboarding chrome
- the modal creation flow is short and high confidence

## Information Architecture

The top-level product model remains:

- `Project -> Conversation`

The following constraints still apply:

- `Worktree` is a bound execution property, not a top-level navigation entity
- the right rail remains the home for inspection and supporting tools
- the main lane remains conversation-centric rather than dashboard-centric

## Main Layout Refresh

### Left Sidebar

The left sidebar keeps:

- project list
- current project selection
- conversation rows within the selected project
- `New Conversation` triggers

No major structural change is needed here beyond making sure all `New Conversation` entry points consistently open the centered modal.

### Center Lane

When there is no active conversation, the center lane should only contain:

- current project title
- one light contextual line
- a primary input surface
- minimal supporting controls

The following existing empty-state content should be removed from the center lane:

- large explanatory proof cards
- product capability cards
- multi-block onboarding narratives
- repeated placeholder summaries that compete with the input surface

The center lane should read more like:

- a single focused workspace
- a quiet launch point for the next task

### Right Inspector

The right inspector remains visible in empty state, but should be simplified to:

- a minimal tab shell
- one-line placeholder copy per area
- no stacked placeholder cards that visually dominate

Recommended tab shape:

- `Summary`
- `Terminal`
- `Files`

The intended feeling is:

- “the tools are here when needed”
- not “the user must inspect these now”

## New Conversation Modal

## Interaction Model

Clicking any `New Conversation` trigger should:

1. ensure the correct project is active
2. open a centered modal over a dimmed backdrop
3. trap user attention in the modal until they either cancel or start the conversation

The modal should:

- appear centered in the main workspace
- use a medium width, roughly 520px to 620px
- feel like a quick launcher, not a settings page
- support `Esc` to close
- support explicit close control

## Modal Structure

The modal uses a single-screen form, not a multi-step wizard by default.

Fields:

1. `Provider`
2. `Model`
3. `Worktree`

Footer actions:

- `Cancel`
- `Start Conversation`

A short summary line appears above the footer, for example:

`This conversation will start in teamCow / main using Claude Code + Sonnet 4.`

## Field Design

The fields should look like lightweight tool selectors, not heavy enterprise forms.

Desired qualities:

- comfortable height
- low visual noise
- crisp selected values
- subtle hover and focus states
- dropdown rows with primary and secondary information

## Provider Field

### Behavior

The provider dropdown shows all supported providers, not only currently available ones.

Each provider option includes a compact readiness state such as:

- `Ready`
- `Unavailable`
- `Auth required`
- `Network issue`
- `Loading`

Unavailable providers remain visible for discoverability but are not selectable.

### Default Selection

Provider defaults should be resolved in this order:

1. current project default provider, if configured
2. most recently successful provider used by the user
3. empty state requiring explicit user selection

## Model Field

### Behavior

The model field is provider-dependent.

Before provider selection:

- the field is disabled
- placeholder text says `Select a Provider first`

After selecting a ready provider:

- the field becomes enabled
- TeamCow requests the available model list for that provider

During model fetch:

- the field stays visible
- placeholder shows `Loading models...`

If the provider is unavailable:

- the field stays disabled
- placeholder indicates the provider is unavailable

### Data Source

The model list comes from the selected provider when that provider supports model enumeration.

Not every provider can be assumed to return a complete dynamic list. Therefore the system must support graceful fallback:

- if provider supports enumeration: show actual models
- if provider has a recommended default but no list API: show fallback default behavior
- if provider is unavailable: disable the field

Design rule:

`Model is provider-driven when available, with graceful fallback when model enumeration is unsupported.`

### Default Selection

Model defaults should be resolved in this order:

1. last used model for the selected provider, if still available
2. provider-recommended default model
3. explicit user selection required

## Worktree Field

### Naming

Use the label `Worktree`, not `Execution Target`.

### Behavior

The dropdown should group options into:

- `Current project directory`
- `Existing worktrees`
- `Create new worktree...`

Each row should prioritize human-readable labels:

- primary: branch name or friendly label
- secondary: concise path or source detail

Examples:

- `main`
  - `Current project directory`
- `feat/parallel-experiment`
  - `/Users/.../teamcow-feature`
- `Create new worktree...`
  - `Branch off from main`

### New Worktree Path

If the user selects `Create new worktree...`, the modal should reveal a lightweight inline `Branch name` input inside the same modal rather than launching a second screen.

This keeps the flow fast while still supporting isolation workflows.

## State Design

### Standard States

The creation flow should use a small, consistent state vocabulary:

- `Ready`
- `Unavailable`
- `Auth required`
- `Network issue`
- `Loading`

### Submission Rules

`Start Conversation` becomes enabled only when the minimum required inputs are valid:

- a selectable `Provider` is chosen
- a valid `Model` is chosen, or fallback default model behavior is explicitly supported for that provider
- a valid `Worktree` target is chosen
- if `Create new worktree...` is selected, branch name passes validation

### Loading State

On submit:

- the primary CTA changes to a loading state such as `Starting...`
- the modal remains visible until success or failure resolves

## Error Handling

Errors should appear in place, not by ejecting the user back to the main page.

### Field-Level Errors

Use lightweight inline guidance for:

- provider unavailable
- model fetch failure
- invalid branch name
- worktree conflict

### Modal-Level Errors

Use one short modal-level error area for submit failures such as:

- conversation creation failed
- provider startup failed
- worktree creation failed

### Recovery Principles

On failure:

- keep the modal open
- preserve the user’s selections
- show concise, actionable recovery guidance

Avoid:

- large red blocks
- multi-paragraph diagnostics
- clearing the form on failure

## Success Flow

On successful conversation creation:

1. close the modal
2. activate the new conversation in the sidebar and shell context
3. move focus to the main chat input
4. keep the transition visually calm and immediate

## Visual Language

The redesign should preserve TeamCow’s dark local-workbench tone while reducing dashboard clutter.

### Keep

- dark graphite base
- warm neutral text tones
- low-saturation accent colors
- professional desktop-tool feeling

### Reduce

- stacked explanatory panels
- repeated placeholder surfaces
- card-heavy onboarding structure
- layout noise in the center lane

### Emphasize

- whitespace
- focused typography
- input surface prominence
- modal clarity

## Component Implications

Likely renderer changes include:

- simplifying empty-state center lane content in `DesktopShell`
- converting inline launcher panel into a modal component
- adding dropdown/select primitives suitable for provider/model/worktree
- reducing inspector empty-state density

A likely component split is:

- `NewConversationModal`
- `ProviderSelect`
- `ModelSelect`
- `WorktreeSelect`

This split is recommended if it keeps `DesktopShell.tsx` from growing further.

## Data and Service Implications

The modal requires:

- provider readiness source
- provider model list source
- worktree list source
- conversation creation service

The data flow should be:

1. modal opens with active project context
2. provider list resolved from readiness service
3. selecting provider triggers model list fetch when supported
4. selecting worktree or new-worktree mode updates summary
5. submit sends normalized create-conversation payload

## Test Strategy

At minimum, the implementation should add or update tests for the following categories.

### Interaction Tests

- clicking `New Conversation` opens centered modal
- backdrop appears
- `Esc` closes modal
- close button closes modal
- modal receives initial focus on the first actionable control

### Field Dependency Tests

- `Model` is disabled before provider selection
- selecting a ready provider enables `Model`
- changing provider resets or refreshes model choice
- selecting `Create new worktree...` reveals branch input

### State and Error Tests

- unavailable providers cannot be submitted
- model loading and failure states render correctly
- creation failure keeps modal open and preserves selection
- successful creation closes modal and activates new conversation

### Visual Regression Priorities

- center lane no longer renders large empty-state explanation cards
- right inspector remains present but visually minimal in empty state
- modal visually dominates while the workspace recedes behind it

## Out of Scope

This redesign does not include:

- full run-stream rendering redesign
- new provider adapter implementation
- deep inspector feature redesign beyond empty-state simplification
- multi-step onboarding flows
- template/preset system for V1

## Risks

### UX Risk

If the modal becomes too form-like, the app will lose the fast chat-first feeling.

Mitigation:

- keep field count minimal
- keep copy short
- keep summary concise

### Integration Risk

Provider model listing may not be uniformly available.

Mitigation:

- implement provider-driven model selection with explicit fallback behavior

### Complexity Risk

If the center lane and modal both try to explain too much, visual clutter will return.

Mitigation:

- move explanation out
- preserve one main action surface
- reduce placeholder density aggressively

## Final Recommendation

Implement the approved direction as:

- a simplified chat-first empty state
- a centered modal for `New Conversation`
- a single-screen form using `Provider`, `Model`, and `Worktree`
- provider-driven model selection with graceful fallback
- a quiet but persistent inspector rail

This gives TeamCow a clearer product feel:

- more immediate
- more modern
- more tool-like
- more aligned with the reference apps the user provided
