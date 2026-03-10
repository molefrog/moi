import React from "react";

export function Workspace() {
  return (
    <div className="grid grid-cols-2 gap-6 grid-rows-[136px_136px_auto]">
      <div className="col-span-2 rounded-2xl bg-black/[0.04]" />
      <div className="rounded-2xl bg-black/[0.04]" />
      <div className="rounded-2xl bg-black/[0.04]" />
      <div className="col-span-2 rounded-2xl bg-black/[0.04]" />
    </div>
  );
}
