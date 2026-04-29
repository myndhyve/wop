---
name: Conformance report
about: Report your implementation's conformance suite result (pass or fail)
title: "[conformance] <implementation name> against suite <version>"
labels: conformance
---

## Implementation

- Name: ...
- Version: ...
- Repository: ...
- Public endpoint (optional): ...

## Suite version

- `@wop/conformance` version: `1.X.Y`
- Spec major: `v1.0`
- Run command: `npx @wop/conformance --base-url ... --api-key ...`

## Result

- [ ] All required scenarios passed
- [ ] Some optional profiles passed (list below)
- [ ] Failures (list below)

### Optional profiles passed

- [ ] BYOK / secret resolution
- [ ] Replay / fork
- [ ] Channel TTL
- [ ] Cost attribution
- [ ] Other: ...

### Failures

<!--
For each failed scenario, paste the suite output and a one-line analysis.
Distinguish:
  - Spec ambiguity (file as a separate spec-question)
  - Implementation bug (track in your own repo)
  - Suite bug (file as a separate bug)
-->

## Capability advertisement

<!-- Paste the relevant slice of /.well-known/wop your endpoint returned. -->

```json
{ }
```

## Anything else

<!-- Notes for prospective adopters considering this implementation. -->
