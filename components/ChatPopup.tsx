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
    <Popover open={open} onOpenChange={(o) => setOpen(o)}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="lg"
            className="fixed bottom-6 right-6"
          />
        }
      >
        {open ? (
          <XClose />
        ) : (
          <>
            <MessageChatCircle /> Chat
          </>
        )}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={-48}
        align="end"
        alignOffset={-8}
        className="w-[400px] h-[calc(100vh-64px)] p-6 flex flex-col gap-0 rounded-xl"
      >
        {children(onClose)}
      </PopoverContent>
    </Popover>
  );
}
