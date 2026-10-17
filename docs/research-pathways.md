# Research pathways

The home page opens two separate modules, registered in `lib/test-modules.ts`:

| Pathway | Module | Routes |
| --- | --- | --- |
| Verify Existing Claims | `research-verification` | Paper intake, paper studies, published paper assessments, verification methods |
| Develop a New Idea | `research-ideas` | Idea intake, conversational planning, saved ideas, experiment evidence, published idea experiments, idea development methods |

Each module owns its sidebar, mobile menu and page navigation. Idea components
live in `app/components/research-ideas`; shared evidence, queue, protocol and
publication components stay in `app/components/research-workflow`.

The shell marks each research route with `data-module-theme`. Shared CSS tokens
give verification dark blue in light mode and neon blue in dark mode; ideas use
dark red and neon pink. The marker is derived from module ownership, including
detail pages. Tokens apply at the document root so Base UI portals, the header,
mobile navigation, controls and page content share the same theme. Leaving the
pathway restores the default palette. Status colors and distinct chart series
retain their meaning.

Both modules use the existing authenticated `/research` API and Supabase records.
No studies are copied, relabeled or recreated. Lists filter by `study_kind`;
older records without this field retain their original paper interpretation.
Backend ownership and publication checks remain authoritative. Module selection
does not grant access or bypass experimental readiness requirements.

Canonical URLs start with the module identifier: `/research-verification` or
`/research-ideas`. Pages live under the URL-transparent `app/(modules)` route
group. The same convention applies to networking and completed-study modules.

Old `/module/<moduleId>` and `/modules/<moduleId>` links permanently redirect
to `/<moduleId>`, preserving suffixes and queries. Old
`/research-verification/new-idea` and `/research-verification/ideas/<id>` links
redirect to the idea module, including their former `/module` and `/modules` aliases.
Old evidence workspace and public study URLs resolve the recorded study kind
before moving to the matching module; Google sign-in still precedes owner reads.
Public exports also redirect to the matching namespace, preserving format queries.

Static study downloads moved from `public/module/<moduleId>` to
`public/<moduleId>` with their original bytes preserved. Previously recorded
reports and model answers retain their historical URLs; those URLs redirect.

Public catalogues currently read the existing bounded list before filtering by
pathway. When the API reports more studies, both the result count limit and its
effect on an empty filtered list remain explicit.

Local verification uses `npm test`, `npm run lint`, `npm run build`,
`node scripts/verify-homepage-release.mjs` and
`node scripts/verify-research-pathways.mjs`. Browser checks cover separate menus,
active sections, public catalogues, desktop/mobile themes, legacy redirects,
exports and unauthenticated sign-in return paths. They do not establish a real
Google session, a new experiment run or an authenticated model call.
