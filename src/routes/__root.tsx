import { Outlet, Link, useLocation } from "react-router-dom";
import { RoleProvider } from "../lib/role-context";
import { AppSidebar } from "../components/sidebar";
import { Header } from "../components/header";

export default function RootLayout() {
  const location = useLocation();
  const pathname = location.pathname;
  const isBareRoute = pathname === "/" || pathname.startsWith("/auth");

  return (
    <RoleProvider>
      {isBareRoute ? (
        <Outlet />
      ) : (
        <div className="flex min-h-screen w-full bg-slate-50 text-slate-900">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Header />
            <main className="flex-1 p-6">
              <Outlet />
            </main>
          </div>
        </div>
      )}
    </RoleProvider>
  );
}
