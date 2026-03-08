import { HTMLAttributes } from "react";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "outline" | "destructive";
};

const Badge = ({ className = "", variant = "default", ...props }: BadgeProps) => {
  const variants: Record<string, string> = {
    default: "bg-blue-100 text-blue-800",
    secondary: "bg-gray-100 text-gray-800",
    outline: "border border-gray-300 text-gray-700",
    destructive: "bg-red-100 text-red-800",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`} {...props} />;
};

export { Badge };

