"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { type Worker } from "./mock-data";
import { useData } from "./data-context";

type AuthContextType = {
  currentWorker: Worker | null;
  login: (email: string) => void;
  logout: () => void;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { workers } = useData();
  const [currentWorkerId, setCurrentWorkerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check localStorage for logged-in user on mount
    const savedId = localStorage.getItem("church_hub_auth_id");
    if (savedId) {
      setCurrentWorkerId(savedId);
    }
    setIsLoading(false);
  }, []);

  const currentWorker = workers.find((w) => w.id === currentWorkerId) || null;

  const login = (email: string) => {
    // For mock auth, just find any worker with this email, or fallback to the first worker
    const worker = workers.find((w) => w.email.toLowerCase() === email.toLowerCase()) || workers[0];
    if (worker) {
      setCurrentWorkerId(worker.id);
      localStorage.setItem("church_hub_auth_id", worker.id);
    }
  };

  const logout = () => {
    setCurrentWorkerId(null);
    localStorage.removeItem("church_hub_auth_id");
  };

  return (
    <AuthContext.Provider value={{ currentWorker, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
