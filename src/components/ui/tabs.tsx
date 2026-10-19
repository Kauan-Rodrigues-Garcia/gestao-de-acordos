import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"
import { observarPontas } from "@/lib/rolagemLateral"

const Tabs = TabsPrimitive.Root

/*
 * Abas demais para a largura (zoom de 125%/150%, 19/10/2026): antes a fileira
 * empurrava a página inteira para o lado. Agora rola por dentro — roda e
 * arrasto do mouse (`lib/rolagemLateral.ts`), sem barra (numa fileira de 40 px
 * ela cortaria as abas) e com a ponta apagada onde há mais. `justify-center-safe`:
 * centrada quando cabe, presa à esquerda quando não — centrar o que transborda
 * esconderia as primeiras abas fora do alcance.
 */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const proprio = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => (proprio.current ? observarPontas(proprio.current) : undefined), [])
  return (
    <TabsPrimitive.List
      ref={el => {
        proprio.current = el
        if (typeof ref === "function") ref(el)
        else if (ref) ref.current = el
      }}
      className={cn(
        "fileira-rola inline-flex h-10 max-w-full items-center justify-center-safe overflow-x-auto overflow-y-hidden rounded-md bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
})
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
