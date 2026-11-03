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
2. Tag the commit, e.g. `git tag v1.0 && git push origin v1.0` (a tag or commit ID is an immutable
   config; a branch is mutable and is picked up at the next API start).
3. Create a token (fine-grained PAT with _Contents: Read_ on that repository). To let admins open pull requests from improvement proposals, give it _Contents: Read and write_ and _Pull requests: Read and write_ instead; the API never merges or writes the default branch.
4. Configure the API (`.env`):

```
CONFIG_SOURCE=https://github.com/llucn/config.git//langchain-example
CONFIG_REF=v1.0
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

Long-term memory: `settings.memory` in `config.yml` turns it on or off and sets how many memories go into each prompt; the agents `fault_report`, `work_order_inquiry` and `other` list the local tools `saveMemory` and `forgetMemory` and carry the prompt guidance on when to use them.
