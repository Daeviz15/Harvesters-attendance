"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  workersAdmin as initialWorkers,
  departments as initialDepartments,
  announcementsMock as initialAnnouncements,
  type Worker,
  type Department,
  type Announcement,
} from "./mock-data";

type DataContextType = {
  workers: Worker[];
  departments: Department[];
  announcements: Announcement[];
  addWorker: (worker: Omit<Worker, "id" | "avatar">) => void;
  updateWorker: (id: string, data: Partial<Worker>) => void;
  deleteWorker: (id: string) => void;
  addDepartment: (dept: Omit<Department, "id" | "workersCount">) => void;
  addAnnouncement: (ann: Omit<Announcement, "id" | "date">) => void;
};

const DataContext = createContext<DataContextType | undefined>(undefined);

const avatar = (seed: string) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}`;

export function DataProvider({ children }: { children: ReactNode }) {
  const [workers, setWorkers] = useState<Worker[]>(() => {
    const saved = localStorage.getItem("church_hub_workers");
    return saved ? JSON.parse(saved) : initialWorkers;
  });

  const [departments, setDepartments] = useState<Department[]>(() => {
    const saved = localStorage.getItem("church_hub_departments");
    return saved ? JSON.parse(saved) : initialDepartments;
  });

  const [announcements, setAnnouncements] = useState<Announcement[]>(() => {
    const saved = localStorage.getItem("church_hub_announcements");
    return saved ? JSON.parse(saved) : initialAnnouncements;
  });

  // Save to local storage on change
  useEffect(() => {
    localStorage.setItem("church_hub_workers", JSON.stringify(workers));
  }, [workers]);

  useEffect(() => {
    localStorage.setItem("church_hub_departments", JSON.stringify(departments));
  }, [departments]);

  useEffect(() => {
    localStorage.setItem("church_hub_announcements", JSON.stringify(announcements));
  }, [announcements]);

  // Actions
  const addWorker = (workerData: Omit<Worker, "id" | "avatar">) => {
    const newWorker: Worker = {
      ...workerData,
      id: Math.random().toString(36).substring(2, 9),
      avatar: avatar(workerData.fullName),
    };
    setWorkers((prev) => [...prev, newWorker]);
    
    // Also increment department count if possible
    setDepartments((prev) => 
      prev.map(d => d.name === workerData.department ? { ...d, workersCount: d.workersCount + 1 } : d)
    );
  };

  const updateWorker = (id: string, data: Partial<Worker>) => {
    setWorkers((prev) => prev.map((w) => (w.id === id ? { ...w, ...data } : w)));
  };

  const deleteWorker = (id: string) => {
    const w = workers.find(x => x.id === id);
    setWorkers((prev) => prev.filter((w) => w.id !== id));
    if (w) {
      setDepartments((prev) => 
        prev.map(d => d.name === w.department ? { ...d, workersCount: Math.max(0, d.workersCount - 1) } : d)
      );
    }
  };

  const addDepartment = (deptData: Omit<Department, "id" | "workersCount">) => {
    const newDept: Department = {
      ...deptData,
      id: Math.random().toString(36).substring(2, 9),
      workersCount: 0,
    };
    setDepartments((prev) => [...prev, newDept]);
  };

  const addAnnouncement = (annData: Omit<Announcement, "id" | "date">) => {
    const newAnn: Announcement = {
      ...annData,
      id: Math.random().toString(36).substring(2, 9),
      date: new Date().toISOString().split("T")[0],
    };
    setAnnouncements((prev) => [newAnn, ...prev]);
  };

  return (
    <DataContext.Provider
      value={{
        workers,
        departments,
        announcements,
        addWorker,
        updateWorker,
        deleteWorker,
        addDepartment,
        addAnnouncement,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
}
