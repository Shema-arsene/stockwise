import Image from "next/image";
import { cn } from "@/lib/utils";

type Shot = "dashboard" | "reports" | "sale" | "products" | "debts";

/** A real app screenshot that follows the page theme (light and dark captures). */
function ThemedShot({ name, alt, width, height, sizes, priority }: { name: Shot; alt: string; width: number; height: number; sizes: string; priority?: boolean }) {
  return (
    <>
      <Image src={`/screenshots/light/${name}.jpg`} alt={alt} width={width} height={height} sizes={sizes} priority={priority} className="block h-auto w-full dark:hidden" />
      {/* Never preloaded: while hidden (light theme) a lazy image isn't downloaded at all. */}
      <Image src={`/screenshots/dark/${name}.jpg`} alt="" aria-hidden width={width} height={height} sizes={sizes} loading="lazy" className="hidden h-auto w-full dark:block" />
    </>
  );
}

/** Phone mockup (CSS only) around a phone-sized screenshot. */
export function PhoneFrame({ shot, alt, className, priority }: { shot: Shot; alt: string; className?: string; priority?: boolean }) {
  return (
    <div className={cn("relative rounded-[2.2rem] border border-black/10 bg-neutral-900 p-2 shadow-2xl shadow-black/20 dark:border-white/10", className)}>
      <div className="absolute top-0.75 left-1/2 z-10 h-0.75 w-10 -translate-x-1/2 rounded-full bg-neutral-700" aria-hidden />
      <div className="overflow-hidden rounded-[1.7rem] bg-background">
        <ThemedShot name={shot} alt={alt} width={1082} height={2202} sizes="(min-width: 1024px) 280px, 60vw" priority={priority} />
      </div>
    </div>
  );
}

/** Laptop mockup (CSS only) around a desktop screenshot. */
export function LaptopFrame({ shot, alt, className, priority }: { shot: Shot; alt: string; className?: string; priority?: boolean }) {
  return (
    <div className={cn("relative", className)}>
      <div className="rounded-t-2xl border border-black/10 bg-neutral-900 p-2 pb-3 shadow-2xl shadow-black/20 dark:border-white/10">
        <div className="mx-auto mb-1.5 size-1.5 rounded-full bg-neutral-700" aria-hidden />
        <div className="overflow-hidden rounded-md bg-background">
          <ThemedShot name={shot} alt={alt} width={1920} height={1200} sizes="(min-width: 1024px) 640px, 92vw" priority={priority} />
        </div>
      </div>
      <div className="relative mx-[-4%] h-3 rounded-b-xl bg-linear-to-b from-neutral-300 to-neutral-400 dark:from-neutral-700 dark:to-neutral-800" aria-hidden>
        <div className="absolute top-0 left-1/2 h-1 w-1/6 -translate-x-1/2 rounded-b-md bg-neutral-400 dark:bg-neutral-600" />
      </div>
    </div>
  );
}
