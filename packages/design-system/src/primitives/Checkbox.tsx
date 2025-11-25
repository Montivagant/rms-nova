import { forwardRef, type InputHTMLAttributes } from "react";
import clsx from "clsx";
import "../styles.css";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, indeterminate = false, disabled, ...rest }, ref) => (
    <label className={clsx("nova-checkbox", disabled && "nova-checkbox--disabled")}>
      <input
        ref={(node) => {
          if (node) {
            node.indeterminate = indeterminate;
          }
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        type="checkbox"
        className={clsx("nova-checkbox__input", className)}
        disabled={disabled}
        {...rest}
      />
      <span className="nova-checkbox__box" aria-hidden="true" />
      {label ? <span className="nova-checkbox__label">{label}</span> : null}
    </label>
  )
);

Checkbox.displayName = "Checkbox";
