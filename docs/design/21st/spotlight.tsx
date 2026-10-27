// Source: 21st.dev, "Spotlight" by kevingirelli (https://21st.dev/@kevingirelli/components/spotlight).
"use client";

import { Slot, Slottable } from "@radix-ui/react-slot";
import {
  useEffect,
  useRef,
  type ComponentProps,
  type CSSProperties,
} from "react";

import { cn } from "@/lib/utils";

// Two masks, one clipped to the content box: "exclude" keeps only the
// padding, which is the 1px ring.
const RING_MASK =
  "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)";

const lightClassName = cn(
  "pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0",
  "transition-opacity duration-300 motion-reduce:transition-none",
  "group-focus-within/spotlight:opacity-100 group-hover/spotlight:opacity-100",
);

interface SpotlightProps extends ComponentProps<"div"> {
  /** Light the single child element, e.g. a Card, instead of wrapping it in a div. */
  asChild?: boolean;
  /** Radius of the light, in px. */
  size?: number;
  /** Colour of the light: any CSS colour, including theme variables. */
  color?: string;
  /** Also light the part of the edge nearest the pointer. */
  ring?: boolean;
}

/**
 * A soft light that follows the pointer across a surface, and along its edge.
 * It sits behind the content (the element becomes its own stacking context)
 * and only updates two CSS variables per frame, so nothing re-renders. Touch
 * screens skip it; keyboard focus inside lights it where the pointer last was.
 *
 * @example
 * <Spotlight asChild>
 *   <Card>…</Card>
 * </Spotlight>
 */
function Spotlight({
  asChild = false,
  size = 320,
  color = "var(--foreground)",
  ring = true,
  className,
  children,
  onPointerMove,
  ...props
}: SpotlightProps) {
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const Comp = asChild ? Slot : "div";
  const circle = `${size}px circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%)`;
  const ringStyle: CSSProperties = {
    background: `radial-gradient(${circle}, color-mix(in oklab, ${color} 45%, transparent), transparent 60%)`,
    mask: RING_MASK,
    maskComposite: "exclude",
    WebkitMask: RING_MASK,
    WebkitMaskComposite: "xor",
  };

  return (
    <Comp
      data-slot="spotlight"
      className={cn("group/spotlight relative isolate", className)}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        if (event.pointerType === "touch") return;
        const target = event.currentTarget;
        const { clientX, clientY } = event;
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          const bounds = target.getBoundingClientRect();
          target.style.setProperty(
            "--spotlight-x",
            `${clientX - bounds.left}px`,
          );
          target.style.setProperty(
            "--spotlight-y",
            `${clientY - bounds.top}px`,
          );
        });
      }}
      {...props}
    >
      <span
        aria-hidden="true"
        data-slot="spotlight-light"
        className={lightClassName}
        style={{
          background: `radial-gradient(${circle}, color-mix(in oklab, ${color} 10%, transparent), transparent 70%)`,
        }}
      />
      {ring ? (
        <span
          aria-hidden="true"
          data-slot="spotlight-ring"
          className={cn(lightClassName, "-inset-px p-px")}
          style={ringStyle}
        />
      ) : null}
      <Slottable>{children}</Slottable>
    </Comp>
  );
}

export { Spotlight, type SpotlightProps };

export default Spotlight;

// Demo usage:
// <Spotlight asChild className="w-80 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
//   <div><h3 className="text-lg font-semibold">Move your cursor here</h3>
//   <p className="mt-2 text-sm text-muted-foreground">The light follows it, and so does the edge.</p></div>
// </Spotlight>
