import { forwardRef, type SelectHTMLAttributes } from "react";
import clsx from "clsx";
import "../styles.css";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error = false, children, ...rest }, ref) => (
    <select
      ref={ref}
      className={clsx("nova-select", error && "nova-select--error", className)}
      aria-invalid={error}
      {...rest}
    >
      {children}
    </select>
  )
);

Select.displayName = "Select";

