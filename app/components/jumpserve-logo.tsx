"use client";

import { useId } from "react";

export function JumpServeLogo() {
  const id = useId();

  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 256 256" className="size-8 shrink-0 fill-current">
      <defs>
        {/* Extract the white volleyball artwork from the existing teal favicon.
            The red-channel threshold removes the background and preserves soft edges. */}
        <filter id={`${id}-artwork`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.333333 0 0 0 -0.333333" />
        </filter>
        <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256" style={{ maskType: "alpha" }}>
          <image href="/icon.png" width="256" height="256" filter={`url(#${id}-artwork)`} />
        </mask>
      </defs>
      <rect width="256" height="256" mask={`url(#${id}-mask)`} />
    </svg>
  );
}
