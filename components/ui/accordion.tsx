"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

interface AccordionContextType {
  activeValue: string | null;
  toggleItem: (value: string) => void;
}

const AccordionContext = React.createContext<AccordionContextType>({
  activeValue: null,
  toggleItem: () => {},
});

export function Accordion({
  children,
  className = "",
  type = "single",
  collapsible = true,
}: {
  children: React.ReactNode;
  className?: string;
  type?: "single";
  collapsible?: boolean;
}) {
  const [activeValue, setActiveValue] = React.useState<string | null>(null);

  const toggleItem = React.useCallback((value: string) => {
    setActiveValue((prev) => (prev === value && collapsible ? null : value));
  }, [collapsible]);

  return (
    <AccordionContext.Provider value={{ activeValue, toggleItem }}>
      <div className={className}>{children}</div>
    </AccordionContext.Provider>
  );
}

export function AccordionItem({
  value,
  children,
  className = "",
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border-b ${className}`} data-value={value}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<{ value?: string }>, { value });
        }
        return child;
      })}
    </div>
  );
}

export function AccordionTrigger({
  children,
  className = "",
  value,
}: {
  children: React.ReactNode;
  className?: string;
  value?: string;
}) {
  const { activeValue, toggleItem } = React.useContext(AccordionContext);
  const isOpen = activeValue === value;

  return (
    <button
      type="button"
      onClick={() => value && toggleItem(value)}
      className={`flex w-full items-center justify-between font-semibold transition-all hover:text-[#E05D06] ${className}`}
    >
      {children}
      <ChevronDown
        className={`h-4 w-4 shrink-0 text-[#E05D06] transition-transform duration-200 ${
          isOpen ? "rotate-180" : ""
        }`}
      />
    </button>
  );
}

export function AccordionContent({
  children,
  className = "",
  value,
}: {
  children: React.ReactNode;
  className?: string;
  value?: string;
}) {
  const { activeValue } = React.useContext(AccordionContext);
  const isOpen = activeValue === value;

  if (!isOpen) return null;

  return (
    <div className={`overflow-hidden text-sm transition-all duration-300 animate-fade-in ${className}`}>
      {children}
    </div>
  );
}
