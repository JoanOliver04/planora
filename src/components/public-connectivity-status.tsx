"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CloudOff } from "lucide-react";
import { isPrivateAppPath } from "@/lib/security/routes";

export function PublicConnectivityStatus({ locale }: { locale: string }) {
  const pathname = usePathname();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    queueMicrotask(update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online || isPrivateAppPath(pathname)) return null;
  return (
    <aside
      className="offline-status"
      data-online="false"
      role="status"
      aria-live="polite"
    >
      <CloudOff size={16} />
      <span>{locale === "es" ? "Sin conexión" : "Offline"}</span>
    </aside>
  );
}
