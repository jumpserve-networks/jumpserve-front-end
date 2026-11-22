import type { ReactNode } from "react";
import type { DependencyDetail, PaperDetailNode } from "@/lib/paper-detail-dependencies";
import { cn } from "@/lib/utils";

export function PaperDetailOutline<T extends DependencyDetail>({ nodes, renderDetail, depth = 0 }: {
  nodes: PaperDetailNode<T>[];
  renderDetail: (item: T) => ReactNode;
  depth?: number;
}) {
  return <ol role="list" className={cn("space-y-3 text-sm", depth > 0 && "mt-3", depth > 0 && depth <= 3 && "pl-4 sm:pl-6")}>
    {nodes.map(({ item, number, children }) => <li key={item.id}>
      <div className="flex items-start gap-3">
        <span className="max-w-[33%] shrink-0 break-all tabular-nums text-muted-foreground">{number}</span>
        <div className="min-w-0 flex-1 space-y-1 [overflow-wrap:anywhere]">{renderDetail(item)}</div>
      </div>
      {children.length ? <PaperDetailOutline nodes={children} renderDetail={renderDetail} depth={depth + 1} /> : null}
    </li>)}
  </ol>;
}
