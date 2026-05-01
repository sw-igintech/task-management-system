import { cn } from '../../lib/utils';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'default' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  default: 'bg-blue-600 text-white hover:bg-blue-700 border border-blue-600',
  outline: 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 border border-transparent',
  danger: 'bg-red-600 text-white hover:bg-red-700 border border-red-600',
  success: 'bg-green-600 text-white hover:bg-green-700 border border-green-600',
};

const sizeClasses: Record<Size, string> = {
  sm: 'text-xs px-2.5 py-1.5',
  md: 'text-sm px-4 py-2',
  lg: 'text-base px-6 py-3',
  icon: 'p-1.5',
};

export function Button({
  variant = 'default',
  size = 'md',
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
        variantClasses[variant],
        sizeClasses[size],
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
