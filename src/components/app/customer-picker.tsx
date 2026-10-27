"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronsUpDown, Plus, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CustomerWithBalance } from "@/lib/local/hooks";
import { cn } from "@/lib/utils";
import { CustomerDialog } from "./customer-dialog";
import { Money } from "./page-parts";

/** Choose an existing customer (with their current debt) or create one on the spot. */
export function CustomerPicker({
  customers,
  value,
  onChange,
  invalid,
}: {
  customers: CustomerWithBalance[];
  value: string | null;
  onChange: (id: string | null) => void;
  invalid?: boolean;
}) {
  const t = useTranslations("sales");
  const tc = useTranslations("common");
  const tcu = useTranslations("customers");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const selected = customers.find((c) => c.id === value);

  return (
    <>
      <div className="flex gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-invalid={invalid}
              className={cn("h-10 flex-1 justify-between font-normal", !selected && "text-muted-foreground")}
            >
              <span className="flex min-w-0 items-center gap-2">
                <UserRound className="size-4 shrink-0" />
                <span className="truncate">{selected ? selected.name : t("selectCustomer")}</span>
              </span>
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder={tcu("searchPlaceholder")} value={search} onValueChange={setSearch} />
              <CommandList>
                <CommandEmpty>{tc("noResults")}</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value={`__new__ ${search}`}
                    onSelect={() => {
                      setOpen(false);
                      setCreateOpen(true);
                    }}
                    className="text-primary"
                  >
                    <Plus />
                    {t("newCustomer")}
                    {search && <span className="truncate">“{search}”</span>}
                  </CommandItem>
                  {customers.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.name} ${c.phone ?? ""} ${c.id}`}
                      onSelect={() => {
                        onChange(c.id);
                        setOpen(false);
                      }}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{c.name}</span>
                        {c.phone && <span className="block text-xs text-muted-foreground">{c.phone}</span>}
                      </span>
                      {c.owed > 0 && <Money value={c.owed} className="text-xs text-amber-700 dark:text-amber-400" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selected && (
          <Button type="button" variant="ghost" size="icon" className="size-10" onClick={() => onChange(null)} aria-label={tc("close")}>
            <X />
          </Button>
        )}
      </div>
      <CustomerDialog open={createOpen} onOpenChange={setCreateOpen} initialName={search} onSaved={(c) => onChange(c.id)} />
    </>
  );
}
