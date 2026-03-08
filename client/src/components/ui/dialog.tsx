import { HTMLAttributes, ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

type DialogProps = { open?: boolean; onOpenChange?: (open: boolean) => void; children: ReactNode };
type DialogContentProps = HTMLAttributes<HTMLDivElement> & { children: ReactNode };
type DialogHeaderProps = HTMLAttributes<HTMLDivElement>;
type DialogTitleProps = HTMLAttributes<HTMLHeadingElement>;

const Dialog = ({ open, onOpenChange, children }: DialogProps) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && onOpenChange) onOpenChange(false); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange?.(false)} />
      {children}
    </div>,
    document.body
  );
};

const DialogContent = ({ className = "", children, ...props }: DialogContentProps) => (
  <div className={`relative z-50 bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4 ${className}`} {...props}>
    {children}
  </div>
);

const DialogHeader = ({ className = "", ...props }: DialogHeaderProps) => (
  <div className={`flex flex-col space-y-1.5 mb-4 ${className}`} {...props} />
);

const DialogTitle = ({ className = "", ...props }: DialogTitleProps) => (
  <h2 className={`text-lg font-semibold leading-none tracking-tight ${className}`} {...props} />
);

export { Dialog, DialogContent, DialogHeader, DialogTitle };

