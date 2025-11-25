'use client';

import {
  forwardRef,
  useId,
  useState,
  type ChangeEvent,
  type HTMLAttributes
} from "react";
import clsx from "clsx";
import "../styles.css";

export type RadioGroupDirection = "vertical" | "horizontal";

export interface RadioGroupOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  name?: string;
  options: RadioGroupOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  direction?: RadioGroupDirection;
  error?: string;
}

export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(
  (
    {
      name,
      options,
      value,
      defaultValue,
      onChange,
      direction = "vertical",
      error,
      className,
      ...rest
    },
    ref
  ) => {
    const generatedName = useId();
    const groupName = name ?? `nova-radio-${generatedName}`;
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = useState<string | undefined>(
      defaultValue ?? value ?? options[0]?.value
    );
    const currentValue = isControlled ? value : internalValue;

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
      if (!isControlled) {
        setInternalValue(event.target.value);
      }
      onChange?.(event.target.value);
    };

    return (
      <div
        ref={ref}
        role="radiogroup"
        aria-invalid={Boolean(error)}
        className={clsx("nova-radio-group", `nova-radio-group--${direction}`, className)}
        {...rest}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={clsx(
              "nova-radio-group__option",
              option.disabled && "nova-radio-group__option--disabled"
            )}
          >
            <input
              type="radio"
              className="nova-radio-group__input"
              name={groupName}
              value={option.value}
              checked={currentValue === option.value}
              onChange={handleChange}
              disabled={option.disabled}
            />
            <span className="nova-radio-group__control" aria-hidden="true" />
            <span className="nova-radio-group__label">
              {option.label}
              {option.description ? (
                <span className="nova-radio-group__description">{option.description}</span>
              ) : null}
            </span>
          </label>
        ))}
        {error ? (
          <p role="alert" className="nova-radio-group__error">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
);

RadioGroup.displayName = "RadioGroup";
