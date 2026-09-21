# World map outline

`world-land.json` contains equirectangular SVG paths derived from Natural Earth's
1:110m land polygons. Coordinates use a 1000 × 500 world and two decimal places:
`x = (longitude + 180) / 360 * 1000`, `y = (90 - latitude) / 180 * 500`.
Polygon rings are preserved, including holes, with the SVG even-odd fill rule.

Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson
(retrieved 2026-09-20). Natural Earth data is public domain:
https://www.naturalearthdata.com/about/terms-of-use/.
The outline is bundled locally; no tile service, API key, or external map requests
are needed.

Region labels in `lib/aws-region-map.ts` follow the AWS Region catalog:
https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html.
Coordinates represent approximate regional geography, not data-center addresses.
Only Regions returned by the authenticated live API appear on the placement map; its
`enabled` flag controls selection. New Regions without display coordinates remain
available through the dropdown. Add their approximate location metadata here as
AWS expands the catalog; this never enables a Region in the AWS account.

The test topology map uses recorded machine placements with the same display
coordinates. It groups co-located machines, wraps paths across the dateline, and
draws local hops as loops. Curves represent logical data flow through the
bottleneck, not observed geographic routes. Unknown coordinates omit only the
affected hops; the machine remains inspectable and no bypass path is inferred.
