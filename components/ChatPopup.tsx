import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageChatCircle, XClose } from "@untitledui/icons";
import { Button } from "./ui/button";

type ChatPopupProps = {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

export function ChatPopup({ open, onToggle, children }: ChatPopupProps) {
  return (
    <>
      {/* Popup overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            className="fixed bottom-24 right-6 w-[400px] h-[600px] max-h-[80vh] rounded-2xl shadow-2xl border border-border bg-card overflow-hidden flex flex-col z-50"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating button */}
      <Button
        asChild
        size="icon-lg"
        className="fixed bottom-6 right-6 z-50"
        onClick={onToggle}
      >
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.span
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-center"
              >
                <XClose />
              </motion.span>
            ) : (
              <motion.span
                key="open"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-center"
              >
                <MessageChatCircle />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </Button>
    </>
  );
}
