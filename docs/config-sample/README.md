# Agent Config sample

This directory is the initial content for the **config repository** read by the API
(`CONFIG_SOURCE`). It mirrors the repository root; the API reads the `langchain-example/` folder.

```
config-sample/
  langchain-example/
    config.yml            variables (env), MCP servers, settings, optional model connection
    agents/
      selector.yml        one file per agent; the file name is the agent name
      fault_report.yml
      work_order_inquiry.yml
      other.yml
```

`selector` and `other` are required. Every other file in `agents/` becomes an agent the selector can
route to (mention it in the selector prompt so it knows when to use it).

## Initialise the config repository

1. Copy `langchain-example/` into the root of your (private) GitHub config repository and commit.
2. Tag the commit, e.g. `git tag v1 && git push origin v1` (a tag or commit ID is an immutable
   config; a branch is mutable and is picked up at the next API start).
3. Create a read-only token (fine-grained PAT with _Contents: Read_ on that repository).
4. Configure the API (`.env`):

```
CONFIG_SOURCE=https://github.com/llucn/config.git//langchain-example
CONFIG_REF=v1
CONFIG_GITHUB_TOKEN=github_pat_...
```

For local development point `CONFIG_SOURCE` at a directory instead (no network, no token, no
`CONFIG_REF` needed), e.g. `CONFIG_SOURCE=docs/config-sample/langchain-example`.

## Placeholders

Agent files may use Spring-style placeholders in string values:

| Syntax                | Meaning                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `${env.NAME}`         | value of `env.NAME` in `config.yml`; typed if it is the whole value |
| `${env.NAME:default}` | same, with a default when `NAME` is not defined                     |
| `$${env.NAME}`        | the literal text `${env.NAME}`                                      |

Undefined variables without a default fail the start. Only `config.yml`'s `env` block is a source
(not the process environment), so a commit always renders the same way. Inside YAML flow
collections (`[...]`, `{...}`) quote the placeholder: `["${env.X}"]`.

## Notes

- The repository is private, so `config.yml` may hold secrets (e.g. the `model` block).
- The API caches the parsed config per commit in `agent_config_snapshots`; changing the commit or
  `CONFIG_REF` invalidates it at the next start.
- Duplicate YAML keys are an error.
