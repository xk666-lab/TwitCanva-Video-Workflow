# Take Store MVP

## Question

How should the MVP preserve multiple generated image/video versions, select a Hero Take, and pass that Hero Take downstream while remaining compatible with existing `resultUrl` workflows?

## Type

wayfinder:prototype

## Initial Direction

Design a compatibility layer where old nodes still read `resultUrl`, while new nodes can read `takes[]` and `heroTakeId`.
