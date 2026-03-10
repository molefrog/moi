import React, { useState } from "react";
import { MessageChatCircle, XClose } from "@untitledui/icons";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type ChatPopupProps = {
  children: (onClose: () => void) => React.ReactNode;
};

export function ChatPopup({ children }: ChatPopupProps) {
  const [open, setOpen] = useState(false);
  const onClose = () => setOpen(false);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Popover open={open} onOpenChange={(o) => setOpen(o)}>
        <PopoverTrigger render={<Button size="lg" />}>
          {open ? <XClose /> : <><MessageChatCircle /> Chat</>}
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={-52}
          className="w-[400px] h-[calc(100vh-32px)] p-4 flex flex-col gap-0"
        >
          {children(onClose)}
        </PopoverContent>
      </Popover>
    </div>
  );
}
