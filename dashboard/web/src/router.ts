import { useEffect, useState } from "react";

// Minimal hash-based router. Routes: #/ , #/server/<id> , #/alerts , #/settings
export function useHashRoute(): string {
  const [path, setPath] = useState(() => location.hash.slice(1) || "/");
  useEffect(() => {
    const onChange = () => {
      setPath(location.hash.slice(1) || "/");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return path;
}

export function navigate(path: string): void {
  location.hash = path;
}
