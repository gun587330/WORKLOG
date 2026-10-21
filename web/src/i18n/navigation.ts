/**
 * 로케일 인지 내비게이션 API.
 *
 * 내부 링크·리다이렉트는 next/link·next/navigation 대신 **반드시 여기서 import** —
 * 현재 로케일이 URL에 자동으로 유지된다 (`/en`에서 <Link href="/login"> → `/en/login`).
 * next/link를 직접 쓰면 로케일이 유실되어 ko로 떨어진다.
 */
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
