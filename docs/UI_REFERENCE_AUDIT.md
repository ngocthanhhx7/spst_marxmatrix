# UI reference audit

Runtime UI motion is [Motion](https://motion.dev/), pinned as `motion@12.42.2`. It supports component-oriented transform/opacity transitions while later UI work will provide reduced-motion equivalents.

| Reference                | Decision       | Rationale                                                                                               |
| ------------------------ | -------------- | ------------------------------------------------------------------------------------------------------- |
| Motion                   | Runtime choice | Matches the approved component-oriented animation approach.                                             |
| GSAP official repository | Not selected   | It would be Essential only if GSAP became the runtime choice. It is not selected for this MVP.          |
| TypeUI                   | Reject         | No runtime or copied asset/layout is authorized for this project.                                       |
| Taste                    | Optional       | It may inform future high-level visual review, but is not a dependency or implementation source.        |
| MotionSites              | Reference-only | It is not a dependency or implementation source. No inaccessible MotionSites details are asserted here. |

The project will use original Vietnamese techno-editorial UI. It will not copy prompts, assets, layouts, or code from any reference. The pre-existing untracked `gsap-skills/` directory remains user content outside product scope.
