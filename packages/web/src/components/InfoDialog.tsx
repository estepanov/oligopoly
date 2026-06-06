import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type InfoDialogProps = {
  title: string;
  triggerLabel: string;
  triggerClassName?: string;
  triggerContent?: ReactNode;
  children: ReactNode;
};

export function InfoDialog({
  title,
  triggerLabel,
  triggerClassName = "infoButton",
  triggerContent = "i",
  children,
}: InfoDialogProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const backdrop = backdropRef.current;
    const hiddenSiblings = Array.from(document.body.children)
      .filter((element) => element !== backdrop)
      .map((element) => {
        const htmlElement = element as HTMLElement & { inert: boolean };
        const previousAriaHidden = element.getAttribute("aria-hidden");
        const previousInert = htmlElement.inert;
        element.setAttribute("aria-hidden", "true");
        htmlElement.inert = true;
        return { element, previousAriaHidden, previousInert };
      });
    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "textarea:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    const focusCloseButton = () => closeRef.current?.focus();
    focusCloseButton();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex >= 0,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      for (const {
        element,
        previousAriaHidden,
        previousInert,
      } of hiddenSiblings) {
        const htmlElement = element as HTMLElement & { inert: boolean };
        if (previousAriaHidden === null) {
          element.removeAttribute("aria-hidden");
        } else {
          element.setAttribute("aria-hidden", previousAriaHidden);
        }
        htmlElement.inert = previousInert;
      }
    };
  }, [open]);

  useEffect(() => {
    if (wasOpenRef.current && !open) {
      triggerRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        onClick={() => setOpen(true)}
      >
        {triggerContent}
      </button>
      {open &&
        createPortal(
          <div ref={backdropRef} className="modalBackdrop" role="presentation">
            <button
              type="button"
              className="modalBackdropDismiss"
              tabIndex={-1}
              aria-label={`Close ${title}`}
              onMouseDown={() => setOpen(false)}
            />
            <section
              ref={dialogRef}
              className="infoModal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
            >
              <div className="infoModalHeader">
                <h3 id={titleId}>{title}</h3>
                <button
                  ref={closeRef}
                  type="button"
                  className="button buttonSecondary"
                  aria-label={`Close ${title}`}
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="infoModalBody">{children}</div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
