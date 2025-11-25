import { forwardRef, type InputHTMLAttributes } from "react";
import clsx from "clsx";
import "../styles.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error = false, ...rest }, ref) => (
    <input
      ref={ref}
      className={clsx("nova-input", error && "nova-input--error", className)}
      aria-invalid={error}
      {...rest}
    />
  )
);

Input.displayName = "Input";
