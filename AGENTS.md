# Engineering Guide

## Current project state

This repository is an initial scaffold. At present it contains only a short
README and no application source, dependency manifest, build tooling, tests, or
CI configuration. Do not assume a language, framework, deployment target, or
external service until one is deliberately introduced and documented.

## Working rules

- Keep changes narrowly scoped to the requested task; do not add product
  features, dependencies, generated files, or configuration speculatively.
- Before editing, inspect the relevant source, tests, configuration, and recent
  Git changes. Preserve existing user changes that are unrelated to the task.
- Prefer small, reviewable commits and clear names over broad refactors.
- Never commit credentials, API keys, tokens, private user data, or local
  environment files. Provide an `.example` file for required configuration.
- Update the README when a change affects setup, commands, architecture, or
  user-facing behavior.
- Add or update automated tests with behavior changes. Run the smallest
  relevant checks first, then the project-wide checks when they exist.
- Treat formatter, linter, type-checker, test, and build failures as issues to
  resolve rather than suppress. Avoid weakening checks without an explicit
  reason documented in the change.

## Architecture guidelines

- Establish the intended architecture before creating substantial application
  code, and document the selected language, framework, directory layout, and
  development commands in the README.
- Organize code by responsibility or feature with explicit boundaries. Keep UI,
  domain logic, infrastructure/integration code, and configuration separate.
- Keep domain logic independent of transport and storage details; place API,
  database, filesystem, and third-party SDK access behind small interfaces.
- Validate untrusted input at system boundaries and return errors that are safe
  for users while retaining actionable diagnostic context in controlled logs.
- Make dependency direction one-way: presentation/transport may call
  application and domain code; domain code must not depend on presentation or
  infrastructure implementations.
- Prefer explicit data contracts, typed interfaces where supported, and
  dependency injection at composition boundaries over hidden globals.
- Design external operations to handle timeouts, retries only when safe, and
  idempotency where requests or jobs may be repeated.

## Quality and security baseline

- Use a consistent formatter and linting configuration once a language is
  chosen; do not mix competing style systems without a documented reason.
- Keep tests deterministic and isolated. Cover normal behavior, validation
  failures, and important edge cases.
- Pin or lock dependencies using the ecosystem's standard lockfile, and review
  additions for maintenance and security impact.
- Apply least privilege to services, credentials, and data access. Log events
  without exposing secrets or sensitive payloads.
- Make accessibility, responsive behavior, and usable error/loading states
  first-class requirements for any future user interface.
