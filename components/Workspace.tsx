import React from "react";

export function Workspace() {
  return (
    <div className="grid grid-cols-2 gap-6 grid-rows-[136px_136px_auto]">
      <div className="col-span-2 rounded-xl bg-black/4" />
      <div className="rounded-xl bg-black/4" />
      <div className="rounded-xl bg-black/4" />
      <div className="col-span-2 rounded-xl bg-black/4" />
    </div>
  );
}
