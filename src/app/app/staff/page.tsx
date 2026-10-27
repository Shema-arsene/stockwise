"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Copy, Crown, KeyRound, Link2, Loader2, Lock, MoreVertical, Plus, Power, Trash2, UserPlus, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field } from "@/components/form-field";
import { PageHeader, RequirePermission } from "@/components/app/page-parts";
import { useShop } from "@/components/app/shop-context";
import { apiErrorCode, http, isNetworkError } from "@/lib/http";
import { canAssign, canChangeRole, canManagePerson, type Role } from "@/lib/permissions";
import { randomPassword } from "@/lib/random-password";
import { cn } from "@/lib/utils";

type StaffRole = "MANAGER" | "CASHIER";
type Kind = "branch" | "shop";

interface Assignment {
  kind: Kind;
  id: string;
  role: StaffRole;
  shopId: string | null; // null = all branches
  disabled: boolean;
}

interface Person {
  userId: string;
  name: string;
  email: string | null;
  username: string | null;
  managedAccount: boolean;
  locked: boolean;
  deactivated: boolean;
  assignments: Assignment[];
}

interface StaffResponse {
  business: { id: string; name: string };
  owner: { userId: string; name: string; email: string } | null;
  branches: { id: string; name: string }[];
  people: Person[];
  invitations: { id: string; role: StaffRole; shopId: string; allBranches: boolean; email: string | null; token: string; expiresAt: string }[];
}

const inviteUrl = (token: string) => `${location.origin}/invite?token=${encodeURIComponent(token)}`;

export default function StaffPage() {
  return (
    <RequirePermission permission="staff.manage">
      <Staff />
    </RequirePermission>
  );
}

function Staff() {
  const t = useTranslations("staff");
  const tc = useTranslations("common");
  const { user, shopId, role, syncNow } = useShop();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [assigning, setAssigning] = useState<Person | null>(null);
  const [resetting, setResetting] = useState<{ person: Person; a: Assignment } | null>(null);
  const [removing, setRemoving] = useState<{ person: Person; a: Assignment } | null>(null);

  const staff = useQuery({ queryKey: ["staff", shopId], queryFn: async () => (await http.get<StaffResponse>("/staff")).data });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["staff", shopId] });
    void syncNow();
  };
  const onError = (err: unknown) => toast.error(isNetworkError(err) ? tc("needsInternet") : tc("somethingWrong"));

  const update = useMutation({
    mutationFn: (v: { kind: Kind; id: string; role?: StaffRole; disabled?: boolean }) => http.patch("/staff", v),
    onSuccess: (_d, v) => {
      toast.success(v.role ? t("roleChanged") : v.disabled ? t("disable") : t("enable"));
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (a: Assignment) => http.delete("/staff", { params: { kind: a.kind, id: a.id } }),
    onSuccess: () => {
      toast.success(t("removed"));
      setRemoving(null);
      refresh();
    },
    onError,
  });
  const revoke = useMutation({ mutationFn: (id: string) => http.delete("/invitations", { params: { id } }), onSuccess: refresh, onError });

  const branches = staff.data?.branches ?? [];
  const branchName = (id: string | null) => (id === null ? t("allBranchesOption") : (branches.find((b) => b.id === id)?.name ?? ""));

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={role === "OWNER" ? t("subtitleOwner", { shop: staff.data?.business.name ?? "" }) : t("subtitleAdmin")}
        actions={
          <Button onClick={() => setAddOpen(true)} disabled={!staff.data}>
            <UserPlus />
            <span className="sr-only sm:not-sr-only">{role === "OWNER" ? t("addPerson") : t("addCashier")}</span>
          </Button>
        }
      />

      {staff.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : staff.isError ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
          <WifiOff className="size-6" />
          {isNetworkError(staff.error) ? tc("needsInternet") : tc("somethingWrong")}
        </div>
      ) : (
        <>
          <ul className="divide-y rounded-xl border bg-card">
            {staff.data.owner && (
              <li className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Crown className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {staff.data.owner.name} {staff.data.owner.userId === user.id && <Badge variant="secondary" className="ml-1">{t("you")}</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{staff.data.owner.email}</p>
                </div>
                <Badge variant="outline">{t("roles.OWNER")}</Badge>
              </li>
            )}
            {staff.data.people.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">{t("noPeople")}</li>}
            {staff.data.people.map((p) => {
              const isMe = p.userId === user.id;
              const topRole: StaffRole = p.assignments.some((a) => a.role === "MANAGER") ? "MANAGER" : "CASHIER";
              const managePerson = canManagePerson({ userId: user.id, role }, { userId: p.userId, role: topRole });
              const resettable = p.managedAccount && managePerson ? p.assignments[0] : undefined;
              return (
                <li key={p.userId} className={cn("px-4 py-3", p.deactivated && "opacity-60")}>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium uppercase">{p.name.slice(0, 1)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium">
                        <span className="truncate">{p.name}</span>
                        {isMe && <Badge variant="secondary">{t("you")}</Badge>}
                        {p.managedAccount && <Badge variant="outline" className="font-normal">{t("pinAccount")}</Badge>}
                        {p.locked && (
                          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 font-normal text-amber-700 dark:text-amber-400">
                            <Lock className="size-3" />
                            {t("locked")}
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{p.username ? `@${p.username}` : p.email}</p>
                    </div>
                    {managePerson && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`${tc("actions")}: ${p.name}`}>
                            <MoreVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setAssigning(p)}>
                            <Plus />
                            {t("assignTo")}
                          </DropdownMenuItem>
                          {resettable && (
                            <DropdownMenuItem onSelect={() => setResetting({ person: p, a: resettable })}>
                              <KeyRound />
                              {t("resetPin")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  <ul className="mt-2 ml-12 space-y-1.5">
                    {p.assignments.map((a) => {
                      const manageable = canManagePerson({ userId: user.id, role }, { userId: p.userId, role: a.role });
                      const roleChoices = (["MANAGER", "CASHIER"] as const).filter((r) => r === a.role || (a.kind === "branch" && canChangeRole(role, a.role, r)));
                      return (
                        <li key={a.id} className={cn("flex flex-wrap items-center gap-2 text-sm", a.disabled && "opacity-60")}>
                          <Building2 className="size-3.5 text-muted-foreground" />
                          <span className="min-w-0 truncate">{branchName(a.shopId)}</span>
                          {a.disabled && <Badge variant="outline" className="font-normal text-muted-foreground">{t("disabled")}</Badge>}
                          <span className="ml-auto flex items-center gap-1">
                            {manageable && roleChoices.length > 1 ? (
                              <Select value={a.role} onValueChange={(r) => update.mutate({ kind: a.kind, id: a.id, role: r as StaffRole })}>
                                <SelectTrigger className="h-7 w-32 text-xs" aria-label={`${t("role")}: ${branchName(a.shopId)}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {roleChoices.map((r) => (
                                    <SelectItem key={r} value={r}>
                                      {t(`roles.${r}`)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline">{t(`roles.${a.role}`)}</Badge>
                            )}
                            {manageable && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" aria-label={`${tc("actions")}: ${p.name}, ${branchName(a.shopId)}`}>
                                    <MoreVertical />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onSelect={() => update.mutate({ kind: a.kind, id: a.id, disabled: !a.disabled })}>
                                    <Power />
                                    {a.disabled ? t("enable") : t("disable")}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem variant="destructive" onSelect={() => setRemoving({ person: p, a })}>
                                    <Trash2 />
                                    {t("removeAssignment", { branch: branchName(a.shopId) })}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>

          {staff.data.invitations.length > 0 && (
            <>
              <h2 className="mt-8 mb-3 font-semibold">{t("pendingInvites")}</h2>
              <ul className="divide-y rounded-xl border bg-card">
                {staff.data.invitations.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-3 px-4 py-3">
                    <Link2 className="size-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {t(`roles.${inv.role}`)} · {branchName(inv.allBranches ? null : inv.shopId)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{inv.email ?? inviteUrl(inv.token)}</p>
                    </div>
                    <CopyButton text={inviteUrl(inv.token)} />
                    <Button variant="ghost" size="sm" onClick={() => revoke.mutate(inv.id)}>
                      {t("revoke")}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <dl className="mt-8 space-y-2 text-sm">
            {(["OWNER", "MANAGER", "CASHIER"] as const).map((r) => (
              <div key={r} className="flex gap-2">
                <dt className="w-28 shrink-0 font-medium">{t(`roles.${r}`)}</dt>
                <dd className="text-muted-foreground">{t(`roleHelp.${r}`)}</dd>
              </div>
            ))}
          </dl>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto">
              <AddPersonForm role={role} branches={branches} defaultShopId={branches.some((b) => b.id === shopId) ? shopId : branches[0]?.id} onCreated={refresh} onClose={() => setAddOpen(false)} />
            </DialogContent>
          </Dialog>
          {assigning && <AssignDialog person={assigning} role={role} branches={branches} onClose={() => setAssigning(null)} onDone={refresh} />}
        </>
      )}

      {resetting && <ResetPasswordDialog person={resetting.person} assignment={resetting.a} onClose={() => setResetting(null)} />}

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{removing && t("removeConfirm", { name: removing.person.name, branch: branchName(removing.a.shopId) })}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => removing && remove.mutate(removing.a)}>
              {t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useTranslations("staff");
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(t("copied"));
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check /> : <Copy />}
      {label ?? t("copyLink")}
    </Button>
  );
}

/** Role picker + branch picker shared by "add person" and "add to a branch". "all" = every branch. */
function RoleAndBranch({
  role,
  branches,
  newRole,
  setNewRole,
  shopId,
  setShopId,
}: {
  role: Role;
  branches: { id: string; name: string }[];
  newRole: StaffRole;
  setNewRole: (r: StaffRole) => void;
  shopId: string;
  setShopId: (s: string) => void;
}) {
  const t = useTranslations("staff");
  const roles = (["MANAGER", "CASHIER"] as const).filter((r) => canAssign(role, r));
  const allowAll = role === "OWNER" && newRole === "MANAGER";
  return (
    <>
      {roles.length > 1 && (
        <Field label={t("inviteRole")}>
          <div className="grid gap-2">
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setNewRole(r);
                  if (r !== "MANAGER" && shopId === "all") setShopId(branches[0]?.id ?? "");
                }}
                className={cn("rounded-lg border p-3 text-left", newRole === r ? "border-primary bg-primary/5" : "hover:bg-muted")}
              >
                <p className="text-sm font-medium">{t(`roles.${r}`)}</p>
                <p className="text-xs text-muted-foreground">{t(`roleHelp.${r}`)}</p>
              </button>
            ))}
          </div>
        </Field>
      )}
      {(branches.length > 1 || allowAll) && (
        <Field label={t("shop")}>
          <Select value={shopId} onValueChange={setShopId}>
            <SelectTrigger className="h-10 w-full" aria-label={t("shop")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowAll && <SelectItem value="all">{t("allBranchesOption")}</SelectItem>}
              {branches.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </>
  );
}

function AddPersonForm({
  role,
  branches,
  defaultShopId,
  onCreated,
  onClose,
}: {
  role: Role;
  branches: { id: string; name: string }[];
  defaultShopId: string | undefined;
  onCreated: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("staff");
  const tc = useTranslations("common");
  const [mode, setMode] = useState<"login" | "link">("login");
  const [newRole, setNewRole] = useState<StaffRole>("CASHIER");
  const [shopId, setShopId] = useState(defaultShopId ?? "");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(() => randomPassword());
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const createLogin = useMutation({
    mutationFn: () => http.post("/staff/account", { shopId, name, username: username.toLowerCase(), password, role: newRole }),
    onSuccess: () => {
      setCreated({ name, username: username.toLowerCase(), password });
      onCreated();
    },
    onError: (err) => toast.error(apiErrorCode(err) === "username_taken" ? t("usernameTaken") : isNetworkError(err) ? tc("needsInternet") : tc("somethingWrong")),
  });
  const createLink = useMutation({
    mutationFn: async () =>
      (await http.post<{ token: string }>("/invitations", { role: newRole, shopId: shopId === "all" ? undefined : shopId, allBranches: shopId === "all" })).data,
    onSuccess: (d) => {
      setLink(inviteUrl(d.token));
      onCreated();
    },
    onError: (err) => toast.error(isNetworkError(err) ? tc("needsInternet") : tc("somethingWrong")),
  });

  if (created) {
    const details = `${t("username")}: ${created.username}\n${t("pin")}: ${created.password}`;
    return (
      <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle>{t("created")}</DialogTitle>
          <DialogDescription>{t("createdHint", { name: created.name })}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-muted p-4 font-mono text-sm">
          <dt className="text-muted-foreground">{t("username")}</dt>
          <dd>{created.username}</dd>
          <dt className="text-muted-foreground">{t("pin")}</dt>
          <dd className="text-lg tracking-wider">{created.password}</dd>
        </dl>
        <DialogFooter>
          <CopyButton text={details} label={tc("confirm")} />
          <Button onClick={onClose}>{tc("close")}</Button>
        </DialogFooter>
      </div>
    );
  }

  if (link) {
    return (
      <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle>{t("inviteTitle")}</DialogTitle>
          <DialogDescription>{t("inviteHint")}</DialogDescription>
        </DialogHeader>
        <p className="break-all rounded-md bg-muted p-3 font-mono text-xs">{link}</p>
        <div className="flex gap-2">
          <CopyButton text={link} />
          <Button variant="outline" size="sm" asChild>
            <a href={`https://wa.me/?text=${encodeURIComponent(link)}`} target="_blank" rel="noopener">
              WhatsApp
            </a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("linkExpires")}</p>
      </div>
    );
  }

  const usernameOk = /^[a-z0-9_.]{3,30}$/.test(username.toLowerCase());
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === "login") createLogin.mutate();
        else createLink.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("addTitle")}</DialogTitle>
        <DialogDescription>{mode === "login" ? t("addHint") : t("inviteHint")}</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(["login", "link"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn("rounded-md px-2 py-1.5 text-xs font-medium sm:text-sm", mode === m ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            {m === "login" ? t("pinAccount") : t("inviteWithEmail")}
          </button>
        ))}
      </div>

      <RoleAndBranch role={role} branches={branches} newRole={newRole} setNewRole={setNewRole} shopId={shopId} setShopId={setShopId} />

      {mode === "login" && (
        <>
          <Field label={t("fullName")} htmlFor="p-name">
            <Input id="p-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
          </Field>
          <Field label={t("username")} htmlFor="p-username" hint={t("usernameHint")} error={username && !usernameOk ? t("usernameHint") : undefined}>
            <Input
              id="p-username"
              required
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
              className="h-10"
            />
          </Field>
          <Field label={t("pin")} htmlFor="p-password">
            <div className="flex gap-2">
              <Input id="p-password" required minLength={6} maxLength={128} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-10 font-mono" />
              <Button type="button" variant="outline" className="h-10" onClick={() => setPassword(randomPassword())}>
                {t("generatePin")}
              </Button>
            </div>
          </Field>
        </>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button
          type="submit"
          disabled={!shopId || (mode === "login" ? createLogin.isPending || name.trim().length < 2 || !usernameOk || password.length < 6 : createLink.isPending)}
        >
          {(createLogin.isPending || createLink.isPending) && <Loader2 className="animate-spin" />}
          {mode === "login" ? t("create") : t("createLink")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function AssignDialog({ person, role, branches, onClose, onDone }: { person: Person; role: Role; branches: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("staff");
  const tc = useTranslations("common");
  const taken = new Set(person.assignments.map((a) => a.shopId ?? "all"));
  const free = branches.filter((b) => !taken.has(b.id));
  const [newRole, setNewRole] = useState<StaffRole>(person.assignments[0]?.role ?? "CASHIER");
  const [shopId, setShopId] = useState(free[0]?.id ?? (role === "OWNER" && newRole === "MANAGER" ? "all" : ""));
  const assign = useMutation({
    mutationFn: () => http.post("/staff/assign", { userId: person.userId, shopId, role: newRole }),
    onSuccess: () => {
      toast.success(t("assigned"));
      onDone();
      onClose();
    },
    onError: (err) => toast.error(isNetworkError(err) ? tc("needsInternet") : tc("somethingWrong")),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("assignToTitle", { name: person.name })}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <RoleAndBranch role={role} branches={free} newRole={newRole} setNewRole={setNewRole} shopId={shopId} setShopId={setShopId} />
          {!free.length && !(role === "OWNER" && newRole === "MANAGER") && <p className="text-sm text-muted-foreground">{t("noBranches")}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => assign.mutate()} disabled={!shopId || assign.isPending}>
            {assign.isPending && <Loader2 className="animate-spin" />}
            {t("assignTo")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ person, assignment, onClose }: { person: Person; assignment: Assignment; onClose: () => void }) {
  const t = useTranslations("staff");
  const tc = useTranslations("common");
  const [password, setPassword] = useState(() => randomPassword());
  const [done, setDone] = useState(false);
  const reset = useMutation({
    mutationFn: () => http.post("/staff/reset-password", { kind: assignment.kind, id: assignment.id, password }),
    onSuccess: () => setDone(true),
    onError: (err) => toast.error(isNetworkError(err) ? tc("needsInternet") : tc("somethingWrong")),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("resetPinTitle", { name: person.name })}</DialogTitle>
          {done && <DialogDescription>{t("pinReset")}</DialogDescription>}
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly={done} minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} aria-label={t("pin")} className="h-12 font-mono text-lg" />
          {!done && (
            <Button type="button" variant="outline" className="h-12" onClick={() => setPassword(randomPassword())}>
              {t("generatePin")}
            </Button>
          )}
        </div>
        <DialogFooter>
          {done ? (
            <Button onClick={onClose}>{tc("close")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                {tc("cancel")}
              </Button>
              <Button onClick={() => reset.mutate()} disabled={password.length < 6 || reset.isPending}>
                {reset.isPending && <Loader2 className="animate-spin" />}
                {t("resetPin")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
