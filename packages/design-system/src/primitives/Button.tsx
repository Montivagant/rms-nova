import {
  type ButtonHTMLAttributes,
  type ReactElement,
  forwardRef,
  isValidElement,
  Children,
  cloneElement
} from "react";
import clsx from "clsx";
import "../styles.css";

export type ButtonVariant = "primary" | "ghost" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

const sizeClassMap: Record<ButtonSize, string> = {
  sm: "nova-button--sm",
  md: "nova-button--md",
  lg: "nova-button--lg"
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, disabled, children, asChild, ...rest }, ref) => {
    const mergedClassName = clsx("nova-button", `nova-button--${variant}`, sizeClassMap[size], className);

    if (asChild) {
      const child = Children.only(children) as ReactElement<{
        className?: string;
        "aria-disabled"?: boolean;
      }> | null;
      if (child && isValidElement(child)) {
        return cloneElement(child, {
          className: clsx(mergedClassName, child.props.className),
          "aria-disabled": disabled ?? child.props["aria-disabled"]
        });
      }
    }

    return (
      <button ref={ref} className={mergedClassName} disabled={disabled} {...rest}>
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
