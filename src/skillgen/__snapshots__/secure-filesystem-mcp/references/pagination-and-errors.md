# Pagination and errors

How lists continue and calls fail. Back to [SKILL.md](../SKILL.md).

## Pagination

No operation declares pagination.

## Errors

The kit throws `ArgsError` before anything is sent: unknown operation, unknown or missing argument, wrong type, value outside the enum; the message names the operation and the argument. Report it, fix the arguments from an earlier output or the user, and never retry a 4xx with guessed arguments.

## Known gaps in the source spec

None reported.
