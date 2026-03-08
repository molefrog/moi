import React from "react";
import { LayoutAlt01 } from "@untitledui/icons";

export function Workspace() {
  return (
    <div className="flex-1 flex items-center justify-center h-full bg-surface">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-accent-soft border border-border flex items-center justify-center mx-auto mb-3">
          <LayoutAlt01 size={20} className="text-ink-faint" />
        </div>
        <p className="text-sm text-ink-muted">Workspace</p>
        <p className="text-xs text-ink-faint mt-1">
          Widgets will appear here
        </p>
      </div>
    </div>
  );
}
