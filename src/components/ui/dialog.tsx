import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * O clique na barra de rolagem do fundo escuro não fecha a janela. A barra é a
 * faixa da direita além do `clientWidth` — ou, onde ela flutua sem ocupar
 * espaço, os últimos 16 px — e só existe quando o fundo tem o que rolar.
 */
function naoFecharPelaBarra(e: { preventDefault(): void; detail: { originalEvent: PointerEvent } }) {
  const ev = e.detail.originalEvent
  const alvo = ev.target
  if (!(alvo instanceof HTMLElement) || !alvo.hasAttribute("data-fundo-da-janela")) return
  if (alvo.scrollHeight <= alvo.clientHeight) return
  const r = alvo.getBoundingClientRect()
  if (ev.clientX >= r.right - Math.max(r.width - alvo.clientWidth, 16)) e.preventDefault()
}

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 flex overflow-y-auto bg-black/80 p-4 sm:p-6  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/*
 * A janela mora DENTRO do fundo escuro, e quem rola é o fundo (19/10/2026).
 *
 * Antes ela era `fixed` no meio da tela, sem altura máxima: com zoom de 125%
 * ou 150% (o padrão de muito notebook da operação) a janela mais alta que a
 * tela ficava cortada em cima e embaixo, e o Salvar sumia sem ter como rolar.
 * Agora: cabe, fica no meio (`m-auto`); não cabe, começa no topo e o fundo
 * rola — nada fica fora de alcance, e menu aberto dentro dela não é cortado.
 * É o «scrollable overlay» do próprio Radix.
 *
 * Clique na barra de rolagem do fundo não é «clique fora»: não fecha.
 */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, 'aria-describedby': ariaDescribedBy, onPointerDownOutside, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay data-fundo-da-janela="">
    <DialogPrimitive.Content
      ref={ref}
      aria-describedby={ariaDescribedBy}
      onPointerDownOutside={e => { onPointerDownOutside?.(e); naoFecharPelaBarra(e); }}
      className={cn(
        "relative z-50 m-auto grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
    </DialogOverlay>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
