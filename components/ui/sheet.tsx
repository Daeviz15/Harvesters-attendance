"use client";

import * as React from "react";
import { X } from "lucide-react";

interface SheetContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SheetContext = React.createContext<SheetContextType>({
  open: false,
  setOpen: () => {},
});

export function Sheet({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <SheetContext.Provider value={{ open, setOpen }}>
      {children}
    </SheetContext.Provider>
  );
}

export function SheetTrigger({
  children,
  asChild,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const { setOpen } = React.useContext(SheetContext);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => setOpen(true),
    });
  }

  return (
    <button type="button" onClick={() => setOpen(true)}>
      {children}
    </button>
  );
}

export function SheetContent({
  children,
  side = "right",
  className = "",
}: {
  children: React.ReactNode;
  side?: "right" | "left";
  className?: string;
}) {
  const { open, setOpen } = React.useContext(SheetContext);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={() => setOpen(false)}
      />

      {/* Sheet Content */}
      <div
        className={`relative z-50 ml-auto h-full w-72 max-w-full bg-[#0d0d12] text-white border-l border-white/10 p-6 shadow-2xl transition-transform duration-300 ${
          side === "right" ? "right-0" : "left-0"
        } ${className}`}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
        >
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </button>
        {children}
      </div>
    </div>
  );
}

export function SheetClose({
  children,
  asChild,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const { setOpen } = React.useContext(SheetContext);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => setOpen(false),
    });
  }

  return (
    <button type="button" onClick={() => setOpen(false)}>
      {children}
    </button>
  );
}
