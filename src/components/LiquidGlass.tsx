import { cn } from "@/lib/utils";

interface LiquidGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Glass panel wrapper. All styling lives in globals.css .liquid-glass so server
 * components can use `<div className="liquid-glass">` directly when they don't
 * need this wrapper's className merging.
 */
export default function LiquidGlass({
  children,
  className,
  ...rest
}: LiquidGlassProps) {
  return (
    <div className={cn("liquid-glass", className)} {...rest}>
      {children}
    </div>
  );
}
