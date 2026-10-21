"use client";

/**
 * 앱 셸 — 좌측 네브바 + 콘텐츠 (ANSERX common/app-shell 에서 옮김 · 바뀐 점: 투어 · 알림 · 시작 가이드 ·
 * 미리보기 게이트 · side 분기 없음. 메뉴 4개 고정(개인 = 2026-10-22 추가). 접힘은 "아이콘만 남김" 이 아니라 **완전히 숨기고
 * 좌상단 펼침 버튼만** 남긴다(2026-10-21 결정). 모바일은 상단 바 + 하단 탭바 그대로.)
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Home, NotebookPen, Target, UserRound, PanelLeftClose, PanelLeftOpen, LogOut, type LucideIcon } from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { signOut } from "@/lib/api/auth";
import s from "./app-shell.module.css";

type NavLabelKey = "home" | "logs" | "plans" | "me";
type NavItem = { href: string; labelKey: NavLabelKey; icon: LucideIcon };

const NAV: NavItem[] = [
  { href: "/home", labelKey: "home", icon: Home },
  { href: "/logs", labelKey: "logs", icon: NotebookPen },
  { href: "/plans", labelKey: "plans", icon: Target },
  { href: "/me", labelKey: "me", icon: UserRound },
];

const COLLAPSE_KEY = "worklog.sidebar.collapsed";

export function AppShell({
  account,
  children,
}: {
  account: { displayName: string; email: string } | null;
  children: React.ReactNode;
}) {
  const t = useTranslations("app");
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* 저장소 없음 */ }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try { localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1"); } catch { /* 저장소 없음 */ }
      return !v;
    });
  };
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const isActive = (item: NavItem) => pathname === item.href || pathname.startsWith(item.href + "/");
  const displayName = account?.displayName || t("shell.accountFallback");

  const navLinks = (className: string, withLabel: boolean) =>
    NAV.map((item) => {
      const Icon = item.icon;
      return (
        <Link key={item.href} className={`${className} ${isActive(item) ? s.active : ""}`} href={item.href} aria-current={isActive(item) ? "page" : undefined}>
          <Icon aria-hidden="true" />
          {withLabel ? <span className={s.navLabel}>{t(`nav.${item.labelKey}`)}</span> : t(`nav.${item.labelKey}`)}
        </Link>
      );
    });

  const accountMenu = (
    <div className={s.accountMenu} role="menu">
      <div className={s.menuHead}><b>{displayName}</b>{account?.email ? <small>{account.email}</small> : null}</div>
      <button type="button" className={s.menuItem} role="menuitem" onClick={async () => { setMenuOpen(false); await signOut(); router.replace("/login"); }}>
        <LogOut aria-hidden="true" /> {t("shell.logout")}
      </button>
    </div>
  );

  return (
    <div className={`${s.shell} ${collapsed ? s.collapsed : ""}`}>
      {/* 접힌 상태 — 네브바는 사라지고 이 버튼만 좌상단에 떠 있다 */}
      {collapsed && (
        <button type="button" className={s.expandBtn} aria-label={t("shell.expand")} onClick={toggleCollapsed}>
          <PanelLeftOpen aria-hidden="true" />
        </button>
      )}
      <aside className={s.sidebar}>
        <div className={s.logoRow}>
          <Link className={s.logo} href="/home" aria-label="WORKLOG"><i aria-hidden="true" />WORKLOG</Link>
          <button type="button" className={s.collapseBtn} aria-label={t("shell.collapse")} onClick={toggleCollapsed}>
            <PanelLeftClose aria-hidden="true" />
          </button>
        </div>
        <nav aria-label={t("shell.navAria")}>{navLinks(s.navItem, true)}</nav>
        <div className={s.spacer} />
        <div className={s.account} ref={accountRef}>
          <button type="button" className={s.accountBtn} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            <span className={s.avatar} aria-hidden="true">{displayName[0]}</span>
            <span className={s.accountName}>{displayName}</span>
          </button>
          {menuOpen && accountMenu}
        </div>
      </aside>

      <div className={s.content}>
        <header className={s.mobileTop}>
          <Link href="/home" aria-label="WORKLOG" className={s.logo}><i aria-hidden="true" />WORKLOG</Link>
          <div className={s.account}>
            <button type="button" className={s.accountBtn} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
              <span className={s.avatar} aria-hidden="true">{displayName[0]}</span>
            </button>
            {menuOpen && accountMenu}
          </div>
        </header>
        <div className={s.contentIn}>{children}</div>
      </div>

      <nav className={s.tabbar} aria-label={t("shell.navAria")}>{navLinks("", false)}</nav>
    </div>
  );
}
