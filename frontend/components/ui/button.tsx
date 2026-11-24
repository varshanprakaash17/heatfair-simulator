import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 focus-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-teal-600 text-white shadow-[0_10px_24px_-14px_rgba(12,135,116,0.8)] hover:bg-teal-700 active:translate-y-px",
        navy:
          "bg-navy-900 text-white shadow-[0_10px_24px_-16px_rgba(8,27,46,0.9)] hover:bg-navy-800",
        secondary: "border border-line bg-white text-ink hover:border-navy-200 hover:bg-mist-100",
        outline:
          "border border-navy-200 bg-transparent text-navy-800 hover:bg-navy-50",
        ghost: "bg-transparent text-ink-soft hover:bg-mist-200 hover:text-ink",
        heat: "bg-heat-500 text-white shadow-[0_10px_24px_-14px_rgba(232,135,10,0.7)] hover:bg-heat-600",
        danger: "bg-rose-600 text-white hover:bg-rose-700",
        link: "h-auto p-0 text-teal-700 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-[12.5px]",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
