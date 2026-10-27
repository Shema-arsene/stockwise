import { Store } from "lucide-react";

export function Splash() {
  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <span className="flex size-12 animate-pulse items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Store className="size-6" />
        </span>
        <span className="text-sm">StockWise</span>
      </div>
    </div>
  );
}
