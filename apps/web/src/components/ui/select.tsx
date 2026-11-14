"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface ThemedSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  /** Accessible name. Always pass one: the trigger has no visible label. */
  ariaLabel: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * The app's Select.
 *
 * UI-01 was the native `<select>`: on Windows/Linux its popup is drawn by the
 * OS, ignores the theme, and in dark mode appears as black text on a black
 * background (or a fully transparent control in some browsers). Radix's Select
 * is already a dependency (`radix-ui`), is keyboard-complete (arrows, Home/End,
 * type-ahead, Escape) and renders in a portal we style with the app's tokens.
 *
 * Height is 44 px to meet the touch-target rule on the pages that use it.
 */
export function Select({
  value,
  onValueChange,
  options,
  ariaLabel,
  id,
  placeholder = "Select…",
  disabled = false,
  className,
}: ThemedSelectProps) {
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm outline-none transition-colors",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        style={{
          borderColor: "var(--glass-border)",
          background: "var(--bg-elevated)",
          color: "var(--text-primary)",
        }}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            className="h-4 w-4 flex-shrink-0"
            style={{ color: "var(--text-muted)" }}
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-[80] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border shadow-2xl"
          style={{
            background: "var(--bg-elevated)",
            borderColor: "var(--glass-border)",
            color: "var(--text-primary)",
          }}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={cn(
                  "relative flex min-h-10 cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-3 text-sm outline-none",
                  "data-[highlighted]:bg-[var(--teal-dim)] data-[highlighted]:text-[var(--text-primary)]",
                  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                )}
                style={{ color: "var(--text-secondary)" }}
              >
                <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4" style={{ color: "var(--teal)" }} />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
