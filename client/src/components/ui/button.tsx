import { ButtonHTMLAttributes, forwardRef } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg";
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", ...props }, ref) => {
    const base = "inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";
    const variants: Record<string, string> = {
      default: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
      outline: "border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-blue-500",
      ghost: "text-gray-700 hover:bg-gray-100 focus:ring-gray-500",
      destructive: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
    };
    const sizes: Record<string, string> = {
      default: "h-10 px-4 py-2 text-sm",
      sm: "h-8 px-3 text-xs",
      lg: "h-12 px-6 text-base",
    };
    return <button ref={ref} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
  }
);
Button.displayName = "Button";
export { Button };

