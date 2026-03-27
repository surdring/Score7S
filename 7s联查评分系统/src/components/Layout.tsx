import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, ClipboardCheck, BarChart2, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <main className="flex-1 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-2 flex justify-around items-center z-50 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <NavLink
          to="/"
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center gap-1 w-16 h-14 transition-all duration-300",
              isActive ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
            )
          }
        >
          {({ isActive }) => (
            <>
              <div className={cn(
                "flex items-center justify-center w-14 h-8 rounded-full transition-all duration-300",
                isActive ? "bg-blue-50" : "bg-transparent"
              )}>
                <LayoutDashboard className={cn("w-5 h-5 transition-all duration-300", isActive ? "stroke-[2.5px] text-blue-600" : "stroke-2")} />
              </div>
              <span className={cn("text-[10px] transition-all duration-300", isActive ? "font-semibold" : "font-medium")}>首页</span>
            </>
          )}
        </NavLink>

        <NavLink
          to="/score"
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center gap-1 w-16 h-14 transition-all duration-300",
              isActive ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
            )
          }
        >
          {({ isActive }) => (
            <>
              <div className={cn(
                "flex items-center justify-center w-14 h-8 rounded-full transition-all duration-300",
                isActive ? "bg-blue-50" : "bg-transparent"
              )}>
                <ClipboardCheck className={cn("w-5 h-5 transition-all duration-300", isActive ? "stroke-[2.5px] text-blue-600" : "stroke-2")} />
              </div>
              <span className={cn("text-[10px] transition-all duration-300", isActive ? "font-semibold" : "font-medium")}>评分</span>
            </>
          )}
        </NavLink>

        <NavLink
          to="/analytics"
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center gap-1 w-16 h-14 transition-all duration-300",
              isActive ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
            )
          }
        >
          {({ isActive }) => (
            <>
              <div className={cn(
                "flex items-center justify-center w-14 h-8 rounded-full transition-all duration-300",
                isActive ? "bg-blue-50" : "bg-transparent"
              )}>
                <BarChart2 className={cn("w-5 h-5 transition-all duration-300", isActive ? "stroke-[2.5px] text-blue-600" : "stroke-2")} />
              </div>
              <span className={cn("text-[10px] transition-all duration-300", isActive ? "font-semibold" : "font-medium")}>分析</span>
            </>
          )}
        </NavLink>

        <NavLink
          to="/history"
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center gap-1 w-16 h-14 transition-all duration-300",
              isActive ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
            )
          }
        >
          {({ isActive }) => (
            <>
              <div className={cn(
                "flex items-center justify-center w-14 h-8 rounded-full transition-all duration-300",
                isActive ? "bg-blue-50" : "bg-transparent"
              )}>
                <Clock className={cn("w-5 h-5 transition-all duration-300", isActive ? "stroke-[2.5px] text-blue-600" : "stroke-2")} />
              </div>
              <span className={cn("text-[10px] transition-all duration-300", isActive ? "font-semibold" : "font-medium")}>历史</span>
            </>
          )}
        </NavLink>
      </nav>
    </div>
  );
}
