// src/components/ui/input.tsx
'use client';

import { cn } from '@/lib/utils';
import * as React from 'react';

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, Props>(
  (
    { className, type, value, defaultValue, onChange, readOnly, ...rest },
    ref
  ) => {
    const inputType = type ?? 'text';

    const hasValue = value !== undefined;
    const hasDefaultValue = defaultValue !== undefined;
    const isControlled =
      hasValue && (typeof onChange === 'function' || readOnly);

    const inputProps: React.InputHTMLAttributes<HTMLInputElement> = {
      type: inputType,
      className: cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className
      ),
      ...rest,
    };

    if (isControlled) {
      inputProps.value = hasValue ? (value as any) ?? '' : '';
      if (readOnly) inputProps.readOnly = true;
      if (onChange) inputProps.onChange = onChange;
    } else {
      if (hasValue && !onChange) {
        inputProps.defaultValue = value as any;
      } else if (hasDefaultValue) {
        inputProps.defaultValue = defaultValue as any;
      }
      delete (inputProps as any).value;
      delete (inputProps as any).readOnly;
      delete (inputProps as any).onChange;
    }

    delete (inputProps as any).defaultValue &&
      isControlled &&
      delete (inputProps as any).defaultValue;

    return <input ref={ref} {...inputProps} />;
  }
);

Input.displayName = 'Input';

export default Input;
