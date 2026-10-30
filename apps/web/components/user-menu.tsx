"use client";

import type { MouseEvent, ReactElement } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutLabel } from "@/lib/copy";
import { SIGNED_OUT_PATH } from "@/lib/next-path";

export interface UserMenuProps {
  email: string;
  /** The sign-out server action, passed in so this client module never imports the server wiring. */
  signOut: () => Promise<never>;
}

const LABEL_ID = "user-menu-label";

// design/pages/dashboard, user menu: the email as the button's name, a group named by the email label,
// and the sign-out link item to the signed-out sign-in state. The link never navigates by itself: a
// GET must not sign out, so the click (Radix clicks the item for Enter and Space too) runs the server
// action, which signs out and then redirects to the same URL.
export function UserMenu({ email, signOut }: UserMenuProps): ReactElement {
  function onSignOut(event: MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault();
    void signOut();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <span className="block max-w-56 min-w-0 truncate max-[30rem]:max-w-24">{email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuGroup aria-labelledby={LABEL_ID}>
          <DropdownMenuLabel id={LABEL_ID} role="presentation">
            {email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a
              href={SIGNED_OUT_PATH}
              onClick={onSignOut}
              onAuxClick={(event) => event.preventDefault()}
            >
              {signOutLabel}
            </a>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
