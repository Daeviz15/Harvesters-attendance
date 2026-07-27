import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "orange" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", children, ...props }, ref) => {
    let baseStyles = "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05D06] disabled:pointer-events-none disabled:opacity-50 cursor-pointer";
    
    let variantStyles = "";
    if (variant === "default") {
      variantStyles = "bg-gradient-to-r from-[#E05D06] to-[#F97316] text-white hover:from-[#c85002] hover:to-[#ea580c] shadow-[0_0_20px_rgba(224,93,6,0.3)] hover:shadow-[0_0_30px_rgba(224,93,6,0.5)]";
    } else if (variant === "orange") {
      variantStyles = "bg-gradient-to-r from-[#E05D06] to-[#B34700] text-white font-bold uppercase tracking-wider shadow-[0_4px_14px_rgba(224,93,6,0.4)] hover:shadow-[0_6px_20px_rgba(224,93,6,0.6)] hover:brightness-110";
    } else if (variant === "outline") {
      variantStyles = "border border-white/15 bg-white/5 text-white hover:bg-white/10 hover:border-white/30 backdrop-blur-md";
    } else if (variant === "ghost") {
      variantStyles = "hover:bg-white/10 text-neutral-300 hover:text-white";
    }

    let sizeStyles = "";
    if (size === "default") {
      sizeStyles = "h-10 px-4 py-2 text-sm";
    } else if (size === "sm") {
      sizeStyles = "h-9 px-3 text-xs";
    } else if (size === "lg") {
      sizeStyles = "h-11 px-6 text-base";
    } else if (size === "icon") {
      sizeStyles = "h-9 w-9 p-0";
    }

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles} ${sizeStyles} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
